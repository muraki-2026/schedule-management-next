-- 担当者マスタ重複整理SQL v2
-- 方針:
--   「担当者」を残す
--   「担当者マスタ」の項目を「担当者」へ移す
--   予定が「担当者マスタ」側の項目を参照している場合は「担当者」側へ付け替える
--   最後に「担当者マスタ」を削除する
--
-- 注意:
--   削除を含みます。
--   Supabase SQL Editorで実行してください。

begin;

-- 1. 「担当者」マスタが無ければ作成
insert into master_definitions (name, code, description)
select '担当者', null, '予定登録で使用する担当者。ログイン利用者とは別管理。'
where not exists (
  select 1 from master_definitions where name = '担当者'
);

-- 2. 正式マスタ「担当者」と削除対象「担当者マスタ」を一時テーブル化
create temporary table tmp_assignee_cleanup as
select
  (select id from master_definitions where name = '担当者' order by id limit 1) as canonical_id,
  id as duplicate_id
from master_definitions
where name = '担当者マスタ';

-- 3. code='assignee' が「担当者マスタ」側についている場合、いったん外す
update master_definitions md
set code = null
where md.id in (select duplicate_id from tmp_assignee_cleanup)
  and md.code = 'assignee';

-- 4. 「担当者」側に code='assignee' を付ける
--    既に他の行に assignee が残っている場合は、その行の code を外してから付ける
update master_definitions
set code = null
where code = 'assignee'
  and id <> (select canonical_id from tmp_assignee_cleanup limit 1);

update master_definitions
set code = 'assignee',
    description = '予定登録で使用する担当者。ログイン利用者とは別管理。'
where id = (select canonical_id from tmp_assignee_cleanup limit 1);

-- 5. 「担当者マスタ」側の項目を「担当者」側へ移す
--    同名項目が既にある場合は作成しない
insert into master_items (master_definition_id, name, value, sort_order, active)
select
  c.canonical_id,
  mi.name,
  mi.value,
  mi.sort_order,
  mi.active
from master_items mi
join tmp_assignee_cleanup c on c.duplicate_id = mi.master_definition_id
where not exists (
  select 1
  from master_items existing
  where existing.master_definition_id = c.canonical_id
    and existing.name = mi.name
);

-- 6. 予定の参照を「担当者マスタ」側の項目から「担当者」側の同名項目へ付け替え
update schedules s
set assignee_id = new_item.id
from master_items old_item
join tmp_assignee_cleanup c on c.duplicate_id = old_item.master_definition_id
join master_items new_item
  on new_item.master_definition_id = c.canonical_id
 and new_item.name = old_item.name
where s.assignee_id = old_item.id;

-- 7. 「担当者マスタ」側の項目を削除
delete from master_items mi
using tmp_assignee_cleanup c
where mi.master_definition_id = c.duplicate_id;

-- 8. 「担当者マスタ」を削除
delete from master_definitions md
using tmp_assignee_cleanup c
where md.id = c.duplicate_id;

commit;

-- 9. 確認
select id, name, code, description
from master_definitions
where name in ('担当者', '担当者マスタ')
   or code = 'assignee'
order by name;

select
  md.name as master_name,
  md.code as master_code,
  mi.name as item_name,
  mi.sort_order,
  mi.active
from master_items mi
join master_definitions md on md.id = mi.master_definition_id
where md.name in ('担当者', '担当者マスタ')
   or md.code = 'assignee'
order by md.name, mi.sort_order, mi.name;
