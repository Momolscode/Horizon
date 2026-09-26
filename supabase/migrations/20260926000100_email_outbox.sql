-- File d'envoi des e-mails transactionnels (docs/DECISIONS.md D-019).
-- Un e-mail est enregistré dans la même transaction que l'événement qui le motive, puis envoyé
-- par le serveur (SMTP) après validation. Aucune adresse n'est stockée ici : elle est lue dans
-- auth.users au moment de l'envoi, et la suppression du compte supprime ses e-mails en attente.

create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('review_withdrawn')),
  payload jsonb not null default '{}'::jsonb,
  -- Un même événement ne produit qu'un e-mail.
  dedupe_key text not null unique,
  created_at timestamptz not null default now(),
  attempts smallint not null default 0,
  next_attempt_at timestamptz not null default now(),
  -- Réservation pendant un envoi (évite qu'une autre instance envoie le même e-mail).
  locked_until timestamptz,
  sent_at timestamptz,
  failed_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 300)
);
create index email_outbox_due_idx on public.email_outbox (next_attempt_at) where sent_at is null and failed_at is null;
alter table public.email_outbox enable row level security;
revoke all on public.email_outbox from anon, authenticated;
