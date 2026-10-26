# bank-sandbox

A sandbox of the client's own bank: a business banking API (accounts, payment orders under client consent, statuses) and the supplier's bank that receives the funds.

In the MVP Syngraph works with the bank where the client already holds its account — the sandbox imitates such a bank. Virtual cards come after MVP.

Now: `POST /pay` takes a payment order with the payer's `operation_id` and confirms it at once; the same `operation_id` is never paid twice. `GET /payments/{operation_id}` returns the payment or 404 if the bank never received it. Payments live in memory and are lost on restart.

Used for demos and development. Later real banks are connected instead — `core` does not change, only a bank adapter is added.

- `src/` — code
- `data/` — data
