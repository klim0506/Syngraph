# mcp-server

The Syngraph MCP server — the entry point for software agents.

Accepts agent calls, finds the agent by its key and forwards the request to `core`. It makes no decisions itself.

The agent connects with its own key, created in the client app: `SYNGRAPH_AGENT_KEY` in the environment of this server. Every call is checked against that agent's mandate; without a valid key the tools refuse.

Tools now:

| Tool | What it does |
|---|---|
| `pay_invoice(payee, payee_inn, amount, category)` | Pays an invoice. A payment outside the client's rules, or every payment in manual mode, gets the status `awaiting` until the client approves or declines it in the app. |
| `get_payment_status(operation_id)` | The status of one operation; an `unknown` one is asked from the bank again. |
| `get_mandate()` | The agent's rules: pause, approval mode, working hours, payees, categories, limits, and what it has spent this day, week and month. |
| `list_payments(status, payee_inn, limit)` | The agent's own operations, newest first, filtered by status or payee INN. |
| `get_available_balance()` | The largest payment the agent can make now within its amount limits and the account balance, and what sets it. |

MCP function descriptions live here. Generating `developer-docs/` and `sdk-python/` types from them is planned.

The root `compose.yaml` also serves these tools over Streamable HTTP at
`http://localhost:8088/mcp`. Send `Authorization: Bearer sgk_...` on each request.
HTTP keys are read from the request context, so clients do not share a process-wide agent key.
Missing or invalid keys cannot call the tools. The original stdio entry point still reads
`SYNGRAPH_AGENT_KEY`; see the root README for the Compose stdio command.

- `src/` — code
- `data/` — data
