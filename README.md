# Syngraph

A payment layer for companies' AI agents: an agent pays from the company account strictly within the limits the client has set

Syngraph sits between the agent and any bank. We hold the agent's mandate, the rules, human validation and the operation journal. The bank only executes payments — through its business API or the Bank of Russia Open API. The MVP covers paying supplier invoices (B2B) from the bank where the client already holds its account. Card payments on websites come later.

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
 mandate · rules · journal (approvals, journal)
      │
      │ Bank of Russia Open API
      ▼
 client's own bank         demo/bank-sandbox/ — sandbox, later real banks
```

**`product/` — the Syngraph service**

| Block | Role |
|---|---|
| [`core/`](product/core/) | Core: mandates, rules, journal, agent notifications, bank adapter |
| [`mcp-server/`](product/mcp-server/) | MCP server — the entry point for AI agents, forwards calls to the core |
| [`client-app/`](product/client-app/) | Client app: connect an agent, set up a mandate, approve a payment, view the journal |

**`developers/` — for third-party developers**

| Block | Role |
|---|---|
| [`sdk-python/`](developers/sdk-python/) | Python library: connect an agent in a few lines |
| [`developer-docs/`](developers/developer-docs/) | Service documentation: MCP, library, security, `llms.txt` |

**`demo/` — showing how it all works**

| Block | Role |
|---|---|
| [`agent/`](demo/agent/) | Demo agent: paying invoices (B2B) and paying by card on websites |
| [`bank-sandbox/`](demo/bank-sandbox/) | Bank sandbox with the Bank of Russia Open API; later replaced by a real bank |
| [`shop/`](demo/shop/) | Test online shop for card payments (after MVP) |

## Run locally

An MCP call goes through the Syngraph core (mandate checks, journal) to the bank sandbox. Commands are run from the repository root; on macOS/Linux use `.venv/bin/python` instead of `.venv/Scripts/python`.

1. Install:

```bash
uv venv .venv
uv pip install --python .venv -r demo/bank-sandbox/requirements.txt -r product/mcp-server/requirements.txt -e product/core
```

2. Start the bank sandbox and keep it running:

```bash
.venv/Scripts/python -m uvicorn app:app --app-dir demo/bank-sandbox/src --port 8001
```

3. In a second terminal open the MCP Inspector, then press **Connect** in the browser:

```bash
npx @modelcontextprotocol/inspector .venv/Scripts/python product/mcp-server/src/server.py
```

4. In **Tools** call `pay_invoice` with `client_id` = 1, a payee, the payee's INN (10 or 12 digits with valid check digits, e.g. `7707083893`) and an amount in rubles as a string, e.g. `"245000.00"`. The response holds an operation id, the payee name sent to the bank and `"status": "paid"`; `"rejected"` with a reason; or `"unknown"` if the bank did not answer. `get_payment_status` with the same `client_id` and that operation id returns the operation again; for `"unknown"` it asks the bank first and turns it into `"paid"` or `"rejected"` (the bank never received it). The bank sandbox keeps payments in memory: after its restart an old `"unknown"` becomes `"rejected"`. If the database schema changed after an update, delete `syngraph.db`.

Data lives in SQLite, `product/core/data/syngraph.db` (not in git). On first use it gets a demo client (id 1) and a mandate from `product/core/rules.example.json`: weekdays 09:00–19:00 Moscow time, any counterparty, up to 100,000 RUB per payment, 500,000 per day, 1,500,000 per week, 3,000,000 per month. To change the rules, edit the `mandates` table (e.g. in DB Browser for SQLite); outside working hours every payment is rejected. To start from scratch, delete `syngraph.db`.

## License

© 2026 Syngraph. All rights reserved.
