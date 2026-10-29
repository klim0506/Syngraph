import { FormEvent, useState } from "react";
import { addAgent, Agent, AgentIcon, Counterparty, findByInn, newAgentKey } from "../api";
import { serverText, useT } from "../i18n";
import { AgentGlyph, ICONS } from "../icons";
import { FreshKey } from "./AgentSettings";
import { PayeeList } from "./Counterparties";
import { changeOf, Draft, LimitFields } from "./Limits";

type Step = 1 | 2 | 3;

// What a new agent starts with; the person changes it on the second step.
const START: Draft = {
  anyTime: true, // pays at any time until the person sets working hours
  anyAmount: false,
  limits: { payment: "100 000", day: "500 000", week: "", month: "" }, // empty: no limit
  days: ["mon", "tue", "wed", "thu", "fri"],
  from: "09:00",
  to: "19:00",
  approval: "auto",
  categoryMode: "any",
  allowed: [],
  blocked: [],
};

type Props = {
  onCreated: (agent: Agent) => void; // the agent exists, its key is on screen
  onDone: (agent: Agent) => void;
};

/** A new agent in three steps: name and icon, limits, key. */
export default function NewAgent({ onCreated, onDone }: Props) {
  const t = useT();
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<AgentIcon>("invoice");
  const [draft, setDraft] = useState<Draft>(START);
  const [payeesOnly, setPayeesOnly] = useState(false);
  const [payees, setPayees] = useState<Counterparty[]>([]); // kept here until the agent is created
  const [created, setCreated] = useState<{ agent: Agent; key: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function next(e: FormEvent) {
    e.preventDefault();
    if (name.trim()) setStep(2);
  }

  /** A payee for the list; the directory checks the INN and gives a known one its name. */
  async function addPayee(inn: string, typed: string) {
    const known = await findByInn(inn); // an invalid INN throws, and the list shows why
    setPayees((list) => [...list.filter((p) => p.inn !== inn), { inn, name: known?.name ?? typed }]);
  }

  async function create() {
    if (busy) return;
    setBusy(true);
    setError("");
    const settings = { ...changeOf(draft), icon, any_counterparty: !payeesOnly };
    try {
      const agent = await addAgent(name.trim(), settings, payeesOnly ? payees : []);
      // without a key the agent still exists: open it, the key is made in its settings
      const fresh = await newAgentKey(agent.id).catch(() => null);
      if (!fresh) return onDone(agent);
      const withKey = { ...agent, has_key: true, key_hint: fresh.hint };
      setCreated({ agent: withKey, key: fresh.key });
      onCreated(withKey);
      setStep(3);
    } catch (err) {
      setError(serverText(t, (err as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="steps" role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={step} aria-label={t.stepOf(step, 3)}>
        {[1, 2, 3].map((s) => (
          <span key={s} className={s <= step ? "on" : undefined} />
        ))}
      </div>

      {step === 1 && (
        <form onSubmit={next}>
          <h1>{t.newAgent}</h1>
          <section className="card">
            <label className="wizard-label" htmlFor="agent-name">
              {t.agentName}
            </label>
            <input id="agent-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t.newAgentPlaceholder} maxLength={80} />
            <span className="wizard-label">{t.icon}</span>
            <div className="icon-grid" role="radiogroup" aria-label={t.icon}>
              {ICONS.map((i) => (
                <button key={i} type="button" role="radio" aria-checked={icon === i} aria-label={t.iconNames[i]} title={t.iconNames[i]} onClick={() => setIcon(i)}>
                  <AgentGlyph icon={i} size={22} />
                </button>
              ))}
            </div>
          </section>
          <button type="submit" className="btn-primary wizard-next" disabled={!name.trim()}>
            {t.next}
          </button>
        </form>
      )}

      {step === 2 && (
        <>
          <h1>{t.sections.limits}</h1>
          <LimitFields
            draft={draft}
            onEdit={setDraft}
            busy={busy}
            payees={
              <PayeeList
                only={payeesOnly}
                onOnly={setPayeesOnly}
                payees={payees.map((p) => ({ ...p, allowed: true }))}
                onAdd={addPayee}
                onRemove={async (inn) => setPayees((list) => list.filter((p) => p.inn !== inn))}
              />
            }
          />
          {error && <div className="error">{error}</div>}
          <button type="button" className="btn-primary wizard-next" disabled={busy} onClick={create}>
            {t.createAgent}
          </button>
        </>
      )}

      {step === 3 && created && (
        <>
          <h1>{t.keyTitle}</h1>
          <section className="card">
            <FreshKey secret={created.key} next={t.done} onNext={() => onDone(created.agent)} />
          </section>
        </>
      )}
    </>
  );
}
