import type { ReactNode } from "react";
import { SupplierPricesPanel } from "./suivi-prix-fournisseurs/Panel";
import { supplierPricesSummary } from "./suivi-prix-fournisseurs/summary";

// Ce que chaque automatisation affiche, indexé par l'id du module :
// son écran sur la page d'un client, et une ligne de résumé dans la liste des clients.

export const MODULE_PANELS: Record<string, (props: { organizationId: string }) => Promise<ReactNode>> = {
  "suivi-prix-fournisseurs": SupplierPricesPanel,
};

export const MODULE_SUMMARIES: Record<string, (organizationId: string) => Promise<string>> = {
  "suivi-prix-fournisseurs": supplierPricesSummary,
};
