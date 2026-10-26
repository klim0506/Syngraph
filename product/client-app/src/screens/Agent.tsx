import { useState } from "react";
import { Agent, changeAgent, Operation, rub } from "../api";
import { serverText, useT } from "../i18n";
import { AgentBadge } from "../icons";
import AgentSettings from "./AgentSettings";
import Counterparties from "./Counterparties";
import Limits from "./Limits";
import OperationRow from "./OperationRow";

type Section = "overview" | "limits" | "payees" | "settings";
const SECTIONS: Section[] = ["overview", "limits", "payees", "settings"];
const RECENT = 4;

export type AgentState = "paused" | "active" | "offHours";
export const stateOf = (a: Agent): AgentState => (a.paused ? "paused" : a.working_now ? "active" : "offHours");

type Props = {
  agent: Agent;
  operations: Operation[]; // this agent's only
  onAgent: (a: Agent) => void;
  onBack: () => void;
  onChanged: () => void;
};

export default function AgentScreen({ agent, operations, onAgent, onBack, onChanged }: Props) {
  const t = useT();
  // an agent without a key opens on its settings, where the key is created
  const [section, setSection] = useState<Section>(agent.has_key ? "overview" : "settings");
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

      <section className="mandate">
        <div className="mandate-head">
          <div className="agent-head">
            <AgentBadge icon={agent.icon} size={40} />
            <span>
              <span className="agent-name">{agent.name}</span>
              <span className={`dot-state ${agent.has_key ? `state-${state}` : ""}`}>{agent.has_key ? t.state[state] : t.noKey}</span>
            </span>
          </div>
          <button type="button" className={agent.paused ? "btn-primary" : "btn-ghost"} disabled={busy} onClick={togglePause}>
            {agent.paused ? t.resume : t.pause}
          </button>
        </div>
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
                      <b>{rub(b.spent)}</b> <span className="muted">/ {rub(b.limit)}</span>
                    </span>
                  </div>
                  <div className="meter-track" role="meter" aria-valuenow={b.spent} aria-valuemax={b.limit} aria-label={b.label}>
                    <div className={`meter-fill ${share >= 0.9 ? "meter-high" : ""}`} style={{ width: `${share * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </section>

          {operations.length === 0 ? (
            <div className="empty">{t.noPayments}</div>
          ) : (
            <ul className="ops card">
              {operations.slice(0, RECENT).map((o) => (
                <OperationRow key={o.id} operation={o} onChanged={onChanged} />
              ))}
            </ul>
          )}
        </>
      )}
      {section === "limits" && <Limits agent={agent} onAgent={onAgent} />}
      {section === "payees" && <Counterparties agent={agent} onAgent={onAgent} />}
      {section === "settings" && <AgentSettings agent={agent} onAgent={onAgent} onChanged={onChanged} />}
    </>
  );
}
