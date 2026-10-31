import { useEffect, useRef, useState } from "react";
import { approveOperation, checkOperation, declineOperation, Operation, rub } from "../api";
import { serverText, useT } from "../i18n";

type Props = {
  operation: Operation;
  initiallyOpen?: boolean;
  onChanged?: () => void; // after the bank was asked again or the person decided
};

/** One agent payment: payee, amount, status; tap to see the details. */
export default function OperationRow({ operation: o, onChanged, initiallyOpen = false }: Props) {
  const t = useT();
  const [open, setOpen] = useState(initiallyOpen);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!initiallyOpen) return;
    const frame = requestAnimationFrame(() => {
      trigger.current?.focus({ preventScroll: true });
      trigger.current?.closest("li")?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [initiallyOpen]);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const reason = o.reason && serverText(t, o.reason);

  async function run(action: (id: string) => Promise<unknown>) {
    setChecking(true);
    setError("");
    try {
      await action(o.id);
      onChanged?.();
    } catch (e) {
      setError(serverText(t, (e as Error).message));
    } finally {
      setChecking(false);
    }
  }

  return (
    <li className={`op op-${o.status}`}>
      <button ref={trigger} type="button" className="op-main" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="op-left">
          <span className="op-payee">{o.payee}</span>
          <time className="muted" dateTime={o.created_at}>{new Date(o.created_at).toLocaleTimeString(t.locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}</time>
        </span>
        <span className="op-right">
          <span className="op-amount" dir="ltr">
            {rub(o.amount_kopecks)}
          </span>
          <span className={`dot-state state-${o.status}`}>{t.status[o.status]}</span>
        </span>
      </button>
      {open && (
        <div className="passport">
          <dl className="passport-rows">
            <dt>{t.agent}</dt>
            <dd>{o.agent_name}</dd>
            <dt>{t.inn}</dt>
            <dd className="num">{o.payee_inn}</dd>
            {o.category && (
              <>
                <dt>{t.category}</dt>
                <dd>{t.categoryNames[o.category] ?? o.category}</dd>
              </>
            )}
            {reason && (
              <>
                <dt>{t.reason}</dt>
                <dd>{reason}</dd>
              </>
            )}
          </dl>
          <details className="passport-id">
            <summary>ID</summary>
            <span className="num" dir="ltr">{o.id}</span>
          </details>
        </div>
      )}
      {o.status === "awaiting" && ( // the decision is the point: shown without opening the row
        <div className="op-actions">
          {reason && !open && <p className="muted">{reason}</p>}
          <div className="key-actions">
            <button type="button" className="btn-primary" disabled={checking} onClick={() => run(approveOperation)}>
              {t.approve}
            </button>
            <button type="button" className="btn-secondary" disabled={checking} onClick={() => run(declineOperation)}>
              {t.decline}
            </button>
          </div>
          {error && <div className="error">{error}</div>}
        </div>
      )}
      {open && o.status === "unknown" && (
        <div className="op-actions">
          <button type="button" className="btn-secondary" disabled={checking} onClick={() => run(checkOperation)}>
            {checking ? t.askingBank : t.checkBank}
          </button>
          {error && <div className="error">{error}</div>}
        </div>
      )}
    </li>
  );
}
