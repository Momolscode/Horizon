import { NextResponse } from "next/server";
import { getPool } from "@/server/db";
import { adminRoute } from "@/server/admin";
import { adminListClaims } from "@/server/contributions";

export const GET = adminRoute(async () => {
  const client = await getPool().connect();
  try {
    return NextResponse.json({ claims: await adminListClaims(client) });
  } finally {
    client.release();
  }
});
