import { KeyboardEvent, useEffect, useRef, useState } from "react";
import { Lang, LANGUAGES } from "./i18n";
import { FLAGS } from "./i18n/flags";

const CODES = Object.keys(LANGUAGES) as Lang[];

type Props = { lang: Lang; onChange: (lang: Lang) => void };

/** Language dropdown; flags only in the open list: a native <select> cannot show pictures in its options. */
export default function LangPicker({ lang, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const options = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    options.current[CODES.indexOf(lang)]?.focus();
    const closeOutside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open, lang]);

  function choose(code: Lang) {
    onChange(code);
    setOpen(false);
    button.current?.focus();
  }

  function moveFocus(e: KeyboardEvent, index: number) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = (index + (e.key === "ArrowDown" ? 1 : CODES.length - 1)) % CODES.length;
      options.current[next]?.focus();
    } else if (e.key === "Escape" || e.key === "Tab") {
      setOpen(false);
      if (e.key === "Escape") button.current?.focus();
    }
  }

  return (
    <div className="lang" ref={root}>
      <button
        ref={button}
        type="button"
        className="lang-current"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Language: ${LANGUAGES[lang].name}`}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => e.key === "ArrowDown" && (e.preventDefault(), setOpen(true))}
      >
        {LANGUAGES[lang].name}
        <span className="chevron" aria-hidden />
      </button>
      {open && (
        <ul className="lang-list" role="listbox" aria-label="Language">
          {CODES.map((code, i) => (
            <li key={code} role="option" aria-selected={code === lang}>
              <button
                ref={(el) => { options.current[i] = el; }}
                type="button"
                lang={code}
                onClick={() => choose(code)}
                onKeyDown={(e) => moveFocus(e, i)}
              >
                <span className="flag">{FLAGS[code]}</span>
                {LANGUAGES[code].name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
