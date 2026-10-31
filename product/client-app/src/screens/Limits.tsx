import { Check } from "lucide-react";
import { ReactNode, useEffect, useRef, useState } from "react";
import { Agent, AgentChange, Approval, CATEGORIES, Category, CategoryMode, changeAgent, Period, Weekday, WEEKDAYS } from "../api";
import { serverText, useT } from "../i18n";

export const PERIODS: Period[] = ["payment", "day", "week", "month"];

/** 50000000 kopecks -> "500 000"; kopecks shown only when there are any; no limit -> "". */
function rublesField(kopecks: number | null): string {
  if (kopecks === null) return "";
  const whole = Math.floor(kopecks / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return kopecks % 100 ? `${whole}.${String(kopecks % 100).padStart(2, "0")}` : whole;
}

/** "500 000,5" -> "500000.5": what the core accepts. */
export const normalize = (typed: string) => typed.replace(/\s/g, "").replace(",", ".");

/** Digits, spaces and one "," or "." with up to two kopeck digits: no letters. */
const isRubles = (typed: string) => /^[\d\s]*([.,]\d{0,2})?$/.test(typed);

export type Draft = {
  anyTime: boolean;
  anyAmount: boolean;
  limits: Record<Period, string>; // rubles as typed
  days: Weekday[];
  from: string;
  to: string;
  approval: Approval;
  categoryMode: CategoryMode;
  allowed: Category[]; // used with "only"
  blocked: Category[]; // used with "except"
};

type Field = Exclude<keyof Draft, "limits">;
// Each field of the draft and its name in the core's API.
const FIELDS: Record<Field, keyof AgentChange> = {
  anyTime: "any_time",
  anyAmount: "any_amount",
  days: "working_days",
  from: "working_from",
  to: "working_to",
  approval: "approval",
  categoryMode: "category_mode",
  allowed: "allowed_categories",
  blocked: "blocked_categories",
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

type Edits = Partial<Omit<Draft, "limits">> & { limits: Partial<Record<Period, string>> };

function draftOf(a: Agent): Draft {
  return {
    limits: {
      payment: rublesField(a.limits.payment),
      day: rublesField(a.limits.day),
      week: rublesField(a.limits.week),
      month: rublesField(a.limits.month),
    },
    anyTime: a.any_time,
    anyAmount: a.any_amount,
    days: a.working_days,
    from: a.working_from,
    to: a.working_to,
    approval: a.approval,
    categoryMode: a.category_mode,
    allowed: a.allowed_categories,
    blocked: a.blocked_categories,
  };
}

/** What differs from `saved`, as the core's API wants it; every field when there is nothing saved yet. */
export function changeOf(draft: Draft, saved?: Draft): AgentChange {
  const change: Record<string, unknown> = {};
  for (const period of PERIODS) {
    const typed = normalize(draft.limits[period]);
    if (!saved || typed !== normalize(saved.limits[period])) change[`max_${period}`] = typed;
  }
  for (const field of Object.keys(FIELDS) as Field[]) {
    if (!saved || !same(draft[field], saved[field])) change[FIELDS[field]] = draft[field];
  }
  return change as AgentChange;
}

/** Only what differs from `base`: polling then updates untouched fields without overwriting the person's edits. */
function editsOf(next: Draft, base: Draft): Edits {
  const edits: Edits = { limits: {} };
  for (const period of PERIODS) if (next.limits[period] !== base.limits[period]) edits.limits[period] = next.limits[period];
  for (const field of Object.keys(FIELDS) as Field[]) {
    if (!same(next[field], base[field])) (edits as Record<string, unknown>)[field] = next[field];
  }
  return edits;
}

type Props = { agent: Agent; onAgent: (a: Agent) => void; payees: ReactNode };

/** The agent's rules, saved as soon as a field is left or a switch is flipped: no save button. */
export default function Limits({ agent, onAgent, payees }: Props) {
  const t = useT();
  const saved = draftOf(agent);
  const [edits, setEdits] = useState<Edits>({ limits: {} });
  const draft: Draft = { ...saved, ...edits, limits: { ...saved.limits, ...edits.limits } };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(""); // the core's message; translated when shown
  const [asked, setAsked] = useState(0); // save requests; one in flight at a time
  const handled = useRef(0);
  const change = changeOf(draft, saved);
  const dirty = Object.keys(change).length > 0;

  function edit(next: Draft) {
    setEdits(editsOf(next, saved));
    setError("");
  }

  const commit = () => setAsked((n) => n + 1);

  useEffect(() => {
    if (busy || asked === handled.current) return;
    handled.current = asked;
    if (!dirty) return;
    const sent = draft;
    setBusy(true);
    changeAgent(agent.id, change)
      .then((updated) => {
        onAgent(updated);
        // keep only what was changed after this save went out
        setEdits((current) => editsOf({ ...sent, ...current, limits: { ...sent.limits, ...current.limits } }, sent));
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setBusy(false));
  }, [asked, busy]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <LimitFields draft={draft} onEdit={edit} onCommit={commit} busy={false} agent={agent} payees={payees} />
      {error && <div className="error">{serverText(t, error)}</div>}
    </>
  );
}

type FieldsProps = {
  draft: Draft;
  onEdit: (next: Draft) => void;
  onCommit?: () => void; // a field was left, a switch flipped: time to save
  busy: boolean;
  agent?: Agent; // for saved approval rules
  payees: ReactNode; // whom the agent may pay, after the categories
};

/** The agent's rules as fields: approval, limits, hours, categories, payees. Used here and for a new agent. */
export function LimitFields({ draft, onEdit, onCommit, busy, agent, payees }: FieldsProps) {
  const t = useT();
  const list = draft.categoryMode === "except" ? "blocked" : "allowed";
  const [approvalNotice, setApprovalNotice] = useState<{ mode: Approval } | null>(null);
  const previousApproval = useRef(agent?.approval);

  // Existing agents announce the saved mode; the creation form announces its draft.
  useEffect(() => {
    if (previousApproval.current !== undefined && agent && previousApproval.current !== agent.approval) {
      setApprovalNotice({ mode: agent.approval });
    }
    previousApproval.current = agent?.approval;
  }, [agent?.approval]);

  useEffect(() => {
    if (!approvalNotice) return;
    const timer = window.setTimeout(() => setApprovalNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [approvalNotice]);

  function selectApproval(mode: Approval) {
    if (draft.approval === mode) return;
    setApprovalNotice(agent ? null : { mode });
    set({ ...draft, approval: mode });
  }

  /** A click changes the rules at once, unlike typing. */
  function set(next: Draft) {
    onEdit(next);
    onCommit?.();
  }

  function toggleDay(day: Weekday) {
    const days = draft.days.includes(day) ? draft.days.filter((d) => d !== day) : [...draft.days, day];
    set({ ...draft, days: WEEKDAYS.filter((d) => days.includes(d)) });
  }

  function toggleCategory(category: Category) {
    const chosen = draft[list].includes(category) ? draft[list].filter((c) => c !== category) : [...draft[list], category];
    set({ ...draft, [list]: CATEGORIES.filter((c) => chosen.includes(c)) });
  }

  const leaveOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => e.key === "Enter" && e.currentTarget.blur();

  return (
    <>
      <section className="card">
        <Switch label={t.limitAmounts} checked={!draft.anyAmount} disabled={busy} onChange={(on) => set({ ...draft, anyAmount: !on })} />
        {!draft.anyAmount && (
          <div className="rule-gap">
            {PERIODS.map((period) => {
              return (
                <label className="field" key={period}>
                  <span className="field-label">
                    {t.limit[period]}
                  </span>
                  <span className="money-input">
                    <input
                      inputMode="decimal"
                      dir="ltr"
                      value={draft.limits[period]}
                      placeholder={period === "payment" ? undefined : "—"}
                      disabled={busy}
                      onChange={(e) => isRubles(e.target.value) && onEdit({ ...draft, limits: { ...draft.limits, [period]: e.target.value } })}
                      onBlur={onCommit}
                      onKeyDown={leaveOnEnter}
                      aria-label={t.inRubles(t.limit[period])}
                    />
                    <span aria-hidden>₽</span>
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </section>

      <section className="card">
        <Switch label={t.limitHours} checked={!draft.anyTime} disabled={busy} onChange={(on) => set({ ...draft, anyTime: !on })} />
        {!draft.anyTime && (
          <>
            <div className="days rule-gap" role="group" aria-label={t.workingHours}>
              {WEEKDAYS.map((d) => (
                <button key={d} type="button" disabled={busy} aria-pressed={draft.days.includes(d)} aria-label={t.days[d]} title={t.days[d]} onClick={() => toggleDay(d)}>
                  {t.dayLetters[d]}
                </button>
              ))}
            </div>
            <div className="hours">
              <label>
                {t.from}
                <input type="time" disabled={busy} value={draft.from} onChange={(e) => onEdit({ ...draft, from: e.target.value })} onBlur={onCommit} onKeyDown={leaveOnEnter} />
              </label>
              <label>
                {t.to}
                <input type="time" disabled={busy} value={draft.to} onChange={(e) => onEdit({ ...draft, to: e.target.value })} onBlur={onCommit} onKeyDown={leaveOnEnter} />
              </label>
            </div>
          </>
        )}
      </section>

      <section className="card">
        <Switch
          label={t.limitCategories}
          checked={draft.categoryMode !== "any"}
          disabled={busy}
          onChange={(on) => set({ ...draft, categoryMode: on ? "only" : "any" })}
        />
        {draft.categoryMode !== "any" && (
          <>
            <div className="segmented segmented-compact rule-gap" role="group" aria-label={t.categories}>
              {(["only", "except"] as const).map((mode) => (
                <button key={mode} type="button" disabled={busy} aria-pressed={draft.categoryMode === mode} onClick={() => set({ ...draft, categoryMode: mode })}>
                  {t.categoryMode[mode]}
                </button>
              ))}
            </div>
            <div className="check-list" role="group" aria-label={t.categoryMode[draft.categoryMode]}>
              {CATEGORIES.map((c) => (
                <button key={c} type="button" disabled={busy} aria-pressed={draft[list].includes(c)} onClick={() => toggleCategory(c)}>
                  {t.categoryNames[c]}
                  <span className="check" aria-hidden>
                    <Check size={14} strokeWidth={2.5} />
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      {payees}
      <section className="card">
        <Switch label={t.approval} checked={draft.approval === "manual"} disabled={busy} onChange={(on) => selectApproval(on ? "manual" : "auto")} />
      </section>
      {approvalNotice && <div className="toast approval-toast" role="status">{t.approvalHint[approvalNotice.mode]}</div>}
    </>
  );
}

type SwitchProps = { label: string; checked: boolean; disabled?: boolean; onChange: (on: boolean) => void };

/** An on/off row: the label, and a switch at the end. */
export function Switch({ label, checked, disabled, onChange }: SwitchProps) {
  return (
    <label className="switch-row">
      <span>{label}</span>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}
