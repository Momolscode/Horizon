-- Avis déposés avant la revendication (docs/DECISIONS.md D-017, complément).
-- La validation d'une revendication retire les avis de l'établissement sur sa fiche (côté serveur).
-- La base empêche en plus qu'un tel avis revienne : l'auteur ne peut plus le modifier (ce qui
-- le renverrait en modération) et il n'apparaît jamais dans les avis publiés.

create or replace function public.check_review_eligibility() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' and not exists (select 1 from public.visits v where v.user_id = new.user_id and v.place_id = new.place_id) then
    raise exception 'Avis réservé aux personnes ayant déclaré une visite de ce lieu' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.place_claims c where c.user_id = new.user_id and c.place_id = new.place_id and c.status in ('approved', 'revoked')) then
    raise exception 'Un établissement ne peut pas noter une fiche qu''il gère ou a gérée' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger reviews_eligibility on public.reviews;
create trigger reviews_eligibility before insert or update on public.reviews for each row execute function public.check_review_eligibility();

-- Même signature : les droits d'exécution existants sont conservés.
create or replace function public.published_reviews(target_place text)
returns table (id uuid, place_id text, rating smallint, body text, created_at timestamptz, author text, mine boolean, after_visit boolean, reply_body text, reply_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id, r.place_id, r.rating, r.body, r.created_at, p.pseudonym, r.user_id = auth.uid(),
         exists (select 1 from public.visits v where v.user_id = r.user_id and v.place_id = r.place_id),
         rr.body, rr.moderated_at
  from public.reviews r
  join public.profiles p on p.id = r.user_id
  left join public.review_replies rr on rr.review_id = r.id and rr.status = 'published'
  where r.place_id = target_place and r.status = 'published'
    and not exists (select 1 from public.blocks b where b.blocker_id = auth.uid() and b.blocked_id = r.user_id)
    -- Jamais l'avis d'un établissement qui gère ou a géré la fiche, quel que soit son statut.
    and not exists (select 1 from public.place_claims c where c.user_id = r.user_id and c.place_id = r.place_id and c.status in ('approved', 'revoked'))
  order by r.created_at desc
  limit 50;
$$;
