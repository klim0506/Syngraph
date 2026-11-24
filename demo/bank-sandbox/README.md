# bank-sandbox

A sandbox of the client's own bank: a business banking API (accounts, payment orders under client consent, statuses) and the supplier's bank that receives the funds.

In the MVP Syngraph works with the bank where the client already holds its account — the sandbox imitates such a bank. Virtual cards come after MVP.

Now it keeps account balances and payments in SQLite (`data/bank.db`). An account id is the Syngraph client id; an empty database gets account 1 with 1 000 000 ₽.

- `POST /pay` submits an order with `account`, `payee`, `payee_inn`, `amount_kopecks`, `currency`, and the caller's `operation_id` (also accepted as `externalId`). When both identifier fields are sent, their values must match. The optional `payment_order` object is stored as supplied.
- The reply includes the bank's `id`, the caller's `externalId`, and `status` / `bankStatus`. A new order starts as `pending` / `ACCEPTED`. After about one second the sandbox debits the account and reports `paid` / `IMPLEMENTED`, or reports `rejected` / `REFUSEDBYBANK` with `reason` (`insufficient funds` or `no such account`). Pending orders are processed after a restart.
- `GET /payments/{externalId}` (also `/payments/{externalId}/state`) returns the current state, including after a lost submission response. If there is no order for the ID, it returns 404. Resubmitting the same ID and order returns its current state without another debit. Reusing an ID with different details returns 409.
- `GET /accounts/{id}` — the balance in kopecks.
- `POST /accounts/{id}/deposit` with `{"amount_kopecks": …}` — tops up the account; an unknown one is opened.

To start over, stop the sandbox and delete `data/bank.db`.

Used for demos and development. Later real banks are connected instead — `core` does not change, only a bank adapter is added.

- `src/` — code
- `data/` — data
