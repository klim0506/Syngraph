import { useSyncExternalStore } from "react";
import { CLIENT_ID } from "./api";

export const DEMO_BANKS = ["tochka", "vtb", "sber"] as const;
export type DemoBank = typeof DEMO_BANKS[number];
export const isDemoBank = (value: unknown): value is DemoBank => DEMO_BANKS.some((bank) => bank === value);

export type DemoAccount = { id: string; number: string; label: string };
type Connection = { bank: DemoBank; accounts: DemoAccount[]; assignments: Record<number, string> };
type Snapshot = { connection: Connection | null; unavailable: boolean };
export type DemoBankError = "chooseBank" | "badAccount" | "duplicateAccount" | "accountMissing" | "connectionChanged" | "storageError";

const STORAGE_KEY = `syngraph.demo-bank.v1.${CLIENT_ID}`;
const EMPTY: Snapshot = { connection: null, unavailable: false };
const UNAVAILABLE: Snapshot = { connection: null, unavailable: true };
const NUMBER = /^\d{20}$/;
const ACCOUNT_ID = /^[0-9a-f]{32}$/;
const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cachedSnapshot = EMPTY;

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function decode(raw: string): Snapshot {
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { return EMPTY; }
  if (!record(value) || !isDemoBank(value.bank) || !Array.isArray(value.accounts)) return EMPTY;

  const accounts: DemoAccount[] = [];
  const ids = new Set<string>();
  const numbers = new Set<string>();
  for (const item of value.accounts) {
    if (!record(item) || typeof item.id !== "string" || item.id.length !== 32 || !ACCOUNT_ID.test(item.id) || ids.has(item.id) ||
        typeof item.number !== "string" || item.number.length !== 20 || !NUMBER.test(item.number) || numbers.has(item.number) ||
        typeof item.label !== "string" || item.label.length > 60) continue;
    accounts.push({ id: item.id, number: item.number, label: item.label });
    ids.add(item.id);
    numbers.add(item.number);
  }

  const assignments: Record<number, string> = {};
  if (record(value.assignments)) {
    for (const [agent, account] of Object.entries(value.assignments)) {
      const id = Number(agent);
      if (Number.isSafeInteger(id) && id > 0 && String(id) === agent && typeof account === "string" && ids.has(account)) assignments[id] = account;
    }
  }
  return { connection: { bank: value.bank, accounts, assignments }, unavailable: false };
}

function read(): Snapshot {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      cachedSnapshot = raw ? decode(raw) : EMPTY;
    }
    return cachedSnapshot;
  } catch { return UNAVAILABLE; }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export const useDemoBank = () => useSyncExternalStore(subscribe, read);

function write(change: (current: Connection | null) => Connection | null | DemoBankError): DemoBankError | null {
  const snapshot = read();
  if (snapshot.unavailable) return "storageError";
  const next = change(snapshot.connection);
  if (typeof next === "string") return next;
  if (next === snapshot.connection) return null;
  try {
    if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else localStorage.removeItem(STORAGE_KEY);
  } catch { return "storageError"; }
  listeners.forEach((listener) => listener());
  return null;
}

function accountFrom(number: string, label: string, existing: DemoAccount[]): DemoAccount | DemoBankError {
  const normalized = number.replace(/\s/g, "").replace(/[٠-٩۰-۹]/g, (digit) => String(digit.charCodeAt(0) & 15));
  if (!NUMBER.test(normalized)) return "badAccount";
  if (existing.some((account) => account.number === normalized)) return "duplicateAccount";
  const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return { id, number: normalized, label: label.trim().slice(0, 60) };
}

/** A demonstration connection: nothing here calls the bank or the core. */
export function connectDemoBank(bank: DemoBank, number: string, label: string) {
  return write((current) => {
    if (current) return "connectionChanged";
    if (!isDemoBank(bank)) return "chooseBank";
    const account = accountFrom(number, label, []);
    if (typeof account === "string") return account;
    return { bank, accounts: [account], assignments: {} };
  });
}

export function addDemoAccount(number: string, label: string) {
  return write((current) => {
    if (!current) return "connectionChanged";
    const account = accountFrom(number, label, current.accounts);
    return typeof account === "string" ? account : { ...current, accounts: [...current.accounts, account] };
  });
}

export function removeDemoAccount(id: string) {
  return write((current) => {
    if (!current?.accounts.some((account) => account.id === id)) return "accountMissing";
    const assignments = Object.fromEntries(Object.entries(current.assignments).filter(([, account]) => account !== id));
    return { ...current, accounts: current.accounts.filter((account) => account.id !== id), assignments };
  });
}

export const disconnectDemoBank = () => write(() => null);

export function setAgentDemoAccount(agentId: number, accountId: string) {
  return write((current) => {
    if (accountId && !current?.accounts.some((account) => account.id === accountId)) return "accountMissing";
    if (!current || (current.assignments[agentId] ?? "") === accountId) return current;
    const assignments = { ...current.assignments };
    if (accountId) assignments[agentId] = accountId;
    else delete assignments[agentId];
    return { ...current, assignments };
  });
}
