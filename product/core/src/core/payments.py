"""Paying an invoice: find the agent by its key -> check its mandate -> record the transaction
-> send to the bank -> update its status. A payment outside the rules waits for the client's decision.

The agent also reads what is its own: its mandate, its operations and how much it may pay now."""
import re
import sqlite3
from datetime import datetime, timezone
from typing import Literal, NotRequired, TypedDict, cast, get_args

from uuid6 import uuid7

from . import bank, db, keys, rules
from .errors import BankUnconfirmed, InvalidRequest, UnknownAgent
from .money import CURRENCY, to_kopecks, to_rubles

MAX_PAYEE = 160  # the payee field of a Russian payment order holds 160 characters
MAX_LIST = 100  # operations in one list_payments answer
LIMITS = ["payment", "day", "week", "month"]
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


class Payment(PaymentResult):
    """One of the agent's operations; amounts are rubles, like "245000.00"."""
    created_at: str  # UTC, "2026-10-21T14:52:43Z"
    payee_inn: str
    amount: str
    category: str | None  # empty in older operations


# Days "mon" ... "sun", hours "09:00" in the mandate's time zone. "from" is a keyword: no class syntax.
WorkingHours = TypedDict("WorkingHours", {"days": list[str], "from": str, "to": str})


class Payee(TypedDict):
    inn: str
    name: str


class Mandate(TypedDict):
    """What the client allows the agent; amounts are rubles, like "245000.00". An absent field: no such rule."""
    paused: bool  # every payment is rejected
    approval: Literal["auto", "manual"]  # manual: the client approves every payment
    timezone: str
    working_hours: NotRequired[WorkingHours]
    working_now: bool
    payees: NotRequired[list[Payee]]
    allowed_categories: NotRequired[list[str]]
    blocked_categories: NotRequired[list[str]]
    limits: NotRequired[dict[str, str | None]]  # per payment, day, week, month; None: no limit for the period
    spent: dict[str, str]  # this day, week, month: paid, plus sent and not confirmed


class Available(TypedDict):
    available: str  # rubles, like "245000.00"
    limited_by: Literal["paused", "payment", "day", "week", "month", "balance"]


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
        transaction["approval_state"] = "awaiting" if verdict == "ask" else "not_requested"
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
        transaction["approval_state"] = "approved" if approve else "declined"
        db.set_approval_decision(conn, operation_id, transaction["approval_state"])
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


def get_mandate(agent_key: str) -> Mandate:
    """The agent's own rules, as the client set them, with what it has spent in each period."""
    conn = db.connect()
    try:
        db.create_tables_and_demo_client(conn)
        conn.commit()
        mandate = agent_by_key(conn, agent_key)
        now = datetime.now(timezone.utc)
        result: Mandate = {
            "paused": bool(mandate["paused"]),
            "approval": mandate["approval"],
            "timezone": mandate["timezone"],
            "working_now": rules.is_working_time(mandate, now),
            "spent": {name: to_rubles(k) for name, k in rules.spent_by_period(conn, mandate, now).items()},
        }
        if not mandate["any_time"]:
            result["working_hours"] = {
                "days": mandate["working_days"].split(","),
                "from": mandate["working_from"],
                "to": mandate["working_to"],
            }
        if not mandate["any_counterparty"]:
            result["payees"] = [
                {"inn": row["inn"], "name": row["name"]}
                for row in db.mandate_counterparties(conn, mandate["id"]) if row["allowed"]
            ]
        if mandate["category_mode"] == "only":
            result["allowed_categories"] = [c for c in mandate["allowed_categories"].split(",") if c]
        elif mandate["category_mode"] == "except":
            result["blocked_categories"] = [c for c in mandate["blocked_categories"].split(",") if c]
        if not mandate["any_amount"]:
            result["limits"] = {
                name: None if mandate[f"max_{name}_kopecks"] is None else to_rubles(mandate[f"max_{name}_kopecks"])
                for name in LIMITS
            }
        return result
    finally:
        conn.close()


def list_payments(
    agent_key: str, status: str | None = None, payee_inn: str | None = None, limit: int = 20
) -> list[Payment]:
    """The agent's own operations, newest first, as stored: an unknown one is not asked from the bank here."""
    if status is not None and status not in get_args(db.Status):
        raise InvalidRequest(f"status must be one of {get_args(db.Status)}, got {status!r}")
    if not 1 <= limit <= MAX_LIST:
        raise InvalidRequest(f"limit must be 1 to {MAX_LIST}, got {limit}")
    conn = db.connect()
    try:
        db.create_tables_and_demo_client(conn)
        conn.commit()
        mandate = agent_by_key(conn, agent_key)
        rows = db.mandate_transactions(conn, mandate["id"], limit, status, payee_inn)
    finally:
        conn.close()
    payments: list[Payment] = []
    for row in rows:
        payment: Payment = {
            "id": row["id"],
            "created_at": row["created_at"],
            "payee": row["payee"],
            "payee_inn": row["payee_inn"],
            "amount": to_rubles(row["amount_kopecks"]),
            "category": row["category"],
            "status": row["status"],
        }
        if row["reason"]:
            payment["reason"] = row["reason"]
        payments.append(payment)
    return payments


def get_available_balance(agent_key: str) -> Available:
    """The largest payment that fits the agent's amount limits and the client's account balance now."""
    conn = db.connect()
    try:
        db.create_tables_and_demo_client(conn)
        conn.commit()
        mandate = agent_by_key(conn, agent_key)
        if mandate["paused"]:
            return {"available": to_rubles(0), "limited_by": "paused"}
        room: dict[str, int] = {}
        if not mandate["any_amount"]:
            room["payment"] = mandate["max_payment_kopecks"]
            for name, spent in rules.spent_by_period(conn, mandate, datetime.now(timezone.utc)).items():
                limit = mandate[f"max_{name}_kopecks"]
                if limit is not None:
                    room[name] = max(limit - spent, 0)
        client_id = mandate["client_id"]
    finally:
        conn.close()
    room["balance"] = max(bank.get_balance(client_id), 0)  # the client's account has the client's id
    limited_by = min(room, key=room.__getitem__)  # on a tie the first: limits before the balance
    return {"available": to_rubles(room[limited_by]), "limited_by": limited_by}


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
