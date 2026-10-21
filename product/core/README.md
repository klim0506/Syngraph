# core

The Syngraph core.

- Agent mandates and rules: limits, categories, counterparties, when human validation is required.
- Operation journal: a record is created before any checks, after that only its status changes; the result is a payment passport.
- Notifications to agents at their address (webhooks).
- Adapter to the client's bank via the Bank of Russia Open API: `bank-sandbox` for now, a real bank later.

Entry points to the core: `mcp-server` (agents) and `client-app` (people).

- `src/` — code
- `data/` — data
