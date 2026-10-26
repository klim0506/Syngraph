// English: the reference dictionary. Every other language must have the same keys (TypeScript checks it).
import type { AgentIcon, Period, Status, Weekday } from "../api";

export const en = {
  name: "English",
  locale: "en-GB", // dates
  dir: "ltr" as "ltr" | "rtl",

  tabs: { agents: "Agents", history: "History", settings: "Settings" },
  loading: "Loading…",
  unreachable: "Syngraph core is not reachable",
  reconnecting: "Connection lost, retrying…",
  state: { paused: "paused", active: "active", offHours: "off hours" },
  toast: {
    paid: "Agent payment paid",
    rejected: "Agent payment rejected",
    unknown: "Agent payment not confirmed by the bank",
    pending: "Agent payment in progress",
  } satisfies Record<Status, string>,

  days: { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" } satisfies Record<Weekday, string>,
  dayLetters: { mon: "M", tue: "T", wed: "W", thu: "T", fri: "F", sat: "S", sun: "S" } satisfies Record<Weekday, string>,

  newAgent: "New agent",
  newAgentPlaceholder: "Agent name, e.g. Travel agent",
  create: "Create",
  noKey: "no key",
  spentToday: (spent: string, limit: string) => `Today ${spent} of ${limit}`,
  back: "Agents",
  sections: { limits: "Limits", history: "History", settings: "Settings" },
  keyLabel: "Key",
  agentName: "Agent name",
  icon: "Icon",
  iconNames: { invoice: "Invoices", cart: "Purchases", plane: "Travel", truck: "Logistics", briefcase: "Business", building: "Office", card: "Cards", bank: "Finance" } satisfies Record<AgentIcon, string>,

  pause: "Pause",
  resume: "Resume",
  workingHours: "Working hours",
  payees: "Payees",
  anyone: "Anyone",
  onlyList: "Only from the list",

  limit: { payment: "One payment", day: "Per day", week: "Per week", month: "Per month" } satisfies Record<Period, string>,
  spentNow: (amount: string) => `spent ${amount}`,
  inRubles: (label: string) => `${label}, rubles`,
  from: "From",
  to: "To",
  saved: "Saved. The agent follows the new rules from its next payment.",
  cancel: "Cancel",
  save: "Save",
  saving: "Saving…",

  innExample: "e.g. 7707083893",
  nameLabel: "Name",
  newPayeeName: "Name of the new payee",
  addPayee: "Add payee",
  inList: "in the list",
  listEmpty: "The list is empty.",
  remove: "Remove",
  removeName: (name: string) => `Remove ${name}`,

  keyNote: "The agent connects to Syngraph with this key: SYNGRAPH_AGENT_KEY in the settings of its MCP server.",
  replaceKey: "Replace key",
  replaceWarn: "The current key stops working at once.",
  keyOnce: "Copy the key now: Syngraph keeps only its fingerprint and will not show it again.",
  copy: "Copy",
  copied: "Copied",
  done: "Done",

  language: "Language",
  theme: "Theme",
  themes: { light: "Light", dark: "Dark" },
  passport: "Payment passport",

  filter: { all: "All", paid: "Paid", rejected: "Rejected", unknown: "Unconfirmed" },
  filters: "Filters",
  searchPayee: "Payee or INN",
  allAgents: "All agents",
  period: "Period",
  periods: { today: "Today", week: "This week", month: "This month", all: "All time" },
  resetFilters: "Reset filters",
  nothingHere: "Nothing here yet.",
  status: { paid: "Paid", rejected: "Rejected", unknown: "Unconfirmed", pending: "In progress" } satisfies Record<Status, string>,
  agent: "Agent",
  inn: "INN",
  operation: "Operation",
  reason: "Reason",
  checkBank: "Check with the bank",
  askingBank: "Asking the bank…",

  // Messages from the core, matched in i18n/index.ts; an unknown one is shown as it came.
  server: {
    paused: "The client has paused the agent",
    outsideHours: (days: string, from: string, to: string, timezone: string) =>
      `Outside working hours: ${days} ${from}–${to} (${timezone})`,
    notAllowed: (inn: string) => `INN ${inn} is not in the agent's list of payees`,
    overPayment: (amount: string) => `More than the limit of ${amount} per payment`,
    overPeriod: (period: string, amount: string) => `The ${period} limit of ${amount} would be exceeded`,
    period: { day: "daily", week: "weekly", month: "monthly" },
    unconfirmed: "The bank did not confirm the payment: it may have gone through",
    notReceived: "The bank has no such payment: it was not made",
    limitsGrow: "Limits must grow: per payment ≤ day ≤ week ≤ month",
    hoursOrder: "Working hours must start before they end",
    badAmount: "Enter an amount in rubles, more than zero",
    badInn: "The INN is not valid: 10 or 12 digits with a correct check digit",
    badName: "The name must be 1 to 160 characters",
    badAgentName: "The agent name must be 1 to 80 characters",
  },
};

export type Dict = typeof en;
