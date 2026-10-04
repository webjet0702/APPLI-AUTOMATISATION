// Unités telles qu'elles apparaissent sur les factures.
export const RAW_UNITS = [
  "kg",
  "g",
  "l",
  "cl",
  "ml",
  "piece",
  "colis",
  "carton",
  "barquette",
  "bouteille",
  "botte",
  "sac",
  "autre",
] as const;
export type RawUnit = (typeof RAW_UNITS)[number];

// Après conversion, g → kg et cl/ml → l, pour comparer des prix comparables.
export type Unit = Exclude<RawUnit, "g" | "cl" | "ml">;

export const UNIT_LABELS: Record<Unit, string> = {
  kg: "kg",
  l: "L",
  piece: "pièce",
  colis: "colis",
  carton: "carton",
  barquette: "barquette",
  bouteille: "bouteille",
  botte: "botte",
  sac: "sac",
  autre: "unité",
};

export function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Minuscules, sans accents ni ponctuation : « Crème 35% MG » → « creme 35 mg ». */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizeUnit(
  unit: RawUnit,
  quantity: number,
  unitPrice: number,
): { unit: Unit; quantity: number; unitPrice: number } {
  switch (unit) {
    case "g":
      return { unit: "kg", quantity: quantity / 1000, unitPrice: unitPrice * 1000 };
    case "cl":
      return { unit: "l", quantity: quantity / 100, unitPrice: unitPrice * 100 };
    case "ml":
      return { unit: "l", quantity: quantity / 1000, unitPrice: unitPrice * 1000 };
    default:
      return { unit, quantity, unitPrice };
  }
}

/**
 * Identifie un même produit d'une facture à l'autre : même fournisseur, même
 * référence (ou à défaut même libellé) et même unité de prix.
 */
export function productKey(
  supplier: string,
  reference: string | null,
  label: string,
  unit: Unit,
): string {
  const product = reference?.trim() ? `ref:${normalizeText(reference)}` : normalizeText(label);
  return `${normalizeText(supplier)}|${product}|${unit}`;
}
