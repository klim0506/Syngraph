import { Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Operation, when } from "../api";
import { useT } from "../i18n";
import { EmptyIllustration } from "../icons";
import { usePhoneBack } from "../PhoneNavigation";
import OperationRow from "./OperationRow";

type Status = "all" | "awaiting" | "paid" | "rejected" | "unknown";
const STATUSES: Status[] = ["all", "awaiting", "paid", "rejected", "unknown"];
type Period = "all" | "today" | "week" | "month";
const PERIODS: Period[] = ["all", "today", "week", "month"];

/** Start of the period in the viewer's time zone; the week starts on Monday. */
function periodStart(period: Period): Date | null {
  if (period === "all") return null;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (period === "week") start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  if (period === "month") start.setDate(1);
  return start;
}

/** What the search looks through: payee, INN, the amount in whole rubles ("25000") and the date ("29.10.2026", "29 Oct"). */
function searchText(o: Operation, locale: string): string {
  const d = new Date(o.created_at);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const rubles = String(Math.floor(o.amount_kopecks / 100)); // kopecks are not searched
  return [o.payee, o.payee_inn, rubles, `${dd}.${mm}.${d.getFullYear()}`, when(o.created_at, locale)].join(" | ").toLowerCase();
}

type Props = {
  focusedOperation?: Operation | null;
  operations: Operation[]; // one agent's
  onChanged: () => void;
};

/** An agent's payments: a search over everything, the period and status behind the filter button. */
export default function History({ operations, onChanged, focusedOperation }: Props) {
  const t = useT();
  const [status, setStatus] = useState<Status>("all");
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState<Period>("all");
  const [open, setOpen] = useState(false); // the filter pop-up
  const box = useRef<HTMLDivElement>(null);

  usePhoneBack(open, () => setOpen(false), "popover");

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e.target instanceof Element && e.target.closest(".phone-navigation")) return;
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const since = periodStart(period);
  // every word must be found; "25 000" is one amount, and kopecks are dropped: "25000,50" and "25000.50" find 25 000
  const words = query
    .toLowerCase()
    .replace(/(\d)[\s\u2009](?=\d{3}\b)/g, "$1")
    .replace(/(\d),\d*/g, "$1")
    .replace(/(\d{3,})\.\d*/g, "$1") // "29.10" stays a date
    .split(/\s+/)
    .filter(Boolean);
  const available = focusedOperation && !operations.some((operation) => operation.id === focusedOperation.id)
    ? [focusedOperation, ...operations] : operations;
  const filtered = available.filter((o) => {
    if (since && new Date(o.created_at) < since) return false;
    const text = searchText(o, t.locale);
    return words.every((w) => text.includes(w));
  });
  const shown = status === "all" ? filtered : filtered.filter((o) => o.status === status);
  const days: { key: string; date: Date; operations: Operation[] }[] = [];
  for (const operation of [...shown].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))) {
    const date = new Date(operation.created_at);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const last = days[days.length - 1];
    if (last?.key === key) last.operations.push(operation);
    else days.push({ key, date, operations: [operation] });
  }
  const active = period !== "all" || status !== "all";

  return (
    <>
      <div className="filters" ref={box}>
        <label className="search">
          <Search size={16} strokeWidth={1.75} aria-hidden />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.search} aria-label={t.searchPayee} />
        </label>
        <button type="button" className={`filter-button ${active ? "on" : ""}`} aria-expanded={open} aria-label={t.filters} title={t.filters} onClick={() => setOpen(!open)}>
          <SlidersHorizontal size={18} strokeWidth={1.75} aria-hidden />
        </button>
        {open && (
          <div className="filter-pop" role="dialog" aria-label={t.filters}>
            <label className="filter-field">
              <span className="muted">{t.period}</span>
              <select className="select" value={period} onChange={(event) => setPeriod(event.target.value as Period)}>
                {PERIODS.map((p) => <option key={p} value={p}>{t.periods[p]}</option>)}
              </select>
            </label>
            <label className="filter-field">
              <span className="muted">{t.statusLabel}</span>
              <select className="select" value={status} onChange={(event) => setStatus(event.target.value as Status)}>
                {STATUSES.map((s) => {
                  const count = s === "all" ? filtered.length : filtered.filter((o) => o.status === s).length;
                  if ((s === "unknown" || s === "awaiting") && count === 0 && status !== s) return null;
                  return <option key={s} value={s}>{t.filter[s]} {count}</option>;
                })}
              </select>
            </label>
            {active && (
              <button type="button" className="link" onClick={() => { setPeriod("all"); setStatus("all"); }}>
                {t.resetFilters}
              </button>
            )}
          </div>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="history-empty" role="status">
          <EmptyIllustration kind="history" />
          <p className="muted">{operations.length === 0 ? t.nothingHere : t.noMatches}</p>
        </div>
      ) : (
        <div className="operation-days">
          {days.map((day) => <section className="operation-day" key={day.key} aria-labelledby={`operations-date-${day.key}`}>
            <h2 className="operation-date" id={`operations-date-${day.key}`}><time dateTime={day.key}>{day.date.toLocaleDateString(t.locale, { day: "numeric", month: "long", ...(day.date.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) })}</time></h2>
            <ul className="ops card">
              {day.operations.map((o) => <OperationRow key={o.id} operation={o} onChanged={onChanged} initiallyOpen={o.id === focusedOperation?.id} />)}
            </ul>
          </section>)}
        </div>
      )}
    </>
  );
}
