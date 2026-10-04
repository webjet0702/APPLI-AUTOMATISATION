import { z } from "zod";
import { formatEuro, formatNumber } from "@/lib/format";
import { normalizeUnit, parseRawUnit, productKey, RAW_UNITS, round, type Unit } from "./normalize";

// Ce que Claude doit renvoyer pour chaque facture (format imposé à l'API).
export const ExtractedInvoiceSchema = z.object({
  is_supplier_invoice: z.boolean(),
  supplier: z.string(),
  invoice_number: z.string().nullable(),
  invoice_date: z.string().describe("Date d'émission au format AAAA-MM-JJ"),
  total_ht: z.number().nullable(),
  lines: z.array(
    z.object({
      reference: z.string().nullable(),
      label: z.string(),
      // Texte libre plutôt qu'une liste fermée : le SDK ne transmet pas les listes
      // (enum) à l'API, et une unité imprévue ne doit pas faire échouer la lecture.
      // parseRawUnit la traduit ensuite.
      unit: z.string().describe(`Unité du prix unitaire : ${RAW_UNITS.join(", ")}`),
      quantity: z.number(),
      unit_price_ht: z.number(),
      line_total_ht: z.number().nullable(),
    }),
  ),
  doubts: z.array(z.string()),
});

export type ExtractedInvoice = z.infer<typeof ExtractedInvoiceSchema>;

export type DraftLine = {
  reference: string | null;
  label: string;
  unit: Unit;
  quantity: number;
  unitPrice: number;
  lineTotal: number | null;
  productKey: string;
};

export type InvoiceDraft = {
  supplier: string;
  invoiceNumber: string | null;
  invoiceDate: string;
  totalHt: number | null;
  lines: DraftLine[];
  warnings: string[];
};

/** Erreur à montrer telle quelle à l'utilisateur. */
export class ExtractionError extends Error {}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/**
 * Contrôle et nettoie la lecture de Claude avant de l'enregistrer : on refuse
 * ce qui est inutilisable et on signale tout ce qui ne colle pas.
 */
export function toInvoiceDraft(extracted: ExtractedInvoice): InvoiceDraft {
  if (!extracted.is_supplier_invoice) {
    throw new ExtractionError("Ce document ne ressemble pas à une facture de fournisseur.");
  }
  const supplier = extracted.supplier.trim();
  if (!supplier) throw new ExtractionError("Le nom du fournisseur est illisible.");
  if (!isValidDate(extracted.invoice_date)) {
    throw new ExtractionError("La date de la facture est illisible.");
  }

  const warnings = extracted.doubts.map((d) => d.trim()).filter(Boolean);
  const lines: DraftLine[] = [];
  let skipped = 0;

  for (const raw of extracted.lines) {
    const label = raw.label.trim();
    if (!label || !(raw.quantity > 0) || !(raw.unit_price_ht > 0)) {
      skipped++;
      continue;
    }
    if (raw.line_total_ht !== null) {
      const expected = raw.quantity * raw.unit_price_ht;
      if (Math.abs(expected - raw.line_total_ht) > Math.max(0.05, Math.abs(raw.line_total_ht) * 0.02)) {
        warnings.push(
          `« ${label} » : ${formatNumber(raw.quantity)} × ${formatEuro(raw.unit_price_ht)} ne fait pas ${formatEuro(raw.line_total_ht)}. Ligne à vérifier.`,
        );
      }
    }
    const reference = raw.reference?.trim() || null;
    const rawUnit = parseRawUnit(raw.unit);
    if (!rawUnit) warnings.push(`« ${label} » : unité « ${raw.unit} » non reconnue. Ligne à vérifier.`);
    const normalized = normalizeUnit(rawUnit ?? "autre", raw.quantity, raw.unit_price_ht);
    lines.push({
      reference,
      label,
      unit: normalized.unit,
      quantity: round(normalized.quantity, 3),
      unitPrice: round(normalized.unitPrice, 4),
      lineTotal: raw.line_total_ht === null ? null : round(raw.line_total_ht, 2),
      productKey: productKey(supplier, reference, label, normalized.unit),
    });
  }

  if (skipped > 0) {
    warnings.push(`${skipped} ligne(s) ignorée(s) : quantité ou prix nul ou négatif (avoir, gratuité…).`);
  }
  if (lines.length === 0) {
    throw new ExtractionError("Aucune ligne de produit lisible sur cette facture.");
  }

  // Le total HT est contrôlé à l'affichage (repository.ts) : sur une facture en
  // plusieurs pages, il ne se compare qu'une fois toutes les pages réunies.

  return {
    supplier,
    invoiceNumber: extracted.invoice_number?.trim() || null,
    invoiceDate: extracted.invoice_date,
    totalHt: extracted.total_ht === null ? null : round(extracted.total_ht, 2),
    lines,
    warnings,
  };
}
