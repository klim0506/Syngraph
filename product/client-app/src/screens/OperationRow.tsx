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
          <span className={`dot-state state-${o.status}`}>{t.status[o.status]}</span>
        </span>
      </button>
      {open && (
        <div className="passport">
          <div className="passport-head">
            <div className="muted">
              {t.passport} · {o.id.slice(-8).toUpperCase()}
            </div>
            <div className="passport-title">
              <span>
                {rub(o.amount_kopecks)} → {o.payee}
              </span>
              <span className={`dot-state state-${o.status}`}>{t.status[o.status]}</span>
            </div>
          </div>
          <dl className="passport-rows">
            <dt>{t.agent}</dt>
            <dd>{o.agent_name}</dd>
            <dt>{t.inn}</dt>
            <dd className="num">{o.payee_inn}</dd>
            {reason && (
              <>
                <dt>{t.reason}</dt>
                <dd>{reason}</dd>
              </>
            )}
            <dt>{t.operation}</dt>
            <dd className="num">
              {when(o.created_at, t.locale)} · {o.id}
            </dd>
          </dl>
        </div>
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
