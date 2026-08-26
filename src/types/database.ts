export type Department = {
  id: string;
  name: string;
  memo: string | null;
};

export type UserProfile = {
  id: string;
  name: string;
  email: string;
  department_id: string | null;
  role: '管理者' | '一般';
  active: boolean;
};

export type Schedule = {
  id: string;
  title: string;
  schedule_date: string;
  start_time: string | null;
  end_time: string | null;
  owner_id: string | null;
  place: string | null;
  memo: string | null;
  status: 'planned' | 'done' | 'cancelled';
  created_by: string | null;
};

export type MasterDefinition = {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
};
