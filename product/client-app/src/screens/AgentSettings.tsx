import { FormEvent, useState } from "react";
import { Agent, AgentChange, AgentIcon, changeAgent } from "../api";
import { serverText, useT } from "../i18n";
import { AgentGlyph, ICONS } from "../icons";
import AgentKey from "./AgentKey";

type Props = { agent: Agent; onAgent: (a: Agent) => void; onChanged: () => void };

/** The agent's own settings: key, name and icon. */
export default function AgentSettings({ agent, onAgent, onChanged }: Props) {
  const t = useT();
  const [name, setName] = useState(agent.name);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(""); // the core's message; translated when shown

  async function save(change: AgentChange) {
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      onAgent(await changeAgent(agent.id, change));
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function rename(e: FormEvent) {
    e.preventDefault();
    save({ name: name.trim() });
  }

  return (
    <>
      <AgentKey agent={agent} onChanged={onChanged} />

      <form className="card new-agent" onSubmit={rename}>
        <label className="field-label" htmlFor="agent-name">
          {t.agentName}
        </label>
        <div className="inline-form">
          <input id="agent-name" value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} maxLength={80} />
          <button type="submit" className="btn-secondary" disabled={busy || !name.trim() || name.trim() === agent.name}>
            {t.rename}
          </button>
        </div>
      </form>

      <section className="card">
        <div className="card-title">{t.icon}</div>
        <div className="icons" role="radiogroup" aria-label={t.icon}>
          {ICONS.map((icon: AgentIcon) => (
            <button
              key={icon}
              type="button"
              role="radio"
              aria-checked={agent.icon === icon}
              disabled={busy}
              onClick={() => agent.icon !== icon && save({ icon })}
            >
              <AgentGlyph icon={icon} size={22} />
              <span>{t.iconNames[icon]}</span>
            </button>
          ))}
        </div>
      </section>

      {saved && <div className="notice">{t.agentSaved}</div>}
      {error && <div className="error">{serverText(t, error)}</div>}
    </>
  );
}
