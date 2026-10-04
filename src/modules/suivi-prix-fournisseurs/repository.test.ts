import { beforeEach, describe, expect, it } from "vitest";
import { listExecutions, runCommand } from "@/platform/commands";
import { resetDbForTests } from "@/platform/db";
import { createOrganization, listInstalledModules } from "@/platform/organizations";
import { analyzePrices } from "./analyze";
import { buildDemoInvoices } from "./demo";
import { buildReport } from "./report";
import {
  deleteInvoice,
  DuplicateInvoiceError,
  getInvoice,
  listInvoices,
  listPricePoints,
  saveInvoice,
} from "./repository";

// Ces tests utilisent une vraie base Postgres (PGlite, en mémoire).

beforeEach(() => {
  resetDbForTests();
});

describe("enregistrement des factures", () => {
  it("enregistre une facture et relit ses lignes", async () => {
    const orgId = await createOrganization({ name: "Chez Test" });
    expect(await listInstalledModules(orgId)).toEqual(["suivi-prix-fournisseurs"]);

    const [draft] = buildDemoInvoices(new Date("2026-10-01T12:00:00Z"));
    const invoiceId = await saveInvoice(orgId, { ...draft, warnings: ["à vérifier"] }, { fileName: "f.pdf" });

    const invoice = await getInvoice(orgId, invoiceId);
    expect(invoice).toMatchObject({
      supplier: draft.supplier,
      invoiceDate: draft.invoiceDate,
      totalHt: draft.totalHt,
      lineCount: 3,
      warnings: ["à vérifier"],
      fileName: "f.pdf",
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
    const invoiceId = await saveInvoice(a, draft);

    expect(await listInvoices(b)).toEqual([]);
    expect(await getInvoice(b, invoiceId)).toBeNull();
    await deleteInvoice(b, invoiceId);
    expect(await listInvoices(a)).toHaveLength(1);
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
