// Agent icons from Lucide (ISC license): blue lines on white. Keys match AGENT_ICONS in the core.
import { Briefcase, Building2, CreditCard, FileText, Landmark, type LucideIcon, Plane, ShoppingCart, Truck } from "lucide-react";
import type { AgentIcon } from "./api";

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
export function EmptyIllustration({ kind }: { kind: "agents" | "history" }) {
  return (
    <svg className="empty-art" viewBox="0 0 200 176" fill="none" aria-hidden="true">
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
      <circle cx="146" cy="135" r="23" fill="var(--blue)" stroke="var(--page)" strokeWidth="5" />
      <path d={kind === "history" ? "M136 131H154L150 127M156 139H138L142 143" : "M146 125V145M136 135H156"} stroke="var(--card)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M31 56V64M27 60H35M168 34V44M163 39H173" stroke="var(--blue)" strokeWidth="2" strokeLinecap="round" opacity=".55" />
      <circle cx="27" cy="121" r="3" fill="var(--blue)" opacity=".35" />
      <circle cx="176" cy="88" r="3" fill="var(--blue)" opacity=".25" />
    </svg>
  );
}
