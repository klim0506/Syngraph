import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { Agent, Operation } from "../api";
import { useT } from "../i18n";
import OperationRow from "./OperationRow";

type Status = "all" | "paid" | "rejected" | "unknown";
const STATUSES: Status[] = ["all", "paid", "rejected", "unknown"];
type Period = "all" | "today" | "week" | "month";
const PERIODS: Period[] = ["today", "week", "month", "all"];

/** Start of the period in the viewer's time zone; the week starts on Monday. */
function periodStart(period: Period): Date | null {
  if (period === "all") return null;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (period === "week") start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  if (period === "month") start.setDate(1);
  return start;
}

type Props = {
  agents: Agent[];
  operations: Operation[];
  onChanged: () => void;
  agent?: Agent; // inside one agent: only its payments, no agent filter
};

/** History: payments of all the client's agents, or of one, with filters. */
export default function History({ agents, operations, onChanged, agent }: Props) {
  const t = useT();
  const [status, setStatus] = useState<Status>("all");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(""); // payee name or INN
  const [agentId, setAgentId] = useState<number | null>(null);
  const [period, setPeriod] = useState<Period>("all");

  const since = periodStart(period);
  const q = query.trim().toLowerCase();
  const filtered = operations.filter(
    (o) =>
      (agent ? o.agent_id === agent.id : agentId === null || o.agent_id === agentId) &&
      (!since || new Date(o.created_at) >= since) &&
      (!q || o.payee.toLowerCase().includes(q) || o.payee_inn.startsWith(q)),
  );
  const shown = status === "all" ? filtered : filtered.filter((o) => o.status === status);
  const active = Number(agentId !== null) + Number(period !== "all") + Number(q !== "");

  const filterButton = (
    <button type="button" className={`btn-icon ${active ? "on" : ""}`} aria-expanded={open} aria-label={t.filters} title={t.filters} onClick={() => setOpen(!open)}>
      <SlidersHorizontal size={18} strokeWidth={1.75} aria-hidden />
      {active > 0 && <span className="btn-icon-count">{active}</span>}
    </button>
  );

  function reset() {
    setQuery("");
    setAgentId(null);
    setPeriod("all");
  }

  return (
    <>
      {!agent && (
        <div className="title-row">
          <h1>{t.tabs.history}</h1>
          {filterButton}
        </div>
      )}

      {open && (
        <section className="card filters">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.searchPayee} aria-label={t.searchPayee} inputMode="search" />
          {!agent && (
            <select className="select" value={agentId ?? ""} onChange={(e) => setAgentId(e.target.value ? Number(e.target.value) : null)} aria-label={t.agent}>
              <option value="">{t.allAgents}</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
          <div className="chips chips-tight" role="group" aria-label={t.period}>
            {PERIODS.map((p) => (
              <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)}>
                {t.periods[p]}
              </button>
            ))}
          </div>
          {active > 0 && (
            <button type="button" className="link" onClick={reset}>
              {t.resetFilters}
            </button>
          )}
        </section>
      )}

      <div className="status-row">
        <div className="chips" role="group">
          {STATUSES.map((s) => {
            const count = s === "all" ? filtered.length : filtered.filter((o) => o.status === s).length;
            if (s === "unknown" && count === 0 && status !== s) return null;
            return (
              <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)}>
                {t.filter[s]} <span className="count">{count}</span>
              </button>
            );
          })}
        </div>
        {agent && filterButton}
      </div>
      {shown.length === 0 ? (
        <div className="empty">{t.nothingHere}</div>
      ) : (
        <ul className="ops card">
          {shown.map((o) => (
            <OperationRow key={o.id} operation={o} showAgent={!agent} onChanged={onChanged} />
          ))}
        </ul>
      )}
    </>
  );
}
