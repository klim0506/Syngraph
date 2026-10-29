import { UserRound } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Agent, getAgents, getOperations, Operation, rub } from "./api";
import { I18n, initialLang, Lang, LANGUAGES, saveLang } from "./i18n";
import AgentScreen, { Section } from "./screens/Agent";
import Agents from "./screens/Agents";
import NewAgent from "./screens/NewAgent";
import Settings from "./screens/Settings";
import { applyTheme, initialTheme, Theme } from "./theme";

type View = "agents" | "settings"; // settings open from the profile button

const REFRESH_MS = 3000; // payments made by agents through MCP show up on their own
const TOAST_MS = 5000;

export default function App() {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [view, setView] = useState<View>("agents");
  const [agentId, setAgentId] = useState<number | null>(null); // the open agent
  const [section, setSection] = useState<Section | undefined>(); // what the open agent shows first
  const [creating, setCreating] = useState(false); // creating a new agent
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [operations, setOperations] = useState<Operation[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [toastId, setToastId] = useState<string | null>(null); // the newest agent payment, shown with its current status
  const seen = useRef<Set<string> | null>(null); // operation ids already shown; null until the first load
  const refreshing = useRef(false);
  const refreshAgain = useRef(false);
  const agentRevision = useRef(0);
  const t = LANGUAGES[lang];

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = t.dir;
    saveLang(lang);
  }, [lang, t.dir]);

  useEffect(() => applyTheme(theme), [theme]);

  const refresh = useCallback(async () => {
    if (refreshing.current) {
      refreshAgain.current = true;
      return;
    }
    refreshing.current = true;
    try {
      do {
        refreshAgain.current = false;
        const revision = agentRevision.current;
        try {
          const [agentsResult, operationsResult] = await Promise.allSettled([getAgents(), getOperations()]);
          if (agentsResult.status === "rejected") throw agentsResult.reason;
          if (operationsResult.status === "rejected") throw operationsResult.reason;
          const a = agentsResult.value;
          const ops = operationsResult.value;
          // A mutation may have finished after this snapshot was requested.
          if (revision === agentRevision.current) setAgents(a);
          setOperations(ops);
          setOffline(false);
          if (seen.current) {
            const fresh = ops.find((o) => !seen.current!.has(o.id)); // newest first
            if (fresh) setToastId(fresh.id);
          }
          seen.current = new Set(ops.map((o) => o.id));
        } catch {
          setOffline(true);
        }
      } while (refreshAgain.current);
    } finally {
      refreshing.current = false;
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!toastId) return;
    const timer = setTimeout(() => setToastId(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toastId]);

  /** Puts a changed agent into the list at once, without waiting for the next refresh. */
  const updateAgent = (changed: Agent) => {
    agentRevision.current += 1;
    setAgents((list) => (list ? (list.some((a) => a.id === changed.id) ? list.map((a) => (a.id === changed.id ? changed : a)) : [...list, changed]) : list));
  };

  /** Takes a deleted agent off the list and goes back to the list. */
  const removeAgent = (id: number) => {
    agentRevision.current += 1;
    setAgents((list) => list && list.filter((a) => a.id !== id));
    setAgentId(null);
    setCreating(false);
  };

  const toast = toastId ? operations?.find((o) => o.id === toastId) : undefined;
  const openAgent = agentId !== null ? agents?.find((a) => a.id === agentId) : undefined;

  function open(next: View, agent: number | null = null, first?: Section) {
    setView(next);
    setAgentId(agent);
    setSection(first);
    setCreating(false);
  }

  const screen =
    !agents || !operations ? (
      <div className="loading">{offline ? t.unreachable : t.loading}</div>
    ) : view === "settings" ? (
      <Settings lang={lang} onLang={setLang} theme={theme} onTheme={setTheme} />
    ) : creating ? (
      <NewAgent
        onCreated={updateAgent}
        onDone={(a) => { updateAgent(a); setCreating(false); setAgentId(a.id); }}
      />
    ) : openAgent ? (
      <AgentScreen
        agent={openAgent}
        section={section}
        operations={operations.filter((o) => o.agent_id === openAgent.id)}
        onAgent={updateAgent}
        onDeleted={() => removeAgent(openAgent.id)}
        onChanged={refresh}
      />
    ) : (
      <Agents agents={agents} operations={operations} onOpen={(id) => open("agents", id)} onNew={() => setCreating(true)} />
    );

  return (
    <I18n.Provider value={t}>
      <div className="stage">
        <div className={`phone${openAgent && view === "agents" && !creating ? " agent-open" : ""}`}>
          <header className="appbar">
            <button type="button" className="home" onClick={() => open("agents")} aria-label={t.tabs.agents}>
              <span className="logo" aria-hidden>
                S
              </span>
              <span className="brand">Syngraph</span>
            </button>
            <button
              type="button"
              className="profile"
              aria-pressed={view === "settings"}
              aria-label={t.tabs.settings}
              title={t.tabs.settings}
              onClick={() => open(view === "settings" ? "agents" : "settings")}
            >
              <UserRound size={18} strokeWidth={1.75} aria-hidden />
            </button>
          </header>

          {offline && agents && <div className="banner">{t.reconnecting}</div>}

          <main className={`screen${openAgent && view === "agents" && !creating ? " screen-agent" : ""}`} key={`${view}-${agentId ?? ""}-${section ?? ""}-${creating}` /* each screen opens at the top */}>
            {screen}
          </main>

          {toast && (
            <button type="button" className="toast" onClick={() => { open("agents", toast.agent_id, "history"); setToastId(null); }}>
              <b>{t.toast[toast.status]}</b>
              <span>
                {toast.agent_name} → {toast.payee} · {rub(toast.amount_kopecks)}
              </span>
            </button>
          )}
        </div>
      </div>
    </I18n.Provider>
  );
}
