-- 追加機能用アップグレードSQL
-- Supabase SQL Editorで実行してください。

-- 予定区分を schedules に追加
alter table schedules
  add column if not exists schedule_type_id uuid references master_items(id);

-- 初期マスタ定義: 予定区分
insert into master_definitions (name, code, description)
values ('予定区分', 'schedule_type', '休暇・会議・外出などの予定分類')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description;

-- 初期分類。value はカレンダー表示色です。
with def as (
  select id from master_definitions where code = 'schedule_type' limit 1
)
insert into master_items (master_definition_id, name, value, sort_order, active)
select def.id, v.name, v.value, v.sort_order, true
from def
cross join (values
  ('会議', '#dbeafe', 10),
  ('外出', '#dcfce7', 20),
  ('来客', '#fef3c7', 30),
  ('作業', '#ede9fe', 40),
  ('休暇', '#fee2e2', 50),
  ('その他', '#f3f4f6', 60)
) as v(name, value, sort_order)
where not exists (
  select 1 from master_items mi
  where mi.master_definition_id = def.id and mi.name = v.name
);

-- 管理画面から編集できるようにRLS policyを追加/更新
-- まず既存の同名policyを削除
drop policy if exists "admin write departments" on departments;
drop policy if exists "admin write profiles" on user_profiles;
drop policy if exists "admin write master definitions" on master_definitions;
drop policy if exists "admin write master items" on master_items;

-- 管理者判定: user_profiles.role = '管理者'
create policy "admin write departments" on departments
for all to authenticated
using (exists (select 1 from user_profiles p where p.id = auth.uid() and p.role = '管理者' and p.active = true))
with check (exists (select 1 from user_profiles p where p.id = auth.uid() and p.role = '管理者' and p.active = true));

create policy "admin write profiles" on user_profiles
for all to authenticated
using (exists (select 1 from user_profiles p where p.id = auth.uid() and p.role = '管理者' and p.active = true))
with check (exists (select 1 from user_profiles p where p.id = auth.uid() and p.role = '管理者' and p.active = true));

create policy "admin write master definitions" on master_definitions
for all to authenticated
using (exists (select 1 from user_profiles p where p.id = auth.uid() and p.role = '管理者' and p.active = true))
with check (exists (select 1 from user_profiles p where p.id = auth.uid() and p.role = '管理者' and p.active = true));

create policy "admin write master items" on master_items
for all to authenticated
using (exists (select 1 from user_profiles p where p.id = auth.uid() and p.role = '管理者' and p.active = true))
with check (exists (select 1 from user_profiles p where p.id = auth.uid() and p.role = '管理者' and p.active = true));

-- 確認
select 'schedules.schedule_type_id exists' as check_name,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'schedules' and column_name = 'schedule_type_id'
  ) as ok;
