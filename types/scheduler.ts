export type ExecutionStatus =
  | 'MISSED'
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'TIMEOUT'
  | 'INTERRUPTED'
  | 'CANCELLED'
  | 'FAILED'
  | 'SUCCEED';

export const ALL_EXECUTION_STATUSES: ExecutionStatus[] = [
  'PENDING',
  'IN_PROGRESS',
  'SUCCEED',
  'FAILED',
  'TIMEOUT',
  'INTERRUPTED',
  'MISSED',
  'CANCELLED',
];

export type AssignmentStatus = 'ASSIGNED' | 'PENDING';

export type ExecutionMode = 'RECURRING' | 'IMMEDIATE' | string;

export interface ExecutionState {
  actual_run_at: string;
  completed_at: string;
  output: unknown;
}

export interface AssignmentState {
  assigned_to: number;
  assigned_by: number;
  assignment_time: string;
  assignment_count: number;
}

export interface TaskExecution {
  namespace: string;
  id: string;
  parent_id: string | null;
  queue_id: string;
  input: unknown;
  scheduled_run_at: string;
  user_time: string;
  status: ExecutionStatus;
  execution_state: ExecutionState | null;
  assignment_status: AssignmentStatus;
  assignment_state: AssignmentState | null;
  execution_mode: ExecutionMode;
  recurring_task_id: string | null;
  published_at: string;
  /** Where the task's log lives (host of the node that ran it). Absent on older tasks. */
  log_url?: string;
  url?: string;
}

export interface RecurringTaskState {
  last_generate_start: string;
  last_generate_end: string;
  generate_index: number;
}

export interface RecurringTask {
  namespace: string;
  id: string;
  queue_id: string;
  input: unknown;
  user_time: string;
  cron: string;
  state: RecurringTaskState | null;
  published_at: string;
  url?: string;
}

export interface CreateRecurringTaskInput {
  namespace: string;
  queue_id: string;
  input: unknown;
  cron: string;
  /** RFC3339 timestamp. The UTC offset is important: it defines the user's timezone. */
  user_time: string;
}

export interface DailyCount {
  day: string; // YYYY-MM-DD
  queue_id: string;
  status: ExecutionStatus;
  count: number;
}

export interface HourlyCount {
  hour: string; // "YYYY-MM-DD HH:00:00"
  queue_id: string;
  status: ExecutionStatus;
  count: number;
}

export interface AggregationParams {
  timezone?: string;
  start_date?: string; // YYYY-MM-DD
  end_date?: string; // YYYY-MM-DD
  before?: string; // RFC3339
  execution_status?: ExecutionStatus[];
  assignment_status?: AssignmentStatus;
  assigned_node?: number[];
  queue_id?: string;
  id?: string;
}

/** One line of the task log stream (newline-delimited JSON). Only the first five are guaranteed. */
export interface LogEntry {
  /** Client-side sequence number, used as the React key. */
  seq: number;
  time: string;
  level: string;
  msg: string;
  task_id?: string;
  queue_id?: string;
  /** Everything else the server sent (executor_id, …). */
  extra?: Record<string, unknown>;
  /** Set when the line was not valid JSON; `msg` then holds the raw text. */
  unparsed?: boolean;
}
