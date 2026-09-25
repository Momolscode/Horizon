import { NextResponse } from "next/server";
import { getPool } from "@/server/db";
import { myContributions } from "@/server/contributions";
import { contributionErrorResponse, requireAccount } from "@/server/route-helpers";

/** Espace contributeur : mes propositions, mes revendications, les fiches que je gère. */
export async function GET(request: Request) {
  const user = await requireAccount(request);
  if (user instanceof Response) return user;
  const client = await getPool().connect();
  try {
    return NextResponse.json(await myContributions(client, user.id));
  } catch (error) {
    return contributionErrorResponse(error, "contributions");
  } finally {
    client.release();
  }
}
