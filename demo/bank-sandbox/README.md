# bank-sandbox

A sandbox of the client's own bank: a business banking API (accounts, payment orders under client consent, statuses) and the supplier's bank that receives the funds.

In the MVP Syngraph works with the bank where the client already holds its account — the sandbox imitates such a bank. Virtual cards come after MVP.

Now it keeps account balances and payments in SQLite (`data/bank.db`). An account id is the Syngraph client id; an empty database gets account 1 with 1 000 000 ₽.

- `POST /pay` — a payment order from `account` with the payer's `operation_id`. Enough money: the balance is debited, `"status": "paid"`. Otherwise `"status": "rejected"` with `"reason": "insufficient funds"` or `"no such account"`. The same `operation_id` is never paid twice: a repeat gets the first answer.
- `GET /payments/{operation_id}` — the payment, or 404 if the bank never received it.
- `GET /accounts/{id}` — the balance in kopecks.
- `POST /accounts/{id}/deposit` with `{"amount_kopecks": …}` — tops up the account; an unknown one is opened.

To start over, stop the sandbox and delete `data/bank.db`.

Used for demos and development. Later real banks are connected instead — `core` does not change, only a bank adapter is added.

- `src/` — code
- `data/` — data
