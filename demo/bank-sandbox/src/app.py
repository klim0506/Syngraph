"""Bank sandbox: keeps account balances and debits them for payment orders.

Accounts and payments live in SQLite (data/bank.db). A payment is paid if the account holds
enough money, otherwise rejected. The same operation id is never paid twice, and its status
can be asked again. An empty database gets the demo client's account 1 with a starting balance.
"""
import sqlite3
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

DB = Path(__file__).resolve().parents[1] / "data" / "bank.db"
DEMO_ACCOUNT = 1
DEMO_BALANCE_KOPECKS = 100_000_000  # 1 000 000 ₽

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
    status         TEXT    NOT NULL,     -- paid | rejected
    reason         TEXT                  -- why rejected
);
"""

app = FastAPI(title="Bank sandbox")


class PaymentOrder(BaseModel):
    operation_id: str
    account: int  # the payer's account
    payee: str
    payee_inn: str
    amount_kopecks: int = Field(gt=0)
    currency: str


class Deposit(BaseModel):
    amount_kopecks: int = Field(gt=0)


def connect() -> sqlite3.Connection:
    """A connection with the tables in place; transactions are opened explicitly."""
    DB.parent.mkdir(exist_ok=True)
    conn = sqlite3.connect(DB, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    conn.execute(
        "INSERT INTO accounts (id, balance_kopecks) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM accounts)",
        (DEMO_ACCOUNT, DEMO_BALANCE_KOPECKS),
    )
    return conn


def to_reply(payment: sqlite3.Row) -> dict:
    reply = {"id": payment["id"], "status": payment["status"]}
    if payment["reason"]:
        reply["reason"] = payment["reason"]
    return reply


@app.post("/pay")
def pay(order: PaymentOrder) -> dict:
    conn = connect()
    try:
        # Check the balance and debit it in one write transaction.
        conn.execute("BEGIN IMMEDIATE")
        payment = conn.execute("SELECT * FROM payments WHERE operation_id = ?", (order.operation_id,)).fetchone()
        if payment is None:
            account = conn.execute("SELECT * FROM accounts WHERE id = ?", (order.account,)).fetchone()
            status, reason = "paid", None
            if account is None:
                status, reason = "rejected", "no such account"
            elif account["balance_kopecks"] < order.amount_kopecks:
                status, reason = "rejected", "insufficient funds"
            else:
                conn.execute(
                    "UPDATE accounts SET balance_kopecks = balance_kopecks - ? WHERE id = ?",
                    (order.amount_kopecks, order.account),
                )
            conn.execute(
                "INSERT INTO payments VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (order.operation_id, str(uuid4()), order.account, order.payee, order.payee_inn,
                 order.amount_kopecks, order.currency, status, reason),
            )
            payment = conn.execute("SELECT * FROM payments WHERE operation_id = ?", (order.operation_id,)).fetchone()
        conn.execute("COMMIT")
        return to_reply(payment)
    finally:
        conn.close()


@app.get("/payments/{operation_id}")
def get_payment(operation_id: str) -> dict:
    conn = connect()
    try:
        payment = conn.execute("SELECT * FROM payments WHERE operation_id = ?", (operation_id,)).fetchone()
    finally:
        conn.close()
    if payment is None:
        raise HTTPException(404, "no payment with this operation id")
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
