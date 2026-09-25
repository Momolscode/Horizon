-- HORIZON — durcissement issu de la revue de sécurité (2026-09-25).
-- Principe : aucun privilège implicite. Supabase accorde par défaut ALL aux rôles
-- anon/authenticated sur les tables et EXECUTE sur les fonctions du schéma public ;
-- on retire tout puis on accorde explicitement, colonne par colonne si nécessaire.

-- ———————————————————————————————— 1. Privilèges par défaut ————————————————————————————————

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from anon, authenticated, public;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated, public;
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated, public;

-- ———————————————————————————————— 2. Catalogue public (sans updated_by) ————————————————————————————————

grant select on public.sources, public.destinations, public.progression_settings, public.missions to anon, authenticated;
grant select (id, destination_id, name, category, themes, setting, location, location_precision, h3_cell, h3_res, summary, description,
              history, lesser_known, practical, restaurant, art, source_ids, verification, fictional, sponsored, status, updated_at)
  on public.places to anon, authenticated;

drop function if exists public.places_in_view(double precision, double precision, double precision, double precision, integer, text);
create function public.places_in_view(west double precision, south double precision, east double precision, north double precision, max_rows integer default 200, after_id text default null)
returns table (id text, destination_id text, name text, category text, lat double precision, lng double precision, h3_cell text)
language sql stable security invoker set search_path = '' as $$
  select p.id, p.destination_id, p.name, p.category,
         extensions.st_y(p.location::extensions.geometry), extensions.st_x(p.location::extensions.geometry), p.h3_cell
  from public.places p
  where p.status = 'published'
    and p.location operator(extensions.&&) extensions.st_makeenvelope(west, south, east, north, 4326)::extensions.geography
    and (after_id is null or p.id > after_id)
  order by p.id
  limit least(greatest(max_rows, 1), 500);
$$;
grant execute on function public.places_in_view(double precision, double precision, double precision, double precision, integer, text) to anon, authenticated;

-- ———————————————————————————————— 3. Données de préparation (colonnes explicites) ————————————————————————————————

grant select on public.profiles to authenticated;
grant update (pseudonym, visibility, preferences, settings, seen_place_ids, analytics_consent) on public.profiles to authenticated;
alter table public.profiles
  add constraint profiles_preferences_size check (pg_column_size(preferences) < 8192),
  add constraint profiles_settings_size check (pg_column_size(settings) < 8192),
  add constraint profiles_seen_limit check (cardinality(seen_place_ids) <= 500);

grant select, delete on public.collections to authenticated;
grant insert (name, is_default), update (name) on public.collections to authenticated;
grant select, delete on public.collection_items to authenticated;
grant insert (collection_id, place_id) on public.collection_items to authenticated;

grant select, delete on public.excursions to authenticated;
grant insert (id, title, destination_id, date, start_time, duration_minutes, preferences, seed, origin, steps) on public.excursions to authenticated;
grant update (title, destination_id, date, start_time, duration_minutes, preferences, seed, origin, steps) on public.excursions to authenticated;
alter table public.excursions add constraint excursions_preferences_size check (pg_column_size(preferences) < 4096);

-- Limite de collections : verrou consultatif pour éviter la course entre insertions simultanées.
create or replace function public.enforce_collection_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('collections:' || new.user_id::text));
  if (select count(*) from public.collections c where c.user_id = new.user_id) >= 30 then
    raise exception 'Nombre maximal de collections atteint (30)' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- Plafond d'excursions et validation renforcée des étapes (destination publiée, notes bornées).
create or replace function public.validate_excursion_steps() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  step jsonb;
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtext('excursions:' || new.user_id::text));
    if (select count(*) from public.excursions e where e.user_id = new.user_id) >= 200 then
      raise exception 'Nombre maximal d''excursions atteint (200)' using errcode = 'check_violation';
    end if;
  end if;
  if not exists (select 1 from public.destinations d where d.id = new.destination_id and d.published) then
    raise exception 'Destination inconnue' using errcode = 'check_violation';
  end if;
  for step in select * from jsonb_array_elements(new.steps) loop
    if not exists (
      select 1 from public.places p
      where p.id = step ->> 'placeId' and p.destination_id = new.destination_id and p.status = 'published'
    ) then
      raise exception 'Étape invalide : lieu % inconnu pour la destination %', step ->> 'placeId', new.destination_id using errcode = 'check_violation';
    end if;
    if coalesce((step ->> 'visitMinutes')::int, 0) not between 10 and 600 then
      raise exception 'Durée d''étape invalide' using errcode = 'check_violation';
    end if;
    if char_length(coalesce(step ->> 'note', '')) > 500 or char_length(coalesce(step ->> 'id', '')) > 64 then
      raise exception 'Étape trop longue' using errcode = 'check_violation';
    end if;
  end loop;
  return new;
end;
$$;

-- Toute référence client à un lieu doit viser un lieu publié (pas d'oracle sur les brouillons).
create or replace function public.require_published_place() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.places p where p.id = new.place_id and p.status = 'published') then
    raise exception 'Lieu inconnu' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger collection_items_published before insert on public.collection_items for each row execute function public.require_published_place();
create trigger error_reports_published before insert on public.error_reports for each row execute function public.require_published_place();
create trigger reviews_published before insert on public.reviews for each row execute function public.require_published_place();

-- ———————————————————————————————— 4. Progression : lecture seule côté client ————————————————————————————————

grant select on public.visits, public.parcels, public.xp_ledger, public.badges_awarded, public.mission_completions to authenticated;

-- Traçabilité : l'auteur d'une correction reste connu même si son compte est supprimé.
alter table public.xp_ledger drop constraint if exists xp_ledger_created_by_fkey;
alter table public.admin_audit_log drop constraint if exists admin_audit_log_admin_id_fkey;

-- ———————————————————————————————— 5. Signalements, avis, social ————————————————————————————————

grant select on public.error_reports to authenticated;
grant insert (place_id, kind, message) on public.error_reports to authenticated;
create or replace function public.limit_error_reports() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.error_reports r where r.user_id = new.user_id and r.created_at > now() - interval '1 day') >= 20 then
    raise exception 'Trop de signalements aujourd''hui' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger error_reports_daily_limit before insert on public.error_reports for each row execute function public.limit_error_reports();

-- Avis : lecture directe limitée à ses propres avis ; les avis publiés passent par la fonction
-- published_reviews (sans identifiant d'utilisateur).
drop policy if exists "avis : lecture des publiés" on public.reviews;
grant select on public.reviews to authenticated;
grant insert (place_id, rating, body) on public.reviews to authenticated;
grant update (rating, body, status) on public.reviews to authenticated;
grant delete on public.reviews to authenticated;
grant select on public.review_reports to authenticated;
grant insert (review_id, reason) on public.review_reports to authenticated;

grant select on public.excursion_shares, public.friendships, public.blocks to authenticated;

-- Fonctions : seules celles destinées aux clients restent exécutables.
revoke execute on function public.is_admin(uuid) from anon, authenticated, public;
revoke execute on function public.are_friends(uuid, uuid) from anon, authenticated, public;
revoke execute on function public.friend_summaries() from anon, public;
grant execute on function public.friend_summaries() to authenticated;
grant execute on function public.published_reviews(text) to anon, authenticated;

-- ———————————————————————————————— 6. Rôle serveur ————————————————————————————————
-- Le serveur se connecte avec le rôle propriétaire (postgres) via DATABASE_URL.
-- service_role conserve ses droits Supabase (non utilisé par l'application).
