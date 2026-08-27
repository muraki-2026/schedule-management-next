-- 担当者別予定パネルの表示対象を絞るためのマスタ作成SQL
-- Supabase SQL Editorで実行してください。
--
-- 使い方:
-- 1. このSQLを実行すると「担当者別予定表示」マスタが作成されます。
-- 2. アプリのマスタ管理で「担当者別予定表示」に項目を追加します。
-- 3. 項目名を担当者マスタの担当者名と同じにする、または value に担当者マスタ項目IDを入れると、その担当者だけ右側パネルに表示されます。
-- 4. このマスタに有効な項目が1件も無い場合は、担当者マスタ全員を表示します。

insert into master_definitions (name, code, description)
values ('担当者別予定表示', 'assignee_dashboard_display', 'カレンダー右側の担当者別予定に表示する担当者を絞り込むためのマスタ')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description;

select id, name, code, description
from master_definitions
where code = 'assignee_dashboard_display';
