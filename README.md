# scheduler-ui

Next.js + TypeScript + Tailwind CSS single-page-style app (client-side only pages) for managing
distributed scheduled execution. Scaffolded for static export, same as `raft-chess-ui`.

```
npm install
npm run dev        # http://localhost:3100
npm run build      # static export into ./out
npm start          # serve ./out on :3100
```

## Configuration

| Variable                        | Purpose                                               |
| ------------------------------- | ----------------------------------------------------- |
| `NEXT_PUBLIC_SCHEDULER_API`     | Scheduler API base URL (`.env`, `.env.production`)    |
| `NEXT_PUBLIC_DEFAULT_NAMESPACE` | Namespace used on first load                          |

The API URL, namespace and display timezone can also be changed live in the header; they are
persisted in `localStorage`.

> The server currently rejects `X-Namespace: *`, so always use a real namespace.
> The API must allow CORS from wherever this UI is hosted.

## Pages

- **Calendar** (`/`) – month grid from `GET /task/daily`; click a day for the hourly breakdown from
  `GET /task/hourly`. Filter by queue.
- **Executions** (`/executions`) – `GET /task` (optional `queue_id`), filter by status/day/search,
  detail view, and **Cancel** (`POST /task/cancel`, sends the task with `status: CANCELLED`) for
  `PENDING` executions.
- **Recurring tasks** (`/recurring`) – `GET /task/recurring` and create via `POST /task/recurring`
  (`user_time` must carry a timezone offset).

## Layout

```
pages/       index, executions, recurring, _app
components/  Layout, Modal, StatusBadge
context/     SchedulerContext (api url / namespace / timezone)
lib/         api.ts (typed client), format.ts
types/       scheduler.ts (contract types)
```
