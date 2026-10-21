# bank-sandbox

A sandbox of the client's own bank: a business banking API (accounts, payment orders under client consent, statuses) and the supplier's bank that receives the funds.

In the MVP Syngraph works with the bank where the client already holds its account — the sandbox imitates such a bank. Virtual cards come after MVP.

Used for demos and development. Later real banks are connected instead — `core` does not change, only a bank adapter is added.

- `src/` — code
- `data/` — data
