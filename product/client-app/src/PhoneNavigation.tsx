import { ChevronLeft, Circle, Menu, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef } from "react";
import { useT } from "./i18n";

const BACK_PRIORITY = { screen: 10, inline: 20, popover: 30, modal: 40 };
const backHandlers = new Map<symbol, { priority: number; onBack: () => void }>();
const navigationBlocks = new Set<symbol>();

/** Pending mutations keep every device control on the current screen. */
export function usePhoneNavigationBlock(busy: boolean) {
  const id = useRef(Symbol());
  useLayoutEffect(() => {
    if (!busy) return;
    const key = id.current;
    navigationBlocks.add(key);
    return () => { navigationBlocks.delete(key); };
  }, [busy]);
}

export const canNavigatePhone = () => navigationBlocks.size === 0;

/** A screen can consume Back to dismiss a local panel before navigation. */
export function usePhoneBack(active: boolean, onBack: () => void, layer: keyof typeof BACK_PRIORITY) {
  const id = useRef(Symbol());
  useLayoutEffect(() => {
    if (!active) return;
    const key = id.current;
    backHandlers.set(key, { priority: BACK_PRIORITY[layer], onBack });
    return () => { backHandlers.delete(key); };
  }, [active, onBack, layer]);
}

export function dismissPhonePanel() {
  const top = [...backHandlers.values()].sort((a, b) => b.priority - a.priority)[0];
  if (!top) return false;
  top.onBack();
  return true;
}

type Recent = { id: string; title: string; current: boolean; onOpen: () => void };
type Props = { recent: Recent[]; expanded: boolean; onRecents: () => void; onHome: () => void; onBack: () => void };

export default function PhoneNavigation({ recent, expanded, onRecents, onHome, onBack }: Props) {
  const t = useT();
  const overview = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!expanded) return;
    const previous = document.activeElement as HTMLElement | null;
    overview.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onRecents(); }
      if (event.key !== "Tab") return;
      const buttons = Array.from(overview.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); (previous?.isConnected ? previous : toggle.current)?.focus(); };
  }, [expanded, onRecents]);

  return (
    <>
      {expanded && <div className="phone-recents-backdrop" onClick={onRecents}>
        <div ref={overview} className="phone-recents" role="dialog" aria-modal="true" aria-labelledby="phone-recents-title" onClick={(e) => e.stopPropagation()}>
          <div className="phone-recents-heading"><b id="phone-recents-title">{t.phone.recents}</b><button type="button" onClick={onRecents} aria-label={t.phone.close}><X size={18} aria-hidden /></button></div>
          {recent.map((item) => <button type="button" className="phone-recent" key={item.id} aria-current={item.current ? "page" : undefined} onClick={item.onOpen}><span>{item.title}</span>{item.current && <small>{t.phone.current}</small>}</button>)}
        </div>
      </div>}
      <nav className="phone-navigation" aria-label={t.phone.navigation} dir="ltr">
        <button ref={toggle} type="button" aria-label={t.phone.recents} title={t.phone.recents} aria-expanded={expanded} onClick={onRecents}><Menu className="phone-overview-icon" size={21} strokeWidth={1.8} aria-hidden /></button>
        <button type="button" aria-label={t.phone.home} title={t.phone.home} onClick={onHome}><Circle size={20} strokeWidth={1.8} aria-hidden /></button>
        <button type="button" aria-label={t.phone.back} title={t.phone.back} onClick={onBack}><ChevronLeft size={25} strokeWidth={1.8} aria-hidden /></button>
      </nav>
    </>
  );
}
