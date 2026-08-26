-- schedules テーブルが無い場合の修復SQL
-- Supabase SQL Editor で実行してください。

create extension if not exists pgcrypto;

create table if not exists departments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null unique,
  department_id uuid references departments(id),
  role text not null default '一般' check (role in ('管理者','一般')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists schedules (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  schedule_date date not null,
  start_time time,
  end_time time,
  owner_id uuid references user_profiles(id),
  place text,
  memo text,
  status text not null default 'planned' check (status in ('planned','done','cancelled')),
  created_by uuid references user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists master_definitions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists master_items (
  id uuid primary key default gen_random_uuid(),
  master_definition_id uuid not null references master_definitions(id) on delete cascade,
  name text not null,
  value text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into departments (name, memo)
select '管理部', '初期部署'
where not exists (select 1 from departments);

insert into master_definitions (name, code, description)
values
  ('予定区分', 'schedule_type', '会議、外出、来客など'),
  ('会議室', 'meeting_room', '会議室候補')
on conflict (code) do nothing;

alter table departments enable row level security;
alter table user_profiles enable row level security;
alter table schedules enable row level security;
alter table master_definitions enable row level security;
alter table master_items enable row level security;

-- 既存policyがあるとcreate policyでエラーになるため、一度削除して作り直します。
drop policy if exists "read departments" on departments;
drop policy if exists "read profiles" on user_profiles;
drop policy if exists "read schedules" on schedules;
drop policy if exists "insert schedules" on schedules;
drop policy if exists "update schedules" on schedules;
drop policy if exists "delete schedules" on schedules;
drop policy if exists "read master definitions" on master_definitions;
drop policy if exists "read master items" on master_items;

create policy "read departments" on departments for select to authenticated using (true);
create policy "read profiles" on user_profiles for select to authenticated using (true);
create policy "read schedules" on schedules for select to authenticated using (true);
create policy "insert schedules" on schedules for insert to authenticated with check (true);
create policy "update schedules" on schedules for update to authenticated using (true) with check (true);
create policy "delete schedules" on schedules for delete to authenticated using (true);
create policy "read master definitions" on master_definitions for select to authenticated using (true);
create policy "read master items" on master_items for select to authenticated using (true);

-- 作成確認
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('departments', 'user_profiles', 'schedules', 'master_definitions', 'master_items')
order by table_name;
