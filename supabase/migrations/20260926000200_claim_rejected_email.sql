-- E-mail « revendication refusée » (docs/DECISIONS.md D-019) : nouveau type dans la file d'envoi.
alter table public.email_outbox drop constraint email_outbox_kind_check;
alter table public.email_outbox add constraint email_outbox_kind_check check (kind in ('review_withdrawn', 'claim_rejected'));
