"use client";

import { useActionState, useState } from "react";
import { buttonClasses, inputClasses } from "@/components/ui";
import { formatEuro } from "@/lib/format";
import { correctInvoiceLine, type CorrectionState } from "./actions";
import { formatQuantity, UNIT_LABELS, UNITS } from "./normalize";
import type { InvoiceLine } from "./repository";

const decimal = (value: number) => String(value).replace(".", ",");

/** Une ligne de facture, avec un mode « Corriger » si Claude a mal lu un chiffre. */
export function InvoiceLineRow({
  organizationId,
  invoiceId,
  line,
}: {
  organizationId: string;
  invoiceId: string;
  line: InvoiceLine;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState<CorrectionState, FormData>(async (prev, formData) => {
    const result = await correctInvoiceLine(organizationId, invoiceId, line.id, prev, formData);
    if (result.saved) setEditing(false);
    return result;
  }, {});

  if (!editing) {
    return (
      <tr>
        <td className="px-5 py-2">
          <p className="text-slate-900">{line.label}</p>
          {line.reference && <p className="text-xs text-slate-500">Réf. {line.reference}</p>}
        </td>
        <td className="px-3 py-2 text-right">{formatQuantity(line.quantity, line.unit)}</td>
        <td className="px-3 py-2 text-right">
          {formatEuro(line.unitPrice)}/{UNIT_LABELS[line.unit]}
        </td>
        <td className="px-3 py-2 text-right">{line.lineTotal === null ? "—" : formatEuro(line.lineTotal)}</td>
        <td className="px-5 py-2 text-right">
          <button type="button" onClick={() => setEditing(true)} className="text-sm text-slate-500 underline hover:text-slate-900">
            Corriger
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="bg-slate-50">
      <td colSpan={5} className="px-5 py-3">
        <form action={formAction} className="grid gap-3 sm:grid-cols-6">
          <label className="text-xs text-slate-500 sm:col-span-3">
            Libellé
            <input name="label" defaultValue={line.label} required className={`${inputClasses} mt-1`} />
          </label>
          <label className="text-xs text-slate-500 sm:col-span-3">
            Référence (facultatif)
            <input name="reference" defaultValue={line.reference ?? ""} className={`${inputClasses} mt-1`} />
          </label>
          <label className="text-xs text-slate-500 sm:col-span-2">
            Quantité
            <input name="quantity" inputMode="decimal" defaultValue={decimal(line.quantity)} required className={`${inputClasses} mt-1`} />
          </label>
          <label className="text-xs text-slate-500 sm:col-span-2">
            Unité
            <select name="unit" defaultValue={line.unit} className={`${inputClasses} mt-1`}>
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {UNIT_LABELS[u]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-500 sm:col-span-2">
            Prix unitaire HT (€)
            <input name="unitPrice" inputMode="decimal" defaultValue={decimal(line.unitPrice)} required className={`${inputClasses} mt-1`} />
          </label>
          <div className="flex flex-wrap items-center gap-2 sm:col-span-6">
            <button type="submit" disabled={pending} className={buttonClasses.primary}>
              {pending ? "Enregistrement…" : "Enregistrer"}
            </button>
            <button type="button" onClick={() => setEditing(false)} className={buttonClasses.secondary}>
              Annuler
            </button>
            {state.error && <span className="text-sm text-red-600">{state.error}</span>}
          </div>
        </form>
      </td>
    </tr>
  );
}
