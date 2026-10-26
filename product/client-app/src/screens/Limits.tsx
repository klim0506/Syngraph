import { FormEvent, useState } from "react";
import { Agent, AgentChange, changeAgent, Period, rub, Weekday, WEEKDAYS } from "../api";
import { serverText, useT } from "../i18n";

const PERIODS: Period[] = ["payment", "day", "week", "month"];

/** 50000000 kopecks -> "500 000"; kopecks shown only when there are any. */
function rublesField(kopecks: number): string {
  const whole = Math.floor(kopecks / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return kopecks % 100 ? `${whole}.${String(kopecks % 100).padStart(2, "0")}` : whole;
}

/** "500 000,5" -> "500000.5": what the core accepts. */
const normalize = (typed: string) => typed.replace(/\s/g, "").replace(",", ".");

type Draft = {
  limits: Record<Period, string>; // rubles as typed
  days: Weekday[];
  from: string;
  to: string;
};

function draftOf(a: Agent): Draft {
  return {
    limits: {
      payment: rublesField(a.limits.payment),
      day: rublesField(a.limits.day),
      week: rublesField(a.limits.week),
      month: rublesField(a.limits.month),
    },
    days: a.working_days,
    from: a.working_from,
    to: a.working_to,
  };
}

/** Only what differs from the saved settings. */
function changeOf(draft: Draft, saved: Draft): AgentChange {
  const change: AgentChange = {};
  for (const period of PERIODS) {
    const typed = normalize(draft.limits[period]);
    if (typed !== normalize(saved.limits[period])) change[`max_${period}`] = typed;
  }
  if (draft.days.join() !== saved.days.join()) change.working_days = draft.days;
  if (draft.from !== saved.from) change.working_from = draft.from;
  if (draft.to !== saved.to) change.working_to = draft.to;
  return change;
}

type Props = { agent: Agent; onAgent: (a: Agent) => void };

/** The agent's limits and working hours. */
export default function Limits({ agent, onAgent }: Props) {
  const t = useT();
  const saved = draftOf(agent);
  const [draft, setDraft] = useState<Draft>(saved);
  const [busy, setBusy] = useState(false);
  // "saved", or the core's error to show in the current language
  const [message, setMessage] = useState<{ ok: true } | { ok: false; error: string } | null>(null);
  const change = changeOf(draft, saved);
  const dirty = Object.keys(change).length > 0;
  const messageText = message && (message.ok ? t.saved : serverText(t, message.error));

  function edit(next: Draft) {
    setDraft(next);
    setMessage(null);
  }

  function toggleDay(day: Weekday) {
    const days = draft.days.includes(day) ? draft.days.filter((d) => d !== day) : [...draft.days, day];
    edit({ ...draft, days: WEEKDAYS.filter((d) => days.includes(d)) });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const updated = await changeAgent(agent.id, change);
      onAgent(updated);
      setDraft(draftOf(updated));
      setMessage({ ok: true });
    } catch (err) {
      setMessage({ ok: false, error: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save}>
      <section className="card">
        {PERIODS.map((period) => {
          const spent = period === "payment" ? null : agent.spent[period];
          const share = spent === null ? 0 : Math.min(spent / agent.limits[period], 1);
          return (
            <label className="field" key={period}>
              <span className="field-label">
                {t.limit[period]}
                {spent !== null && <small className="mono">{t.spentNow(rub(spent))}</small>}
              </span>
              <span className="money-input">
                <input
                  inputMode="decimal"
                  dir="ltr"
                  value={draft.limits[period]}
                  onChange={(e) => edit({ ...draft, limits: { ...draft.limits, [period]: e.target.value } })}
                  aria-label={t.inRubles(t.limit[period])}
                />
                <span aria-hidden>₽</span>
              </span>
              {spent !== null && (
                <span className="field-meter" role="meter" aria-valuenow={spent} aria-valuemax={agent.limits[period]} aria-label={t.limit[period]}>
                  <span className={share >= 0.9 ? "meter-high" : undefined} style={{ width: `${share * 100}%` }} />
                </span>
              )}
            </label>
          );
        })}
      </section>

      <h2>{t.workingHours}</h2>
      <section className="card">
        <div className="days" role="group" aria-label={t.workingHours}>
          {WEEKDAYS.map((d) => (
            <button key={d} type="button" aria-pressed={draft.days.includes(d)} aria-label={t.days[d]} title={t.days[d]} onClick={() => toggleDay(d)}>
              {t.dayLetters[d]}
            </button>
          ))}
        </div>
        <div className="hours">
          <label>
            {t.from}
            <input type="time" value={draft.from} onChange={(e) => edit({ ...draft, from: e.target.value })} />
          </label>
          <label>
            {t.to}
            <input type="time" value={draft.to} onChange={(e) => edit({ ...draft, to: e.target.value })} />
          </label>
        </div>
      </section>

      {message && !dirty && <div className={message.ok ? "notice" : "error"}>{messageText}</div>}
      {dirty && ( // the bar shows up only when something was changed
        <div className="form-actions">
          {message && <div className="form-message error">{messageText}</div>}
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => edit(saved)}>
            {t.cancel}
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? t.saving : t.save}
          </button>
        </div>
      )}
    </form>
  );
}
