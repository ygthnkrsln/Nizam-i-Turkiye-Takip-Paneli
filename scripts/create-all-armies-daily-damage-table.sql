create table if not exists public.all_armies_daily_damage (
  date date primary key,
  total_damage numeric not null,
  tracked_army_count integer not null,
  expected_army_count integer not null,
  is_complete boolean not null default false,
  captured_at timestamptz not null
);

alter table public.all_armies_daily_damage enable row level security;
