"""Syngraph MCP server: the entry point for AI agents.

The agent connects with its own key, created in the Syngraph app: SYNGRAPH_AGENT_KEY in the
environment of this server. The key tells Syngraph which agent pays and under which mandate.
"""
import os

from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError

from core import InvalidRequest, MandateMisconfigured, PaymentResult, UnknownAgent, get_status, pay

KEY_VARIABLE = "SYNGRAPH_AGENT_KEY"

mcp = MCPServer("Syngraph")


def agent_key() -> str:
    return os.environ.get(KEY_VARIABLE, "").strip()


@mcp.tool()
def pay_invoice(payee: str, payee_inn: str, amount: str) -> PaymentResult:
    """Pay a supplier invoice in Russian rubles under this agent's mandate.

    payee: supplier name as on the invoice, 1 to 160 characters. Used only for a new INN:
        a known INN keeps the name from the Syngraph directory, and that name goes to the bank.
    payee_inn: supplier INN with valid check digits, 10 digits (company) or 12 digits (sole trader).
    amount: rubles as a string with up to 2 decimals, e.g. "245000.00"; at most 10 trillion.
    Returns the operation id, status and the payee name sent to the bank.
    Status "rejected": the client's rules refused the payment, "reason" explains why.
    Status "unknown": the bank did not confirm, the payment may have gone through.
    Do not pay this invoice again: check the operation with get_payment_status.
    """
    try:
        return pay(agent_key(), payee, payee_inn, amount)
    except (InvalidRequest, UnknownAgent) as e:  # the agent or its developer can fix it
        raise ToolError(str(e)) from e
    except MandateMisconfigured as e:  # only the client can fix it; any other error is our failure
        raise ToolError(f"the client's mandate is misconfigured, ask the client to fix it: {e}") from e


@mcp.tool()
def get_payment_status(operation_id: str) -> PaymentResult:
    """Get the status of one of this agent's operations returned by pay_invoice.

    operation_id: the "id" from the pay_invoice response.
    Returns the same fields as pay_invoice. For an "unknown" operation Syngraph asks the bank again:
    "paid" if the bank made it, "rejected" if the bank never received it (pay again with a new
    pay_invoice), still "unknown" if the bank does not answer (ask again later).
    """
    try:
        return get_status(agent_key(), operation_id)
    except (InvalidRequest, UnknownAgent) as e:
        raise ToolError(str(e)) from e


if __name__ == "__main__":
    mcp.run()
