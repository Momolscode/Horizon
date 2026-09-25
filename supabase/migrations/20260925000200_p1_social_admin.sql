-- HORIZON — P1 : partage, amis, avis modérés, missions, administration, mesure.

-- ———————————————————————————————— Partage d'excursion (lecture seule, révocable) ————————————————————————————————

create table public.excursion_shares (
  token text primary key check (char_length(token) >= 32),
  excursion_id uuid not null references public.excursions (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- La date prévue n'est montrée que si le propriétaire le choisit.
  include_date boolean not null default false,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index excursion_shares_excursion_idx on public.excursion_shares (excursion_id);
alter table public.excursion_shares enable row level security;
create policy "partages : lecture des siens" on public.excursion_shares for select to authenticated using (owner_id = (select auth.uid()));
-- Création et révocation passent par le serveur (jeton aléatoire généré côté serveur).
revoke insert, update, delete on public.excursion_shares from anon, authenticated;

-- ———————————————————————————————— Amis et blocages ————————————————————————————————

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users (id) on delete cascade,
  addressee_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> addressee_id)
);
-- Une seule relation par paire, quel que soit le sens.
create unique index friendships_pair_key on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

create table public.blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

alter table public.friendships enable row level security;
alter table public.blocks enable row level security;
create policy "amitiés : parties concernées" on public.friendships for select to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));
create policy "blocages : les siens" on public.blocks for select to authenticated using (blocker_id = (select auth.uid()));
revoke insert, update, delete on public.friendships, public.blocks from anon, authenticated;

create or replace function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and least(f.requester_id, f.addressee_id) = least(a, b)
      and greatest(f.requester_id, f.addressee_id) = greatest(a, b)
  )
  and not exists (select 1 from public.blocks bl where (bl.blocker_id = a and bl.blocked_id = b) or (bl.blocker_id = b and bl.blocked_id = a));
$$;
revoke all on function public.are_friends(uuid, uuid) from public;

-- Résumé des amis, uniquement pour ceux qui partagent leur profil (amis ou public).
create or replace function public.friend_summaries()
returns table (friend_id uuid, pseudonym text, xp integer, places_visited integer, parcels integer, since timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id,
         p.pseudonym,
         coalesce((select sum(x.amount) from public.xp_ledger x where x.user_id = p.id and x.kind = 'xp'), 0)::int,
         (select count(distinct v.place_id) from public.visits v where v.user_id = p.id)::int,
         (select count(*) from public.parcels pa where pa.user_id = p.id)::int,
         f.responded_at
  from public.friendships f
  join public.profiles p on p.id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
  where f.status = 'accepted'
    and auth.uid() in (f.requester_id, f.addressee_id)
    and p.visibility in ('friends', 'public')
    and public.are_friends(auth.uid(), p.id);
$$;
revoke all on function public.friend_summaries() from public;
grant execute on function public.friend_summaries() to authenticated;

-- ———————————————————————————————— Avis modérés ————————————————————————————————

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  place_id text not null references public.places (id),
  rating smallint not null check (rating between 1 and 5),
  body text not null check (char_length(btrim(body)) between 10 and 1000),
  -- Toute contribution publique passe par la modération.
  status text not null default 'pending' check (status in ('pending', 'published', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  moderated_by uuid references auth.users (id) on delete set null,
  moderated_at timestamptz,
  rejection_reason text,
  unique (user_id, place_id)
);
create index reviews_place_idx on public.reviews (place_id) where status = 'published';
create trigger reviews_updated_at before update on public.reviews for each row execute function public.set_updated_at();

create table public.review_reports (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews (id) on delete cascade,
  reporter_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reason text not null check (char_length(reason) between 3 and 500),
  created_at timestamptz not null default now(),
  unique (review_id, reporter_id)
);

alter table public.reviews enable row level security;
alter table public.review_reports enable row level security;
create policy "avis : lecture des publiés" on public.reviews for select to anon, authenticated using (status = 'published');
create policy "avis : lecture des siens" on public.reviews for select to authenticated using (user_id = (select auth.uid()));
create policy "avis : création en attente" on public.reviews for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending' and moderated_by is null);
-- Modifier son avis le renvoie en modération.
create policy "avis : modification des siens" on public.reviews for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and status = 'pending' and moderated_by is null);
create policy "avis : suppression des siens" on public.reviews for delete to authenticated using (user_id = (select auth.uid()));
revoke update on public.reviews from authenticated;
grant update (rating, body, status) on public.reviews to authenticated;
create policy "signalements d'avis : création" on public.review_reports for insert to authenticated with check (reporter_id = (select auth.uid()));
create policy "signalements d'avis : lecture des siens" on public.review_reports for select to authenticated using (reporter_id = (select auth.uid()));

-- Pseudonyme de l'auteur d'un avis publié (sans exposer la table des profils).
create or replace function public.published_reviews(target_place text)
returns table (id uuid, place_id text, rating smallint, body text, created_at timestamptz, author text, mine boolean)
language sql stable security definer set search_path = '' as $$
  select r.id, r.place_id, r.rating, r.body, r.created_at, p.pseudonym, r.user_id = auth.uid()
  from public.reviews r join public.profiles p on p.id = r.user_id
  where r.place_id = target_place and r.status = 'published'
    and not exists (select 1 from public.blocks b where b.blocker_id = auth.uid() and b.blocked_id = r.user_id)
  order by r.created_at desc
  limit 50;
$$;
grant execute on function public.published_reviews(text) to anon, authenticated;

-- ———————————————————————————————— Missions ————————————————————————————————

create table public.missions (
  id text primary key check (id ~ '^[a-z0-9-]+$'),
  period text not null check (period in ('daily', 'weekly', 'monthly')),
  title text not null,
  description text not null,
  -- Critère calculé à partir des données réelles : {type, count, category?}.
  criteria jsonb not null,
  xp integer not null check (xp between 0 and 200),
  active boolean not null default true,
  -- Relecture sécurité obligatoire : aucune mission ne doit inciter à un accès interdit ou dangereux.
  safety_reviewed boolean not null default false,
  updated_at timestamptz not null default now(),
  check (not active or safety_reviewed)
);
create table public.mission_completions (
  user_id uuid not null references auth.users (id) on delete cascade,
  mission_id text not null references public.missions (id),
  period_key text not null,
  completed_at timestamptz not null default now(),
  primary key (user_id, mission_id, period_key)
);
alter table public.missions enable row level security;
alter table public.mission_completions enable row level security;
create policy "missions : lecture des actives" on public.missions for select to anon, authenticated using (active);
create policy "missions accomplies : les siennes" on public.mission_completions for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on public.missions, public.mission_completions from anon, authenticated;

-- ———————————————————————————————— Administration et mesure ————————————————————————————————

create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  admin_id uuid references auth.users (id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.admin_audit_log enable row level security;
revoke all on public.admin_audit_log from anon, authenticated;

-- Événements produit : liste fermée, propriétés minimales, jamais de position.
create table public.events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete cascade,
  name text not null check (name in ('app_open', 'first_discovery', 'favorite_added', 'excursion_created', 'visit_declared', 'visit_checked', 'share_created')),
  props jsonb not null default '{}'::jsonb check (pg_column_size(props) < 2048),
  occurred_at timestamptz not null default now(),
  is_test boolean not null default false,
  is_admin boolean not null default false
);
create index events_user_time_idx on public.events (user_id, occurred_at);
alter table public.events enable row level security;
revoke all on public.events from anon, authenticated;

-- Consentement à la mesure d'usage (désactivée par défaut).
alter table public.profiles add column analytics_consent boolean not null default false;
grant update (analytics_consent) on public.profiles to authenticated;
