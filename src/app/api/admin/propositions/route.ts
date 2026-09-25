import { NextResponse } from "next/server";
import { getPool } from "@/server/db";
import { adminRoute } from "@/server/admin";
import { adminListProposals } from "@/server/contributions";

export const GET = adminRoute(async () => {
  const client = await getPool().connect();
  try {
    return NextResponse.json({ proposals: await adminListProposals(client) });
  } finally {
    client.release();
  }
});
