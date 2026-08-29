-- メール通知機能用テーブル追加SQL
-- Supabase SQL Editorで実行してください。

create table if not exists email_recipients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists email_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists email_group_members (
  group_id uuid not null references email_groups(id) on delete cascade,
  recipient_id uuid not null references email_recipients(id) on delete cascade,
  primary key (group_id, recipient_id)
);

create table if not exists schedule_email_logs (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid references schedules(id) on delete set null,
  recipient_name text,
  recipient_email text not null,
  subject text not null,
  body text not null,
  status text not null default 'pending',
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

alter table email_recipients enable row level security;
alter table email_groups enable row level security;
alter table email_group_members enable row level security;
alter table schedule_email_logs enable row level security;

-- read policies
drop policy if exists "read email recipients" on email_recipients;
create policy "read email recipients" on email_recipients for select to authenticated using (true);

drop policy if exists "read email groups" on email_groups;
create policy "read email groups" on email_groups for select to authenticated using (true);

drop policy if exists "read email group members" on email_group_members;
create policy "read email group members" on email_group_members for select to authenticated using (true);

drop policy if exists "read schedule email logs" on schedule_email_logs;
create policy "read schedule email logs" on schedule_email_logs for select to authenticated using (true);

-- admin write policies. public.is_admin_user(uuid) は既存RLS修正SQLで作成済み想定。
drop policy if exists "admin write email recipients" on email_recipients;
create policy "admin write email recipients" on email_recipients for all to authenticated
using (public.is_admin_user(auth.uid()))
with check (public.is_admin_user(auth.uid()));

drop policy if exists "admin write email groups" on email_groups;
create policy "admin write email groups" on email_groups for all to authenticated
using (public.is_admin_user(auth.uid()))
with check (public.is_admin_user(auth.uid()));

drop policy if exists "admin write email group members" on email_group_members;
create policy "admin write email group members" on email_group_members for all to authenticated
using (public.is_admin_user(auth.uid()))
with check (public.is_admin_user(auth.uid()));

-- ログは認証ユーザーが登録可能
drop policy if exists "authenticated insert email logs" on schedule_email_logs;
create policy "authenticated insert email logs" on schedule_email_logs for insert to authenticated with check (true);

-- 確認
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('email_recipients', 'email_groups', 'email_group_members', 'schedule_email_logs')
order by table_name;
