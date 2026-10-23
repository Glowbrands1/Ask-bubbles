-- Which incident an assistant draft belongs to. Service role only.
-- A resend matches this key. The card-id match on form_instances is unchanged.
--
-- Rollback:
--   drop table if exists public.chat_form_incidents;

create table if not exists public.chat_form_incidents (
  instance_id uuid primary key,
  user_id text not null,
  template_key text not null,
  employee_name text not null,
  incident_key text not null,
  created_at timestamptz not null default now()
);

create index if not exists chat_form_incidents_user_template_idx
  on public.chat_form_incidents (user_id, template_key, created_at desc);

alter table public.chat_form_incidents enable row level security;
alter table public.chat_form_incidents force row level security;
revoke all on public.chat_form_incidents from anon, authenticated;
