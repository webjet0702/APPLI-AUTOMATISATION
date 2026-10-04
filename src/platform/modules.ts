// Catalogue des automatisations. Chaque automatisation (« module ») expose des
// commandes précises. Pour en ajouter une : une entrée ici, un dossier dans
// src/modules/<id>/ et son panneau dans src/modules/panels.tsx.

export type ModuleCommand = {
  id: string;
  label: string;
  description: string;
};

export type ModuleDefinition = {
  id: string;
  name: string;
  pitch: string;
  status: "disponible" | "bientot";
  commands: ModuleCommand[];
};

export const MODULES: ModuleDefinition[] = [
  {
    id: "suivi-prix-fournisseurs",
    name: "Suivi des prix fournisseurs",
    pitch:
      "Lit les factures des fournisseurs et prévient dès qu'un prix augmente, avec le surcoût estimé en euros.",
    status: "disponible",
    commands: [
      {
        id: "analyser-facture",
        label: "Analyser une facture",
        description: "Claude lit la facture (PDF ou photo) et enregistre chaque ligne de produit.",
      },
      {
        id: "rapport",
        label: "Rapport pour le client",
        description: "Résumé des hausses et baisses, prêt à envoyer par email ou WhatsApp.",
      },
    ],
  },
  {
    id: "avis-google",
    name: "Réponses aux avis Google",
    pitch: "Rédige une réponse à chaque nouvel avis, dans le ton du restaurant, validée en un clic.",
    status: "bientot",
    commands: [],
  },
  {
    id: "post-plat-du-jour",
    name: "Post du plat du jour",
    pitch: "Une photo du plat envoyée le matin devient un post Instagram et Facebook.",
    status: "bientot",
    commands: [],
  },
];

export function getModule(id: string): ModuleDefinition | undefined {
  return MODULES.find((m) => m.id === id);
}
