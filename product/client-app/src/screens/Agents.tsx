import { Plus } from "lucide-react";
import { Agent, Operation, rub } from "../api";
import { Dict, useT } from "../i18n";
import { AgentBadge, EmptyIllustration } from "../icons";

type Props = {
  agents: Agent[];
  operations: Operation[];
  onOpen: (id: number) => void;
  onNew: () => void;
};

/** How long ago, short: "38 min", "2 d"; past 30 days, just "30+ d". */
function ago(iso: string, t: Dict): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return t.ago.now;
  if (minutes < 60) return t.ago.m(minutes);
  if (minutes < 60 * 24) return t.ago.h(Math.floor(minutes / 60));
  const days = Math.floor(minutes / (60 * 24));
  return days > 30 ? t.ago.long : t.ago.d(days);
}

/** The client's agents: each opens its own settings. */
export default function Agents({ agents, operations, onOpen, onNew }: Props) {
  const t = useT();

  return (
    <>
      <div className="title-row">
        <h1>{t.tabs.agents}</h1>
        {agents.length > 0 && (
          <button type="button" className="btn-plus" aria-label={t.newAgent} title={t.newAgent} onClick={onNew}>
            <Plus size={18} strokeWidth={2} aria-hidden />
          </button>
        )}
      </div>

      {agents.length === 0 && (
        <div className="agents-empty">
          <EmptyIllustration kind="agents" onAction={onNew} />
          <p className="muted">{t.noAgents}</p>
          <button type="button" className="btn-primary" onClick={onNew}>
            {t.connectAgent}
          </button>
        </div>
      )}

      <ul className="agents">
        {agents.map((a) => {
          const own = operations.filter((o) => o.agent_id === a.id); // newest first
          const awaiting = own.filter((o) => o.status === "awaiting").length;
          const limit = a.any_amount ? null : a.limits.day;
          const share = limit === null ? 0 : Math.min(a.spent.day / limit, 1);
          const status = a.paused ? t.stopped : t.payments;
          return (
            <li key={a.id}>
              <button type="button" className="agent-card" onClick={() => onOpen(a.id)}>
                <AgentBadge icon={a.icon} size={40} />
                <span className="agent-card-body">
                  <span className="agent-title">{a.name}</span>
                  {limit !== null && (
                    <span className="field-meter" role="meter" aria-valuenow={a.spent.day} aria-valuemax={limit} aria-label={t.limit.day}>
                      <span className={share >= 0.9 ? "meter-high" : undefined} style={{ width: `${share * 100}%` }} />
                    </span>
                  )}
                  <span className="agent-card-line muted num">
                    <span>{limit === null ? t.spentToday(rub(a.spent.day), null) : t.spentToday(rub(a.spent.day).replace(" ₽", ""), rub(limit))}</span>
                    {own[0] && <span title={t.lastPayment}>{ago(own[0].created_at, t)}</span>}
                  </span>
                  {awaiting > 0 && <span className="dot-state state-awaiting">{t.awaitingCount(awaiting)}</span>}
                </span>
                <span className={`agent-dot ${a.paused ? "off" : "on"}`} role="img" aria-label={status} title={status} />
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
