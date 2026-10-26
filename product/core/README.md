# core

The Syngraph core.

- Agent mandates and rules: limits, categories, counterparties, when human validation is required.
- Operation journal: a record is created before the bank is called, after that only its status changes; the result is a payment passport.
- Notifications to agents at their address (webhooks).
- Adapter to the client's bank via the Bank of Russia Open API: `bank-sandbox` for now, a real bank later.

Entry points to the core: `mcp-server` (agents) and `client-app` (people).

Data lives in SQLite, `data/syngraph.db` (not in git): `clients`; their `mandates` — an agent's rules (working hours, allowed counterparties, limits per payment, day, week and month), a client may have several; `counterparties` — organisations, shared by all clients, one row per INN, the INN is the key and the stored name is the one sent to the bank; `mandate_counterparties` — whom a mandate may pay; `transactions` — every payment with the payee details as sent to the bank, its status (`pending`, `paid`, `rejected`, `unknown` — the bank did not answer, the payment may have gone through) and the reason. Limits count `paid`, `pending` and `unknown` payments. Every bank order carries the operation id: the bank does not pay one id twice, and `get_status` asks the bank again about an `unknown` payment — `paid` if it was made, `rejected` if the bank never received it, still `unknown` if the bank does not answer. An empty database gets a demo client (id 1) with a mandate from `rules.example.json`; for now the client's first mandate is used. An unknown INN is added to `counterparties` automatically with the name from the request; a known INN keeps its stored name.

Code: `payments.py` (pay an invoice), `rules.py` (mandate checks), `db.py` (SQLite), `bank.py` (bank adapter), `money.py` (kopecks), `errors.py` (bad request, broken mandate, unconfirmed bank payment). Functions in `db.py` never commit; `payments.py` commits explicitly.

- `src/` — code
- `data/` — data
