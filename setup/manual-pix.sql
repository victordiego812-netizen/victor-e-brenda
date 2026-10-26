begin;

create table if not exists public.wedding_pix_contributions (
  id uuid primary key default gen_random_uuid(),
  donor_name text not null check (char_length(donor_name) between 2 and 100),
  gift_name text not null check (char_length(gift_name) between 2 and 120),
  amount_cents integer not null check (amount_cents between 100 and 1000000),
  status text not null default 'pending' check (status in ('pending','confirmed')),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create index if not exists wedding_pix_contributions_created_idx
  on public.wedding_pix_contributions (created_at desc);
create index if not exists wedding_pix_contributions_status_idx
  on public.wedding_pix_contributions (status, created_at desc);

alter table public.wedding_pix_contributions enable row level security;
revoke all on public.wedding_pix_contributions from anon, authenticated;
grant all on public.wedding_pix_contributions to service_role;

commit;
