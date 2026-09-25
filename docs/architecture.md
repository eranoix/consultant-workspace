# Architecture notes

This page goes one level below the README: how data flows, where each rule
lives, and how the scheduled jobs keep an eye on each other.

## Request flow

1. A page under `/app` is a server component that checks the session and
   renders a client component for the feature.
2. The client component loads data with SWR from `/api/...` route handlers.
3. Route handlers validate input with zod and call a service in
   `src/lib/server/services`. Services take a database handle, so the web app,
   the worker and the seed script all run exactly the same code.
4. Services lean on pure functions in `src/lib/domain` for every decision
   worth testing (side inference, approval rules, recurrence, token
   permissions, heartbeat math, alert conditions).
5. Every table the UI shows has an `AFTER` trigger that calls
   `pg_notify('workspace_events', {table, op, id})`. Each web process holds
   one `LISTEN` connection and relays the events to open tabs over
   server-sent events (`/api/events`). Tabs refetch what changed. The payload
   never carries row data, so an event cannot leak something the viewer is
   not allowed to see.

## Authentication and authorization

- The app itself: an HMAC-signed session cookie (HttpOnly, SameSite=Lax),
  verified in the edge middleware for every `/app` page and internal API
  route, then re-checked against the users table in each handler.
- The board API (`/api/v1`): bearer tokens `cwk_<prefix>_<secret>`. The
  prefix finds the row, the whole token is compared as a SHA-256 hash in
  constant time, and each route requires one permission from a single table
  (`ROUTE_PERMISSIONS` in `src/lib/domain/tokens.ts`) that the docs page
  also renders. Revoked and expired tokens get a 401; a missing permission
  gets a 403 that names it.
- Row level security: `user_preferences` and `integration_credentials` have
  policies keyed on `current_setting('app.user_id')`. The app connects as a
  role without `BYPASSRLS`, and `asUser()` sets the id with
  `set_config(..., true)`, which lasts for one transaction only, so a pooled
  connection cannot carry one person's identity into the next request.

## Intake and approvals

```
mail folder (mock or IMAP)  ->  intake job  ->  sources + candidate_tasks  ->  review  ->  tasks
     INBOX, Sent, Meetings        summarizer       status pending                Done
```

- The intake reads `INBOX` and `Sent` for email and `Meetings` for the notes a
  note-taker sends after each call, incrementally with a cursor per folder.
- The date of a message is its receive date. The mock mailbox also stores a
  "modified" date and the seed sets it to now, so choosing the wrong one would
  be obvious on screen.
- Side and client are inferred once, when the source is created, and the
  reason is stored with it (`side_reason`). Editing them by hand locks the
  source against re-inference and cascades to its pending candidate tasks.
- Outbound mail (the consultant's replies) is stored as thread history. It
  closes "unanswered" threads and never produces tasks.
- Completing a review locks the source row (`SELECT ... FOR UPDATE`), checks
  that every candidate is classified, and creates board tasks for the
  approved ones that do not have one yet. A task without its own client
  inherits the source's.

## Scheduled jobs, heartbeats and the dead-man switch

| Job | Every | Watched by | Does |
|---|---|---|---|
| `intake-email` | 5 min | dead-man-switch | reads INBOX and Sent |
| `intake-meetings` | 5 min | dead-man-switch | reads the Meetings folder |
| `notes-sync` | 15 min | dead-man-switch | copies the Notes folder tree |
| `alerts-evaluate` | 1 min | dead-man-switch | time-based rules, and watches the dead-man switch |
| `notify-deliver` | 1 min | dead-man-switch | delivers the outbox |
| `goals-occurrences` | 1 h | dead-man-switch | materialises recurring key results |
| `dead-man-switch` | 1 min | alerts-evaluate | raises `cron.late` for the jobs it watches |

- **Heartbeats are awaited.** `runJob` writes `last_started_at` before the
  job and `last_success_at` (or the error) after it, each with an awaited
  `UPDATE`. A heartbeat sent without waiting can be lost when the process is
  suspended right after the job returns, and a lost heartbeat is
  indistinguishable from a dead job.
- **Lateness** is `now > last_success + interval + grace`, where grace is never
  below half the interval (`effectiveGraceSec`). A job that runs every minute
  is not reported dead because one run took twenty seconds longer.
- **Who watches the watcher.** Each job names its watcher. The dead-man switch
  watches everything else; `alerts-evaluate` watches the dead-man switch.
  Either one dying is reported by the other. `unwatched()` flags a
  configuration where a job's watcher is missing, disabled or itself, and the
  jobs panel shows that in red.
- **An independent observer.** The jobs panel (`/api/cron`) runs the same
  `jobHealth` function in the web process on every read. If the worker
  container is gone entirely, nothing in the worker can raise an alert, but
  the panel and the dashboard insight still turn red.
- **Run now** sets `run_requested_at`; the worker picks it up on its next tick.
  The worker's own container healthcheck checks a local beat file that the
  loop touches after every tick.

## Alerts

- Rules are rows: an event, `all`/`any` over a list of conditions
  (`field op value`), a severity, channels and a cooldown. `matchRule` and
  `evaluateCondition` are pure and are also exposed as a "test this rule"
  endpoint, so a rule can be tried against a sample event before saving.
- Event-driven rules (`email.received`, `booking.created`) are evaluated when
  the thing happens. Time-based ones (`email.unanswered`, `task.overdue`,
  `task.due_today`, `intake.stalled`) are derived by `alerts-evaluate`, and
  alerts whose condition no longer holds are resolved automatically.
- A partial unique index keeps at most one live alert per rule and entity; a
  resolved alert starts a cooldown before the same condition can alert again.
- Delivery goes through `notification_outbox`. The in-app outbox always
  works; email and WhatsApp use webhooks when configured and fall back to the
  outbox otherwise, or after three failed attempts.

## Timeline and calendar sync

- One timeline for all admins (no per-user rows), updated live.
- "Process my week" merges back-to-back blocks of the same task, totals the
  week by side, client and day, and lists what to fix (no client, overlaps,
  empty or very long days). The report is stored per week.
- "Sync to calendar" writes every block of the week to the calendar chosen in
  settings as a busy event. `calendar_sync_links` keeps the remote id and a
  fingerprint per block: unchanged blocks are skipped, changed ones updated,
  deleted ones removed remotely.

## Adapters

| Adapter | Default | Real option |
|---|---|---|
| Summarizer | deterministic mock | `LLM_PROVIDER=openai-compatible` with `LLM_API_URL`, `LLM_API_KEY`, `LLM_MODEL` |
| Calendar | mock (rows in `mock_calendar_events`) | Google Calendar v3 with `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` |
| Mail | mock (rows in `mock_mailbox`) | `MAIL_PROVIDER=imap`: interface and configuration check only; an IMAP client library has to be wired into `ImapMail` |
| Notifier | in-app outbox | `NOTIFY_EMAIL_WEBHOOK`, `NOTIFY_WHATSAPP_WEBHOOK` (any relay that accepts a JSON POST) |
| OAuth providers | mock connect and refresh | replace `connect` and `refresh` in `services/integrations.ts` |

## Known limits

- The IMAP adapter is a stub; the demo mailbox lives in Postgres.
- The public booking endpoints have no rate limiting; put the app behind a
  proxy that provides it before exposing it.
- Drag and drop uses the HTML5 API, which works with a mouse; on touch
  devices tasks are moved through the task drawer instead.
