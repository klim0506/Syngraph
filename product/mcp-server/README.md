# mcp-server

The Syngraph MCP server — the entry point for AI agents.

Accepts agent calls (pay an invoice, request a card, get a status), verifies the agent's signature and forwards the request to `core`. It makes no decisions itself.

MCP function descriptions live here — `developer-docs/` and the `sdk-python/` types are generated from them.

- `src/` — code
- `data/` — data
