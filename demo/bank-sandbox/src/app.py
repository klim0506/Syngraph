"""Bank sandbox: accepts a payment order and confirms it right away.

Payments are kept in memory by the payer's operation id: the same id is never paid twice,
and its status can be asked again. A restart forgets them.
"""
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="Bank sandbox")
payments: dict[str, dict] = {}  # operation_id -> {"id", "status"}


class PaymentOrder(BaseModel):
    operation_id: str  # the payer's own id: repeating it does not pay again
    payee: str
    payee_inn: str
    amount_kopecks: int
    currency: str


@app.post("/pay")
def pay(order: PaymentOrder) -> dict:
    if order.operation_id not in payments:
        payments[order.operation_id] = {"id": str(uuid4()), "status": "paid"}
    return payments[order.operation_id]


@app.get("/payments/{operation_id}")
def get_payment(operation_id: str) -> dict:
    if operation_id not in payments:
        raise HTTPException(404, "no payment with this operation id")
    return payments[operation_id]
