import { describe, expect, it } from "vitest";
import { ExtractionError, toInvoiceDraft, type ExtractedInvoice } from "./invoice-draft";
import { parseDecimal } from "@/lib/format";
import { decodeProductKey, encodeProductKey, normalizeText, normalizeUnit, parseRawUnit, productKey } from "./normalize";

function extracted(overrides: Partial<ExtractedInvoice> = {}): ExtractedInvoice {
  return {
    is_supplier_invoice: true,
    supplier: "Crèmerie des Halles",
    invoice_number: "CH-1042",
    invoice_date: "2026-09-14",
    total_ht: 74.4,
    lines: [
      {
        reference: "C1020",
        label: "BEURRE DOUX PLAQUE 1KG",
        unit: "piece",
        quantity: 6,
        unit_price_ht: 8.4,
        line_total_ht: 50.4,
      },
      {
        reference: null,
        label: "Crème liquide 35%",
        unit: "cl",
        quantity: 600,
        unit_price_ht: 0.04,
        line_total_ht: 24,
      },
    ],
    doubts: [],
    ...overrides,
  };
}

describe("normalisation", () => {
  it("enlève accents, majuscules et ponctuation", () => {
    expect(normalizeText("  Crème Liquide 35% M.G. ")).toBe("creme liquide 35 m g");
  });

  it("convertit grammes et centilitres", () => {
    expect(normalizeUnit("g", 500, 0.02)).toEqual({ unit: "kg", quantity: 0.5, unitPrice: 20 });
    expect(normalizeUnit("cl", 600, 0.04)).toEqual({ unit: "l", quantity: 6, unitPrice: 4 });
  });

  it("reconnaît les façons courantes d'écrire une unité", () => {
    expect(parseRawUnit("Kilo")).toBe("kg");
    expect(parseRawUnit(" PCE ")).toBe("piece");
    expect(parseRawUnit("Bt")).toBe("bouteille");
    expect(parseRawUnit("lt.")).toBe("l");
    expect(parseRawUnit("palette")).toBeNull();
  });

  it("préfère la référence au libellé pour reconnaître un produit", () => {
    expect(productKey("Crèmerie", "C-1020", "Beurre", "piece")).toBe("cremerie|ref:c 1020|piece");
    expect(productKey("Crèmerie", null, "Beurre doux", "piece")).toBe("cremerie|beurre doux|piece");
  });
});

describe("saisie et adresses", () => {
  it("lit les nombres tapés à la française", () => {
    expect(parseDecimal("12,50")).toBe(12.5);
    expect(parseDecimal(" 1 250,5 € ")).toBe(1250.5);
    expect(parseDecimal("12.5")).toBe(12.5);
    expect(parseDecimal("douze")).toBeNull();
    expect(parseDecimal("")).toBeNull();
  });

  it("encode la clé produit pour l'adresse web, aller-retour", () => {
    const key = "cremerie des halles|ref:c1020|piece";
    expect(encodeProductKey(key)).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeProductKey(encodeProductKey(key))).toBe(key);
  });
});

describe("toInvoiceDraft", () => {
  it("nettoie une facture correcte sans avertissement", () => {
    const draft = toInvoiceDraft(extracted());
    expect(draft.warnings).toEqual([]);
    expect(draft.lines[1]).toMatchObject({ unit: "l", quantity: 6, unitPrice: 4 });
    expect(draft.lines[0].productKey).toBe("cremerie des halles|ref:c1020|piece");
  });

  it("refuse un document qui n'est pas une facture", () => {
    expect(() => toInvoiceDraft(extracted({ is_supplier_invoice: false }))).toThrow(ExtractionError);
  });

  it("refuse une date illisible", () => {
    expect(() => toInvoiceDraft(extracted({ invoice_date: "14/09/2026" }))).toThrow(/date/);
    expect(() => toInvoiceDraft(extracted({ invoice_date: "2026-02-30" }))).toThrow(/date/);
  });

  it("ignore les avoirs et le signale", () => {
    const draft = toInvoiceDraft(
      extracted({
        total_ht: null,
        lines: [...extracted().lines, { reference: null, label: "Avoir casse", unit: "piece", quantity: 1, unit_price_ht: -5, line_total_ht: -5 }],
      }),
    );
    expect(draft.lines).toHaveLength(2);
    expect(draft.warnings).toEqual(["1 ligne(s) ignorée(s) : quantité ou prix nul ou négatif (avoir, gratuité…)."]);
  });

  it("signale une ligne dont le calcul ne tombe pas juste", () => {
    const lines = extracted().lines;
    lines[0] = { ...lines[0], line_total_ht: 58.4 };
    const draft = toInvoiceDraft(extracted({ lines, total_ht: null }));
    expect(draft.warnings).toHaveLength(1);
    expect(draft.warnings[0]).toContain("BEURRE DOUX PLAQUE 1KG");
  });

  it("accepte une unité écrite autrement et signale une unité inconnue", () => {
    const lines = extracted().lines;
    lines[0] = { ...lines[0], unit: "Pce" };
    lines[1] = { ...lines[1], unit: "palette", quantity: 1, unit_price_ht: 24, line_total_ht: 24 };
    const draft = toInvoiceDraft(extracted({ lines }));
    expect(draft.lines.map((l) => l.unit)).toEqual(["piece", "autre"]);
    expect(draft.warnings).toEqual(["« Crème liquide 35% » : unité « palette » non reconnue. Ligne à vérifier."]);
  });

  it("reprend les doutes de Claude", () => {
    const draft = toInvoiceDraft(extracted({ doubts: ["Quantité du beurre peu lisible"] }));
    expect(draft.warnings).toEqual(["Quantité du beurre peu lisible"]);
  });

  it("refuse une facture sans aucune ligne utilisable", () => {
    expect(() => toInvoiceDraft(extracted({ lines: [] }))).toThrow(/Aucune ligne/);
  });
});
