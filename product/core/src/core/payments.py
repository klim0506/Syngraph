"""Paying an invoice: check the mandate -> record the transaction -> send to the bank -> update its status."""
import re
import sqlite3
from datetime import datetime, timezone
from typing import NotRequired, TypedDict, cast

from uuid6 import uuid7

from . import bank, db, rules
from .errors import BankUnconfirmed, InvalidRequest
from .money import CURRENCY, to_kopecks

MAX_PAYEE = 160  # the payee field of a Russian payment order holds 160 characters
UNCONFIRMED = (
    "the bank did not confirm the payment: it may have gone through, do not pay again, check the operation status"
)
NOT_RECEIVED = "the bank has no such payment: it was not made"


class PaymentResult(TypedDict):
    id: str  # Syngraph operation id
    status: db.Status
    payee: str  # the name sent to the bank
    reason: NotRequired[str]  # why rejected or unknown


def pay(client_id: int, payee: str, payee_inn: str, amount: str) -> PaymentResult:
    kopecks = to_kopecks(amount)
    payee = check_payee(payee)
    check_inn(payee_inn)
    now = datetime.now(timezone.utc)

    conn = db.connect()
    try:
        db.create_tables_and_demo_client(conn)
        mandate = db.first_mandate(conn, client_id)
        if mandate is None:
            raise InvalidRequest(f"client {client_id} not found or has no mandate")
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
            "status": "pending",
            "reason": None,
            "created_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        }
        transaction["reason"] = rules.check(conn, mandate, counterparty["id"], payee_inn, kopecks, now)
        if transaction["reason"]:
            transaction["status"] = "rejected"
        db.insert_transaction(conn, transaction)
        conn.commit()  # saved before the bank is called, so a lost answer leaves a trace

        if transaction["status"] == "pending":
            try:
                reply = bank.send_payment(
                    transaction["id"], transaction["payee"], transaction["payee_inn"], kopecks, CURRENCY
                )
                transaction["bank_id"] = reply["id"]
                transaction["status"] = reply["status"]
            except BankUnconfirmed:
                transaction["status"] = "unknown"
                transaction["reason"] = UNCONFIRMED
            db.update_transaction_status(conn, transaction)
            conn.commit()
    finally:
        conn.close()
    return to_result(transaction)


def get_status(client_id: int, operation_id: str) -> PaymentResult:
    """The operation from the journal. An unknown one is asked again from the bank first."""
    conn = db.connect()
    try:
        db.create_tables_and_demo_client(conn)
        row = db.find_transaction(conn, client_id, operation_id)
        if row is None:
            raise InvalidRequest(f"operation {operation_id!r} not found for client {client_id}")
        transaction = cast(db.Transaction, dict(row))
        if transaction["status"] == "unknown" and ask_bank_again(transaction):
            db.update_transaction_status(conn, transaction)
            conn.commit()
    finally:
        conn.close()
    return to_result(transaction)


def ask_bank_again(transaction: db.Transaction) -> bool:
    """Fills in the bank's answer for an unknown payment. False: the bank still does not answer clearly."""
    try:
        reply = bank.get_payment(transaction["id"])
    except BankUnconfirmed:
        return False
    if reply is None:
        transaction["status"], transaction["reason"] = "rejected", NOT_RECEIVED
    else:
        transaction["bank_id"], transaction["status"], transaction["reason"] = reply["id"], reply["status"], None
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
