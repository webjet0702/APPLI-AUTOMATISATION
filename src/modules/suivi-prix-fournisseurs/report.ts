import { formatDate, formatEuro, formatEuroRounded, formatPct } from "@/lib/format";
import type { Analysis, PriceChange } from "./analyze";
import { UNIT_LABELS } from "./normalize";

function describeChange(c: PriceChange): string {
  const unit = UNIT_LABELS[c.unit];
  const prices = `${formatEuro(c.oldPrice)} → ${formatEuro(c.newPrice)}/${unit}`;
  const pct =
    c.kind === "hausse-progressive"
      ? `${formatPct(c.changePct)} par petites hausses depuis le ${formatDate(c.changedOn)}`
      : `${formatPct(c.changePct)} depuis le ${formatDate(c.changedOn)}`;
  const impact =
    Math.abs(c.monthlyImpact) >= 1 ? `, environ ${formatEuroRounded(Math.abs(c.monthlyImpact))} par mois` : "";
  return `- ${c.label} (${c.supplier}) : ${prices} (${pct})${impact}`;
}

/** Texte prêt à envoyer au restaurateur par email ou WhatsApp. */
export function buildReport(analysis: Analysis, invoiceCount: number): string {
  if (!analysis.period) {
    return "Aucune facture analysée pour l'instant.";
  }
  const increases = analysis.changes.filter((c) => c.kind !== "baisse");
  const decreases = analysis.changes.filter((c) => c.kind === "baisse");
  const period =
    analysis.period.from === analysis.period.to
      ? `facture du ${formatDate(analysis.period.from)}`
      : `factures du ${formatDate(analysis.period.from)} au ${formatDate(analysis.period.to)}`;

  const parts = [`Bonjour,`, `Voici le point sur vos prix fournisseurs (${period}).`];

  if (increases.length === 0) {
    parts.push("Aucune hausse de prix détectée : vos fournisseurs sont stables.");
  } else {
    const title =
      increases.length === 1 ? "1 hausse de prix détectée" : `${increases.length} hausses de prix détectées`;
    parts.push(
      [
        `⚠️ ${title}. Surcoût estimé : environ ${formatEuroRounded(analysis.monthlyExtraCost)} par mois.`,
        ...increases.map(describeChange),
      ].join("\n"),
    );
  }

  if (decreases.length > 0) {
    const title = decreases.length === 1 ? "1 baisse" : `${decreases.length} baisses`;
    parts.push([`✅ ${title} :`, ...decreases.map(describeChange)].join("\n"));
  }

  parts.push(`Produits suivis : ${analysis.products.length} · Factures analysées : ${invoiceCount}`);
  return parts.join("\n\n");
}
