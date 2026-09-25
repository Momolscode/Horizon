import "server-only";
import type { Pool, PoolClient } from "pg";
import { DEFAULT_PROGRESSION_CONFIG, ProgressionConfigSchema, type ProgressionConfig } from "@/modules/progression/config";

type Queryable = Pick<Pool | PoolClient, "query">;

/** Version de barème active (la plus récente en base), validée ; défaut du code sinon. */
export async function loadActiveConfig(db: Queryable): Promise<ProgressionConfig> {
  const res = await db.query(`select version, config from public.progression_settings order by version desc limit 1`);
  const row = res.rows[0];
  if (!row) return DEFAULT_PROGRESSION_CONFIG;
  const parsed = ProgressionConfigSchema.safeParse({ ...row.config, version: row.version });
  return parsed.success ? parsed.data : DEFAULT_PROGRESSION_CONFIG;
}
