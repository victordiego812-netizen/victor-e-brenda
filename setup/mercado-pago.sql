-- Run once on the wedding database after it is restored.
begin;
create table if not exists public.wedding_contributions (
  id uuid primary key, invitee_id text not null, gift_id text not null,
  amount_cents integer not null check(amount_cents between 100 and 1000000),
  mp_preference_id text, checkout_url text, created_at timestamptz not null default now()
);
create index if not exists wedding_contribution_invitee_idx on public.wedding_contributions(invitee_id,created_at);
create table if not exists public.wedding_payments (
  mp_payment_id text primary key, contribution_id uuid not null references public.wedding_contributions(id),
  status text not null, gross_cents integer not null check(gross_cents>=0),
  refunded_cents integer not null default 0 check(refunded_cents>=0),
  net_cents integer not null default 0 check(net_cents>=0),
  provider_updated_at timestamptz not null, donor_name text, donor_document text
);
create index if not exists wedding_payment_contribution_idx on public.wedding_payments(contribution_id);
alter table public.wedding_contributions enable row level security;
alter table public.wedding_payments enable row level security;
revoke all on public.wedding_contributions,public.wedding_payments from anon,authenticated;
grant all on public.wedding_contributions,public.wedding_payments to service_role;
create or replace function public.wedding_record_payment(payload jsonb) returns void
language sql security invoker set search_path='' as $$
  insert into public.wedding_payments(mp_payment_id,contribution_id,status,gross_cents,refunded_cents,net_cents,provider_updated_at,donor_name,donor_document)
  values(payload->>'mp_payment_id',(payload->>'contribution_id')::uuid,payload->>'status',(payload->>'gross_cents')::int,(payload->>'refunded_cents')::int,(payload->>'net_cents')::int,(payload->>'provider_updated_at')::timestamptz,payload->>'donor_name',payload->>'donor_document')
  on conflict(mp_payment_id) do update set status=excluded.status,refunded_cents=excluded.refunded_cents,net_cents=excluded.net_cents,provider_updated_at=excluded.provider_updated_at,donor_name=excluded.donor_name,donor_document=excluded.donor_document
  where excluded.provider_updated_at >= public.wedding_payments.provider_updated_at;
$$;
create or replace function public.wedding_gift_progress()
returns table(gift_id text,raised_cents bigint) language sql security invoker set search_path='' as $$
 select c.gift_id,coalesce(sum(p.net_cents),0)::bigint
 from public.wedding_contributions c join public.wedding_payments p on p.contribution_id=c.id
 group by c.gift_id;
$$;
revoke all on function public.wedding_record_payment(jsonb),public.wedding_gift_progress() from public,anon,authenticated;
grant execute on function public.wedding_record_payment(jsonb),public.wedding_gift_progress() to service_role;
commit;
