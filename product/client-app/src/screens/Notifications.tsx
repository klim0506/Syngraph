import { Bell } from "lucide-react";
import { useState } from "react";
import { Notification, NotificationList, rub, when } from "../api";
import { useT } from "../i18n";
import { usePhoneNavigationBlock } from "../PhoneNavigation";

type Props = {
  data: NotificationList | null;
  failed: boolean;
  onRetry: () => void;
  onReadAll: (throughId: number) => Promise<void>;
  onOpen: (item: Notification) => Promise<void>;
};

/** Opening the list leaves notifications unread until an explicit action. */
export default function Notifications({ data, failed, onRetry, onReadAll, onOpen }: Props) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  usePhoneNavigationBlock(busy);

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try { await action(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  const throughId = Math.max(0, ...(data?.items.map((item) => item.id) ?? []));
  return (
    <>
      <div className="title-row notification-heading">
        <h1>{t.notifications.title}</h1>
        {!!data?.unread_count && throughId > 0 && <button type="button" className="link" disabled={busy} onClick={() => run(() => onReadAll(throughId))}>{t.notifications.readAll}</button>}
      </div>
      {failed && <div className="stats-error" role="status"><span className="muted">{t.notifications.failed}</span><button type="button" className="link" disabled={busy} onClick={onRetry}>{t.stats.retry}</button></div>}
      {error && <div className="error" role="alert">{error}</div>}
      {!data ? (!failed && <div className="loading">{t.loading}</div>) : data.items.length === 0 ? (
        <div className="history-empty" role="status"><Bell size={40} strokeWidth={1.25} className="muted" aria-hidden /><p className="muted">{t.notifications.empty}</p></div>
      ) : (
        <ul className="notification-list card">
          {data.items.map((item) => <li key={item.id}>
            <button type="button" className={`notification-item${item.read_at ? "" : " unread"}`} disabled={busy} onClick={() => run(() => onOpen(item))}>
              <span className="notification-top"><span className="notification-agent">{!item.read_at && <span className="notification-unread" role="img" aria-label={t.notifications.unread} />}{item.agent_name}</span><span className="num" dir="ltr">{item.currency === "RUB" ? rub(item.amount_kopecks) : `${(item.amount_kopecks / 100).toLocaleString(t.locale)} ${item.currency}`}</span></span>
              <span className="notification-payee">{item.payee}</span>
              <span className={`dot-state state-${item.status}`}>{t.status[item.status]}</span>
              <time className="muted" dateTime={item.created_at}>{when(item.created_at, t.locale)}</time>
            </button>
          </li>)}
        </ul>
      )}
    </>
  );
}
