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
