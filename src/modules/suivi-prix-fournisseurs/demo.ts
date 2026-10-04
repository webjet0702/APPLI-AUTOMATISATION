import type { InvoiceDraft } from "./invoice-draft";
import { productKey, round, type Unit } from "./normalize";

// Données d'un restaurant fictif : 12 semaines de livraisons chez 4 fournisseurs,
// avec quelques hausses cachées. Sert à montrer l'outil en rendez-vous de prospection.

type DemoProduct = {
  reference: string | null;
  label: string;
  unit: Unit;
  quantity: number;
  price: (week: number) => number;
};

type DemoSupplier = { name: string; prefix: string; products: DemoProduct[] };

export const DEMO_WEEKS = 12;

const SUPPLIERS: DemoSupplier[] = [
  {
    name: "Boucherie du Marché",
    prefix: "BM",
    products: [
      { reference: "BV-112", label: "ENTRECOTE VBF S/V", unit: "kg", quantity: 12, price: (w) => (w < 8 ? 28.5 : 31.2) },
      { reference: "BV-204", label: "BAVETTE D'ALOYAU VBF", unit: "kg", quantity: 8, price: () => 18.9 },
      { reference: "BV-310", label: "HACHE 15% MG VBF", unit: "kg", quantity: 15, price: (w) => (w < 10 ? 11.2 : 11.8) },
    ],
  },
  {
    name: "Crèmerie des Halles",
    prefix: "CH",
    products: [
      { reference: "C1020", label: "BEURRE DOUX PLAQUE 1KG", unit: "piece", quantity: 6, price: (w) => (w < 6 ? 8.4 : 9.3) },
      { reference: "C2210", label: "CREME LIQUIDE 35% UHT 1L", unit: "l", quantity: 12, price: () => 4.1 },
      // +1,5 % toutes les 3 semaines : invisible d'une facture à l'autre.
      { reference: "C3305", label: "COMTE AOP 18 MOIS", unit: "kg", quantity: 3, price: (w) => 17.8 * (1 + 0.015 * Math.floor(w / 3)) },
    ],
  },
  {
    name: "Primeurs Saint-Jean",
    prefix: "PSJ",
    products: [
      { reference: null, label: "Tomate grappe cat. 1", unit: "kg", quantity: 20, price: (w) => (w < 9 ? 3.2 : 2.6) },
      { reference: null, label: "Pomme de terre Agata", unit: "kg", quantity: 40, price: () => 1.1 },
      { reference: null, label: "Oignon jaune", unit: "kg", quantity: 10, price: () => 1.3 },
    ],
  },
  {
    name: "Boissons Express",
    prefix: "BE",
    products: [
      { reference: "B-033", label: "SODA COLA 33CL X24", unit: "colis", quantity: 4, price: (w) => (w < 7 ? 14.4 : 15.6) },
      { reference: "B-101", label: "EAU MINERALE 1L X6", unit: "colis", quantity: 6, price: () => 3.9 },
    ],
  },
];

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function buildDemoInvoices(today: Date = new Date()): InvoiceDraft[] {
  const invoices: InvoiceDraft[] = [];
  SUPPLIERS.forEach((supplier, s) => {
    for (let week = 0; week < DEMO_WEEKS; week++) {
      const date = new Date(today);
      // Chaque fournisseur livre un jour différent ; aucune date dans le futur.
      date.setUTCDate(date.getUTCDate() - (DEMO_WEEKS - 1 - week) * 7 - (SUPPLIERS.length - 1 - s));
      const lines = supplier.products.map((p, i) => {
        // Petites variations de quantité d'une semaine à l'autre, pour faire réaliste.
        const quantity = round(p.quantity * (1 + (((week * 7 + i * 3) % 5) - 2) * 0.05), 3);
        const unitPrice = round(p.price(week), 2);
        return {
          reference: p.reference,
          label: p.label,
          unit: p.unit,
          quantity,
          unitPrice,
          lineTotal: round(quantity * unitPrice, 2),
          productKey: productKey(supplier.name, p.reference, p.label, p.unit),
        };
      });
      invoices.push({
        supplier: supplier.name,
        invoiceNumber: `${supplier.prefix}-${String(1000 + week)}`,
        invoiceDate: isoDate(date),
        totalHt: round(
          lines.reduce((sum, l) => sum + (l.lineTotal ?? 0), 0),
          2,
        ),
        lines,
        warnings: [],
      });
    }
  });
  return invoices;
}
