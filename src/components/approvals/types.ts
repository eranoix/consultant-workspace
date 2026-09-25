export type Side = 'partner' | 'direct';
export type Decision = 'pending' | 'approved' | 'no_action';

export interface SourceItem {
  id: string;
  kind: 'meeting' | 'email';
  title: string;
  from_email: string | null;
  from_name: string | null;
  occurred_at: string;
  client_id: string | null;
  client_name: string | null;
  side: Side | null;
  side_reason: string | null;
  status: 'pending' | 'reviewed';
  reviewed_at: string | null;
  summary: { summary: string; topics: string[]; keyDecisions: string[]; provider: string } | null;
  task_total: number;
  task_pending: number;
  task_approved: number;
  task_no_action: number;
}

export interface Candidate {
  id: string;
  source_id: string;
  title: string;
  details: string;
  client_id: string | null;
  client_name: string | null;
  side: Side | null;
  due_date: string | null;
  decision: Decision;
  decided_at: string | null;
  task_id: string | null;
  task_status: string | null;
  source_title?: string;
  source_kind?: 'meeting' | 'email';
  source_status?: 'pending' | 'reviewed';
}

export interface SourceDetail extends SourceItem {
  body: string;
  participants: string[];
  thread_id: string | null;
  tasks: Candidate[];
  thread: { id: string; title: string; from_email: string | null; occurred_at: string; direction: string }[];
}
