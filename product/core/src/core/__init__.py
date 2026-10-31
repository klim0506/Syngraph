"""Syngraph core: checks an agent's mandate, sends the payment to the bank and records the operation."""
from .db import CATEGORIES
from .errors import BankUnavailable, InvalidRequest, MandateMisconfigured, UnknownAgent
from .payments import (
    Available, Mandate, Payment, PaymentResult, get_available_balance, get_mandate, get_status, list_payments, pay,
)

__all__ = [
    "CATEGORIES", "Available", "BankUnavailable", "InvalidRequest", "Mandate", "MandateMisconfigured", "Payment",
    "PaymentResult", "UnknownAgent", "get_available_balance", "get_mandate", "get_status", "list_payments", "pay",
]
