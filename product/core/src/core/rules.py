"""Mandate rules: a payment passes, waits for the client's decision, or is rejected, with the reason."""
import sqlite3
from datetime import datetime, time, timedelta, timezone
from typing import Literal
from zoneinfo import ZoneInfo

from . import db
from .errors import MandateMisconfigured
from .money import format_money

WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
Verdict = Literal["pass", "ask", "reject"]  # ask: the client approves or declines in the app


def check(
    conn: sqlite3.Connection,
    mandate: sqlite3.Row,
    counterparty_id: int,
    payee_inn: str,
    category: str,
    kopecks: int,
    now: datetime,
) -> tuple[Verdict, str | None]:
    """The verdict and why. Pause and a blocked category reject at once; any other broken rule goes to the client."""
    if mandate["paused"]:
        return "reject", "the client has paused the agent"
    if mandate["category_mode"] == "except" and category in mandate["blocked_categories"].split(","):
        return "reject", f"category {category} is forbidden by the mandate"
    broken = broken_rule(conn, mandate, counterparty_id, payee_inn, category, kopecks, now)
    if broken:
        return "ask", broken
    if mandate["approval"] == "manual":
        return "ask", "the client approves every payment"
    return "pass", None


def broken_rule(
    conn: sqlite3.Connection,
    mandate: sqlite3.Row,
    counterparty_id: int,
    payee_inn: str,
    category: str,
    kopecks: int,
    now: datetime,
) -> str | None:
    """The first rule the payment breaks, or None."""
    if not is_working_time(mandate, now):
        return (
            f"outside working hours: {mandate['working_days'].replace(',', ', ')} "
            f"{mandate['working_from']}-{mandate['working_to']} {mandate['timezone']}"
        )

    if not mandate["any_counterparty"] and not db.is_allowed(conn, mandate["id"], counterparty_id):
        return f"counterparty with INN {payee_inn} is not allowed by the mandate"

    if mandate["category_mode"] == "only" and category not in mandate["allowed_categories"].split(","):
        return f"category {category} is not allowed by the mandate"

    if mandate["any_amount"]:  # no amount limits
        return None

    if kopecks > mandate["max_payment_kopecks"]:
        return f"amount exceeds the limit of {format_money(mandate['max_payment_kopecks'])} per payment"

    for name, spent in spent_by_period(conn, mandate, now).items():
        limit = mandate[f"max_{name}_kopecks"]  # None: no limit for the period
        if limit is not None and spent + kopecks > limit:
            return f"the {name} limit of {format_money(limit)} would be exceeded"
    return None


def is_working_time(mandate: sqlite3.Row, now: datetime) -> bool:
    if mandate["any_time"]:  # no working hours: any time will do
        return True
    zone, days, start, end = working_hours(mandate)
    local = now.astimezone(zone)
    return WEEKDAYS[local.weekday()] in days and start <= local.time() < end


def spent_by_period(conn: sqlite3.Connection, mandate: sqlite3.Row, now: datetime) -> dict[str, int]:
    """Kopecks spent in the current calendar day, week and month, in the mandate's time zone."""
    local = now.astimezone(working_hours(mandate)[0])
    day_start = local.replace(hour=0, minute=0, second=0, microsecond=0)
    periods = {
        "day": day_start,
        "week": day_start - timedelta(days=local.weekday()),
        "month": day_start.replace(day=1),
    }
    return {
        name: db.spent_since(conn, mandate["id"], start.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))
        for name, start in periods.items()
    }


def working_hours(mandate: sqlite3.Row) -> tuple[ZoneInfo, list[str], time, time]:
    """Reads the mandate's time zone, days and hours; broken settings are the client's error, not the agent's."""
    try:
        zone = ZoneInfo(mandate["timezone"])
        start = time.fromisoformat(mandate["working_from"])
        end = time.fromisoformat(mandate["working_to"])
    except (ValueError, KeyError) as e:  # ZoneInfoNotFoundError is a KeyError
        raise MandateMisconfigured(f"mandate {mandate['id']} has invalid working hours: {e}") from e
    days = mandate["working_days"].split(",")
    unknown = [d for d in days if d not in WEEKDAYS]
    if unknown:
        raise MandateMisconfigured(f"mandate {mandate['id']} has unknown working days: {unknown}")
    return zone, days, start, end
