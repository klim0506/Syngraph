"""Syngraph MCP server: the entry point for AI agents."""
from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError

from core import InvalidRequest, MandateMisconfigured, PaymentResult, get_status, pay

mcp = MCPServer("Syngraph")


@mcp.tool()
def pay_invoice(client_id: int, payee: str, payee_inn: str, amount: str) -> PaymentResult:
    """Pay a supplier invoice in Russian rubles.

    client_id: the Syngraph client (company) the agent pays for.
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
        return pay(client_id, payee, payee_inn, amount)
    except InvalidRequest as e:  # the agent can fix the request
        raise ToolError(str(e)) from e
    except MandateMisconfigured as e:  # only the client can fix it; any other error is our failure
        raise ToolError(f"the client's mandate is misconfigured, ask the client to fix it: {e}") from e


@mcp.tool()
def get_payment_status(client_id: int, operation_id: str) -> PaymentResult:
    """Get the status of an operation returned by pay_invoice.

    client_id: the Syngraph client (company) the agent pays for.
    operation_id: the "id" from the pay_invoice response.
    Returns the same fields as pay_invoice. For an "unknown" operation Syngraph asks the bank again:
    "paid" if the bank made it, "rejected" if the bank never received it (pay again with a new
    pay_invoice), still "unknown" if the bank does not answer (ask again later).
    """
    try:
        return get_status(client_id, operation_id)
    except InvalidRequest as e:
        raise ToolError(str(e)) from e


if __name__ == "__main__":
    mcp.run()
