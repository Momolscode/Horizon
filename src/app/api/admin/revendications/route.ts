import { NextResponse } from "next/server";
import { getPool } from "@/server/db";
import { adminRoute } from "@/server/admin";
import { adminListClaims, adminListManagers } from "@/server/contributions";

/** Demandes en attente et fiches actuellement gérées par un établissement validé. */
export const GET = adminRoute(async () => {
  const client = await getPool().connect();
  try {
    return NextResponse.json({ claims: await adminListClaims(client), managers: await adminListManagers(client) });
  } finally {
    client.release();
  }
});
