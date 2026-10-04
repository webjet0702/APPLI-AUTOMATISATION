import { getDb } from "./db";
import { MODULES } from "./modules";

export type Organization = {
  id: string;
  name: string;
  contact_email: string | null;
  is_demo: boolean;
  created_at: Date;
};

export async function createOrganization(input: {
  name: string;
  contactEmail?: string | null;
  isDemo?: boolean;
}): Promise<string> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [org] = await tx.query<{ id: string }>(
      `insert into organizations (name, contact_email, is_demo) values ($1, $2, $3) returning id`,
      [input.name, input.contactEmail || null, input.isDemo ?? false],
    );
    // Les automatisations disponibles sont activées par défaut.
    for (const mod of MODULES.filter((m) => m.status === "disponible")) {
      await tx.query(
        `insert into installations (organization_id, module_id) values ($1, $2) on conflict do nothing`,
        [org.id, mod.id],
      );
    }
    return org.id;
  });
}

export async function listOrganizations(): Promise<Organization[]> {
  const db = await getDb();
  return db.query<Organization>(
    `select id, name, contact_email, is_demo, created_at from organizations order by created_at desc`,
  );
}

export async function getOrganization(id: string): Promise<Organization | null> {
  const db = await getDb();
  const [org] = await db.query<Organization>(
    `select id, name, contact_email, is_demo, created_at from organizations where id = $1`,
    [id],
  );
  return org ?? null;
}

export async function deleteOrganization(id: string): Promise<void> {
  const db = await getDb();
  await db.query(`delete from organizations where id = $1`, [id]);
}

export async function deleteDemoOrganizations(): Promise<void> {
  const db = await getDb();
  await db.query(`delete from organizations where is_demo`);
}

export async function listInstalledModules(organizationId: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db.query<{ module_id: string }>(
    `select module_id from installations where organization_id = $1 order by enabled_at`,
    [organizationId],
  );
  return rows.map((r) => r.module_id);
}

export async function setModuleInstalled(
  organizationId: string,
  moduleId: string,
  installed: boolean,
): Promise<void> {
  const db = await getDb();
  if (installed) {
    await db.query(
      `insert into installations (organization_id, module_id) values ($1, $2) on conflict do nothing`,
      [organizationId, moduleId],
    );
  } else {
    await db.query(`delete from installations where organization_id = $1 and module_id = $2`, [
      organizationId,
      moduleId,
    ]);
  }
}
