import { round, type Unit } from "./normalize";

// Cœur de l'automatisation : à partir de toutes les lignes de factures d'un
// client, retrouve l'historique de prix de chaque produit et détecte les hausses.
// Fonctions pures (pas de base de données, pas d'IA) : faciles à tester.

export type PricePoint = {
  productKey: string;
  supplier: string;
  label: string;
  unit: Unit;
  invoiceId: string;
  invoiceDate: string; // AAAA-MM-JJ
  quantity: number;
  unitPrice: number;
};

export type HistoryEntry = { date: string; unitPrice: number; quantity: number };

export type ProductSummary = {
  productKey: string;
  supplier: string;
  label: string;
  unit: Unit;
  history: HistoryEntry[];
  firstPrice: number;
  lastPrice: number;
  changeVsPreviousPct: number | null;
  changeVsFirstPct: number | null;
  monthlyQuantity: number;
};

export type PriceChange = {
  kind: "hausse" | "hausse-progressive" | "baisse";
  productKey: string;
  supplier: string;
  label: string;
  unit: Unit;
  oldPrice: number;
  newPrice: number;
  changePct: number;
  /** Date du premier achat au nouveau prix (ou de la première petite hausse). */
  changedOn: string;
  /** Différence de coût estimée par mois, en euros (positif = le client paie plus). */
  monthlyImpact: number;
};

export type Analysis = {
  products: ProductSummary[];
  changes: PriceChange[];
  monthlyExtraCost: number;
  period: { from: string; to: string } | null;
};

/** En dessous de ce pourcentage, on considère que le prix n'a pas bougé. */
export const DEFAULT_THRESHOLD_PCT = 3;
/** On ne signale que les changements des 3 derniers mois : au-delà, ce n'est plus une nouvelle. */
export const LOOKBACK_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS_PER_MONTH = 30.44;

function pctChange(from: number, to: number): number {
  return ((to - from) / from) * 100;
}

/** Plusieurs achats le même jour = un seul point, au prix moyen pondéré par la quantité. */
function buildHistory(points: PricePoint[]): HistoryEntry[] {
  const byDate = new Map<string, { total: number; quantity: number }>();
  for (const p of points) {
    const entry = byDate.get(p.invoiceDate) ?? { total: 0, quantity: 0 };
    entry.total += p.unitPrice * p.quantity;
    entry.quantity += p.quantity;
    byDate.set(p.invoiceDate, entry);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { total, quantity }]) => ({
      date,
      unitPrice: round(total / quantity, 4),
      quantity: round(quantity, 3),
    }));
}

/**
 * Quantité achetée par mois. Pour n achats espacés de d jours en moyenne, la
 * période couverte vaut n × d jours (et pas (n − 1) × d, sinon on surestime).
 * Moins d'un mois d'historique compte pour un mois : estimation prudente.
 */
function monthlyQuantity(history: HistoryEntry[]): number {
  const total = history.reduce((sum, h) => sum + h.quantity, 0);
  if (history.length < 2) return total;
  const span = (Date.parse(history[history.length - 1].date) - Date.parse(history[0].date)) / DAY_MS;
  const averageGap = span / (history.length - 1);
  const months = Math.max(1, (span + averageGap) / DAYS_PER_MONTH);
  return total / months;
}

/**
 * Remonte l'historique depuis le dernier achat jusqu'au dernier prix
 * nettement différent du prix actuel. Repère aussi bien une hausse d'un coup
 * que plusieurs petites hausses qui, ensemble, dépassent le seuil.
 */
function detectChange(history: HistoryEntry[], thresholdPct: number) {
  const last = history[history.length - 1];
  const windowStart = Date.parse(last.date) - LOOKBACK_DAYS * DAY_MS;
  for (let i = history.length - 2; i >= 0; i--) {
    if (Date.parse(history[i].date) < windowStart) return null;
    const pct = pctChange(history[i].unitPrice, last.unitPrice);
    if (Math.abs(pct) >= thresholdPct) {
      // Pour une hausse en plusieurs étapes, on remonte jusqu'au début de la tendance.
      const rising = pct > 0;
      while (
        i > 0 &&
        Date.parse(history[i - 1].date) >= windowStart &&
        (rising
          ? history[i - 1].unitPrice < history[i].unitPrice
          : history[i - 1].unitPrice > history[i].unitPrice)
      ) {
        i--;
      }
      const entry = history[i];
      const after = history.slice(i + 1);
      // Si les prix intermédiaires diffèrent du prix actuel, la hausse s'est faite par étapes.
      const gradual = after.some((h) => Math.abs(pctChange(h.unitPrice, last.unitPrice)) > 0.5);
      return { old: entry, changedOn: after[0].date, gradual };
    }
  }
  return null;
}

export function analyzePrices(points: PricePoint[], thresholdPct = DEFAULT_THRESHOLD_PCT): Analysis {
  const byProduct = new Map<string, PricePoint[]>();
  for (const p of points) {
    const list = byProduct.get(p.productKey) ?? [];
    list.push(p);
    byProduct.set(p.productKey, list);
  }

  const products: ProductSummary[] = [];
  const changes: PriceChange[] = [];

  for (const [key, productPoints] of byProduct) {
    const latest = productPoints.reduce((a, b) => (b.invoiceDate >= a.invoiceDate ? b : a));
    const history = buildHistory(productPoints);
    const first = history[0];
    const last = history[history.length - 1];
    const previous = history.length >= 2 ? history[history.length - 2] : null;
    const perMonth = monthlyQuantity(history);

    products.push({
      productKey: key,
      supplier: latest.supplier,
      label: latest.label,
      unit: latest.unit,
      history,
      firstPrice: first.unitPrice,
      lastPrice: last.unitPrice,
      changeVsPreviousPct: previous ? round(pctChange(previous.unitPrice, last.unitPrice), 1) : null,
      changeVsFirstPct: previous ? round(pctChange(first.unitPrice, last.unitPrice), 1) : null,
      monthlyQuantity: round(perMonth, 3),
    });

    const change = detectChange(history, thresholdPct);
    if (change) {
      const pct = pctChange(change.old.unitPrice, last.unitPrice);
      changes.push({
        kind: pct < 0 ? "baisse" : change.gradual ? "hausse-progressive" : "hausse",
        productKey: key,
        supplier: latest.supplier,
        label: latest.label,
        unit: latest.unit,
        oldPrice: change.old.unitPrice,
        newPrice: last.unitPrice,
        changePct: round(pct, 1),
        changedOn: change.changedOn,
        monthlyImpact: round((last.unitPrice - change.old.unitPrice) * perMonth, 2),
      });
    }
  }

  // Les hausses qui coûtent le plus cher d'abord, puis les baisses.
  changes.sort((a, b) => {
    const aUp = a.kind !== "baisse";
    const bUp = b.kind !== "baisse";
    if (aUp !== bUp) return aUp ? -1 : 1;
    return Math.abs(b.monthlyImpact) - Math.abs(a.monthlyImpact);
  });
  products.sort((a, b) => a.supplier.localeCompare(b.supplier) || a.label.localeCompare(b.label));

  const dates = points.map((p) => p.invoiceDate).sort();
  const monthlyExtraCost = changes
    .filter((c) => c.kind !== "baisse")
    .reduce((sum, c) => sum + c.monthlyImpact, 0);

  return {
    products,
    changes,
    monthlyExtraCost: round(monthlyExtraCost, 2),
    period: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null,
  };
}
