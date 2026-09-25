-- Référencement élargi et avis (docs/DECISIONS.md D-017) : propositions de lieux par les
-- membres, revendication par les professionnels, réponses aux avis, avis réservés aux
-- personnes ayant déclaré une visite. Aucune offre payante n'est implémentée ici.
-- Toutes les tables ci-dessous sont gérées par des routes serveur : aucun droit client.

-- ———————————————————————————————— Catégories et source communautaire ————————————————————————————————

alter table public.places drop constraint if exists places_category_check;
alter table public.places add constraint places_category_check
  check (category in ('monument','museum','historic','religious','restaurant','market','hike','park','lake','beach','viewpoint','leisure','shop','outdoor'));

alter table public.sources drop constraint if exists sources_kind_check;
alter table public.sources add constraint sources_kind_check
  check (kind in ('editorial', 'open_data', 'official', 'partner', 'demo_fixture', 'community'));

insert into public.sources (id, label, kind, url, license, terms, retrieved_at) values (
  'contribution-membres',
  'Proposition d''un membre, publiée après modération',
  'community',
  null,
  'Contribution déposée par un membre (conditions d''utilisation des contributions à rédiger)',
  'Informations fournies par un membre de la communauté, non vérifiées par HORIZON.',
  null
) on conflict (id) do nothing;

-- ———————————————————————————————— Propositions de lieux ————————————————————————————————

create table public.place_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  destination_id text not null references public.destinations (id),
  name text not null check (char_length(name) between 2 and 120),
  category text not null check (category in ('restaurant', 'shop', 'outdoor', 'leisure')),
  location extensions.geography(point, 4326) not null,
  -- Proposition validée (Zod, src/modules/catalog/contributions.ts), conservée telle quelle.
  payload jsonb not null check (pg_column_size(payload) < 4096),
  -- Doublons probables détectés à l'envoi (identifiants de lieux ou de propositions).
  duplicate_of text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  place_id text references public.places (id) on delete set null,
  rejection_reason text,
  created_at timestamptz not null default now(),
  reviewed_by uuid,
  reviewed_at timestamptz
);
create index place_proposals_pending_idx on public.place_proposals (destination_id) where status = 'pending';
create index place_proposals_user_idx on public.place_proposals (user_id, created_at);
alter table public.place_proposals enable row level security;
revoke all on public.place_proposals from anon, authenticated;

-- ———————————————————————————————— Revendication par les professionnels ————————————————————————————————

create table public.place_claims (
  id uuid primary key default gen_random_uuid(),
  place_id text not null references public.places (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  siret char(14) not null check (siret ~ '^[0-9]{14}$'),
  proof_kind text not null check (proof_kind in ('email_domain', 'document')),
  proof_text text not null check (char_length(proof_text) between 5 and 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  rejection_reason text,
  created_at timestamptz not null default now(),
  reviewed_by uuid,
  reviewed_at timestamptz
);
-- Un seul établissement gestionnaire par fiche ; une seule demande en attente par personne et par fiche.
create unique index place_claims_one_manager on public.place_claims (place_id) where status = 'approved';
create unique index place_claims_one_pending on public.place_claims (place_id, user_id) where status = 'pending';
alter table public.place_claims enable row level security;
revoke all on public.place_claims from anon, authenticated;

-- ———————————————————————————————— Réponses des établissements aux avis ————————————————————————————————

create table public.review_replies (
  review_id uuid primary key references public.reviews (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 2 and 1000),
  -- Toute contribution publique passe par la modération, réponses comprises.
  status text not null default 'pending' check (status in ('pending', 'published', 'rejected')),
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  moderated_by uuid,
  moderated_at timestamptz
);
create trigger review_replies_updated_at before update on public.review_replies for each row execute function public.set_updated_at();
alter table public.review_replies enable row level security;
revoke all on public.review_replies from anon, authenticated;

-- ———————————————————————————————— Avis : visite déclarée, pas d'auto-évaluation ————————————————————————————————

-- S'applique aux avis déposés par un compte (navigateur, JWT) ; les écritures serveur
-- (imports, tests d'administration) ne sont pas concernées.
create or replace function public.check_review_eligibility() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if not exists (select 1 from public.visits v where v.user_id = new.user_id and v.place_id = new.place_id) then
    raise exception 'Avis réservé aux personnes ayant déclaré une visite de ce lieu' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.place_claims c where c.user_id = new.user_id and c.place_id = new.place_id and c.status = 'approved') then
    raise exception 'Un établissement ne peut pas noter sa propre fiche' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger reviews_eligibility before insert on public.reviews for each row execute function public.check_review_eligibility();

-- Avis publiés, avec la réponse publiée de l'établissement et la mention « après visite ».
drop function if exists public.published_reviews(text);
create function public.published_reviews(target_place text)
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
  order by r.created_at desc
  limit 50;
$$;
revoke all on function public.published_reviews(text) from public;
grant execute on function public.published_reviews(text) to anon, authenticated;
