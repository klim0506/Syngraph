import { FormEvent, useEffect, useRef, useState } from "react";
import {
  addCounterparty,
  Agent,
  ApiError,
  changeAgent,
  Counterparty,
  findByInn,
  getCounterparties,
  ListedCounterparty,
  removeCounterparty,
} from "../api";
import { serverText, useT } from "../i18n";

const FULL_INN = /^(\d{10}|\d{12})$/;
const MAX_SUGGESTIONS = 6;

// What the directory says about a fully typed INN: "known" puts it into the list to choose from,
// "unknown" (not there, or not a valid INN) asks for the name of a new payee.
type Lookup = "idle" | "searching" | "known" | "unknown";

type Props = { agent: Agent; onAgent: (a: Agent) => void };

/** Whom this agent may pay. */
export default function Counterparties({ agent, onAgent }: Props) {
  const t = useT();
  const [counterparties, setCounterparties] = useState<ListedCounterparty[] | null>(null);
  const [inn, setInn] = useState("");
  const [picked, setPicked] = useState<Counterparty | null>(null); // chosen from the list
  const [directory, setDirectory] = useState<Counterparty | null>(null); // the directory's answer for a full INN
  const [lookup, setLookup] = useState<Lookup>("idle");
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(""); // the core's message; translated when shown
  const lookupVersion = useRef(0); // ignores answers after the person changes or picks an INN

  async function reload() {
    setCounterparties(await getCounterparties(agent.id));
  }

  useEffect(() => {
    reload().catch((e) => setError(e.message));
  }, [agent.id]);

  function reset() {
    setInn("");
    setPicked(null);
    setDirectory(null);
    setLookup("idle");
    setName("");
    lookupVersion.current += 1;
  }

  function type(value: string) {
    setInn(value);
    setPicked(null);
    setDirectory(null);
    setName("");
    setError("");
    setOpen(true);
    const version = ++lookupVersion.current;
    if (!FULL_INN.test(value.trim())) {
      setLookup("idle");
      return;
    }
    setLookup("searching");
    findByInn(value.trim()).then(
      (found) => {
        if (lookupVersion.current !== version) return;
        setDirectory(found);
        setLookup(found ? "known" : "unknown");
      },
      (err: Error) => {
        if (lookupVersion.current !== version) return;
        if (err instanceof ApiError && err.status === 400) {
          setLookup("unknown"); // invalid INNs are explained only when Add is pressed
          return;
        }
        // A failed lookup is not proof that the directory has no such payee.
        setLookup("idle");
        setError(err.message);
      },
    );
  }

  function pick(c: Counterparty) {
    setPicked(c);
    setInn(c.inn);
    lookupVersion.current += 1;
    setOpen(false);
  }

  async function act(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    act(async () => {
      await addCounterparty(agent.id, picked?.inn ?? inn.trim(), picked ? picked.name : name.trim());
      reset();
      await reload();
    });
  };

  const all = counterparties ?? [];
  const allowed = all.filter((c) => c.allowed);
  const q = inn.trim().toLowerCase();
  // the agent's known payees first, then the directory's match for a full INN
  const options: (Counterparty & { allowed?: boolean })[] =
    q && !picked ? all.filter((c) => c.inn.startsWith(q) || c.name.toLowerCase().includes(q)).slice(0, MAX_SUGGESTIONS) : [];
  if (!picked && directory && !options.some((o) => o.inn === directory.inn)) options.push(directory);
  const isNew = !picked && lookup === "unknown";
  const canAdd = picked !== null || (isNew && name.trim() !== "");

  return (
    <>
      <div className="segmented segmented-flush" role="group" aria-label={t.payees}>
        <button type="button" disabled={busy} aria-pressed={agent.any_counterparty} onClick={() => act(async () => onAgent(await changeAgent(agent.id, { any_counterparty: true })))}>
          {t.anyone}
        </button>
        <button type="button" disabled={busy} aria-pressed={!agent.any_counterparty} onClick={() => act(async () => onAgent(await changeAgent(agent.id, { any_counterparty: false })))}>
          {t.onlyList}
        </button>
      </div>

      {error && <div className="error" role="alert">{serverText(t, error)}</div>}

      {!agent.any_counterparty && ( // with "Anyone" the list is not checked, so it is not shown
        <>
          <form className="card add-form" onSubmit={submit}>
            <div className="combo">
              <label className="field-label" htmlFor="payee-inn">
                {t.inn}
              </label>
              <input
                id="payee-inn"
                value={inn}
                disabled={busy}
                onChange={(e) => type(e.target.value)}
                onFocus={() => setOpen(true)}
                onBlur={() => setOpen(false)}
                onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
                placeholder={t.innExample}
                role="combobox"
                aria-expanded={open && options.length > 0}
                autoComplete="off"
                inputMode="numeric"
              />
              {open && options.length > 0 && (
                <ul className="drop" role="listbox">
                  {options.map((c) => (
                    <li
                      key={c.inn}
                      role="option"
                      aria-disabled={c.allowed}
                      aria-selected={false}
                      className={c.allowed ? "off" : undefined}
                      onMouseDown={(e) => {
                        e.preventDefault(); // keep the focus, or blur closes the list before the click
                        if (!busy && !c.allowed) pick(c);
                      }}
                    >
                      <span>{c.name}</span>
                      <small>{c.allowed ? t.inList : c.inn}</small>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {picked && <div className="picked">{picked.name}</div>}
            {isNew && (
              <>
                <label className="field-label" htmlFor="payee-name">
                  {t.nameLabel}
                </label>
                <input id="payee-name" disabled={busy} value={name} onChange={(e) => setName(e.target.value)} placeholder={t.newPayeeName} maxLength={160} autoFocus />
              </>
            )}
            <button className="btn-primary" type="submit" disabled={busy || !canAdd}>
              {t.addPayee}
            </button>
          </form>

          <section className="card list">
            {counterparties === null ? (
              <div className="empty">{t.loading}</div>
            ) : allowed.length === 0 ? (
              <div className="empty">{t.listEmpty}</div>
            ) : (
              <ul>
                {allowed.map((c) => (
                  <li key={c.inn}>
                    <span>
                      <span className="op-payee">{c.name}</span>
                      <span className="muted num">{c.inn}</span>
                    </span>
                    <button
                      type="button"
                      className="remove"
                      disabled={busy}
                      onClick={() => act(async () => { await removeCounterparty(agent.id, c.inn); await reload(); })}
                      aria-label={t.removeName(c.name)}
                      title={t.remove}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}
