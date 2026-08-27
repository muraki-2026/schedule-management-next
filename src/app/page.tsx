'use client';

import { useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { Department, MasterDefinition, MasterItem, Schedule, UserProfile } from '@/types/database';

type Tab = 'calendar' | 'list' | 'masters';
type CalendarMode = 'month' | 'week' | 'day';
type MasterEdit = { kind: 'department'; data?: Partial<Department> } | { kind: 'user'; data?: Partial<UserProfile> } | { kind: 'definition'; data?: Partial<MasterDefinition> } | { kind: 'item'; data?: Partial<MasterItem> };
type DraftSchedule = Partial<Schedule> & { title: string; schedule_date: string; status: Schedule['status'] };

const demoDepartments: Department[] = [{ id: 'dept-demo', name: '管理部', memo: 'デモ部署' }];
const demoUsers: UserProfile[] = [{ id: 'user-demo', name: '管理者', email: 'admin@example.com', department_id: 'dept-demo', role: '管理者', active: true }];
const demoDefinitions: MasterDefinition[] = [{ id: 'def-type', name: '予定区分', code: 'schedule_type', description: '予定分類' }];
const demoItems: MasterItem[] = [
  { id: 'type-meeting', master_definition_id: 'def-type', name: '会議', value: '#dbeafe', sort_order: 10, active: true },
  { id: 'type-out', master_definition_id: 'def-type', name: '外出', value: '#dcfce7', sort_order: 20, active: true },
  { id: 'type-vacation', master_definition_id: 'def-type', name: '休暇', value: '#fee2e2', sort_order: 30, active: true },
];
const statusLabel = { planned: '予定', done: '完了', cancelled: '中止' } as const;

function pad(n: number) { return String(n).padStart(2, '0'); }
function ymd(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function monthDays(date: Date) { const y = date.getFullYear(), m = date.getMonth(); const start = new Date(y, m, 1 - new Date(y, m, 1).getDay()); return Array.from({ length: 42 }, (_, i) => addDays(start, i)); }
function weekDays(date: Date) { return Array.from({ length: 7 }, (_, i) => addDays(date, i - date.getDay())); }
function csvCell(v: unknown) { return `"${String(v ?? '').replaceAll('"', '""')}"`; }
function downloadCsv(filename: string, rows: unknown[][]) { const csv = rows.map((r) => r.map(csvCell).join(',')).join('\n'); const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); URL.revokeObjectURL(a.href); }

export default function Home() {
  const [tab, setTab] = useState<Tab>('calendar');
  const [mode, setMode] = useState<CalendarMode>('month');
  const [viewDate, setViewDate] = useState(new Date());
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [departments, setDepartments] = useState<Department[]>(demoDepartments);
  const [users, setUsers] = useState<UserProfile[]>(demoUsers);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [masters, setMasters] = useState<MasterDefinition[]>(demoDefinitions);
  const [items, setItems] = useState<MasterItem[]>(demoItems);
  const [draft, setDraft] = useState<DraftSchedule | null>(null);
  const [masterEdit, setMasterEdit] = useState<MasterEdit | null>(null);
  const [query, setQuery] = useState('');

  const currentUser = users.find((u) => u.id === sessionUserId) ?? users[0];
  const isAdmin = currentUser?.role === '管理者';
  const scheduleTypeDef = masters.find((m) => m.code === 'schedule_type');
  const scheduleTypes = items.filter((i) => i.master_definition_id === scheduleTypeDef?.id && i.active).sort((a, b) => a.sort_order - b.sort_order);
  const filteredSchedules = useMemo(() => {
    const q = query.trim().toLowerCase();
    return schedules.filter((s) => {
      if (!q) return true;
      const user = users.find((u) => u.id === s.owner_id)?.name ?? '';
      const type = items.find((i) => i.id === s.schedule_type_id)?.name ?? '';
      return [s.title, s.schedule_date, s.place, s.memo, user, type].some((x) => String(x ?? '').toLowerCase().includes(q));
    });
  }, [query, schedules, users, items]);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => { if (data.session?.user.id) setSessionUserId(data.session.user.id); });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setSessionUserId(session?.user.id ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);
  useEffect(() => { if (sessionUserId) loadData(); }, [sessionUserId]);

  async function loadData() {
    if (!supabase) return;
    const [d, u, s, m, mi] = await Promise.all([
      supabase.from('departments').select('*').order('name'),
      supabase.from('user_profiles').select('*').order('name'),
      supabase.from('schedules').select('*').order('schedule_date'),
      supabase.from('master_definitions').select('*').order('name'),
      supabase.from('master_items').select('*').order('sort_order'),
    ]);
    if (d.data) setDepartments(d.data); if (u.data) setUsers(u.data); if (s.data) setSchedules(s.data as Schedule[]); if (m.data) setMasters(m.data); if (mi.data) setItems(mi.data);
    const err = d.error || u.error || s.error || m.error || mi.error; if (err) setMessage(err.message);
  }

  async function login(e: React.FormEvent) { e.preventDefault(); setMessage(''); if (!supabase) { setSessionUserId('user-demo'); setMessage('Supabase未設定のためデモログインしました。'); return; } const { error } = await supabase.auth.signInWithPassword({ email, password }); if (error) setMessage(error.message); }
  async function logout() { if (supabase) await supabase.auth.signOut(); setSessionUserId(null); }

  async function saveSchedule(e: React.FormEvent) {
    e.preventDefault(); if (!draft) return;
    const payload = { title: draft.title, schedule_date: draft.schedule_date, start_time: draft.start_time || null, end_time: draft.end_time || null, owner_id: draft.owner_id || currentUser?.id || null, schedule_type_id: draft.schedule_type_id || null, place: draft.place || null, memo: draft.memo || null, status: draft.status, created_by: currentUser?.id || null };
    if (!supabase) { if (draft.id) setSchedules((v) => v.map((s) => s.id === draft.id ? { ...s, ...payload } as Schedule : s)); else setSchedules((v) => [...v, { id: crypto.randomUUID(), ...payload } as Schedule]); setDraft(null); return; }
    const res = draft.id ? await supabase.from('schedules').update(payload).eq('id', draft.id) : await supabase.from('schedules').insert(payload);
    if (res.error) setMessage(res.error.message); else { setDraft(null); await loadData(); }
  }
  async function deleteSchedule(id: string) { if (!confirm('この予定を削除しますか？')) return; if (!supabase) setSchedules((v) => v.filter((s) => s.id !== id)); else { const { error } = await supabase.from('schedules').delete().eq('id', id); if (error) setMessage(error.message); } setDraft(null); await loadData(); }

  async function saveMaster(kind: MasterEdit['kind'], data: Record<string, string | boolean | number | null>) {
    if (!isAdmin) return setMessage('管理者のみ編集できます。');
    if (!supabase) { setMasterEdit(null); return; }
    const table = kind === 'department' ? 'departments' : kind === 'user' ? 'user_profiles' : kind === 'definition' ? 'master_definitions' : 'master_items';
    const id = String(data.id || ''); delete data.id;
    const res = id ? await supabase.from(table).update(data).eq('id', id) : await supabase.from(table).insert(data);
    if (res.error) setMessage(res.error.message); else { setMasterEdit(null); await loadData(); }
  }
  async function deleteMaster(kind: MasterEdit['kind'], id?: string) {
    if (!isAdmin || !id || !supabase || !confirm('削除しますか？')) return;
    const table = kind === 'department' ? 'departments' : kind === 'user' ? 'user_profiles' : kind === 'definition' ? 'master_definitions' : 'master_items';
    const { error } = await supabase.from(table).delete().eq('id', id); if (error) setMessage(error.message); else { setMasterEdit(null); await loadData(); }
  }
  function exportCsv() { downloadCsv(`schedules-${ymd(new Date())}.csv`, [['日付','開始','終了','件名','区分','担当者','場所','状態','メモ'], ...filteredSchedules.map((s) => [s.schedule_date, s.start_time?.slice(0,5) ?? '', s.end_time?.slice(0,5) ?? '', s.title, items.find((i) => i.id === s.schedule_type_id)?.name ?? '', users.find((u) => u.id === s.owner_id)?.name ?? '', s.place ?? '', statusLabel[s.status], s.memo ?? ''])]); }

  if (!sessionUserId) return <main className="min-h-screen grid place-items-center p-4"><section className="card w-full max-w-md p-7"><h1 className="text-2xl font-bold">スケジュール管理</h1><p className="text-gray-500 mt-2">メールアドレスとパスワードでログイン</p>{!isSupabaseConfigured && <p className="mt-4 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">Supabase環境変数が未設定です。ログインボタンでデモ表示します。</p>}<form onSubmit={login} className="mt-5 space-y-4"><div><label className="label">メールアドレス</label><input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div><div><label className="label">パスワード</label><input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>{message && <p className="text-sm text-red-600">{message}</p>}<button className="btn w-full">ログイン</button></form></section></main>;

  return <main className="mx-auto max-w-7xl p-3 md:p-6"><header className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl font-bold">スケジュール管理</h1><p className="text-gray-500">{currentUser?.name} さん / {currentUser?.role}</p></div><button onClick={logout} className="btn secondary">ログアウト</button></header>{message && <p className="mb-3 rounded-xl bg-yellow-50 p-3 text-yellow-800">{message}</p>}<nav className="mb-4 flex flex-wrap gap-2">{(['calendar','list','masters'] as Tab[]).map((t) => <button key={t} onClick={() => setTab(t)} className={`btn ${tab === t ? '' : 'secondary'}`}>{t === 'calendar' ? 'カレンダー' : t === 'list' ? '予定一覧・検索' : 'マスタ管理'}</button>)}</nav>{tab === 'calendar' && <Calendar mode={mode} setMode={setMode} viewDate={viewDate} setViewDate={setViewDate} schedules={filteredSchedules} users={users} types={scheduleTypes} open={setDraft} exportCsv={exportCsv} query={query} setQuery={setQuery} />}{tab === 'list' && <ScheduleList schedules={filteredSchedules} users={users} types={scheduleTypes} open={setDraft} query={query} setQuery={setQuery} exportCsv={exportCsv} />}{tab === 'masters' && <Masters isAdmin={isAdmin} departments={departments} users={users} masters={masters} items={items} edit={setMasterEdit} />}{draft && <ScheduleModal draft={draft} setDraft={setDraft} users={users} types={scheduleTypes} save={saveSchedule} remove={deleteSchedule} />}{masterEdit && <MasterModal edit={masterEdit} setEdit={setMasterEdit} departments={departments} masters={masters} save={saveMaster} remove={deleteMaster} />}</main>;
}

function SearchBar({ query, setQuery, exportCsv }: { query: string; setQuery: (v: string) => void; exportCsv: () => void }) { return <div className="flex flex-wrap gap-2"><input className="input max-w-sm" placeholder="予定検索（件名・担当・区分・場所・メモ）" value={query} onChange={(e) => setQuery(e.target.value)} /><button className="btn secondary" onClick={exportCsv}>CSV出力</button></div>; }
function ScheduleBadge({ s, types }: { s: Schedule; types: MasterItem[] }) { const t = types.find((x) => x.id === s.schedule_type_id); return <span className={`event ${s.status}`} style={{ background: t?.value || undefined }}>{s.start_time?.slice(0,5) || '終日'} {t ? `【${t.name}】` : ''} {s.title}</span>; }
function TodayTomorrowPanel({ schedules, users, types, open }: { schedules: Schedule[]; users: UserProfile[]; types: MasterItem[]; open: (s: DraftSchedule) => void }) {
  const today = ymd(new Date());
  const tomorrow = ymd(addDays(new Date(), 1));
  const renderGroup = (label: string, date: string) => {
    const daySchedules = schedules.filter((s) => s.schedule_date === date).sort((a,b)=>(a.start_time||'').localeCompare(b.start_time||''));
    return <div className="mb-4"><h3 className="mb-2 text-lg font-bold">{label}<span className="ml-2 text-sm font-normal text-gray-500">{date}</span></h3><div className="grid gap-2">{daySchedules.length === 0 ? <p className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-500">予定はありません。</p> : daySchedules.map((s) => { const type = types.find((t) => t.id === s.schedule_type_id); return <button key={s.id} onClick={() => open({ ...s })} className="text-left rounded-xl border border-gray-200 bg-white p-3 hover:bg-blue-50"><div className="font-bold">{s.title}</div><div className="mt-1 text-sm text-gray-600">時間：{s.start_time?.slice(0,5) || '終日'}{s.end_time ? `〜${s.end_time.slice(0,5)}` : ''}</div><div className="text-sm text-gray-600">担当：{users.find((u) => u.id === s.owner_id)?.name || '未設定'}</div>{type && <div className="mt-1 inline-block rounded-md px-2 py-1 text-xs" style={{ background: type.value || '#f3f4f6' }}>{type.name}</div>}</button>; })}</div></div>;
  };
  return <aside className="card p-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-auto">{renderGroup('今日の予定', today)}{renderGroup('明日の予定', tomorrow)}</aside>;
}
function Calendar({ mode, setMode, viewDate, setViewDate, schedules, users, types, open, query, setQuery, exportCsv }: { mode: CalendarMode; setMode: (m: CalendarMode) => void; viewDate: Date; setViewDate: (d: Date) => void; schedules: Schedule[]; users: UserProfile[]; types: MasterItem[]; open: (s: DraftSchedule) => void; query: string; setQuery: (v: string) => void; exportCsv: () => void }) {
  const y = viewDate.getFullYear(), m = viewDate.getMonth(); const days = mode === 'month' ? monthDays(viewDate) : mode === 'week' ? weekDays(viewDate) : [viewDate];
  const title = mode === 'month' ? `${y}年 ${m + 1}月` : mode === 'week' ? `${ymd(days[0])} 〜 ${ymd(days[6])}` : ymd(viewDate);
  const move = (n: number) => setViewDate(mode === 'month' ? new Date(y, m + n, 1) : addDays(viewDate, n * (mode === 'week' ? 7 : 1)));
  return <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]"><section className="card overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 p-4"><div className="flex items-center gap-2"><button className="btn secondary" onClick={() => move(-1)}>前</button><h2 className="text-xl font-bold">{title}</h2><button className="btn secondary" onClick={() => move(1)}>次</button></div><div className="flex gap-2"><button className={`btn ${mode==='month'?'':'secondary'}`} onClick={() => setMode('month')}>月</button><button className={`btn ${mode==='week'?'':'secondary'}`} onClick={() => setMode('week')}>週</button><button className={`btn ${mode==='day'?'':'secondary'}`} onClick={() => setMode('day')}>日</button><button className="btn" onClick={() => open({ title: '', schedule_date: ymd(new Date()), status: 'planned' })}>予定を追加</button></div><SearchBar query={query} setQuery={setQuery} exportCsv={exportCsv} /></div><div className="calendar-grid border-t border-gray-200" style={{ gridTemplateColumns: `repeat(${mode === 'day' ? 1 : 7}, minmax(0, 1fr))` }}>{(mode === 'day' ? [''] : ['日','月','火','水','木','金','土']).map((w, i) => <div key={i} className={`p-2 text-center font-bold ${i===0?'text-red-500':i===6?'text-blue-500':'text-gray-500'}`}>{w}</div>)}{days.map((d) => { const date = ymd(d); const ev = schedules.filter((s) => s.schedule_date === date).sort((a,b)=>(a.start_time||'').localeCompare(b.start_time||'')); const dow = d.getDay(); return <div key={date} onDoubleClick={() => open({ title: '', schedule_date: date, status: 'planned' })} className={`day ${d.getMonth() !== m && mode==='month' ? 'text-gray-400 bg-gray-50' : ''} ${dow===0?'sunday':dow===6?'saturday':''}`}><b>{mode === 'day' ? date : d.getDate()}</b>{ev.map((s) => <div key={s.id} onClick={() => open({ ...s })}><ScheduleBadge s={s} types={types} /></div>)}</div>; })}</div></section><TodayTomorrowPanel schedules={schedules} users={users} types={types} open={open} /></div>;
}function ScheduleList({ schedules, users, types, open, query, setQuery, exportCsv }: { schedules: Schedule[]; users: UserProfile[]; types: MasterItem[]; open: (s: DraftSchedule) => void; query: string; setQuery: (v: string) => void; exportCsv: () => void }) { return <section className="card p-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">予定一覧</h2><SearchBar query={query} setQuery={setQuery} exportCsv={exportCsv} /></div><div className="grid gap-3">{schedules.map((s) => <button key={s.id} onClick={() => open({ ...s })} className="text-left rounded-xl border border-gray-200 bg-white p-3 hover:bg-blue-50"><b>{s.title}</b><p className="text-sm text-gray-500">{s.schedule_date} {s.start_time?.slice(0,5) || '終日'} / {types.find((t)=>t.id===s.schedule_type_id)?.name || '区分なし'} / {users.find((u) => u.id === s.owner_id)?.name || '未設定'} / {statusLabel[s.status]}</p></button>)}{schedules.length === 0 && <p className="text-gray-500">予定はありません。</p>}</div></section>; }
function Masters({ isAdmin, departments, users, masters, items, edit }: { isAdmin: boolean; departments: Department[]; users: UserProfile[]; masters: MasterDefinition[]; items: MasterItem[]; edit: (e: MasterEdit) => void }) { return <section className="grid gap-4 lg:grid-cols-2">{!isAdmin && <div className="card p-4 lg:col-span-2 border-amber-200 bg-amber-50 text-amber-800">現在の利用者は「管理者」権限ではないため、追加・編集ボタンは表示されません。Supabase の user_profiles で role を「管理者」に変更してください。</div>}<div className="card p-4"><div className="flex justify-between"><h2 className="text-xl font-bold">利用者マスタ</h2>{isAdmin && <button className="btn" onClick={() => edit({ kind:'user' })}>追加</button>}</div>{users.map((u) => <p key={u.id} className="mt-2 rounded-lg border p-2"><b>{u.name}</b> / {u.email} / {u.role} {isAdmin && <button className="btn secondary ml-2" onClick={() => edit({ kind:'user', data:u })}>編集</button>}</p>)}</div><div className="card p-4"><div className="flex justify-between"><h2 className="text-xl font-bold">部署マスタ</h2>{isAdmin && <button className="btn" onClick={() => edit({ kind:'department' })}>追加</button>}</div>{departments.map((d) => <p key={d.id} className="mt-2 rounded-lg border p-2"><b>{d.name}</b> {d.memo} {isAdmin && <button className="btn secondary ml-2" onClick={() => edit({ kind:'department', data:d })}>編集</button>}</p>)}</div><div className="card p-4 lg:col-span-2"><div className="flex justify-between"><h2 className="text-xl font-bold">追加マスタ・分類</h2>{isAdmin && <button className="btn" onClick={() => edit({ kind:'definition' })}>マスタ追加</button>}</div>{masters.map((m) => <div key={m.id} className="mt-4 rounded-xl border p-3"><div className="flex flex-wrap justify-between gap-2"><b>{m.name} <span className="text-gray-400">{m.code}</span></b><span>{isAdmin && <><button className="btn secondary" onClick={() => edit({ kind:'definition', data:m })}>マスタ編集</button><button className="btn ml-2" onClick={() => edit({ kind:'item', data:{ master_definition_id:m.id, active:true, sort_order:10 } })}>項目追加</button></>}</span></div>{items.filter((i)=>i.master_definition_id===m.id).map((i)=><p key={i.id} className="mt-2 inline-block rounded-lg border p-2 mr-2" style={{background:i.value||undefined}}>{i.name} {isAdmin && <button className="btn secondary ml-2" onClick={() => edit({ kind:'item', data:i })}>編集</button>}</p>)}</div>)}</div></section>; }
function ScheduleModal({ draft, setDraft, users, types, save, remove }: { draft: DraftSchedule; setDraft: (d: DraftSchedule | null) => void; users: UserProfile[]; types: MasterItem[]; save: (e: React.FormEvent) => void; remove: (id: string) => void }) {
  const update = (k: keyof DraftSchedule, v: string) => setDraft({ ...draft, [k]: v });
  const isAllDay = !draft.start_time && !draft.end_time;
  const setAllDay = (checked: boolean) => {
    if (checked) setDraft({ ...draft, start_time: null, end_time: null });
    else setDraft({ ...draft, start_time: '09:00', end_time: '10:00' });
  };
  return <div className="fixed inset-0 z-10 grid place-items-center bg-black/50 p-4"><section className="card max-h-[92vh] w-full max-w-2xl overflow-auto p-5"><h2 className="text-xl font-bold">{draft.id ? '予定編集' : '予定追加'}</h2><form onSubmit={save} className="mt-4 grid gap-3 md:grid-cols-2"><div className="md:col-span-2"><label className="label">件名</label><input className="input" required value={draft.title} onChange={(e) => update('title', e.target.value)} /></div><div><label className="label">日付</label><input className="input" type="date" required value={draft.schedule_date} onChange={(e) => update('schedule_date', e.target.value)} /></div><div><label className="label">予定区分</label><select className="input" value={draft.schedule_type_id ?? ''} onChange={(e) => update('schedule_type_id', e.target.value)}><option value="">未設定</option>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div><div className="md:col-span-2 rounded-xl border border-gray-200 bg-gray-50 p-3"><label className="inline-flex items-center gap-2 font-bold"><input type="checkbox" checked={isAllDay} onChange={(e) => setAllDay(e.target.checked)} />終日</label><p className="mt-1 text-xs text-gray-500">終日の場合、開始・終了時刻は保存されません。</p></div><div><label className="label">開始</label><input className="input" type="time" step="1800" disabled={isAllDay} value={draft.start_time ?? ''} onChange={(e) => update('start_time', e.target.value)} /></div><div><label className="label">終了</label><input className="input" type="time" step="1800" disabled={isAllDay} value={draft.end_time ?? ''} onChange={(e) => update('end_time', e.target.value)} /></div><div><label className="label">担当者</label><select className="input" value={draft.owner_id ?? ''} onChange={(e) => update('owner_id', e.target.value)}><option value="">未設定</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div><div><label className="label">場所</label><input className="input" value={draft.place ?? ''} onChange={(e) => update('place', e.target.value)} /></div><div className="md:col-span-2"><label className="label">状態</label><select className="input" value={draft.status} onChange={(e) => update('status', e.target.value)}><option value="planned">予定</option><option value="done">完了</option><option value="cancelled">中止</option></select></div><div className="md:col-span-2"><label className="label">メモ</label><textarea className="input min-h-24" value={draft.memo ?? ''} onChange={(e) => update('memo', e.target.value)} /></div><div className="md:col-span-2 flex flex-wrap gap-2"><button className="btn">保存</button>{draft.id && <button type="button" className="btn danger" onClick={() => remove(draft.id!)}>削除</button>}<button type="button" className="btn secondary" onClick={() => setDraft(null)}>閉じる</button></div></form></section></div>;
}function MasterModal({ edit, setEdit, departments, masters, save, remove }: { edit: MasterEdit; setEdit: (e:null)=>void; departments: Department[]; masters: MasterDefinition[]; save: (k: MasterEdit['kind'], d: Record<string,string|boolean|number|null>)=>void; remove: (k: MasterEdit['kind'], id?: string)=>void }) { const d = edit.data ?? {}; const kind = edit.kind; const submit = (e: React.FormEvent<HTMLFormElement>) => { e.preventDefault(); const fd = new FormData(e.currentTarget); const data: Record<string,string|boolean|number|null> = Object.fromEntries(fd.entries()) as Record<string,string>; if ('active' in data) data.active = data.active === 'true'; if ('sort_order' in data) data.sort_order = Number(data.sort_order || 0); save(kind, data); }; return <div className="fixed inset-0 z-10 grid place-items-center bg-black/50 p-4"><section className="card max-h-[92vh] w-full max-w-xl overflow-auto p-5"><h2 className="text-xl font-bold">マスタ編集</h2><form onSubmit={submit} className="mt-4 grid gap-3"><input type="hidden" name="id" value={d.id ?? ''} />{kind==='department' && <><label className="label">部署名</label><input name="name" className="input" required defaultValue={(d as Department).name ?? ''}/><label className="label">メモ</label><textarea name="memo" className="input" defaultValue={(d as Department).memo ?? ''}/></>}{kind==='user' && <><p className="text-sm text-amber-700">新規利用者は先にSupabase Authenticationでユーザー作成し、そのUser UIDをidに入れてください。</p><label className="label">Auth User ID</label><input name="id" className="input" required defaultValue={d.id ?? ''}/><label className="label">氏名</label><input name="name" className="input" required defaultValue={(d as UserProfile).name ?? ''}/><label className="label">メール</label><input name="email" className="input" type="email" required defaultValue={(d as UserProfile).email ?? ''}/><label className="label">部署</label><select name="department_id" className="input" defaultValue={(d as UserProfile).department_id ?? ''}><option value="">未設定</option>{departments.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select><label className="label">権限</label><select name="role" className="input" defaultValue={(d as UserProfile).role ?? '一般'}><option>一般</option><option>管理者</option></select><label className="label">有効</label><select name="active" className="input" defaultValue={String((d as UserProfile).active ?? true)}><option value="true">有効</option><option value="false">無効</option></select></>}{kind==='definition' && <><label className="label">マスタ名</label><input name="name" className="input" required defaultValue={(d as MasterDefinition).name ?? ''}/><label className="label">コード</label><input name="code" className="input" defaultValue={(d as MasterDefinition).code ?? ''}/><label className="label">説明</label><textarea name="description" className="input" defaultValue={(d as MasterDefinition).description ?? ''}/></>}{kind==='item' && <><label className="label">対象マスタ</label><select name="master_definition_id" className="input" required defaultValue={(d as MasterItem).master_definition_id ?? ''}>{masters.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select><label className="label">項目名</label><input name="name" className="input" required defaultValue={(d as MasterItem).name ?? ''}/><label className="label">色・値（例 #dbeafe）</label><input name="value" className="input" defaultValue={(d as MasterItem).value ?? ''}/><label className="label">並び順</label><input name="sort_order" type="number" className="input" defaultValue={(d as MasterItem).sort_order ?? 0}/><label className="label">有効</label><select name="active" className="input" defaultValue={String((d as MasterItem).active ?? true)}><option value="true">有効</option><option value="false">無効</option></select></>}<div className="flex flex-wrap gap-2"><button className="btn">保存</button>{d.id && <button type="button" className="btn danger" onClick={() => remove(kind, d.id)}>削除</button>}<button type="button" className="btn secondary" onClick={() => setEdit(null)}>閉じる</button></div></form></section></div>; }


