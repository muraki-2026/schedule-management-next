-- ログイン中/指定メールアドレスの利用者を管理者にするSQL
-- Supabase SQL Editorで実行してください。

-- 方法A: メールアドレスを指定して管理者にする
-- your-email@example.com を実際にログインしているメールアドレスに変更してください。
update user_profiles
set role = '管理者', active = true
where email = 'your-email@example.com';

-- 確認
select id, name, email, role, active
from user_profiles
order by created_at desc;
