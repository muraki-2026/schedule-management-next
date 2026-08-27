-- 予定の担当者をログイン利用者(user_profiles)から切り離し、担当者マスタ(master_items)参照にするSQL
-- Supabase SQL Editorで実行してください。

-- 予定テーブルに担当者マスタ参照列を追加
alter table schedules
  add column if not exists assignee_id uuid references master_items(id);

-- 担当者マスタ定義が無い場合は作成
-- すでに「担当者マスタ」を作成済みの場合でも、code が未設定なら下の確認SQLで調整してください。
insert into master_definitions (name, code, description)
values ('担当者マスタ', 'assignee', '予定登録で使用する担当者。ログイン利用者とは別管理。')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description;

-- 確認: 担当者候補として認識されるマスタ定義
select id, name, code, description
from master_definitions
where code in ('assignee', 'person_in_charge', 'staff', 'tantosha')
   or name in ('担当者', '担当者マスタ')
order by name;

-- 確認: schedules に assignee_id があるか
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'schedules'
  and column_name in ('owner_id', 'assignee_id')
order by column_name;
