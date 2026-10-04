import type { ReactNode } from "react";
import { SupplierPricesPanel } from "./suivi-prix-fournisseurs/Panel";

// Écran de chaque automatisation sur la page d'un client, indexé par l'id du module.
export const MODULE_PANELS: Record<string, (props: { organizationId: string }) => Promise<ReactNode>> = {
  "suivi-prix-fournisseurs": SupplierPricesPanel,
};
