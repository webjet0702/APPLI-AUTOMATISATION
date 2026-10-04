"use client";

import Link from "next/link";
import { startTransition, useActionState, useState, type FormEvent } from "react";
import { buttonClasses } from "@/components/ui";
import { shrinkImage } from "@/lib/shrink-image";
import { uploadInvoice, type UploadState } from "./actions";

const INITIAL_STATE: UploadState = { status: "idle" };

export function UploadInvoiceForm({ organizationId }: { organizationId: string }) {
  const [state, formAction, pending] = useActionState(uploadInvoice.bind(null, organizationId), INITIAL_STATE);
  const [preparing, setPreparing] = useState(false);
  const busy = pending || preparing;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = (form.elements.namedItem("file") as HTMLInputElement).files?.[0];
    const data = new FormData();
    if (file) {
      setPreparing(true);
      data.set("file", await shrinkImage(file));
      setPreparing(false);
    }
    startTransition(() => formAction(data));
    form.reset();
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="file"
          name="file"
          accept="application/pdf,image/*"
          required
          disabled={busy}
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
        />
        <button type="submit" disabled={busy} className={`${buttonClasses.primary} shrink-0`}>
          {busy ? "Lecture en cours…" : "Analyser la facture"}
        </button>
      </form>

      {busy && (
        <p className="mt-3 text-sm text-slate-500">
          Claude lit la facture ligne par ligne. Comptez 10 à 40 secondes.
        </p>
      )}

      {!busy && state.status === "error" && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.message}</p>
      )}

      {!busy && state.status === "ok" && (
        <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <p>
            {state.message}{" "}
            <Link href={`/clients/${organizationId}/factures/${state.invoiceId}`} className="font-medium underline">
              Vérifier la lecture
            </Link>
          </p>
          {state.warnings.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-800">
              {state.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
