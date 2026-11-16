import { Bell, UserRound } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Agent, ApiError, getAgents, getNotifications, getOperation, getOperations, Notification, NotificationList, Operation, readAllNotifications, readNotification, rub } from "./api";
import { I18n, initialLang, Lang, LANGUAGES, saveLang } from "./i18n";
import PhoneNavigation, { canNavigatePhone, dismissPhonePanel } from "./PhoneNavigation";
import AgentScreen, { Section } from "./screens/Agent";
import Agents from "./screens/Agents";
import NewAgent from "./screens/NewAgent";
import Notifications from "./screens/Notifications";
import Settings from "./screens/Settings";
import { applyTheme, initialTheme, Theme } from "./theme";

type View = "agents" | "settings" | "notifications";
type Route = { view: View; agentId: number | null; section?: Section; operationId?: string; creating: boolean };
const HOME: Route = { view: "agents", agentId: null, creating: false };
const routeKey = (route: Route) => `${route.view}-${route.agentId ?? ""}-${route.section ?? ""}-${route.operationId ?? ""}-${route.creating}`;

const REFRESH_MS = 3000; // payments made by agents through MCP show up on their own
const TOAST_MS = 5000;

export default function App() {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [route, setRoute] = useState<Route>(HOME);
  const { view, agentId, section, creating } = route;
  const history = useRef<Route[]>([]);
  const [recent, setRecent] = useState<Route[]>([HOME]);
  const [recentsOpen, setRecentsOpen] = useState(false);
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [operations, setOperations] = useState<Operation[] | null>(null);
  const [notifications, setNotifications] = useState<NotificationList | null>(null);
  const [notificationsFailed, setNotificationsFailed] = useState(false);
  const [offline, setOffline] = useState(false);
  const [toastId, setToastId] = useState<string | null>(null); // the newest agent payment, shown with its current status
  const seen = useRef<Set<string> | null>(null); // operation ids already shown; null until the first load
  const refreshing = useRef(false);
  const refreshAgain = useRef(false);
  const agentRevision = useRef(0);
  const notificationRevision = useRef(0);
  const notificationMutation = useRef(false);
  const notificationsRefreshing = useRef(false);
  const notificationsRefreshAgain = useRef(false);
  const agentsRef = useRef(agents);
  agentsRef.current = agents;
  const t = LANGUAGES[lang];

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = t.dir;
    saveLang(lang);
  }, [lang, t.dir]);

  useEffect(() => applyTheme(theme), [theme]);

  const refreshNotifications = useCallback(async () => {
    if (notificationsRefreshing.current) { notificationsRefreshAgain.current = true; return; }
    notificationsRefreshing.current = true;
    try {
      do {
        notificationsRefreshAgain.current = false;
        const revision = notificationRevision.current;
        try {
          const data = await getNotifications();
          // A slow poll must never restore the unread state after a read action.
          if (revision === notificationRevision.current && !notificationMutation.current) {
            setNotifications(data);
            setNotificationsFailed(false);
          }
        } catch { if (revision === notificationRevision.current) setNotificationsFailed(true); }
      } while (notificationsRefreshAgain.current);
    } finally { notificationsRefreshing.current = false; }
  }, []);

  useEffect(() => {
    refreshNotifications();
    const timer = setInterval(refreshNotifications, REFRESH_MS);
    return () => clearInterval(timer);
  }, [refreshNotifications]);

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
    history.current = history.current.filter((item) => item.agentId !== id);
    setRecent((items) => items.filter((item) => item.agentId !== id));
    setRoute(HOME);
    refreshNotifications();
  };

  const toast = toastId ? operations?.find((o) => o.id === toastId) : undefined;
  const openAgent = agentId !== null ? agents?.find((a) => a.id === agentId) : undefined;

  function navigate(next: Route, remember = true) {
    if (remember && routeKey(next) !== routeKey(route)) history.current = [...history.current, route].slice(-30);
    setRoute(next);
    setRecentsOpen(false);
    if (!next.creating) setRecent((items) => [next, ...items.filter((item) => routeKey(item) !== routeKey(next))].slice(0, 8));
  }

  function open(next: View, agent: number | null = null, first?: Section) {
    if (!canNavigatePhone()) return;
    navigate({ view: next, agentId: agent, section: agent === null ? undefined : first ?? (agents?.find((a) => a.id === agent)?.has_key ? "statistics" : "limits"), creating: false });
  }

  async function markRead(throughId?: number, item?: Notification) {
    notificationMutation.current = true;
    notificationRevision.current += 1;
    try {
      if (item) await readNotification(item.id);
      else await readAllNotifications(throughId!);
      setNotifications((current) => {
        if (!current) return current;
        let count = 0;
        const items = current.items.map((entry) => {
          if (entry.read_at || (item ? entry.id !== item.id : entry.id > throughId!)) return entry;
          count += 1;
          return { ...entry, read_at: new Date().toISOString() };
        });
        return { items, unread_count: Math.max(0, current.unread_count - count) };
      });
    } catch (e) {
      throw new Error(e instanceof ApiError && e.status === 404 ? t.notifications.unavailable : t.notifications.actionFailed);
    } finally {
      notificationRevision.current += 1;
      notificationMutation.current = false;
      refreshNotifications();
    }
  }

  async function openNotification(item: Notification) {
    try {
      const operation = await getOperation(item.operation_id);
      if (operation.agent_id !== item.agent_id || !agentsRef.current?.some((a) => a.id === item.agent_id)) throw new ApiError(404, "");
      await markRead(undefined, item);
      navigate({ view: "agents", agentId: item.agent_id, section: "history", operationId: operation.id, creating: false });
    } catch (e) {
      refreshNotifications();
      throw new Error((e instanceof ApiError && e.status === 404) || (e as Error).message === t.notifications.unavailable ? t.notifications.unavailable : t.notifications.actionFailed);
    }
  }

  function back() {
    if (!canNavigatePhone()) return;
    if (recentsOpen) { setRecentsOpen(false); return; }
    if (dismissPhonePanel()) return;
    let previous = history.current.pop();
    while (previous && (previous.creating || (previous.agentId !== null && !agents?.some((a) => a.id === previous!.agentId)))) previous = history.current.pop();
    navigate(previous ?? HOME, false);
  }

  const toggleRecents = useCallback(() => {
    if (!canNavigatePhone()) return;
    setRecentsOpen((value) => !value);
  }, []);

  const recentScreens = recent.filter((item) => item.agentId === null || agents?.some((a) => a.id === item.agentId)).map((item) => ({
    id: routeKey(item),
    title: item.view === "notifications" ? t.notifications.title : item.view === "settings" ? t.tabs.settings : item.agentId === null ? t.tabs.agents : `${agents?.find((a) => a.id === item.agentId)?.name} · ${t.sections[item.section ?? "statistics"]}`,
    current: routeKey(item) === routeKey(route),
    onOpen: () => { if (canNavigatePhone()) navigate(item); },
  }));

  const screen =
    view === "notifications" ? (
      <Notifications data={notifications} failed={notificationsFailed} onRetry={refreshNotifications} onReadAll={(id) => markRead(id)} onOpen={openNotification} />
    ) : !agents || !operations ? (
      <div className="loading">{offline ? t.unreachable : t.loading}</div>
    ) : view === "settings" ? (
      <Settings lang={lang} onLang={setLang} theme={theme} onTheme={setTheme} />
    ) : creating ? (
      <NewAgent
        onCreated={updateAgent}
        onDone={(a) => { updateAgent(a); navigate({ ...HOME, agentId: a.id, section: "statistics" }); }}
      />
    ) : openAgent ? (
      <AgentScreen
        agent={openAgent}
        section={section}
        operationId={route.operationId}
        onSection={(next) => navigate({ ...route, section: next, operationId: undefined })}
        operations={operations.filter((o) => o.agent_id === openAgent.id)}
        onAgent={updateAgent}
        onDeleted={() => removeAgent(openAgent.id)}
        onChanged={refresh}
      />
    ) : (
      <Agents agents={agents} operations={operations} onOpen={(id) => open("agents", id)} onNew={() => navigate({ ...HOME, creating: true })} />
    );

  return (
    <I18n.Provider value={t}>
      <div className="stage">
        <div className={`phone${openAgent && view === "agents" && !creating ? " agent-open" : ""}`}>
          <header className="appbar">
            <button type="button" className="home" onClick={() => open("agents")} aria-label={t.tabs.agents}>
              <span className="brand">Syngraph</span>
            </button>
            <div className="appbar-actions">
            <button type="button" className="profile notification-bell" aria-pressed={view === "notifications"} aria-label={notificationsFailed ? t.notifications.bellFailed : t.notifications.bell(notifications?.unread_count ?? 0)} title={t.notifications.title} onClick={() => open(view === "notifications" ? "agents" : "notifications")}>
              <Bell size={18} strokeWidth={1.75} aria-hidden />
              {!!notifications?.unread_count && <span className="notification-count" aria-hidden>{notifications.unread_count > 99 ? "99+" : notifications.unread_count}</span>}
              {notificationsFailed && !notifications?.unread_count && <span className="notification-warning" aria-hidden />}
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
            </div>
          </header>

          {offline && agents && <div className="banner">{t.reconnecting}</div>}

          <main className={`screen${openAgent && view === "agents" && !creating ? " screen-agent" : ""}`} key={`${view}-${agentId ?? ""}-${creating}` /* each screen opens at the top */}>
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
          <PhoneNavigation recent={recentScreens} expanded={recentsOpen} onRecents={toggleRecents} onHome={() => { if (canNavigatePhone()) open("agents"); }} onBack={back} />
        </div>
      </div>
    </I18n.Provider>
  );
}
