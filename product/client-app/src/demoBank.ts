import { useSyncExternalStore } from "react";
import { CLIENT_ID } from "./api";

export const DEMO_BANKS = ["tbank", "alfa", "sber", "tochka"] as const;
export type DemoProvider = typeof DEMO_BANKS[number];
export type DemoBank = DemoProvider | "vtb";

const TEST_NUMBERS: Record<DemoProvider, readonly string[]> = {
  tbank: ["40702810000009010001", "40702810000009010002"],
  alfa: ["40702810000009020001", "40702810000009020002"],
  sber: ["40702810000009030001", "40702810000009030002"],
  tochka: ["40702810000009040001", "40702810000009040002"],
};

export const demoAccountNumbers = (bank: DemoProvider) => TEST_NUMBERS[bank];
const isDemoBank = (value: unknown): value is DemoBank => value === "vtb" || DEMO_BANKS.some((bank) => bank === value);

export type DemoAccount = { id: string; number: string; label: string };
export type DemoConnection = { id: string; bank: DemoBank; accounts: DemoAccount[] };
type DemoData = { connections: DemoConnection[]; assignments: Record<number, string> };
type Snapshot = DemoData & { unavailable: boolean };
export type DemoBankError = "badAccount" | "duplicateAccount" | "accountMissing" | "connectionChanged" | "storageError";

const STORAGE_KEY = "syngraph.demo-bank.v2." + CLIENT_ID;
const LEGACY_KEY = "syngraph.demo-bank.v1." + CLIENT_ID;
const EMPTY: Snapshot = { connections: [], assignments: {}, unavailable: false };
const UNAVAILABLE: Snapshot = { ...EMPTY, unavailable: true };
const NUMBER = /^\d{20}$/;
const ACCOUNT_ID = /^[0-9a-f]{32}$/;
const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cachedSnapshot = EMPTY;

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function availableAssignments(value: unknown, accountIds: Set<string>): Record<number, string> {
  const assignments: Record<number, string> = {};
  if (!record(value)) return assignments;
  for (const [agent, account] of Object.entries(value)) {
    const id = Number(agent);
    if (Number.isSafeInteger(id) && id > 0 && String(id) === agent && typeof account === "string" && accountIds.has(account)) {
      assignments[id] = account;
    }
  }
  return assignments;
}

function decode(raw: string): Snapshot {
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { return EMPTY; }
  if (!record(value)) return EMPTY;

  // Version 1 stored a single bank. Read its accounts and assignments with their original IDs.
  const stored = Array.isArray(value.connections) ? value.connections : [value];
  const connections: DemoConnection[] = [];
  const banks = new Set<DemoBank>();
  const ids = new Set<string>();
  for (const item of stored) {
    if (!record(item) || !isDemoBank(item.bank) || banks.has(item.bank) || !Array.isArray(item.accounts)) continue;
    const accounts: DemoAccount[] = [];
    const numbers = new Set<string>();
    for (const entry of item.accounts) {
      if (!record(entry) || typeof entry.id !== "string" || !ACCOUNT_ID.test(entry.id) || ids.has(entry.id) ||
          typeof entry.number !== "string" || !NUMBER.test(entry.number) || numbers.has(entry.number) ||
          typeof entry.label !== "string" || entry.label.length > 60) continue;
      accounts.push({ id: entry.id, number: entry.number, label: entry.label });
      ids.add(entry.id);
      numbers.add(entry.number);
    }
    const prefix = item.bank + "-";
    const id = typeof item.id === "string" && item.id.startsWith(prefix) && ACCOUNT_ID.test(item.id.slice(prefix.length))
      ? item.id : prefix + "legacy";
    connections.push({ id, bank: item.bank, accounts });
    banks.add(item.bank);
  }
  return { connections, assignments: availableAssignments(value.assignments, ids), unavailable: false };
}

function read(): Snapshot {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_KEY);
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
    if (event.key === STORAGE_KEY || event.key === LEGACY_KEY || event.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export const useDemoBank = () => useSyncExternalStore(subscribe, read);

async function write(change: (current: DemoData) => DemoData | DemoBankError): Promise<DemoBankError | null> {
  function update(): DemoBankError | null {
    const snapshot = read();
    if (snapshot.unavailable) return "storageError";
    const next = change(snapshot);
    if (typeof next === "string") return next;
    if (next === snapshot) return null;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ connections: next.connections, assignments: next.assignments }));
    listeners.forEach((listener) => listener());
    return null;
  }

  try {
    // Serialize the read and write when two tabs change the same demo setup.
    return navigator.locks ? await navigator.locks.request(STORAGE_KEY, update) : update();
  } catch { return "storageError"; }
}

function randomId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function changeBank(id: string, change: (bank: DemoConnection) => DemoConnection | null | DemoBankError) {
  return write((current) => {
    const bank = current.connections.find((item) => item.id === id);
    if (!bank) return "connectionChanged";
    const next = change(bank);
    if (typeof next === "string") return next;
    const connections = next ? current.connections.map((item) => item === bank ? next : item)
      : current.connections.filter((item) => item !== bank);
    const ids = new Set(connections.flatMap(({ accounts }) => accounts.map((account) => account.id)));
    return { connections, assignments: availableAssignments(current.assignments, ids) };
  });
}

/** Simulated consent only exposes the predefined test accounts for the chosen bank. */
export function connectDemoBank(bank: DemoProvider, numbers: readonly string[]) {
  return write((current) => {
    if (!numbers.length || numbers.some((number) => !demoAccountNumbers(bank).includes(number))) return "accountMissing";
    const existing = current.connections.find((connection) => connection.bank === bank);
    const accounts = existing?.accounts ?? [];
    const additions = [...new Set(numbers)]
      .filter((number) => !accounts.some((account) => account.number === number))
      .map((number) => ({ id: randomId(), number, label: "" }));
    if (!additions.length) return current;
    const connection = {
      id: existing?.id ?? (bank + "-" + randomId()),
      bank,
      accounts: [...accounts, ...additions],
    };
    const connections = existing ? current.connections.map((item) => item === existing ? connection : item)
      : [...current.connections, connection];
    return { ...current, connections };
  });
}

export function addDemoAccount(connectionId: string, number: string, label: string) {
  return changeBank(connectionId, (bank) => {
    const normalized = number.replace(/\s/g, "").replace(/[٠-٩۰-۹]/g, (digit) => String(digit.charCodeAt(0) & 15));
    if (!NUMBER.test(normalized)) return "badAccount";
    if (bank.accounts.some((account) => account.number === normalized)) return "duplicateAccount";
    const account = { id: randomId(), number: normalized, label: label.trim().slice(0, 60) };
    return { ...bank, accounts: [...bank.accounts, account] };
  });
}

export function removeDemoAccount(connectionId: string, accountId: string) {
  return changeBank(connectionId, (bank) => {
    if (!bank.accounts.some((account) => account.id === accountId)) return "accountMissing";
    return { ...bank, accounts: bank.accounts.filter((account) => account.id !== accountId) };
  });
}

export const disconnectDemoBank = (connectionId: string) => changeBank(connectionId, () => null);

export function setAgentDemoAccount(agentId: number, accountId: string) {
  return write((current) => {
    if (accountId && !current.connections.some((bank) => bank.accounts.some((account) => account.id === accountId))) {
      return "accountMissing";
    }
    if ((current.assignments[agentId] ?? "") === accountId) return current;
    const assignments = { ...current.assignments };
    if (accountId) assignments[agentId] = accountId;
    else delete assignments[agentId];
    return { ...current, assignments };
  });
}
