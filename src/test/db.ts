import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";

export const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 12 });

/** Crée un utilisateur Supabase (auth.users) ; le déclencheur crée son profil. */
export async function createUser(label = "u"): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
     values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb)`,
    [id, `${label}-${id.slice(0, 8)}@test.horizon.invalid`],
  );
  await pool.query(`update public.profiles set is_test = true where id = $1`, [id]);
  return id;
}

export async function deleteUsers(ids: string[]) {
  if (ids.length) await pool.query(`delete from auth.users where id = any($1::uuid[])`, [ids]);
}

/**
 * Exécute `fn` avec le rôle `authenticated` et les claims JWT de `userId`
 * (exactement comme PostgREST le fait pour une requête du navigateur), puis annule.
 */
export async function asUser<T>(userId: string | null, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (userId) {
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId, role: "authenticated" })]);
      await client.query("set local role authenticated");
    } else {
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role: "anon" })]);
      await client.query("set local role anon");
    }
    return await fn(client);
  } finally {
    await client.query("rollback").catch(() => undefined);
    client.release();
  }
}

/** Transaction privilégiée (connexion serveur), validée. */
export async function asServer<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Code d'erreur PostgreSQL d'une promesse rejetée. */
export async function pgErrorCode(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? "unknown";
  }
}
