import { FormEvent, useEffect, useRef, useState } from "react";
import {
  addCounterparty,
  Agent,
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

// "found": the name comes from the directory or a suggestion and cannot be edited.
// "new": the directory does not know the INN, the person types the name.
type Lookup = "idle" | "searching" | "found" | "new";

type Props = { agent: Agent; onAgent: (a: Agent) => void };

/** Whom this agent may pay. */
export default function Counterparties({ agent, onAgent }: Props) {
  const t = useT();
  const [counterparties, setCounterparties] = useState<ListedCounterparty[] | null>(null);
  const [query, setQuery] = useState(""); // INN or part of a name
  const [found, setFound] = useState<Counterparty | null>(null);
  const [name, setName] = useState("");
  const [lookup, setLookup] = useState<Lookup>("idle");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(""); // the core's message; translated when shown
  const latestQuery = useRef(""); // ignores directory answers for a query the person has already changed

  async function reload() {
    setCounterparties(await getCounterparties(agent.id));
  }

  useEffect(() => {
    reload().catch((e) => setError(e.message));
  }, [agent.id]);

  function reset() {
    setQuery("");
    setFound(null);
    setName("");
    setLookup("idle");
    latestQuery.current = "";
  }

  function type(value: string) {
    setQuery(value);
    setFound(null);
    setName("");
    setError("");
    setOpen(true);
    latestQuery.current = value;
    if (!FULL_INN.test(value)) {
      setLookup("idle");
      return;
    }
    setLookup("searching");
    findByInn(value).then(
      (counterparty) => {
        if (latestQuery.current !== value) return;
        setFound(counterparty);
        setLookup(counterparty ? "found" : "new");
      },
      (e) => {
        if (latestQuery.current !== value) return;
        setLookup("idle");
        setError(e.message);
      },
    );
  }

  function pick(c: ListedCounterparty) {
    setQuery(c.inn);
    latestQuery.current = c.inn;
    setFound({ inn: c.inn, name: c.name });
    setLookup("found");
    setOpen(false);
  }

  async function act(action: () => Promise<unknown>) {
    setError("");
    try {
      await action();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    act(async () => {
      await addCounterparty(agent.id, found?.inn ?? query, found?.name ?? name.trim());
      reset();
      await reload();
    });
  };

  const all = counterparties ?? [];
  const allowed = all.filter((c) => c.allowed);
  const q = query.trim().toLowerCase();
  const suggestions =
    q && !found ? all.filter((c) => c.inn.startsWith(q) || c.name.toLowerCase().includes(q)).slice(0, MAX_SUGGESTIONS) : [];
  const inn = found?.inn ?? query;
  const alreadyListed = allowed.some((c) => c.inn === inn);
  const canAdd = !alreadyListed && (lookup === "found" || (lookup === "new" && name.trim() !== ""));
  const nameLabel = { idle: t.nameLabel, searching: t.nameSearching, found: t.nameFound, new: t.nameNew }[lookup];

  return (
    <>
      <div className="segmented" role="group" aria-label={t.payees}>
        <button type="button" aria-pressed={agent.any_counterparty} onClick={() => act(async () => onAgent(await changeAgent(agent.id, { any_counterparty: true })))}>
          {t.anyone}
        </button>
        <button type="button" aria-pressed={!agent.any_counterparty} onClick={() => act(async () => onAgent(await changeAgent(agent.id, { any_counterparty: false })))}>
          {t.onlyList}
        </button>
      </div>

      <form className="card add-form" onSubmit={submit}>
        <div className="combo">
          <label className="field-label" htmlFor="payee-query">
            {t.innOrName}
          </label>
          <input
            id="payee-query"
            value={query}
            onChange={(e) => type(e.target.value)}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
            placeholder={t.innExample}
            role="combobox"
            aria-expanded={open && suggestions.length > 0}
            autoComplete="off"
            inputMode="search"
          />
          {open && suggestions.length > 0 && (
            <ul className="drop" role="listbox">
              {suggestions.map((c) => (
                <li
                  key={c.inn}
                  role="option"
                  aria-disabled={c.allowed}
                  aria-selected={false}
                  className={c.allowed ? "off" : undefined}
                  onMouseDown={(e) => {
                    e.preventDefault(); // keep the focus, or blur closes the list before the click
                    if (!c.allowed) pick(c);
                  }}
                >
                  <span>{c.name}</span>
                  <small>{c.allowed ? t.inList : c.inn}</small>
                </li>
              ))}
            </ul>
          )}
        </div>
        <label className="field-label" htmlFor="payee-name">
          {nameLabel}
        </label>
        <input
          id="payee-name"
          value={found?.name ?? name}
          onChange={(e) => setName(e.target.value)}
          disabled={lookup !== "new"}
          placeholder={lookup === "new" ? t.namePlaceholderNew : t.namePlaceholderAuto}
          maxLength={160}
        />
        <button className="btn-primary" type="submit" disabled={!canAdd}>
          {t.addPayee}
        </button>
        {(error || (alreadyListed && lookup === "found")) && (
          <div className="error" role="alert">
            {error ? serverText(t, error) : t.alreadyListed}
          </div>
        )}
      </form>

      <section className={`card list ${agent.any_counterparty ? "inactive" : ""}`}>
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
                  <span className="muted mono">{c.inn}</span>
                </span>
                <button
                  type="button"
                  className="remove"
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
  );
}
