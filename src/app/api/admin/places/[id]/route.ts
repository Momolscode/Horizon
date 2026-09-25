import { NextResponse } from "next/server";
import { z } from "zod";
import { withTransaction } from "@/server/db";
import { adminRoute, audit } from "@/server/admin";
import { invalidateCatalogCache } from "@/server/catalog";

const PlacePatch = z
  .object({
    status: z.enum(["draft", "published", "archived"]).optional(),
    name: z.string().min(1).max(120).optional(),
    summary: z.string().min(1).max(220).optional(),
    description: z.string().min(1).max(4000).optional(),
    verification: z
      .object({ status: z.enum(["verified", "unverified"]), checkedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), note: z.string().min(1).max(500) })
      .optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Aucune modification");

/** Édition encadrée d'un lieu : statut de publication, textes, vérification. Journalisée. */
export const PATCH = adminRoute<{ id: string }>(
  async ({ request, admin, params }) => {
    const parsed = PlacePatch.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
    const p = parsed.data;
    const updated = await withTransaction(async (c) => {
      const res = await c.query(
        `update public.places set
           status = coalesce($2, status), name = coalesce($3, name), summary = coalesce($4, summary),
           description = coalesce($5, description), verification = coalesce($6::jsonb, verification), updated_by = $7
         where id = $1 returning id`,
        [params.id, p.status ?? null, p.name ?? null, p.summary ?? null, p.description ?? null, p.verification ? JSON.stringify(p.verification) : null, admin.id],
      );
      if (res.rowCount) await audit(c, admin.id, "place.update", "place", params.id, { fields: Object.keys(p) });
      return res.rowCount;
    });
    if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });
    invalidateCatalogCache();
    return NextResponse.json({ ok: true });
  },
  { mutation: true },
);
