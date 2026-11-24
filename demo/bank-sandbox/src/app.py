"""Bank sandbox for account balances and asynchronous payment orders.

SQLite stores orders before execution and commits each debit with its terminal status.
The payer's external identifier lets the caller recover the status and safely retry.
"""
import asyncio
import json
import logging
import sqlite3
from contextlib import asynccontextmanager, closing
from pathlib import Path
from time import time
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from pydantic import AliasChoices, BaseModel, Field, JsonValue, model_validator

DB = Path(__file__).resolve().parents[1] / "data" / "bank.db"
DEMO_ACCOUNT = 1
DEMO_BALANCE_KOPECKS = 100_000_000  # 1 000 000 ₽
PAYMENT_DELAY_SECONDS = 1
POLL_SECONDS = 0.2
BANK_STATUS = {"pending": "ACCEPTED", "paid": "IMPLEMENTED", "rejected": "REFUSEDBYBANK"}

SCHEMA = """
CREATE TABLE IF NOT EXISTS accounts (
    id              INTEGER PRIMARY KEY,  -- the Syngraph client id
    balance_kopecks INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS payments (
    operation_id   TEXT    PRIMARY KEY,  -- the payer's own id: repeating it does not pay again
    id             TEXT    NOT NULL,     -- the bank's payment id
    account_id     INTEGER NOT NULL,
    payee          TEXT    NOT NULL,
    payee_inn      TEXT    NOT NULL,
    amount_kopecks INTEGER NOT NULL,
    currency       TEXT    NOT NULL,
    status         TEXT    NOT NULL,     -- pending | paid | rejected
    reason         TEXT,                 -- why rejected
    payment_order  TEXT,                 -- optional snapshot from the caller
    due_at         REAL                  -- Unix time when settlement may begin
);
"""


class PaymentOrder(BaseModel):
    operation_id: str = Field(min_length=1, validation_alias=AliasChoices("operation_id", "externalId"))
    account: int  # the payer's account
    payee: str
    payee_inn: str
    amount_kopecks: int = Field(gt=0)
    currency: str
    payment_order: dict[str, JsonValue] | None = None

    @model_validator(mode="before")
    @classmethod
    def validate_identifier(cls, order: object) -> object:
        if (
            isinstance(order, dict)
            and {"operation_id", "externalId"} <= order.keys()
            and order["operation_id"] != order["externalId"]
        ):
            raise ValueError("operation_id and externalId must match")
        return order


class Deposit(BaseModel):
    amount_kopecks: int = Field(gt=0)


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB, isolation_level=None)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    DB.parent.mkdir(exist_ok=True)
    with closing(connect()) as conn, conn:
        conn.executescript(SCHEMA)
        conn.execute("BEGIN IMMEDIATE")
        columns = {column["name"] for column in conn.execute("PRAGMA table_info(payments)")}
        if "payment_order" not in columns:
            conn.execute("ALTER TABLE payments ADD COLUMN payment_order TEXT")
        if "due_at" not in columns:
            conn.execute("ALTER TABLE payments ADD COLUMN due_at REAL")
        conn.execute("CREATE INDEX IF NOT EXISTS payments_due_idx ON payments (due_at) WHERE status = 'pending'")
        conn.execute(
            "INSERT INTO accounts (id, balance_kopecks) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM accounts)",
            (DEMO_ACCOUNT, DEMO_BALANCE_KOPECKS),
        )


def settle_due_payments() -> None:
    due_at = time()
    due = "FROM payments WHERE status = 'pending' AND due_at <= ?"
    with closing(connect()) as conn, conn:
        if conn.execute(f"SELECT 1 {due} LIMIT 1", (due_at,)).fetchone() is None:
            return

        # Acquire the write lock before selecting work so multiple workers cannot debit an order twice.
        conn.execute("BEGIN IMMEDIATE")
        payments = conn.execute(f"SELECT * {due} ORDER BY due_at, rowid LIMIT 100", (due_at,)).fetchall()
        for payment in payments:
            account = conn.execute(
                "SELECT balance_kopecks FROM accounts WHERE id = ?", (payment["account_id"],)
            ).fetchone()
            status, reason = "paid", None
            if account is None:
                status, reason = "rejected", "no such account"
            elif account["balance_kopecks"] < payment["amount_kopecks"]:
                status, reason = "rejected", "insufficient funds"
            else:
                conn.execute(
                    "UPDATE accounts SET balance_kopecks = balance_kopecks - ? WHERE id = ?",
                    (payment["amount_kopecks"], payment["account_id"]),
                )
            conn.execute(
                "UPDATE payments SET status = ?, reason = ? WHERE operation_id = ?",
                (status, reason, payment["operation_id"]),
            )


async def settle_payments(stop: asyncio.Event) -> None:
    while not stop.is_set():
        try:
            await asyncio.to_thread(settle_due_payments)
        except sqlite3.Error:
            logging.getLogger(__name__).exception("Payment settlement failed")
        try:
            await asyncio.wait_for(stop.wait(), timeout=POLL_SECONDS)
        except TimeoutError:
            continue


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await asyncio.to_thread(init_db)
    stop = asyncio.Event()
    worker = asyncio.create_task(settle_payments(stop))
    try:
        yield
    finally:
        stop.set()
        await worker


app = FastAPI(title="Bank sandbox", lifespan=lifespan)


def to_reply(payment: sqlite3.Row) -> dict:
    status = payment["status"]
    reply = {
        "id": payment["id"],
        "externalId": payment["operation_id"],
        "status": status,
        "bankStatus": BANK_STATUS[status],
    }
    if payment["reason"]:
        reply["reason"] = payment["reason"]
    return reply


@app.post("/pay")
def pay(order: PaymentOrder) -> dict:
    snapshot = None
    if order.payment_order is not None:
        snapshot = json.dumps(order.payment_order, sort_keys=True, separators=(",", ":"))
    details = (order.account, order.payee, order.payee_inn, order.amount_kopecks, order.currency, snapshot)
    with closing(connect()) as conn, conn:
        conn.execute("BEGIN IMMEDIATE")
        payment = conn.execute("SELECT * FROM payments WHERE operation_id = ?", (order.operation_id,)).fetchone()
        if payment is not None:
            fields = ("account_id", "payee", "payee_inn", "amount_kopecks", "currency", "payment_order")
            if tuple(payment[field] for field in fields) != details:
                raise HTTPException(409, "this externalId is already in use for a different payment")
            return to_reply(payment)
        payment = conn.execute(
            "INSERT INTO payments (operation_id, id, account_id, payee, payee_inn, amount_kopecks, "
            "currency, payment_order, status, due_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?) RETURNING *",
            (order.operation_id, str(uuid4()), *details, time() + PAYMENT_DELAY_SECONDS),
        ).fetchone()
        return to_reply(payment)


@app.get("/payments/{external_id}")
@app.get("/payments/{external_id}/state")
def get_payment(external_id: str) -> dict:
    with closing(connect()) as conn:
        payment = conn.execute("SELECT * FROM payments WHERE operation_id = ?", (external_id,)).fetchone()
    if payment is None:
        raise HTTPException(404, "no payment with this externalId")
    return to_reply(payment)


@app.get("/accounts/{account_id}")
def get_account(account_id: int) -> dict:
    conn = connect()
    try:
        account = conn.execute("SELECT * FROM accounts WHERE id = ?", (account_id,)).fetchone()
    finally:
        conn.close()
    if account is None:
        raise HTTPException(404, "no such account")
    return dict(account)


@app.post("/accounts/{account_id}/deposit")
def deposit(account_id: int, money: Deposit) -> dict:
    """Adds money to the account; an unknown account is opened."""
    conn = connect()
    try:
        conn.execute(
            "INSERT INTO accounts (id, balance_kopecks) VALUES (?, ?)"
            " ON CONFLICT (id) DO UPDATE SET balance_kopecks = balance_kopecks + excluded.balance_kopecks",
            (account_id, money.amount_kopecks),
        )
        return dict(conn.execute("SELECT * FROM accounts WHERE id = ?", (account_id,)).fetchone())
    finally:
        conn.close()
