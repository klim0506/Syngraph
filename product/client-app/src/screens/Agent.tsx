import { ArrowLeftRight, LineChart, SlidersHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Agent, changeAgent, Operation } from "../api";
import { serverText, useT } from "../i18n";
import { usePhoneBack, usePhoneNavigationBlock } from "../PhoneNavigation";
import { AgentKey, DeleteAgent } from "./AgentSettings";
import Counterparties from "./Counterparties";
import History from "./History";
import Limits from "./Limits";
import Statistics from "./Statistics";

export type Section = "statistics" | "limits" | "history";
const SECTIONS: Section[] = ["statistics", "limits", "history"];
const SECTION_ICONS = { statistics: LineChart, limits: SlidersHorizontal, history: ArrowLeftRight };

type Props = {
  agent: Agent;
  section?: Section;
  onSection: (section: Section) => void;
  operations: Operation[]; // this agent's only
  onAgent: (a: Agent) => void;
  onDeleted: () => void;
  onChanged: () => void;
};

export default function AgentScreen({ agent, section: current, onSection: setSection, operations, onAgent, onDeleted, onChanged }: Props) {
  const t = useT();
  const section = current ?? (agent.has_key ? "statistics" : "limits");
  const panel = useRef<HTMLDivElement>(null);
  const [focusedOperation, setFocusedOperation] = useState<Operation | null>(null);
  useEffect(() => { if (section !== "history") setFocusedOperation(null); }, [section, agent.id]);
  const [asking, setAsking] = useState(false); // confirming that payments stop or start
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const awaiting = operations.filter((o) => o.status === "awaiting").length; // payments the person has to decide on

  useEffect(() => { panel.current?.scrollTo(0, 0); }, [section]);

  function cancel() {
    setAsking(false);
    setError("");
  }

  usePhoneNavigationBlock(busy);
  usePhoneBack(asking, () => { if (!busy) cancel(); }, "modal");

  useEffect(() => {
    if (!asking) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && cancel();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [asking]);

  async function togglePause() {
    setBusy(true);
    setError("");
    try {
      onAgent(await changeAgent(agent.id, { paused: !agent.paused }));
      setAsking(false);
    } catch (e) {
      setError(serverText(t, (e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="agent-page">
      {asking && (
        <div className="overlay" onClick={cancel}>
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="pay-ask" onClick={(e) => e.stopPropagation()}>
            <b id="pay-ask">{agent.paused ? t.resumeAsk : t.stopAsk}</b>
            <p className="muted">{agent.paused ? t.resumeHint : t.stopHint}</p>
            {error && <div className="error">{error}</div>}
            <div className="dialog-actions">
              <button type="button" className={agent.paused ? "btn-primary" : "btn-danger"} disabled={busy} onClick={togglePause} autoFocus>
                {agent.paused ? t.start : t.stop}
              </button>
              <button type="button" className="btn-secondary" disabled={busy} onClick={cancel}>
                {t.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

      <div ref={panel} className="agent-panel" id="agent-panel" role="tabpanel" aria-labelledby={`agent-tab-${section}`}>
        {section === "statistics" && <Statistics key={agent.id} agentId={agent.id} operations={operations} onOperation={(operation) => { setFocusedOperation(operation); setSection("history"); }} />}
        {section === "history" && <History operations={operations} onChanged={onChanged} focusedOperation={focusedOperation?.agent_id === agent.id ? focusedOperation : null} />}
        {section === "limits" && (
          <>
            <AgentKey agent={agent} onChanged={onChanged} />
            <Limits agent={agent} onAgent={onAgent} payees={<Counterparties agent={agent} onAgent={onAgent} />} />
            <section className="card agent-payment-control">
              <label className="switch-row">
                <span>{t.payments}</span>
                <input type="checkbox" role="switch" className={`pay-switch ${agent.paused ? "off" : "on"}`} checked={!agent.paused} disabled={busy || asking} title={agent.paused ? t.stopped : t.payments} onChange={() => setAsking(true)} />
              </label>
            </section>
            <DeleteAgent agent={agent} onDeleted={onDeleted} />
          </>
        )}
      </div>

      <nav className="agent-tabs" role="tablist" aria-label={t.stats.navigation} onKeyDown={(event) => {
        let next = SECTIONS.indexOf(section);
        if (event.key === "ArrowRight") next += t.dir === "rtl" ? -1 : 1;
        else if (event.key === "ArrowLeft") next += t.dir === "rtl" ? 1 : -1;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = SECTIONS.length - 1;
        else return;
        event.preventDefault();
        next = (next + SECTIONS.length) % SECTIONS.length;
        setSection(SECTIONS[next]);
        event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]")[next]?.focus();
      }}>
        {SECTIONS.map((s) => (
          <button key={s} id={`agent-tab-${s}`} type="button" role="tab" aria-selected={section === s} aria-controls="agent-panel" tabIndex={section === s ? 0 : -1} onClick={() => setSection(s)}>
            {(() => { const Icon = SECTION_ICONS[s]; return <Icon size={19} strokeWidth={1.75} aria-hidden />; })()}
            <span>{t.sections[s]}</span>
            {s === "history" && awaiting > 0 && <span className="tab-count">{awaiting > 99 ? "99+" : awaiting}</span>}
          </button>
        ))}
      </nav>
    </div>
  );
}
