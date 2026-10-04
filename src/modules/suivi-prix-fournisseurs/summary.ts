import { formatEuroRounded } from "@/lib/format";
import { analyzePrices } from "./analyze";
import { listPricePoints } from "./repository";

/** Résumé d'une ligne pour la liste des clients. */
export async function supplierPricesSummary(organizationId: string): Promise<string> {
  const points = await listPricePoints(organizationId);
  if (points.length === 0) return "Aucune facture pour l'instant";
  const analysis = analyzePrices(points);
  const increases = analysis.changes.filter((c) => c.kind !== "baisse").length;
  if (increases === 0) return "Prix stables";
  return `${increases} hausse${increases > 1 ? "s" : ""} · ≈ ${formatEuroRounded(analysis.monthlyExtraCost)} / mois`;
}
