export type TaskStatus = 'backlog' | 'todo' | 'doing' | 'review' | 'done';

export const STATUS_ORDER: TaskStatus[] = ['backlog', 'todo', 'doing', 'review', 'done'];

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  position: number;
  client_id: string | null;
  client_name: string | null;
  client_color: string | null;
  side: 'partner' | 'direct' | null;
  due_date: string | null;
  estimate_min: number | null;
  priority: 'low' | 'normal' | 'high';
  origin: 'manual' | 'approval' | 'api';
  source_id: string | null;
  source_title: string | null;
  source_kind: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  scheduled_min: number;
}
