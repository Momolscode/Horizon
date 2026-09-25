import { NextResponse } from "next/server";
import { getPool } from "@/server/db";
import { adminRoute } from "@/server/admin";

export const GET = adminRoute(async () => {
  const res = await getPool().query(
    `select r.id, r.place_id, pl.name as place_name, r.rating, r.body, r.status, r.created_at, r.updated_at::text as version, pr.pseudonym,
            (select count(*) from public.review_reports rr where rr.review_id = r.id)::int as reports,
            exists (select 1 from public.place_claims pc where pc.user_id = r.user_id and pc.place_id = r.place_id and pc.status in ('approved', 'revoked')) as author_manages
       from public.reviews r join public.places pl on pl.id = r.place_id join public.profiles pr on pr.id = r.user_id
      where r.status = 'pending' or exists (select 1 from public.review_reports rr where rr.review_id = r.id)
      order by r.created_at asc limit 200`,
  );
  return NextResponse.json({ reviews: res.rows });
});
