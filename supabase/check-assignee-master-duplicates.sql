-- 担当者 / 担当者マスタ の現状確認SQL
-- 削除や更新は行いません。

select id, name, code, description
from master_definitions
where code in ('assignee', 'person_in_charge', 'staff', 'tantosha')
   or name in ('担当者', '担当者マスタ')
order by name, code;

select
  md.id as master_definition_id,
  md.name as master_name,
  md.code as master_code,
  mi.id as item_id,
  mi.name as item_name,
  mi.value,
  mi.sort_order,
  mi.active
from master_items mi
join master_definitions md on md.id = mi.master_definition_id
where md.code in ('assignee', 'person_in_charge', 'staff', 'tantosha')
   or md.name in ('担当者', '担当者マスタ')
order by md.name, mi.sort_order, mi.name;

select
  s.id,
  s.title,
  s.schedule_date,
  s.assignee_id,
  mi.name as assignee_item_name,
  md.name as assignee_master_name,
  md.code as assignee_master_code
from schedules s
left join master_items mi on mi.id = s.assignee_id
left join master_definitions md on md.id = mi.master_definition_id
where s.assignee_id is not null
order by s.schedule_date desc, s.title;
