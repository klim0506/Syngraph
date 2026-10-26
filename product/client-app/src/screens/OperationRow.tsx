import { useState } from "react";
import { checkOperation, Operation, rub, when } from "../api";
import { serverText, useT } from "../i18n";

type Props = {
  operation: Operation;
  showAgent?: boolean; // in the feed of all agents
  onChanged?: () => void; // after the bank was asked again
};

/** One agent payment: payee, amount, status; tap to see the details. */
export default function OperationRow({ operation: o, showAgent = false, onChanged }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const reason = o.reason && serverText(t, o.reason);

  async function check() {
    setChecking(true);
    setError("");
    try {
      await checkOperation(o.id);
      onChanged?.();
    } catch (e) {
      setError(serverText(t, (e as Error).message));
    } finally {
      setChecking(false);
    }
  }

  return (
    <li className={`op op-${o.status}`}>
      <button type="button" className="op-main" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="op-left">
          <span className="op-payee">{o.payee}</span>
          <span className="muted">
            {showAgent && `${o.agent_name} · `}
            {when(o.created_at, t.locale)}
          </span>
        </span>
        <span className="op-right">
          <span className="op-amount" dir="ltr">
            {rub(o.amount_kopecks)}
          </span>
          <span className={`status status-${o.status}`}>{t.status[o.status]}</span>
        </span>
      </button>
      {reason && !open && <div className="op-reason">{reason}</div>}
      {open && (
        <dl className="op-details">
          <dt>{t.agent}</dt>
          <dd>{o.agent_name}</dd>
          <dt>{t.inn}</dt>
          <dd>{o.payee_inn}</dd>
          <dt>{t.operation}</dt>
          <dd className="mono">{o.id}</dd>
          {reason && (
            <>
              <dt>{t.reason}</dt>
              <dd>{reason}</dd>
            </>
          )}
        </dl>
      )}
      {open && o.status === "unknown" && (
        <div className="op-actions">
          <button type="button" className="btn-secondary" disabled={checking} onClick={check}>
            {checking ? t.askingBank : t.checkBank}
          </button>
          {error && <div className="error">{error}</div>}
        </div>
      )}
    </li>
  );
}
