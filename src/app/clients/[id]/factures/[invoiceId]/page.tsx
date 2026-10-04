import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ConfirmButton, SubmitButton } from "@/components/buttons";
import { Badge, Card, CardTitle } from "@/components/ui";
import { formatDate, formatEuro } from "@/lib/format";
import { removeInvoice, verifyInvoice } from "@/modules/suivi-prix-fournisseurs/actions";
import { InvoiceLineRow } from "@/modules/suivi-prix-fournisseurs/InvoiceLineRow";
import { getInvoice, reviewPoints } from "@/modules/suivi-prix-fournisseurs/repository";
import { isUuid } from "@/platform/db";

export default async function InvoicePage(props: PageProps<"/clients/[id]/factures/[invoiceId]">) {
  await connection();
  const { id, invoiceId } = await props.params;
  if (!isUuid(id) || !isUuid(invoiceId)) notFound();
  const invoice = await getInvoice(id, invoiceId);
  if (!invoice) notFound();
  const toReview = reviewPoints(invoice);

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

      {toReview.length > 0 && !invoice.verified && (
        <Card tone="amber">
          <CardTitle hint="Comparez avec la facture papier et corrigez les lignes fausses avec « Corriger ». Une fois relue, marquez-la comme vérifiée.">
            Points à vérifier
          </CardTitle>
          <ul className="mb-4 list-disc space-y-1 pl-5 text-sm text-amber-900">
            {toReview.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <form action={verifyInvoice.bind(null, id, invoiceId)}>
            <SubmitButton variant="secondary" pendingLabel="Enregistrement…">
              J&apos;ai vérifié cette facture
            </SubmitButton>
          </form>
        </Card>
      )}

      <Card>
        <CardTitle hint="Ce que Claude a lu. Les grammes et centilitres sont convertis en kg et en litres. Un chiffre faux ? Cliquez sur « Corriger ».">
          Lignes de la facture {invoice.source === "demo" && <Badge tone="blue">Démo</Badge>}{" "}
          {invoice.verified && <Badge tone="green">Vérifiée</Badge>}
        </CardTitle>
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-slate-500 uppercase">
              <tr className="border-b border-slate-100">
                <th className="px-5 py-2 font-medium">Produit</th>
                <th className="px-3 py-2 text-right font-medium">Quantité</th>
                <th className="px-3 py-2 text-right font-medium">Prix unitaire HT</th>
                <th className="px-3 py-2 text-right font-medium">Montant HT</th>
                <th className="px-5 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {invoice.lines.map((line) => (
                <InvoiceLineRow key={line.id} organizationId={id} invoiceId={invoiceId} line={line} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
