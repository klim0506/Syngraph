import { useState } from "react";
import { Agent, changeAgent, ltr, Operation, rub, Weekday, WEEKDAYS } from "../api";
import { Dict, serverText, useT } from "../i18n";
import AgentKey from "./AgentKey";
import Counterparties from "./Counterparties";
import Limits from "./Limits";
import OperationRow from "./OperationRow";

type Section = "overview" | "limits" | "payees" | "key";
const SECTIONS: Section[] = ["overview", "limits", "payees", "key"];
const RECENT = 4;

export type AgentState = "paused" | "active" | "offHours";
export const stateOf = (a: Agent): AgentState => (a.paused ? "paused" : a.working_now ? "active" : "offHours");

/** ["mon", "tue", "wed", "sat"] -> "Mon–Wed, Sat": runs of days become ranges. */
function daysLabel(days: Weekday[], t: Dict): string {
  const runs: Weekday[][] = [];
  for (const day of WEEKDAYS.filter((d) => days.includes(d))) {
    const last = runs[runs.length - 1];
    if (last && WEEKDAYS.indexOf(last[last.length - 1]) === WEEKDAYS.indexOf(day) - 1) last.push(day);
    else runs.push([day]);
  }
  return runs
    .map((run) => (run.length > 2 ? `${t.days[run[0]]}–${t.days[run[run.length - 1]]}` : run.map((d) => t.days[d]).join(", ")))
    .join(", ");
}

type Props = {
  agent: Agent;
  operations: Operation[]; // this agent's only
  onAgent: (a: Agent) => void;
  onBack: () => void;
  onChanged: () => void;
};

export default function AgentScreen({ agent, operations, onAgent, onBack, onChanged }: Props) {
  const t = useT();
  const [section, setSection] = useState<Section>(agent.has_key ? "overview" : "key");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const state = stateOf(agent);

  async function togglePause() {
    setBusy(true);
    setError("");
    try {
      onAgent(await changeAgent(agent.id, { paused: !agent.paused }));
    } catch (e) {
      setError(serverText(t, (e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="back" onClick={onBack}>
        <span className="back-arrow" aria-hidden>
          ←
        </span>{" "}
        {t.back}
      </button>

      <section className="agent">
        <div>
          <div className="agent-name">{agent.name}</div>
          <div className={`muted ${agent.has_key ? `state-${state}` : ""}`}>
            {!agent.has_key ? t.agentNoKey : state === "paused" ? t.agentPaused : state === "active" ? t.agentWorking : t.agentOffHours}
          </div>
        </div>
        <button type="button" className={agent.paused ? "btn-primary" : "btn-secondary"} disabled={busy} onClick={togglePause}>
          {agent.paused ? t.resume : t.pause}
        </button>
      </section>
      {error && <div className="error">{error}</div>}

      <div className="tabs-inline" role="tablist">
        {SECTIONS.map((s) => (
          <button key={s} type="button" role="tab" aria-selected={section === s} onClick={() => setSection(s)}>
            {t.sections[s]}
          </button>
        ))}
      </div>

      {section === "overview" && (
        <>
          <section className="card">
            <div className="card-title">{t.spent}</div>
            {[
              { label: t.today, spent: agent.spent.day, limit: agent.limits.day },
              { label: t.thisWeek, spent: agent.spent.week, limit: agent.limits.week },
              { label: t.thisMonth, spent: agent.spent.month, limit: agent.limits.month },
            ].map((b) => {
              const share = Math.min(b.spent / b.limit, 1);
              return (
                <div className="meter" key={b.label}>
                  <div className="meter-text">
                    <span>{b.label}</span>
                    <span>
                      <b>{rub(b.spent)}</b> <span className="muted">{t.of} {rub(b.limit)}</span>
                    </span>
                  </div>
                  <div className="meter-track" role="meter" aria-valuenow={b.spent} aria-valuemax={b.limit} aria-label={b.label}>
                    <div className={`meter-fill ${share >= 0.9 ? "meter-high" : ""}`} style={{ width: `${share * 100}%` }} />
                  </div>
                </div>
              );
            })}
            <div className="facts">
              <div>
                <span className="muted">{t.limit.payment}</span>
                <b>{t.upTo(rub(agent.limits.payment))}</b>
              </div>
              <div>
                <span className="muted">{t.workingHours}</span>
                <b>
                  {daysLabel(agent.working_days, t)} · {ltr(`${agent.working_from}–${agent.working_to}`)}
                </b>
              </div>
              <div>
                <span className="muted">{t.payees}</span>
                <b>{agent.any_counterparty ? t.anyone : t.onlyList}</b>
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card-title">{t.latest}</div>
            {operations.length === 0 ? (
              <div className="empty">{t.noPayments}</div>
            ) : (
              <ul className="ops">
                {operations.slice(0, RECENT).map((o) => (
                  <OperationRow key={o.id} operation={o} onChanged={onChanged} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
      {section === "limits" && <Limits agent={agent} onAgent={onAgent} />}
      {section === "payees" && <Counterparties agent={agent} onAgent={onAgent} />}
      {section === "key" && <AgentKey agent={agent} onChanged={onChanged} />}
    </>
  );
}
