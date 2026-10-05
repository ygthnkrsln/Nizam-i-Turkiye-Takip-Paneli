create extension if not exists pgcrypto;

create table if not exists public.management_overview_cache (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists idx_management_overview_cache_updated_at
  on public.management_overview_cache (updated_at desc);
