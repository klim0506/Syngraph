# mcp-server

The Syngraph MCP server — the entry point for AI agents.

Accepts agent calls, finds the agent by its key and forwards the request to `core`. It makes no decisions itself.

The agent connects with its own key, created in the client app: `SYNGRAPH_AGENT_KEY` in the environment of this server. Every call is checked against that agent's mandate; without a valid key the tools refuse.

Tools now: `pay_invoice(payee, payee_inn, amount)` and `get_payment_status(operation_id)`.

MCP function descriptions live here — `developer-docs/` and the `sdk-python/` types are generated from them.

- `src/` — code
- `data/` — data
