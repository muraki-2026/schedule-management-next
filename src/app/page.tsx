'use client';

import { useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { Department, MasterDefinition, Schedule, UserProfile } from '@/types/database';

type Tab = 'calendar' | 'list' | 'masters';
type DraftSchedule = Partial<Schedule> & { title: string; schedule_date: string; status: Schedule['status'] };

const demoDepartments: Department[] = [{ id: 'dept-demo', name: '管理部', memo: 'デモ部署' }];
const demoUsers: UserProfile[] = [{ id: 'user-demo', name: '管理者', email: 'admin@example.com', department_id: 'dept-demo', role: '管理者', active: true }];
const demoSchedules: Schedule[] = [];

const statusLabel = { planned: '予定', done: '完了', cancelled: '中止' } as const;

function pad(n: number) { return String(n).padStart(2, '0'); }
function ymd(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function monthDays(date: Date) {
  const y = date.getFullYear();
  const m = date.getMonth();
  const start = new Date(y, m, 1 - new Date(y, m, 1).getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

export default function Home() {
  const [tab, setTab] = useState<Tab>('calendar');
  const [viewDate, setViewDate] = useState(new Date());
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [departments, setDepartments] = useState<Department[]>(demoDepartments);
  const [users, setUsers] = useState<UserProfile[]>(demoUsers);
  const [schedules, setSchedules] = useState<Schedule[]>(demoSchedules);
  const [masters, setMasters] = useState<MasterDefinition[]>([]);
  const [draft, setDraft] = useState<DraftSchedule | null>(null);

  const currentUser = users.find((u) => u.id === sessionUserId) ?? users[0];
  const days = useMemo(() => monthDays(viewDate), [viewDate]);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user.id) setSessionUserId(data.session.user.id);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionUserId(session?.user.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => { if (sessionUserId) loadData(); }, [sessionUserId]);

  async function loadData() {
    if (!supabase) return;
    const [d, u, s, m] = await Promise.all([
      supabase.from('departments').select('*').order('name'),
      supabase.from('user_profiles').select('*').order('name'),
      supabase.from('schedules').select('*').order('schedule_date'),
      supabase.from('master_definitions').select('*').order('name'),
    ]);
    if (d.data) setDepartments(d.data);
    if (u.data) setUsers(u.data);
    if (s.data) setSchedules(s.data);
    if (m.data) setMasters(m.data);
  }

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setMessage('');
    if (!supabase) {
      setSessionUserId('user-demo');
      setMessage('Supabase未設定のためデモログインしました。');
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMessage(error.message);
  }

  async function logout() {
    if (supabase) await supabase.auth.signOut();
    setSessionUserId(null);
  }

  async function saveSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    const payload = {
      title: draft.title,
      schedule_date: draft.schedule_date,
      start_time: draft.start_time || null,
      end_time: draft.end_time || null,
      owner_id: draft.owner_id || currentUser?.id || null,
      place: draft.place || null,
      memo: draft.memo || null,
      status: draft.status,
      created_by: currentUser?.id || null,
    };
    if (!supabase) {
      if (draft.id) setSchedules((v) => v.map((s) => s.id === draft.id ? { ...s, ...payload } as Schedule : s));
      else setSchedules((v) => [...v, { id: crypto.randomUUID(), ...payload } as Schedule]);
      setDraft(null);
      return;
    }
    const res = draft.id
      ? await supabase.from('schedules').update(payload).eq('id', draft.id)
      : await supabase.from('schedules').insert(payload);
    if (res.error) setMessage(res.error.message);
    else { setDraft(null); await loadData(); }
  }

  async function deleteSchedule(id: string) {
    if (!confirm('この予定を削除しますか？')) return;
    if (!supabase) setSchedules((v) => v.filter((s) => s.id !== id));
    else await supabase.from('schedules').delete().eq('id', id);
    setDraft(null);
    await loadData();
  }

  if (!sessionUserId) {
    return <main className="min-h-screen grid place-items-center p-4"><section className="card w-full max-w-md p-7"><h1 className="text-2xl font-bold">スケジュール管理</h1><p className="text-gray-500 mt-2">メールアドレスとパスワードでログイン</p>{!isSupabaseConfigured && <p className="mt-4 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">Supabase環境変数が未設定です。ログインボタンでデモ表示します。</p>}<form onSubmit={login} className="mt-5 space-y-4"><div><label className="label">メールアドレス</label><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div><div><label className="label">パスワード</label><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>{message && <p className="text-sm text-red-600">{message}</p>}<button className="btn w-full">ログイン</button></form></section></main>;
  }

  return <main className="mx-auto max-w-7xl p-3 md:p-6"><header className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl font-bold">スケジュール管理</h1><p className="text-gray-500">{currentUser?.name} さん</p></div><button onClick={logout} className="btn secondary">ログアウト</button></header>{message && <p className="mb-3 rounded-xl bg-yellow-50 p-3 text-yellow-800">{message}</p>}<nav className="mb-4 flex flex-wrap gap-2">{(['calendar','list','masters'] as Tab[]).map((t) => <button key={t} onClick={() => setTab(t)} className={`btn ${tab === t ? '' : 'secondary'}`}>{t === 'calendar' ? 'カレンダー' : t === 'list' ? '予定一覧' : 'マスタ管理'}</button>)}</nav>{tab === 'calendar' && <Calendar viewDate={viewDate} setViewDate={setViewDate} days={days} schedules={schedules} open={setDraft} />}{tab === 'list' && <ScheduleList schedules={schedules} users={users} open={setDraft} />}{tab === 'masters' && <Masters departments={departments} users={users} masters={masters} />}{draft && <ScheduleModal draft={draft} setDraft={setDraft} users={users} save={saveSchedule} remove={deleteSchedule} />}</main>;
}

function Calendar({ viewDate, setViewDate, days, schedules, open }: { viewDate: Date; setViewDate: (d: Date) => void; days: Date[]; schedules: Schedule[]; open: (s: DraftSchedule) => void }) {
  const y = viewDate.getFullYear(), m = viewDate.getMonth();
  return <section className="card overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 p-4"><div className="flex items-center gap-2"><button className="btn secondary" onClick={() => setViewDate(new Date(y, m - 1, 1))}>前月</button><h2 className="text-xl font-bold">{y}年 {m + 1}月</h2><button className="btn secondary" onClick={() => setViewDate(new Date(y, m + 1, 1))}>翌月</button></div><button className="btn" onClick={() => open({ title: '', schedule_date: ymd(new Date()), status: 'planned' })}>予定を追加</button></div><div className="calendar-grid border-t border-gray-200">{['日','月','火','水','木','金','土'].map((w) => <div key={w} className="p-2 text-center font-bold text-gray-500">{w}</div>)}{days.map((d) => { const date = ymd(d); const ev = schedules.filter((s) => s.schedule_date === date); return <div key={date} onDoubleClick={() => open({ title: '', schedule_date: date, status: 'planned' })} className={`day ${d.getMonth() !== m ? 'text-gray-400 bg-gray-50' : ''}`}><b>{d.getDate()}</b>{ev.map((s) => <div key={s.id} className={`event ${s.status}`} onClick={() => open({ ...s })}>{s.start_time?.slice(0,5) || '終日'} {s.title}</div>)}</div>; })}</div></section>;
}

function ScheduleList({ schedules, users, open }: { schedules: Schedule[]; users: UserProfile[]; open: (s: DraftSchedule) => void }) {
  return <section className="card p-4"><h2 className="text-xl font-bold mb-3">予定一覧</h2><div className="grid gap-3">{schedules.map((s) => <button key={s.id} onClick={() => open({ ...s })} className="text-left rounded-xl border border-gray-200 bg-white p-3 hover:bg-blue-50"><b>{s.title}</b><p className="text-sm text-gray-500">{s.schedule_date} {s.start_time?.slice(0,5) || '終日'} / {users.find((u) => u.id === s.owner_id)?.name || '未設定'} / {statusLabel[s.status]}</p></button>)}{schedules.length === 0 && <p className="text-gray-500">予定はありません。</p>}</div></section>;
}

function Masters({ departments, users, masters }: { departments: Department[]; users: UserProfile[]; masters: MasterDefinition[] }) {
  return <section className="grid gap-4 md:grid-cols-2"><div className="card p-4"><h2 className="text-xl font-bold">利用者マスタ</h2>{users.map((u) => <p key={u.id} className="mt-2 rounded-lg border p-2">{u.name} / {u.email}</p>)}</div><div className="card p-4"><h2 className="text-xl font-bold">部署・追加マスタ</h2><h3 className="mt-3 font-bold">部署</h3>{departments.map((d) => <p key={d.id} className="mt-2 rounded-lg border p-2">{d.name}</p>)}<h3 className="mt-4 font-bold">追加マスタ</h3>{masters.map((m) => <p key={m.id} className="mt-2 rounded-lg border p-2">{m.name}</p>)}{masters.length === 0 && <p className="text-gray-500">追加マスタは未登録です。</p>}</div></section>;
}

function ScheduleModal({ draft, setDraft, users, save, remove }: { draft: DraftSchedule; setDraft: (d: DraftSchedule | null) => void; users: UserProfile[]; save: (e: React.FormEvent) => void; remove: (id: string) => void }) {
  const update = (k: keyof DraftSchedule, v: string) => setDraft({ ...draft, [k]: v });
  return <div className="fixed inset-0 z-10 grid place-items-center bg-black/50 p-4"><section className="card max-h-[92vh] w-full max-w-2xl overflow-auto p-5"><h2 className="text-xl font-bold">{draft.id ? '予定編集' : '予定追加'}</h2><form onSubmit={save} className="mt-4 grid gap-3 md:grid-cols-2"><div className="md:col-span-2"><label className="label">件名</label><input className="input" required value={draft.title} onChange={(e) => update('title', e.target.value)} /></div><div><label className="label">日付</label><input className="input" type="date" required value={draft.schedule_date} onChange={(e) => update('schedule_date', e.target.value)} /></div><div><label className="label">状態</label><select className="input" value={draft.status} onChange={(e) => update('status', e.target.value)}><option value="planned">予定</option><option value="done">完了</option><option value="cancelled">中止</option></select></div><div><label className="label">開始</label><input className="input" type="time" value={draft.start_time ?? ''} onChange={(e) => update('start_time', e.target.value)} /></div><div><label className="label">終了</label><input className="input" type="time" value={draft.end_time ?? ''} onChange={(e) => update('end_time', e.target.value)} /></div><div><label className="label">担当者</label><select className="input" value={draft.owner_id ?? ''} onChange={(e) => update('owner_id', e.target.value)}><option value="">未設定</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div><div><label className="label">場所</label><input className="input" value={draft.place ?? ''} onChange={(e) => update('place', e.target.value)} /></div><div className="md:col-span-2"><label className="label">メモ</label><textarea className="input min-h-24" value={draft.memo ?? ''} onChange={(e) => update('memo', e.target.value)} /></div><div className="md:col-span-2 flex flex-wrap gap-2"><button className="btn">保存</button>{draft.id && <button type="button" className="btn danger" onClick={() => remove(draft.id!)}>削除</button>}<button type="button" className="btn secondary" onClick={() => setDraft(null)}>閉じる</button></div></form></section></div>;
}
