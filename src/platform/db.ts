import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";
import { SCHEMA_SQL } from "./schema";

// Une seule interface pour deux bases :
// - en local, PGlite (un vrai Postgres qui tourne dans Node, stocké dans .data/) ;
// - en ligne, n'importe quel Postgres via DATABASE_URL (par exemple Supabase).
export type Db = {
  query<T>(text: string, params?: unknown[]): Promise<T[]>;
  exec(text: string): Promise<void>;
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
};

type PgliteLike = Pick<PGlite, "query" | "exec">;

function wrapPglite(pg: PgliteLike, root: PGlite): Db {
  return {
    async query<T>(text: string, params: unknown[] = []) {
      return (await pg.query<T>(text, params)).rows;
    },
    async exec(text: string) {
      await pg.exec(text);
    },
    transaction<T>(fn: (tx: Db) => Promise<T>) {
      return root.transaction((tx) => fn(wrapPglite(tx, root)));
    },
  };
}

type PostgresLike = Pick<postgres.Sql, "unsafe">;

function wrapPostgres(sql: PostgresLike, root: postgres.Sql): Db {
  return {
    async query<T>(text: string, params: unknown[] = []) {
      const rows = await sql.unsafe(text, params as postgres.ParameterOrJSON<never>[]);
      return rows as unknown as T[];
    },
    async exec(text: string) {
      await sql.unsafe(text);
    },
    async transaction<T>(fn: (tx: Db) => Promise<T>) {
      return (await root.begin((tx) => fn(wrapPostgres(tx, root)))) as T;
    },
  };
}

function createDb(): Db {
  const url = process.env.DATABASE_URL;
  if (url) {
    // prepare: false est nécessaire derrière le pooler de Supabase.
    const sql = postgres(url, { prepare: false, max: 5 });
    return wrapPostgres(sql, sql);
  }
  const pg = new PGlite(process.env.PGLITE_DIR ?? ".data/pglite");
  return wrapPglite(pg, pg);
}

// Gardé sur globalThis pour survivre aux rechargements à chaud de `next dev`.
const globalForDb = globalThis as unknown as { __db?: Promise<Db> };

export function getDb(): Promise<Db> {
  if (!globalForDb.__db) {
    globalForDb.__db = (async () => {
      const db = createDb();
      await db.exec(SCHEMA_SQL);
      return db;
    })().catch((error) => {
      globalForDb.__db = undefined;
      throw error;
    });
  }
  return globalForDb.__db;
}

/**
 * Vide toutes les tables (tests uniquement). On garde la même base : en démarrer
 * une neuve à chaque test prend 2 à 3 secondes.
 */
export async function resetDbForTests() {
  const db = await getDb();
  await db.exec(`truncate organizations, executions cascade`);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
