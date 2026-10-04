import { beforeEach, describe, expect, it } from "vitest";
import { listExecutions, runCommand } from "@/platform/commands";
import { resetDbForTests } from "@/platform/db";
import { createOrganization, listInstalledModules } from "@/platform/organizations";
import { analyzePrices } from "./analyze";
import { buildDemoInvoices } from "./demo";
import { buildReport } from "./report";
import type { InvoiceDraft } from "./invoice-draft";
import { productKey } from "./normalize";
import {
  deleteInvoice,
  DuplicateInvoiceError,
  getInvoice,
  listInvoices,
  listPricePoints,
  markInvoiceVerified,
  reviewPoints,
  saveInvoice,
  updateInvoiceLine,
} from "./repository";
import { supplierPricesSummary } from "./summary";

function draftWith(labels: string[], overrides: Partial<InvoiceDraft> = {}): InvoiceDraft {
  const supplier = overrides.supplier ?? "Grossiste Test";
  return {
    supplier,
    invoiceNumber: "F-1",
    invoiceDate: "2026-09-01",
    totalHt: null,
    warnings: [],
    lines: labels.map((label) => ({
      reference: null,
      label,
      unit: "kg",
      quantity: 2,
      unitPrice: 10,
      lineTotal: 20,
      productKey: productKey(supplier, null, label, "kg"),
    })),
    ...overrides,
  };
}

// Ces tests utilisent une vraie base Postgres (PGlite, en mémoire).

beforeEach(() => {
  resetDbForTests();
});

describe("enregistrement des factures", () => {
  it("enregistre une facture et relit ses lignes", async () => {
    const orgId = await createOrganization({ name: "Chez Test" });
    expect(await listInstalledModules(orgId)).toEqual(["suivi-prix-fournisseurs"]);

    const [draft] = buildDemoInvoices(new Date("2026-10-01T12:00:00Z"));
    const { invoiceId, appended } = await saveInvoice(orgId, { ...draft, warnings: ["à vérifier"] }, { fileName: "f.pdf" });
    expect(appended).toBe(false);

    const invoice = await getInvoice(orgId, invoiceId);
    expect(invoice).toMatchObject({
      supplier: draft.supplier,
      invoiceDate: draft.invoiceDate,
      totalHt: draft.totalHt,
      lineCount: 3,
      warnings: ["à vérifier"],
      fileName: "f.pdf",
      verified: false,
    });
    expect(invoice!.lines.map((l) => l.unitPrice).sort()).toEqual(draft.lines.map((l) => l.unitPrice).sort());
  });

  it("refuse d'importer deux fois la même facture", async () => {
    const orgId = await createOrganization({ name: "Chez Test" });
    const [draft] = buildDemoInvoices();
    await saveInvoice(orgId, draft);
    await expect(saveInvoice(orgId, { ...draft, supplier: "BOUCHERIE DU MARCHE" })).rejects.toThrow(
      DuplicateInvoiceError,
    );
    expect(await listInvoices(orgId)).toHaveLength(1);
  });

  it("isole les données de chaque client", async () => {
    const a = await createOrganization({ name: "A" });
    const b = await createOrganization({ name: "B" });
    const [draft] = buildDemoInvoices();
    const { invoiceId } = await saveInvoice(a, draft);

    expect(await listInvoices(b)).toEqual([]);
    expect(await getInvoice(b, invoiceId)).toBeNull();
    await deleteInvoice(b, invoiceId);
    expect(await listInvoices(a)).toHaveLength(1);
  });
});

describe("factures en plusieurs pages et doublons", () => {
  it("ajoute la page 2 d'une facture photographiée page par page", async () => {
    const orgId = await createOrganization({ name: "Chez Test" });
    const page1 = await saveInvoice(orgId, draftWith(["Beurre", "Crème", "Lait"]));
    const page2 = await saveInvoice(orgId, draftWith(["Comté", "Oeufs"], { totalHt: 100, warnings: ["douteux"] }));

    expect(page2).toEqual({ invoiceId: page1.invoiceId, appended: true });
    const invoices = await listInvoices(orgId);
    expect(invoices).toHaveLength(1);
    expect(invoices[0]).toMatchObject({ lineCount: 5, totalHt: 100, linesTotal: 100, warnings: ["douteux"] });
    // Le total imprimé en page 2 correspond aux 5 lignes réunies : pas de fausse alerte.
    expect(reviewPoints(invoices[0])).toEqual(["douteux"]);
  });

  it("refuse la même page envoyée deux fois", async () => {
    const orgId = await createOrganization({ name: "Chez Test" });
    await saveInvoice(orgId, draftWith(["Beurre", "Crème", "Lait"]));
    await expect(saveInvoice(orgId, draftWith(["Beurre", "Crème", "Lait", "Oeufs"]))).rejects.toThrow(
      "La facture n° F-1 de Grossiste Test a déjà été importée.",
    );
  });

  it("repère un doublon même sans numéro de facture", async () => {
    const orgId = await createOrganization({ name: "Chez Test" });
    await saveInvoice(orgId, draftWith(["Beurre", "Crème"], { invoiceNumber: null }));
    await expect(saveInvoice(orgId, draftWith(["Beurre", "Crème"], { invoiceNumber: null }))).rejects.toThrow(
      DuplicateInvoiceError,
    );
    // Autre jour : c'est une nouvelle livraison.
    await saveInvoice(orgId, draftWith(["Beurre", "Crème"], { invoiceNumber: null, invoiceDate: "2026-09-08" }));
    expect(await listInvoices(orgId)).toHaveLength(2);
  });
});

describe("corrections", () => {
  it("signale un total HT différent de la somme des lignes, et plus après correction", async () => {
    const orgId = await createOrganization({ name: "Chez Test" });
    const { invoiceId } = await saveInvoice(orgId, draftWith(["Beurre", "Crème"], { totalHt: 50 }));
    const invoice = (await getInvoice(orgId, invoiceId))!;
    expect(reviewPoints(invoice)).toHaveLength(1);
    expect(reviewPoints(invoice)[0]).toContain("ne correspond pas au total HT");

    const line = invoice.lines.find((l) => l.label === "Crème")!;
    await updateInvoiceLine(orgId, invoiceId, line.id, { label: "Crème", reference: null, unit: "kg", quantity: 2, unitPrice: 15 });
    expect(reviewPoints((await getInvoice(orgId, invoiceId))!)).toEqual([]);
  });

  it("corrige une ligne mal lue et recalcule son montant", async () => {
    const orgId = await createOrganization({ name: "Chez Test" });
    const { invoiceId } = await saveInvoice(orgId, draftWith(["Beure doux"]));
    const [line] = (await getInvoice(orgId, invoiceId))!.lines;

    const ok = await updateInvoiceLine(orgId, invoiceId, line.id, {
      label: "Beurre doux",
      reference: "C1020",
      unit: "piece",
      quantity: 6,
      unitPrice: 8.4,
    });
    expect(ok).toBe(true);

    const [fixed] = (await getInvoice(orgId, invoiceId))!.lines;
    expect(fixed).toMatchObject({ label: "Beurre doux", reference: "C1020", unit: "piece", quantity: 6, unitPrice: 8.4, lineTotal: 50.4 });
    // La clé produit suit la correction : la ligne rejoint le bon historique.
    const [point] = await listPricePoints(orgId);
    expect(point.productKey).toBe("grossiste test|ref:c1020|piece");
  });

  it("ne corrige pas la ligne d'un autre client", async () => {
    const a = await createOrganization({ name: "A" });
    const b = await createOrganization({ name: "B" });
    const { invoiceId } = await saveInvoice(a, draftWith(["Beurre"]));
    const [line] = (await getInvoice(a, invoiceId))!.lines;
    const input = { label: "Pirate", reference: null, unit: "kg" as const, quantity: 1, unitPrice: 1 };
    expect(await updateInvoiceLine(b, invoiceId, line.id, input)).toBe(false);
    expect((await getInvoice(a, invoiceId))!.lines[0].label).toBe("Beurre");
  });

  it("marque une facture comme vérifiée", async () => {
    const orgId = await createOrganization({ name: "Chez Test" });
    const { invoiceId } = await saveInvoice(orgId, draftWith(["Beurre"]));
    await markInvoiceVerified(orgId, invoiceId);
    expect((await getInvoice(orgId, invoiceId))!.verified).toBe(true);
  });
});

describe("démo de bout en bout", () => {
  it("retrouve les hausses cachées dans les factures de démo", async () => {
    const orgId = await createOrganization({ name: "Démo", isDemo: true });
    for (const draft of buildDemoInvoices(new Date("2026-10-01T12:00:00Z"))) {
      await saveInvoice(orgId, draft, { source: "demo" });
    }

    const analysis = analyzePrices(await listPricePoints(orgId));
    expect(analysis.products).toHaveLength(11);

    const byLabel = Object.fromEntries(analysis.changes.map((c) => [c.label, c]));
    expect(Object.keys(byLabel).sort()).toEqual(
      [
        "BEURRE DOUX PLAQUE 1KG",
        "COMTE AOP 18 MOIS",
        "ENTRECOTE VBF S/V",
        "HACHE 15% MG VBF",
        "SODA COLA 33CL X24",
        "Tomate grappe cat. 1",
      ].sort(),
    );
    expect(byLabel["ENTRECOTE VBF S/V"]).toMatchObject({ kind: "hausse", oldPrice: 28.5, newPrice: 31.2 });
    expect(byLabel["COMTE AOP 18 MOIS"].kind).toBe("hausse-progressive");
    expect(byLabel["Tomate grappe cat. 1"].kind).toBe("baisse");
    // La plus chère en premier.
    expect(analysis.changes[0].label).toBe("ENTRECOTE VBF S/V");
    expect(analysis.monthlyExtraCost).toBeGreaterThan(200);
    expect(analysis.monthlyExtraCost).toBeLessThan(280);

    const report = buildReport(analysis, 48);
    expect(report).toContain("5 hausses de prix détectées");
    expect(report).toContain("1 baisse");
    expect(report).toContain("Factures analysées : 48");
    expect(report).toMatch(/par mois, soit .* sur un an/);

    // Intl met une espace insécable avant « € » : on compare sans les espaces.
    expect((await supplierPricesSummary(orgId)).replace(/\s/g, "")).toBe("5hausses·≈233€/mois");
  });
});

describe("runCommand", () => {
  it("garde une trace des succès et des erreurs", async () => {
    const orgId = await createOrganization({ name: "Chez Test" });
    const ctx = { organizationId: orgId, moduleId: "suivi-prix-fournisseurs", command: "analyser-facture" };

    await runCommand(ctx, async () => ({ value: 1, summary: "ok" }));
    await expect(runCommand(ctx, async () => Promise.reject(new Error("boum")))).rejects.toThrow("boum");

    const executions = await listExecutions(orgId);
    expect(executions.map((e) => [e.status, e.summary, e.error])).toEqual([
      ["erreur", null, "boum"],
      ["succes", "ok", null],
    ]);
  });
});
