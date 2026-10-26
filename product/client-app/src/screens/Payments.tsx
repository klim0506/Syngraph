import { useState } from "react";
import { Operation, rub } from "../api";
import { useT } from "../i18n";
import OperationRow from "./OperationRow";

type Filter = "all" | "paid" | "rejected" | "unknown";
const FILTERS: Filter[] = ["all", "paid", "rejected", "unknown"];

type Props = { operations: Operation[]; onChanged: () => void };

/** Payments of all the client's agents. */
export default function Payments({ operations, onChanged }: Props) {
  const t = useT();
  const [filter, setFilter] = useState<Filter>("all");
  const shown = filter === "all" ? operations : operations.filter((o) => o.status === filter);
  const paidTotal = operations.filter((o) => o.status === "paid").reduce((sum, o) => sum + o.amount_kopecks, 0);

  return (
    <>
      <h1>{t.paymentsTitle}</h1>
      <p className="muted">{t.paymentsNote(operations.length, rub(paidTotal))}</p>
      <div className="chips" role="group">
        {FILTERS.map((f) => {
          const count = f === "all" ? operations.length : operations.filter((o) => o.status === f).length;
          return (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {t.filter[f]} <span className="count">{count}</span>
            </button>
          );
        })}
      </div>
      {shown.length === 0 ? (
        <div className="empty">{t.nothingHere}</div>
      ) : (
        <ul className="ops card">
          {shown.map((o) => (
            <OperationRow key={o.id} operation={o} showAgent onChanged={onChanged} />
          ))}
        </ul>
      )}
    </>
  );
}
