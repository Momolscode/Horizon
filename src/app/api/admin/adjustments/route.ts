import { NextResponse } from "next/server";
import { z } from "zod";
import { withTransaction } from "@/server/db";
import { adminRoute, audit } from "@/server/admin";
import { adminAdjust, ProgressionError } from "@/server/progression";

/** Correction d'XP ou de points, tracée (auteur, motif) et visible par l'utilisateur. */
export const POST = adminRoute(
  async ({ request, admin }) => {
    const parsed = z
      .object({
        pseudonym: z.string().min(2).max(32),
        kind: z.enum(["xp", "points"]),
        amount: z.number().int(),
        note: z.string().min(5).max(300),
        // Généré par le formulaire : un double envoi n'applique la correction qu'une fois.
        adjustmentId: z.uuid(),
      })
      .safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
    try {
      const entry = await withTransaction(async (c) => {
        const target = await c.query(`select id from public.profiles where lower(pseudonym) = lower($1)`, [parsed.data.pseudonym]);
        if (!target.rowCount) throw new ProgressionError("Pseudonyme introuvable.", 404);
        const userId = String(target.rows[0].id);
        const e = await adminAdjust(c, admin.id, userId, { kind: parsed.data.kind, amount: parsed.data.amount, note: parsed.data.note, adjustmentId: parsed.data.adjustmentId });
        await audit(c, admin.id, "progression.adjust", "profile", userId, { kind: parsed.data.kind, amount: parsed.data.amount, note: parsed.data.note });
        return e;
      });
      return NextResponse.json({ ok: true, entry });
    } catch (error) {
      if (error instanceof ProgressionError) return NextResponse.json({ error: "progression", message: error.message }, { status: error.status });
      throw error;
    }
  },
  { mutation: true },
);
