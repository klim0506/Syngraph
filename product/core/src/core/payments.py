"""Paying an invoice: find the agent by its key -> check its mandate -> record the transaction
-> send to the bank -> update its status. A payment outside the rules waits for the client's decision."""
import re
import sqlite3
from datetime import datetime, timezone
from typing import NotRequired, TypedDict, cast

from uuid6 import uuid7

from . import bank, db, keys, rules
from .errors import BankUnconfirmed, InvalidRequest, UnknownAgent
from .money import CURRENCY, to_kopecks

MAX_PAYEE = 160  # the payee field of a Russian payment order holds 160 characters
UNCONFIRMED = (
    "the bank did not confirm the payment: it may have gone through, do not pay again, check the operation status"
)
NOT_RECEIVED = "the bank has no such payment: it was not made"
DECLINED = "declined by the client"


class PaymentResult(TypedDict):
    id: str  # Syngraph operation id
    status: db.Status
    payee: str  # the name sent to the bank
    reason: NotRequired[str]  # why rejected, unknown or awaiting the client


def pay(agent_key: str, payee: str, payee_inn: str, amount: str, category: str) -> PaymentResult:
    kopecks = to_kopecks(amount)
    payee = check_payee(payee)
    check_inn(payee_inn)
    check_category(category)
    conn = db.connect()
    try:
        db.create_tables_and_demo_client(conn)
        conn.commit()
        # Check the current mandate and reserve its limits in one write transaction.
        conn.execute("BEGIN IMMEDIATE")
        now = datetime.now(timezone.utc)
        mandate = agent_by_key(conn, agent_key)
        # A known INN keeps the directory name: the bank and the journal get the same details.
        counterparty = db.get_or_create_counterparty(conn, payee_inn, payee)
        transaction: db.Transaction = {
            "id": str(uuid7()),
            "mandate_id": mandate["id"],
            "counterparty_id": counterparty["id"],
            "payee": counterparty["name"],
            "payee_inn": counterparty["inn"],
            "bank_id": None,
            "amount_kopecks": kopecks,
            "currency": CURRENCY,
            "category": category,
            "status": "pending",
            "reason": None,
            "created_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        }
        verdict, transaction["reason"] = rules.check(conn, mandate, counterparty["id"], payee_inn, category, kopecks, now)
        transaction["status"] = {"pass": "pending", "ask": "awaiting", "reject": "rejected"}[verdict]
        db.insert_transaction(conn, transaction)
        conn.commit()  # saved before the bank is called, so a lost answer leaves a trace

        if transaction["status"] == "pending":
            send(conn, transaction, mandate["client_id"])
    finally:
        conn.close()
    return to_result(transaction)


def decide(client_id: int, operation_id: str, approve: bool) -> db.Transaction:
    """The client's decision on an awaiting payment: approved goes to the bank as is, declined is rejected."""
    conn = db.connect()
    try:
        db.create_tables_and_demo_client(conn)
        conn.commit()
        conn.execute("BEGIN IMMEDIATE")  # one decision per payment, even with two taps
        row = db.find_transaction(conn, client_id, operation_id)
        if row is None:
            raise InvalidRequest(f"operation {operation_id!r} not found for client {client_id}")
        if row["status"] != "awaiting":
            raise InvalidRequest(f"operation {operation_id} is not awaiting approval, it is {row['status']}")
        transaction = cast(db.Transaction, {k: row[k] for k in db.Transaction.__annotations__})
        transaction["status"], transaction["reason"] = ("pending", None) if approve else ("rejected", DECLINED)
        db.update_transaction_status(conn, transaction)
        conn.commit()  # recorded before the bank is called, as in pay()
        if approve:
            send(conn, transaction, client_id)
        return transaction
    finally:
        conn.close()


def send(conn: sqlite3.Connection, transaction: db.Transaction, client_id: int) -> None:
    """Sends a recorded pending payment to the bank and saves the answer."""
    try:
        reply = bank.send_payment(
            transaction["id"], client_id, transaction["payee"], transaction["payee_inn"],
            transaction["amount_kopecks"], transaction["currency"],
        )
        transaction["bank_id"] = reply["id"]
        transaction["status"] = reply["status"]
        transaction["reason"] = reply.get("reason")
    except BankUnconfirmed:
        transaction["status"] = "unknown"
        transaction["reason"] = UNCONFIRMED
    db.update_transaction_status(conn, transaction)
    conn.commit()


def get_status(agent_key: str, operation_id: str) -> PaymentResult:
    """One of the agent's own operations. An unknown one is asked again from the bank first."""
    conn = db.connect()
    try:
        db.create_tables_and_demo_client(conn)
        conn.commit()
        agent = agent_by_key(conn, agent_key)
        row = db.find_mandate_transaction(conn, agent["id"], operation_id)
        if row is None:
            raise InvalidRequest(f"operation {operation_id!r} not found for this agent")
        return to_result(refresh(conn, row))
    finally:
        conn.close()


def agent_by_key(conn: sqlite3.Connection, agent_key: str) -> sqlite3.Row:
    """The agent with its mandate; `id` is the mandate id."""
    agent = db.agent_by_secret_hash(conn, keys.hash_key(agent_key)) if agent_key else None
    if agent is None:
        raise UnknownAgent("the agent key is missing or not valid: create a key in the Syngraph app")
    return agent


def refresh(conn: sqlite3.Connection, row: sqlite3.Row) -> db.Transaction:
    """The transaction; an unknown one is asked again from the bank and saved if the bank answers."""
    transaction = cast(db.Transaction, dict(row))
    if transaction["status"] == "unknown" and ask_bank_again(transaction):
        db.update_transaction_status(conn, transaction)
        conn.commit()
    return transaction


def ask_bank_again(transaction: db.Transaction) -> bool:
    """Fills in the bank's answer for an unknown payment. False: the bank still does not answer clearly."""
    try:
        reply = bank.get_payment(transaction["id"])
    except BankUnconfirmed:
        return False
    if reply is None:
        transaction["status"], transaction["reason"] = "rejected", NOT_RECEIVED
    else:
        transaction["bank_id"], transaction["status"] = reply["id"], reply["status"]
        transaction["reason"] = reply.get("reason")
    return True


def to_result(transaction: db.Transaction | sqlite3.Row) -> PaymentResult:
    result: PaymentResult = {
        "id": transaction["id"],
        "status": transaction["status"],
        "payee": transaction["payee"],
    }
    if transaction["reason"]:
        result["reason"] = transaction["reason"]
    return result


def check_payee(payee: str) -> str:
    payee = payee.strip()
    if not payee or len(payee) > MAX_PAYEE:
        raise InvalidRequest(f"payee name must be 1 to {MAX_PAYEE} characters, got {payee!r}")
    return payee


def check_category(category: str) -> None:
    if category not in db.CATEGORIES:
        raise InvalidRequest(f"category must be one of {db.CATEGORIES}, got {category!r}")


def check_inn(inn: str) -> None:
    """10 digits (company) or 12 digits (sole trader) with valid check digits."""
    if not re.fullmatch(r"[0-9]{10}|[0-9]{12}", inn) or not inn_checksum_ok(inn):
        raise InvalidRequest(
            f"INN must be valid: 10 digits (company) or 12 digits (sole trader), got {inn!r}"
        )


def inn_checksum_ok(inn: str) -> bool:
    def check_digit(weights: list[int]) -> str:
        return str(sum(int(d) * w for d, w in zip(inn, weights)) % 11 % 10)

    if len(inn) == 10:
        return inn[9] == check_digit([2, 4, 10, 3, 5, 9, 4, 6, 8])
    return (
        inn[10] == check_digit([7, 2, 4, 10, 3, 5, 9, 4, 6, 8])
        and inn[11] == check_digit([3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8])
    )
