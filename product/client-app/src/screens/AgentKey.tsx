import { useState } from "react";
import { Agent, newAgentKey } from "../api";
import { serverText, useT } from "../i18n";

type Props = { agent: Agent; onChanged: () => void };

/** The agent's key: created here, shown once, then only its last characters. */
export default function AgentKey({ agent, onChanged }: Props) {
  const t = useT();
  const [key, setKey] = useState<string | null>(null); // the fresh key, until the person closes it
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    setBusy(true);
    setError("");
    try {
      setKey((await newAgentKey(agent.id)).key);
      setCopied(false);
      onChanged();
    } catch (e) {
      setError(serverText(t, (e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!key) return;
    try {
      await navigator.clipboard.writeText(key);
      setCopied(true);
    } catch {
      // no clipboard access: the key stays selected on screen to copy by hand
    }
  }

  return (
    <section className="card key">
      {(!agent.has_key || key) && <p className="muted">{t.keyNote}</p>}

      {key ? (
        <>
          <div className="key-value mono" onFocus={(e) => window.getSelection()?.selectAllChildren(e.currentTarget)} tabIndex={0}>
            {key}
          </div>
          <p className="notice">{t.keyOnce}</p>
          <div className="key-actions">
            <button type="button" className="btn-primary" onClick={copy}>
              {copied ? t.copied : t.copy}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setKey(null)}>
              {t.done}
            </button>
          </div>
        </>
      ) : (
        <>
          {agent.has_key && agent.key_hint && <div className="key-state">{t.keyCurrent(agent.key_hint)}</div>}
          <button
            type="button"
            className={agent.has_key ? "btn-secondary" : "btn-primary"}
            disabled={busy}
            onClick={create}
            title={agent.has_key ? t.replaceWarn : undefined}
          >
            {agent.has_key ? t.replaceKey : t.createKey}
          </button>
        </>
      )}
      {error && <div className="error">{error}</div>}
    </section>
  );
}
