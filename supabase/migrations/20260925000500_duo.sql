-- Mode Duo (docs/DECISIONS.md D-016) : co-édition d'une excursion entre deux amis,
-- version d'excursion contre les écrasements, visite pour deux confirmée par l'autre.
-- Toutes les opérations Duo passent par des routes serveur ; le navigateur ne lit et
-- ne modifie que l'excursion elle-même, sous RLS.

-- ———————————————————————————————— Version et dernier auteur ————————————————————————————————

alter table public.excursions
  add column version integer not null default 1,
  add column updated_by uuid references auth.users (id) on delete set null;

-- Chaque modification incrémente la version ; le client enregistre « si la version est
-- toujours N » et apprend ainsi qu'une autre personne a modifié l'excursion entre-temps.
create or replace function public.bump_excursion_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.version := old.version + 1;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;
create trigger excursions_version before update on public.excursions for each row execute function public.bump_excursion_version();

-- Le navigateur ne voit plus les identifiants de comptes (propriétaire, dernier auteur) :
-- la personne invitée n'apprend jamais l'identifiant technique de son ami.
revoke select on public.excursions from authenticated;
grant select (id, title, destination_id, date, start_time, duration_minutes, preferences, seed, origin, steps, created_at, updated_at, version)
  on public.excursions to authenticated;

-- ———————————————————————————————— Invitation (une personne par excursion) ————————————————————————————————

create table public.excursion_members (
  excursion_id uuid primary key references public.excursions (id) on delete cascade,
  guest_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);
create index excursion_members_guest_idx on public.excursion_members (guest_id);
alter table public.excursion_members enable row level security;
revoke all on public.excursion_members from anon, authenticated;

-- Accès de l'invité : invitation acceptée ET amitié toujours acceptée ET aucun blocage.
-- Retirer l'ami ou le bloquer coupe donc l'accès immédiatement, sans autre action.
create or replace function public.is_duo_guest(target_excursion uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.excursion_members m
      join public.excursions e on e.id = m.excursion_id
      join public.friendships f
        on f.status = 'accepted'
       and least(f.requester_id, f.addressee_id) = least(e.user_id, m.guest_id)
       and greatest(f.requester_id, f.addressee_id) = greatest(e.user_id, m.guest_id)
     where m.excursion_id = target_excursion
       and m.guest_id = (select auth.uid())
       and m.status = 'accepted'
       and not exists (
         select 1 from public.blocks b
          where (b.blocker_id = e.user_id and b.blocked_id = m.guest_id)
             or (b.blocker_id = m.guest_id and b.blocked_id = e.user_id)
       )
  );
$$;
revoke all on function public.is_duo_guest(uuid) from public, anon;
grant execute on function public.is_duo_guest(uuid) to authenticated;

-- L'invité lit et modifie l'excursion (colonnes limitées par les droits ci-dessus) ;
-- seule la politique du propriétaire autorise la création et la suppression.
create policy "excursions : invité Duo, lecture" on public.excursions for select to authenticated
  using (public.is_duo_guest(id));
create policy "excursions : invité Duo, modification" on public.excursions for update to authenticated
  using (public.is_duo_guest(id)) with check (public.is_duo_guest(id));

-- ———————————————————————————————— Visite pour deux ————————————————————————————————

create table public.duo_visit_requests (
  id uuid primary key default gen_random_uuid(),
  excursion_id uuid not null references public.excursions (id) on delete cascade,
  place_id text not null references public.places (id),
  from_user uuid not null references auth.users (id) on delete cascade,
  to_user uuid not null references auth.users (id) on delete cascade,
  visited_on date not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  responded_at timestamptz,
  visit_id uuid references public.visits (id) on delete set null,
  check (from_user <> to_user),
  -- Une seule demande par étape et par personne : rejouer « nous y étions » ne crée rien de plus.
  unique (excursion_id, place_id, to_user)
);
create index duo_visit_requests_to_idx on public.duo_visit_requests (to_user, status);
alter table public.duo_visit_requests enable row level security;
revoke all on public.duo_visit_requests from anon, authenticated;
