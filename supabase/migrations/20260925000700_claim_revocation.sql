-- Retrait de la gestion d'une fiche (docs/DECISIONS.md D-017, complément).
-- Un administrateur peut retirer la gestion à un établissement validé ; l'établissement peut
-- aussi y renoncer. La revendication passe au statut « revoked » : la fiche redevient
-- revendicable, l'historique est conservé.

alter table public.place_claims drop constraint place_claims_status_check;
alter table public.place_claims
  add constraint place_claims_status_check check (status in ('pending', 'approved', 'rejected', 'revoked'));

alter table public.place_claims
  add column revoked_at timestamptz,
  add column revoked_by uuid,
  add column revoke_reason text check (revoke_reason is null or char_length(btrim(revoke_reason)) between 3 and 300);

-- Un retrait porte toujours sa date et son motif.
alter table public.place_claims
  add constraint place_claims_revocation_complete check (status <> 'revoked' or (revoked_at is not null and revoke_reason is not null));

-- Un ancien gestionnaire reste en conflit d'intérêts : il ne peut toujours pas noter la fiche.
create or replace function public.check_review_eligibility() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if not exists (select 1 from public.visits v where v.user_id = new.user_id and v.place_id = new.place_id) then
    raise exception 'Avis réservé aux personnes ayant déclaré une visite de ce lieu' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.place_claims c where c.user_id = new.user_id and c.place_id = new.place_id and c.status in ('approved', 'revoked')) then
    raise exception 'Un établissement ne peut pas noter une fiche qu''il gère ou a gérée' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
