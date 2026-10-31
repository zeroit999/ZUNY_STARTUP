"""HMAC authentication for the internal ZUNY/VNOJ API."""

import hashlib
import hmac
import time


MAX_REQUEST_BYTES = 512 * 1024
MAX_CLOCK_SKEW_SECONDS = 60


def sign_request(secret, timestamp, method, path, body):
    if not isinstance(body, bytes):
        raise TypeError("Request body must be bytes.")

    if len(body) > MAX_REQUEST_BYTES:
        raise ValueError("Request body too large.")

    if not isinstance(secret, str) or not secret:
        raise ValueError("Missing integration secret.")

    message = b"\n".join((
        str(timestamp).encode("ascii"),
        method.upper().encode("ascii"),
        path.encode("utf-8"),
        body,
    ))

    return hmac.new(
        secret.encode("utf-8"),
        message,
        hashlib.sha256,
    ).hexdigest()


def verify_request(
    secret,
    timestamp,
    method,
    path,
    body,
    signature,
    now=None,
):
    try:
        timestamp = int(timestamp)

        current_time = (
            int(time.time())
            if now is None
            else int(now)
        )

        if abs(current_time - timestamp) > MAX_CLOCK_SKEW_SECONDS:
            return False

        expected = sign_request(
            secret,
            timestamp,
            method,
            path,
            body,
        )

        return hmac.compare_digest(
            expected,
            signature,
        )

    except (ValueError, TypeError, UnicodeError, OverflowError):
        return False
