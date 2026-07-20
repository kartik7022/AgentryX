from datetime import datetime, timezone, timedelta

IST = timezone(timedelta(hours=5, minutes=30))

def now_ist() -> str:
    return datetime.now(IST).strftime("%Y-%m-%dT%H:%M:%S")