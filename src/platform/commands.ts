import { getDb } from "./db";

// Toute commande passe par runCommand : on garde une trace de ce qui a tourné,
// combien de temps, et l'erreur exacte si ça a échoué. C'est ce qui permet de
// savoir ce qui s'est passé chez un client quand il pose une question.

export type CommandContext = {
  organizationId: string;
  moduleId: string;
  command: string;
};

export type Execution = {
  id: string;
  module_id: string;
  command: string;
  status: "succes" | "erreur";
  summary: string | null;
  error: string | null;
  duration_ms: number;
  created_at: Date;
};

export async function runCommand<T>(
  ctx: CommandContext,
  fn: () => Promise<{ value: T; summary: string }>,
): Promise<T> {
  const db = await getDb();
  const startedAt = Date.now();
  try {
    const { value, summary } = await fn();
    await db.query(
      `insert into executions (organization_id, module_id, command, status, summary, duration_ms)
       values ($1, $2, $3, 'succes', $4, $5)`,
      [ctx.organizationId, ctx.moduleId, ctx.command, summary, Date.now() - startedAt],
    );
    return value;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.query(
      `insert into executions (organization_id, module_id, command, status, error, duration_ms)
       values ($1, $2, $3, 'erreur', $4, $5)`,
      [ctx.organizationId, ctx.moduleId, ctx.command, message, Date.now() - startedAt],
    );
    throw error;
  }
}

export async function listExecutions(organizationId: string, limit = 15): Promise<Execution[]> {
  const db = await getDb();
  return db.query<Execution>(
    `select id, module_id, command, status, summary, error, duration_ms, created_at
     from executions where organization_id = $1 order by created_at desc limit $2`,
    [organizationId, limit],
  );
}
