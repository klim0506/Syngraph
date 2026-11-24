import { Landmark } from "lucide-react";
import { FormEvent, useEffect, useId, useState } from "react";
import { ltr } from "../api";
import {
  addDemoAccount, connectDemoBank, demoAccountNumbers, DemoAccount, DemoBankError, DemoConnection, DEMO_BANKS,
  DemoProvider, disconnectDemoBank, removeDemoAccount, setAgentDemoAccount, useDemoBank,
} from "../demoBank";
import { useT } from "../i18n";
import { canNavigatePhone, usePhoneBack, usePhoneNavigationBlock } from "../PhoneNavigation";

const EXAMPLE_ACCOUNT = "40702810000000000001";
const formatAccount = (number: string) => number.replace(/^(\d{5})(\d{3})(\d)(\d{4})(\d{7})$/, "$1 $2 $3 $4 $5");

function BankConnectionWizard({ onClose }: { onClose: () => void }) {
  const t = useT();
  const b = t.bankConnection;
  const { connections } = useDemoBank();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [bank, setBank] = useState<DemoProvider | null>(null);
  const [numbers, setNumbers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<DemoBankError | null>(null);
  const radioName = useId();

  const catalog = bank ? demoAccountNumbers(bank) : [];
  const saved = connections.find((connection) => connection.bank === bank)?.accounts ?? [];
  const available = catalog.filter((number) => !saved.some((account) => account.number === number));
  const selected = numbers.filter((number) => available.includes(number));

  function back() {
    if (busy) return;
    setError(null);
    if (step === 3) setStep(2);
    else if (step === 2) setStep(1);
    else onClose();
  }

  usePhoneBack(true, back, "inline");
  usePhoneNavigationBlock(busy);

  function authorize() {
    if (!selected.length) setNumbers(available.slice(0, 1));
    setStep(3);
  }

  async function save() {
    if (!bank || !selected.length || busy) return;
    setBusy(true);
    const failed = await connectDemoBank(bank, selected);
    setBusy(false);
    if (failed) setError(failed);
    else onClose();
  }

  return (
    <div className="bank-wizard identity-form">
      <div className="steps" role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={step} aria-label={t.stepOf(step, 3)}>
        {[1, 2, 3].map((value) => <span key={value} className={value <= step ? "on" : undefined} />)}
      </div>

      {step === 1 && (
        <>
          <p className="muted">{b.demo}</p>
          <fieldset className="bank-options">
            <legend>{b.chooseBank}</legend>
            {DEMO_BANKS.map((id) => (
              <label className="bank-choice" key={id}>
                <input type="radio" name={radioName} checked={bank === id} onChange={() => { setBank(id); setNumbers([]); }} />
                {b.bankNames[id]}
              </label>
            ))}
          </fieldset>
          <button type="button" className="btn-primary" disabled={!bank} onClick={() => setStep(2)}>{t.next}</button>
        </>
      )}

      {step === 2 && bank && (
        <>
          <div className="bank-heading">
            <span className="badge bank-icon"><Landmark size={21} strokeWidth={1.75} aria-hidden /></span>
            <b>{b.bankNames[bank]}</b>
          </div>
          <b>{b.consentTitle}</b>
          <ul className="bank-access">
            <li>{b.accountAccess}</li>
            <li>{b.paymentAccess[bank]}</li>
          </ul>
          <p className="muted">{b.consentNote}</p>
          <button type="button" className="btn-primary" onClick={authorize}>{b.allowDemoAccess}</button>
        </>
      )}

      {step === 3 && (
        <>
          <p className="muted">{b.demo}</p>
          {available.length ? (
            <fieldset className="bank-options" disabled={busy}>
              <legend>{b.selectAccounts}</legend>
              {available.map((number) => (
                <label className="bank-choice" key={number}>
                  <input type="checkbox" checked={selected.includes(number)} onChange={(event) => {
                    const checked = event.currentTarget.checked;
                    setError(null);
                    setNumbers((current) => checked ? [...current, number] : current.filter((item) => item !== number));
                  }} />
                  <span className="bank-field">
                    <b>{b.testAccount(catalog.indexOf(number) + 1)}</b>
                    <bdi dir="ltr" className="muted num">{formatAccount(number)}</bdi>
                  </span>
                </label>
              ))}
            </fieldset>
          ) : <p className="muted" role="status">{b.noNewAccounts}</p>}
          {error && <p className="error" role="alert">{b[error]}</p>}
          {available.length ? (
            <button type="button" className="btn-primary" disabled={!selected.length || busy} onClick={save}>{b.importAccounts}</button>
          ) : <button type="button" className="btn-primary" disabled={busy} onClick={onClose}>{t.done}</button>}
        </>
      )}

      <button type="button" className="link bank-setup" disabled={busy} onClick={back}>
        {step === 1 ? t.cancel : t.phone.back}
      </button>
    </div>
  );
}

function AccountForm({ connectionId, onClose }: { connectionId: string; onClose: () => void }) {
  const t = useT();
  const b = t.bankConnection;
  const [number, setNumber] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<DemoBankError | null>(null);
  const errorId = useId();
  usePhoneNavigationBlock(busy);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    const failed = await addDemoAccount(connectionId, number, label);
    setBusy(false);
    if (failed) setError(failed);
    else onClose();
  }

  const invalidNumber = error === "badAccount" || error === "duplicateAccount";
  return (
    <form className="identity-form" onSubmit={submit}>
      <label className="bank-field">
        <span className="muted">{b.account}</span>
        <input dir="ltr" inputMode="numeric" autoComplete="off" placeholder={formatAccount(EXAMPLE_ACCOUNT)} maxLength={40}
          value={number} disabled={busy} aria-invalid={invalidNumber} aria-describedby={invalidNumber ? errorId : undefined}
          onChange={(event) => setNumber(event.target.value)} />
      </label>
      <label className="bank-field">
        <span className="muted">{b.accountLabel}</span>
        <input autoComplete="off" maxLength={60} value={label} disabled={busy} onChange={(event) => setLabel(event.target.value)} />
      </label>
      {error && <p className="error" id={errorId} role="alert">{b[error]}</p>}
      <div className="bank-actions">
        <button type="submit" className="btn-primary" disabled={busy}>{b.addAccount}</button>
        <button type="button" className="btn-secondary" disabled={busy} onClick={onClose}>{t.cancel}</button>
      </div>
    </form>
  );
}

function ConnectedBank({ connection }: { connection: DemoConnection }) {
  const t = useT();
  const b = t.bankConnection;
  const name = b.bankNames[connection.bank];
  const [panel, setPanel] = useState<"account" | "disconnect" | DemoAccount | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<DemoBankError | null>(null);
  const dismiss = () => { setPanel(null); setError(null); };
  usePhoneBack(panel !== null, dismiss, "inline");
  usePhoneNavigationBlock(busy);

  const removeTarget = typeof panel === "object" ? panel : null;
  async function confirmRemoval() {
    if (busy) return;
    setBusy(true);
    const failed = removeTarget ? await removeDemoAccount(connection.id, removeTarget.id)
      : await disconnectDemoBank(connection.id);
    setBusy(false);
    if (failed) setError(failed);
    else dismiss();
  }

  return (
    <section className="card identity-form" aria-label={name}>
      <div className="bank-heading">
        <span className="badge bank-icon"><Landmark size={21} strokeWidth={1.75} aria-hidden /></span>
        <div>
          <b>{name}</b>
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
                <button type="button" className="link" disabled={panel !== null}
                  aria-label={b.removeAccount + " · " + ltr(formatAccount(account.number))}
                  onClick={() => setPanel(account)}>{b.remove}</button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {panel === "account" && <AccountForm connectionId={connection.id} onClose={dismiss} />}
      {(panel === "disconnect" || removeTarget) && (
        <div className="identity-form bank-confirm" aria-live="polite">
          <b>{removeTarget ? b.removeAccount + " · " + ltr(formatAccount(removeTarget.number)) : b.disconnect}</b>
          <p className="muted">{removeTarget ? b.removeNote : b.disconnectNote}</p>
          <div className="bank-actions">
            <button type="button" className="btn-danger" disabled={busy} onClick={confirmRemoval}>
              {removeTarget ? b.remove : b.disconnect}
            </button>
            <button type="button" className="btn-secondary" disabled={busy} onClick={dismiss}>{t.cancel}</button>
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
    </section>
  );
}

export function DemoBankSettings() {
  const b = useT().bankConnection;
  const { connections, unavailable } = useDemoBank();
  const [setup, setSetup] = useState(false);
  return (
    <>
      <h2>{b.title}</h2>
      <section className="card identity-form" aria-label={b.title}>
        {setup ? <BankConnectionWizard onClose={() => setSetup(false)} />
          : unavailable ? <p className="error" role="alert">{b.storageError}</p>
          : <>
              <p className="muted">{b.demo}</p>
              <button type="button" className="btn-primary" onClick={() => { if (canNavigatePhone()) setSetup(true); }}>{b.connect}</button>
            </>}
      </section>
      {!setup && connections.map((connection) => <ConnectedBank key={connection.id} connection={connection} />)}
    </>
  );
}

type PickerProps =
  | { agentId: number }
  | { value: string; onChange: (id: string) => void; onSetupChange: (open: boolean) => void };

export function DemoAccountPicker(props: PickerProps) {
  const b = useT().bankConnection;
  const { connections, assignments, unavailable } = useDemoBank();
  const selected = "agentId" in props ? assignments[props.agentId] : props.value;
  const onDraftChange = "onChange" in props ? props.onChange : undefined;
  const accounts = connections.flatMap(({ bank, accounts: items }) => items.map((account) => ({ ...account, bank })));
  const selectedAccount = accounts.find((account) => account.id === selected);
  const value = selectedAccount?.id ?? "";
  const [setup, setSetup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<DemoBankError | null>(null);
  const pickerId = useId();
  const hintId = useId();
  const numberId = pickerId + "-number";
  usePhoneNavigationBlock(busy);

  useEffect(() => {
    if (!unavailable && selected && !value) onDraftChange?.("");
  }, [onDraftChange, selected, unavailable, value]);

  async function select(id: string) {
    setError(null);
    if ("agentId" in props) {
      setBusy(true);
      setError(await setAgentDemoAccount(props.agentId, id));
      setBusy(false);
    } else props.onChange(id);
  }

  function toggleSetup(open: boolean) {
    setSetup(open);
    if ("onSetupChange" in props) props.onSetupChange(open);
  }

  return (
    <section className="card identity-form" aria-label={b.agentAccount}>
      {accounts.length && !setup ? <b><label htmlFor={pickerId}>{b.agentAccount}</label></b> : <b>{b.agentAccount}</b>}
      <p id={hintId} className="muted">{b.agentNote}</p>
      {setup ? <BankConnectionWizard onClose={() => toggleSetup(false)} />
        : unavailable ? <p className="error" role="alert">{b.storageError}</p>
        : <>
            {accounts.length ? (
              <>
                <select className="select" id={pickerId} aria-describedby={selectedAccount ? hintId + " " + numberId : hintId}
                  value={value} disabled={busy} onChange={(event) => select(event.target.value)}>
                  <option value="">{b.noSelection}</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {b.bankNames[account.bank]} · {ltr("••••" + account.number.slice(-4))}{account.label ? " · " + account.label : ""}
                    </option>
                  ))}
                </select>
                {selectedAccount && <p className="muted num" id={numberId}><bdi dir="ltr">{formatAccount(selectedAccount.number)}</bdi></p>}
              </>
            ) : <p className="muted">{b.noSelection}</p>}
            <button type="button" className="link bank-setup" disabled={busy}
              onClick={() => { toggleSetup(true); setError(null); }}>{b.openSetup}</button>
          </>}
      {error && !unavailable && <p className="error" role="alert">{b[error]}</p>}
    </section>
  );
}
