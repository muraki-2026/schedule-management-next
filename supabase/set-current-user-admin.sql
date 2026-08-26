-- ログイン中/指定メールアドレスの利用者を管理者にするSQL
-- Supabase SQL Editorで実行してください。
--
-- 使い方:
-- 1. your-email@example.com を、実際にログインしているメールアドレスに変更
-- 2. Supabase SQL Editorでこのファイルの中身を実行

update user_profiles
set role = '管理者', active = true
where email = 'your-email@example.com';

-- 確認
select id, name, email, role, active
from user_profiles
order by email;
