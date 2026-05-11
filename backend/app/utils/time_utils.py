"""IST-aware time helpers and market-hours predicates."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from app.core.config import settings

IST: ZoneInfo = ZoneInfo(settings.DEFAULT_TIMEZONE)
UTC: timezone = timezone.utc


def now_utc() -> datetime:
    return datetime.now(UTC)


def now_ist() -> datetime:
    return datetime.now(IST)


def to_ist(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(IST)


def to_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=IST)
    return dt.astimezone(UTC)


def parse_hhmm(value: str) -> time:
    h, m = value.split(":", 1)
    return time(int(h), int(m))


def market_open_time() -> time:
    return parse_hhmm(settings.MARKET_OPEN_TIME)


def market_close_time() -> time:
    return parse_hhmm(settings.MARKET_CLOSE_TIME)


def is_weekend(d: date) -> bool:
    return d.weekday() >= 5  # Sat=5, Sun=6


def is_market_open(at: datetime | None = None) -> bool:
    """Naive check — does NOT consider holidays. The HolidayService overlays that."""
    now = to_ist(at or now_ist())
    if is_weekend(now.date()):
        return False
    return market_open_time() <= now.time() <= market_close_time()


def start_of_day_ist(d: date | None = None) -> datetime:
    d = d or now_ist().date()
    return datetime.combine(d, time.min, tzinfo=IST)


def end_of_day_ist(d: date | None = None) -> datetime:
    d = d or now_ist().date()
    return datetime.combine(d, time.max, tzinfo=IST)


def add_business_days(d: date, n: int) -> date:
    """Naive — does not consider holidays. For T+1/T+2 settlement."""
    out = d
    added = 0
    while added < n:
        out += timedelta(days=1)
        if not is_weekend(out):
            added += 1
    return out
