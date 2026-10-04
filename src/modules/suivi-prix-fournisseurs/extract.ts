import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { ExtractedInvoiceSchema, ExtractionError, type ExtractedInvoice } from "./invoice-draft";

export const SUPPORTED_MEDIA_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;
export type InvoiceMediaType = (typeof SUPPORTED_MEDIA_TYPES)[number];

export function isSupportedMediaType(type: string): type is InvoiceMediaType {
  return (SUPPORTED_MEDIA_TYPES as readonly string[]).includes(type);
}

export function hasClaudeCredentials(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

const SYSTEM_PROMPT = `Tu lis des factures de fournisseurs de restaurants (grossistes, bouchers, primeurs, crèmeries, boissons…) pour un outil qui suit l'évolution des prix d'achat. Ta lecture sert à comparer les prix d'une facture à l'autre : un chiffre mal lu crée une fausse alerte chez le restaurateur, donc la précision passe avant tout.

Règles de remplissage :
- supplier : le nom du fournisseur qui émet la facture (pas le restaurant qui la reçoit).
- invoice_date : la date d'émission, au format AAAA-MM-JJ. Sur les factures françaises, les dates s'écrivent JJ/MM/AAAA.
- invoice_number : le numéro de facture ou de bon de livraison, ou null.
- lines : uniquement les marchandises achetées. N'inclus pas les frais de livraison, consignes, emballages, remises globales, sous-totaux, lignes de TVA ni éco-participations.
- label : recopie le libellé exactement comme il est imprimé, sans le corriger ni le compléter. Il sert à reconnaître le même produit sur les factures suivantes.
- reference : le code article du fournisseur s'il est imprimé sur la ligne, sinon null.
- unit : l'unité dans laquelle le prix unitaire est exprimé (prix au kilo → "kg", au litre → "l", à la pièce → "piece", au colis → "colis", etc.). Si rien ne l'indique, "autre".
- quantity : la quantité facturée dans cette unité (pour un produit vendu au kilo, le poids net).
- unit_price_ht : le prix unitaire hors taxes, après la remise de la ligne s'il y en a une.
- line_total_ht : le montant hors taxes de la ligne tel qu'il est imprimé, ou null.
- total_ht : le total hors taxes de la facture, ou null s'il n'apparaît pas.
- doubts : une courte phrase pour chaque valeur que tu n'as pas pu lire avec certitude (photo floue, chiffre coupé, ligne raturée). Liste vide si tout est net. N'invente jamais une valeur illisible : signale-la ici.
- is_supplier_invoice : false si le document n'est ni une facture ni un bon de livraison chiffré d'un fournisseur ; remplis alors les autres champs avec des valeurs vides.`;

export async function extractInvoice(
  file: { data: Buffer; mediaType: InvoiceMediaType },
  client: Anthropic = new Anthropic(),
): Promise<ExtractedInvoice> {
  const data = file.data.toString("base64");
  const documentBlock: Anthropic.Beta.BetaContentBlockParam =
    file.mediaType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
      : { type: "image", source: { type: "base64", media_type: file.mediaType, data } };

  let response;
  try {
    response = await client.beta.messages.parse({
      model: process.env.CLAUDE_MODEL || "claude-opus-5-5",
      max_tokens: 16000,
      // Si la requête est refusée par un filtre de sécurité, l'API réessaie
      // automatiquement avec le modèle de secours recommandé.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(ExtractedInvoiceSchema) },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [documentBlock, { type: "text", text: "Lis cette facture et remplis les champs." }],
        },
      ],
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      throw new ExtractionError("Clé API Claude invalide : vérifiez ANTHROPIC_API_KEY.");
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new ExtractionError("Trop de factures d'un coup : réessayez dans une minute.");
    }
    if (error instanceof Anthropic.BadRequestError) {
      throw new ExtractionError(`Claude n'a pas accepté ce fichier (${error.message}).`);
    }
    if (error instanceof Anthropic.APIConnectionError) {
      throw new ExtractionError("Impossible de joindre Claude : vérifiez la connexion internet.");
    }
    if (error instanceof Anthropic.APIError) {
      throw new ExtractionError(`Claude est momentanément indisponible (erreur ${error.status}). Réessayez.`);
    }
    throw error;
  }

  if (response.stop_reason === "refusal") {
    throw new ExtractionError("Claude a refusé de lire ce document.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new ExtractionError("Facture trop longue pour être lue en une fois : découpez-la en plusieurs pages.");
  }
  if (!response.parsed_output) {
    throw new ExtractionError("La lecture de la facture a échoué. Réessayez avec une photo plus nette.");
  }
  return response.parsed_output;
}
