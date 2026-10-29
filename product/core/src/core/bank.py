"""Connection to the client's bank. Today it is the bank sandbox; real banks get their own adapters later.

Every order carries the Syngraph operation id: the bank does not pay the same id twice
and answers its status by that id, so a lost answer can be asked again.
"""
import os
from typing import Literal, NotRequired, TypedDict

import httpx

from .errors import BankUnconfirmed

BANK_URL = os.environ.get("BANK_URL", "http://127.0.0.1:8001")


class BankReply(TypedDict):
    id: str
    status: Literal["paid", "rejected"]
    reason: NotRequired[str]  # why the bank rejected it


def send_payment(
    operation_id: str, account: int, payee: str, payee_inn: str, kopecks: int, currency: str
) -> BankReply:
    """Sends a payment order from the client's account. Raises BankUnconfirmed if the bank does not answer clearly."""
    order = {
        "operation_id": operation_id,
        "account": account,
        "payee": payee,
        "payee_inn": payee_inn,
        "amount_kopecks": kopecks,
        "currency": currency,
    }
    try:
        response = httpx.post(f"{BANK_URL}/pay", json=order)
        response.raise_for_status()
        return read_reply(response)
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as e:  # no answer, an error or an unreadable one
        raise BankUnconfirmed(str(e)) from e


def get_payment(operation_id: str) -> BankReply | None:
    """Asks the bank about an order it may have received. None: the bank has no such order.
    Raises BankUnconfirmed if the bank does not answer clearly."""
    try:
        response = httpx.get(f"{BANK_URL}/payments/{operation_id}")
        if response.status_code == 404:
            return None
        response.raise_for_status()
        return read_reply(response)
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as e:
        raise BankUnconfirmed(str(e)) from e


def read_reply(response: httpx.Response) -> BankReply:
    reply = response.json()
    bank_id, status = reply["id"], reply["status"]
    if not isinstance(bank_id, str) or not bank_id.strip():
        raise ValueError("bank payment id must be a non-empty string")
    if status == "paid":
        return {"id": bank_id, "status": status}
    if status == "rejected":
        reason = reply["reason"]
        if not isinstance(reason, str) or not reason.strip():
            raise ValueError("a rejected bank payment must have a reason")
        return {"id": bank_id, "status": status, "reason": reason}
    raise ValueError(f"unexpected bank status {status!r}")
