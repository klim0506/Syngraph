# Syngraph

A payment layer for companies' software agents: an agent pays from the company account within the limits the client has set.

The current prototype checks an agent's mandate, records each operation and sends permitted payments to a bank sandbox that keeps account balances. It includes agent keys, limits, working hours, payee lists, status checks and a client app.

The target is B2B supplier payments from the client's existing bank account, through a bank's business API or the Bank of Russia Open API. Real bank integration, human approval, webhooks and card payments are planned; the sandbox does not implement the Bank of Russia Open API.

```
 company agent             demo/agent/ · developers/sdk-python/
      │
      │ MCP
      ▼
 MCP server                product/mcp-server/
      │
      ▼
 Syngraph core   ◀───────  client app
 product/core/             product/client-app/
 mandate · rules · journal (settings, journal)
      │
      │ sandbox HTTP API
      ▼
 client's own bank         demo/bank-sandbox/ — sandbox, later real banks
```

**`product/` — the Syngraph service**

| Block | Role |
|---|---|
| [`core/`](product/core/) | Core: mandates, rules, journal, bank adapter |
| [`mcp-server/`](product/mcp-server/) | MCP server — the entry point for software agents, forwards calls to the core |
| [`client-app/`](product/client-app/) | Client app: connect an agent, set up a mandate, view the journal |

**`developers/` — for third-party developers**

| Block | Role |
|---|---|
| [`sdk-python/`](developers/sdk-python/) | Planned Python library: connect an agent in a few lines |
| [`developer-docs/`](developers/developer-docs/) | Planned service documentation: MCP, library, security, `llms.txt` |

**`demo/` — showing how it all works**

| Block | Role |
|---|---|
| [`agent/`](demo/agent/) | Planned demo agent for invoice and card payments |
| [`bank-sandbox/`](demo/bank-sandbox/) | Minimal HTTP bank sandbox: account balances and payments; a real bank adapter comes later |
| [`shop/`](demo/shop/) | Planned test online shop for card payments (after MVP) |

## Run with Docker Compose

Requires Docker Engine with Compose v2 or newer, or Docker Desktop in Linux container mode.
From the repository root:

```bash
docker compose up --build -d --wait
```

Open [the client app](http://localhost:8088). The same address serves:

| Path | Service |
|---|---|
| `/` | Built client app |
| `/api/` | Client API |
| `/core/docs` | Core API reference |
| `/bank/docs` | Bank sandbox API reference |
| `/mcp` | MCP Streamable HTTP |

Create an agent and copy its key in the app. Connect an MCP client to
`http://localhost:8088/mcp` with the header `Authorization: Bearer sgk_...`.
Each HTTP request uses its own agent key; no key is baked into an image or Compose configuration.
For a stdio-only MCP client, use this command from the repository root (the stack must be running):

```bash
docker compose run --rm --no-deps -T -e SYNGRAPH_AGENT_KEY mcp python product/mcp-server/src/server.py
```

Set `SYNGRAPH_AGENT_KEY` in the calling process's environment for stdio. HTTP tools always use
the request's bearer key, even if that environment variable is present.

Compose starts the bank, core, MCP and web services in readiness order. Only the web port is
published, on `127.0.0.1`; this is a local demo with virtual money and no client sign-in.
Set `SYNGRAPH_PORT` in your environment or a root `.env` file to change the default `8088`.

SQLite data lives in two named Docker volumes: `core-data` (shared by core and MCP) and
`bank-data`. A fresh stack creates its own demo client and bank account; existing local
`product/core/data/` and `demo/bank-sandbox/data/` files are never imported or mounted.
The build context excludes secrets, runtime databases, drafts and local dependencies.

```bash
docker compose ps          # Service status and health
docker compose logs -f     # Follow service logs
docker compose down        # Stop; keep both databases
docker compose up -d --wait # Start again with the saved data
```

`docker compose down --volumes` permanently deletes both Compose databases. SDK, demo agent,
shop and the documentation website are placeholders and have no runtime service yet.

## Run locally without Docker

Requires Python 3.11 or newer, uv, and Node.js 18 or newer with npm.

An agent's MCP call goes through the Syngraph core (its mandate, the journal) to the bank sandbox; the client app shows it and changes the rules. Commands are run from the repository root, each server in its own terminal; on macOS/Linux use `.venv/bin/python` instead of `.venv/Scripts/python`.

1. Install:

```bash
uv venv .venv
uv pip install --python .venv -r demo/bank-sandbox/requirements.txt -r product/mcp-server/requirements.txt -e product/core
npm --prefix product/client-app install
```

2. Start the bank sandbox, the core API and the client app:

```bash
.venv/Scripts/python -m uvicorn app:app --app-dir demo/bank-sandbox/src --port 8001
```

```bash
.venv/Scripts/python -m uvicorn core.api:app --port 8000
```

```bash
npm --prefix product/client-app run dev
```

3. Open http://localhost:5173 (language in **Settings**: EN · RU · FR · AR). In **Agents** open "Invoice agent", go to **Settings**, press **Create key** and copy it: it is shown once. Each agent has its own key, limits, working hours and payees; **+** adds another agent.

4. Connect the agent with its key through the MCP Inspector, then press **Connect** in the browser:

```bash
npx @modelcontextprotocol/inspector -e SYNGRAPH_AGENT_KEY=sgk_... .venv/Scripts/python product/mcp-server/src/server.py
```

5. In **Tools** call `pay_invoice` with a payee, the payee's INN (10 or 12 digits with valid check digits, e.g. `7707083893`) and an amount in rubles as a string, e.g. `"25000.00"`. The response holds an operation id, the payee name sent to the bank and `"status": "paid"`; `"rejected"` with a reason; or `"unknown"` if the bank did not answer. The payment pops up in the app. `get_payment_status` with that operation id returns it again; for `"unknown"` it asks the bank first. Without a valid key both tools refuse.

Demo: pause the agent, lower its per-payment limit or switch **Payees** to **Only from the list** in the app — the next `pay_invoice` returns `"rejected"` with the reason. **Replace key** turns the old key off at once.

Data lives in SQLite, `product/core/data/syngraph.db` (not in git). On first use it gets a demo client (id 1) with "Invoice agent" and its mandate from `product/core/rules.example.json`: weekdays 09:00–19:00 Moscow time, any payee, up to 100,000 RUB per payment, 500,000 per day, 1,500,000 per week, 3,000,000 per month; new agents start with the same rules. An older database is brought up to date on open. To start from scratch, delete `syngraph.db`. The bank sandbox keeps balances and payments in `demo/bank-sandbox/data/bank.db` (not in git): account 1 of the demo client starts with 1,000,000 RUB; a payment above the balance is `"rejected"` with `"insufficient funds"`. Top up with `POST http://127.0.0.1:8001/accounts/1/deposit` and `{"amount_kopecks": …}`, check with `GET /accounts/1`.

## License

© 2026 Syngraph. All rights reserved.
