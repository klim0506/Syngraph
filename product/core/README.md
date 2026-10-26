# core

The Syngraph core.

- Agents and their mandates: limits, working hours, payees, pause; later categories and when human validation is required.
- Operation journal: a record is created before the bank is called, after that only its status changes; the result is a payment passport.
- Notifications to agents at their address (webhooks).
- Adapter to the client's bank via the Bank of Russia Open API: `bank-sandbox` for now, a real bank later.

Entry points to the core: `mcp-server` (agents) and `client-app` (people).

## Agents and keys

A client has several agents; each has its own mandate and its own key. The key (`sgk_...`) is created in the client app and shown once; the core stores only its SHA-256 and the last characters. A new key turns the old one off at once. The agent sends its key with every MCP call; the core finds the agent by it and checks the payment against that agent's mandate only. An agent sees only its own operations.

## Data

SQLite, `data/syngraph.db` (not in git):

- `clients`;
- `agents` — name, key hash and hint, one mandate each;
- `mandates` — the agent's rules: working days and hours, "any payee / only listed", limits per payment, day, week and month, pause;
- `counterparties` — organisations shared by all clients, one row per INN; the INN is the key and the stored name is the one sent to the bank; an unknown INN is added with the name from the request;
- `mandate_counterparties` — whom an agent may pay;
- `transactions` — every payment with the payee details as sent to the bank, its status (`pending`, `paid`, `rejected`, `unknown` — the bank did not confirm, the payment may have gone through) and the reason.

Limits count `paid`, `pending` and `unknown` payments. Every bank order carries the operation id: the bank does not pay one id twice, and an `unknown` payment is asked again from the bank — `paid` if it was made, `rejected` if the bank never received it. An empty database gets a demo client (id 1) with one agent whose mandate comes from `rules.example.json`; an older database gets new tables and columns on open.

## HTTP API for client-app

`api.py` (FastAPI), run with `python -m uvicorn core.api:app --port 8000`, all under `/api/clients/{id}`:

- `GET`, `POST /agents` — the agents with their rules and spending; a new agent;
- `GET`, `PATCH /agents/{agent}` — name, pause, "any / only listed", working days and hours, limits in rubles that must grow per payment <= day <= week <= month;
- `POST /agents/{agent}/key` — a new key, returned only here;
- `GET`, `POST /agents/{agent}/counterparties`, `DELETE .../{inn}` — the agent's payees; `GET /api/counterparties/{inn}` looks up the shared directory by exact INN only;
- `GET /operations?agent_id=` — payments of all agents or of one; `POST /operations/{op}/check` asks the bank again.

No sign-in for people yet: anyone who reaches the API can change any client's agents, so it listens on 127.0.0.1 only (uvicorn's default; never `--host 0.0.0.0`).

Code: `api.py` (HTTP API), `payments.py` (pay an invoice), `rules.py` (mandate checks), `db.py` (SQLite), `keys.py` (agent keys), `bank.py` (bank adapter), `money.py` (kopecks), `errors.py` (bad request, unknown agent key, broken mandate, unconfirmed bank payment). Functions in `db.py` never commit; the caller commits explicitly.

- `src/` — code
- `data/` — data
