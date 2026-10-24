-- Stores the resolver can read, seeded from the Buff City Soap roster.
-- Woven's own ids stay in woven_location_map and are joined at read time
-- (status = mapped). This file is prepared for review. Do not apply it
-- until Pau has checked the rows below.
--
-- Rollback:
--   drop table if exists public.stores;

create table if not exists public.stores (
  id text primary key check (id ~ '^loc-[A-Za-z0-9-]{1,16}$'),
  code text not null unique check (code ~ '^[A-Za-z0-9][A-Za-z0-9-]{0,15}$'),
  name text not null check (length(name) between 1 and 160),
  state text check (state is null or state ~ '^[A-Z]{2}$'),
  district_id text,
  created_at timestamptz not null default now()
);

alter table public.stores enable row level security;
alter table public.stores force row level security;
revoke all on public.stores from anon, authenticated;

comment on table public.stores is
  'Buff City Soap stores. Seeded from the company roster. Woven aliases are woven_location_map rows with status mapped, joined on location_id. Read only when STORES_TABLE_ENABLED is on.';

-- Proposed rows for Pau, from COMPANY_LOCATION_ENTRIES (src/config/company/locations.ts).
-- No Woven location ids are invented here.
insert into public.stores (id, code, name, state) values
  ('loc-66', '66', 'Kearney, NE', 'NE'),
  ('loc-67', '67', 'Bellevue, NE', 'NE'),
  ('loc-219', '219', 'Lee''s Summit, MO', 'MO'),
  ('loc-225', '225', 'Sioux Falls, SD (W 41st St)', 'SD'),
  ('loc-236', '236', 'Grand Island, NE', 'NE'),
  ('loc-264', '264', 'Omaha, NE (West Dodge Rd)', 'NE'),
  ('loc-338', '338', 'Sioux Falls, SD (E 18th St)', 'SD')
on conflict (id) do nothing;
