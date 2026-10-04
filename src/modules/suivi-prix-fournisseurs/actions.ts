"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { formatDate } from "@/lib/format";
import { requireAuth } from "@/platform/auth";
import { runCommand } from "@/platform/commands";
import { isUuid } from "@/platform/db";
import { listInstalledModules } from "@/platform/organizations";
import { extractInvoice, hasClaudeCredentials, isSupportedMediaType } from "./extract";
import { ExtractionError, toInvoiceDraft } from "./invoice-draft";
import { deleteInvoice, DuplicateInvoiceError, saveInvoice } from "./repository";

const MODULE_ID = "suivi-prix-fournisseurs";
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export type UploadState =
  | { status: "idle" }
  | { status: "ok"; message: string; warnings: string[]; invoiceId: string }
  | { status: "error"; message: string };

export async function uploadInvoice(
  organizationId: string,
  _prev: UploadState,
  formData: FormData,
): Promise<UploadState> {
  await requireAuth();
  if (!isUuid(organizationId) || !(await listInstalledModules(organizationId)).includes(MODULE_ID)) {
    return { status: "error", message: "Cette automatisation n'est pas activée pour ce client." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "Choisissez d'abord une facture (PDF ou photo)." };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { status: "error", message: "Fichier trop lourd (10 Mo maximum)." };
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
    const { invoiceId, draft } = await runCommand(
      { organizationId, moduleId: MODULE_ID, command: "analyser-facture" },
      async () => {
        const extracted = await extractInvoice({ data: Buffer.from(await file.arrayBuffer()), mediaType });
        const draft = toInvoiceDraft(extracted);
        const invoiceId = await saveInvoice(organizationId, draft, { fileName: file.name });
        return {
          value: { invoiceId, draft },
          summary: `${draft.supplier}, facture du ${formatDate(draft.invoiceDate)} : ${draft.lines.length} produit(s)`,
        };
      },
    );
    return {
      status: "ok",
      message: `Facture ${draft.supplier} du ${formatDate(draft.invoiceDate)} lue : ${draft.lines.length} produit(s) enregistré(s).`,
      warnings: draft.warnings,
      invoiceId,
    };
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

export async function removeInvoice(organizationId: string, invoiceId: string) {
  await requireAuth();
  if (!isUuid(organizationId) || !isUuid(invoiceId)) throw new Error("Facture introuvable.");
  await deleteInvoice(organizationId, invoiceId);
  revalidatePath(`/clients/${organizationId}`);
  redirect(`/clients/${organizationId}`);
}
