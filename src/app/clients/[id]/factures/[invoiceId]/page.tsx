import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ConfirmButton } from "@/components/buttons";
import { Badge, Card, CardTitle } from "@/components/ui";
import { formatDate, formatEuro, formatNumber } from "@/lib/format";
import { removeInvoice } from "@/modules/suivi-prix-fournisseurs/actions";
import { UNIT_LABELS } from "@/modules/suivi-prix-fournisseurs/normalize";
import { getInvoice } from "@/modules/suivi-prix-fournisseurs/repository";
import { isUuid } from "@/platform/db";

export default async function InvoicePage(props: PageProps<"/clients/[id]/factures/[invoiceId]">) {
  await connection();
  const { id, invoiceId } = await props.params;
  if (!isUuid(id) || !isUuid(invoiceId)) notFound();
  const invoice = await getInvoice(id, invoiceId);
  if (!invoice) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href={`/clients/${id}`} className="text-sm text-slate-500 hover:text-slate-900">
            ← Retour au client
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">
            {invoice.supplier} · {formatDate(invoice.invoiceDate)}
          </h1>
          <p className="text-sm text-slate-500">
            {invoice.invoiceNumber ? `Facture n° ${invoice.invoiceNumber}` : "Sans numéro"}
            {invoice.totalHt !== null && ` · Total HT ${formatEuro(invoice.totalHt)}`}
            {invoice.fileName && ` · ${invoice.fileName}`}
          </p>
        </div>
        <form action={removeInvoice.bind(null, id, invoiceId)}>
          <ConfirmButton message="Supprimer cette facture ? Ses prix ne seront plus suivis.">Supprimer la facture</ConfirmButton>
        </form>
      </div>

      {invoice.warnings.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardTitle hint="Comparez avec la facture papier. Si une ligne est fausse, supprimez la facture et renvoyez une photo plus nette.">
            Points à vérifier
          </CardTitle>
          <ul className="list-disc space-y-1 pl-5 text-sm text-amber-900">
            {invoice.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardTitle hint="Ce que Claude a lu. Les grammes et centilitres sont convertis en kg et en litres.">
          Lignes de la facture {invoice.source === "demo" && <Badge tone="blue">Démo</Badge>}
        </CardTitle>
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-xs text-slate-500 uppercase">
              <tr className="border-b border-slate-100">
                <th className="px-5 py-2 font-medium">Produit</th>
                <th className="px-3 py-2 text-right font-medium">Quantité</th>
                <th className="px-3 py-2 text-right font-medium">Prix unitaire HT</th>
                <th className="px-5 py-2 text-right font-medium">Montant HT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {invoice.lines.map((line) => (
                <tr key={line.id}>
                  <td className="px-5 py-2">
                    <p className="text-slate-900">{line.label}</p>
                    {line.reference && <p className="text-xs text-slate-500">Réf. {line.reference}</p>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {formatNumber(line.quantity)} {UNIT_LABELS[line.unit]}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {formatEuro(line.unitPrice)}/{UNIT_LABELS[line.unit]}
                  </td>
                  <td className="px-5 py-2 text-right">{line.lineTotal === null ? "—" : formatEuro(line.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
