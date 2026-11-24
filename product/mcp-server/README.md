# mcp-server

The Syngraph MCP server — the entry point for software agents.

Accepts agent calls, finds the agent by its key and forwards the request to `core`. It makes no decisions itself.

The agent connects with its own key, created in the client app: `SYNGRAPH_AGENT_KEY` in the environment of this server. Every call is checked against that agent's mandate; without a valid key the tools refuse.

Tools now:

| Tool | What it does |
|---|---|
| `pay_invoice(payee, payee_inn, amount, category, idempotency_key=None, payment_order=None)` | Submits an invoice payment. A payment that needs approval stays `awaiting` until the client decides. |
| `get_payment_status(operation_id)` | Gets the current status. For `pending` and `unknown`, Syngraph checks the bank by `externalId` (the operation ID). |
| `get_mandate()` | The agent's rules: pause, approval mode, working hours, payees, categories, limits, and what it has spent this day, week and month. |
| `list_payments(status, payee_inn, limit)` | The agent's own operations, newest first, filtered by status or payee INN. |
| `get_available_balance()` | The largest payment the agent can make now within its amount limits and the account balance, and what sets it. |

MCP function descriptions live here. Generating `developer-docs/` and `sdk-python/` types from them is planned.

### Payment order details

Pass `payment_order` to add the recipient's bank details and purpose. The tool schema lists the optional payer details, VAT, budget fields and `vo_code`. Example:

```json
{
  "payee_account": "40702810600100001212",
  "payee_bank_bic": "044525225",
  "payee_bank_corr_account": "30101810400000000225",
  "payee_kpp": "770701001",
  "purpose": "Оплата по счёту № 123. НДС не облагается."
}
```

The amount at the top level includes VAT. Use `vat` with `type`, `rate` and `amount` for a single rate. For multiple rates send `vat: null` and describe them in `purpose`. The `budget` object accepts KBK, OKTMO, UIP/UIN and related tax fields. With `vo_code`, Syngraph inserts the matching `{VO12345}` prefix and validates the resulting 210-character limit. The recipient INN still follows the existing validation rules.

Syngraph stores the details before approval and submits the saved version. Payer document fields describe the order. Syngraph selects the debit account from the agent's client. The compact demo request without `payment_order` remains supported.

### Retrying a payment

Generate and save a key for the payment before the first call, for example a UUID. A key can contain 1–128 ASCII letters, digits, or `. _ : -`. After a timeout or a lost reply, retry with the same key and payment details. Syngraph returns the original operation ID and its stored status, without sending another order to the bank. This applies across restarts and after the agent's access key is replaced.

Changing the payee, INN, amount, category or order details under the same key returns a tool error. The comparison trims the payee name and compares amounts in kopecks, so amounts such as `"125.3"` and `"125.30"` match. If the status is `pending` or `unknown`, use `get_payment_status` with the returned ID until it reaches `paid` or `rejected`. The sandbox can accept a safe retry with the original `externalId` after a confirmed absence. Calls without an idempotency key each create a new operation.

The root `compose.yaml` also serves these tools over Streamable HTTP at
`http://localhost:8088/mcp`. Send `Authorization: Bearer sgk_...` on each request.
HTTP keys are read from the request context, so clients do not share a process-wide agent key.
Missing or invalid keys cannot call the tools. The original stdio entry point still reads
`SYNGRAPH_AGENT_KEY`; see the root README for the Compose stdio command.

- `src/` — code
- `data/` — data
