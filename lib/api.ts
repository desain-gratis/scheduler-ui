import {
  AggregationParams,
  CreateRecurringTaskInput,
  DailyCount,
  HourlyCount,
  RecurringTask,
  TaskExecution,
} from '@/types/scheduler';

export interface ApiConfig {
  baseUrl: string;
  /** NOTE: "*" is currently broken on the server, a real namespace is required. */
  namespace: string;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function joinUrl(base: string, path: string): string {
  return base.replace(/\/+$/, '') + path;
}

async function request<T>(
  cfg: ApiConfig,
  path: string,
  init?: RequestInit & { query?: Record<string, string | string[] | undefined> },
): Promise<T> {
  const qs = new URLSearchParams();
  if (init?.query) {
    for (const [k, v] of Object.entries(init.query)) {
      if (v === undefined || v === '') continue;
      if (Array.isArray(v)) v.forEach((item) => qs.append(k, item));
      else qs.append(k, v);
    }
  }
  const url = joinUrl(cfg.baseUrl, path) + (qs.toString() ? `?${qs.toString()}` : '');

  const res = await fetch(url, {
    ...init,
    headers: {
      'X-Namespace': cfg.namespace,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers || {}),
    },
  });

  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try {
      const parsed = JSON.parse(text);
      if (parsed?.error) msg = typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error);
    } catch {
      /* plain-text error from server */
    }
    throw new ApiError(res.status, msg || res.statusText);
  }
  return (text ? JSON.parse(text) : null) as T;
}

/** Server wraps successful list responses as { success: [...] }. */
function unwrap<T>(body: { success?: T[] | null } | null): T[] {
  return body?.success ?? [];
}

function aggregationQuery(p: AggregationParams) {
  return {
    timezone: p.timezone,
    start_date: p.start_date,
    end_date: p.end_date,
    before: p.before,
    execution_status: p.execution_status,
    assignment_status: p.assignment_status,
    assigned_node: p.assigned_node?.map(String),
    queue_id: p.queue_id,
    id: p.id,
  };
}

export async function listRecurringTasks(cfg: ApiConfig): Promise<RecurringTask[]> {
  return unwrap(await request(cfg, '/task/recurring'));
}

export async function createRecurringTask(
  cfg: ApiConfig,
  input: CreateRecurringTaskInput,
): Promise<unknown> {
  return request(cfg, '/task/recurring', { method: 'POST', body: JSON.stringify(input) });
}

export async function listTaskExecutions(
  cfg: ApiConfig,
  filter: { queue_id?: string } = {},
): Promise<TaskExecution[]> {
  return unwrap(await request(cfg, '/task', { query: { queue_id: filter.queue_id } }));
}

export async function cancelTaskExecution(cfg: ApiConfig, task: TaskExecution): Promise<unknown> {
  return request(cfg, '/task/cancel', {
    method: 'POST',
    body: JSON.stringify({ ...task, status: 'CANCELLED' }),
  });
}

export async function getDailyCount(cfg: ApiConfig, p: AggregationParams): Promise<DailyCount[]> {
  return unwrap(await request(cfg, '/task/daily', { query: aggregationQuery(p) }));
}

export async function getHourlyCount(cfg: ApiConfig, p: AggregationParams): Promise<HourlyCount[]> {
  return unwrap(await request(cfg, '/task/hourly', { query: aggregationQuery(p) }));
}
