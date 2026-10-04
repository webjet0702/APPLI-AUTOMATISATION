import { getDb } from "@/platform/db";
import type { PricePoint } from "./analyze";
import type { InvoiceDraft } from "./invoice-draft";
import { normalizeText, type Unit } from "./normalize";

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
  };
}

const INVOICE_COLUMNS = `
  i.id, i.supplier, i.invoice_number, to_char(i.invoice_date, 'YYYY-MM-DD') as invoice_date,
  i.total_ht, i.warnings, i.source, i.file_name,
  (select count(*) from invoice_lines l where l.invoice_id = i.id) as line_count`;

export async function saveInvoice(
  organizationId: string,
  draft: InvoiceDraft,
  options: { fileName?: string | null; source?: "upload" | "demo" } = {},
): Promise<string> {
  const db = await getDb();
  const supplierKey = normalizeText(draft.supplier);

  return db.transaction(async (tx) => {
    if (draft.invoiceNumber) {
      const existing = await tx.query<{ id: string }>(
        `select id from invoices where organization_id = $1 and supplier_key = $2 and invoice_number = $3`,
        [organizationId, supplierKey, draft.invoiceNumber],
      );
      if (existing.length > 0) {
        throw new DuplicateInvoiceError(
          `La facture n° ${draft.invoiceNumber} de ${draft.supplier} a déjà été importée.`,
        );
      }
    }

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

    for (const line of draft.lines) {
      await tx.query(
        `insert into invoice_lines
           (invoice_id, organization_id, product_key, reference, label, unit, quantity, unit_price_ht, line_total_ht)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          invoice.id,
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
    return invoice.id;
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
