import { FormEvent, useState } from "react";
import { addAgent, Agent, rub } from "../api";
import { serverText, useT } from "../i18n";
import { stateOf } from "./Agent";

type Props = {
  agents: Agent[];
  onOpen: (id: number) => void;
  onCreated: (agent: Agent) => void;
};

/** The client's agents: each opens its own settings. */
export default function Agents({ agents, onOpen, onCreated }: Props) {
  const t = useT();
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
    } catch (err) {
      setError(serverText(t, (err as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>{t.agentsTitle}</h1>
      <p className="muted">{t.agentsNote}</p>

      <ul className="agents">
        {agents.map((a) => {
          const state = stateOf(a);
          return (
            <li key={a.id}>
              <button type="button" onClick={() => onOpen(a.id)}>
                <span className="agents-main">
                  <span className="agent-title">{a.name}</span>
                  <span className={`state ${a.has_key ? `state-${state}` : ""}`}>{a.has_key ? t.state[state] : t.noKey}</span>
                </span>
                <span className="muted">{t.spentToday(rub(a.spent.day), rub(a.limits.day))}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <form className="new-agent" onSubmit={create}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.newAgentPlaceholder} maxLength={80} />
        <button type="submit" className="btn-secondary" disabled={busy || !name.trim()}>
          {t.create}
        </button>
      </form>
      {error && <div className="error">{error}</div>}
    </>
  );
}
