// Languages of the app. To add one: copy en.ts, translate it, and list it in LANGUAGES below.
import { createContext, useContext } from "react";
import { ltr, rub, Weekday } from "../api";
import { ar } from "./ar";
import { en, type Dict } from "./en";
import { fr } from "./fr";
import { ru } from "./ru";

export const LANGUAGES = { en, ru, fr, ar } satisfies Record<string, Dict>;
export type Lang = keyof typeof LANGUAGES;
export type { Dict };

const STORAGE_KEY = "syngraph.lang";

export const I18n = createContext<Dict>(en);
/** The current language's dictionary. */
export const useT = () => useContext(I18n);

/** The saved choice, else the browser's language, else English. */
export function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved in LANGUAGES) return saved as Lang;
  } catch {
    // storage may be blocked: fall back to the browser's language
  }
  const browser = navigator.language.slice(0, 2);
  return browser in LANGUAGES ? (browser as Lang) : "en";
}

export function saveLang(lang: Lang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // the choice just will not survive a reload
  }
}

/** "10000.00" (rubles from a core message) -> "10 000 ₽". */
const money = (rubles: string) => rub(Math.round(parseFloat(rubles) * 100));

/** The core speaks English; known messages are shown in the app's language, others as they came. */
export function serverText(t: Dict, text: string): string {
  const s = t.server;
  const rules: [RegExp, (...m: string[]) => string][] = [
    [/^the client has paused the agent$/, () => s.paused],
    [
      /^outside working hours: (.+) (\d\d:\d\d)-(\d\d:\d\d) (\S+)$/,
      (days, from, to, zone) =>
        s.outsideHours(days.split(", ").map((d) => t.days[d as Weekday] ?? d).join(", "), ltr(from), ltr(to), ltr(zone)),
    ],
    [/^counterparty with INN (\d+) is not allowed by the mandate$/, (inn) => s.notAllowed(ltr(inn))],
    [/^amount exceeds the limit of ([\d.]+) RUB per payment$/, (amount) => s.overPayment(money(amount))],
    [
      /^the (day|week|month) limit of ([\d.]+) RUB would be exceeded$/,
      (period, amount) => s.overPeriod(s.period[period as "day" | "week" | "month"], money(amount)),
    ],
    [/^the bank did not confirm the payment/, () => s.unconfirmed],
    [/^the bank has no such payment/, () => s.notReceived],
    [/^limits must grow/, () => s.limitsGrow],
    [/^working hours must start before/, () => s.hoursOrder],
    [/^amount must /, () => s.badAmount],
    [/^INN must be valid/, () => s.badInn],
    [/^payee name must/, () => s.badName],
    [/^agent name must/, () => s.badAgentName],
  ];
  for (const [pattern, render] of rules) {
    const match = text.match(pattern);
    if (match) return render(...match.slice(1));
  }
  return text;
}
