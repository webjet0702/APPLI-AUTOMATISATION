import { formatNumber } from "@/lib/format";

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

export const UNITS: Unit[] = ["kg", "l", "piece", "colis", "carton", "barquette", "bouteille", "botte", "sac", "autre"];

export function isUnit(value: string): value is Unit {
  return (UNITS as string[]).includes(value);
}

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

const UNIT_PLURALS: Partial<Record<Unit, string>> = {
  piece: "pièces",
  carton: "cartons",
  barquette: "barquettes",
  bouteille: "bouteilles",
  botte: "bottes",
  sac: "sacs",
  autre: "unités",
};

/** « 6 pièces », « 1 colis », « 2,5 kg » */
export function formatQuantity(quantity: number, unit: Unit): string {
  const label = quantity >= 2 ? (UNIT_PLURALS[unit] ?? UNIT_LABELS[unit]) : UNIT_LABELS[unit];
  return `${formatNumber(quantity)} ${label}`;
}

/** « prix au kilo », « prix à la pièce »… */
export const UNIT_PRICE_PHRASES: Record<Unit, string> = {
  kg: "au kilo",
  l: "au litre",
  piece: "à la pièce",
  colis: "au colis",
  carton: "au carton",
  barquette: "à la barquette",
  bouteille: "à la bouteille",
  botte: "à la botte",
  sac: "au sac",
  autre: "à l'unité",
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

// Façons courantes d'écrire une unité sur une facture (après normalizeText, sans espaces).
const UNIT_SYNONYMS: Record<string, RawUnit> = {
  kg: "kg", kgs: "kg", kilo: "kg", kilos: "kg", kilogramme: "kg", kilogrammes: "kg",
  g: "g", gr: "g", grs: "g", gramme: "g", grammes: "g",
  l: "l", lt: "l", ltr: "l", litre: "l", litres: "l",
  cl: "cl", centilitre: "cl", centilitres: "cl",
  ml: "ml", millilitre: "ml", millilitres: "ml",
  piece: "piece", pieces: "piece", pce: "piece", pces: "piece", pc: "piece", pcs: "piece", u: "piece", un: "piece", unite: "piece", unites: "piece",
  colis: "colis", col: "colis",
  carton: "carton", cartons: "carton", ct: "carton", crt: "carton",
  barquette: "barquette", barquettes: "barquette", barq: "barquette", bqt: "barquette",
  bouteille: "bouteille", bouteilles: "bouteille", btl: "bouteille", bt: "bouteille", bout: "bouteille",
  botte: "botte", bottes: "botte",
  sac: "sac", sacs: "sac",
  autre: "autre",
};

/** « Kilo », « PCE », « bt »… → unité reconnue, ou null si inconnue. */
export function parseRawUnit(value: string): RawUnit | null {
  return UNIT_SYNONYMS[normalizeText(value).replace(/ /g, "")] ?? null;
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

/** La clé contient « | » et des espaces : on l'encode pour l'utiliser dans une adresse web. */
export function encodeProductKey(key: string): string {
  return Buffer.from(key, "utf8").toString("base64url");
}

export function decodeProductKey(encoded: string): string {
  return Buffer.from(encoded, "base64url").toString("utf8");
}
