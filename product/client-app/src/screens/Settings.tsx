import { useState } from "react";
import { Lang, useT } from "../i18n";
import LangPicker from "../LangPicker";
import { Theme, THEMES } from "../theme";

type Props = { lang: Lang; onLang: (lang: Lang) => void; theme: Theme; onTheme: (theme: Theme) => void };

const DEMO_ACCOUNT_KEY = "syngraph.demo-bank-connected";

function demoConnected() {
  try { return sessionStorage.getItem(DEMO_ACCOUNT_KEY) === "yes"; }
  catch { return false; }
}

/** App settings and an explicitly simulated bank connection for the screencast. */
export default function Settings({ lang, onLang, theme, onTheme }: Props) {
  const t = useT();
  const [connected, setConnected] = useState(demoConnected);

  function toggleDemo() {
    const next = !connected;
    setConnected(next);
    try {
      if (next) sessionStorage.setItem(DEMO_ACCOUNT_KEY, "yes");
      else sessionStorage.removeItem(DEMO_ACCOUNT_KEY);
    } catch { /* The demo still works when browser storage is unavailable. */ }
  }

  return (
    <>
      <h1>{t.tabs.settings}</h1>

      <h2>{t.bankConnection.title}</h2>
      <section className="card identity-form" aria-label={t.bankConnection.title}>
        <p className="muted">{t.bankConnection.demo}</p>
        <label className="identity-form">
          <span className="muted">{t.bankConnection.bank}</span>
          <input readOnly value={t.bankConnection.bankName} />
        </label>
        <label className="identity-form">
          <span className="muted">{t.bankConnection.account}</span>
          <input readOnly className="num" dir="ltr" value="40702 810 0 0000 0000001" />
        </label>
        <div role="status" aria-live="polite" className={connected ? "notice" : "muted"}>
          {connected ? t.bankConnection.connected : t.bankConnection.disconnected}
        </div>
        <button type="button" className={connected ? "btn-secondary" : "btn-primary"} onClick={toggleDemo}>
          {connected ? t.bankConnection.disconnect : t.bankConnection.connect}
        </button>
      </section>

      <section className="card setting">
        <div className="setting-name">{t.language}</div>
        <LangPicker lang={lang} onChange={onLang} />
      </section>

      <section className="card setting">
        <div className="setting-name">{t.theme}</div>
        <div className="segmented segmented-small" role="group" aria-label={t.theme}>
          {THEMES.map((name) => (
            <button key={name} type="button" aria-pressed={theme === name} onClick={() => onTheme(name)}>
              {t.themes[name]}
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
