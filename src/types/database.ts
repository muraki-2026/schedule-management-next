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
  assignee_id: string | null;
  schedule_type_id: string | null;
  schedule_type_text: string | null;
  assignee_text: string | null;
  place: string | null;
  place_text: string | null;
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

export type MasterItem = {
  id: string;
  master_definition_id: string;
  name: string;
  value: string | null;
  sort_order: number;
  active: boolean;
};

export type EmailRecipient = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  sort_order: number;
};

export type EmailGroup = {
  id: string;
  name: string;
  active: boolean;
  sort_order: number;
};

export type EmailGroupMember = {
  group_id: string;
  recipient_id: string;
};
