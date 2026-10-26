import { useCallback, useEffect, useRef, useState } from "react";
import { Agent, getAgents, getOperations, Operation, rub } from "./api";
import { I18n, initialLang, Lang, LANGUAGES, saveLang } from "./i18n";
import AgentScreen from "./screens/Agent";
import Agents from "./screens/Agents";
import History from "./screens/History";
import Settings from "./screens/Settings";
import { applyTheme, initialTheme, Theme } from "./theme";

type Tab = "agents" | "history" | "settings";
const TABS: Tab[] = ["agents", "history", "settings"];

const REFRESH_MS = 3000; // payments made by agents through MCP show up on their own
const TOAST_MS = 5000;

export default function App() {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [tab, setTab] = useState<Tab>("agents");
  const [agentId, setAgentId] = useState<number | null>(null); // the open agent, inside the Agents tab
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [operations, setOperations] = useState<Operation[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [toastId, setToastId] = useState<string | null>(null); // the newest agent payment, shown with its current status
  const seen = useRef<Set<string> | null>(null); // operation ids already shown; null until the first load
  const t = LANGUAGES[lang];

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = t.dir;
    saveLang(lang);
  }, [lang, t.dir]);

  useEffect(() => applyTheme(theme), [theme]);

  const refresh = useCallback(async () => {
    try {
      const [a, ops] = await Promise.all([getAgents(), getOperations()]);
      setAgents(a);
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
  const updateAgent = (changed: Agent) =>
    setAgents((list) => (list ? (list.some((a) => a.id === changed.id) ? list.map((a) => (a.id === changed.id ? changed : a)) : [...list, changed]) : list));

  const toast = toastId ? operations?.find((o) => o.id === toastId) : undefined;
  const openAgent = agentId !== null ? agents?.find((a) => a.id === agentId) : undefined;

  function openTab(next: Tab) {
    setTab(next);
    setAgentId(null);
  }

  const screen =
    !agents || !operations ? (
      <div className="loading">{offline ? t.unreachable : t.loading}</div>
    ) : tab === "history" ? (
      <History agents={agents} operations={operations} onChanged={refresh} />
    ) : tab === "settings" ? (
      <Settings lang={lang} onLang={setLang} theme={theme} onTheme={setTheme} />
    ) : openAgent ? (
      <AgentScreen
        agent={openAgent}
        operations={operations.filter((o) => o.agent_id === openAgent.id)}
        onAgent={updateAgent}
        onBack={() => setAgentId(null)}
        onChanged={refresh}
      />
    ) : (
      <Agents agents={agents} onOpen={setAgentId} onCreated={(a) => { updateAgent(a); setAgentId(a.id); }} />
    );

  return (
    <I18n.Provider value={t}>
      <div className="stage">
        <div className="phone">
          <header className="appbar">
            <span className="logo" aria-hidden>
              S
            </span>
            <span className="brand">Syngraph</span>
          </header>

          {offline && agents && <div className="banner">{t.reconnecting}</div>}

          <main className="screen" key={`${tab}-${agentId ?? ""}` /* each screen opens at the top */}>
            {screen}
          </main>

          {toast && (
            <button type="button" className="toast" onClick={() => { openTab("history"); setToastId(null); }}>
              <b>{t.toast[toast.status]}</b>
              <span>
                {toast.agent_name} → {toast.payee} · {rub(toast.amount_kopecks)}
              </span>
            </button>
          )}

          <nav className="tabbar">
            {TABS.map((id) => (
              <button
                key={id}
                type="button"
                className={tab === id ? "active" : undefined}
                aria-current={tab === id ? "page" : undefined}
                onClick={() => openTab(id)}
              >
                {t.tabs[id]}
              </button>
            ))}
          </nav>
        </div>
      </div>
    </I18n.Provider>
  );
}
