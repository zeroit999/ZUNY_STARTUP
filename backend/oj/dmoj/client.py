"""HTTP client for ZUNY -> VNOJ internal submission API."""

import json
import os
import time

import requests

from .auth import sign_request
from .mapping import to_dmoj_language


DEFAULT_BASE_URL = "http://127.0.0.1:8081"
SUBMISSION_PATH = "/internal/zuny/v1/submissions/"


class DMOJClientError(Exception):
    def __init__(self, message, status_code=None):
        super().__init__(message)
        self.status_code = status_code


def submit_to_dmoj(
    zuny_submission_id,
    problem_code,
    language,
    source_code,
    *,
    base_url=None,
    secret=None,
    timeout=15,
):
    """Create or retrieve one idempotent VNOJ submission."""

    if type(zuny_submission_id) is not int or not 0 < zuny_submission_id < 2**63:
        raise ValueError("Invalid ZUNY submission ID")

    if not isinstance(problem_code, str) or not problem_code:
        raise ValueError("Invalid VNOJ problem code")

    if not isinstance(source_code, str) or not source_code.strip():
        raise ValueError("Invalid source code")

    secret = secret or os.environ.get("ZUNY_INTEGRATION_SECRET", "")
    if not secret:
        raise DMOJClientError("ZUNY_INTEGRATION_SECRET is not configured")

    base_url = base_url or os.environ.get(
        "ZUNY_DMOJ_BASE_URL", DEFAULT_BASE_URL
    )

    if not base_url.startswith(("http://127.0.0.1:", "http://localhost:")):
        raise DMOJClientError(
            "Only local DMOJ HTTP endpoints are enabled"
        )

    payload = {
        "zuny_submission_id": zuny_submission_id,
        "problem_code": problem_code,
        "language": to_dmoj_language(language),
        "source_code": source_code,
    }

    body = json.dumps(
        payload, ensure_ascii=False, separators=(",", ":")
    ).encode("utf-8")

    timestamp = int(time.time())
    signature = sign_request(
        secret, timestamp, "POST", SUBMISSION_PATH, body
    )

    headers = {
        "Host": "localhost",
        "Content-Type": "application/json",
        "X-Zuny-Timestamp": str(timestamp),
        "X-Zuny-Signature": signature,
    }

    try:
        response = requests.post(
            base_url.rstrip("/") + SUBMISSION_PATH,
            data=body,
            headers=headers,
            timeout=timeout,
            allow_redirects=False,
        )
    except requests.RequestException as exc:
        raise DMOJClientError(
            "Cannot connect to local VNOJ"
        ) from exc

    if response.status_code not in (200, 201):
        raise DMOJClientError(
            "VNOJ rejected submission: HTTP "
            + str(response.status_code),
            status_code=response.status_code,
        )

    try:
        result = response.json()
    except ValueError as exc:
        raise DMOJClientError(
            "Invalid JSON response from VNOJ"
        ) from exc

    if (
        not isinstance(result, dict)
        or result.get("zuny_submission_id") != zuny_submission_id
        or type(result.get("vnoj_submission_id")) is not int
        or result["vnoj_submission_id"] <= 0
    ):
        raise DMOJClientError(
            "Invalid submission mapping returned by VNOJ"
        )

    return result



def get_submission_result(
    zuny_submission_id,
    *,
    base_url=None,
    secret=None,
    timeout=15,
):
    """Read a VNOJ judge result through the local HMAC API."""
    if type(zuny_submission_id) is not int or not 0 < zuny_submission_id < 2**63:
        raise ValueError("Invalid ZUNY submission ID")

    secret = secret or os.environ.get("ZUNY_INTEGRATION_SECRET")

    if not secret:
        raise DMOJClientError("ZUNY_INTEGRATION_SECRET is not configured")

    base_url = base_url or os.environ.get(
        "ZUNY_DMOJ_BASE_URL", DEFAULT_BASE_URL
    )

    if not base_url.startswith(("http://127.0.0.1:", "http://localhost:")):
        raise DMOJClientError(
            "Only local DMOJ HTTP endpoints are enabled"
        )

    path = (
        "/internal/zuny/v1/submissions/"
        f"{zuny_submission_id}/result/"
    )

    timestamp = int(time.time())
    signature = sign_request(
        secret, timestamp, "GET", path, b""
    )

    try:
        response = requests.get(
            base_url.rstrip("/") + path,
            headers={
                "Host": "localhost",
                "X-Zuny-Timestamp": str(timestamp),
                "X-Zuny-Signature": signature,
            },
            timeout=timeout,
            allow_redirects=False,
        )
    except requests.RequestException as exc:
        raise DMOJClientError(
            "Cannot connect to local VNOJ result API"
        ) from exc

    if response.status_code != 200:
        raise DMOJClientError(
            "VNOJ result API returned HTTP "
            + str(response.status_code),
            status_code=response.status_code,
        )

    try:
        data = response.json()
    except ValueError as exc:
        raise DMOJClientError(
            "Invalid JSON from VNOJ result API"
        ) from exc

    if (
        not isinstance(data, dict)
        or data.get("zuny_submission_id") != zuny_submission_id
        or type(data.get("vnoj_submission_id")) is not int
        or data["vnoj_submission_id"] <= 0
        or type(data.get("finished")) is not bool
        or not isinstance(data.get("testcases"), list)
    ):
        raise DMOJClientError(
            "Invalid VNOJ result response"
        )

    if data["finished"]:
        if (
            not isinstance(data.get("verdict"), str)
            or isinstance(data.get("points"), bool)
            or not isinstance(data.get("points"), (int, float))
        ):
            raise DMOJClientError(
                "Invalid completed VNOJ result"
            )

    return data
