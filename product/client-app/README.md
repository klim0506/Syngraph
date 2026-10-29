# client-app

The Syngraph client app — for people at the company.

- Connect an agent and issue it a mandate.
- View the operation journal and payment passports.
- Suspend an agent instantly.

Human approval of payments is planned.

Works only through the `core` API.

Now: a mobile app for the demo client (id 1), no sign-in; on a large screen it is shown in a phone outline on a navy backdrop. The look follows the project presentation, kept to the minimum: navy blocks, one bright blue accent, white cards; light and dark themes. Text comes in four styles only, the same on every screen: standard, active (blue, semibold: what is chosen, buttons, links), inactive (gray: labels, dates, hints) and heading. Statuses and messages are text with a coloured dot.

- **Agents** — the client's agents: the icon, today's spending against the day limit as a bar, how long ago the last payment was, awaiting decisions and a green/red payment-status dot; **+** adds one. The **Syngraph** logo leads back to this list. An agent page has no name/icon header; its fixed bottom navigation is **Statistics · Control · Operations**.
- **Statistics** — the default section for a connected agent. One compact period dropdown above the dashboard controls every metric: Day (today by hour), Week (the last seven calendar days), or Month (the last thirty calendar days). The line chart, paid amount, count, average, distinct payees, category distribution and top-three payments all use that period. Tap/drag the chart or use arrow keys to inspect one interval without changing the dashboard period. Only paid operations count, across the full journal rather than the capped feed; calendar boundaries follow the mandate time zone and creation date. Empty data produces zeros; failed requests offer Retry, and delayed responses from another period are ignored.
- **Control** — the key comes first: two characters after `sgk_` and the last four are shown; **Replace** issues a new key, shown once with **Copy**. Blue switches enable amount limits, working hours, categories and listed payees. Amount limits are per payment, day, week and month, with spent amounts below; an empty week/month/day limit means no limit for that period. Categories offer "Only these" or "All but these". For listed payees, enter an INN and choose a known payee or enter the new one's name. **Approve all transactions?** requests human approval for every payment; a notice explains changes after saving. Deletion still requires confirmation. A separate payment switch is the last field: green enables payments, red stops them, each after confirmation.
- **Operations** — the agent's payment feed. Search by payee, INN, whole-ruble amount or date; period and status are dropdowns beside their labels in the filter pop-up, with counts and Reset. A payment opens its passport; awaiting payments can be approved/declined, and unconfirmed payments checked with the bank. A new-payment notification opens this section. Empty operations and an empty agent list share matching illustrations.
- **Settings** — the profile button at the top right: language and theme.

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
