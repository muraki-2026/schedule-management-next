-- Supabase Authenticationで作成済みのユーザーを、アプリの利用者マスタ(user_profiles)に追加するSQL
-- Supabase SQL Editorで実行してください。
--
-- 使い方:
-- 1. target-user@example.com を、追加したい利用者のメールアドレスに変更
-- 2. 利用者名、権限を必要に応じて変更
-- 3. 実行

insert into user_profiles (id, name, email, department_id, role, active)
select
  auth.users.id,
  '利用者名',
  auth.users.email,
  (select id from departments order by name limit 1),
  '一般',
  true
from auth.users
where auth.users.email = 'target-user@example.com'
on conflict (id) do update set
  name = excluded.name,
  email = excluded.email,
  department_id = excluded.department_id,
  role = excluded.role,
  active = excluded.active;

select id, name, email, department_id, role, active
from user_profiles
order by email;
