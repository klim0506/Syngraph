# client-app

The Syngraph client app — for people at the company.

- Connect an agent and issue it a mandate.
- View the operation journal and payment passports.
- Suspend an agent instantly.

Human approval of payments is planned.

Works only through the `core` API.

Now: a mobile app for the demo client (id 1), no sign-in; on a large screen it is shown in a phone outline on a navy backdrop. The look follows the project presentation, kept to the minimum: navy blocks, one bright blue accent, white cards; light and dark themes. Text comes in four styles only, the same on every screen: standard, active (blue, semibold: what is chosen, buttons, links), inactive (gray: labels, dates, hints) and heading. Statuses and messages are text with a coloured dot.

- **Agents** — the client's agents, each with its icon, today's spending and status; **+** adds one. An agent opens with three sections; pause is on the agent card. **Limits**: per payment, day, week and month, with what was spent under each; working days and hours; payees — "Anyone", or "Only from the list": type an INN, choose from the list (the agent's known payees and the directory's match) or, for a new one, type its name; an invalid INN is reported on Add. **History**: the agent's payments with the same filters. **Settings**: the key — its start and end are shown; ↻ replaces it, and a new key is shown once, with **Copy** — the name, and the icon (tap it to choose another).
- **History** — payments of all agents; filters by payee or INN, agent and period, and by status. A payment opens as its passport; an unconfirmed one can be checked with the bank.
- **Settings** — language and theme.

Data refreshes every 3 seconds, and a new agent payment pops up at the bottom. Icons come from Lucide (ISC license).

## Languages

English, Russian, French and Arabic (right to left), chosen in **Settings**; flags show in the open list. The language and the theme are remembered in the browser; the first theme follows the system. Messages from the core are shown in the chosen language too.

To add a language: copy `src/i18n/en.ts` to a new file, translate it, add it to `LANGUAGES` in `src/i18n/index.ts` and give it a flag in `src/i18n/flags.tsx`. TypeScript reports any missing phrase.

## Run

Vite + React + TypeScript, Node 18+, with the core API running on port 8000 (see `product/core/README.md`):

```bash
cd product/client-app
npm install
npm run dev
```

Open http://localhost:5173. Vite forwards `/api` to the core API.

- `src/` — code
