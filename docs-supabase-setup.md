# Supabase 初期設定手順

この手順は一度だけ実行します。

## 1. SQL Editorでテーブルを作成

Supabase管理画面を開きます。

https://supabase.com/dashboard/project/lyysmxtmfemeoimuhohb/sql

`supabase/schema.sql` の内容をSQL Editorに貼り付けて実行してください。

ローカルファイル:

```text
C:\Users\Umeta_s\AppData\Roaming\Genspark Claw\users\27fea045-268b-48db-83e0-18bc2a1caf2e\workspace\schedule-management-next\supabase\schema.sql
```

## 2. メール/パスワードログインを確認

Supabase管理画面で以下を確認します。

Authentication → Providers → Email

- Email provider: Enabled

## 3. 初期管理者ユーザーを作成

Authentication → Users → Add user から管理者ユーザーを作成します。

例:

```text
Email: 任意の管理者メールアドレス
Password: 任意のパスワード
Auto Confirm User: ON
```

## 4. user_profiles に管理者情報を作成

管理者ユーザー作成後、SQL Editorで以下を実行します。

`管理者のメールアドレス` は実際のメールアドレスに置き換えてください。

```sql
insert into user_profiles (id, name, email, department_id, role, active)
select
  auth.users.id,
  '管理者',
  auth.users.email,
  (select id from departments order by created_at limit 1),
  '管理者',
  true
from auth.users
where auth.users.email = '管理者のメールアドレス'
on conflict (id) do update set
  name = excluded.name,
  email = excluded.email,
  department_id = excluded.department_id,
  role = excluded.role,
  active = excluded.active;
```

## 5. ローカルでログイン確認

以下で開発サーバーを起動します。

```powershell
npm run dev
```

ブラウザで開きます。

```text
http://localhost:3000
```

作成した管理者メールアドレスとパスワードでログインします。

## 6. Vercel公開時の環境変数

Vercelにも以下を設定してください。

```env
NEXT_PUBLIC_SUPABASE_URL=https://lyysmxtmfemeoimuhohb.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=Supabaseのpublishable/anon key
```
