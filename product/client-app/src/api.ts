// Calls to the core API (see product/core/src/core/api.py). No sign-in yet: one demo client.
export const CLIENT_ID = 1;

export type Period = "payment" | "day" | "week" | "month";
export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export const WEEKDAYS: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
export type AgentIcon = "invoice" | "cart" | "plane" | "truck" | "briefcase" | "building" | "card" | "bank";
/** What a payment is for; the agent names one with each payment (core: db.CATEGORIES). */
export const CATEGORIES = ["goods", "office", "it", "marketing", "rent", "transport", "travel", "services", "taxes", "entertainment"] as const;
export type Category = (typeof CATEGORIES)[number];
export type Approval = "auto" | "manual"; // auto: the person decides only what breaks the rules; manual: every payment
export type CategoryMode = "any" | "only" | "except";

/** An agent with its own mandate. */
export type Agent = {
  id: number;
  name: string;
  icon: AgentIcon;
  has_key: boolean;
  key_hint: string | null; // start and end of the current key, "sgk_Ab3x…9QzT"; older keys: the end only
  paused: boolean;
  any_counterparty: boolean;
  any_time: boolean; // no working hours: the agent may pay at any time
  any_amount: boolean; // no amount limits: `limits` are kept but not checked
  timezone: string;
  working_days: Weekday[];
  working_from: string; // "09:00"
  working_to: string;
  working_now: boolean;
  limits: Record<Period, number | null>; // kopecks; null: no limit for the day, week or month
  spent: Record<Exclude<Period, "payment">, number>; // kopecks: paid, pending and unknown
  approval: Approval;
  category_mode: CategoryMode;
  allowed_categories: Category[]; // used with "only"
  blocked_categories: Category[]; // used with "except"
};

/** Only the fields to change. Limits are rubles as strings, like "100000.00"; "" clears a day, week or month limit. */
export type AgentChange = Partial<{
  name: string;
  icon: AgentIcon;
  paused: boolean;
  any_counterparty: boolean;
  any_time: boolean;
  any_amount: boolean;
  working_days: Weekday[];
  working_from: string;
  working_to: string;
  max_payment: string;
  max_day: string;
  max_week: string;
  max_month: string;
  approval: Approval;
  category_mode: CategoryMode;
  allowed_categories: Category[];
  blocked_categories: Category[];
}>;

export type Status = "awaiting" | "pending" | "paid" | "rejected" | "unknown"; // awaiting: the person approves or declines

export type Operation = {
  id: string;
  agent_id: number;
  agent_name: string;
  created_at: string; // UTC
  payee: string;
  payee_inn: string;
  amount_kopecks: number;
  currency: string;
  category: Category | null; // null in older operations
  status: Status;
  reason: string | null;
};

export type StatisticsPeriod = "today" | "day" | "week" | "month";
export type AgentStatistics = {
  period: StatisticsPeriod | null;
  timezone: string;
  today: { amount_kopecks: number; count: number };
  total: { amount_kopecks: number; count: number; average_kopecks: number; payees: number };
  days: { date: string; amount_kopecks: number; count: number }[];
  month: { date: string; amount_kopecks: number; count: number }[];
  hours: { hour: number; amount_kopecks: number; count: number }[];
  rolling_hours: { start: string; end: string; amount_kopecks: number; count: number }[];
  categories: { category: Category | null; amount_kopecks: number; count: number }[];
  largest: Operation[];
  operations_count: number;
  success_rate: number | null;
  flows: { allowed: number; rejected: number; cancelled: number; approved: number; awaiting: number; unknown: number };
};

export type Counterparty = { inn: string; name: string };
export type ListedCounterparty = Counterparty & { allowed: boolean }; // false: only paid before

/** The core answered with an error; `status` tells "not found" (404) from "bad input" (400). */
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.json().then((e) => e.detail, () => response.statusText);
    throw new ApiError(response.status, typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

const client = `/clients/${CLIENT_ID}`;

export const getAgents = () => call<Agent[]>("GET", `${client}/agents`);
/** One paid calendar window, aggregated from the full journal in the mandate's time zone. */
export const getAgentStatistics = (id: number, period: StatisticsPeriod) => call<AgentStatistics>("GET", `${client}/agents/${id}/statistics?period=${period}`);
/** A new agent; settings not given take the defaults. A wrong setting creates nothing. */
export const addAgent = (name: string, settings: AgentChange = {}, payees: Counterparty[] = []) =>
  call<Agent>("POST", `${client}/agents`, { ...settings, name, payees });
export const changeAgent = (id: number, change: AgentChange) => call<Agent>("PATCH", `${client}/agents/${id}`, change);
/** Creates or replaces the agent's key. The key comes only in this answer. */
export const newAgentKey = (id: number) => call<{ key: string; hint: string }>("POST", `${client}/agents/${id}/key`);

/** Deletes the agent: its key stops working at once; the core keeps its payments, the app no longer shows them. */
export const deleteAgent = (id: number) => call<void>("DELETE", `${client}/agents/${id}`);

export const getOperations = () => call<Operation[]>("GET", `${client}/operations?limit=100`);
/** The person's decision on an awaiting payment; an approved one goes to the bank. */
export const approveOperation = (id: string) => call<Operation>("POST", `${client}/operations/${id}/approve`);
export const declineOperation = (id: string) => call<Operation>("POST", `${client}/operations/${id}/decline`);
/** Asks the bank again about an unknown operation. */
export const checkOperation = (id: string) => call<Operation>("POST", `${client}/operations/${id}/check`);

export const getCounterparties = (agentId: number) =>
  call<ListedCounterparty[]>("GET", `${client}/agents/${agentId}/counterparties`);

/** Directory lookup by exact INN; null when the directory does not know it. */
export const findByInn = (inn: string) =>
  call<Counterparty>("GET", `/counterparties/${inn}`).catch((e) => {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  });

export const addCounterparty = (agentId: number, inn: string, name: string) =>
  call<Counterparty>("POST", `${client}/agents/${agentId}/counterparties`, { inn, name });

export const removeCounterparty = (agentId: number, inn: string) =>
  call<void>("DELETE", `${client}/agents/${agentId}/counterparties/${inn}`);

/** Keeps numbers, times and keys left to right inside right-to-left text (Arabic). */
export const ltr = (text: string) => `\u2066${text}\u2069`;

/** 12345600 kopecks -> "123 456 ₽"; kopecks are shown only when there are any. */
export function rub(kopecks: number): string {
  const rubles = Math.floor(kopecks / 100);
  const rest = kopecks % 100;
  const whole = rubles.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u2009");
  return ltr(rest ? `${whole}.${String(rest).padStart(2, "0")} ₽` : `${whole} ₽`);
}

/** "2026-10-26T09:41:00Z" -> "26 Oct, 12:41" in the viewer's time zone and language. */
export const when = (utc: string, locale: string) =>
  new Date(utc).toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
