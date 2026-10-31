"""Core HTTP API for client-app: the client's agents, each with its own mandate, key, payees and payments.

No sign-in yet: the client id comes in the path, so the API must listen on 127.0.0.1 only.
"""
import re
import sqlite3
from collections.abc import Iterator
from contextlib import closing, contextmanager
from datetime import datetime, time, timedelta, timezone
from typing import Literal, TypedDict
from zoneinfo import ZoneInfo

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from . import db, keys, rules
from .errors import InvalidRequest, MandateMisconfigured
from .money import to_kopecks
from .payments import check_inn, check_payee, decide, refresh

app = FastAPI(title="Syngraph core")

PERIODS = ["payment", "day", "week", "month"]
MAX_FEED = 200
MAX_AGENT_NAME = 80


class Counterparty(TypedDict):
    inn: str
    name: str


class ListedCounterparty(Counterparty):
    allowed: bool  # in the agent's list; False: only paid before


class Agent(TypedDict):
    id: int
    name: str
    icon: str  # one of db.AGENT_ICONS
    has_key: bool
    key_hint: str | None  # start and end of the current key, "sgk_Ab3x…9QzT"
    paused: bool
    any_counterparty: bool
    any_amount: bool  # no amount limits: `limits` are kept but not checked
    any_time: bool  # no working hours: the agent may pay at any time
    timezone: str
    working_days: list[str]  # "mon" ... "sun"
    working_from: str  # "09:00"
    working_to: str
    working_now: bool  # the agent may pay at this moment by the clock
    limits: dict[str, int | None]  # kopecks per payment, day, week, month
    spent: dict[str, int]  # kopecks in the current day, week, month: paid, pending and unknown
    approval: str  # auto | manual
    category_mode: str  # any | only | except
    allowed_categories: list[str]  # used with only
    blocked_categories: list[str]  # used with except


class NewKey(TypedDict):
    key: str  # shown once: Syngraph keeps only its hash
    hint: str


class Operation(TypedDict):
    id: str
    agent_id: int
    agent_name: str
    created_at: str  # UTC, "...Z"
    payee: str
    payee_inn: str
    amount_kopecks: int
    currency: str
    category: str | None
    status: db.Status
    reason: str | None


class PaymentSummary(TypedDict):
    amount_kopecks: int
    count: int


class PaymentTotal(PaymentSummary):
    average_kopecks: int
    payees: int


class PaymentDay(PaymentSummary):
    date: str


class PaymentHour(PaymentSummary):
    hour: int


class RollingPaymentHour(PaymentSummary):
    start: str
    end: str


class PaymentCategory(PaymentSummary):
    category: str | None


StatisticsPeriod = Literal["today", "day", "week", "month"]
OperationFlow = Literal["allowed", "rejected", "cancelled", "approved", "awaiting", "unknown"]


class OperationFlows(TypedDict):
    allowed: int
    rejected: int
    cancelled: int
    approved: int
    awaiting: int
    unknown: int


class AgentStatistics(TypedDict):
    period: StatisticsPeriod | None
    timezone: str
    today: PaymentSummary
    total: PaymentTotal
    operations_count: int
    success_rate: float | None
    flows: OperationFlows
    days: list[PaymentDay]
    month: list[PaymentDay]
    hours: list[PaymentHour]
    rolling_hours: list[RollingPaymentHour]
    categories: list[PaymentCategory]
    largest: list[Operation]


class AgentChange(BaseModel):
    """Only the fields to change. Limits are rubles as strings, like "100000.00"; "" clears a day, week or month limit."""
    name: str | None = None
    icon: str | None = None
    paused: bool | None = None
    any_counterparty: bool | None = None
    any_time: bool | None = None
    any_amount: bool | None = None
    working_days: list[str] | None = None
    working_from: str | None = None
    working_to: str | None = None
    max_payment: str | None = None
    max_day: str | None = None
    max_week: str | None = None
    max_month: str | None = None
    approval: str | None = None
    category_mode: str | None = None
    allowed_categories: list[str] | None = None
    blocked_categories: list[str] | None = None


class NewCounterparty(BaseModel):
    inn: str
    name: str = ""  # needed only for an INN the directory does not know


class NewAgent(AgentChange):
    """A new agent: a name, and any settings to start with instead of the defaults."""
    name: str
    payees: list[NewCounterparty] = []  # with any_counterparty false: whom the agent may pay


@app.exception_handler(InvalidRequest)
def invalid_request(request: Request, e: InvalidRequest) -> JSONResponse:
    return JSONResponse(status_code=400, content={"detail": str(e)})


@app.exception_handler(MandateMisconfigured)
def mandate_misconfigured(request: Request, e: MandateMisconfigured) -> JSONResponse:
    return JSONResponse(status_code=409, content={"detail": str(e)})


@contextmanager
def open_db() -> Iterator[sqlite3.Connection]:
    conn = db.connect()
    try:
        db.create_tables_and_demo_client(conn)
        conn.commit()  # keep initialization even when this request only reads data
        yield conn
    finally:
        conn.close()


def agent_of(conn: sqlite3.Connection, client_id: int, agent_id: int) -> sqlite3.Row:
    """The agent with its mandate; `id` is the mandate id, `agent_id` the agent's."""
    agent = db.find_agent(conn, client_id, agent_id)
    if agent is None:
        raise HTTPException(404, f"agent {agent_id} not found for client {client_id}")
    return agent


def agent_view(conn: sqlite3.Connection, agent: sqlite3.Row) -> Agent:
    now = datetime.now(timezone.utc)
    return {
        "id": agent["agent_id"],
        "name": agent["agent_name"],
        "icon": agent["agent_icon"],
        "has_key": agent["secret_hint"] is not None,
        "key_hint": agent["secret_hint"],
        "paused": bool(agent["paused"]),
        "any_counterparty": bool(agent["any_counterparty"]),
        "any_time": bool(agent["any_time"]),
        "any_amount": bool(agent["any_amount"]),
        "timezone": agent["timezone"],
        "working_days": agent["working_days"].split(","),
        "working_from": agent["working_from"],
        "working_to": agent["working_to"],
        "working_now": rules.is_working_time(agent, now),
        "limits": {name: agent[f"max_{name}_kopecks"] for name in PERIODS},
        "spent": rules.spent_by_period(conn, agent, now),
        "approval": agent["approval"],
        "category_mode": agent["category_mode"],
        "allowed_categories": [c for c in agent["allowed_categories"].split(",") if c],
        "blocked_categories": [c for c in agent["blocked_categories"].split(",") if c],
    }


def operation_view(row: sqlite3.Row) -> Operation:
    return {
        "id": row["id"],
        "agent_id": row["agent_id"],
        "agent_name": row["agent_name"],
        "created_at": row["created_at"],
        "payee": row["payee"],
        "payee_inn": row["payee_inn"],
        "amount_kopecks": row["amount_kopecks"],
        "currency": row["currency"],
        "category": row["category"],
        "status": row["status"],
        "reason": row["reason"],
    }


def operation_flow(row: sqlite3.Row) -> OperationFlow:
    """The approval path, independent of an approved payment's eventual bank result."""
    state = row["approval_state"] if "approval_state" in row.keys() else None
    if state == "approved":
        return "approved"
    if state == "declined":
        return "cancelled"
    if state == "awaiting" and row["status"] == "awaiting":
        return "awaiting"
    if state == "not_requested":
        if row["status"] == "rejected":
            return "rejected"
        if row["status"] in ("paid", "pending", "unknown"):
            return "allowed"
    return "unknown"


def statistics_view(
    conn: sqlite3.Connection, agent: sqlite3.Row, now: datetime, period: StatisticsPeriod | None = None
) -> AgentStatistics:
    """Operation paths and paid spending in the mandate's time zone."""
    try:
        zone = ZoneInfo(agent["timezone"])
    except (ValueError, KeyError) as e:
        raise MandateMisconfigured(f"mandate {agent['id']} has an invalid time zone: {e}") from e
    now_utc = now.astimezone(timezone.utc)
    today = now_utc.astimezone(zone).date()
    calendar_days = {"today": 0, "week": 6, "month": 29}.get(period)
    start = today - timedelta(days=calendar_days) if calendar_days is not None else None
    rolling_start = now_utc - timedelta(hours=24)
    days: dict[str, PaymentDay] = {}
    for offset in range(29, -1, -1):
        day = (today - timedelta(days=offset)).isoformat()
        days[day] = {"date": day, "amount_kopecks": 0, "count": 0}
    hours: list[PaymentHour] = [{"hour": hour, "amount_kopecks": 0, "count": 0} for hour in range(24)]
    rolling_hours: list[RollingPaymentHour] = [
        {
            "start": (rolling_start + timedelta(hours=hour)).isoformat().replace("+00:00", "Z"),
            "end": (rolling_start + timedelta(hours=hour + 1)).isoformat().replace("+00:00", "Z"),
            "amount_kopecks": 0,
            "count": 0,
        }
        for hour in range(24)
    ]
    categories: dict[str | None, PaymentCategory] = {}
    largest: list[Operation] = []
    payees: set[str] = set()
    amount = count = 0
    operations_count = 0
    flows: OperationFlows = {"allowed": 0, "rejected": 0, "cancelled": 0, "approved": 0, "awaiting": 0, "unknown": 0}
    for row in db.agent_transactions(conn, agent["client_id"], agent["agent_id"]):
        created = datetime.fromisoformat(row["created_at"]).astimezone(timezone.utc)
        if period is not None and created > now_utc:
            continue
        local = created.astimezone(zone)
        selected = (
            (period != "day" or rolling_start <= created <= now_utc)
            and (start is None or start <= local.date() <= today)
        )
        if selected:
            operations_count += 1
            flows[operation_flow(row)] += 1
        if row["status"] != "paid":
            continue
        day = local.date().isoformat()
        if day in days:
            days[day]["amount_kopecks"] += row["amount_kopecks"]
            days[day]["count"] += 1
        if local.date() == today:
            hours[local.hour]["amount_kopecks"] += row["amount_kopecks"]
            hours[local.hour]["count"] += 1
        if rolling_start <= created <= now_utc:
            hour = min((created - rolling_start) // timedelta(hours=1), 23)
            rolling_hours[hour]["amount_kopecks"] += row["amount_kopecks"]
            rolling_hours[hour]["count"] += 1
        if not selected:
            continue
        amount += row["amount_kopecks"]
        count += 1
        payees.add(row["payee_inn"])
        category = categories.setdefault(
            row["category"], {"category": row["category"], "amount_kopecks": 0, "count": 0}
        )
        category["amount_kopecks"] += row["amount_kopecks"]
        category["count"] += 1
        largest.append(operation_view(row))
        largest.sort(key=lambda op: (op["amount_kopecks"], op["created_at"], op["id"]), reverse=True)
        del largest[3:]
    current = days[today.isoformat()]
    month = list(days.values())
    return {
        "period": period,
        "timezone": agent["timezone"],
        "today": {"amount_kopecks": current["amount_kopecks"], "count": current["count"]},
        "total": {
            "amount_kopecks": amount,
            "count": count,
            "average_kopecks": (amount + count // 2) // count if count else 0,  # nearest kopeck, halves up
            "payees": len(payees),
        },
        "operations_count": operations_count,
        "success_rate": ((count * 1000 + operations_count // 2) // operations_count) / 10 if operations_count else None,
        "flows": flows,
        "days": month[-7:],
        "month": month,
        "hours": hours,
        "rolling_hours": rolling_hours,
        "categories": sorted(categories.values(), key=lambda c: (-c["amount_kopecks"], c["category"] or "")),
        "largest": largest,
    }


def check_agent_name(name: str) -> str:
    name = name.strip()
    if not name or len(name) > MAX_AGENT_NAME:
        raise InvalidRequest(f"agent name must be 1 to {MAX_AGENT_NAME} characters, got {name!r}")
    return name


def settings_from(change: AgentChange, mandate: sqlite3.Row) -> dict[str, object]:
    """Checks the change and turns it into mandate columns. Rejects a change that would break the mandate."""
    settings: dict[str, object] = {}
    if change.paused is not None:
        settings["paused"] = int(change.paused)
    if change.any_counterparty is not None:
        settings["any_counterparty"] = int(change.any_counterparty)
    if change.any_time is not None:
        settings["any_time"] = int(change.any_time)
    if change.any_amount is not None:
        settings["any_amount"] = int(change.any_amount)
    if change.approval is not None:
        if change.approval not in ("auto", "manual"):
            raise InvalidRequest(f"approval must be 'auto' or 'manual', got {change.approval!r}")
        settings["approval"] = change.approval
    if change.category_mode is not None:
        if change.category_mode not in ("any", "only", "except"):
            raise InvalidRequest(f"category_mode must be 'any', 'only' or 'except', got {change.category_mode!r}")
        settings["category_mode"] = change.category_mode
    for field in ("allowed_categories", "blocked_categories"):
        value = getattr(change, field)
        if value is not None:
            unknown = [c for c in value if c not in db.CATEGORIES]
            if unknown:
                raise InvalidRequest(f"category must be one of {db.CATEGORIES}, got {unknown}")
            settings[field] = ",".join(c for c in db.CATEGORIES if c in value)  # keeps the list order

    if change.working_days is not None:
        days = [d for d in rules.WEEKDAYS if d in change.working_days]  # keeps the week order
        if not days or len(days) != len(set(change.working_days)):
            raise InvalidRequest(f"working_days must be one or more of {rules.WEEKDAYS}, got {change.working_days}")
        settings["working_days"] = ",".join(days)
    for field in ("working_from", "working_to"):
        value = getattr(change, field)
        if value is not None:
            try:
                if not re.fullmatch(r"[0-9]{2}:[0-9]{2}", value):
                    raise ValueError("expected HH:MM")
                settings[field] = time.fromisoformat(value).strftime("%H:%M")
            except ValueError as e:
                raise InvalidRequest(f"{field} must be a time like '09:00', got {value!r}") from e
    working_from = settings.get("working_from", mandate["working_from"])
    working_to = settings.get("working_to", mandate["working_to"])
    if working_from >= working_to:
        raise InvalidRequest(f"working hours must start before they end, got {working_from}-{working_to}")

    for name in PERIODS:
        value = getattr(change, f"max_{name}")
        if value is not None:
            # an empty day, week or month limit: none for that period
            settings[f"max_{name}_kopecks"] = None if value == "" and name != "payment" else to_kopecks(value)
    limits = [settings.get(f"max_{name}_kopecks", mandate[f"max_{name}_kopecks"]) for name in PERIODS]
    limits = [limit for limit in limits if limit is not None]
    if limits != sorted(limits):
        raise InvalidRequest("limits must grow: per payment <= day <= week <= month")
    return settings


def apply_change(conn: sqlite3.Connection, client_id: int, agent_id: int, change: AgentChange) -> None:
    """Checks and writes a change of the agent; the caller commits."""
    agent = agent_of(conn, client_id, agent_id)
    settings = settings_from(change, agent)
    if change.name is not None:
        db.rename_agent(conn, agent_id, check_agent_name(change.name))
    if change.icon is not None:
        if change.icon not in db.AGENT_ICONS:
            raise InvalidRequest(f"icon must be one of {db.AGENT_ICONS}, got {change.icon!r}")
        db.set_agent_icon(conn, agent_id, change.icon)
    db.update_mandate(conn, agent["id"], settings)


@app.get("/api/clients/{client_id}/agents")
def get_agents(client_id: int) -> list[Agent]:
    with open_db() as conn:
        return [agent_view(conn, a) for a in db.client_agents(conn, client_id)]


@app.post("/api/clients/{client_id}/agents")
def add_agent(client_id: int, new: NewAgent) -> Agent:
    """A new agent without a key: the default mandate with the given settings. A wrong setting creates nothing."""
    name = check_agent_name(new.name)
    with open_db() as conn:
        if conn.execute("SELECT 1 FROM clients WHERE id = ?", (client_id,)).fetchone() is None:
            raise HTTPException(404, f"client {client_id} not found")
        agent_id = db.create_agent(conn, client_id, name)
        # an exception below leaves nothing: the commit comes last
        apply_change(conn, client_id, agent_id, new)
        mandate_id = agent_of(conn, client_id, agent_id)["id"]
        for payee in new.payees:  # the list the agent may pay; checked like add_counterparty
            check_inn(payee.inn)
            row = db.find_counterparty(conn, payee.inn) or db.get_or_create_counterparty(conn, payee.inn, check_payee(payee.name))
            db.allow_counterparty(conn, mandate_id, row["id"])
        conn.commit()
        return agent_view(conn, agent_of(conn, client_id, agent_id))


@app.get("/api/clients/{client_id}/agents/{agent_id}")
def get_agent(client_id: int, agent_id: int) -> Agent:
    with open_db() as conn:
        return agent_view(conn, agent_of(conn, client_id, agent_id))


@app.get("/api/clients/{client_id}/agents/{agent_id}/statistics")
def get_agent_statistics(
    client_id: int, agent_id: int, period: StatisticsPeriod | None = None
) -> AgentStatistics:
    """One read-only snapshot of all paid operations; no bank calls or database initialization."""
    with closing(db.connect(read_only=True)) as conn:
        conn.execute("BEGIN")
        return statistics_view(conn, agent_of(conn, client_id, agent_id), datetime.now(timezone.utc), period)


@app.patch("/api/clients/{client_id}/agents/{agent_id}")
def change_agent(client_id: int, agent_id: int, change: AgentChange) -> Agent:
    with open_db() as conn:
        # Validate and save against the same settings, including concurrent limit changes.
        conn.execute("BEGIN IMMEDIATE")
        apply_change(conn, client_id, agent_id, change)
        conn.commit()
        return agent_view(conn, agent_of(conn, client_id, agent_id))


@app.post("/api/clients/{client_id}/agents/{agent_id}/key")
def new_agent_key(client_id: int, agent_id: int) -> NewKey:
    """Creates the agent's key, or replaces it: the old key stops working at once. The key is shown only here."""
    key, key_hash, hint = keys.new_key()
    with open_db() as conn:
        agent_of(conn, client_id, agent_id)
        db.set_agent_secret(conn, agent_id, key_hash, hint)
        conn.commit()
    return {"key": key, "hint": hint}


@app.delete("/api/clients/{client_id}/agents/{agent_id}", status_code=204)
def delete_agent(client_id: int, agent_id: int) -> Response:
    """Deletes the agent: its key stops working at once, its payments stay in the history."""
    with open_db() as conn:
        agent_of(conn, client_id, agent_id)
        db.delete_agent(conn, agent_id)
        conn.commit()
    return Response(status_code=204)


@app.get("/api/clients/{client_id}/operations")
def get_operations(client_id: int, agent_id: int | None = None, limit: int = 50) -> list[Operation]:
    with open_db() as conn:
        rows = db.client_transactions(conn, client_id, min(max(limit, 1), MAX_FEED), agent_id)
    return [operation_view(r) for r in rows]


@app.post("/api/clients/{client_id}/operations/{operation_id}/check")
def check_operation(client_id: int, operation_id: str) -> Operation:
    """Asks the bank again about an unknown operation, like the agent's get_payment_status."""
    with open_db() as conn:
        row = db.find_transaction(conn, client_id, operation_id)
        if row is None:
            raise HTTPException(404, f"operation {operation_id!r} not found for client {client_id}")
        refresh(conn, row)
        return operation_view(db.find_transaction(conn, client_id, operation_id))


@app.post("/api/clients/{client_id}/operations/{operation_id}/approve")
def approve_operation(client_id: int, operation_id: str) -> Operation:
    """The client approves an awaiting payment: it goes to the bank without checking the rules again."""
    decide(client_id, operation_id, approve=True)
    with open_db() as conn:
        return operation_view(db.find_transaction(conn, client_id, operation_id))


@app.post("/api/clients/{client_id}/operations/{operation_id}/decline")
def decline_operation(client_id: int, operation_id: str) -> Operation:
    """The client declines an awaiting payment: it is rejected."""
    decide(client_id, operation_id, approve=False)
    with open_db() as conn:
        return operation_view(db.find_transaction(conn, client_id, operation_id))


@app.get("/api/clients/{client_id}/agents/{agent_id}/counterparties")
def get_counterparties(client_id: int, agent_id: int) -> list[ListedCounterparty]:
    """Whom the agent may pay, plus whom it has already paid."""
    with open_db() as conn:
        rows = db.mandate_counterparties(conn, agent_of(conn, client_id, agent_id)["id"])
    return [{"inn": r["inn"], "name": r["name"], "allowed": bool(r["allowed"])} for r in rows]


@app.get("/api/counterparties/{inn}")
def find_counterparty(inn: str) -> Counterparty:
    """Exact INN only: the directory is shared, so it is never listed or searched by name."""
    check_inn(inn)
    with open_db() as conn:
        row = db.find_counterparty(conn, inn)
    if row is None:
        raise HTTPException(404, f"INN {inn} is not in the directory")
    return {"inn": row["inn"], "name": row["name"]}


@app.post("/api/clients/{client_id}/agents/{agent_id}/counterparties")
def add_counterparty(client_id: int, agent_id: int, new: NewCounterparty) -> Counterparty:
    """A known INN keeps the directory name; the name in the request is used only for a new INN."""
    check_inn(new.inn)
    with open_db() as conn:
        conn.execute("BEGIN IMMEDIATE")  # another request may be adding the same INN
        agent = agent_of(conn, client_id, agent_id)
        row = db.find_counterparty(conn, new.inn)
        if row is None:
            row = db.get_or_create_counterparty(conn, new.inn, check_payee(new.name))
        db.allow_counterparty(conn, agent["id"], row["id"])
        conn.commit()
    return {"inn": row["inn"], "name": row["name"]}


@app.delete("/api/clients/{client_id}/agents/{agent_id}/counterparties/{inn}", status_code=204)
def remove_counterparty(client_id: int, agent_id: int, inn: str) -> Response:
    with open_db() as conn:
        db.disallow_counterparty(conn, agent_of(conn, client_id, agent_id)["id"], inn)
        conn.commit()
    return Response(status_code=204)
