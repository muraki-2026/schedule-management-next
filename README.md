# スケジュール管理 Next.js版

Web上でどこからでもアクセス・編集できるようにするためのNext.js + Supabase版です。

## 必要環境

- Node.js LTS
- npm
- Git
- Supabaseアカウント
- Vercelアカウント
- GitHubアカウント

## ローカル起動

```powershell
npm install
npm run dev
```

ブラウザで以下を開きます。

```text
http://localhost:3000
```

## Supabase設定

1. Supabaseでプロジェクトを作成
2. SQL Editorで `supabase/schema.sql` を実行
3. Supabase Authでメール/パスワードログインを有効化
4. `.env.example` を `.env.local` にコピー
5. 以下を設定

```env
NEXT_PUBLIC_SUPABASE_URL=Supabase Project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=Supabase anon public key
```

## 初期利用者について

ログインユーザーは Supabase Auth で作成します。
その後、対応する `user_profiles` レコードを作成してください。

例:

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
where auth.users.email = '管理者のメールアドレス';
```

## 公開

1. GitHubへpush
2. VercelでImport
3. VercelのEnvironment Variablesに以下を設定
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy

## 現在の実装

- Supabase Authログイン
- カレンダー表示
- 予定追加・編集・削除
- 予定一覧
- 利用者/部署/追加マスタ表示
- スマホ対応
- Supabase未設定時のデモ表示

## 今後追加予定

- 管理画面からの利用者作成
- 部署マスタ編集
- 追加マスタ編集
- 権限管理強化
- 検索
- CSV出力
- 通知
