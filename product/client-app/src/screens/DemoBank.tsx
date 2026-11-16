import { Landmark } from "lucide-react";
import { FormEvent, useEffect, useId, useState } from "react";
import { ltr } from "../api";
import {
  addDemoAccount, connectDemoBank, DemoAccount, DemoBankError, DEMO_BANKS, disconnectDemoBank, isDemoBank,
  removeDemoAccount, setAgentDemoAccount, useDemoBank,
} from "../demoBank";
import { useT } from "../i18n";
import { usePhoneBack } from "../PhoneNavigation";

type FormMode = "connect" | "account";
const EXAMPLE_ACCOUNT = "40702810000000000001";
const formatAccount = (number: string) => number.replace(/^(\d{5})(\d{3})(\d)(\d{4})(\d{7})$/, "$1 $2 $3 $4 $5");

function BankForm({ mode, onSaved, onCancel }: { mode: FormMode; onSaved?: () => void; onCancel?: () => void }) {
  const t = useT();
  const b = t.bankConnection;
  const [bank, setBank] = useState("");
  const [number, setNumber] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<DemoBankError | "chooseBank" | null>(null);
  const errorId = useId();

  function fillExample() {
    const selectedBank = isDemoBank(bank) ? bank : DEMO_BANKS[0];
    setBank(selectedBank);
    setNumber(EXAMPLE_ACCOUNT);
    setError(null);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const failed = mode === "connect" ? (isDemoBank(bank) ? connectDemoBank(bank, number, label) : "chooseBank")
      : addDemoAccount(number, label);
    setError(failed);
    if (failed) return;
    onSaved?.();
  }

  const invalidNumber = error === "badAccount" || error === "duplicateAccount";
  return (
    <form className="identity-form" onSubmit={submit}>
      {mode === "connect" && (
        <label className="bank-field">
          <span className="muted">{b.bank}</span>
          <select className="select" value={bank} aria-invalid={error === "chooseBank"} aria-describedby={error === "chooseBank" ? errorId : undefined} onChange={(e) => setBank(e.target.value)}>
            <option value="">{b.chooseBank}</option>
            {DEMO_BANKS.map((id) => <option key={id} value={id}>{b.bankNames[id]}</option>)}
          </select>
        </label>
      )}
      <label className="bank-field">
        <span className="muted">{b.account}</span>
        <input dir="ltr" inputMode="numeric" autoComplete="off" placeholder={formatAccount(EXAMPLE_ACCOUNT)} maxLength={40} value={number} aria-invalid={invalidNumber} aria-describedby={invalidNumber ? errorId : undefined} onChange={(e) => setNumber(e.target.value)} />
      </label>
      <label className="bank-field">
        <span className="muted">{b.accountLabel}</span>
        <input autoComplete="off" maxLength={60} value={label} onChange={(e) => setLabel(e.target.value)} />
      </label>
      {error && <p className="error" id={errorId} role="alert">{b[error]}</p>}
      <div className="bank-actions">
        <button type="submit" className="btn-primary">{mode === "connect" ? b.connect : b.addAccount}</button>
        {onCancel && <button type="button" className="btn-secondary" onClick={onCancel}>{t.cancel}</button>}
        {mode === "connect" && <button type="button" className="link" onClick={fillExample}>{b.fillExample}</button>}
      </div>
    </form>
  );
}

type ConnectedBankProps = {
  connection: NonNullable<ReturnType<typeof useDemoBank>["connection"]>;
};

function ConnectedBank({ connection }: ConnectedBankProps) {
  const t = useT();
  const b = t.bankConnection;
  const [panel, setPanel] = useState<"account" | "disconnect" | DemoAccount | null>(null);
  const [error, setError] = useState<DemoBankError | null>(null);
  const dismiss = () => { setPanel(null); setError(null); };
  usePhoneBack(panel !== null, dismiss, "inline");

  const removeTarget = typeof panel === "object" ? panel : null;
  function confirmRemoval() {
    const failed = removeTarget ? removeDemoAccount(removeTarget.id) : disconnectDemoBank();
    if (failed) setError(failed);
    else dismiss();
  }

  return (
    <>
      <div className="bank-heading">
        <span className="badge bank-icon"><Landmark size={21} strokeWidth={1.75} aria-hidden /></span>
        <div>
          <b>{b.bankNames[connection.bank]}</b>
          <p className="notice" role="status">{b.connected}</p>
        </div>
      </div>
      <div className="bank-accounts">
        <b>{b.accounts}</b>
        {!connection.accounts.length ? <p className="muted">{b.noAccounts}</p> : (
          <ul>
            {connection.accounts.map((account) => (
              <li className="bank-row" key={account.id}>
                <div className="bank-field">
                  {account.label && <b>{account.label}</b>}
                  <bdi className="num" dir="ltr">{formatAccount(account.number)}</bdi>
                </div>
                <button type="button" className="link" disabled={panel !== null} aria-label={`${b.removeAccount} · ${ltr(formatAccount(account.number))}`} onClick={() => setPanel(account)}>{b.remove}</button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {panel === "account" && <BankForm mode="account" onSaved={dismiss} onCancel={dismiss} />}
      {(panel === "disconnect" || removeTarget) && (
        <div className="identity-form bank-confirm" aria-live="polite">
          <b>{removeTarget ? `${b.removeAccount} · ${ltr(formatAccount(removeTarget.number))}` : b.disconnect}</b>
          <p className="muted">{removeTarget ? b.removeNote : b.disconnectNote}</p>
          <div className="bank-actions">
            <button type="button" className="btn-danger" onClick={confirmRemoval}>{removeTarget ? b.remove : b.disconnect}</button>
            <button type="button" className="btn-secondary" onClick={dismiss}>{t.cancel}</button>
          </div>
        </div>
      )}
      {error && <p className="error" role="alert">{b[error]}</p>}
      {panel === null && (
        <div className="bank-actions">
          <button type="button" className="btn-primary" onClick={() => setPanel("account")}>{b.addAccount}</button>
          <button type="button" className="link" onClick={() => setPanel("disconnect")}>{b.disconnect}</button>
        </div>
      )}
    </>
  );
}

export function DemoBankSettings() {
  const b = useT().bankConnection;
  const { connection, unavailable } = useDemoBank();
  return (
    <>
      <h2>{b.title}</h2>
      <section className="card identity-form" aria-label={b.title}>
        <p className="muted">{b.demo}</p>
        {unavailable ? <p className="error" role="alert">{b.storageError}</p>
          : connection ? <ConnectedBank connection={connection} />
          : <BankForm mode="connect" />}
      </section>
    </>
  );
}

type PickerProps = { agentId: number } | { value: string; onChange: (id: string) => void };

export function DemoAccountPicker(props: PickerProps) {
  const t = useT();
  const b = t.bankConnection;
  const { connection, unavailable } = useDemoBank();
  const accounts = connection?.accounts ?? [];
  const selected = "agentId" in props ? connection?.assignments[props.agentId] : props.value;
  const onDraftChange = "onChange" in props ? props.onChange : undefined;
  const selectedAccount = accounts.find((account) => account.id === selected);
  const value = selectedAccount?.id ?? "";
  const [setup, setSetup] = useState(false);
  const [error, setError] = useState<DemoBankError | null>(null);
  const pickerId = useId();
  const hintId = useId();
  const numberId = `${pickerId}-number`;
  const setupId = useId();
  useEffect(() => {
    if (!unavailable && selected && !value) onDraftChange?.("");
  }, [onDraftChange, selected, unavailable, value]);
  useEffect(() => {
    if (accounts.length) setSetup(false);
  }, [accounts.length]);
  usePhoneBack(setup && !accounts.length && !unavailable, () => setSetup(false), "inline");

  function select(id: string) {
    if ("agentId" in props) setError(setAgentDemoAccount(props.agentId, id));
    else props.onChange(id);
  }

  return (
    <section className="card identity-form" aria-label={b.agentAccount}>
      {accounts.length ? <b><label htmlFor={pickerId}>{b.agentAccount}</label></b> : <b>{b.agentAccount}</b>}
      <p id={hintId} className="muted">{b.agentNote}</p>
      {unavailable ? <p className="error" role="alert">{b.storageError}</p>
        : accounts.length ? (
          <>
            <select className="select" id={pickerId} aria-describedby={selectedAccount ? `${hintId} ${numberId}` : hintId} value={value} onChange={(e) => select(e.target.value)}>
              <option value="">{b.noSelection}</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>{ltr(`••••${account.number.slice(-4)}`)}{account.label ? ` · ${account.label}` : ""}</option>
              ))}
            </select>
            {selectedAccount && <p className="muted num" id={numberId}><bdi dir="ltr">{formatAccount(selectedAccount.number)}</bdi></p>}
          </>
        ) : (
          <>
            {!setup && <p className="muted">{b.noSelection}</p>}
            <button type="button" className="link bank-setup" aria-expanded={setup} aria-controls={setup ? setupId : undefined} onClick={() => { setSetup(!setup); setError(null); }}>
              {connection ? b.addAccount : b.openSetup}
            </button>
            {setup && (
              <div id={setupId} className="identity-form">
                {!connection && <p className="muted">{b.demo}</p>}
                <BankForm key={connection ? "account" : "connect"} mode={connection ? "account" : "connect"} onSaved={() => setSetup(false)} onCancel={() => setSetup(false)} />
              </div>
            )}
          </>
        )}
      {error && !unavailable && <p className="error" role="alert">{b[error]}</p>}
    </section>
  );
}
