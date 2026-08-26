-- 管理者プロフィール作成SQL
-- 使い方:
-- 1. 下の your-email@example.com を、Supabase Authentication に作成した管理者メールアドレスへ変更
-- 2. Supabase SQL Editor で実行

insert into user_profiles (id, name, email, department_id, role, active)
select
  auth.users.id,
  '管理者',
  auth.users.email,
  (select id from departments order by created_at limit 1),
  '管理者',
  true
from auth.users
where auth.users.email = 'your-email@example.com'
on conflict (id) do update set
  name = excluded.name,
  email = excluded.email,
  department_id = excluded.department_id,
  role = excluded.role,
  active = excluded.active;
