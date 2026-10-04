import { formatDate, formatEuro } from "@/lib/format";
import { getDb } from "@/platform/db";
import type { PricePoint } from "./analyze";
import type { InvoiceDraft } from "./invoice-draft";
import { normalizeText, productKey, round, type Unit } from "./normalize";

export class DuplicateInvoiceError extends Error {}

export type InvoiceSummary = {
  id: string;
  supplier: string;
  invoiceNumber: string | null;
  invoiceDate: string;
  totalHt: number | null;
  lineCount: number;
  warnings: string[];
  source: "upload" | "demo";
  fileName: string | null;
  verified: boolean;
  /** Somme des montants des lignes enregistrées. */
  linesTotal: number;
};

export type InvoiceLine = {
  id: string;
  reference: string | null;
  label: string;
  unit: Unit;
  quantity: number;
  unitPrice: number;
  lineTotal: number | null;
};

// Postgres renvoie les colonnes « numeric » sous forme de texte : on convertit ici.
const toNumber = (v: string | number) => Number(v);
const toNullableNumber = (v: string | number | null) => (v === null ? null : Number(v));

type InvoiceRow = {
  id: string;
  supplier: string;
  invoice_number: string | null;
  invoice_date: string;
  total_ht: string | null;
  line_count: number | string;
  warnings: string[];
  source: "upload" | "demo";
  file_name: string | null;
  verified: boolean;
  lines_total: string | number;
};

function toInvoiceSummary(row: InvoiceRow): InvoiceSummary {
  return {
    id: row.id,
    supplier: row.supplier,
    invoiceNumber: row.invoice_number,
    invoiceDate: row.invoice_date,
    totalHt: toNullableNumber(row.total_ht),
    lineCount: Number(row.line_count),
    warnings: row.warnings,
    source: row.source,
    fileName: row.file_name,
    verified: row.verified,
    linesTotal: Number(row.lines_total),
  };
}

/**
 * Tout ce qu'il faut relire sur une facture : les doutes notés à la lecture, plus
 * un total HT qui ne correspond pas à la somme des lignes (recalculé à chaque
 * affichage, donc à jour après une correction ou l'ajout d'une page).
 */
export function reviewPoints(invoice: InvoiceSummary): string[] {
  const points = [...invoice.warnings];
  const total = invoice.totalHt;
  if (total !== null && total > 0 && Math.abs(invoice.linesTotal - total) > total * 0.02 + 0.05) {
    points.push(
      `La somme des lignes (${formatEuro(invoice.linesTotal)}) ne correspond pas au total HT (${formatEuro(total)}) : page manquante, frais non comptés ou ligne mal lue.`,
    );
  }
  return points;
}

const INVOICE_COLUMNS = `
  i.id, i.supplier, i.invoice_number, to_char(i.invoice_date, 'YYYY-MM-DD') as invoice_date,
  i.total_ht, i.warnings, i.source, i.file_name, i.verified_at is not null as verified,
  (select count(*) from invoice_lines l where l.invoice_id = i.id) as line_count,
  (select coalesce(sum(coalesce(l.line_total_ht, l.quantity * l.unit_price_ht)), 0)
     from invoice_lines l where l.invoice_id = i.id) as lines_total`;

export type SaveResult = { invoiceId: string; appended: boolean };

/**
 * Enregistre une facture. Si une facture du même fournisseur porte déjà ce numéro :
 * - mêmes produits → c'est un doublon, on refuse ;
 * - autres produits → c'est une autre page de la même facture (photo page par page),
 *   on ajoute ses lignes à la facture existante.
 */
export async function saveInvoice(
  organizationId: string,
  draft: InvoiceDraft,
  options: { fileName?: string | null; source?: "upload" | "demo" } = {},
): Promise<SaveResult> {
  const db = await getDb();
  const supplierKey = normalizeText(draft.supplier);

  return db.transaction(async (tx) => {
    // Sans numéro, on compare aux factures du même fournisseur à la même date.
    const candidates = await tx.query<{ id: string }>(
      draft.invoiceNumber
        ? `select id from invoices where organization_id = $1 and supplier_key = $2 and invoice_number = $3`
        : `select id from invoices where organization_id = $1 and supplier_key = $2 and invoice_number is null and invoice_date = $3`,
      [organizationId, supplierKey, draft.invoiceNumber ?? draft.invoiceDate],
    );

    for (const candidate of candidates) {
      const rows = await tx.query<{ product_key: string }>(
        `select distinct product_key from invoice_lines where invoice_id = $1`,
        [candidate.id],
      );
      const existingKeys = new Set(rows.map((r) => r.product_key));
      const overlap = draft.lines.filter((l) => existingKeys.has(l.productKey)).length;
      if (overlap / draft.lines.length >= 0.5) {
        throw new DuplicateInvoiceError(
          draft.invoiceNumber
            ? `La facture n° ${draft.invoiceNumber} de ${draft.supplier} a déjà été importée.`
            : `Cette facture de ${draft.supplier} du ${formatDate(draft.invoiceDate)} a déjà été importée.`,
        );
      }
    }

    let invoiceId: string;
    const appended = Boolean(draft.invoiceNumber && candidates.length > 0);
    if (appended) {
      invoiceId = candidates[0].id;
      await tx.query(
        `update invoices
         set warnings = warnings || $2::jsonb, total_ht = coalesce($3, total_ht), verified_at = null
         where id = $1`,
        [invoiceId, JSON.stringify(draft.warnings), draft.totalHt],
      );
    } else {
      const [invoice] = await tx.query<{ id: string }>(
        `insert into invoices
           (organization_id, supplier, supplier_key, invoice_number, invoice_date, total_ht, file_name, source, warnings)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
         returning id`,
        [
          organizationId,
          draft.supplier,
          supplierKey,
          draft.invoiceNumber,
          draft.invoiceDate,
          draft.totalHt,
          options.fileName ?? null,
          options.source ?? "upload",
          JSON.stringify(draft.warnings),
        ],
      );
      invoiceId = invoice.id;
    }

    for (const line of draft.lines) {
      await tx.query(
        `insert into invoice_lines
           (invoice_id, organization_id, product_key, reference, label, unit, quantity, unit_price_ht, line_total_ht)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          invoiceId,
          organizationId,
          line.productKey,
          line.reference,
          line.label,
          line.unit,
          line.quantity,
          line.unitPrice,
          line.lineTotal,
        ],
      );
    }
    return { invoiceId, appended };
  });
}

export async function listInvoices(organizationId: string): Promise<InvoiceSummary[]> {
  const db = await getDb();
  const rows = await db.query<InvoiceRow>(
    `select ${INVOICE_COLUMNS} from invoices i
     where i.organization_id = $1
     order by i.invoice_date desc, i.created_at desc`,
    [organizationId],
  );
  return rows.map(toInvoiceSummary);
}

export async function getInvoice(
  organizationId: string,
  invoiceId: string,
): Promise<(InvoiceSummary & { lines: InvoiceLine[] }) | null> {
  const db = await getDb();
  const [row] = await db.query<InvoiceRow>(
    `select ${INVOICE_COLUMNS} from invoices i where i.organization_id = $1 and i.id = $2`,
    [organizationId, invoiceId],
  );
  if (!row) return null;

  const lines = await db.query<{
    id: string;
    reference: string | null;
    label: string;
    unit: Unit;
    quantity: string;
    unit_price_ht: string;
    line_total_ht: string | null;
  }>(
    `select id, reference, label, unit, quantity, unit_price_ht, line_total_ht
     from invoice_lines where invoice_id = $1 order by label`,
    [invoiceId],
  );

  return {
    ...toInvoiceSummary(row),
    lines: lines.map((l) => ({
      id: l.id,
      reference: l.reference,
      label: l.label,
      unit: l.unit,
      quantity: toNumber(l.quantity),
      unitPrice: toNumber(l.unit_price_ht),
      lineTotal: toNullableNumber(l.line_total_ht),
    })),
  };
}

/** Correction manuelle d'une ligne mal lue. Le montant est recalculé. */
export async function updateInvoiceLine(
  organizationId: string,
  invoiceId: string,
  lineId: string,
  input: { label: string; reference: string | null; unit: Unit; quantity: number; unitPrice: number },
): Promise<boolean> {
  const db = await getDb();
  const [invoice] = await db.query<{ supplier: string }>(
    `select supplier from invoices where organization_id = $1 and id = $2`,
    [organizationId, invoiceId],
  );
  if (!invoice) return false;
  const updated = await db.query<{ id: string }>(
    `update invoice_lines
     set label = $4, reference = $5, unit = $6, quantity = $7, unit_price_ht = $8, line_total_ht = $9, product_key = $10
     where organization_id = $1 and invoice_id = $2 and id = $3
     returning id`,
    [
      organizationId,
      invoiceId,
      lineId,
      input.label,
      input.reference,
      input.unit,
      round(input.quantity, 3),
      round(input.unitPrice, 4),
      round(input.quantity * input.unitPrice, 2),
      productKey(invoice.supplier, input.reference, input.label, input.unit),
    ],
  );
  return updated.length > 0;
}

export async function markInvoiceVerified(organizationId: string, invoiceId: string): Promise<void> {
  const db = await getDb();
  await db.query(`update invoices set verified_at = now() where organization_id = $1 and id = $2`, [
    organizationId,
    invoiceId,
  ]);
}

export async function deleteInvoice(organizationId: string, invoiceId: string): Promise<void> {
  const db = await getDb();
  await db.query(`delete from invoices where organization_id = $1 and id = $2`, [organizationId, invoiceId]);
}

export async function listPricePoints(organizationId: string): Promise<PricePoint[]> {
  const db = await getDb();
  const rows = await db.query<{
    product_key: string;
    supplier: string;
    label: string;
    unit: Unit;
    invoice_id: string;
    invoice_date: string;
    quantity: string;
    unit_price_ht: string;
  }>(
    `select l.product_key, i.supplier, l.label, l.unit, i.id as invoice_id,
            to_char(i.invoice_date, 'YYYY-MM-DD') as invoice_date, l.quantity, l.unit_price_ht
     from invoice_lines l
     join invoices i on i.id = l.invoice_id
     where l.organization_id = $1`,
    [organizationId],
  );
  return rows.map((r) => ({
    productKey: r.product_key,
    supplier: r.supplier,
    label: r.label,
    unit: r.unit,
    invoiceId: r.invoice_id,
    invoiceDate: r.invoice_date,
    quantity: toNumber(r.quantity),
    unitPrice: toNumber(r.unit_price_ht),
  }));
}
