import { FormEvent, useState } from "react";
import { addAgent, Agent, rub } from "../api";
import { serverText, useT } from "../i18n";
import { AgentBadge } from "../icons";
import { stateOf } from "./Agent";

type Props = {
  agents: Agent[];
  onOpen: (id: number) => void;
  onCreated: (agent: Agent) => void;
};

/** The client's agents: each opens its own settings. */
export default function Agents({ agents, onOpen, onCreated }: Props) {
  const t = useT();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onCreated(await addAgent(name.trim()));
      setName("");
      setAdding(false);
    } catch (err) {
      setError(serverText(t, (err as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="title-row">
        <h1>{t.tabs.agents}</h1>
        <button type="button" className="btn-plus" aria-label={t.newAgent} title={t.newAgent} aria-expanded={adding} onClick={() => setAdding(!adding)}>
          +
        </button>
      </div>

      {adding && (
        <form className="card new-agent" onSubmit={create}>
          <input id="new-agent" aria-label={t.newAgent} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t.newAgentPlaceholder} maxLength={80} />
          <div className="key-actions">
            <button type="submit" className="btn-primary" disabled={busy || !name.trim()}>
              {t.create}
            </button>
            <button type="button" className="btn-secondary" onClick={() => { setAdding(false); setName(""); setError(""); }}>
              {t.cancel}
            </button>
          </div>
          {error && <div className="error">{error}</div>}
        </form>
      )}

      <ul className="agents">
        {agents.map((a) => {
          const state = stateOf(a);
          return (
            <li key={a.id}>
              <button type="button" onClick={() => onOpen(a.id)}>
                <span className="agent-head">
                  <AgentBadge icon={a.icon} />
                  <span>
                    <span className="agent-title">{a.name}</span>
                    <span className="muted mono">{t.spentToday(rub(a.spent.day), rub(a.limits.day))}</span>
                  </span>
                </span>
                <span className={`dot-state ${a.has_key ? `state-${state}` : ""}`}>{a.has_key ? t.state[state] : t.noKey}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
