import { CreditCard, LineChart, Users, Wallet } from "lucide-react";
import { PointerEvent, useEffect, useState } from "react";
import { AgentStatistics, getAgentStatistics, Operation, rub, StatisticsPeriod } from "../api";
import { useT } from "../i18n";

type Props = { agentId: number; operations: Operation[] };
const COLORS = ["var(--blue)", "var(--sky)", "#819fec", "#aabce7", "var(--line)"];
const RANGES = ["day", "week", "month"] as const;
type Range = StatisticsPeriod;
type ChartPoint = { key: string; label: string; tick: string; amount_kopecks: number; count: number };

/** Linear interpolation keeps zero intervals flat and never invents negative spending. */
function SpendingLine({ values, labels, selected, label }: { values: number[]; labels: string[]; selected?: number; label: string }) {
  const maximum = Math.max(1, ...values);
  const points = values.map((value, index) => ({ x: (index + 0.5) / Math.max(1, values.length) * 280, y: 86 - value / maximum * 70 }));
  const coordinates = points.map((point) => `${point.x},${point.y}`).join(" ");
  return (
    <svg className="stats-line" viewBox="0 0 280 96" preserveAspectRatio="none" role="img" aria-label={label}>
      {[16, 51, 86].map((y) => <line key={y} x1="0" x2="280" y1={y} y2={y} stroke="var(--line)" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />)}
      {points.length > 0 && <polygon points={`${points[0].x},86 ${coordinates} ${points[points.length - 1].x},86`} fill="var(--blue)" opacity=".08" />}
      <polyline points={coordinates} fill="none" stroke="var(--blue)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {points.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r={selected === index ? 3.5 : 1.8} fill={selected === index ? "var(--blue)" : "var(--card)"} stroke="var(--blue)" strokeWidth="1.5" vectorEffect="non-scaling-stroke"><title>{labels[index]}</title></circle>)}
    </svg>
  );
}

/** Every metric uses one server-side period, independently of the capped operation feed. */
export default function Statistics({ agentId, operations }: Props) {
  const t = useT();
  const [snapshot, setSnapshot] = useState<{ period: Range; data: AgentStatistics } | null>(null);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [range, setRange] = useState<Range>("day");
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
    <div className="stats-dashboard-filter"><h1>{t.sections.statistics}</h1><div className="stats-period-filter"><span className="muted" />{periodSelect}</div></div>
    {failed ? retry : <div className="loading">{t.loading}</div>}
  </div>;

  const number = (value: number) => new Intl.NumberFormat(t.locale).format(value);
  const date = (value: string, full = false) => new Date(`${value}T12:00:00Z`).toLocaleDateString(t.locale, { day: "numeric", month: full ? "short" : undefined, timeZone: "UTC" });
  const points: ChartPoint[] = range === "day"
    ? data.hours.map((hour) => ({ ...hour, key: `hour-${hour.hour}`, label: `${String(hour.hour).padStart(2, "0")}:00–${String(hour.hour + 1).padStart(2, "0")}:00`, tick: String(hour.hour).padStart(2, "0") }))
    : (range === "week" ? data.days : data.month ?? []).map((day) => ({ ...day, key: day.date, label: date(day.date, true), tick: date(day.date) }));
  const currentHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: data.timezone, hour: "2-digit", hourCycle: "h23" }).format(new Date()));
  const selected = points.find((point) => point.key === selectedKey) ?? points[range === "day" ? currentHour : points.length - 1];
  const selectedIndex = selected ? points.indexOf(selected) : 0;
  const periodTotal = points.reduce((sum, point) => ({ amount_kopecks: sum.amount_kopecks + point.amount_kopecks, count: sum.count + point.count }), { amount_kopecks: 0, count: 0 });
  const days = range === "month" ? data.month : data.days;
  const rangeCaption = range === "day" ? date(data.days[data.days.length - 1].date, true)
    : days?.length ? `${date(days[0].date, true)} – ${date(days[days.length - 1].date, true)}` : "";
  const ticks = range === "day" ? [0, 6, 12, 18, 23] : range === "week" ? points.map((_, index) => index) : [0, 7, 14, 21, 29];

  function choosePoint(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const index = Math.max(0, Math.min(points.length - 1, Math.floor((event.clientX - bounds.left) / bounds.width * points.length)));
    if (points[index]) setSelectedKey(points[index].key);
  }
  const groups = data.categories.slice(0, 4).map((group) => ({
    ...group, name: group.category ? t.categoryNames[group.category] : t.stats.uncategorized,
  }));
  if (data.categories.length > 4) groups.push({
    category: null, name: t.stats.other,
    amount_kopecks: data.categories.slice(4).reduce((sum, group) => sum + group.amount_kopecks, 0),
    count: data.categories.slice(4).reduce((sum, group) => sum + group.count, 0),
  });
  let end = 0;
  const stops = groups.map((group, index) => {
    const start = end;
    end += data.total.amount_kopecks ? group.amount_kopecks / data.total.amount_kopecks * 100 : 0;
    return `${COLORS[index]} ${start}% ${end}%`;
  });

  return (
    <div className="statistics">
      <div className="stats-dashboard-filter"><h1>{t.sections.statistics}</h1><div className="stats-period-filter"><span className="muted">{rangeCaption}</span>{periodSelect}</div></div>
      {retry}
      <section className="card stats-period-card">
        <div className="stats-period-header">
          <div className="stats-period-meta">
            <span className="muted">{t.stats.paid}</span>
            <div className="stats-period-total num">{selected ? rub(periodTotal.amount_kopecks) : "—"}</div>
            <span className="muted">{t.stats.payments} · {selected ? number(periodTotal.count) : "—"}</span>
          </div>
          <Wallet size={19} strokeWidth={1.75} className="stats-wallet" aria-hidden />
        </div>
        {selected ? <>
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
            <SpendingLine values={points.map((point) => point.amount_kopecks)} labels={points.map((point) => `${point.label} · ${rub(point.amount_kopecks)}`)} selected={selectedIndex} label={`${t.stats.paid} · ${t.stats.ranges[range]}`} />
            <div className="stats-axis" aria-hidden>{ticks.filter((index) => points[index]).map((index) => <span key={points[index].key} style={{ left: `clamp(10px, ${(index + 0.5) / points.length * 100}%, calc(100% - 10px))` }}>{points[index].tick}</span>)}</div>
          </div>
          <div className="stats-point-detail muted"><span>{selected.label}</span><span aria-hidden>·</span><span className="num">{rub(selected.amount_kopecks)}</span><span aria-hidden>·</span><span>{t.stats.payments}: {number(selected.count)}</span></div>
        </> : <div className="stats-error"><span className="muted">{t.stats.unavailable}</span><button type="button" className="link" onClick={() => setReload((value) => value + 1)}>{t.stats.retry}</button></div>}
      </section>

      <div className="stats-summary">
        {[
          { icon: Wallet, label: t.stats.total, value: rub(data.total.amount_kopecks) },
          { icon: CreditCard, label: t.stats.average, value: rub(data.total.average_kopecks) },
          { icon: LineChart, label: t.stats.payments, value: number(data.total.count) },
          { icon: Users, label: t.stats.payees, value: number(data.total.payees) },
        ].map(({ icon: Icon, label, value }) => (
          <section className="card stats-mini" key={label}><Icon size={17} strokeWidth={1.75} aria-hidden /><span className="muted">{label}</span><span className="stats-mini-value num">{value}</span></section>
        ))}
      </div>

      <section className="card">
        <div className="stats-heading"><span>{t.stats.categories}</span></div>
        <div className="stats-categories">
          <div className="stats-donut" role="img" aria-label={groups.length ? groups.map((group) => `${group.name}: ${rub(group.amount_kopecks)}`).join(", ") : t.stats.noPaid} style={{ background: stops.length ? `conic-gradient(${stops.join(", ")})` : "var(--line)" }}>
            <div><span>{number(data.total.count)}</span><span className="muted">{t.stats.payments}</span></div>
          </div>
          <div className="stats-legend">
            {groups.length ? groups.map((group, index) => <div key={group.name}><i style={{ background: COLORS[index] }} aria-hidden /><span>{group.name}</span><span className="num">{rub(group.amount_kopecks)}</span></div>) : <p className="muted">{t.stats.noPaid}</p>}
          </div>
        </div>
      </section>

      <section className="card">
        <div className="stats-heading"><span>{t.stats.top3}</span></div>
        {data.largest.length ? <ol className="stats-top">{data.largest.map((operation, index) => <li key={operation.id}>
          <span className="stats-rank" aria-hidden>{index + 1}</span>
          <span className="stats-top-payee"><span title={operation.payee}>{operation.payee}</span><span className="muted">{operation.category ? t.categoryNames[operation.category] : t.stats.uncategorized}</span></span>
          <span className="num">{rub(operation.amount_kopecks)}</span>
        </li>)}</ol> : <p className="stats-no-paid muted">{t.stats.noPaid}</p>}
      </section>
    </div>
  );
}
