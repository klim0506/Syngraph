import { Plus, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Agent, AgentChange, changeAgent, newAgentKey } from "../api";
import { serverText, useT } from "../i18n";
import { AgentGlyph, ICONS } from "../icons";

type Props = { agent: Agent; onAgent: (a: Agent) => void; onChanged: () => void };

/** The agent's settings in one card: key, name, icon. */
export default function AgentSettings({ agent, onAgent, onChanged }: Props) {
  const t = useT();
  const [name, setName] = useState(agent.name);
  const [key, setKey] = useState<string | null>(null); // a fresh key, shown until the person closes it
  const [copied, setCopied] = useState(false);
  const [picking, setPicking] = useState(false); // the icon choice is open
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(""); // the core's message; translated when shown

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const save = (change: AgentChange) => run(async () => onAgent(await changeAgent(agent.id, change)));

  function rename() {
    const trimmed = name.trim();
    if (!trimmed) setName(agent.name);
    else if (trimmed !== agent.name) save({ name: trimmed });
  }

  const createKey = () =>
    run(async () => {
      setKey((await newAgentKey(agent.id)).key);
      setCopied(false);
      onChanged();
    });

  async function copy() {
    try {
      await navigator.clipboard.writeText(key ?? "");
      setCopied(true);
    } catch {
      // no clipboard access: the key stays on screen to copy by hand
    }
  }

  return (
    <section className="card settings-card">
      <div className="srow">
        <span className="srow-name">{t.keyLabel}</span>
        <span className="mono muted srow-value" dir="ltr">
          {!agent.key_hint ? "—" : agent.key_hint.includes("…") ? agent.key_hint : `…${agent.key_hint}`}
        </span>
        <button
          type="button"
          className={agent.has_key ? "btn-round" : "btn-round primary"}
          disabled={busy}
          onClick={createKey}
          aria-label={agent.has_key ? t.replaceKey : t.create}
          title={agent.has_key ? `${t.replaceKey}. ${t.replaceWarn}` : t.create}
        >
          {agent.has_key ? <RefreshCw size={16} strokeWidth={1.75} aria-hidden /> : <Plus size={16} strokeWidth={2} aria-hidden />}
        </button>
      </div>
      {key && (
        <div className="fresh-key">
          <div className="key-value mono" tabIndex={0} onFocus={(e) => window.getSelection()?.selectAllChildren(e.currentTarget)}>
            {key}
          </div>
          <p className="muted">
            {t.keyOnce} {t.keyNote}
          </p>
          <div className="key-actions">
            <button type="button" className="btn-primary" onClick={copy}>
              {copied ? t.copied : t.copy}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setKey(null)}>
              {t.done}
            </button>
          </div>
        </div>
      )}

      <label className="srow">
        <span className="srow-name">{t.agentName}</span>
        <input
          className="srow-input"
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          onBlur={rename}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), e.currentTarget.blur())}
        />
      </label>

      <div className="srow srow-wrap">
        <span className="srow-name">{t.icon}</span>
        <button
          type="button"
          className="icon-current"
          aria-expanded={picking}
          aria-label={`${t.icon}: ${t.iconNames[agent.icon]}`}
          title={t.iconNames[agent.icon]}
          onClick={() => setPicking(!picking)}
        >
          <AgentGlyph icon={agent.icon} size={20} />
        </button>
        {picking && (
          <div className="icon-row" role="radiogroup" aria-label={t.icon}>
            {ICONS.map((icon) => (
              <button
                key={icon}
                type="button"
                role="radio"
                aria-checked={agent.icon === icon}
                aria-label={t.iconNames[icon]}
                title={t.iconNames[icon]}
                disabled={busy}
                onClick={() => {
                  setPicking(false);
                  if (agent.icon !== icon) save({ icon });
                }}
              >
                <AgentGlyph icon={icon} size={20} />
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <div className="error">{serverText(t, error)}</div>}
    </section>
  );
}
