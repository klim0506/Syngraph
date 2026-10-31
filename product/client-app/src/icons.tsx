// Agent icons from Lucide (ISC license): blue lines on white. Keys match AGENT_ICONS in the core.
import { Briefcase, Building2, CreditCard, FileText, Landmark, type LucideIcon, Plane, Plus, ShoppingCart, Truck } from "lucide-react";
import { useEffect, useRef } from "react";
import type { AgentIcon } from "./api";
import { useT } from "./i18n";

const GLYPHS: Record<AgentIcon, LucideIcon> = {
  invoice: FileText,
  cart: ShoppingCart,
  plane: Plane,
  truck: Truck,
  briefcase: Briefcase,
  building: Building2,
  card: CreditCard,
  bank: Landmark,
};

export const ICONS = Object.keys(GLYPHS) as AgentIcon[];

/** The agent's icon in a white rounded square. */
export function AgentBadge({ icon, size = 36 }: { icon: AgentIcon; size?: number }) {
  return (
    <span className="badge" style={{ width: size, height: size }} aria-hidden>
      <AgentGlyph icon={icon} size={Math.round(size * 0.5)} />
    </span>
  );
}

export function AgentGlyph({ icon, size = 20 }: { icon: AgentIcon; size?: number }) {
  const Glyph = GLYPHS[icon] ?? FileText;
  return <Glyph size={size} strokeWidth={1.75} style={{ display: "block" }} aria-hidden />;
}

/** Matching illustrations for an empty agent list and an empty payment journal. */
export function EmptyIllustration({ kind, onAction }: { kind: "agents" | "history"; onAction?: () => void }) {
  const t = useT();
  const artwork = useRef<SVGSVGElement>(null);
  const hovering = useRef(false);
  const boost = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (boost.current !== null) clearTimeout(boost.current); }, []);
  const speed = (rate: number) => artwork.current?.getAnimations({ subtree: true }).forEach((animation) => animation.updatePlaybackRate(rate));
  const reset = () => {
    if (boost.current !== null) clearTimeout(boost.current);
    boost.current = null;
    speed(hovering.current ? 2 : 1);
  };
  return (
    <span className="empty-art-wrap">
    <svg ref={artwork} className="empty-art" viewBox="0 0 200 176" fill="none" aria-hidden="true"
      onPointerEnter={(event) => { if (event.pointerType !== "touch") { hovering.current = true; if (boost.current === null) speed(2); } }}
      onPointerLeave={(event) => { if (event.pointerType !== "touch") { hovering.current = false; reset(); } }}
      onPointerDown={() => { reset(); speed(4); boost.current = setTimeout(() => { boost.current = null; speed(hovering.current ? 2 : 1); }, 1200); }}
      onPointerCancel={reset}>
      <circle cx="100" cy="86" r="72" fill="var(--blue-soft)" />
      <circle cx="100" cy="86" r="84" stroke="var(--line)" strokeDasharray="3 8" />
      <rect x="52" y="34" width="96" height="118" rx="13" fill="var(--card)" stroke="var(--line)" transform="rotate(-14 100 93)" />
      <rect x="52" y="30" width="96" height="118" rx="13" fill="var(--blue-soft)" stroke="var(--line)" transform="rotate(10 100 89)" />
      <g className="empty-art-paper">
        <rect x="50" y="22" width="100" height="126" rx="14" fill="var(--card)" stroke="var(--line)" />
        {kind === "history" ? (
          <>
            <rect x="66" y="39" width="28" height="28" rx="9" fill="var(--blue-soft)" />
            <path d="M74 49H86M74 55H82" stroke="var(--blue)" strokeWidth="2" strokeLinecap="round" />
            <path d="M105 48H134M105 56H124" stroke="var(--line)" strokeWidth="4" strokeLinecap="round" />
            <path d="M66 79H134" stroke="var(--line)" strokeDasharray="2 4" />
            <circle cx="70" cy="94" r="4" fill="var(--blue)" opacity=".6" />
            <circle cx="70" cy="112" r="4" fill="var(--blue)" opacity=".3" />
            <path d="M84 94H130M84 112H116" stroke="var(--line)" strokeWidth="5" strokeLinecap="round" />
            <path d="M66 131H96" stroke="var(--line)" strokeWidth="3" strokeLinecap="round" />
          </>
        ) : (
          <>
            <path d="M100 36V46" stroke="var(--blue)" strokeWidth="2" strokeLinecap="round" />
            <circle cx="100" cy="34" r="3" fill="var(--blue)" />
            <rect x="66" y="46" width="68" height="54" rx="17" fill="var(--blue-soft)" />
            <path d="M61 65V80M139 65V80" stroke="var(--blue)" strokeWidth="3" strokeLinecap="round" opacity=".45" />
            <circle cx="85" cy="68" r="4" fill="var(--blue)" />
            <circle cx="115" cy="68" r="4" fill="var(--blue)" />
            <path d="M89 84Q100 92 111 84" stroke="var(--blue)" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M72 117H128M82 130H118" stroke="var(--line)" strokeWidth="4" strokeLinecap="round" />
          </>
        )}
      </g>
      {!(kind === "agents" && onAction) && <>
        <circle cx="146" cy="135" r="23" fill="var(--blue)" stroke="var(--page)" strokeWidth="5" />
        <path d={kind === "history" ? "M136 131H154L150 127M156 139H138L142 143" : "M146 125V145M136 135H156"} stroke="var(--card)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </>}
      <g className="empty-art-orbit empty-art-orbit-one"><g><path d="M31 56V64M27 60H35" stroke="var(--blue)" strokeWidth="2" strokeLinecap="round" opacity=".55" /></g></g>
      <g className="empty-art-orbit empty-art-orbit-two"><g><path d="M164 37V47M159 42H169" stroke="var(--blue)" strokeWidth="2" strokeLinecap="round" opacity=".55" /></g></g>
      <g className="empty-art-orbit empty-art-orbit-three"><circle cx="27" cy="121" r="3" fill="var(--blue)" opacity=".35" /></g>
      <g className="empty-art-orbit empty-art-orbit-four"><circle cx="176" cy="88" r="3" fill="var(--blue)" opacity=".25" /></g>
    </svg>
    {kind === "agents" && onAction && <button type="button" className="empty-art-action" onClick={onAction} aria-label={t.connectAgent} title={t.connectAgent}><Plus size={32} strokeWidth={1.5} aria-hidden /></button>}
    </span>
  );
}
