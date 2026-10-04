import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { PriceHistoryChart } from "@/components/PriceHistoryChart";
import { Badge, Card, CardTitle, Kpi } from "@/components/ui";
import { formatDate, formatEuro, formatEuroRounded, formatPct } from "@/lib/format";
import { analyzePrices } from "@/modules/suivi-prix-fournisseurs/analyze";
import { decodeProductKey, formatQuantity, UNIT_LABELS, UNIT_PRICE_PHRASES } from "@/modules/suivi-prix-fournisseurs/normalize";
import { listPricePoints } from "@/modules/suivi-prix-fournisseurs/repository";
import { isUuid } from "@/platform/db";

export default async function ProductPage(props: PageProps<"/clients/[id]/produits/[product]">) {
  await connection();
  const { id, product } = await props.params;
  if (!isUuid(id)) notFound();
  const key = decodeProductKey(product);

  const points = await listPricePoints(id);
  const analysis = analyzePrices(points);
  const summary = analysis.products.find((p) => p.productKey === key);
  if (!summary) notFound();

  const change = analysis.changes.find((c) => c.productKey === key);
  const unit = UNIT_LABELS[summary.unit];
  const purchases = points
    .filter((p) => p.productKey === key)
    .sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate));
  const monthlyCost = summary.lastPrice * summary.monthlyQuantity;

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/clients/${id}`} className="text-sm text-slate-500 hover:text-slate-900">
          ← Retour au client
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">{summary.label}</h1>
        <p className="text-sm text-slate-500">
          {summary.supplier} · prix {UNIT_PRICE_PHRASES[summary.unit]}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Prix actuel" value={`${formatEuro(summary.lastPrice)}/${unit}`} />
        <Kpi
          label="Depuis le 1er achat"
          value={summary.changeVsFirstPct === null ? "—" : formatPct(summary.changeVsFirstPct)}
          tone={(summary.changeVsFirstPct ?? 0) >= 3 ? "red" : "default"}
        />
        <Kpi label="Acheté par mois" value={`≈ ${formatQuantity(Math.round(summary.monthlyQuantity * 10) / 10, summary.unit)}`} />
        <Kpi label="Budget par mois" value={`≈ ${formatEuroRounded(monthlyCost)}`} />
      </div>

      {change && (
        <Card tone={change.kind === "baisse" ? "green" : change.kind === "hausse" ? "red" : "amber"}>
          <p className="text-sm text-slate-800">
            <Badge tone={change.kind === "baisse" ? "green" : change.kind === "hausse" ? "red" : "amber"}>
              {change.kind === "baisse" ? "Baisse" : change.kind === "hausse" ? "Hausse" : "Hausse progressive"}
            </Badge>{" "}
            {formatEuro(change.oldPrice)} → {formatEuro(change.newPrice)}/{unit} ({formatPct(change.changePct)}) depuis le{" "}
            {formatDate(change.changedOn)}
            {Math.abs(change.monthlyImpact) >= 1 &&
              `, soit environ ${formatEuroRounded(Math.abs(change.monthlyImpact))} ${change.monthlyImpact > 0 ? "de plus" : "de moins"} par mois.`}
          </p>
        </Card>
      )}

      <Card>
        <CardTitle hint="Chaque point est un achat. Le prix reste le même jusqu'à l'achat suivant.">
          Prix unitaire HT ({`€/${unit}`})
        </CardTitle>
        <PriceHistoryChart
          points={summary.history.map((h) => ({ date: h.date, value: h.unitPrice }))}
          unitLabel={unit}
        />
      </Card>

      <Card>
        <CardTitle>Achats ({purchases.length})</CardTitle>
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500 uppercase">
              <tr className="border-b border-slate-100">
                <th className="px-5 py-2 font-medium">Date</th>
                <th className="px-3 py-2 text-right font-medium">Quantité</th>
                <th className="px-5 py-2 text-right font-medium">Prix unitaire HT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {purchases.map((p, i) => (
                <tr key={`${p.invoiceId}-${i}`}>
                  <td className="px-5 py-2">
                    <Link href={`/clients/${id}/factures/${p.invoiceId}`} className="text-slate-900 underline-offset-2 hover:underline">
                      {formatDate(p.invoiceDate)}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right">{formatQuantity(p.quantity, p.unit)}</td>
                  <td className="px-5 py-2 text-right">{formatEuro(p.unitPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
