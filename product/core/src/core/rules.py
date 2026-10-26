"""Mandate rules. Binary for now: the payment either passes or is rejected with a reason."""
import sqlite3
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from . import db
from .errors import MandateMisconfigured
from .money import format_money

WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def check(
    conn: sqlite3.Connection,
    mandate: sqlite3.Row,
    counterparty_id: int,
    payee_inn: str,
    kopecks: int,
    now: datetime,
) -> str | None:
    """Returns why the payment is rejected, or None if every rule passes."""
    zone, days, start, end = working_hours(mandate)
    local = now.astimezone(zone)
    if WEEKDAYS[local.weekday()] not in days or not start <= local.time() < end:
        return (
            f"outside working hours: {', '.join(days)} "
            f"{mandate['working_from']}-{mandate['working_to']} {mandate['timezone']}"
        )

    if not mandate["any_counterparty"] and not db.is_allowed(conn, mandate["id"], counterparty_id):
        return f"counterparty with INN {payee_inn} is not allowed by the mandate"

    if kopecks > mandate["max_payment_kopecks"]:
        return f"amount exceeds the limit of {format_money(mandate['max_payment_kopecks'])} per payment"

    day_start = local.replace(hour=0, minute=0, second=0, microsecond=0)
    periods = [
        ("day", day_start),
        ("week", day_start - timedelta(days=local.weekday())),
        ("month", day_start.replace(day=1)),
    ]
    for name, period_start in periods:
        limit = mandate[f"max_{name}_kopecks"]
        since = period_start.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        if db.spent_since(conn, mandate["id"], since) + kopecks > limit:
            return f"the {name} limit of {format_money(limit)} would be exceeded"
    return None


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
