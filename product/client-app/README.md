# client-app

The Syngraph client app — for people at the company.

- Connect an agent and issue it a mandate.
- View the operation journal and payment passports.
- Suspend an agent instantly.

Human approval of payments is planned.

Works only through the `core` API.

Now: a mobile app for the demo client (id 1), no sign-in; on a large screen it is shown in a phone outline on a navy backdrop. The look follows the project presentation, kept to the minimum: navy blocks, one bright blue accent, white cards; light and dark themes. Text comes in four styles only, the same on every screen: standard, active (blue, semibold: what is chosen, buttons, links), inactive (gray: labels, dates, hints) and heading. Statuses and messages are text with a coloured dot.

- **Agents** — the client's agents: the icon, today's spending against the day limit as a bar, how long ago the last payment was, awaiting decisions and a green/red payment-status dot; **+** adds one. The **Syngraph** name leads back to this list; the header has no separate letter icon. An agent page has no name/icon header; its floating bottom navigation is **Statistics · Control · Operations**, with a translucent blurred background and reserved scrolling space so the last controls remain reachable. A translucent phone bar below it provides recent screens, Home and Back; Back dismisses an open filter or confirmation before returning through visited sections.
- **Statistics** — the default section for a connected agent. One compact period dropdown above the dashboard controls every metric: Today (since local midnight), 24 hours (a rolling window), Week (the last seven calendar days), or Month (the last thirty calendar days). The line chart, paid amount, count, average, distinct payees, category distribution and top-three payments all use that period. Tap/drag the chart or use arrow keys to inspect one interval without changing the dashboard period. Spending metrics use paid operations across the full journal rather than the capped feed; calendar boundaries follow the mandate time zone and creation date. Total paid and payment count precede the line chart; average payment and distinct payees form the last row below the top-three payments. The vertical axis shows values in thousands of rubles without a unit caption. The period dropdown and all ordinary card text share one size: 13px, or 12px on screens up to 360px; labels stay on one line without individual shrinking. Exact monetary values fit independently and retain their larger emphasis; decorative metric icons are hidden when the actual card content is too narrow to leave a clear gap beside the full label, including the desktop phone frame. The chart header shows only the amount. A separate decision distribution includes all operations in the period: allowed automatically, rejected, declined after an approval request, approved, and awaiting approval; legacy rows without reliable decision history are listed separately. Both breakdowns sort their rows and bar segments from largest to smallest, by count for decisions and amount for categories; ties keep their original order. Empty data produces zeros; failed requests offer Retry, and delayed responses from another period are ignored.
- **Control** — the key comes first: two characters after `sgk_` and the last four are shown; **Replace** issues a new key, shown once with **Copy**. Blue switches enable amount limits, working hours, categories and listed payees. Amount limits are per payment, day, week and month, without spent-amount captions; an empty week/month/day limit means no limit for that period. Categories offer "Only these" or "All but these". For listed payees, enter an INN and choose a known payee or enter the new one's name. **Approve all transactions?** requests human approval for every payment; a notice explains changes after saving. Deletion still requires confirmation. A separate payment switch sits below the rules and above deletion: green enables payments, red stops them, each after confirmation.
- **Operations** — the agent's payment feed, grouped into separate cards by local calendar day, newest first. A date heading sits above each card and rows show only the time; older years are included in the heading. Search by payee, INN, whole-ruble amount or date; period and status are dropdowns beside their labels in the filter pop-up, with counts and Reset. A payment opens its passport; awaiting payments can be approved/declined, and unconfirmed payments checked with the bank. A new-payment notification opens this section. Empty operations and an empty agent list share matching illustrations. The large plus on the empty agent illustration is a real, keyboard-accessible button that opens the same connection form as the text button. Their decorative dots and pluses orbit at different speeds and directions; pluses also spin. Hover doubles the speed, while a tap gives a brief fourfold boost without restarting the animation. The system reduced-motion preference disables movement.
- **Settings** — the profile button at the top right: language, theme and a bank-account connection mock for screencasts. The mock uses a fixed fictional bank and account, shows a Demo label in both states, and only remembers its connection flag for the current browser tab. It sends no bank requests and does not change the account used for payments. Company sign-up and real bank connection are not implemented.

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
