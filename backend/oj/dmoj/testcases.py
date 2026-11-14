"""Validate and normalize VNOJ testcase results.

No database writes. No hidden testcase content is retained.
"""

import math

from oj.dmoj.mapping import (
    execution_time_ms,
    score_integer,
    to_zuny_verdict,
)


class TestcaseValidationError(ValueError):
    pass


def normalize_testcases(result):
    """Return sanitized testcase rows for one finished submission."""

    if not isinstance(result, dict):
        raise TestcaseValidationError("Invalid result payload")

    if result.get("finished") is not True:
        raise TestcaseValidationError("Submission is not finished")

    cases = result.get("testcases")

    if not isinstance(cases, list) or not cases:
        raise TestcaseValidationError("Missing testcase results")

    if len(cases) > 10000:
        raise TestcaseValidationError("Too many testcases")

    normalized = []
    seen = set()

    for item in cases:
        if not isinstance(item, dict):
            raise TestcaseValidationError("Invalid testcase object")

        position = item.get("case")

        if (
            type(position) is not int
            or position <= 0
            or position in seen
        ):
            raise TestcaseValidationError("Invalid testcase position")

        seen.add(position)

        raw_verdict = item.get("status")

        if not isinstance(raw_verdict, str) or not raw_verdict:
            raise TestcaseValidationError("Invalid testcase verdict")

        # SC means Skipped Case, not Internal Error.
        # Keep it distinct from submission-level verdict mapping.
        if raw_verdict == "SC":
            verdict = "SC"
        else:
            if raw_verdict not in (
                "AC", "WA", "TLE", "MLE",
                "RTE", "RE", "CE", "IE",
            ):
                raise TestcaseValidationError(
                    "Unknown testcase verdict"
                )

            verdict = to_zuny_verdict(raw_verdict)

        if verdict == "PENDING":
            raise TestcaseValidationError("Pending testcase in finished result")

        raw_points = item.get("points")
        raw_total = item.get("total")
        raw_time = item.get("time_seconds")
        raw_memory = item.get("memory_kb")

        for name, value in (
            ("points", raw_points),
            ("total", raw_total),
            ("time_seconds", raw_time),
            ("memory_kb", raw_memory),
        ):
            if (
                type(value) not in (int, float)
                or not math.isfinite(value)
                or value < 0
            ):
                raise TestcaseValidationError("Invalid " + name)

        if raw_points > raw_total:
            raise TestcaseValidationError(
                "Testcase points exceed maximum"
            )

        normalized.append({
            "position": position,
            "verdict": verdict,
            "execution_time_ms": execution_time_ms(raw_time),
            "memory_used_kb": round(raw_memory),
            "points": score_integer(raw_points),
            "message": None,
        })

    normalized.sort(key=lambda row: row["position"])

    if [row["position"] for row in normalized] != list(
        range(1, len(normalized) + 1)
    ):
        raise TestcaseValidationError(
            "Testcase positions must be consecutive"
        )

    return normalized
