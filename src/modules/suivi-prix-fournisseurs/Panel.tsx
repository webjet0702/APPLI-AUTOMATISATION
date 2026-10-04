import Link from "next/link";
import { CopyButton } from "@/components/buttons";
import { Badge, Card, CardTitle, Kpi } from "@/components/ui";
import { formatDate, formatEuro, formatEuroRounded, formatPct } from "@/lib/format";
import { analyzePrices, DEFAULT_THRESHOLD_PCT, LOOKBACK_DAYS, type PriceChange } from "./analyze";
import { encodeProductKey, formatQuantity, UNIT_LABELS } from "./normalize";
import { buildReport } from "./report";
import { listInvoices, listPricePoints, reviewPoints, type InvoiceSummary } from "./repository";
import { UploadInvoiceForm } from "./UploadInvoiceForm";

const CHANGE_BADGES: Record<PriceChange["kind"], { label: string; tone: "red" | "amber" | "green" }> = {
  hausse: { label: "Hausse", tone: "red" },
  "hausse-progressive": { label: "Hausse progressive", tone: "amber" },
  baisse: { label: "Baisse", tone: "green" },
};

function PctCell({ value }: { value: number | null }) {
  if (value === null) return <span className="text-slate-400">—</span>;
  const color = value >= DEFAULT_THRESHOLD_PCT ? "text-red-600" : value <= -DEFAULT_THRESHOLD_PCT ? "text-emerald-600" : "text-slate-500";
  return <span className={color}>{formatPct(value)}</span>;
}

const RECENT_INVOICES = 10;

function InvoiceTable({ organizationId, invoices }: { organizationId: string; invoices: InvoiceSummary[] }) {
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="text-left text-xs text-slate-500 uppercase">
          <tr className="border-b border-slate-100">
            <th className="px-5 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Fournisseur</th>
            <th className="px-3 py-2 text-right font-medium">Total HT</th>
            <th className="px-3 py-2 text-right font-medium">Produits</th>
            <th className="px-5 py-2 font-medium">État</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 tabular-nums">
          {invoices.map((inv) => (
            <tr key={inv.id} className="hover:bg-slate-50">
              <td className="px-5 py-2">
                <Link
                  href={`/clients/${organizationId}/factures/${inv.id}`}
                  className="text-slate-900 underline-offset-2 hover:underline"
                >
                  {formatDate(inv.invoiceDate)}
                </Link>
              </td>
              <td className="px-3 py-2">
                {inv.supplier}
                {inv.invoiceNumber && <span className="text-xs text-slate-500"> · n° {inv.invoiceNumber}</span>}
              </td>
              <td className="px-3 py-2 text-right">{inv.totalHt === null ? "—" : formatEuro(inv.totalHt)}</td>
              <td className="px-3 py-2 text-right">{inv.lineCount}</td>
              <td className="px-5 py-2">
                {inv.source === "demo" ? (
                  <Badge tone="blue">Démo</Badge>
                ) : inv.verified ? (
                  <Badge tone="green">Vérifiée</Badge>
                ) : reviewPoints(inv).length > 0 ? (
                  <Badge tone="amber">À vérifier</Badge>
                ) : (
                  <Badge tone="green">OK</Badge>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export async function SupplierPricesPanel({ organizationId }: { organizationId: string }) {
  const [invoices, points] = await Promise.all([listInvoices(organizationId), listPricePoints(organizationId)]);
  const analysis = analyzePrices(points);
  const increases = analysis.changes.filter((c) => c.kind !== "baisse");
  const report = buildReport(analysis, invoices.length);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Surcoût / mois"
          value={formatEuroRounded(analysis.monthlyExtraCost)}
          hint={analysis.monthlyExtraCost > 0 ? `soit ${formatEuroRounded(analysis.monthlyExtraCost * 12)} par an` : undefined}
          tone={analysis.monthlyExtraCost > 0 ? "red" : "default"}
        />
        <Kpi label="Hausses détectées" value={increases.length} />
        <Kpi label="Produits suivis" value={analysis.products.length} />
        <Kpi label="Factures analysées" value={invoices.length} />
      </div>

      <Card>
        <CardTitle hint="Un PDF reçu par email ou une photo prise au téléphone. Claude lit chaque ligne et l'enregistre.">
          Ajouter une facture
        </CardTitle>
        <UploadInvoiceForm organizationId={organizationId} />
      </Card>

      <Card>
        <CardTitle
          hint={`Changements de plus de ${DEFAULT_THRESHOLD_PCT} % sur les ${Math.round(LOOKBACK_DAYS / 30)} derniers mois. Surcoût estimé à partir des quantités achetées.`}
        >
          Alertes prix
        </CardTitle>
        {analysis.changes.length === 0 ? (
          <p className="text-sm text-slate-500">Aucun changement de prix notable pour l&apos;instant.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {analysis.changes.map((c) => {
              const badge = CHANGE_BADGES[c.kind];
              return (
                <li key={c.productKey} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={badge.tone}>{badge.label}</Badge>
                      <Link
                        href={`/clients/${organizationId}/produits/${encodeProductKey(c.productKey)}`}
                        className="font-medium text-slate-900 underline-offset-2 hover:underline"
                      >
                        {c.label}
                      </Link>
                    </div>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {c.supplier} · {formatEuro(c.oldPrice)} → {formatEuro(c.newPrice)}/{UNIT_LABELS[c.unit]} depuis le{" "}
                      {formatDate(c.changedOn)}
                    </p>
                  </div>
                  <div className="text-right tabular-nums sm:min-w-40">
                    <p className={`font-semibold ${c.kind === "baisse" ? "text-emerald-600" : "text-red-600"}`}>
                      {formatPct(c.changePct)}
                    </p>
                    {Math.abs(c.monthlyImpact) >= 1 && (
                      <p className="text-sm text-slate-500">
                        ≈ {c.monthlyImpact > 0 ? "+" : "−"}
                        {formatEuroRounded(Math.abs(c.monthlyImpact))} / mois
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {invoices.length > 0 && (
        <Card>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <CardTitle hint="À coller dans un email ou un message WhatsApp au restaurateur.">Rapport pour le client</CardTitle>
            <CopyButton text={report} />
          </div>
          <pre className="rounded-lg bg-slate-50 p-4 text-sm whitespace-pre-wrap text-slate-800">{report}</pre>
        </Card>
      )}

      {analysis.products.length > 0 && (
        <Card>
          <CardTitle>Produits suivis</CardTitle>
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs text-slate-500 uppercase">
                <tr className="border-b border-slate-100">
                  <th className="px-5 py-2 font-medium">Produit</th>
                  <th className="px-3 py-2 text-right font-medium">Dernier prix</th>
                  <th className="px-3 py-2 text-right font-medium">vs achat précédent</th>
                  <th className="px-3 py-2 text-right font-medium">vs premier achat</th>
                  <th className="px-5 py-2 text-right font-medium">Achats / mois</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {analysis.products.map((p) => (
                  <tr key={p.productKey}>
                    <td className="px-5 py-2">
                      <Link
                        href={`/clients/${organizationId}/produits/${encodeProductKey(p.productKey)}`}
                        className="text-slate-900 underline-offset-2 hover:underline"
                      >
                        {p.label}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {p.supplier} · {p.history.length} achat(s)
                      </p>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatEuro(p.lastPrice)}/{UNIT_LABELS[p.unit]}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <PctCell value={p.changeVsPreviousPct} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <PctCell value={p.changeVsFirstPct} />
                    </td>
                    <td className="px-5 py-2 text-right text-slate-600">
                      ≈ {formatQuantity(Math.round(p.monthlyQuantity * 10) / 10, p.unit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {invoices.length > 0 && (
        <Card>
          <CardTitle>Factures</CardTitle>
          <InvoiceTable organizationId={organizationId} invoices={invoices.slice(0, RECENT_INVOICES)} />
          {invoices.length > RECENT_INVOICES && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium text-slate-600 hover:text-slate-900">
                Voir les {invoices.length - RECENT_INVOICES} autres factures
              </summary>
              <InvoiceTable organizationId={organizationId} invoices={invoices.slice(RECENT_INVOICES)} />
            </details>
          )}
        </Card>
      )}
    </div>
  );
}
