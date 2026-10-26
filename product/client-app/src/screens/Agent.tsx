import { useState } from "react";
import { Agent, changeAgent, Operation } from "../api";
import { serverText, useT } from "../i18n";
import { AgentBadge } from "../icons";
import AgentSettings from "./AgentSettings";
import Counterparties from "./Counterparties";
import History from "./History";
import Limits from "./Limits";

type Section = "limits" | "history" | "settings";
const SECTIONS: Section[] = ["limits", "history", "settings"];

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
  const [section, setSection] = useState<Section>(agent.has_key ? "limits" : "settings");
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

      {section === "history" && <History agents={[agent]} operations={operations} onChanged={onChanged} agent={agent} />}
      {section === "limits" && (
        <>
          <Limits agent={agent} onAgent={onAgent} />
          <h2>{t.payees}</h2>
          <Counterparties agent={agent} onAgent={onAgent} />
        </>
      )}
      {section === "settings" && <AgentSettings agent={agent} onAgent={onAgent} onChanged={onChanged} />}
    </>
  );
}
