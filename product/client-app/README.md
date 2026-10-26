# client-app

The Syngraph client app — for people at the company.

- Connect an agent and issue it a mandate.
- Approve or reject a payment when human validation is required.
- View the operation journal and payment passports.
- Suspend an agent instantly.

Works only through the `core` API.

Now: a mobile app for the demo client (id 1), no sign-in; on a large screen it is shown in a phone outline.

- **Agents** — the client's agents; **Create** adds one. An agent opens with four sections: **Overview** (pause, spent today, this week and this month against the limits, latest payments), **Limits** (per payment, day, week, month, working days and hours), **Payees** ("Anyone / Only from the list", adding by suggestion, by INN — the name comes from the directory — or as a new one, removal), **Key** (create or replace the agent's key; it is shown once, with **Copy**).
- **Payments** — operations of all agents with filters, details and "Check with the bank" for an unconfirmed one.

Data refreshes every 3 seconds, and a new agent payment pops up at the bottom.

## Languages

English, Russian, French and Arabic (right to left), switched at the top; the choice is remembered in the browser. Messages from the core are shown in the chosen language too.

To add a language: copy `src/i18n/en.ts` to a new file, translate it and add it to `LANGUAGES` in `src/i18n/index.ts`. TypeScript reports any missing phrase.

## Run

Vite + React + TypeScript, Node 18+, with the core API running on port 8000 (see `product/core/README.md`):

```bash
cd product/client-app
npm install
npm run dev
```

Open http://localhost:5173. Vite forwards `/api` to the core API.

- `src/` — code
