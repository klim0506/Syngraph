"""Syngraph MCP server: the entry point for software agents.

The agent uses its own key: SYNGRAPH_AGENT_KEY for stdio, or Authorization: Bearer for HTTP.
The key tells Syngraph which agent pays and under which mandate.
"""
import os
from typing import Literal

from mcp.server.mcpserver import Context, MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.server.transport_security import TransportSecuritySettings
from starlette.requests import Request
from starlette.responses import JSONResponse

from core import (
    Available, BankUnavailable, InvalidRequest, Mandate, MandateMisconfigured, Payment, PaymentResult, UnknownAgent,
    get_status, pay,
)
# Under other names: the tools below take these names, the agent sees them.
from core import get_available_balance as get_available_balance_of
from core import get_mandate as get_mandate_of
from core import list_payments as list_payments_of

KEY_VARIABLE = "SYNGRAPH_AGENT_KEY"
# What a payment is for; the same list as core.CATEGORIES, spelled out so the agent sees it in the tool schema.
Category = Literal["goods", "office", "it", "marketing", "rent", "transport", "travel", "services", "taxes", "entertainment"]
Status = Literal["awaiting", "pending", "paid", "rejected", "unknown"]  # the same as core.db.Status
MISCONFIGURED = "the client's mandate is misconfigured, ask the client to fix it"

mcp = MCPServer("Syngraph")


def agent_key(ctx: Context) -> str:
    request = ctx.request_context.request
    if request is None:
        return os.environ.get(KEY_VARIABLE, "").strip()
    scheme, _, key = request.headers.get("authorization", "").partition(" ")
    return key.strip() if scheme.lower() == "bearer" else ""


@mcp.tool()
def pay_invoice(ctx: Context, payee: str, payee_inn: str, amount: str, category: Category) -> PaymentResult:
    """Pay a supplier invoice in Russian rubles under this agent's mandate.

    payee: supplier name as on the invoice, 1 to 160 characters. Used only for a new INN:
        a known INN keeps the name from the Syngraph directory, and that name goes to the bank.
    payee_inn: supplier INN with valid check digits, 10 digits (company) or 12 digits (sole trader).
    amount: rubles as a string with up to 2 decimals, e.g. "245000.00"; at most 10 trillion.
    category: what the invoice is for: goods (goods and raw materials), office (office and supplies),
        it (IT and telecom), marketing, rent, transport (transport and logistics), travel (business trips),
        services (contractors), taxes (taxes and fees), entertainment. The client's rules may allow
        only some categories or forbid some.
    Returns the operation id, status and the payee name sent to the bank.
    Status "awaiting": the payment is outside the client's rules, or the client approves every payment;
    "reason" says why. The client approves or declines it in the Syngraph app: check later with
    get_payment_status, do not pay again.
    Status "rejected": the client's rules or the client refused the payment, "reason" explains why.
    Status "unknown": the bank did not confirm, the payment may have gone through.
    Do not pay this invoice again: check the operation with get_payment_status.
    """
    try:
        return pay(agent_key(ctx), payee, payee_inn, amount, category)
    except (InvalidRequest, UnknownAgent) as e:  # the agent or its developer can fix it
        raise ToolError(str(e)) from e
    except MandateMisconfigured as e:  # only the client can fix it; any other error is our failure
        raise ToolError(f"{MISCONFIGURED}: {e}") from e


@mcp.tool()
def get_payment_status(ctx: Context, operation_id: str) -> PaymentResult:
    """Get the status of one of this agent's operations returned by pay_invoice.

    operation_id: the "id" from the pay_invoice response.
    Returns the same fields as pay_invoice. "awaiting" stays until the client decides: then
    "paid" (or "unknown" if the bank did not confirm) or "rejected". For an "unknown" operation Syngraph asks the bank again:
    "paid" if the bank made it, "rejected" if the bank never received it (pay again with a new
    pay_invoice), still "unknown" if the bank does not answer (ask again later).
    """
    try:
        return get_status(agent_key(ctx), operation_id)
    except (InvalidRequest, UnknownAgent) as e:
        raise ToolError(str(e)) from e


@mcp.tool()
def get_mandate(ctx: Context) -> Mandate:
    """Get this agent's rules as the client set them, to check a payment before pay_invoice.

    Amounts are rubles as strings, e.g. "245000.00". A field that is absent means no such rule.
    paused: true rejects every payment. approval "manual": the client approves every payment.
    working_hours: days ("mon" ... "sun") and "from"-"to" in "timezone"; working_now says if it is now.
    payees: the only INNs the agent may pay. allowed_categories: the only categories it may use;
    blocked_categories: categories it may never use.
    limits: per payment, day, week and month; null: no limit for that period.
    spent: this calendar day, week and month in "timezone": paid, plus sent and not yet confirmed.
    A payment outside working hours, payees, allowed categories or limits waits for the client
    (status "awaiting"); a blocked category or a pause rejects it at once.
    """
    try:
        return get_mandate_of(agent_key(ctx))
    except UnknownAgent as e:
        raise ToolError(str(e)) from e
    except MandateMisconfigured as e:
        raise ToolError(f"{MISCONFIGURED}: {e}") from e


@mcp.tool()
def list_payments(ctx: Context, status: Status | None = None, payee_inn: str | None = None, limit: int = 20) -> list[Payment]:
    """List this agent's own operations, newest first, e.g. to see if an invoice is already paid.

    status: only operations with this status. payee_inn: only payments to this INN.
    limit: how many, 1 to 100.
    Each has the fields of pay_invoice plus created_at (UTC), payee_inn, amount (rubles, e.g.
    "245000.00") and category. Statuses are as stored: for an "unknown" one call get_payment_status.
    """
    try:
        return list_payments_of(agent_key(ctx), status, payee_inn, limit)
    except (InvalidRequest, UnknownAgent) as e:
        raise ToolError(str(e)) from e


@mcp.tool()
def get_available_balance(ctx: Context) -> Available:
    """Get the largest payment this agent can make now: within its amount limits and the client's account balance.

    available: rubles as a string, e.g. "245000.00".
    limited_by: what sets it: "paused" (the client paused the agent, nothing can be paid), "payment",
    "day", "week" or "month" (that limit of the mandate) or "balance" (money on the account).
    A larger payment waits for the client's approval, or the bank rejects it for lack of money.
    Other rules (working hours, payees, categories, manual approval) are in get_mandate.
    """
    try:
        return get_available_balance_of(agent_key(ctx))
    except UnknownAgent as e:
        raise ToolError(str(e)) from e
    except MandateMisconfigured as e:
        raise ToolError(f"{MISCONFIGURED}: {e}") from e
    except BankUnavailable as e:
        raise ToolError(f"the bank did not answer, try again later: {e}") from e


@mcp.custom_route("/health", methods=["GET"], include_in_schema=False)
async def health(request: Request) -> JSONResponse:
    return JSONResponse({"status": "ok"})


def create_http_app():
    """Serve the same tools over HTTP, with a separate bearer key on every call."""
    return mcp.streamable_http_app(
        stateless_http=True,
        json_response=True,
        transport_security=TransportSecuritySettings(
            allowed_hosts=["localhost", "localhost:*", "127.0.0.1", "127.0.0.1:*", "[::1]", "[::1]:*"],
            allowed_origins=["http://localhost", "http://localhost:*", "http://127.0.0.1", "http://127.0.0.1:*", "http://[::1]", "http://[::1]:*"],
        ),
    )


if __name__ == "__main__":
    mcp.run()
