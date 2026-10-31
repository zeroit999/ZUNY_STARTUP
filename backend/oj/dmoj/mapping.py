"""Data mapping between ZUNY OJ and VNOJ/DMOJ."""

from decimal import Decimal, ROUND_HALF_UP


LANGUAGE_MAP = {
    "CPP23": "CPP23",
    "PYTHON314": "PY3",
}

VERDICT_MAP = {
    "AC": "AC",
    "WA": "WA",
    "TLE": "TLE",
    "MLE": "MLE",
    "RTE": "RE",
    "RE": "RE",
    "CE": "CE",
    "IE": "IE",
}


def to_dmoj_language(language):
    try:
        return LANGUAGE_MAP[language]
    except KeyError as exc:
        raise ValueError(
            f"Unsupported ZUNY language: {language}"
        ) from exc


def to_zuny_verdict(verdict):
    if verdict is None:
        return "PENDING"

    return VERDICT_MAP.get(verdict, "IE")


def time_limit_seconds(milliseconds):
    if milliseconds <= 0:
        raise ValueError("Time limit must be positive.")

    return float(
        Decimal(str(milliseconds)) / Decimal("1000")
    )


def memory_limit_kib(megabytes):
    if megabytes <= 0:
        raise ValueError("Memory limit must be positive.")

    return int(megabytes) * 1024


def execution_time_ms(seconds):
    if seconds is None:
        return None

    return int(
        (
            Decimal(str(seconds)) * Decimal("1000")
        ).quantize(
            Decimal("1"),
            rounding=ROUND_HALF_UP,
        )
    )


def score_integer(points):
    if points is None:
        return 0

    return int(
        Decimal(str(points)).quantize(
            Decimal("1"),
            rounding=ROUND_HALF_UP,
        )
    )
