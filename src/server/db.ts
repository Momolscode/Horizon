import "server-only";
import { Pool, type PoolClient } from "pg";

/**
 * Accès PostgreSQL côté serveur (mode connecté). DATABASE_URL pointe vers la base
 * Supabase (pooler en mode transaction recommandé en serverless) ou toute base
 * PostgreSQL 15+ avec PostGIS. Jamais exposé au navigateur.
 */
let pool: Pool | null = null;

export function databaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function getPool(): Pool {
  if (!databaseConfigured()) throw new Error("DATABASE_URL absente");
  pool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 10_000,
  });
  return pool;
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
