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

## License

© 2026 Syngraph. All rights reserved.
