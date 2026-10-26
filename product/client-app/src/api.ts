// Calls to the core API (see product/core/src/core/api.py). No sign-in yet: one demo client.
export const CLIENT_ID = 1;

export type Period = "payment" | "day" | "week" | "month";
export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export const WEEKDAYS: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/** An agent with its own mandate. */
export type Agent = {
  id: number;
  name: string;
  has_key: boolean;
  key_hint: string | null; // last characters of the current key
  paused: boolean;
  any_counterparty: boolean;
  timezone: string;
  working_days: Weekday[];
  working_from: string; // "09:00"
  working_to: string;
  working_now: boolean;
  limits: Record<Period, number>; // kopecks
  spent: Record<Exclude<Period, "payment">, number>; // kopecks: paid, pending and unknown
};

/** Only the fields to change. Limits are rubles as strings, like "100000.00". */
export type AgentChange = Partial<{
  name: string;
  paused: boolean;
  any_counterparty: boolean;
  working_days: Weekday[];
  working_from: string;
  working_to: string;
  max_payment: string;
  max_day: string;
  max_week: string;
  max_month: string;
}>;

export type Status = "pending" | "paid" | "rejected" | "unknown";

export type Operation = {
  id: string;
  agent_id: number;
  agent_name: string;
  created_at: string; // UTC
  payee: string;
  payee_inn: string;
  amount_kopecks: number;
  currency: string;
  status: Status;
  reason: string | null;
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
export const addAgent = (name: string) => call<Agent>("POST", `${client}/agents`, { name });
export const changeAgent = (id: number, change: AgentChange) => call<Agent>("PATCH", `${client}/agents/${id}`, change);
/** Creates or replaces the agent's key. The key comes only in this answer. */
export const newAgentKey = (id: number) => call<{ key: string; hint: string }>("POST", `${client}/agents/${id}/key`);

export const getOperations = () => call<Operation[]>("GET", `${client}/operations?limit=100`);
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
