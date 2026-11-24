# core

The Syngraph core.

- Agents and their mandates: limits, working hours, payees, spending categories, pause, and when a person approves a payment.
- Approval: in `auto` mode a payment that breaks a rule (limits, hours, payee, a category not allowed) is not rejected but waits for the client's decision; in `manual` mode every payment does. A paused agent and a forbidden category are rejected at once. The agent names the category itself from a fixed list (`db.CATEGORIES`).
- Operation journal: a record is created before the bank is called, after that only its status changes; the result is a payment passport.
- Bank adapter for the sandbox's HTTP API. Real bank adapters and notifications to agents (webhooks) are planned.

Entry points to the core: `mcp-server` (agents) and `client-app` (people).

## Agents and keys

A client has several agents; each has its own mandate and its own key. The key (`sgk_...`) is created in the client app and shown once; the core stores only its SHA-256 and the first and last characters ("sgk_Ab3x…9QzT"). A new key turns the old one off at once. The agent sends its key with every MCP call; the core finds the agent by it and checks the payment against that agent's mandate only. An agent sees only its own operations.

## Data

SQLite, `data/syngraph.db` (not in git):

- `clients`;
- `agents` — name, icon, key hash and hint, one mandate each; a deleted agent stays for the history;
- `mandates` — the agent's rules: working days and hours or any time (`any_time`), "any payee / only listed", limits per payment, day, week and month or none (`any_amount`; the stored limits are kept), pause, approval mode (`auto` / `manual`), categories: any / only the allowed / all but the blocked;
- `counterparties` — organisations shared by all clients, one row per INN; the INN is the key and the stored name is the one sent to the bank; an unknown INN is added with the name from the request;
- `mandate_counterparties` — whom an agent may pay;
- `transactions` — every payment with the payee and optional payment order snapshot, category, status (`awaiting`, `pending`, `paid`, `rejected`, `unknown`) and reason.

Limits count `paid`, `pending` and `unknown` payments. `awaiting` ones count once approved. Syngraph saves order details before approval. Approval sends those saved details and uses the client's account. Deleting an agent rejects its awaiting payments. An empty database gets a demo client (id 1) with one agent whose mandate comes from `rules.example.json`. Older databases gain the new columns on open.

Checking the mandate and reserving the payment amount happen in one SQLite write transaction. The bank call starts after that transaction commits. The operation ID serves as the sandbox `externalId`. The core HTTP service reconciles `pending` and `unknown` operations in the background. MCP can trigger the same check with `get_payment_status`. If the sandbox confirms that an unacknowledged order is absent, the core submits its saved snapshot again with the same ID. The sandbox settles one matching order once. A final status is preserved even when another request receives an earlier bank response.

Keyed payment requests store the optional `idempotency_key` and a fingerprint of the submitted payment details with the operation in the same SQLite transaction. A unique index scopes the key to the agent's mandate. A retry with matching details returns the operation's stored status and ID before any new mandate check or bank call, including while the original send is in progress. The key stays with the operation, including after rejection or agent credential rotation. Existing operations remain valid with an empty key.

## HTTP API for client-app

`api.py` (FastAPI), run with `python -m uvicorn core.api:app --port 8000`, all under `/api/clients/{id}`:

- `GET`, `POST /agents` — the agents with their rules and spending; a new agent, with any of the `PATCH` settings at once;
- `GET`, `PATCH /agents/{agent}` — name, icon, pause, "any / only listed", `any_time` or working days and local times in `HH:MM` format, `any_amount` or limits in rubles that must grow per payment <= day <= week <= month (an empty string clears a day, week or month limit: `null` means no limit for the period), approval mode, category mode and both category lists; `POST` also takes `payees` (INN and name) for an agent that pays only listed payees;
- `GET /agents/{agent}/statistics?period=today|day|week|month` — confirmed spending since local midnight, over the last 24 hours, or over the last seven or thirty calendar days: totals, categories and the three largest payments; omit `period` for all-time summaries;
- `DELETE /agents/{agent}` — deletes the agent: its key stops working at once, its payments stay in the history;
- `POST /agents/{agent}/key` — a new key, returned only here;
- `GET`, `POST /agents/{agent}/counterparties`, `DELETE .../{inn}` — the agent's payees; `GET /api/counterparties/{inn}` looks up the shared directory by exact INN only;
- `GET /operations?agent_id=` — payments of all agents or of one; `POST /operations/{op}/check` asks the bank again; `POST /operations/{op}/approve` and `.../decline` decide an `awaiting` payment.

Agent statistics read the entire paid history, independently of the operation feed limit. The response contains `period` (the selected value, or `null` when omitted), `timezone`, `today` (`amount_kopecks`, `count`), `total` (also `average_kopecks`, `payees`), seven `days` (`date`, amount, count), thirty `month` days with the same fields, 24 `hours` of today (`hour` from 0 to 23, amount, count), 24 `rolling_hours` (`start` and `end` as UTC ISO timestamps, amount, count), `categories` (category, amount, count), and `largest` (up to three full operations). Only `paid` records count; `payees` counts distinct INNs, and the average rounds to the nearest kopeck with halves rounded up (zero for no payments). The seven-day and thirty-day windows include today; `month` is a rolling thirty-calendar-day window. Days use each operation's `created_at` in the mandate time zone and include zero days, oldest first; the journal has no separate settlement timestamp. Hour buckets use the same time zone: a repeated daylight-saving hour is combined, and a skipped hour remains zero. When `period` is supplied, `total`, `categories` and `largest` include only paid operations in that window, never later than the request time. `today` starts at midnight in the mandate time zone; `day` is the exact UTC interval from 24 hours before the request through the request time, inclusive at both ends. `week` and `month` keep their seven- and thirty-calendar-day windows. The `rolling_hours` buckets divide the exact 24-hour window into 24 equal 3600-second intervals, oldest first, including zero buckets. Each interval includes its start and excludes its end; the last includes the request time. Using UTC keeps these intervals equal across daylight-saving changes. For a selected period, future timestamps are excluded from every bucket as well as the summaries. Without `period`, these summaries cover all time for compatibility. `today`, `hours`, `days` and `month` keep their respective calendar windows regardless of the selected period; `rolling_hours` always represents the exact last 24 hours. Unknown period values return HTTP 422. Missing categories form a `null` group. Categories sort by descending amount then category; largest payments sort by descending amount, creation time and id. The endpoint reads one snapshot of an existing initialized database without migrations, writes or bank calls.

The same statistics response includes `operations_count` for every operation in the selected window, `success_rate` (`paid` / all operations × 100, rounded half up to one decimal; `null` for an empty window), and `flows` with integer counts: `allowed` (no approval requested, now paid/pending/unknown), `rejected` (no approval requested, now rejected), `cancelled` (approval declined), `approved` (approval granted, regardless of the later bank outcome), `awaiting` (still awaiting approval), and `unknown` (legacy provenance unavailable). The six counts sum to `operations_count`; amounts, categories, largest payments and chart buckets still count only paid operations.

The journal stores nullable `approval_state` separately from bank status and reason. New payments record their initial route, and a human decision is saved before the bank call; send/status refresh never overwrite it. Deleting an agent cancels its awaiting operations. Older databases gain the column without guessing prior approval history. Compatibility triggers track initial pending/awaiting/direct-rejected records and awaiting-to-pending/rejected decisions from already-running older processes; explicit provenance wins, and paid/unknown imports stay unknown. Historical provenance may be restored only from separate trustworthy evidence.

No sign-in for people yet: anyone who reaches the API can change any client's agents, so it listens on 127.0.0.1 only (uvicorn's default; never `--host 0.0.0.0`).

## In-app notifications

The bell uses a durable SQLite event feed, independent of the latest operations page. Transaction inserts and actual status changes create notification snapshots in the same database transaction, including writes from the MCP process while the app is closed. Each event preserves the operation, agent name, payee, amount, currency, status and event time; later status changes do not rewrite it. Repeating an unchanged status creates no event. Read state is stored per client and survives reloads.

- `GET /api/clients/{id}/notifications?limit=100` returns `{items, unread_count}`. Each item has `id`, `operation_id`, `agent_id`, `agent_name`, `payee`, `amount_kopecks`, `currency`, `status`, `created_at` and nullable `read_at`. Items sort by descending notification id; `limit` must be 1–200. The unread count covers the entire visible feed, not just the returned items, and is read from the same database snapshot.
- `POST /api/clients/{id}/notifications/{notification_id}/read` marks one owned notification read and returns 204. Repeated calls keep its original read time; an unavailable or other client's event returns 404.
- `POST /api/clients/{id}/notifications/read-all` takes `{"through_id": 123}` and returns 204. Only this client's notifications at or before that displayed id become read; newer events stay unread. The cutoff must be a nonnegative integer.
- `GET /api/clients/{id}/operations/{operation_id}` reads the current stored operation for a notification link, including operations older than the latest feed page. It does not call the bank. A missing operation, other client's operation or deleted agent returns 404.

Deleted agents' events remain stored but are hidden from the feed and unread count. On the first upgrade, only existing `awaiting` operations of active agents are added; old payment history does not flood the bell. Table creation, this backfill and event triggers are installed atomically; repeated initialization does not duplicate events. Notifications do not approve, retry or send payments, and make no external notification calls. There are no phone or Telegram notifications in this implementation.

Code: `api.py` (HTTP API), `payments.py` (pay an invoice; the agent's mandate, operations and available amount), `rules.py` (mandate checks), `db.py` (SQLite), `keys.py` (agent keys), `bank.py` (bank adapter), `money.py` (kopecks), `errors.py` (bad request, unknown agent key, broken mandate, bank not answering, unconfirmed bank payment). Functions in `db.py` never commit; the caller commits explicitly.

- `src/` — code
- `data/` — data
