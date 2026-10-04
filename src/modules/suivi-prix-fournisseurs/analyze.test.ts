import { describe, expect, it } from "vitest";
import { analyzePrices, type PricePoint } from "./analyze";

function point(date: string, unitPrice: number, overrides: Partial<PricePoint> = {}): PricePoint {
  return {
    productKey: "boucherie|ref:bv 112|kg",
    supplier: "Boucherie",
    label: "ENTRECOTE",
    unit: "kg",
    invoiceId: `inv-${date}`,
    invoiceDate: date,
    quantity: 10,
    unitPrice,
    ...overrides,
  };
}

describe("analyzePrices", () => {
  it("détecte une hausse nette et estime le surcoût mensuel", () => {
    // 10 kg par semaine, puis +10 %. Moins d'un mois d'historique : on compte
    // prudemment 40 kg sur un mois, soit 2 € × 40 kg = 80 €.
    const analysis = analyzePrices([
      point("2026-09-01", 20),
      point("2026-09-08", 20),
      point("2026-09-15", 20),
      point("2026-09-22", 22),
    ]);
    expect(analysis.changes).toHaveLength(1);
    const change = analysis.changes[0];
    expect(change.kind).toBe("hausse");
    expect(change.oldPrice).toBe(20);
    expect(change.newPrice).toBe(22);
    expect(change.changePct).toBe(10);
    expect(change.changedOn).toBe("2026-09-22");
    expect(change.monthlyImpact).toBe(80);
    expect(analysis.monthlyExtraCost).toBe(change.monthlyImpact);
  });

  it("garde l'alerte quand le prix reste haut après la hausse", () => {
    const analysis = analyzePrices([
      point("2026-08-01", 20),
      point("2026-08-08", 22),
      point("2026-08-15", 22),
      point("2026-08-22", 22),
    ]);
    expect(analysis.changes[0]).toMatchObject({ kind: "hausse", oldPrice: 20, changedOn: "2026-08-08" });
  });

  it("repère plusieurs petites hausses qui s'additionnent", () => {
    const analysis = analyzePrices([
      point("2026-08-01", 20),
      point("2026-08-08", 20.4),
      point("2026-08-15", 20.8),
      point("2026-08-22", 21.2),
    ]);
    expect(analysis.changes[0]).toMatchObject({
      kind: "hausse-progressive",
      oldPrice: 20,
      changedOn: "2026-08-08",
      changePct: 6,
    });
  });

  it("ignore les variations sous le seuil", () => {
    const analysis = analyzePrices([point("2026-08-01", 20), point("2026-08-08", 20.4)]);
    expect(analysis.changes).toEqual([]);
    expect(analysis.monthlyExtraCost).toBe(0);
  });

  it("signale les baisses sans les compter dans le surcoût", () => {
    const analysis = analyzePrices([point("2026-08-01", 3.2), point("2026-08-08", 2.6)]);
    expect(analysis.changes[0].kind).toBe("baisse");
    expect(analysis.changes[0].monthlyImpact).toBeLessThan(0);
    expect(analysis.monthlyExtraCost).toBe(0);
  });

  it("ne remonte pas au-delà de 3 mois", () => {
    const analysis = analyzePrices([
      point("2026-01-05", 20),
      point("2026-06-01", 22),
      point("2026-07-01", 22),
      point("2026-08-01", 22),
    ]);
    expect(analysis.changes).toEqual([]);
  });

  it("fusionne deux achats le même jour au prix moyen pondéré", () => {
    const analysis = analyzePrices([
      point("2026-08-01", 10, { quantity: 1, invoiceId: "a" }),
      point("2026-08-01", 13, { quantity: 2, invoiceId: "b" }),
    ]);
    expect(analysis.products[0].history).toEqual([{ date: "2026-08-01", unitPrice: 12, quantity: 3 }]);
  });

  it("ne compare pas des produits différents", () => {
    const analysis = analyzePrices([
      point("2026-08-01", 20),
      point("2026-08-08", 30, { productKey: "boucherie|bavette|kg", label: "BAVETTE" }),
    ]);
    expect(analysis.products).toHaveLength(2);
    expect(analysis.changes).toEqual([]);
  });

  it("renvoie une analyse vide sans factures", () => {
    expect(analyzePrices([])).toEqual({ products: [], changes: [], monthlyExtraCost: 0, period: null });
  });
});
