"""SQLite storage: clients, their agents with mandates, counterparties and transactions.

Functions here never commit: the caller decides where a database transaction ends.
"""
import json
import re
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
    max_day_kopecks     INTEGER,          -- empty: no limit for the period
    max_week_kopecks    INTEGER,
    max_month_kopecks   INTEGER,
    paused              INTEGER NOT NULL DEFAULT 0,  -- 1: the client stopped the agent, every payment is rejected
    approval            TEXT    NOT NULL DEFAULT 'auto',  -- auto: the client decides only what breaks the rules; manual: every payment
    category_mode       TEXT    NOT NULL DEFAULT 'any',   -- any | only (allowed_categories) | except (blocked_categories)
    allowed_categories  TEXT    NOT NULL DEFAULT '',      -- "goods,office": one of CATEGORIES each
    blocked_categories  TEXT    NOT NULL DEFAULT '',      -- kept apart: switching the mode loses neither list
    any_time            INTEGER NOT NULL DEFAULT 0,       -- 1: no working hours, the agent may pay at any time
    any_amount          INTEGER NOT NULL DEFAULT 0        -- 1: no amount limits, the stored ones are kept
);
CREATE TABLE IF NOT EXISTS agents (  -- a client's AI agent; each has its own mandate and its own key
    id          INTEGER PRIMARY KEY,
    client_id   INTEGER NOT NULL REFERENCES clients(id),
    mandate_id  INTEGER NOT NULL UNIQUE REFERENCES mandates(id),
    name        TEXT    NOT NULL,         -- "Invoice agent"
    icon        TEXT    NOT NULL DEFAULT 'invoice',  -- one of AGENT_ICONS, chosen by the client
    secret_hash TEXT    UNIQUE,           -- SHA-256 of the agent's key; the key itself is never stored
    secret_hint TEXT,                     -- start and end of the key, "sgk_Ab3x…9QzT", to tell keys apart
    created_at  TEXT    NOT NULL,
    deleted_at  TEXT                      -- when the client deleted the agent; its payments stay in the history
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
    category        TEXT,                 -- as the agent stated it; empty in older rows
    status          TEXT    NOT NULL,     -- awaiting | pending | paid | rejected | unknown (the bank did not answer)
    reason          TEXT,                 -- why rejected or unknown
    created_at      TEXT    NOT NULL      -- UTC, "2026-10-21T14:52:43Z"
);
"""


Status = Literal["awaiting", "pending", "paid", "rejected", "unknown"]  # awaiting: the client approves or declines


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
    category: str | None
    status: Status
    reason: str | None
    created_at: str


def now_utc() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def connect(*, read_only: bool = False) -> sqlite3.Connection:
    """Opens the database file; read_only never creates or changes it."""
    if read_only:
        conn = sqlite3.connect(f"{DB.resolve().as_uri()}?mode=ro", uri=True)
    else:
        DB.parent.mkdir(exist_ok=True)
        conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


# Columns added after the first release: an older database gets them on open.
ADDED_COLUMNS = {
    "mandates": {
        "paused": "INTEGER NOT NULL DEFAULT 0",
        "approval": "TEXT NOT NULL DEFAULT 'auto'",
        "category_mode": "TEXT NOT NULL DEFAULT 'any'",
        "allowed_categories": "TEXT NOT NULL DEFAULT ''",
        "blocked_categories": "TEXT NOT NULL DEFAULT ''",
        "any_time": "INTEGER NOT NULL DEFAULT 0",
        "any_amount": "INTEGER NOT NULL DEFAULT 0",
    },
    "transactions": {"category": "TEXT"},
    "agents": {"icon": "TEXT NOT NULL DEFAULT 'invoice'", "deleted_at": "TEXT"},
}
DEFAULT_AGENT_NAME = "Invoice agent"
# Pictures the app can draw for an agent.
AGENT_ICONS = ["invoice", "cart", "plane", "truck", "briefcase", "building", "card", "bank"]
# What a payment is for: the agent names one with each payment.
CATEGORIES = ["goods", "office", "it", "marketing", "rent", "transport", "travel", "services", "taxes", "entertainment"]
# The agent's settings joined with its mandate: rules read the mandate columns, `id` is the mandate id.
AGENT_SELECT = (
    "SELECT m.*, a.id AS agent_id, a.name AS agent_name, a.icon AS agent_icon, a.secret_hint,"
    " a.created_at AS agent_created_at"
    " FROM agents a JOIN mandates m ON m.id = a.mandate_id"
)
# What the client may change in a mandate; anything else is never written from outside.
MANDATE_SETTINGS = {
    "working_days",
    "working_from",
    "working_to",
    "any_time",
    "any_amount",
    "any_counterparty",
    "max_payment_kopecks",
    "max_day_kopecks",
    "max_week_kopecks",
    "max_month_kopecks",
    "paused",
    "approval",
    "category_mode",
    "allowed_categories",
    "blocked_categories",
}


def make_limits_optional(conn: sqlite3.Connection) -> None:
    """An older database required every limit: rebuilds `mandates` so day, week and month may be empty."""
    if not required_limits(conn):
        return
    conn.execute("PRAGMA foreign_keys = OFF")  # works only outside a transaction
    try:
        conn.execute("BEGIN IMMEDIATE")
        columns = required_limits(conn)
        if columns:
            table = re.search(r"CREATE TABLE IF NOT EXISTS mandates \(.*?\n\);", SCHEMA, re.S).group(0)
            conn.execute(table.replace("CREATE TABLE IF NOT EXISTS mandates", "CREATE TABLE mandates_new"))
            names = ", ".join(columns)
            conn.execute(f"INSERT INTO mandates_new ({names}) SELECT {names} FROM mandates")  # rows keep their ids, so agents and payments still point to them
            conn.execute("DROP TABLE mandates")
            conn.execute("ALTER TABLE mandates_new RENAME TO mandates")
            if conn.execute("PRAGMA foreign_key_check").fetchone():
                raise RuntimeError("mandates rebuild broke a foreign key")
        conn.commit()
    except BaseException:
        conn.rollback()
        raise
    finally:
        conn.execute("PRAGMA foreign_keys = ON")


def required_limits(conn: sqlite3.Connection) -> list[str]:
    """The columns of `mandates` while its day limit is still NOT NULL, otherwise nothing."""
    rows = conn.execute("PRAGMA table_info(mandates)").fetchall()
    return [row["name"] for row in rows] if any(row["name"] == "max_day_kopecks" and row["notnull"] for row in rows) else []


def create_tables_and_demo_client(conn: sqlite3.Connection) -> None:
    """Initializes the database atomically; the caller must commit before using it."""
    make_limits_optional(conn)  # an older database needs this before anything else
    conn.execute("BEGIN IMMEDIATE")
    # executescript would commit first and release the initialization lock.
    statement = ""
    for line in SCHEMA.splitlines(keepends=True):
        statement += line
        if sqlite3.complete_statement(statement):
            conn.execute(statement)
            statement = ""
    for table, columns in ADDED_COLUMNS.items():
        existing = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
        for column, definition in columns.items():
            if column not in existing:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
    for mandate in conn.execute(  # an older database had mandates without agents
        "SELECT id, client_id FROM mandates WHERE id NOT IN (SELECT mandate_id FROM agents)"
    ).fetchall():
        insert_agent_row(conn, mandate["client_id"], mandate["id"], DEFAULT_AGENT_NAME)
    if conn.execute("SELECT COUNT(*) FROM clients").fetchone()[0] == 0:
        insert_demo_client(conn)


def insert_demo_client(conn: sqlite3.Connection) -> None:
    """One client with one agent; its mandate comes from rules.example.json."""
    rules = json.loads(DEFAULT_MANDATE.read_text(encoding="utf-8"))
    conn.execute(
        "INSERT INTO clients (id, name, created_at) VALUES (?, ?, ?)",
        (rules["client_id"], "Demo company", now_utc()),
    )
    create_agent(conn, rules["client_id"], DEFAULT_AGENT_NAME)


def create_agent(conn: sqlite3.Connection, client_id: int, name: str) -> int:
    """A new agent without a key, with the default mandate from rules.example.json. Returns the agent id."""
    mandate_id = insert_default_mandate(conn, client_id)
    return insert_agent_row(conn, client_id, mandate_id, name)


def insert_agent_row(conn: sqlite3.Connection, client_id: int, mandate_id: int, name: str) -> int:
    return conn.execute(
        "INSERT INTO agents (client_id, mandate_id, name, created_at) VALUES (?, ?, ?, ?)",
        (client_id, mandate_id, name, now_utc()),
    ).lastrowid


def insert_default_mandate(conn: sqlite3.Connection, client_id: int) -> int:
    rules = json.loads(DEFAULT_MANDATE.read_text(encoding="utf-8"))
    hours = rules["working_hours"]
    allowed = rules["allowed_counterparties"]
    cur = conn.execute(
        "INSERT INTO mandates (client_id, timezone, working_days, working_from, working_to,"
        " any_counterparty, max_payment_kopecks, max_day_kopecks, max_week_kopecks, max_month_kopecks)"
        " VALUES (:client_id, :timezone, :working_days, :working_from, :working_to,"
        " :any_counterparty, :max_payment_kopecks, :max_day_kopecks, :max_week_kopecks, :max_month_kopecks)",
        {
            "client_id": client_id,
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
    return cur.lastrowid


def client_agents(conn: sqlite3.Connection, client_id: int) -> list[sqlite3.Row]:
    return conn.execute(f"{AGENT_SELECT} WHERE a.client_id = ? AND a.deleted_at IS NULL ORDER BY a.id", (client_id,)).fetchall()


def find_agent(conn: sqlite3.Connection, client_id: int, agent_id: int) -> sqlite3.Row | None:
    """The agent if it belongs to the client."""
    return conn.execute(f"{AGENT_SELECT} WHERE a.client_id = ? AND a.id = ? AND a.deleted_at IS NULL", (client_id, agent_id)).fetchone()


def agent_by_secret_hash(conn: sqlite3.Connection, secret_hash: str) -> sqlite3.Row | None:
    return conn.execute(f"{AGENT_SELECT} WHERE a.secret_hash = ? AND a.deleted_at IS NULL", (secret_hash,)).fetchone()


def set_agent_secret(conn: sqlite3.Connection, agent_id: int, secret_hash: str, secret_hint: str) -> None:
    """Replaces the agent's key: the old one stops working at once."""
    conn.execute(
        "UPDATE agents SET secret_hash = ?, secret_hint = ? WHERE id = ?",
        (secret_hash, secret_hint, agent_id),
    )


def delete_agent(conn: sqlite3.Connection, agent_id: int) -> None:
    """Takes the agent off the list and turns its key off. The row stays: the payment history refers to it."""
    conn.execute(
        "UPDATE agents SET deleted_at = ?, secret_hash = NULL, secret_hint = NULL WHERE id = ?",
        (now_utc(), agent_id),
    )
    conn.execute(  # nobody is left to approve them for
        "UPDATE transactions SET status = 'rejected', reason = 'the agent was deleted'"
        " WHERE status = 'awaiting' AND mandate_id = (SELECT mandate_id FROM agents WHERE id = ?)",
        (agent_id,),
    )


def rename_agent(conn: sqlite3.Connection, agent_id: int, name: str) -> None:
    conn.execute("UPDATE agents SET name = ? WHERE id = ?", (name, agent_id))


def set_agent_icon(conn: sqlite3.Connection, agent_id: int, icon: str) -> None:
    conn.execute("UPDATE agents SET icon = ? WHERE id = ?", (icon, agent_id))


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


def mandate_counterparties(conn: sqlite3.Connection, mandate_id: int) -> list[sqlite3.Row]:
    """Whom the mandate may pay, plus whom it has already paid. `allowed` tells them apart."""
    return conn.execute(
        "SELECT c.inn, c.name,"
        " EXISTS (SELECT 1 FROM mandate_counterparties mc"
        "         WHERE mc.mandate_id = :mandate_id AND mc.counterparty_id = c.id) AS allowed"
        " FROM counterparties c"
        " WHERE c.id IN (SELECT counterparty_id FROM mandate_counterparties WHERE mandate_id = :mandate_id)"
        "    OR c.id IN (SELECT counterparty_id FROM transactions WHERE mandate_id = :mandate_id AND status = 'paid')"
        " ORDER BY c.name",
        {"mandate_id": mandate_id},
    ).fetchall()


def allow_counterparty(conn: sqlite3.Connection, mandate_id: int, counterparty_id: int) -> None:
    conn.execute(
        "INSERT OR IGNORE INTO mandate_counterparties (mandate_id, counterparty_id) VALUES (?, ?)",
        (mandate_id, counterparty_id),
    )


def disallow_counterparty(conn: sqlite3.Connection, mandate_id: int, inn: str) -> None:
    """Removes the counterparty from the mandate's list; the directory keeps it."""
    conn.execute(
        "DELETE FROM mandate_counterparties"
        " WHERE mandate_id = ? AND counterparty_id = (SELECT id FROM counterparties WHERE inn = ?)",
        (mandate_id, inn),
    )


def update_mandate(conn: sqlite3.Connection, mandate_id: int, settings: dict[str, object]) -> None:
    """Writes the given mandate settings; names come from MANDATE_SETTINGS only."""
    unknown = set(settings) - MANDATE_SETTINGS
    if unknown:
        raise ValueError(f"not a mandate setting: {sorted(unknown)}")
    if settings:
        assignments = ", ".join(f"{name} = :{name}" for name in settings)
        conn.execute(f"UPDATE mandates SET {assignments} WHERE id = :id", {**settings, "id": mandate_id})


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
        " amount_kopecks, currency, category, status, reason, created_at)"
        " VALUES (:id, :mandate_id, :counterparty_id, :payee, :payee_inn, :bank_id,"
        " :amount_kopecks, :currency, :category, :status, :reason, :created_at)",
        transaction,
    )


def update_transaction_status(conn: sqlite3.Connection, transaction: Transaction) -> None:
    conn.execute(
        "UPDATE transactions SET bank_id = :bank_id, status = :status, reason = :reason WHERE id = :id",
        transaction,
    )


# A transaction with the agent that made it.
TRANSACTION_SELECT = (
    "SELECT t.*, a.id AS agent_id, a.name AS agent_name"
    " FROM transactions t JOIN agents a ON a.mandate_id = t.mandate_id"
)


def find_transaction(conn: sqlite3.Connection, client_id: int, transaction_id: str) -> sqlite3.Row | None:
    """The transaction if it belongs to the client: one client never sees another's operations."""
    return conn.execute(
        f"{TRANSACTION_SELECT} WHERE t.id = ? AND a.client_id = ?", (transaction_id, client_id)
    ).fetchone()


def find_mandate_transaction(conn: sqlite3.Connection, mandate_id: int, transaction_id: str) -> sqlite3.Row | None:
    """The transaction if it was made under this mandate: an agent sees only its own operations."""
    return conn.execute(
        f"{TRANSACTION_SELECT} WHERE t.id = ? AND t.mandate_id = ?", (transaction_id, mandate_id)
    ).fetchone()


def client_transactions(
    conn: sqlite3.Connection, client_id: int, limit: int, agent_id: int | None = None
) -> list[sqlite3.Row]:
    """The client's latest operations, newest first; only one agent's when `agent_id` is given."""
    return conn.execute(
        f"{TRANSACTION_SELECT} WHERE a.client_id = ? AND (? IS NULL OR a.id = ?) ORDER BY t.id DESC LIMIT ?",
        (client_id, agent_id, agent_id, limit),
    ).fetchall()


def paid_agent_transactions(conn: sqlite3.Connection, client_id: int, agent_id: int) -> sqlite3.Cursor:
    """Streams every paid operation of this client's agent, without a feed limit."""
    return conn.execute(
        f"{TRANSACTION_SELECT} WHERE a.client_id = ? AND a.id = ? AND t.status = 'paid'",
        (client_id, agent_id),
    )
