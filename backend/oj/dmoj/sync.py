
"""VNOJ -> ZUNY result synchronization.

Initially restricted to the isolated ZUNY OJ test database.
"""

import math
from datetime import datetime, timezone

from sqlalchemy import text

from extensions import db
from oj.dmoj.client import get_submission_result
from oj.dmoj.testcases import normalize_testcases
from oj.dmoj.mapping import (
    execution_time_ms,
    score_integer,
    to_zuny_verdict,
)


TEST_DATABASE = "zuny_oj_security_test"


class ResultSyncError(RuntimeError):
    pass



def sync_submission_result(zuny_submission_id):
    """Atomically synchronize summary and testcase results in test DB."""

    if type(zuny_submission_id) is not int or not 0 < zuny_submission_id < 2**63:
        raise ValueError("Invalid submission ID")

    database = db.session.execute(
        text("SELECT current_database()")
    ).scalar_one()

    if database != TEST_DATABASE:
        db.session.rollback()
        raise ResultSyncError("Test database only")

    local = db.session.execute(
        text("""
            SELECT id, verdict, score, judged_at
            FROM oj_submissions
            WHERE id = :id
        """),
        {"id": zuny_submission_id},
    ).mappings().first()

    if local is None:
        db.session.rollback()
        raise ResultSyncError("Local submission not found")

    db.session.rollback()

    result = get_submission_result(zuny_submission_id)

    if result.get("zuny_submission_id") != zuny_submission_id:
        raise ResultSyncError("Submission ID mismatch")

    if result.get("finished") is not True:
        return {"status": "pending", "submission_id": zuny_submission_id}

    if (
        result.get("judge_status") != "D"
        or result.get("dispatch_status") != "DISPATCHED"
        or type(result.get("vnoj_submission_id")) is not int
        or result["vnoj_submission_id"] <= 0
    ):
        raise ResultSyncError("Invalid judge state")

    raw_verdict = result.get("verdict")

    if raw_verdict not in ("AC", "WA", "TLE", "MLE", "RTE", "RE", "CE", "IE"):
        raise ResultSyncError("Invalid verdict")

    for name in ("points", "time_seconds", "memory_kb"):
        value = result.get(name)
        if (
            type(value) not in (int, float)
            or not math.isfinite(value)
            or value < 0
        ):
            raise ResultSyncError("Invalid " + name)

    if result["points"] > 100:
        raise ResultSyncError("Score exceeds 100")

    verdict = to_zuny_verdict(raw_verdict)
    score = score_integer(result["points"])
    time_ms = execution_time_ms(result["time_seconds"])
    memory_kb = round(result["memory_kb"])

    try:
        judged_at = datetime.fromisoformat(result["judged_at"])
    except (TypeError, ValueError, KeyError) as exc:
        raise ResultSyncError("Invalid judged_at") from exc

    if judged_at.tzinfo is None:
        raise ResultSyncError("Timezone required")

    judged_at = judged_at.astimezone(timezone.utc)
    cases = normalize_testcases(result)

    try:
        locked = db.session.execute(
            text("""
                SELECT id, verdict, score, judged_at
                FROM oj_submissions
                WHERE id = :id
                FOR UPDATE
            """),
            {"id": zuny_submission_id},
        ).mappings().first()

        if locked is None:
            raise ResultSyncError("Submission disappeared")

        pending = (
            locked["verdict"] == "PENDING"
            and locked["score"] == 0
            and locked["judged_at"] is None
        )

        if pending:
            db.session.execute(
                text("""
                    UPDATE oj_submissions
                    SET verdict = :verdict,
                        score = :score,
                        execution_time_ms = :time_ms,
                        memory_used_kb = :memory_kb,
                        judged_at = :judged_at
                    WHERE id = :id
                """),
                {
                    "id": zuny_submission_id,
                    "verdict": verdict,
                    "score": score,
                    "time_ms": time_ms,
                    "memory_kb": memory_kb,
                    "judged_at": judged_at,
                },
            )
        elif locked["verdict"] != verdict or locked["score"] != score:
            raise ResultSyncError("Finalized result mismatch")

        existing = db.session.execute(
            text("""
                SELECT position, verdict, points,
                       execution_time_ms, memory_used_kb
                FROM oj_submission_results
                WHERE submission_id = :id
            """),
            {"id": zuny_submission_id},
        ).mappings().all()

        expected = {
            case["position"]: case
            for case in cases
        }

        for row in existing:
            case = expected.get(row["position"])
            if case is None or any(
                row[key] != case[key]
                for key in (
                    "verdict",
                    "points",
                    "execution_time_ms",
                    "memory_used_kb",
                )
            ):
                raise ResultSyncError("Existing testcase mismatch")

        inserted = 0

        for case in cases:
            inserted += db.session.execute(
                text("""
                    INSERT INTO oj_submission_results (
                        submission_id, testcase_id, position,
                        verdict, execution_time_ms,
                        memory_used_kb, points, message, created_at
                    )
                    VALUES (
                        :submission_id, NULL, :position,
                        :verdict, :execution_time_ms,
                        :memory_used_kb, :points, NULL,
                        CURRENT_TIMESTAMP
                    )
                    ON CONFLICT (submission_id, position)
                    DO NOTHING
                """),
                {"submission_id": zuny_submission_id, **case},
            ).rowcount

        db.session.commit()

    except Exception:
        db.session.rollback()
        raise

    return {
        "status": "updated" if pending else "backfilled",
        "submission_id": zuny_submission_id,
        "verdict": verdict,
        "score": score,
        "testcases_inserted": inserted,
    }

