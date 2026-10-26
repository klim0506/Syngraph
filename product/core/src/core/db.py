"""SQLite storage: clients, their mandates, counterparties and transactions.

Functions here never commit: the caller decides where a database transaction ends.
"""
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, TypedDict

ROOT = Path(__file__).resolve().parents[2]
DB = ROOT / "data" / "syngraph.db"
DEFAULT_MANDATE = ROOT / "rules.example.json"

SCHEMA = """
CREATE TABLE IF NOT EXISTS clients (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,            -- "ООО Ромашка"
    created_at TEXT NOT NULL             -- UTC
);
CREATE TABLE IF NOT EXISTS mandates (
    id                  INTEGER PRIMARY KEY,
    client_id           INTEGER NOT NULL REFERENCES clients(id),  -- a client may have several
    timezone            TEXT    NOT NULL,
    working_days        TEXT    NOT NULL,  -- "mon,tue,wed,thu,fri"
    working_from        TEXT    NOT NULL,  -- "09:00"
    working_to          TEXT    NOT NULL,  -- "19:00"
    any_counterparty    INTEGER NOT NULL,  -- 1: any, 0: only mandate_counterparties
    max_payment_kopecks INTEGER NOT NULL,
    max_day_kopecks     INTEGER NOT NULL,
    max_week_kopecks    INTEGER NOT NULL,
    max_month_kopecks   INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS counterparties (  -- shared by all clients: one row per organisation
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    inn        TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS mandate_counterparties (  -- whom a mandate may pay
    mandate_id      INTEGER NOT NULL REFERENCES mandates(id),
    counterparty_id INTEGER NOT NULL REFERENCES counterparties(id),
    PRIMARY KEY (mandate_id, counterparty_id)
);
CREATE TABLE IF NOT EXISTS transactions (
    id              TEXT    PRIMARY KEY,  -- UUID v7, issued by Syngraph
    mandate_id      INTEGER NOT NULL REFERENCES mandates(id),
    counterparty_id INTEGER NOT NULL REFERENCES counterparties(id),
    payee           TEXT    NOT NULL,     -- details exactly as sent to the bank
    payee_inn       TEXT    NOT NULL,
    bank_id         TEXT,                 -- empty when the bank was not called or did not answer
    amount_kopecks  INTEGER NOT NULL,
    currency        TEXT    NOT NULL,
    status          TEXT    NOT NULL,     -- pending | paid | rejected | unknown (the bank did not answer)
    reason          TEXT,                 -- why rejected or unknown
    created_at      TEXT    NOT NULL      -- UTC, "2026-10-21T14:52:43Z"
);
"""


Status = Literal["pending", "paid", "rejected", "unknown"]


class Transaction(TypedDict):
    """A row of the transactions table."""
    id: str
    mandate_id: int
    counterparty_id: int
    payee: str
    payee_inn: str
    bank_id: str | None
    amount_kopecks: int
    currency: str
    status: Status
    reason: str | None
    created_at: str


def now_utc() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def connect() -> sqlite3.Connection:
    """Opens the database file. Creates nothing."""
    DB.parent.mkdir(exist_ok=True)
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def create_tables_and_demo_client(conn: sqlite3.Connection) -> None:
    """Creates missing tables; an empty database gets one client with a mandate from rules.example.json."""
    conn.executescript(SCHEMA)
    if conn.execute("SELECT COUNT(*) FROM clients").fetchone()[0] == 0:
        insert_demo_client(conn)


def insert_demo_client(conn: sqlite3.Connection) -> None:
    rules = json.loads(DEFAULT_MANDATE.read_text(encoding="utf-8"))
    conn.execute(
        "INSERT INTO clients (id, name, created_at) VALUES (?, ?, ?)",
        (rules["client_id"], "Demo company", now_utc()),
    )
    hours = rules["working_hours"]
    allowed = rules["allowed_counterparties"]
    cur = conn.execute(
        "INSERT INTO mandates (client_id, timezone, working_days, working_from, working_to,"
        " any_counterparty, max_payment_kopecks, max_day_kopecks, max_week_kopecks, max_month_kopecks)"
        " VALUES (:client_id, :timezone, :working_days, :working_from, :working_to,"
        " :any_counterparty, :max_payment_kopecks, :max_day_kopecks, :max_week_kopecks, :max_month_kopecks)",
        {
            "client_id": rules["client_id"],
            "timezone": rules["timezone"],
            "working_days": ",".join(hours["days"]),
            "working_from": hours["from"],
            "working_to": hours["to"],
            "any_counterparty": int(allowed == "any"),
            "max_payment_kopecks": rules["max_payment_kopecks"],
            "max_day_kopecks": rules["max_day_kopecks"],
            "max_week_kopecks": rules["max_week_kopecks"],
            "max_month_kopecks": rules["max_month_kopecks"],
        },
    )
    if allowed != "any":
        for c in allowed:
            counterparty = get_or_create_counterparty(conn, c["inn"], c["name"])
            conn.execute(
                "INSERT INTO mandate_counterparties (mandate_id, counterparty_id) VALUES (?, ?)",
                (cur.lastrowid, counterparty["id"]),
            )


def first_mandate(conn: sqlite3.Connection, client_id: int) -> sqlite3.Row | None:
    """The client's first mandate; choosing between a client's mandates comes with agents."""
    return conn.execute(
        "SELECT * FROM mandates WHERE client_id = ? ORDER BY id LIMIT 1", (client_id,)
    ).fetchone()


def find_counterparty(conn: sqlite3.Connection, inn: str) -> sqlite3.Row | None:
    return conn.execute("SELECT id, name, inn FROM counterparties WHERE inn = ?", (inn,)).fetchone()


def get_or_create_counterparty(conn: sqlite3.Connection, inn: str, name: str) -> sqlite3.Row:
    """Finds the counterparty by INN or inserts it with the given name. A known INN keeps its stored name."""
    row = find_counterparty(conn, inn)
    if row is None:
        conn.execute(
            "INSERT INTO counterparties (name, inn, created_at) VALUES (?, ?, ?)",
            (name, inn, now_utc()),
        )
        row = find_counterparty(conn, inn)
    return row


def is_allowed(conn: sqlite3.Connection, mandate_id: int, counterparty_id: int) -> bool:
    row = conn.execute(
        "SELECT 1 FROM mandate_counterparties WHERE mandate_id = ? AND counterparty_id = ?",
        (mandate_id, counterparty_id),
    ).fetchone()
    return row is not None


def spent_since(conn: sqlite3.Connection, mandate_id: int, since_utc: str) -> int:
    """Total under the mandate since `since_utc` ("...Z"): paid, plus sent and not confirmed, which may be paid."""
    row = conn.execute(
        "SELECT COALESCE(SUM(amount_kopecks), 0) FROM transactions"
        " WHERE mandate_id = ? AND status IN ('paid', 'pending', 'unknown') AND created_at >= ?",
        (mandate_id, since_utc),
    )
    return row.fetchone()[0]


def insert_transaction(conn: sqlite3.Connection, transaction: Transaction) -> None:
    conn.execute(
        "INSERT INTO transactions (id, mandate_id, counterparty_id, payee, payee_inn, bank_id,"
        " amount_kopecks, currency, status, reason, created_at)"
        " VALUES (:id, :mandate_id, :counterparty_id, :payee, :payee_inn, :bank_id,"
        " :amount_kopecks, :currency, :status, :reason, :created_at)",
        transaction,
    )


def update_transaction_status(conn: sqlite3.Connection, transaction: Transaction) -> None:
    conn.execute(
        "UPDATE transactions SET bank_id = :bank_id, status = :status, reason = :reason WHERE id = :id",
        transaction,
    )


def find_transaction(conn: sqlite3.Connection, client_id: int, transaction_id: str) -> sqlite3.Row | None:
    """The transaction if it belongs to the client: one client never sees another's operations."""
    return conn.execute(
        "SELECT t.* FROM transactions t JOIN mandates m ON m.id = t.mandate_id"
        " WHERE t.id = ? AND m.client_id = ?",
        (transaction_id, client_id),
    ).fetchone()
