-- user_profiles RLS 再帰エラー修正SQL
-- エラー: infinite recursion detected in policy for relation "user_profiles"
-- Supabase SQL Editorで実行してください。

-- 再帰の原因になる user_profiles 自身を参照するポリシーを削除します。
drop policy if exists "admin write profiles" on user_profiles;

-- 念のため、他テーブルの管理者用ポリシーもいったん削除して、安全な関数経由に作り直します。
drop policy if exists "admin write departments" on departments;
drop policy if exists "admin write master definitions" on master_definitions;
drop policy if exists "admin write master items" on master_items;

-- SECURITY DEFINER関数で管理者判定します。
-- 関数内ではRLSを迂回できるため、ポリシー評価の再帰を避けられます。
create or replace function public.is_admin_user(uid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles p
    where p.id = uid
      and p.role = '管理者'
      and p.active = true
  );
$$;

grant execute on function public.is_admin_user(uuid) to authenticated;

-- user_profiles の基本参照ポリシーを作り直します。
-- 自分自身は読める。管理者は全員分を読める。
drop policy if exists "read profiles" on user_profiles;
create policy "read profiles"
on user_profiles
for select
to authenticated
using (
  id = auth.uid()
  or public.is_admin_user(auth.uid())
);

-- user_profiles の更新/追加/削除は管理者のみ。
-- ここでは user_profiles を直接selectせず、関数経由にするのが重要です。
create policy "admin write profiles"
on user_profiles
for all
to authenticated
using (public.is_admin_user(auth.uid()))
with check (public.is_admin_user(auth.uid()));

-- 他マスタも管理者のみ書き込み可能に戻します。
create policy "admin write departments"
on departments
for all
to authenticated
using (public.is_admin_user(auth.uid()))
with check (public.is_admin_user(auth.uid()));

create policy "admin write master definitions"
on master_definitions
for all
to authenticated
using (public.is_admin_user(auth.uid()))
with check (public.is_admin_user(auth.uid()));

create policy "admin write master items"
on master_items
for all
to authenticated
using (public.is_admin_user(auth.uid()))
with check (public.is_admin_user(auth.uid()));

-- 確認用
select public.is_admin_user(auth.uid()) as current_user_is_admin;
