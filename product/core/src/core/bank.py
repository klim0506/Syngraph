"""Connection to the client's bank. Today it is the bank sandbox; real banks get their own adapters later.

Every order carries the Syngraph operation id: the bank does not pay the same id twice
and answers its status by that id, so a lost answer can be asked again.
"""
import os
from typing import Literal, TypedDict

import httpx

from .errors import BankUnconfirmed

BANK_URL = os.environ.get("BANK_URL", "http://127.0.0.1:8001")


class BankReply(TypedDict):
    id: str
    status: Literal["paid"]


def send_payment(operation_id: str, payee: str, payee_inn: str, kopecks: int, currency: str) -> BankReply:
    """Sends a payment order. Raises BankUnconfirmed if the bank does not confirm it."""
    order = {
        "operation_id": operation_id,
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
    if status != "paid":
        raise ValueError(f"unexpected bank status {status!r}")
    return {"id": bank_id, "status": status}
