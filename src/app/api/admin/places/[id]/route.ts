import { NextResponse } from "next/server";
import { z } from "zod";
import { withTransaction } from "@/server/db";
import { adminRoute } from "@/server/admin";
import { PlaceUpdateError, updatePlace } from "@/server/places-admin";
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
    try {
      await withTransaction((c) => updatePlace(c, admin.id, params.id, parsed.data));
    } catch (error) {
      if (error instanceof PlaceUpdateError) return NextResponse.json({ error: error.status === 404 ? "not_found" : "conflict", message: error.message }, { status: error.status });
      throw error;
    }
    invalidateCatalogCache();
    return NextResponse.json({ ok: true });
  },
  { mutation: true },
);
