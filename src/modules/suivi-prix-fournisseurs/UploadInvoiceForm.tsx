"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { buttonClasses } from "@/components/ui";
import { shrinkImage } from "@/lib/shrink-image";
import { uploadInvoice, type UploadResult } from "./actions";
import { MAX_UPLOAD_BYTES } from "./limits";

type Item = { name: string } & ({ status: "attente" | "en-cours" } | UploadResult);

export function UploadInvoiceForm({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<File[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [running, setRunning] = useState(false);

  function setItem(index: number, item: Item) {
    setItems((current) => current.map((it, i) => (i === index ? item : it)));
  }

  // Les factures sont lues une par une : chaque lecture prend 10 à 40 secondes,
  // et on voit l'avancement fichier par fichier.
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const files = selected;
    if (files.length === 0) return;
    setRunning(true);
    setItems(files.map((f) => ({ name: f.name, status: "attente" })));

    for (const [index, file] of files.entries()) {
      setItem(index, { name: file.name, status: "en-cours" });
      const prepared = await shrinkImage(file);
      if (prepared.size > MAX_UPLOAD_BYTES) {
        setItem(index, {
          name: file.name,
          status: "error",
          message: "Fichier trop lourd (4 Mo maximum) : compressez le PDF ou envoyez une photo.",
        });
        continue;
      }
      const data = new FormData();
      data.set("file", prepared);
      try {
        setItem(index, { name: file.name, ...(await uploadInvoice(organizationId, data)) });
      } catch {
        setItem(index, { name: file.name, status: "error", message: "Connexion perdue pendant l'envoi : réessayez." });
      }
      router.refresh();
    }

    setRunning(false);
    setSelected([]);
    if (inputRef.current) inputRef.current.value = "";
  }

  const done = items.filter((i) => i.status === "ok" || i.status === "error").length;

  return (
    <div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className={`${buttonClasses.secondary} cursor-pointer ${running ? "pointer-events-none opacity-60" : ""}`}>
          <input
            ref={inputRef}
            type="file"
            name="file"
            accept="application/pdf,image/*"
            multiple
            disabled={running}
            className="sr-only"
            onChange={(e) => setSelected(Array.from(e.target.files ?? []))}
          />
          Choisir des factures
        </label>
        <span className="flex-1 text-sm text-slate-500">
          {selected.length === 0
            ? "PDF ou photos, une ou plusieurs à la fois"
            : selected.length === 1
              ? selected[0].name
              : `${selected.length} fichiers choisis`}
        </span>
        <button type="submit" disabled={running || selected.length === 0} className={`${buttonClasses.primary} shrink-0`}>
          {running ? `Lecture ${Math.min(done + 1, items.length)} / ${items.length}…` : "Analyser"}
        </button>
      </form>

      {running && (
        <p className="mt-3 text-sm text-slate-500">
          Claude lit chaque facture ligne par ligne : comptez 10 à 40 secondes par fichier. Gardez la page ouverte.
        </p>
      )}

      {items.length > 0 && (
        <ul className="mt-3 space-y-2">
          {items.map((item, index) => (
            <li key={index} className="rounded-lg border border-slate-100 px-3 py-2 text-sm">
              <div className="flex items-start gap-2">
                <span aria-hidden className="w-4 shrink-0">
                  {item.status === "ok" ? "✓" : item.status === "error" ? "✗" : item.status === "en-cours" ? "…" : "·"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-slate-500">{item.name}</p>
                  {item.status === "en-cours" && <p className="text-slate-700">Lecture en cours…</p>}
                  {item.status === "error" && <p className="text-red-700">{item.message}</p>}
                  {item.status === "ok" && (
                    <>
                      <p className="text-emerald-800">
                        {item.message}{" "}
                        <Link
                          href={`/clients/${organizationId}/factures/${item.invoiceId}`}
                          className="font-medium underline"
                        >
                          Vérifier
                        </Link>
                      </p>
                      {item.warnings.length > 0 && (
                        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-amber-800">
                          {item.warnings.map((w) => (
                            <li key={w}>{w}</li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
