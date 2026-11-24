# Syngraph

Syngraph gives software agents a way to pay supplier invoices under company-defined rules. Finance teams set each agent's limits and approval policy in the client app. Agents submit payments through the Model Context Protocol (MCP) and follow their status.

## How it works

1. **Set the rules.** Create an agent and give it a mandate covering spending limits, working hours, payees, categories and when a person must approve a payment. Each agent has its own revocable key.
2. **Submit a payment.** The agent sends the supplier, amount and category. Syngraph checks the mandate, sends eligible payments to the bank, routes exceptions for approval or rejects payments blocked by policy.
3. **Approve and track.** Finance can approve or decline an operation, pause an agent, and review payment details, notifications and spending. Agents can read their own mandate and payment history and check an operation's status.

| Component | Role |
|---|---|
| [Client app](product/client-app/) | Agent setup, payment approval, operations, notifications and spending analytics |
| [MCP server](product/mcp-server/) | Payment submission, status, mandate, history and available-amount tools |
| [Core](product/core/) | Mandate enforcement, operation journal and bank adapter |

## Run Syngraph locally

With Docker and Compose v2, run this from the repository root.

```bash
docker compose up --build -d --wait
```

Open [the client app](http://localhost:8088) and create an agent with **+**. Set its mandate and copy the key shown at the end of setup. Connect your MCP client to `http://localhost:8088/mcp` over Streamable HTTP and send `Authorization: Bearer sgk_...` with each request.

To try the approval flow, enable approval for every payment in the agent's settings and call `pay_invoice` with these example arguments. Generate and save a fresh `idempotency_key` for each new payment.

```json
{
  "payee": "Example Supplier",
  "payee_inn": "7707083893",
  "amount": "125.30",
  "category": "office",
  "idempotency_key": "26676e5a-9b13-4f22-a4d3-4acdc46f974c"
}
```

The tool returns an operation ID and `awaiting`. Open the operation in the client app and approve it, then pass its ID to `get_payment_status`. The status becomes `paid` when the bank confirms the debit. If a payment is `unknown`, use the same operation ID to check its status before taking further action.

If the tool's reply is lost, retry with the original key and arguments. Syngraph returns the same operation ID and its stored status without sending a second order to the bank.

The local stack binds to `127.0.0.1` and runs with virtual funds and a single preconfigured company, without company sign-in. Bank selection and account assignment in the app are demonstration controls. Payments in this release go through the [bank simulator](demo/bank-sandbox/). The planned bank integration will use the company's existing business account.

| Endpoint | Purpose |
|---|---|
| `/` | Client app |
| `/api/` | Client API |
| `/mcp` | MCP over Streamable HTTP |
| `/core/docs` | Core API reference |
| `/bank/docs` | Bank simulator API reference |

Set `SYNGRAPH_PORT` to change the default port of `8088`. Compose stores the operation journal and bank data in the `core-data` and `bank-data` volumes. `docker compose down` keeps both volumes. `docker compose down --volumes` deletes them.

### MCP over stdio

Set `SYNGRAPH_AGENT_KEY` in the environment of your MCP client. With the Compose stack running, configure the client to run this command from the repository root.

```bash
docker compose run --rm --no-deps -T -e SYNGRAPH_AGENT_KEY mcp python product/mcp-server/src/server.py
```

### Development without Docker

Install dependencies with Python 3.11 or later, uv and Node.js 18 or later.

```bash
uv venv .venv
uv pip install --python .venv -r demo/bank-sandbox/requirements.txt -r product/mcp-server/requirements.txt -e product/core
npm --prefix product/client-app install
```

Run each command in its own terminal from the repository root. On macOS and Linux, use `.venv/bin/python` in place of `.venv/Scripts/python`.

```bash
.venv/Scripts/python -m uvicorn app:app --app-dir demo/bank-sandbox/src --port 8001
.venv/Scripts/python -m uvicorn core.api:app --port 8000
.venv/Scripts/python -m uvicorn server:create_http_app --factory --app-dir product/mcp-server/src --port 8002
npm --prefix product/client-app run dev
```

Open [the client app](http://localhost:5173) and connect your MCP client to `http://127.0.0.1:8002/mcp`. The two SQLite databases for this setup live in `product/core/data/` and `demo/bank-sandbox/data/`.

## License

© 2026 Syngraph. All rights reserved.
