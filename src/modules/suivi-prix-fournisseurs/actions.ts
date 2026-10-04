"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { formatDate, parseDecimal } from "@/lib/format";
import { requireAuth } from "@/platform/auth";
import { runCommand } from "@/platform/commands";
import { isUuid } from "@/platform/db";
import { listInstalledModules } from "@/platform/organizations";
import { extractInvoice, hasClaudeCredentials, isSupportedMediaType } from "./extract";
import { ExtractionError, toInvoiceDraft } from "./invoice-draft";
import { MAX_UPLOAD_BYTES } from "./limits";
import { isUnit } from "./normalize";
import {
  deleteInvoice,
  DuplicateInvoiceError,
  getInvoice,
  markInvoiceVerified,
  reviewPoints,
  saveInvoice,
  updateInvoiceLine,
} from "./repository";

const MODULE_ID = "suivi-prix-fournisseurs";

export type UploadResult =
  | { status: "ok"; message: string; warnings: string[]; invoiceId: string }
  | { status: "error"; message: string };

/** Lit une facture (un fichier) et l'enregistre. Appelé une fois par fichier envoyé. */
export async function uploadInvoice(organizationId: string, formData: FormData): Promise<UploadResult> {
  await requireAuth();
  if (!isUuid(organizationId) || !(await listInstalledModules(organizationId)).includes(MODULE_ID)) {
    return { status: "error", message: "Cette automatisation n'est pas activée pour ce client." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "Fichier vide ou illisible." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { status: "error", message: "Fichier trop lourd (4 Mo maximum) : compressez le PDF ou envoyez une photo." };
  }
  const mediaType = file.type;
  if (!isSupportedMediaType(mediaType)) {
    return { status: "error", message: "Format non pris en charge : envoyez un PDF ou une photo (JPEG, PNG)." };
  }
  if (!hasClaudeCredentials()) {
    return {
      status: "error",
      message:
        "La lecture automatique n'est pas encore branchée : ajoutez ANTHROPIC_API_KEY dans .env.local (voir le README). En attendant, la démo montre le résultat.",
    };
  }

  try {
    const { result, draft } = await runCommand(
      { organizationId, moduleId: MODULE_ID, command: "analyser-facture" },
      async () => {
        const extracted = await extractInvoice({ data: Buffer.from(await file.arrayBuffer()), mediaType });
        const draft = toInvoiceDraft(extracted);
        const result = await saveInvoice(organizationId, draft, { fileName: file.name });
        const what = result.appended ? "page ajoutée" : "facture";
        return {
          value: { result, draft },
          summary: `${draft.supplier}, ${what} du ${formatDate(draft.invoiceDate)} : ${draft.lines.length} produit(s)`,
        };
      },
    );
    const message = result.appended
      ? `Page ajoutée à la facture n° ${draft.invoiceNumber} de ${draft.supplier} : ${draft.lines.length} produit(s) en plus.`
      : `Facture ${draft.supplier} du ${formatDate(draft.invoiceDate)} lue : ${draft.lines.length} produit(s) enregistré(s).`;
    const saved = await getInvoice(organizationId, result.invoiceId);
    return { status: "ok", message, warnings: saved ? reviewPoints(saved) : draft.warnings, invoiceId: result.invoiceId };
  } catch (error) {
    if (error instanceof ExtractionError || error instanceof DuplicateInvoiceError) {
      return { status: "error", message: error.message };
    }
    console.error(error);
    return {
      status: "error",
      message: "Erreur inattendue pendant la lecture. Le détail est dans l'historique des commandes.",
    };
  } finally {
    revalidatePath(`/clients/${organizationId}`);
  }
}

export type CorrectionState = { error?: string; saved?: boolean };

export async function correctInvoiceLine(
  organizationId: string,
  invoiceId: string,
  lineId: string,
  _prev: CorrectionState,
  formData: FormData,
): Promise<CorrectionState> {
  await requireAuth();
  if (!isUuid(organizationId) || !isUuid(invoiceId) || !isUuid(lineId)) return { error: "Ligne introuvable." };

  const label = String(formData.get("label") ?? "").trim();
  const reference = String(formData.get("reference") ?? "").trim() || null;
  const unit = String(formData.get("unit") ?? "");
  const quantity = parseDecimal(String(formData.get("quantity") ?? ""));
  const unitPrice = parseDecimal(String(formData.get("unitPrice") ?? ""));

  if (!label) return { error: "Le libellé est obligatoire." };
  if (!isUnit(unit)) return { error: "Unité inconnue." };
  if (quantity === null || quantity <= 0) return { error: "Quantité invalide (exemple : 2,5)." };
  if (unitPrice === null || unitPrice <= 0) return { error: "Prix invalide (exemple : 12,40)." };

  const ok = await updateInvoiceLine(organizationId, invoiceId, lineId, { label, reference, unit, quantity, unitPrice });
  if (!ok) return { error: "Ligne introuvable." };
  revalidatePath(`/clients/${organizationId}`);
  revalidatePath(`/clients/${organizationId}/factures/${invoiceId}`);
  return { saved: true };
}

export async function verifyInvoice(organizationId: string, invoiceId: string) {
  await requireAuth();
  if (!isUuid(organizationId) || !isUuid(invoiceId)) throw new Error("Facture introuvable.");
  await markInvoiceVerified(organizationId, invoiceId);
  revalidatePath(`/clients/${organizationId}`);
  revalidatePath(`/clients/${organizationId}/factures/${invoiceId}`);
}

export async function removeInvoice(organizationId: string, invoiceId: string) {
  await requireAuth();
  if (!isUuid(organizationId) || !isUuid(invoiceId)) throw new Error("Facture introuvable.");
  await deleteInvoice(organizationId, invoiceId);
  revalidatePath(`/clients/${organizationId}`);
  redirect(`/clients/${organizationId}`);
}
