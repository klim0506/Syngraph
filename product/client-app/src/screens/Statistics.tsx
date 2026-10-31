import { CheckCircle2, CreditCard, Users, Wallet } from "lucide-react";
import { PointerEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AgentStatistics, CATEGORIES, getAgentStatistics, Operation, rub, StatisticsPeriod } from "../api";
import { useT } from "../i18n";

type Props = { agentId: number; operations: Operation[]; onOperation: (operation: Operation) => void };
const COLORS = ["#2563eb", "#e88b13", "#089b91", "#d14f82", "#8864d8", "#21a8cf", "#a36a36", "#65a337", "#e15749", "#a49b22", "#7b879b"];
const RANGES = ["today", "day", "week", "month"] as const;
type Range = StatisticsPeriod;
type ChartPoint = { key: string; label: string; tick: string; amount_kopecks: number; count: number };

type Share = { key: string; label: string; value: string; weight: number; color: string };

/** One shape for every breakdown: a proportional bar over a list of shares; tapping a segment names it. */
function Distribution({ title, total, shares, weight, empty, id, limit = 3 }: { title: string; total: string; shares: Share[]; weight: number; empty: string; id: string; limit?: number }) {
  const t = useT();
  const bar = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const sorted = [...shares].sort((a, b) => b.weight - a.weight);
  const visible = expanded ? sorted : sorted.slice(0, limit);
  let end = 0;
  const segments = sorted.map((share) => {
    const start = end;
    end += weight ? share.weight / weight * 100 : 0;
    return { ...share, start, end };
  });
  const selected = segments.find((segment) => segment.key === active);

  useEffect(() => {
    if (active === null) return;
    const dismiss = (event: Event) => {
      if (event.target instanceof Node && !bar.current?.contains(event.target)) setActive(null);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setActive(null); };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, [active]);

  return <section className="card">
    <div className="stats-heading"><span>{title}</span><span className="muted num">{total}</span></div>
    {weight > 0 ? <div ref={bar} className="stats-share-wrap">
      <div className="stats-share-bar">{segments.filter((segment) => segment.weight > 0).map((segment) => <button type="button" key={segment.key} aria-label={`${segment.label}: ${segment.value}`} aria-pressed={segment.key === active}
        className={active && segment.key !== active ? "dimmed" : undefined} style={{ width: `${segment.end - segment.start}%`, background: segment.color }}
        onClick={() => setActive((current) => current === segment.key ? null : segment.key)} />)}</div>
      {selected && <div className="stats-share-tooltip" role="status" style={{ left: `clamp(0px, calc(${(selected.start + selected.end) / 2}% - 110px), calc(100% - 220px))` }}>
        <span><i style={{ background: selected.color }} aria-hidden />{selected.label}</span>
        <span className="num">{selected.value} · {new Intl.NumberFormat(t.locale, { style: "percent", maximumFractionDigits: 1 }).format(selected.weight / weight)}</span>
      </div>}
    </div> : <p className="stats-no-paid muted">{empty}</p>}
    {shares.length > 0 && <div className="stats-share-list" id={id}>{visible.map((share) => <div key={share.key} className={share.weight ? undefined : "muted"} data-share={share.key}><i style={{ background: share.color }} aria-hidden /><span>{share.label}</span><span>{share.value}</span></div>)}</div>}
    {shares.length > limit && <button type="button" className="link stats-share-toggle" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded((value) => !value)}>{expanded ? t.stats.showLess : `${t.stats.showAll} (${new Intl.NumberFormat(t.locale).format(shares.length)})`}</button>}
  </section>;
}

/** Fit the complete metric label or value on one line without shortening it. */
function FittedMetric({ value, className = "stats-mini-value num" }: { value: string; className?: string }) {
  const box = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    let lastWidth = 0;
    const fit = () => {
      element.style.fontSize = "";
      const size = parseFloat(getComputedStyle(element).fontSize);
      lastWidth = element.clientWidth;
      if (lastWidth > 0 && element.scrollWidth > lastWidth) element.style.fontSize = `${Math.floor(size * (lastWidth - 1) / element.scrollWidth * 10) / 10}px`;
    };
    fit();
    const observer = new ResizeObserver(() => { if (element.clientWidth !== lastWidth) fit(); });
    observer.observe(element);
    return () => observer.disconnect();
  }, [value]);
  return <span ref={box} className={`stats-fitted ${className}`} title={value}>{value}</span>;
}

/** Four integer-kopeck ticks with readable steps shared by labels and the plotted data. */
function spendingScale(values: number[]) {
  const maximum = Math.max(0, ...values);
  const raw = (maximum || 300) / 3;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / magnitude;
  const step = Math.max(1, Math.ceil(([1, 2, 2.5, 5, 10].find((value) => value >= fraction) ?? 10) * magnitude));
  return { ceiling: step * 3, ticks: [step * 3, step * 2, step, 0] };
}

/** Linear interpolation keeps zero intervals flat and never invents negative spending. */
function SpendingLine({ values, labels, selected, label, maximum }: { values: number[]; labels: string[]; selected?: number; label: string; maximum: number }) {
  const points = values.map((value, index) => ({ x: (index + 0.5) / Math.max(1, values.length) * 280, y: 86 - value / maximum * 70 }));
  const coordinates = points.map((point) => `${point.x},${point.y}`).join(" ");
  return (
    <svg className="stats-line" viewBox="0 0 280 96" preserveAspectRatio="none" role="img" aria-label={label}>
      {[0, 1, 2, 3].map((index) => <line key={index} x1="0" x2="280" y1={16 + index * 70 / 3} y2={16 + index * 70 / 3} stroke="var(--line)" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />)}
      {points.length > 0 && <polygon points={`${points[0].x},86 ${coordinates} ${points[points.length - 1].x},86`} fill="var(--blue)" opacity=".08" />}
      <polyline points={coordinates} fill="none" stroke="var(--blue)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {points.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r={selected === index ? 3.5 : 1.8} fill={selected === index ? "var(--blue)" : "var(--card)"} stroke="var(--blue)" strokeWidth="1.5" vectorEffect="non-scaling-stroke"><title>{labels[index]}</title></circle>)}
    </svg>
  );
}

/** Every metric uses one server-side period, independently of the capped operation feed. */
export default function Statistics({ agentId, operations, onOperation }: Props) {
  const t = useT();
  const [snapshot, setSnapshot] = useState<{ period: Range; data: AgentStatistics } | null>(null);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [range, setRange] = useState<Range>("today");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const data = snapshot?.period === range ? snapshot.data : null;
  const revision = operations.map((operation) => `${operation.id}:${operation.status}`).join("|");

  useEffect(() => {
    let cancelled = false;
    let running = false;
    async function refresh() {
      if (running) return;
      running = true;
      try {
        const next = await getAgentStatistics(agentId, range);
        if (next.period !== range) throw new Error("Statistics period mismatch");
        if (!cancelled) { setSnapshot({ period: range, data: next }); setFailed(false); }
      } catch {
        if (!cancelled) setFailed(true);
      } finally { running = false; }
    }
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [agentId, range, revision, reload]);

  const retry = failed && (
    <div className="stats-error" role="status">
      <span className="muted">{t.stats.unavailable}</span>
      <button type="button" className="link" onClick={() => setReload((value) => value + 1)}>{t.stats.retry}</button>
    </div>
  );
  const periodSelect = <select className="select" aria-label={t.period} value={range} onChange={(event) => { setRange(event.target.value as Range); setSelectedKey(null); setFailed(false); }}>
    {RANGES.map((value) => <option key={value} value={value}>{t.stats.ranges[value]}</option>)}
  </select>;
  if (!data) return <div className="statistics">
    <div className="stats-dashboard-filter"><h1>{t.sections.statistics}</h1><div className="stats-period-filter">{periodSelect}</div></div>
    {failed ? retry : <div className="loading">{t.loading}</div>}
  </div>;

  const number = (value: number) => new Intl.NumberFormat(t.locale).format(value);
  const date = (value: string, full = false) => new Date(`${value}T12:00:00Z`).toLocaleDateString(t.locale, { day: "numeric", month: full ? "short" : undefined, timeZone: "UTC" });
  const time = (value: string) => new Date(value).toLocaleTimeString(t.locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: data.timezone });
  const points: ChartPoint[] = range === "today"
    ? data.hours.map((hour) => ({ ...hour, key: `hour-${hour.hour}`, label: `${String(hour.hour).padStart(2, "0")}:00–${String(hour.hour + 1).padStart(2, "0")}:00`, tick: String(hour.hour).padStart(2, "0") }))
    : range === "day" ? (data.rolling_hours ?? []).map((hour, index) => ({ ...hour, key: `rolling-${index}`, label: new Date(hour.start).toLocaleString(t.locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: data.timezone }), tick: time(hour.start) }))
    : (range === "week" ? data.days : data.month ?? []).map((day) => ({ ...day, key: day.date, label: date(day.date, true), tick: date(day.date) }));
  const currentHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: data.timezone, hour: "2-digit", hourCycle: "h23" }).format(new Date()));
  const selected = points.find((point) => point.key === selectedKey) ?? points[range === "today" ? currentHour : points.length - 1];
  const selectedIndex = selected ? points.indexOf(selected) : 0;
  const periodTotal = points.reduce((sum, point) => ({ amount_kopecks: sum.amount_kopecks + point.amount_kopecks, count: sum.count + point.count }), { amount_kopecks: 0, count: 0 });
  const ticks = range === "day" ? [0, 12, 23] : range === "today" ? [0, 6, 12, 18, 23] : range === "week" ? points.map((_, index) => index) : [0, 7, 14, 21, 29];
  const tickEdge = range === "day" ? 24 : 10;
  const scale = spendingScale(points.map((point) => point.amount_kopecks));
  const axisNumber = new Intl.NumberFormat(t.locale, { maximumFractionDigits: 5 });
  const flows = data.flows ? [
    { key: "allowed", label: t.stats.allowed, weight: data.flows.allowed, color: "var(--blue)" },
    { key: "rejected", label: t.stats.rejected, weight: data.flows.rejected, color: "var(--red)" },
    { key: "cancelled", label: t.stats.cancelled, weight: data.flows.cancelled, color: "var(--muted)" },
    { key: "approved", label: t.stats.approved, weight: data.flows.approved, color: "var(--green)" },
    { key: "awaiting", label: t.stats.awaiting, weight: data.flows.awaiting, color: "var(--amber)" },
    ...(data.flows.unknown ? [{ key: "unknown", label: t.stats.unknownFlow, weight: data.flows.unknown, color: "var(--line)" }] : []),
  ].map((flow) => ({ ...flow, value: number(flow.weight) })) : [];

  function choosePoint(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const index = Math.max(0, Math.min(points.length - 1, Math.floor((event.clientX - bounds.left) / bounds.width * points.length)));
    if (points[index]) setSelectedKey(points[index].key);
  }
  const categories = data.categories.map((group) => ({
    key: group.category ?? "uncategorized", label: group.category ? t.categoryNames[group.category] : t.stats.uncategorized,
    value: rub(group.amount_kopecks), weight: group.amount_kopecks,
    color: COLORS[group.category ? CATEGORIES.indexOf(group.category) : CATEGORIES.length],
  }));

  return (
    <div className="statistics">
      <div className="stats-dashboard-filter"><h1>{t.sections.statistics}</h1><div className="stats-period-filter">{periodSelect}</div></div>
      {retry}
      <div className="stats-summary">
        {[
          { icon: Wallet, label: t.stats.total, value: rub(data.total.amount_kopecks) },
          { icon: CheckCircle2, label: t.stats.payments, value: number(data.total.count) },
        ].map(({ icon: Icon, label, value }) => (
          <section className="card stats-mini" key={label}><Icon size={17} strokeWidth={1.75} aria-hidden /><span className="stats-mini-label muted">{label}</span><FittedMetric value={value} /></section>
        ))}
      </div>
      <section className="card stats-period-card">
        <div className="stats-period-header">
          <div className="stats-period-meta">
            <div className="stats-period-total num">{selected ? rub(periodTotal.amount_kopecks) : "—"}</div>
          </div>
          <Wallet size={19} strokeWidth={1.75} className="stats-wallet" aria-hidden />
        </div>
        {selected ? <>
          <div className="stats-chart-frame">
          <div className="stats-y-axis" aria-hidden>{scale.ticks.map((value) => <span key={value}>{axisNumber.format(value / 100_000)}</span>)}</div>
          <div className="stats-plot" role="slider" tabIndex={0} aria-label={`${t.stats.paid} · ${t.stats.ranges[range]}`} aria-valuemin={1} aria-valuemax={points.length} aria-valuenow={selectedIndex + 1} aria-valuetext={`${selected.label} · ${rub(selected.amount_kopecks)} · ${t.stats.payments}: ${number(selected.count)}`}
            onPointerDown={(event) => { event.currentTarget.focus({ preventScroll: true }); event.currentTarget.setPointerCapture(event.pointerId); choosePoint(event); }}
            onPointerMove={(event) => { if (event.buttons === 1) choosePoint(event); }}
            onKeyDown={(event) => {
              let next = selectedIndex;
              if (event.key === "ArrowRight" || event.key === "ArrowUp") next++;
              else if (event.key === "ArrowLeft" || event.key === "ArrowDown") next--;
              else if (event.key === "Home") next = 0;
              else if (event.key === "End") next = points.length - 1;
              else return;
              event.preventDefault();
              setSelectedKey(points[Math.max(0, Math.min(points.length - 1, next))].key);
            }}>
            <SpendingLine values={points.map((point) => point.amount_kopecks)} labels={points.map((point) => `${point.label} · ${rub(point.amount_kopecks)}`)} selected={selectedIndex} maximum={scale.ceiling} label={`${t.stats.paid} · ${t.stats.ranges[range]}`} />
            <div className="stats-axis" aria-hidden>{ticks.filter((index) => points[index]).map((index) => <span key={points[index].key} style={{ left: `clamp(${tickEdge}px, ${(index + 0.5) / points.length * 100}%, calc(100% - ${tickEdge}px))` }}>{points[index].tick}</span>)}</div>
          </div>
          </div>
          <div className="stats-point-detail muted"><span>{selected.label}</span><span aria-hidden>·</span><span className="num">{rub(selected.amount_kopecks)}</span><span aria-hidden>·</span><span>{t.stats.payments}: {number(selected.count)}</span></div>
        </> : <div className="stats-error"><span className="muted">{t.stats.unavailable}</span><button type="button" className="link" onClick={() => setReload((value) => value + 1)}>{t.stats.retry}</button></div>}
      </section>

      {data.flows && <Distribution title={t.stats.outcomes} total={number(data.operations_count)} shares={flows} weight={data.operations_count} empty={t.stats.noOperations} id={`statistics-outcomes-${agentId}`} key={`outcomes-${agentId}-${range}`} />}

      <Distribution key={`${agentId}-${range}`} title={t.stats.categories} total={rub(data.total.amount_kopecks)} shares={categories} weight={categories.reduce((sum, share) => sum + share.weight, 0)} empty={t.stats.noPaid} id={`statistics-categories-${agentId}`} />

      <section className="card">
        <div className="stats-heading"><span>{t.stats.top3}</span></div>
        {data.largest.length ? <ol className="stats-top">{data.largest.map((operation, index) => <li key={operation.id}>
          <button type="button" className="stats-top-button" onClick={() => onOperation(operation)}>
          <span className="stats-rank" aria-hidden>{index + 1}</span>
          <span className="stats-top-payee"><span title={operation.payee}>{operation.payee}</span><span className="muted">{operation.category ? t.categoryNames[operation.category] : t.stats.uncategorized}</span></span>
          <span className="num">{rub(operation.amount_kopecks)}</span>
          </button>
        </li>)}</ol> : <p className="stats-no-paid muted">{t.stats.noPaid}</p>}
      </section>
      <div className="stats-summary stats-secondary">
        {[
          { icon: CreditCard, label: t.stats.average, value: rub(data.total.average_kopecks) },
          { icon: Users, label: t.stats.payees, value: number(data.total.payees) },
        ].map(({ icon: Icon, label, value }) => (
          <section className="card stats-mini" key={label}><Icon size={17} strokeWidth={1.75} aria-hidden /><span className="stats-mini-label muted">{label}</span><FittedMetric value={value} /></section>
        ))}
      </div>
    </div>
  );
}
