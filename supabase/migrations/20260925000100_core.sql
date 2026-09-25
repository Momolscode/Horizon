-- HORIZON — schéma principal (mode connecté)
-- Cible : Supabase (PostgreSQL 15+ avec PostGIS). Toutes les tables ont la RLS activée.
-- Principe : le navigateur ne peut écrire que ses propres données « de préparation »
-- (collections, excursions, profil). La progression (visites, parcelles, XP, badges)
-- n'est écrite que par le serveur (routes Next.js, connexion privilégiée).

create schema if not exists extensions;
create extension if not exists postgis with schema extensions;

-- ———————————————————————————————— Utilitaires ————————————————————————————————

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ———————————————————————————————— Administration ————————————————————————————————

create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

create or replace function public.is_admin(uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins a where a.user_id = uid);
$$;
revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to authenticated, service_role;

-- ———————————————————————————————— Profils ————————————————————————————————

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  pseudonym text not null check (char_length(pseudonym) between 2 and 32),
  visibility text not null default 'private' check (visibility in ('private', 'friends', 'public')),
  preferences jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  seen_place_ids text[] not null default '{}',
  -- Comptes de test exclus des mesures réelles.
  is_test boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_pseudonym_lower_key on public.profiles (lower(pseudonym));
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
alter table public.profiles enable row level security;

create policy "profil : lecture de son profil" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "profil : mise à jour de son profil" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- Colonnes non modifiables par le client.
revoke update on public.profiles from authenticated;
grant update (pseudonym, visibility, preferences, settings, seen_place_ids) on public.profiles to authenticated;
revoke insert, delete on public.profiles from authenticated, anon;

-- Création automatique du profil à l'inscription.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, pseudonym)
  values (new.id, 'explorateur-' || substr(replace(new.id::text, '-', ''), 1, 10))
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ———————————————————————————————— Catalogue ————————————————————————————————

create table public.sources (
  id text primary key,
  label text not null,
  kind text not null check (kind in ('editorial', 'open_data', 'official', 'partner', 'demo_fixture')),
  url text,
  license text not null,
  terms text not null,
  retrieved_at date
);

create table public.destinations (
  id text primary key check (id ~ '^[a-z0-9-]+$'),
  name text not null,
  region text not null,
  country_code char(2) not null,
  locale text not null,
  currency char(3) not null,
  timezone text not null,
  center extensions.geography(point, 4326) not null,
  center_source_id text not null references public.sources (id),
  bbox double precision[] not null check (array_length(bbox, 1) = 4),
  tagline text not null,
  description text not null,
  palette text not null,
  medal_title text not null,
  medal_place_ids text[] not null,
  published boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.places (
  id text primary key check (id ~ '^[a-z0-9-]+$'),
  destination_id text not null references public.destinations (id),
  name text not null,
  category text not null check (category in ('monument','museum','historic','religious','restaurant','market','hike','park','lake','beach','viewpoint','leisure')),
  themes text[] not null check (cardinality(themes) >= 1),
  setting text not null check (setting in ('indoor', 'outdoor', 'mixed')),
  location extensions.geography(point, 4326) not null,
  location_precision text not null check (location_precision in ('verified', 'approximate')),
  -- Parcelle H3 du lieu, calculée à l'import (h3-js) avec sa résolution.
  h3_cell text not null,
  h3_res smallint not null check (h3_res between 0 and 15),
  summary text not null check (char_length(summary) <= 220),
  description text not null,
  history text,
  lesser_known boolean not null default false,
  -- Valeurs pratiques au format Known<T> : {status: known|estimate|unknown, ...}.
  practical jsonb not null check (practical ? 'price' and practical ? 'openingHours' and practical ? 'visitMinutes'),
  restaurant jsonb,
  art jsonb not null,
  source_ids text[] not null check (cardinality(source_ids) >= 1),
  verification jsonb not null,
  fictional boolean not null default false,
  sponsored jsonb,
  status text not null default 'published' check (status in ('draft', 'published', 'archived')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
create index places_location_gix on public.places using gist (location);
create index places_destination_idx on public.places (destination_id) where status = 'published';
create index places_h3_idx on public.places (h3_cell);
create trigger places_updated_at before update on public.places for each row execute function public.set_updated_at();

alter table public.sources enable row level security;
alter table public.destinations enable row level security;
alter table public.places enable row level security;
-- Consultation sans compte : lecture publique du contenu publié uniquement.
create policy "sources : lecture publique" on public.sources for select to anon, authenticated using (true);
create policy "destinations : lecture publique" on public.destinations for select to anon, authenticated using (published);
create policy "lieux : lecture publique du publié" on public.places for select to anon, authenticated using (status = 'published');
revoke insert, update, delete on public.sources, public.destinations, public.places from anon, authenticated;

-- Requête cartographique : lieux publiés dans l'emprise visible, paginés.
create or replace function public.places_in_view(west double precision, south double precision, east double precision, north double precision, max_rows integer default 200, after_id text default null)
returns setof public.places
language sql stable security invoker set search_path = '' as $$
  select p.*
  from public.places p
  where p.status = 'published'
    and p.location operator(extensions.&&) extensions.st_makeenvelope(west, south, east, north, 4326)::extensions.geography
    and (after_id is null or p.id > after_id)
  order by p.id
  limit least(greatest(max_rows, 1), 500);
$$;
grant execute on function public.places_in_view(double precision, double precision, double precision, double precision, integer, text) to anon, authenticated;

-- ———————————————————————————————— Préparation : collections et excursions ————————————————————————————————

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index collections_user_idx on public.collections (user_id);
create unique index collections_one_default on public.collections (user_id) where is_default;

create table public.collection_items (
  collection_id uuid not null references public.collections (id) on delete cascade,
  place_id text not null references public.places (id),
  added_at timestamptz not null default now(),
  primary key (collection_id, place_id)
);

create or replace function public.enforce_collection_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.collections c where c.user_id = new.user_id) >= 30 then
    raise exception 'Nombre maximal de collections atteint (30)' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger collections_limit before insert on public.collections for each row execute function public.enforce_collection_limit();

alter table public.collections enable row level security;
alter table public.collection_items enable row level security;
create policy "collections : propriétaire" on public.collections for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "éléments : via collection possédée" on public.collection_items for all to authenticated
  using (exists (select 1 from public.collections c where c.id = collection_id and c.user_id = (select auth.uid())))
  with check (exists (select 1 from public.collections c where c.id = collection_id and c.user_id = (select auth.uid())));

create table public.excursions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  destination_id text not null references public.destinations (id),
  date date not null,
  start_time time not null,
  duration_minutes integer not null check (duration_minutes between 90 and 720),
  preferences jsonb not null,
  seed integer,
  origin text not null check (origin in ('surprise', 'manual', 'copy')),
  -- Étapes ordonnées : [{id, placeId, visitMinutes, note}], 12 au plus.
  steps jsonb not null default '[]'::jsonb check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) <= 12),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index excursions_user_idx on public.excursions (user_id, date);
create trigger excursions_updated_at before update on public.excursions for each row execute function public.set_updated_at();

-- Chaque étape doit référencer un lieu publié de la destination.
create or replace function public.validate_excursion_steps() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  step jsonb;
begin
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
  end loop;
  return new;
end;
$$;
create trigger excursions_validate before insert or update on public.excursions for each row execute function public.validate_excursion_steps();

alter table public.excursions enable row level security;
create policy "excursions : propriétaire" on public.excursions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ———————————————————————————————— Progression (écriture serveur uniquement) ————————————————————————————————

create table public.progression_settings (
  version integer primary key,
  parcel_resolution smallint not null,
  config jsonb not null,
  created_at timestamptz not null default now()
);

create table public.visits (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  place_id text not null references public.places (id),
  -- Les visites simulées n'existent qu'en démonstration : interdites ici.
  status text not null check (status in ('declared', 'proximity_checked')),
  visited_on date not null,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 100),
  -- Contrôle ponctuel : distance et précision uniquement, jamais les coordonnées.
  proximity jsonb,
  note text check (char_length(note) <= 2000),
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);
create index visits_user_place_idx on public.visits (user_id, place_id);

create table public.parcels (
  user_id uuid not null references auth.users (id) on delete cascade,
  cell text not null,
  resolution smallint not null check (resolution between 0 and 15),
  state text not null check (state in ('declared', 'checked')),
  place_id text not null references public.places (id),
  first_revealed_at timestamptz not null default now(),
  primary key (user_id, cell)
);

create table public.xp_ledger (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('xp', 'points')),
  amount integer not null,
  reason text not null check (reason in ('first_visit', 'proximity_bonus', 'new_parcel', 'level_reward', 'mission', 'admin_adjustment')),
  ref_id text not null,
  -- Une même récompense ne peut être créditée deux fois.
  unique_key text not null,
  created_at timestamptz not null default now(),
  -- Corrections administratives : auteur et motif obligatoires.
  created_by uuid references auth.users (id) on delete set null,
  note text,
  unique (user_id, unique_key),
  check (reason <> 'admin_adjustment' or (created_by is not null and note is not null))
);
create index xp_ledger_user_idx on public.xp_ledger (user_id);

create table public.badges_awarded (
  user_id uuid not null references auth.users (id) on delete cascade,
  badge_id text not null,
  awarded_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

alter table public.progression_settings enable row level security;
alter table public.visits enable row level security;
alter table public.parcels enable row level security;
alter table public.xp_ledger enable row level security;
alter table public.badges_awarded enable row level security;
create policy "barèmes : lecture" on public.progression_settings for select to anon, authenticated using (true);
create policy "visites : lecture des siennes" on public.visits for select to authenticated using (user_id = (select auth.uid()));
create policy "parcelles : lecture des siennes" on public.parcels for select to authenticated using (user_id = (select auth.uid()));
create policy "journal XP : lecture du sien" on public.xp_ledger for select to authenticated using (user_id = (select auth.uid()));
create policy "badges : lecture des siens" on public.badges_awarded for select to authenticated using (user_id = (select auth.uid()));
-- Aucune politique d'écriture : le client ne décide jamais de son XP ni de ses parcelles.
revoke insert, update, delete on public.visits, public.parcels, public.xp_ledger, public.badges_awarded, public.progression_settings from anon, authenticated;

-- ———————————————————————————————— Signalements et liste d'attente ————————————————————————————————

create table public.error_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  place_id text not null references public.places (id),
  kind text not null check (kind in ('location', 'hours', 'price', 'closed', 'description', 'other')),
  message text not null check (char_length(message) between 3 and 1000),
  status text not null default 'open' check (status in ('open', 'resolved', 'rejected')),
  created_at timestamptz not null default now(),
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz
);
alter table public.error_reports enable row level security;
create policy "signalements : création par l'auteur" on public.error_reports for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'open' and resolved_by is null);
create policy "signalements : lecture des siens" on public.error_reports for select to authenticated using (user_id = (select auth.uid()));
revoke update, delete on public.error_reports from anon, authenticated;

create table public.waitlist (
  email text primary key check (email = lower(email) and char_length(email) <= 254),
  consent_at timestamptz not null,
  source text not null default 'landing',
  -- Empreinte salée de l'IP (anti-abus), purgeable ; jamais l'IP en clair.
  ip_hash text,
  created_at timestamptz not null default now()
);
alter table public.waitlist enable row level security;
revoke all on public.waitlist from anon, authenticated;
