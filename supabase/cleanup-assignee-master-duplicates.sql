-- 担当者マスタ重複整理SQL
-- 目的:
--   master_definitions に「担当者」と「担当者マスタ」が重複している場合、
--   「担当者」を正式な担当者マスタとして残し、code='assignee' を付与します。
--   「担当者マスタ」側にある項目は「担当者」側へ移行します。
--   schedules.assignee_id が「担当者マスタ」側の項目を参照している場合、移行後の項目へ付け替えます。
--   最後に空になった「担当者マスタ」を削除します。
--
-- 注意:
--   削除を含みます。実行前に内容を確認してください。
--   Supabase SQL Editorで実行してください。

begin;

-- 1. 「担当者」を正式マスタとして使う。無ければ作成。
insert into master_definitions (name, code, description)
values ('担当者', 'assignee', '予定登録で使用する担当者。ログイン利用者とは別管理。')
on conflict (code) do update set
  name = '担当者',
  description = excluded.description;

-- 2. 既存の「担当者」に code が無く、「担当者マスタ」に assignee が付いている等の揺れを整理。
--    まず正式な担当者マスタIDを取得しやすくする。
with canonical as (
  select id
  from master_definitions
  where code = 'assignee'
  order by case when name = '担当者' then 0 else 1 end, name
  limit 1
), named_tantosha as (
  select id
  from master_definitions
  where name = '担当者'
  order by id
  limit 1
)
update master_definitions md
set code = null
where md.code = 'assignee'
  and md.id not in (select id from canonical);

-- 3. 「担当者」という名前のマスタが別にある場合は、それを正式マスタにする。
--    既に code='assignee' の行が「担当者」なら何もしません。
with canonical as (
  select id from master_definitions where code = 'assignee' limit 1
), named_tantosha as (
  select id from master_definitions where name = '担当者' order by id limit 1
)
update master_definitions md
set code = 'assignee',
    description = '予定登録で使用する担当者。ログイン利用者とは別管理。'
where md.id = (select id from named_tantosha)
  and exists (select 1 from named_tantosha)
  and md.id <> (select id from canonical);

-- 4. もし上の処理で code='assignee' が複数/競合する環境の場合に備え、正式マスタを「担当者」優先で定義。
--    以降、正式マスタIDは canonical_id とします。
create temporary table tmp_assignee_master_cleanup as
with canonical as (
  select id as canonical_id
  from master_definitions
  where code = 'assignee' or name = '担当者'
  order by case when name = '担当者' then 0 else 1 end, id
  limit 1
), duplicates as (
  select id as duplicate_id
  from master_definitions
  where (name = '担当者マスタ' or code in ('person_in_charge', 'staff', 'tantosha'))
    and id <> (select canonical_id from canonical)
)
select canonical_id, duplicate_id
from canonical, duplicates;

-- 5. duplicate側の項目をcanonical側へ移行。
--    同名項目がcanonical側に既にある場合は、新規作成しません。
insert into master_items (master_definition_id, name, value, sort_order, active)
select
  c.canonical_id,
  mi.name,
  mi.value,
  mi.sort_order,
  mi.active
from master_items mi
join tmp_assignee_master_cleanup c on c.duplicate_id = mi.master_definition_id
where not exists (
  select 1
  from master_items existing
  where existing.master_definition_id = c.canonical_id
    and existing.name = mi.name
);

-- 6. schedules.assignee_id をduplicate側項目からcanonical側の同名項目へ付け替え。
update schedules s
set assignee_id = new_item.id
from master_items old_item
join tmp_assignee_master_cleanup c on c.duplicate_id = old_item.master_definition_id
join master_items new_item
  on new_item.master_definition_id = c.canonical_id
 and new_item.name = old_item.name
where s.assignee_id = old_item.id;

-- 7. duplicate側の項目を削除。
delete from master_items mi
using tmp_assignee_master_cleanup c
where mi.master_definition_id = c.duplicate_id;

-- 8. duplicate側のマスタ定義を削除。
delete from master_definitions md
using tmp_assignee_master_cleanup c
where md.id = c.duplicate_id;

-- 9. 正式マスタの表示名とcodeを整える。
update master_definitions
set name = '担当者',
    code = 'assignee',
    description = '予定登録で使用する担当者。ログイン利用者とは別管理。'
where id = (select canonical_id from tmp_assignee_master_cleanup limit 1);

commit;

-- 確認
select id, name, code, description
from master_definitions
where code = 'assignee' or name in ('担当者', '担当者マスタ')
order by name;

select mi.id, md.name as master_name, md.code as master_code, mi.name as item_name, mi.value, mi.sort_order, mi.active
from master_items mi
join master_definitions md on md.id = mi.master_definition_id
where md.code = 'assignee' or md.name in ('担当者', '担当者マスタ')
order by md.name, mi.sort_order, mi.name;
