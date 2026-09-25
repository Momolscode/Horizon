import "server-only";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { Catalog } from "@/modules/catalog/schema";
import { planLedgerAddition } from "@/modules/progression/engine";
import { MISSIONS, MISSION_TIMEZONE, planMissionClaim } from "@/modules/progression/missions";
import { loadSnapshot, ProgressionError } from "./progression";
import { loadActiveConfig } from "./config";

/**
 * Réclamation d'une mission, DANS une transaction : la progression est recalculée
 * à partir des données en base ; l'écriture est idempotente par période.
 */
export async function claimMission(client: PoolClient, userId: string, missionId: string, catalog: Catalog, now: Date = new Date()) {
  const locked = await client.query(`select id from public.profiles where id = $1 for update`, [userId]);
  if (locked.rowCount === 0) throw new ProgressionError("Profil introuvable.", 404);
  const disabled = await client.query(`select id from public.missions where id = $1 and not active`, [missionId]);
  if ((disabled.rowCount ?? 0) > 0) throw new ProgressionError("Mission désactivée.", 409);
  const snapshot = await loadSnapshot(client, userId);
  const excursions = await client.query(`select updated_at from public.excursions where user_id = $1`, [userId]);
  const inputs = { snapshot, catalog, excursionUpdates: excursions.rows.map((r) => new Date(r.updated_at).toISOString()) };
  const config = await loadActiveConfig(client);
  const entry = planMissionClaim(missionId, inputs, now, MISSION_TIMEZONE, randomUUID, MISSIONS, config.missionXp);
  const addition = planLedgerAddition(snapshot, [entry], catalog, randomUUID, now.toISOString());
  for (const e of addition.ledger) {
    await client.query(
      `insert into public.xp_ledger (id, user_id, kind, amount, reason, ref_id, unique_key, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict (user_id, unique_key) do nothing`,
      [e.id, userId, e.kind, e.amount, e.reason, e.refId, e.uniqueKey, e.createdAt],
    );
  }
  const [id, periodKey] = [missionId, entry.refId.slice(missionId.length + 1)];
  await client.query(`insert into public.mission_completions (user_id, mission_id, period_key) values ($1, $2, $3) on conflict do nothing`, [userId, id, periodKey]);
  for (const b of addition.badges) {
    await client.query(`insert into public.badges_awarded (user_id, badge_id, awarded_at) values ($1, $2, $3) on conflict do nothing`, [userId, b.id, b.awardedAt]);
  }
  return { xpGained: entry.amount, snapshot: await loadSnapshot(client, userId) };
}
