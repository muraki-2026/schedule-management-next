-- 手入力項目を予定に保存するための列追加SQL
-- マスタへは自動登録せず、予定データだけに手入力文字を保持します。
-- Supabase SQL Editorで実行してください。

alter table schedules
  add column if not exists schedule_type_text text,
  add column if not exists assignee_text text,
  add column if not exists place_text text;

select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'schedules'
  and column_name in ('schedule_type_text', 'assignee_text', 'place_text')
order by column_name;
