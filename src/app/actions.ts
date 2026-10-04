"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/platform/auth";
import { isUuid } from "@/platform/db";
import { getModule } from "@/platform/modules";
import {
  createOrganization,
  deleteDemoOrganizations,
  deleteOrganization,
  getOrganization,
  setModuleInstalled,
} from "@/platform/organizations";
import { SESSION_COOKIE, sessionToken } from "@/platform/session";
import { buildDemoInvoices } from "@/modules/suivi-prix-fournisseurs/demo";
import { saveInvoice } from "@/modules/suivi-prix-fournisseurs/repository";

export type LoginState = { error?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const password = process.env.APP_PASSWORD;
  if (!password) redirect("/");
  if (String(formData.get("password") ?? "") !== password) {
    // Ralentit les essais en boucle pour deviner le mot de passe.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return { error: "Mot de passe incorrect." };
  }
  (await cookies()).set(SESSION_COOKIE, await sessionToken(password), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  redirect("/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/connexion");
}

export async function createClient(formData: FormData) {
  await requireAuth();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const contactEmail = String(formData.get("contactEmail") ?? "").trim() || null;
  const id = await createOrganization({ name, contactEmail });
  redirect(`/clients/${id}`);
}

/** Recrée le restaurant fictif de démonstration avec 12 semaines de factures. */
export async function loadDemo() {
  await requireAuth();
  await deleteDemoOrganizations();
  const id = await createOrganization({ name: "Le Bistrot d'Exemple", isDemo: true });
  for (const draft of buildDemoInvoices()) {
    await saveInvoice(id, draft, { source: "demo" });
  }
  redirect(`/clients/${id}`);
}

async function assertOrganization(organizationId: string) {
  await requireAuth();
  if (!isUuid(organizationId) || !(await getOrganization(organizationId))) {
    throw new Error("Client introuvable.");
  }
}

export async function deleteClient(organizationId: string) {
  await assertOrganization(organizationId);
  await deleteOrganization(organizationId);
  redirect("/");
}

export async function toggleModule(organizationId: string, moduleId: string, installed: boolean) {
  await assertOrganization(organizationId);
  if (getModule(moduleId)?.status !== "disponible") throw new Error("Automatisation indisponible.");
  await setModuleInstalled(organizationId, moduleId, installed);
  revalidatePath(`/clients/${organizationId}`);
}
