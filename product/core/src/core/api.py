"""Core HTTP API for client-app: the client's agents, each with its own mandate, key, payees and payments.

No sign-in yet: the client id comes in the path, so the API must listen on 127.0.0.1 only.
"""
import re
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime, time, timezone
from typing import TypedDict

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from . import db, keys, rules
from .errors import InvalidRequest, MandateMisconfigured
from .money import to_kopecks
from .payments import check_inn, check_payee, refresh

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
    timezone: str
    working_days: list[str]  # "mon" ... "sun"
    working_from: str  # "09:00"
    working_to: str
    working_now: bool  # the agent may pay at this moment by the clock
    limits: dict[str, int]  # kopecks per payment, day, week, month
    spent: dict[str, int]  # kopecks in the current day, week, month: paid, pending and unknown


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
    status: db.Status
    reason: str | None


class NewAgent(BaseModel):
    name: str


class AgentChange(BaseModel):
    """Only the fields to change. Limits are rubles as strings, like "100000.00"."""
    name: str | None = None
    icon: str | None = None
    paused: bool | None = None
    any_counterparty: bool | None = None
    working_days: list[str] | None = None
    working_from: str | None = None
    working_to: str | None = None
    max_payment: str | None = None
    max_day: str | None = None
    max_week: str | None = None
    max_month: str | None = None


class NewCounterparty(BaseModel):
    inn: str
    name: str = ""  # needed only for an INN the directory does not know


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
        "timezone": agent["timezone"],
        "working_days": agent["working_days"].split(","),
        "working_from": agent["working_from"],
        "working_to": agent["working_to"],
        "working_now": rules.is_working_time(agent, now),
        "limits": {name: agent[f"max_{name}_kopecks"] for name in PERIODS},
        "spent": rules.spent_by_period(conn, agent, now),
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
        "status": row["status"],
        "reason": row["reason"],
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
            settings[f"max_{name}_kopecks"] = to_kopecks(value)
    limits = [settings.get(f"max_{name}_kopecks", mandate[f"max_{name}_kopecks"]) for name in PERIODS]
    if limits != sorted(limits):
        raise InvalidRequest("limits must grow: per payment <= day <= week <= month")
    return settings


@app.get("/api/clients/{client_id}/agents")
def get_agents(client_id: int) -> list[Agent]:
    with open_db() as conn:
        return [agent_view(conn, a) for a in db.client_agents(conn, client_id)]


@app.post("/api/clients/{client_id}/agents")
def add_agent(client_id: int, new: NewAgent) -> Agent:
    """A new agent with the default mandate and no key yet."""
    name = check_agent_name(new.name)
    with open_db() as conn:
        if conn.execute("SELECT 1 FROM clients WHERE id = ?", (client_id,)).fetchone() is None:
            raise HTTPException(404, f"client {client_id} not found")
        agent_id = db.create_agent(conn, client_id, name)
        conn.commit()
        return agent_view(conn, agent_of(conn, client_id, agent_id))


@app.get("/api/clients/{client_id}/agents/{agent_id}")
def get_agent(client_id: int, agent_id: int) -> Agent:
    with open_db() as conn:
        return agent_view(conn, agent_of(conn, client_id, agent_id))


@app.patch("/api/clients/{client_id}/agents/{agent_id}")
def change_agent(client_id: int, agent_id: int, change: AgentChange) -> Agent:
    with open_db() as conn:
        # Validate and save against the same settings, including concurrent limit changes.
        conn.execute("BEGIN IMMEDIATE")
        agent = agent_of(conn, client_id, agent_id)
        settings = settings_from(change, agent)
        if change.name is not None:
            db.rename_agent(conn, agent_id, check_agent_name(change.name))
        if change.icon is not None:
            if change.icon not in db.AGENT_ICONS:
                raise InvalidRequest(f"icon must be one of {db.AGENT_ICONS}, got {change.icon!r}")
            db.set_agent_icon(conn, agent_id, change.icon)
        db.update_mandate(conn, agent["id"], settings)
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
