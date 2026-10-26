import { Lang, useT } from "../i18n";
import LangPicker from "../LangPicker";
import { Theme, THEMES } from "../theme";

type Props = { lang: Lang; onLang: (lang: Lang) => void; theme: Theme; onTheme: (theme: Theme) => void };

/** App settings: language and theme. */
export default function Settings({ lang, onLang, theme, onTheme }: Props) {
  const t = useT();
  return (
    <>
      <h1>{t.tabs.settings}</h1>

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
