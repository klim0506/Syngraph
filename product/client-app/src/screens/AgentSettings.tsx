import { useRef, useState } from "react";
import { Agent, deleteAgent, newAgentKey } from "../api";
import { serverText, useT } from "../i18n";
import { usePhoneBack, usePhoneNavigationBlock } from "../PhoneNavigation";

/** The key is the first card on Control, with the existing one-time copy flow. */
export function AgentKey({ agent, onChanged }: { agent: Agent; onChanged: () => void }) {
  const t = useT();
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const hint = agent.key_hint;
  usePhoneNavigationBlock(busy);
  const shownHint = !hint ? "—" : hint.includes("…")
    ? `${hint.replace(/^sgk_/, "").slice(0, 2)}…${hint.slice(-4)}`
    : `…${hint.slice(-4)}`;

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try { await action(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  const createKey = () =>
    run(async () => {
      setKey((await newAgentKey(agent.id)).key);
      onChanged();
    });

  return (
      <section className="card settings-card">
        {key ? (
          <div className="settings-key">
            <span>{t.keyTitle}</span>
            <FreshKey secret={key} next={t.done} onNext={() => setKey(null)} />
          </div>
        ) : (
          <div className="srow">
            <span className="srow-name">{t.keyLabel}</span>
            <span className="num srow-value" dir="ltr">
              {shownHint}
            </span>
            <button
              type="button"
              className="link"
              disabled={busy}
              onClick={createKey}
              aria-label={agent.has_key ? t.replaceKey : t.create}
              title={agent.has_key ? t.replaceWarn : undefined}
            >
              {agent.has_key ? t.replace : t.create}
            </button>
          </div>
        )}

        {error && <div className="error">{serverText(t, error)}</div>}
      </section>
  );
}

/** Deleting an agent stays at the end of Control and still requires confirmation. */
export function DeleteAgent({ agent, onDeleted }: { agent: Agent; onDeleted: () => void }) {
  const t = useT();
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  usePhoneNavigationBlock(busy);
  usePhoneBack(deleting, () => {
    if (!busy) { setDeleting(false); setError(""); }
  }, "inline");

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError("");
    try { await deleteAgent(agent.id); onDeleted(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <>
      {deleting ? (
        <section className="card">
          <p>{t.deleteAsk(agent.name)}</p>
          <p className="muted">{t.deleteNote}</p>
          <div className="key-actions">
            <button type="button" className="btn-secondary" disabled={busy} onClick={remove}>
              {t.deleteAgent}
            </button>
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => { setDeleting(false); setError(""); }}>
              {t.cancel}
            </button>
          </div>
          {error && <div className="error">{serverText(t, error)}</div>}
        </section>
      ) : (
        <button type="button" className="link delete-link" onClick={() => { setDeleting(true); setError(""); }}>
          {t.deleteAgent}
        </button>
      )}
    </>
  );
}

type KeyProps = { secret: string; next: string; onNext: () => void };

/** A new key, shown once: copy it, then the same button leads on. */
export function FreshKey({ secret, next, onNext }: KeyProps) {
  const t = useT();
  const [copied, setCopied] = useState<"no" | "yes" | "by hand">("no");
  const keyBox = useRef<HTMLDivElement>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied("yes");
    } catch {
      // no clipboard access: the key is selected to copy by hand
      if (keyBox.current) window.getSelection()?.selectAllChildren(keyBox.current);
      setCopied("by hand");
    }
  }

  return (
    <div className="fresh-key">
      <div ref={keyBox} className="key-value num" dir="ltr" tabIndex={0} onFocus={(e) => window.getSelection()?.selectAllChildren(e.currentTarget)}>
        {secret}
      </div>
      {copied === "yes" ? <div className="notice">{t.copied}</div> : <p className="muted">{t.keyOnce}</p>}
      <button type="button" className="btn-primary" onClick={copied === "no" ? copy : onNext}>
        {copied === "no" ? t.copy : next}
      </button>
    </div>
  );
}
