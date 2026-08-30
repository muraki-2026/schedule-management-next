'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { Department, EmailGroup, EmailGroupMember, EmailRecipient, MasterDefinition, MasterItem, Schedule, UserProfile } from '@/types/database';

type Tab = 'calendar' | 'list' | 'masters';
type CalendarMode = 'month' | 'week' | 'day';
type MonthLayout = 'normal' | 'twoColumn';
type MasterEdit = { kind: 'department'; data?: Partial<Department> } | { kind: 'user'; data?: Partial<UserProfile> } | { kind: 'definition'; data?: Partial<MasterDefinition> } | { kind: 'item'; data?: Partial<MasterItem> };
type DraftSchedule = Partial<Schedule> & { title: string; schedule_date: string; status: Schedule['status']; schedule_type_manual?: string; assignee_manual?: string; place_manual?: string; email_send?: boolean; email_send_on_update?: boolean; email_target_type?: 'recipient' | 'group'; email_recipient_id?: string; email_group_id?: string };

const demoDepartments: Department[] = [{ id: 'dept-demo', name: '管理部', memo: 'デモ部署' }];
const demoUsers: UserProfile[] = [{ id: 'user-demo', name: '管理者', email: 'admin@example.com', department_id: 'dept-demo', role: '管理者', active: true }];
const demoDefinitions: MasterDefinition[] = [{ id: 'def-type', name: '予定区分', code: 'schedule_type', description: '予定分類' }];
const demoItems: MasterItem[] = [
  { id: 'type-meeting', master_definition_id: 'def-type', name: '会議', value: '#dbeafe', sort_order: 10, active: true },
  { id: 'type-out', master_definition_id: 'def-type', name: '外出', value: '#dcfce7', sort_order: 20, active: true },
  { id: 'type-vacation', master_definition_id: 'def-type', name: '休暇', value: '#fee2e2', sort_order: 30, active: true },
];
const statusLabel = { planned: '予定', done: '完了', cancelled: '中止' } as const;
const colorSamples = ['#dbeafe','#dcfce7','#fef3c7','#ede9fe','#fee2e2','#f3f4f6','#cffafe','#fae8ff','#ffedd5','#e0f2fe'];

function pad(n: number) { return String(n).padStart(2, '0'); }
function ymd(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function monthDays(date: Date) { const y = date.getFullYear(), m = date.getMonth(); const start = new Date(y, m, 1 - new Date(y, m, 1).getDay()); return Array.from({ length: 42 }, (_, i) => addDays(start, i)); }
function weekDays(date: Date) { return Array.from({ length: 7 }, (_, i) => addDays(date, i - date.getDay())); }
function csvCell(v: unknown) { return `"${String(v ?? '').replaceAll('"', '""')}"`; }
function timeOptions() { return Array.from({ length: 48 }, (_, i) => `${pad(Math.floor(i / 2))}:${i % 2 === 0 ? '00' : '30'}`); }
function downloadCsv(filename: string, rows: unknown[][]) { const csv = rows.map((r) => r.map(csvCell).join(',')).join('\n'); const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); URL.revokeObjectURL(a.href); }

export default function Home() {
  const [tab, setTab] = useState<Tab>('calendar');
  const [mode, setMode] = useState<CalendarMode>('month');
  const [monthLayout, setMonthLayout] = useState<MonthLayout>('normal');
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
  const [emailRecipients, setEmailRecipients] = useState<EmailRecipient[]>([]);
  const [emailGroups, setEmailGroups] = useState<EmailGroup[]>([]);
  const [emailGroupMembers, setEmailGroupMembers] = useState<EmailGroupMember[]>([]);
  const [calendarWidth, setCalendarWidth] = useState(1);

  const currentUser = users.find((u) => u.id === sessionUserId) ?? users[0];
  const isAdmin = currentUser?.role === '管理者';
  const scheduleTypeDef = masters.find((m) => m.code === 'schedule_type');
  const scheduleTypes = items.filter((i) => i.master_definition_id === scheduleTypeDef?.id && i.active).sort((a, b) => a.sort_order - b.sort_order);
  const locationTypeDef = masters.find((m) => m.code === 'location_type');
  const locationTypes = items.filter((i) => i.master_definition_id === locationTypeDef?.id && i.active).sort((a, b) => a.sort_order - b.sort_order);
  const assigneeDef = masters.find((m) => m.code === 'assignee') ?? masters.find((m) => m.name === '担当者') ?? masters.find((m) => m.name === '担当者マスタ') ?? masters.find((m) => ['person_in_charge','staff','tantosha'].includes(m.code ?? ''));
  const assignees = items.filter((i) => i.master_definition_id === assigneeDef?.id && i.active).sort((a, b) => a.sort_order - b.sort_order);
  const assigneeDisplayDef = masters.find((m) => m.code === 'assignee_dashboard_display' || m.name === '担当者別予定表示');
  const assigneeDisplayItems = items.filter((i) => i.master_definition_id === assigneeDisplayDef?.id && i.active);
  const dashboardAssignees = assigneeDisplayItems.length ? assignees.filter((a) => assigneeDisplayItems.some((x) => x.name === a.name || x.value === a.id)) : assignees;
  const filteredSchedules = useMemo(() => {
    const q = query.trim().toLowerCase();
    return schedules.filter((s) => {
      if (!q) return true;
      const user = users.find((u) => u.id === s.owner_id)?.name ?? '';
      const type = items.find((i) => i.id === s.schedule_type_id)?.name ?? '';
      return [s.title, s.schedule_date, s.place, s.memo, user, type].some((x) => String(x ?? '').toLowerCase().includes(q));
    });
  }, [query, schedules, users, items]);
  const navWidthValue = Math.max(0.8, Math.min(2.5, calendarWidth));
  const setNavWidth = (v: number) => setCalendarWidth(Math.round(Math.max(0.8, Math.min(2.5, v)) * 10) / 10);
  const navCalendarPixelWidth = Math.round(860 * navWidthValue);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => { if (data.session?.user.id) setSessionUserId(data.session.user.id); });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setSessionUserId(session?.user.id ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);
  useEffect(() => { if (sessionUserId) loadData(); }, [sessionUserId]);

  async function loadData() {
    if (!supabase) return;
    const [d, u, s, m, mi, er, eg, egm] = await Promise.all([
      supabase.from('departments').select('*').order('name'),
      supabase.from('user_profiles').select('*').order('name'),
      supabase.from('schedules').select('*').order('schedule_date'),
      supabase.from('master_definitions').select('*').order('name'),
      supabase.from('master_items').select('*').order('sort_order'),
      supabase.from('email_recipients').select('*').order('sort_order'),
      supabase.from('email_groups').select('*').order('sort_order'),
      supabase.from('email_group_members').select('*'),
    ]);
    if (d.data) setDepartments(d.data); if (u.data) setUsers(u.data); if (s.data) setSchedules(s.data as Schedule[]); if (m.data) setMasters(m.data); if (mi.data) setItems(mi.data); if (er.data) setEmailRecipients(er.data as EmailRecipient[]); if (eg.data) setEmailGroups(eg.data as EmailGroup[]); if (egm.data) setEmailGroupMembers(egm.data as EmailGroupMember[]);
    const err = d.error || u.error || s.error || m.error || mi.error || er.error || eg.error || egm.error; if (err) setMessage(err.message);
  }

  async function login(e: React.FormEvent) { e.preventDefault(); setMessage(''); if (!supabase) { setSessionUserId('user-demo'); setMessage('Supabase未設定のためデモログインしました。'); return; } const { error } = await supabase.auth.signInWithPassword({ email, password }); if (error) setMessage(error.message); }
  async function logout() { if (supabase) await supabase.auth.signOut(); setSessionUserId(null); }

  async function ensureMasterItem(def: MasterDefinition | undefined, name: string | undefined) {
    const itemName = name?.trim();
    if (!itemName) return null;
    const existing = items.find((i) => i.master_definition_id === def?.id && i.name === itemName);
    return existing?.id ?? null;
  }

  async function saveSchedule(e: React.FormEvent) {
    e.preventDefault(); if (!draft) return;
    const scheduleTypeId = draft.schedule_type_id === '__manual__' ? await ensureMasterItem(scheduleTypeDef, draft.schedule_type_manual) : draft.schedule_type_id || null;
    const assigneeId = draft.assignee_id === '__manual__' ? await ensureMasterItem(assigneeDef, draft.assignee_manual) : draft.assignee_id || null;
    const placeId = draft.place === '__manual__' ? await ensureMasterItem(locationTypeDef, draft.place_manual) : draft.place || null;
    const payload = { title: draft.title, schedule_date: draft.schedule_date, start_time: draft.start_time || null, end_time: draft.end_time || null, owner_id: null, assignee_id: assigneeId, assignee_text: draft.assignee_id === '__manual__' ? (draft.assignee_manual || null) : null, schedule_type_id: scheduleTypeId, schedule_type_text: draft.schedule_type_id === '__manual__' ? (draft.schedule_type_manual || null) : null, place: placeId, place_text: draft.place === '__manual__' ? (draft.place_manual || null) : null, memo: draft.memo || null, status: draft.status, created_by: currentUser?.id || null };
    if (!supabase) { if (draft.id) setSchedules((v) => v.map((s) => s.id === draft.id ? { ...s, ...payload } as Schedule : s)); else setSchedules((v) => [...v, { id: crypto.randomUUID(), ...payload } as Schedule]); setDraft(null); return; }
    const res = draft.id ? await supabase.from('schedules').update(payload).eq('id', draft.id).select('id').single() : await supabase.from('schedules').insert(payload).select('id').single();
    if (res.error) setMessage(res.error.message); else { const scheduleId = (res.data as { id?: string } | null)?.id ?? draft.id ?? null; const shouldSendEmail = !draft.id ? draft.email_send : draft.email_send && draft.email_send_on_update; if (shouldSendEmail) await sendScheduleEmail(scheduleId, draft, payload, Boolean(draft.id)); setDraft(null); await loadData(); }
  }
  function scheduleEmailText(schedule: Partial<Schedule> & { title: string; schedule_date: string }, isUpdate = false) {
    const assignee = schedule.assignee_id ? items.find((i) => i.id === schedule.assignee_id)?.name : schedule.assignee_text;
    const type = schedule.schedule_type_id ? items.find((i) => i.id === schedule.schedule_type_id)?.name : schedule.schedule_type_text;
    const place = schedule.place ? items.find((i) => i.id === schedule.place)?.name : schedule.place_text;
    return [isUpdate ? '以下の予定が更新されました。' : '以下の予定が登録されました。', '', '件名：' + schedule.title, '日付：' + schedule.schedule_date, '時間：' + ((schedule.start_time?.slice(0,5) || '終日') + (schedule.end_time ? '〜' + schedule.end_time.slice(0,5) : '')), '担当者：' + (assignee || '未設定'), '予定区分：' + (type || '未設定'), '場所：' + (place || '未設定'), 'メモ：' + (schedule.memo || '')].join('\n');
  }
  function selectedEmailRecipients(draft: DraftSchedule) {
    if (!draft.email_send) return [] as EmailRecipient[];
    if (draft.email_target_type === 'group' && draft.email_group_id) {
      const memberIds = emailGroupMembers.filter((m) => m.group_id === draft.email_group_id).map((m) => m.recipient_id);
      return emailRecipients.filter((r) => r.active && memberIds.includes(r.id));
    }
    if (draft.email_recipient_id) return emailRecipients.filter((r) => r.active && r.id === draft.email_recipient_id);
    return [] as EmailRecipient[];
  }
  async function sendScheduleEmail(scheduleId: string | null, draft: DraftSchedule, saved: Partial<Schedule> & { title: string; schedule_date: string }, isUpdate = false) {
    const recipients = selectedEmailRecipients(draft);
    if (!recipients.length) { setMessage('メール送信先が選択されていません。'); return; }
    const subject = '【予定通知】' + saved.title;
    const body = scheduleEmailText(saved);
    const res = await fetch('/api/send-schedule-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipients: recipients.map((r) => ({ name: r.name, email: r.email })), subject, text: body }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setMessage(json.error || 'メール送信に失敗しました。'); return; }
    if (supabase) {
      const logs = (json.results ?? []).map((x: { recipient: EmailRecipient; ok: boolean; error?: string }) => ({ schedule_id: scheduleId, recipient_name: x.recipient?.name, recipient_email: x.recipient?.email, subject, body, status: x.ok ? 'sent' : 'error', error_message: x.error || null, sent_at: x.ok ? new Date().toISOString() : null }));
      if (logs.length) await supabase.from('schedule_email_logs').insert(logs);
    }
    setMessage('予定を保存し、メール送信処理を実行しました。');
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
  async function addEmailRecipientFromForm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isAdmin || !supabase) return setMessage('管理者のみ編集できます。');
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get('name') ?? '').trim();
    const email = String(fd.get('email') ?? '').trim();
    const groupId = String(fd.get('group_id') ?? '').trim();
    const newGroupName = String(fd.get('new_group_name') ?? '').trim();
    if (!name || !email) return setMessage('名前とメールアドレスを入力してください。');
    const { data: recipient, error } = await supabase.from('email_recipients').insert({ name, email, active: true, sort_order: emailRecipients.length + 1 }).select('id').single();
    if (error) return setMessage(error.message);
    let targetGroupId = groupId || '';
    if (newGroupName) {
      const existingGroup = emailGroups.find((g) => g.name === newGroupName);
      if (existingGroup) targetGroupId = existingGroup.id;
      else {
        const { data: group, error: groupError } = await supabase.from('email_groups').insert({ name: newGroupName, active: true, sort_order: emailGroups.length + 1 }).select('id').single();
        if (groupError) return setMessage(groupError.message);
        targetGroupId = group?.id ?? '';
      }
    }
    if (targetGroupId && recipient?.id) {
      const { error: memberError } = await supabase.from('email_group_members').insert({ group_id: targetGroupId, recipient_id: recipient.id });
      if (memberError) return setMessage(memberError.message);
    }
    e.currentTarget.reset();
    await loadData();
    setMessage('メール送信先を追加しました。');
  }
  async function addEmailGroup() {
    if (!isAdmin || !supabase) return setMessage('管理者のみ編集できます。');
    const name = prompt('グループ名を入力してください');
    if (!name) return;
    const { error } = await supabase.from('email_groups').insert({ name, active: true, sort_order: emailGroups.length + 1 });
    if (error) setMessage(error.message); else await loadData();
  }
  async function addEmailGroupMember(groupId: string) {
    if (!isAdmin || !supabase) return setMessage('管理者のみ編集できます。');
    const list = emailRecipients.map((r, i) => (i + 1) + ': ' + r.name + ' / ' + r.email).join('\n');
    const selected = prompt('追加する送信先番号を入力してください\n' + list);
    const idx = Number(selected) - 1;
    const recipient = emailRecipients[idx];
    if (!recipient) return;
    const { error } = await supabase.from('email_group_members').insert({ group_id: groupId, recipient_id: recipient.id });
    if (error) setMessage(error.message); else await loadData();
  }
  async function removeEmailGroupMember(groupId: string, recipientId: string) {
    if (!isAdmin || !supabase || !confirm('このグループメンバーを削除しますか？')) return;
    const { error } = await supabase.from('email_group_members').delete().eq('group_id', groupId).eq('recipient_id', recipientId);
    if (error) setMessage(error.message); else await loadData();
  }
  async function deleteEmailRecipient(id: string) {
    if (!isAdmin || !supabase || !confirm('この送信先を削除しますか？')) return;
    const { error } = await supabase.from('email_recipients').delete().eq('id', id);
    if (error) setMessage(error.message); else await loadData();
  }
  async function deleteEmailGroup(id: string) {
    if (!isAdmin || !supabase || !confirm('このグループを削除しますか？')) return;
    const { error } = await supabase.from('email_groups').delete().eq('id', id);
    if (error) setMessage(error.message); else await loadData();
  }
  function exportCsv() { downloadCsv(`schedules-${ymd(new Date())}.csv`, [['日付','開始','終了','件名','区分','担当者','場所','状態','メモ'], ...filteredSchedules.map((s) => [s.schedule_date, s.start_time?.slice(0,5) ?? '', s.end_time?.slice(0,5) ?? '', s.title, scheduleTypeName(s, items), assigneeName(s, items, users), placeName(s, items), statusLabel[s.status], s.memo ?? ''])]); }
  function parseCsv(text: string) {
    const rows: string[][] = []; let row: string[] = [], cell = '', inQuotes = false;
    for (let i = 0; i < text.length; i++) { const ch = text[i], next = text[i + 1];
      if (ch === '"' && inQuotes && next === '"') { cell += '"'; i++; continue; }
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { row.push(cell.trim()); cell = ''; continue; }
      if ((ch === '\n' || ch === '\r') && !inQuotes) { if (ch === '\r' && next === '\n') i++; row.push(cell.trim()); cell = ''; if (row.some((v) => v !== '')) rows.push(row); row = []; continue; }
      cell += ch; } row.push(cell.trim()); if (row.some((v) => v !== '')) rows.push(row); return rows;
  }
  function rowObjects(rows: string[][]) { const headers = rows[0]?.map((h) => h.trim()) ?? []; return rows.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? '']))); }
  async function ensureMasterDefinition(code: string, name: string) {
    return masters.find((m) => m.code === code || m.name === name)?.id ?? null;
  }
  async function ensureMasterItemByCode(code: string, defName: string, itemName: string) {
    const name = itemName?.trim();
    if (!name) return null;
    const defId = masters.find((m) => m.code === code || m.name === defName)?.id ?? null;
    if (!defId) return null;
    return items.find((i) => i.master_definition_id === defId && i.name === name)?.id ?? null;
  }
  function normalizeStatus(v: string): Schedule['status'] { if (v === '完了' || v === 'done') return 'done'; if (v === '中止' || v === 'キャンセル' || v === 'cancelled') return 'cancelled'; return 'planned'; }
  async function importSchedulesCsv(file: File) { const rows = rowObjects(parseCsv(await file.text())); if (!rows.length) return setMessage('CSVに取り込む行がありません。'); let inserted = 0, skipped = 0, errors = 0; for (const r of rows) { const date = String(r['日付'] ?? r['date'] ?? '').trim(); const title = String(r['件名'] ?? r['title'] ?? '').trim(); if (!date || !title) { errors++; continue; } const start = String(r['開始'] ?? r['start'] ?? '').trim() || null; const end = String(r['終了'] ?? r['end'] ?? '').trim() || null; const typeId = await ensureMasterItemByCode('schedule_type', '予定区分', String(r['予定区分'] ?? r['区分'] ?? '').trim()); const assigneeId = await ensureMasterItemByCode('assignee', '担当者', String(r['担当者'] ?? '').trim()); const placeId = await ensureMasterItemByCode('location_type', '場所', String(r['場所'] ?? '').trim()); if ((String(r['予定区分'] ?? r['区分'] ?? '').trim() && !typeId) || (String(r['担当者'] ?? '').trim() && !assigneeId) || (String(r['場所'] ?? '').trim() && !placeId)) { errors++; continue; } const status = normalizeStatus(String(r['状態'] ?? '').trim()); const memo = String(r['メモ'] ?? r['memo'] ?? '').trim() || null; const duplicate = schedules.some((x) => x.schedule_date === date && (x.start_time?.slice(0,5) ?? '') === (start ?? '') && (x.end_time?.slice(0,5) ?? '') === (end ?? '') && x.title === title && (x.assignee_id ?? '') === (assigneeId ?? '')); if (duplicate) { skipped++; continue; } if (!supabase) { errors++; continue; } const { error } = await supabase.from('schedules').insert({ title, schedule_date: date, start_time: start, end_time: end, schedule_type_id: typeId, assignee_id: assigneeId, place: placeId, status, memo, owner_id: null, created_by: currentUser?.id ?? null }); if (error) errors++; else inserted++; } await loadData(); setMessage('予定CSV取込: 登録 ' + inserted + '件 / 重複スキップ ' + skipped + '件 / エラー ' + errors + '件'); }
  async function importMasterCsv(file: File) { const rows = rowObjects(parseCsv(await file.text())); if (!rows.length) return setMessage('CSVに取り込む行がありません。'); let inserted = 0, skipped = 0, errors = 0; for (const r of rows) { const code = String(r['マスタコード'] ?? r['code'] ?? '').trim(); const defName = String(r['マスタ名'] ?? r['master'] ?? code).trim(); const name = String(r['項目名'] ?? r['name'] ?? '').trim(); if (!code || !name) { errors++; continue; } const color = String(r['色'] ?? r['value'] ?? r['値'] ?? '').trim() || '#f3f4f6'; const defId = await ensureMasterDefinition(code, defName || code); if (!defId || !supabase) { errors++; continue; } if (items.some((i) => i.master_definition_id === defId && i.name === name)) { skipped++; continue; } const sort_order = Number(String(r['並び順'] ?? r['sort_order'] ?? '0')) || 0; const activeRaw = String(r['有効'] ?? r['active'] ?? 'true').toLowerCase(); const active = !['false','0','no','無効'].includes(activeRaw); const { error } = await supabase.from('master_items').insert({ master_definition_id: defId, name, value: color, sort_order, active }); if (error) errors++; else inserted++; } await loadData(); setMessage('マスタCSV取込: 登録 ' + inserted + '件 / 重複スキップ ' + skipped + '件 / エラー ' + errors + '件'); }

  if (!sessionUserId) return <main className="min-h-screen grid place-items-center p-4"><section className="card w-full max-w-md p-7"><h1 className="text-2xl font-bold">スケジュール管理</h1><p className="text-gray-500 mt-2">メールアドレスとパスワードでログイン</p>{!isSupabaseConfigured && <p className="mt-4 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">Supabase環境変数が未設定です。ログインボタンでデモ表示します。</p>}<form onSubmit={login} className="mt-5 space-y-4"><div><label className="label">メールアドレス</label><input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div><div><label className="label">パスワード</label><input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>{message && <p className="text-sm text-red-600">{message}</p>}<button className="btn w-full">ログイン</button></form></section></main>;

  return <main className="mx-auto max-w-[1600px] p-3 md:p-6"><header className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl font-bold">スケジュール管理</h1><p className="text-gray-500">{currentUser?.name} さん / {currentUser?.role}</p></div><button onClick={logout} className="btn secondary">ログアウト</button></header>{message && <p className="mb-3 rounded-xl bg-yellow-50 p-3 text-yellow-800">{message}</p>}<div className="mb-4 flex flex-wrap items-center gap-2"><nav className="flex flex-wrap gap-2">{(['calendar','list','masters'] as Tab[]).map((t) => <button key={t} onClick={() => setTab(t)} className={`btn ${tab === t ? '' : 'secondary'}`}>{t === 'calendar' ? 'カレンダー' : t === 'list' ? '予定一覧・検索' : 'マスタ管理'}</button>)}</nav>{tab === 'calendar' && <div className="ml-0 flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm md:ml-8"><span className="font-bold">月表示</span><button type="button" className={`btn ${monthLayout==='normal'?'':'secondary'} px-3 py-1`} onClick={() => setMonthLayout('normal')}>通常</button><button type="button" className={`btn ${monthLayout==='twoColumn'?'':'secondary'} px-3 py-1`} onClick={() => setMonthLayout('twoColumn')}>2列</button><span className="ml-4 font-bold">カレンダー幅</span><button type="button" className="btn secondary px-3 py-1" onClick={() => setNavWidth(navWidthValue - 0.1)}>−</button><input aria-label="カレンダー幅" type="range" min="0.8" max="2.5" step="0.1" value={navWidthValue} onChange={(e) => setNavWidth(Number(e.target.value))} /><button type="button" className="btn secondary px-3 py-1" onClick={() => setNavWidth(navWidthValue + 0.1)}>＋</button><span className="text-gray-500">{Math.round(navWidthValue * 100)}% / {navCalendarPixelWidth}px</span></div>}</div>{tab === 'calendar' && <Calendar mode={mode} setMode={setMode} viewDate={viewDate} setViewDate={setViewDate} schedules={filteredSchedules} users={users} assignees={dashboardAssignees} types={scheduleTypes} open={setDraft} exportCsv={exportCsv} query={query} setQuery={setQuery} calendarWidth={calendarWidth} setCalendarWidth={setCalendarWidth} monthLayout={monthLayout} setMonthLayout={setMonthLayout} />}{tab === 'list' && <ScheduleList schedules={filteredSchedules} users={users} assignees={assignees} types={scheduleTypes} open={setDraft} query={query} setQuery={setQuery} exportCsv={exportCsv} importSchedulesCsv={importSchedulesCsv} importMasterCsv={importMasterCsv} />}{tab === 'masters' && <Masters isAdmin={isAdmin} departments={departments} users={users} masters={masters} items={items} emailRecipients={emailRecipients} emailGroups={emailGroups} emailGroupMembers={emailGroupMembers} addEmailRecipientFromForm={addEmailRecipientFromForm} addEmailGroup={addEmailGroup} addEmailGroupMember={addEmailGroupMember} removeEmailGroupMember={removeEmailGroupMember} deleteEmailRecipient={deleteEmailRecipient} deleteEmailGroup={deleteEmailGroup} edit={setMasterEdit} />}{draft && <ScheduleModal draft={draft} setDraft={setDraft} assignees={assignees} types={scheduleTypes} locations={locationTypes} emailRecipients={emailRecipients} emailGroups={emailGroups} save={saveSchedule} remove={deleteSchedule} />}{masterEdit && <MasterModal edit={masterEdit} setEdit={setMasterEdit} departments={departments} masters={masters} save={saveMaster} remove={deleteMaster} />}</main>;
}

function SearchBar({ query, setQuery, exportCsv }: { query: string; setQuery: (v: string) => void; exportCsv: () => void }) { return <div className="flex flex-wrap gap-2"><input className="input max-w-sm" placeholder="予定検索（件名・担当・区分・場所・メモ）" value={query} onChange={(e) => setQuery(e.target.value)} /><button className="btn secondary" onClick={exportCsv}>CSV出力</button></div>; }
function scheduleTypeName(s: Schedule, types: MasterItem[]) { return types.find((t) => t.id === s.schedule_type_id)?.name || s.schedule_type_text || ''; }
function assigneeName(s: Schedule, assignees: MasterItem[], users: UserProfile[] = []) { return assignees.find((a) => a.id === s.assignee_id)?.name || s.assignee_text || users.find((u) => u.id === s.owner_id)?.name || ''; }
function placeName(s: Schedule, items: MasterItem[]) { return items.find((i) => i.id === s.place)?.name || s.place_text || s.place || ''; }
function scheduleColor(s: Schedule, assignees: MasterItem[], types: MasterItem[]) { return assignees.find((a) => a.id === s.assignee_id)?.value || types.find((t) => t.id === s.schedule_type_id)?.value || undefined; }
function ScheduleBadge({ s, assignees, types }: { s: Schedule; assignees: MasterItem[]; types: MasterItem[] }) { const type = scheduleTypeName(s, types); const assignee = assigneeName(s, assignees); return <span className={`event ${s.status}`} style={{ background: scheduleColor(s, assignees, types) }}>{s.start_time?.slice(0,5) || '終日'} {assignee ? `【${assignee}】` : ''} {type ? `【${type}】` : ''} {s.title}</span>; }
function TodayTomorrowPanel({ schedules, users, assignees, types, open }: { schedules: Schedule[]; users: UserProfile[]; assignees: MasterItem[]; types: MasterItem[]; open: (s: DraftSchedule) => void }) {
  const today = ymd(new Date());
  const tomorrow = ymd(addDays(new Date(), 1));
  const renderGroup = (label: string, date: string) => {
    const daySchedules = schedules.filter((s) => s.schedule_date === date).sort((a,b)=>(a.start_time||'').localeCompare(b.start_time||''));
    return <div className="mb-4"><h3 className="mb-2 text-lg font-bold">{label}<span className="ml-2 text-sm font-normal text-gray-500">{date}</span></h3><div className="grid gap-2">{daySchedules.length === 0 ? <p className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-500">予定はありません。</p> : daySchedules.map((s) => { const type = types.find((t) => t.id === s.schedule_type_id); return <button key={s.id} onClick={() => open({ ...s })} className="text-left rounded-xl border border-gray-200 bg-white p-3 hover:bg-blue-50"><div className="font-bold">{s.title}</div><div className="mt-1 text-sm text-gray-600">時間：{s.start_time?.slice(0,5) || '終日'}{s.end_time ? `〜${s.end_time.slice(0,5)}` : ''}</div><div className="text-sm text-gray-600">担当：{assigneeName(s, assignees, users) || '未設定'}</div>{type && <div className="mt-1 inline-block rounded-md px-2 py-1 text-xs" style={{ background: scheduleColor(s, assignees, types) || '#f3f4f6' }}>{type.name}</div>}</button>; })}</div></div>;
  };
  return <aside className="card p-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-auto">{renderGroup('今日の予定', today)}{renderGroup('明日の予定', tomorrow)}</aside>;
}
function AssigneeSchedulePanel({ schedules, assignees, types, open }: { schedules: Schedule[]; assignees: MasterItem[]; types: MasterItem[]; open: (s: DraftSchedule) => void }) {
  const today = ymd(new Date());
  const futureSchedules = schedules.filter((s) => s.schedule_date >= today).sort((a,b)=>(a.schedule_date + (a.start_time || '')).localeCompare(b.schedule_date + (b.start_time || '')));
  return <aside className="card p-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-auto"><h3 className="mb-3 text-lg font-bold">担当者別予定</h3>{assignees.length === 0 ? <p className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-500">表示対象の担当者がありません。</p> : <div className="grid gap-4">{assignees.map((a) => { const mine = futureSchedules.filter((s) => s.assignee_id === a.id).slice(0, 5); return <section key={a.id} className="overflow-hidden rounded-xl border border-blue-100 bg-white"><header className="border-b border-gray-200 px-3 py-2" style={{ background: a.value || '#eff6ff' }}><h4 className="font-bold text-gray-900">{a.name}</h4><p className="text-xs text-gray-700">最大5件表示</p></header>{mine.length === 0 ? <p className="p-3 text-sm text-gray-500">予定はありません。</p> : <ul className="divide-y divide-gray-100">{mine.map((s) => { const type = types.find((t) => t.id === s.schedule_type_id); return <li key={s.id}><button onClick={() => open({ ...s })} className="block w-full px-3 py-2 text-left hover:bg-blue-50"><div className="text-sm font-bold">{s.title}</div><div className="text-xs text-gray-600">{s.schedule_date} {s.start_time?.slice(0,5) || '終日'}{s.end_time ? `〜${s.end_time.slice(0,5)}` : ''}</div>{type && <span className="mt-1 inline-block rounded px-2 py-0.5 text-xs" style={{ background: scheduleColor(s, assignees, types) || '#f3f4f6' }}>{type.name}</span>}</button></li>; })}</ul>}</section>; })}</div>}<p className="mt-3 text-xs text-gray-500">各担当者ごとに今日以降の予定を最大5件表示します。表示対象は「担当者別予定表示」マスタで絞り込みできます。</p></aside>;
}
function Calendar({ mode, setMode, monthLayout, setMonthLayout, viewDate, setViewDate, schedules, users, assignees, types, open, query, setQuery, exportCsv, calendarWidth, setCalendarWidth }: { mode: CalendarMode; setMode: (m: CalendarMode) => void; monthLayout: MonthLayout; setMonthLayout: (m: MonthLayout) => void; viewDate: Date; setViewDate: (d: Date) => void; schedules: Schedule[]; users: UserProfile[]; assignees: MasterItem[]; types: MasterItem[]; open: (s: DraftSchedule) => void; query: string; setQuery: (v: string) => void; exportCsv: () => void; calendarWidth: number; setCalendarWidth: (v: number) => void }) {
  const y = viewDate.getFullYear(), m = viewDate.getMonth();
  const days = mode === 'month' ? monthDays(viewDate) : mode === 'week' ? weekDays(viewDate) : [viewDate];
  const title = mode === 'month' ? y + '年 ' + (m + 1) + '月' : mode === 'week' ? ymd(days[0]) + ' 〜 ' + ymd(days[6]) : ymd(viewDate);
  const move = (n: number) => setViewDate(mode === 'month' ? new Date(y, m + n, 1) : addDays(viewDate, n * (mode === 'week' ? 7 : 1)));
  const widthValue = Math.max(0.8, Math.min(2.5, calendarWidth));
  const calendarPixelWidth = Math.round(860 * widthValue);
  const gridColumns = calendarPixelWidth + 'px 300px 320px';
  const monthDateCount = new Date(y, m + 1, 0).getDate();
  const monthListDays = Array.from({ length: monthDateCount }, (_, i) => new Date(y, m, i + 1));
  const hourSlots = Array.from({ length: 24 }, (_, i) => (8 + i) % 24);
  const renderDayCell = (d: Date, compact = false) => {
    const date = ymd(d);
    const ev = schedules.filter((x) => x.schedule_date === date).sort((a,b)=>(a.start_time||'').localeCompare(b.start_time||''));
    const dow = d.getDay();
    const className = ['day', d.getMonth() !== m && mode === 'month' ? 'text-gray-400 bg-gray-50' : '', dow === 0 ? 'sunday' : dow === 6 ? 'saturday' : '', compact ? 'min-h-20' : ''].filter(Boolean).join(' ');
    const label = compact ? d.getDate() + '日 (' + ['日','月','火','水','木','金','土'][dow] + ')' : mode === 'day' ? date : d.getDate();
    return <div key={date} onDoubleClick={() => open({ title: '', schedule_date: date, status: 'planned' })} className={className}><b>{label}</b>{ev.map((x) => <div key={x.id} onClick={() => open({ ...x })}><ScheduleBadge s={x} assignees={assignees} types={types} /></div>)}</div>;
  };
  const renderTimedGrid = () => {
    const targetDays = mode === 'week' ? days : [viewDate];
    const columns = mode === 'week' ? '72px repeat(7, minmax(130px, 1fr))' : '72px minmax(260px, 1fr)';
    return <div className="border-t border-gray-200"><div className="grid" style={{ gridTemplateColumns: columns }}><div className="border-b border-r border-gray-200 bg-gray-50 p-2 text-center text-sm font-bold">時刻</div>{targetDays.map((d) => { const dow = d.getDay(); const cls = 'p-2 text-center font-bold border-b border-r border-gray-200 ' + (dow === 0 ? 'text-red-500 bg-rose-50' : dow === 6 ? 'text-blue-500 bg-blue-50' : 'text-gray-600 bg-gray-50'); return <div key={ymd(d)} className={cls}>{ymd(d)} ({['日','月','火','水','木','金','土'][dow]})</div>; })}<div className="border-b border-r border-gray-200 bg-amber-50 p-2 text-center text-sm font-bold">終日</div>{targetDays.map((d) => { const date = ymd(d); const allDay = schedules.filter((x) => x.schedule_date === date && !x.start_time && !x.end_time); return <div key={'all-' + date} className="min-h-16 border-b border-r border-gray-200 bg-amber-50 p-2">{allDay.length === 0 ? <span className="text-xs text-gray-400">-</span> : allDay.map((x) => <div key={x.id} onClick={() => open({ ...x })}><ScheduleBadge s={x} assignees={assignees} types={types} /></div>)}</div>; })}{hourSlots.map((h) => <Fragment key={h}><div className="min-h-20 border-b border-r border-gray-200 bg-gray-50 p-2 text-center text-sm font-bold text-gray-600">{pad(h)}:00</div>{targetDays.map((d) => { const date = ymd(d); const ev = schedules.filter((x) => x.schedule_date === date && x.start_time && Number(x.start_time.slice(0,2)) === h).sort((a,b)=>(a.start_time||'').localeCompare(b.start_time||'')); return <div key={date + '-' + h} onDoubleClick={() => open({ title: '', schedule_date: date, start_time: pad(h) + ':00', end_time: pad((h + 1) % 24) + ':00', status: 'planned' })} className="min-h-20 border-b border-r border-gray-200 p-2">{ev.map((x) => <div key={x.id} onClick={() => open({ ...x })}><ScheduleBadge s={x} assignees={assignees} types={types} /></div>)}</div>; })}</Fragment>)}</div></div>;
  };
  const monthHeaderClass = (i: number) => 'p-2 text-center font-bold ' + (i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-500');
  return <div><div className="grid gap-4 overflow-x-auto xl:grid-cols-[var(--calendar-grid-cols)]" style={{ '--calendar-grid-cols': gridColumns, minWidth: calendarPixelWidth + 300 + 320 + 32 } as React.CSSProperties}><section className="card overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 p-4"><div className="flex items-center gap-2"><button className="btn secondary" onClick={() => move(-1)}>前</button><h2 className="text-xl font-bold">{title}</h2><button className="btn secondary" onClick={() => move(1)}>次</button></div><div className="flex flex-wrap gap-2"><button className={'btn ' + (mode==='month' ? '' : 'secondary')} onClick={() => setMode('month')}>月</button><button className={'btn ' + (mode==='week' ? '' : 'secondary')} onClick={() => setMode('week')}>週</button><button className={'btn ' + (mode==='day' ? '' : 'secondary')} onClick={() => setMode('day')}>日</button><button className="btn" onClick={() => open({ title: '', schedule_date: ymd(new Date()), status: 'planned' })}>予定を追加</button></div><SearchBar query={query} setQuery={setQuery} exportCsv={exportCsv} /></div>{mode === 'month' && monthLayout === 'twoColumn' ? <div className="grid grid-cols-2 border-t border-gray-200">{[monthListDays.slice(0, 15), monthListDays.slice(15)].map((col, i) => <div key={i} className="border-r border-gray-200 last:border-r-0">{col.map((d) => renderDayCell(d, true))}</div>)}</div> : mode === 'month' ? <div className="calendar-grid border-t border-gray-200" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>{['日','月','火','水','木','金','土'].map((w, i) => <div key={i} className={monthHeaderClass(i)}>{w}</div>)}{days.map((d) => renderDayCell(d))}</div> : renderTimedGrid()}</section><TodayTomorrowPanel schedules={schedules} users={users} assignees={assignees} types={types} open={open} /><AssigneeSchedulePanel schedules={schedules} assignees={assignees} types={types} open={open} /></div></div>;
}
function ScheduleList({ schedules, users, assignees, types, open, query, setQuery, exportCsv, importSchedulesCsv, importMasterCsv }: { schedules: Schedule[]; users: UserProfile[]; assignees: MasterItem[]; types: MasterItem[]; open: (s: DraftSchedule) => void; query: string; setQuery: (v: string) => void; exportCsv: () => void; importSchedulesCsv: (file: File) => void; importMasterCsv: (file: File) => void }) { return <section className="card p-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">予定一覧</h2><SearchBar query={query} setQuery={setQuery} exportCsv={exportCsv} /></div><div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 p-3"><h3 className="mb-2 font-bold">CSV取込</h3><div className="flex flex-wrap gap-3 text-sm"><label className="btn secondary cursor-pointer">予定CSV<input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importSchedulesCsv(f); e.currentTarget.value = ''; }} /></label><label className="btn secondary cursor-pointer">マスタCSV<input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importMasterCsv(f); e.currentTarget.value = ''; }} /></label><span className="text-gray-500">予定CSV: 日付,開始,終了,件名,予定区分,担当者,場所,状態,メモ / マスタCSV: マスタコード,マスタ名,項目名,色,並び順,有効</span></div></div><div className="grid gap-3">{schedules.map((s) => <button key={s.id} onClick={() => open({ ...s })} className="text-left rounded-xl border border-gray-200 bg-white p-3 hover:bg-blue-50"><b>{s.title}</b><p className="text-sm text-gray-500">{s.schedule_date} {s.start_time?.slice(0,5) || '終日'} / {scheduleTypeName(s, types) || '区分なし'} / {assigneeName(s, assignees, users) || '未設定'} / {statusLabel[s.status]}</p></button>)}{schedules.length === 0 && <p className="text-gray-500">予定はありません。</p>}</div></section>; }
function Masters({ isAdmin, departments, users, masters, items, emailRecipients, emailGroups, emailGroupMembers, addEmailRecipientFromForm, addEmailGroup, addEmailGroupMember, removeEmailGroupMember, deleteEmailRecipient, deleteEmailGroup, edit }: { isAdmin: boolean; departments: Department[]; users: UserProfile[]; masters: MasterDefinition[]; items: MasterItem[]; emailRecipients: EmailRecipient[]; emailGroups: EmailGroup[]; emailGroupMembers: EmailGroupMember[]; addEmailRecipientFromForm: (e: React.FormEvent<HTMLFormElement>) => void; addEmailGroup: () => void; addEmailGroupMember: (groupId: string) => void; removeEmailGroupMember: (groupId: string, recipientId: string) => void; deleteEmailRecipient: (id: string) => void; deleteEmailGroup: (id: string) => void; edit: (e: MasterEdit) => void }) {
  return <section className="grid gap-4 lg:grid-cols-2">
    {!isAdmin && <div className="card p-4 lg:col-span-2 border-amber-200 bg-amber-50 text-amber-800">現在の利用者は「管理者」権限ではないため、追加・編集ボタンは表示されません。Supabase の user_profiles で role を「管理者」に変更してください。</div>}
    <div className="card p-4"><div className="flex justify-between"><h2 className="text-xl font-bold">利用者マスタ</h2>{isAdmin && <button className="btn" onClick={() => edit({ kind:'user' })}>追加</button>}</div>{users.map((u) => <p key={u.id} className="mt-2 rounded-lg border p-2"><b>{u.name}</b> / {u.email} / {u.role} {isAdmin && <button className="btn secondary ml-2" onClick={() => edit({ kind:'user', data:u })}>編集</button>}</p>)}</div>
    <div className="card p-4"><div className="flex justify-between"><h2 className="text-xl font-bold">部署マスタ</h2>{isAdmin && <button className="btn" onClick={() => edit({ kind:'department' })}>追加</button>}</div>{departments.map((d) => <p key={d.id} className="mt-2 rounded-lg border p-2"><b>{d.name}</b> {d.memo} {isAdmin && <button className="btn secondary ml-2" onClick={() => edit({ kind:'department', data:d })}>編集</button>}</p>)}</div>
    <div className="card p-4 lg:col-span-2"><div className="flex justify-between"><h2 className="text-xl font-bold">追加マスタ・分類</h2>{isAdmin && <button className="btn" onClick={() => edit({ kind:'definition' })}>マスタ追加</button>}</div>{masters.map((m) => <div key={m.id} className="mt-4 rounded-xl border p-3"><div className="flex flex-wrap justify-between gap-2"><b>{m.name} <span className="text-gray-400">{m.code}</span></b><span>{isAdmin && <><button className="btn secondary" onClick={() => edit({ kind:'definition', data:m })}>マスタ編集</button><button className="btn ml-2" onClick={() => edit({ kind:'item', data:{ master_definition_id:m.id, active:true, sort_order:10 } })}>項目追加</button></>}</span></div>{items.filter((i)=>i.master_definition_id===m.id).map((i)=><p key={i.id} className="mt-2 inline-block rounded-lg border p-2 mr-2" style={{background:i.value||undefined}}>{i.name} {isAdmin && <button className="btn secondary ml-2" onClick={() => edit({ kind:'item', data:i })}>編集</button>}</p>)}</div>)}</div>
    <div className="card p-4 lg:col-span-2"><div className="flex flex-wrap justify-between gap-2"><h2 className="text-xl font-bold">メール送信先・グループ</h2>{isAdmin && <button className="btn" onClick={addEmailGroup}>グループのみ追加</button>}</div>{isAdmin && <form onSubmit={addEmailRecipientFromForm} className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-3"><h3 className="mb-2 font-bold">送信先を追加</h3><div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4"><div><label className="label">名前</label><input name="name" className="input" required /></div><div><label className="label">メールアドレス</label><input name="email" type="email" className="input" required /></div><div><label className="label">既存グループに追加</label><select name="group_id" className="input"><option value="">追加しない</option>{emailGroups.filter((g) => g.active).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div><div><label className="label">新規グループ名</label><input name="new_group_name" className="input" placeholder="必要な場合のみ" /></div></div><p className="mt-2 text-xs text-blue-700">既存グループと新規グループ名の両方を入力した場合は、新規グループを優先します。</p><button className="btn mt-3">追加</button></form>}<div className="mt-4 grid gap-4 lg:grid-cols-2"><div><h3 className="font-bold">メール送信先</h3>{emailRecipients.length === 0 && <p className="mt-2 rounded-lg border bg-gray-50 p-3 text-sm text-gray-500">送信先は未登録です。</p>}{emailRecipients.map((r) => <p key={r.id} className="mt-2 rounded-lg border p-2"><b>{r.name}</b> / {r.email} {isAdmin && <button className="btn danger ml-2" onClick={() => deleteEmailRecipient(r.id)}>削除</button>}</p>)}</div><div><h3 className="font-bold">メールグループ</h3>{emailGroups.length === 0 && <p className="mt-2 rounded-lg border bg-gray-50 p-3 text-sm text-gray-500">グループは未登録です。</p>}{emailGroups.map((g) => { const members = emailGroupMembers.filter((m) => m.group_id === g.id).map((m) => emailRecipients.find((r) => r.id === m.recipient_id)).filter(Boolean) as EmailRecipient[]; return <div key={g.id} className="mt-2 rounded-lg border p-2"><div className="flex flex-wrap items-center justify-between gap-2"><b>{g.name}</b>{isAdmin && <span><button className="btn secondary" onClick={() => addEmailGroupMember(g.id)}>メンバー追加</button><button className="btn danger ml-2" onClick={() => deleteEmailGroup(g.id)}>削除</button></span>}</div><div className="mt-2 flex flex-wrap gap-2">{members.length === 0 ? <span className="text-sm text-gray-500">メンバーなし</span> : members.map((r) => <span key={r.id} className="rounded bg-gray-100 px-2 py-1 text-sm">{r.name}{isAdmin && <button className="ml-2 text-red-600" onClick={() => removeEmailGroupMember(g.id, r.id)}>×</button>}</span>)}</div></div>; })}</div></div></div>
  </section>;
}
function ScheduleModal({ draft, setDraft, assignees, types, locations, emailRecipients, emailGroups, save, remove }: { draft: DraftSchedule; setDraft: (d: DraftSchedule | null) => void; assignees: MasterItem[]; types: MasterItem[]; locations: MasterItem[]; emailRecipients: EmailRecipient[]; emailGroups: EmailGroup[]; save: (e: React.FormEvent) => void; remove: (id: string) => void }) {
  const update = (k: keyof DraftSchedule, v: string) => setDraft({ ...draft, [k]: v });
  const isAllDay = !draft.start_time && !draft.end_time;
  const setAllDay = (checked: boolean) => {
    if (checked) setDraft({ ...draft, start_time: null, end_time: null });
    else setDraft({ ...draft, start_time: '09:00', end_time: '10:00' });
  };
  return <div className="fixed inset-0 z-10 grid place-items-center bg-black/50 p-4"><section className="card max-h-[92vh] w-full max-w-2xl overflow-auto p-5"><h2 className="text-xl font-bold">{draft.id ? '予定編集' : '予定追加'}</h2><form onSubmit={save} className="mt-4 grid gap-3 md:grid-cols-2"><div className="md:col-span-2"><label className="label">件名</label><input className="input" required value={draft.title} onChange={(e) => update('title', e.target.value)} /></div><div><label className="label">日付</label><input className="input" type="date" required value={draft.schedule_date} onChange={(e) => update('schedule_date', e.target.value)} /></div><div><label className="label">予定区分</label><select className="input" value={draft.schedule_type_id ?? (draft.schedule_type_text ? '__manual__' : '')} onChange={(e) => update('schedule_type_id', e.target.value)}><option value="">未設定</option>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}<option value="__manual__">手入力する</option></select>{draft.schedule_type_id === '__manual__' && <input className="input mt-2" placeholder="予定区分を入力" value={draft.schedule_type_manual ?? draft.schedule_type_text ?? ''} onChange={(e) => update('schedule_type_manual', e.target.value)} />}</div><div className="md:col-span-2 rounded-xl border border-gray-200 bg-gray-50 p-3"><label className="inline-flex items-center gap-2 font-bold"><input type="checkbox" checked={isAllDay} onChange={(e) => setAllDay(e.target.checked)} />終日</label><p className="mt-1 text-xs text-gray-500">終日の場合、開始・終了時刻は保存されません。</p></div><div><label className="label">開始</label><select className="input" disabled={isAllDay} value={draft.start_time ?? ''} onChange={(e) => update('start_time', e.target.value)}><option value="">未設定</option>{timeOptions().map((t) => <option key={t} value={t}>{t}</option>)}</select></div><div><label className="label">終了</label><select className="input" disabled={isAllDay} value={draft.end_time ?? ''} onChange={(e) => update('end_time', e.target.value)}><option value="">未設定</option>{timeOptions().map((t) => <option key={t} value={t}>{t}</option>)}</select></div><div><label className="label">担当者</label><select className="input" value={draft.assignee_id ?? (draft.assignee_text ? '__manual__' : '')} onChange={(e) => update('assignee_id', e.target.value)}><option value="">未設定</option>{assignees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}<option value="__manual__">手入力する</option></select>{draft.assignee_id === '__manual__' && <input className="input mt-2" placeholder="担当者を入力" value={draft.assignee_manual ?? draft.assignee_text ?? ''} onChange={(e) => update('assignee_manual', e.target.value)} />}</div><div><label className="label">場所</label><select className="input" value={draft.place ?? (draft.place_text ? '__manual__' : '')} onChange={(e) => update('place', e.target.value)}><option value="">未設定</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}<option value="__manual__">手入力する</option></select>{draft.place === '__manual__' && <input className="input mt-2" placeholder="場所を入力" value={draft.place_manual ?? draft.place_text ?? ''} onChange={(e) => update('place_manual', e.target.value)} />}</div><div className="md:col-span-2"><label className="label">状態</label><select className="input" value={draft.status} onChange={(e) => update('status', e.target.value)}><option value="planned">予定</option><option value="done">完了</option><option value="cancelled">中止</option></select></div><div className="md:col-span-2 rounded-xl border border-blue-100 bg-blue-50 p-3"><label className="inline-flex items-center gap-2 font-bold"><input type="checkbox" checked={Boolean(draft.email_send)} onChange={(e) => setDraft({ ...draft, email_send: e.target.checked, email_target_type: draft.email_target_type ?? 'recipient' })} />保存時にメール送信する</label>{draft.id && draft.email_send && <label className="mt-2 inline-flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={Boolean(draft.email_send_on_update)} onChange={(e) => setDraft({ ...draft, email_send_on_update: e.target.checked })} />編集保存時にもメール送信する</label>}{draft.email_send && <div className="mt-3 grid gap-3 md:grid-cols-2"><div><label className="label">送信先種別</label><select className="input" value={draft.email_target_type ?? 'recipient'} onChange={(e) => setDraft({ ...draft, email_target_type: e.target.value as 'recipient' | 'group', email_recipient_id: '', email_group_id: '' })}><option value="recipient">個別</option><option value="group">グループ</option></select></div>{(draft.email_target_type ?? 'recipient') === 'recipient' ? <div><label className="label">送信先</label><select className="input" value={draft.email_recipient_id ?? ''} onChange={(e) => update('email_recipient_id', e.target.value)}><option value="">未選択</option>{emailRecipients.filter((r) => r.active).map((r) => <option key={r.id} value={r.id}>{r.name} / {r.email}</option>)}</select></div> : <div><label className="label">送信グループ</label><select className="input" value={draft.email_group_id ?? ''} onChange={(e) => update('email_group_id', e.target.value)}><option value="">未選択</option>{emailGroups.filter((g) => g.active).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>}</div>}</div><div className="md:col-span-2"><label className="label">メモ</label><textarea className="input min-h-24" value={draft.memo ?? ''} onChange={(e) => update('memo', e.target.value)} /></div><div className="md:col-span-2 flex flex-wrap gap-2"><button className="btn">保存</button>{draft.id && <button type="button" className="btn danger" onClick={() => remove(draft.id!)}>削除</button>}<button type="button" className="btn secondary" onClick={() => setDraft(null)}>閉じる</button></div></form></section></div>;
}
function MasterModal({ edit, setEdit, departments, masters, save, remove }: { edit: MasterEdit; setEdit: (e:null)=>void; departments: Department[]; masters: MasterDefinition[]; save: (k: MasterEdit['kind'], d: Record<string,string|boolean|number|null>)=>void; remove: (k: MasterEdit['kind'], id?: string)=>void }) { const d = edit.data ?? {}; const kind = edit.kind; const submit = (e: React.FormEvent<HTMLFormElement>) => { e.preventDefault(); const fd = new FormData(e.currentTarget); const data: Record<string,string|boolean|number|null> = Object.fromEntries(fd.entries()) as Record<string,string>; if ('active' in data) data.active = data.active === 'true'; if ('sort_order' in data) data.sort_order = Number(data.sort_order || 0); save(kind, data); }; return <div className="fixed inset-0 z-10 grid place-items-center bg-black/50 p-4"><section className="card max-h-[92vh] w-full max-w-xl overflow-auto p-5"><h2 className="text-xl font-bold">マスタ編集</h2><form onSubmit={submit} className="mt-4 grid gap-3"><input type="hidden" name="id" value={d.id ?? ''} />{kind==='department' && <><label className="label">部署名</label><input name="name" className="input" required defaultValue={(d as Department).name ?? ''}/><label className="label">メモ</label><textarea name="memo" className="input" defaultValue={(d as Department).memo ?? ''}/></>}{kind==='user' && <><p className="text-sm text-amber-700">新規利用者は先にSupabase Authenticationでユーザー作成し、そのUser UIDをidに入れてください。</p><label className="label">Auth User ID</label><input name="id" className="input" required defaultValue={d.id ?? ''}/><label className="label">氏名</label><input name="name" className="input" required defaultValue={(d as UserProfile).name ?? ''}/><label className="label">メール</label><input name="email" className="input" type="email" required defaultValue={(d as UserProfile).email ?? ''}/><label className="label">部署</label><select name="department_id" className="input" defaultValue={(d as UserProfile).department_id ?? ''}><option value="">未設定</option>{departments.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select><label className="label">権限</label><select name="role" className="input" defaultValue={(d as UserProfile).role ?? '一般'}><option>一般</option><option>管理者</option></select><label className="label">有効</label><select name="active" className="input" defaultValue={String((d as UserProfile).active ?? true)}><option value="true">有効</option><option value="false">無効</option></select></>}{kind==='definition' && <><label className="label">マスタ名</label><input name="name" className="input" required defaultValue={(d as MasterDefinition).name ?? ''}/><label className="label">コード</label><input name="code" className="input" defaultValue={(d as MasterDefinition).code ?? ''}/><label className="label">説明</label><textarea name="description" className="input" defaultValue={(d as MasterDefinition).description ?? ''}/></>}{kind==='item' && <><label className="label">対象マスタ</label><select name="master_definition_id" className="input" required defaultValue={(d as MasterItem).master_definition_id ?? ''}>{masters.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select><label className="label">項目名</label><input name="name" className="input" required defaultValue={(d as MasterItem).name ?? ''}/><label className="label">色・値</label><input name="value" className="input" list="color-samples" defaultValue={(d as MasterItem).value ?? ''}/><datalist id="color-samples">{colorSamples.map((c) => <option key={c} value={c}>{c}</option>)}</datalist><div className="flex flex-wrap gap-2">{colorSamples.map((c) => <button key={c} type="button" title={c} className="h-8 w-12 rounded border" style={{background:c}} onClick={(e) => { const input = e.currentTarget.closest('form')?.querySelector('input[name=\"value\"]') as HTMLInputElement | null; if (input) input.value = c; }} />)}</div><label className="label">並び順</label><input name="sort_order" type="number" className="input" defaultValue={(d as MasterItem).sort_order ?? 0}/><label className="label">有効</label><select name="active" className="input" defaultValue={String((d as MasterItem).active ?? true)}><option value="true">有効</option><option value="false">無効</option></select></>}<div className="flex flex-wrap gap-2"><button className="btn">保存</button>{d.id && <button type="button" className="btn danger" onClick={() => remove(kind, d.id)}>削除</button>}<button type="button" className="btn secondary" onClick={() => setEdit(null)}>閉じる</button></div></form></section></div>; }












