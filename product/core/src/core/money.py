"""Money as integer kopecks. No floats: they lose kopecks."""
from decimal import Decimal, InvalidOperation

from .errors import InvalidRequest

CURRENCY = "RUB"
MAX_KOPECKS = 10**15  # 10 trillion rubles: far above any invoice, far below SQLite's integer limit


def to_kopecks(amount: str) -> int:
    """'245000.00' rubles -> 24500000 kopecks."""
    try:
        value = Decimal(amount)
    except InvalidOperation:
        raise InvalidRequest(f"amount must be a number in rubles, like '245000.00', got {amount!r}")
    if not value.is_finite() or value <= 0 or value.as_tuple().exponent < -2 or value > MAX_KOPECKS // 100:
        raise InvalidRequest(
            f"amount must be positive, at most {MAX_KOPECKS // 100} rubles, with at most 2 decimals, got {amount!r}"
        )
    return int(value * 100)


def to_rubles(kopecks: int) -> str:
    """24500000 -> '245000.00': the format to_kopecks reads."""
    return f"{kopecks // 100}.{kopecks % 100:02d}"


def format_money(kopecks: int) -> str:
    """24500000 -> '245000.00 RUB'."""
    return f"{to_rubles(kopecks)} {CURRENCY}"
