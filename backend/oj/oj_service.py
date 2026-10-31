from datetime import datetime, timezone
from flask import current_app
import unicodedata

from extensions import db
from models import (
    OJProblem,
    OJProblemReview,
    OJSubmission,
    OJSubmissionResult,
    OJTestCase,
    User,
)
from chatbot.service import create_oj_analysis


SUPPORTED_LANGUAGES = {
    "CPP23",
    "PYTHON314",
}

DIFFICULTIES = {
    "EASY",
    "MEDIUM",
    "HARD",
}

PROBLEM_STATUSES = {
    "DRAFT",
    "PUBLISHED",
    "ARCHIVED",
}


class OJError(Exception):
    def __init__(self, message, status_code=400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code



# Giới hạn thời gian tối đa cho một testcase OJ.
MAX_TIME_LIMIT_MS = 30_000

def utc_now():
    return datetime.now(timezone.utc)


def normalize_text(value):
    return str(value or "").strip()


def normalize_upper(value):
    return normalize_text(value).upper()


def normalize_subject(value):
    value = normalize_text(value).casefold()

    value = unicodedata.normalize(
        "NFD",
        value,
    )

    value = "".join(
        character
        for character in value
        if unicodedata.category(character) != "Mn"
    )

    # Đ/đ không bị tách bởi NFD.
    value = value.replace("đ", "d")

    return " ".join(
        value.split()
    )


def teacher_subject(user):
    if not user:
        return ""

    profile = (
        user.profile_data
        if isinstance(
            user.profile_data,
            dict,
        )
        else {}
    )

    return normalize_subject(
        profile.get("subject")
        or profile.get("specialty")
    )


def is_informatics_teacher(user):
    if (
        not user
        or role(user) != "TEACHER"
    ):
        return False

    subject = teacher_subject(user)

    return subject in {
        "tin hoc",
        "informatique",
        "informatics",
        "computer science",
    }


def get_user(current_user):
    if not current_user:
        return None

    user_id = (
        current_user.get("user_id")
        or current_user.get("uid")
    )

    if not user_id:
        return None

    return db.session.get(
        User,
        user_id,
    )


def role(user):
    return normalize_upper(
        getattr(
            user,
            "role",
            "",
        )
    )


def is_admin(user):
    return bool(
        user
        and role(user) == "ADMIN_DEV"
    )


def is_teacher(user):
    return bool(
        user
        and role(user)
        in {
            "TEACHER",
            "ADMIN_DEV",
        }
    )


def require_user(current_user):
    user = get_user(current_user)

    if not user:
        raise OJError(
            "Không tìm thấy tài khoản người dùng.",
            401,
        )

    return user


def require_manager(current_user):
    user = require_user(current_user)

    if is_admin(user):
        return user

    if not is_informatics_teacher(user):
        raise OJError(
            (
                "Chỉ giáo viên Tin học "
                "hoặc quản trị viên mới có quyền "
                "quản lý bài lập trình."
            ),
            403,
        )

    return user


def serialize_sample(testcase):
    return {
        "id": testcase.id,
        "position": testcase.position,
        "input": testcase.input_data,
        "output": testcase.expected_output,
    }


def serialize_problem(
    problem,
    include_detail=False,
    include_samples=False,
):
    data = {
        "id": problem.id,
        "code": str(problem.id),
        "title": problem.title,
        "difficulty": problem.difficulty,
        "category": problem.category or "",
        "points": problem.points,
        "timeLimitMs": problem.time_limit_ms,
        "memoryLimitMb": problem.memory_limit_mb,
        "status": problem.status,
        "createdBy": problem.created_by,
        "createdAt": (
            problem.created_at.isoformat()
            if problem.created_at
            else None
        ),
        "updatedAt": (
            problem.updated_at.isoformat()
            if problem.updated_at
            else None
        ),
    }

    if include_detail:
        data.update({
            "description": problem.description,
            "inputDescription":
                problem.input_description or "",
            "outputDescription":
                problem.output_description or "",
            "constraints":
                problem.constraints_text or "",
            "metadata":
                problem.metadata_json
                if isinstance(
                    problem.metadata_json,
                    dict,
                )
                else {},
        })

    if include_samples:
        samples = (
            db.session.execute(
                db.select(OJTestCase)
                .where(
                    OJTestCase.problem_id
                    == problem.id,
                    OJTestCase.is_sample.is_(True),
                )
                .order_by(
                    OJTestCase.position.asc()
                )
            )
            .scalars()
            .all()
        )

        data["samples"] = [
            serialize_sample(row)
            for row in samples
        ]

    return data


def serialize_submission(
    submission,
    include_source=False,
    include_results=False,
):
    problem = db.session.get(
        OJProblem,
        submission.problem_id,
    )

    data = {
        "id": submission.id,
        "problemId": submission.problem_id,
        "problemCode":
            str(problem.id) if problem else None,
        "problemTitle":
            problem.title if problem else None,
        "userId": submission.user_id,
        "language": submission.language,
        "verdict": submission.verdict,
        "score": submission.score,
        "executionTimeMs":
            submission.execution_time_ms,
        "memoryUsedKb":
            submission.memory_used_kb,
        "compilerOutput":
            submission.compiler_output,
        "judgeMessage":
            submission.judge_message,
        "createdAt": (
            submission.created_at.isoformat()
            if submission.created_at
            else None
        ),
        "judgedAt": (
            submission.judged_at.isoformat()
            if submission.judged_at
            else None
        ),
    }

    if include_source:
        data["sourceCode"] = (
            submission.source_code
        )

    if include_results:
        rows = (
            db.session.execute(
                db.select(OJSubmissionResult)
                .where(
                    OJSubmissionResult.submission_id
                    == submission.id
                )
                .order_by(
                    OJSubmissionResult.position.asc()
                )
            )
            .scalars()
            .all()
        )

        # Không trả testcase_id để tránh cung cấp
        # thông tin nội bộ không cần thiết.
        data["testResults"] = [
            {
                "position": row.position,
                "verdict": row.verdict,
                "executionTimeMs":
                    row.execution_time_ms,
                "memoryUsedKb":
                    row.memory_used_kb,
                "points": row.points,
                "message": row.message,
            }
            for row in rows
        ]

    return data


def find_problem(problem_id):
    try:
        problem_id = int(problem_id)
    except (TypeError, ValueError):
        return None

    if problem_id < 1:
        return None

    return db.session.get(
        OJProblem,
        problem_id,
    )



def require_problem_owner(user, problem):
    if is_admin(user):
        return

    if problem.created_by != user.id:
        raise OJError(
            "Bạn không có quyền quản lý bài lập trình này.",
            403,
        )


def can_access_problem(user, problem):
    return (
        problem.status == "PUBLISHED"
        or is_admin(user)
        or (
            is_informatics_teacher(user)
            and problem.created_by == user.id
        )
    )



def get_problems(current_user):
    user = require_user(current_user)

    statement = db.select(OJProblem)

    if not is_admin(user):
        if is_informatics_teacher(user):
            statement = statement.where(
                db.or_(
                    OJProblem.status == "PUBLISHED",
                    OJProblem.created_by == user.id,
                )
            )
        else:
            statement = statement.where(
                OJProblem.status == "PUBLISHED"
            )

    problems = (
        db.session.execute(
            statement.order_by(
                OJProblem.id.asc()
            )
        )
        .scalars()
        .all()
    )

    return {
        "success": True,
        "problems": [
            serialize_problem(problem)
            for problem in problems
        ],
    }


def get_problem_detail(
    current_user,
    problem_id,
):
    user = require_user(current_user)
    problem = find_problem(problem_id)

    if not problem:
        raise OJError(
            "Không tìm thấy bài lập trình.",
            404,
        )

    if not can_access_problem(user, problem):
        raise OJError(
            "Không tìm thấy bài lập trình.",
            404,
        )

    return {
        "success": True,
        "problem": serialize_problem(
            problem,
            include_detail=True,
            include_samples=True,
        ),
        "languages": [
            "CPP23",
            "PYTHON314",
        ],
    }



def serialize_manager_testcase(testcase):
    """
    Serializer CHỈ dành cho OJ Manager.

    Hidden testcase có input/output nên tuyệt đối
    không dùng serializer này ở public API.
    """
    return {
        "id": testcase.id,
        "position": testcase.position,
        "input": testcase.input_data,
        "output": testcase.expected_output,
        "isSample": testcase.is_sample,
        "points": testcase.points,
    }


def get_manager_problem_detail(
    current_user,
    problem_id,
):
    user = require_manager(current_user)

    problem = find_problem(problem_id)

    if not problem:
        raise OJError(
            "Không tìm thấy bài lập trình.",
            404,
        )

    require_problem_owner(user, problem)

    testcases = (
        db.session.execute(
            db.select(OJTestCase)
            .where(
                OJTestCase.problem_id
                == problem.id
            )
            .order_by(
                OJTestCase.position.asc()
            )
        )
        .scalars()
        .all()
    )

    data = serialize_problem(
        problem,
        include_detail=True,
        include_samples=False,
    )

    data["testcases"] = [
        serialize_manager_testcase(row)
        for row in testcases
    ]

    return {
        "success": True,
        "problem": data,
        "languages": [
            "CPP23",
            "PYTHON314",
        ],
    }


def find_problem_testcase(
    problem,
    testcase_id,
):
    try:
        testcase_id = int(testcase_id)
    except (TypeError, ValueError):
        return None

    return (
        db.session.execute(
            db.select(OJTestCase)
            .where(
                OJTestCase.id
                == testcase_id,
                OJTestCase.problem_id
                == problem.id,
            )
        )
        .scalar_one_or_none()
    )


def update_testcase(
    current_user,
    problem_id,
    testcase_id,
    payload,
):
    user = require_manager(current_user)

    problem = find_problem(problem_id)

    if not problem:
        raise OJError(
            "Không tìm thấy bài lập trình.",
            404,
        )

    require_problem_owner(user, problem)

    if problem.status == "PUBLISHED" and not is_admin(user):
        raise OJError("Đề đã công khai: phải gửi bản sửa để Admin duyệt.", 403)

    testcase = find_problem_testcase(
        problem,
        testcase_id,
    )

    if not testcase:
        raise OJError(
            "Không tìm thấy testcase.",
            404,
        )

    changes = {}

    if "input" in payload:
        changes["input_data"] = str(
            payload.get("input")
            if payload.get("input")
            is not None
            else ""
        )

    if "output" in payload:
        changes["expected_output"] = str(
            payload.get("output")
            if payload.get("output")
            is not None
            else ""
        )

    if "isSample" in payload:
        value = payload.get("isSample")

        if not isinstance(value, bool):
            raise OJError(
                "Trạng thái testcase mẫu "
                "không hợp lệ."
            )

        changes["is_sample"] = value

    if "points" in payload:
        value = payload.get("points")

        if value in (None, ""):
            changes["points"] = None
        else:
            try:
                value = int(value)
            except (TypeError, ValueError):
                raise OJError(
                    "Điểm testcase "
                    "không hợp lệ."
                )

            if value < 0:
                raise OJError(
                    "Điểm testcase "
                    "không được âm."
                )

            changes["points"] = value

    if "position" in payload:
        try:
            position = int(
                payload.get("position")
            )
        except (TypeError, ValueError):
            raise OJError(
                "Vị trí testcase "
                "không hợp lệ."
            )

        if position < 1:
            raise OJError(
                "Vị trí testcase "
                "phải từ 1."
            )

        existing = (
            db.session.execute(
                db.select(OJTestCase)
                .where(
                    OJTestCase.problem_id
                    == problem.id,
                    OJTestCase.position
                    == position,
                    OJTestCase.id
                    != testcase.id,
                )
            )
            .scalar_one_or_none()
        )

        if existing:
            raise OJError(
                "Vị trí testcase "
                "đã tồn tại.",
                409,
            )

        changes["position"] = position

    for field, value in changes.items():
        setattr(
            testcase,
            field,
            value,
        )

    db.session.commit()

    return {
        "success": True,
        "message":
            "Đã cập nhật testcase.",
        "testcase":
            serialize_manager_testcase(
                testcase
            ),
    }



def replace_problem_testcases(current_user, problem_id, payload):
    """Atomically replace all testcases of one managed problem."""
    user = require_manager(current_user)

    problem = find_problem(problem_id)
    if not problem:
        raise OJError("Không tìm thấy bài lập trình.", 404)

    require_problem_owner(user, problem)

    if problem.status == "PUBLISHED" and not is_admin(user):
        raise OJError(
            "Đề đã công khai: phải gửi bản sửa để Admin duyệt.",
            403,
        )

    if not isinstance(payload, dict):
        raise OJError("Payload không hợp lệ.")

    rows = payload.get("testcases")
    if not isinstance(rows, list) or not rows:
        raise OJError("Cần ít nhất một testcase.")

    if len(rows) > 1000:
        raise OJError("Tối đa 1000 testcase mỗi lần lưu.")

    prepared = []

    for index, item in enumerate(rows, 1):
        if not isinstance(item, dict):
            raise OJError(f"Testcase {index} không hợp lệ.")

        input_data = item.get("input")
        output_data = item.get("output")

        if not isinstance(input_data, str):
            raise OJError(f"Testcase {index} thiếu input.")

        if not isinstance(output_data, str):
            raise OJError(f"Testcase {index} thiếu output.")

        points = item.get("points")
        if isinstance(points, bool):
            raise OJError(f"Điểm testcase {index} không hợp lệ.")

        try:
            points = int(points)
        except (TypeError, ValueError, OverflowError):
            raise OJError(f"Điểm testcase {index} không hợp lệ.")

        if points < 0:
            raise OJError(f"Điểm testcase {index} không được âm.")

        is_sample = item.get("isSample", False)
        if not isinstance(is_sample, bool):
            raise OJError(f"Trạng thái testcase {index} không hợp lệ.")

        prepared.append({
            "position": index,
            "input_data": input_data,
            "expected_output": output_data,
            "points": points,
            "is_sample": is_sample,
        })

    try:
        existing = db.session.execute(
            db.select(OJTestCase).where(
                OJTestCase.problem_id == problem.id
            )
        ).scalars().all()

        for testcase in existing:
            db.session.delete(testcase)

        # Delete first to avoid unique-position collisions.
        db.session.flush()

        for item in prepared:
            db.session.add(
                OJTestCase(problem_id=problem.id, **item)
            )

        db.session.commit()
    except Exception:
        db.session.rollback()
        raise

    return {
        "success": True,
        "message": "Đã thay thế toàn bộ testcase.",
        "count": len(prepared),
    }


def delete_testcase(
    current_user,
    problem_id,
    testcase_id,
):
    user = require_manager(current_user)

    problem = find_problem(problem_id)

    if not problem:
        raise OJError(
            "Không tìm thấy bài lập trình.",
            404,
        )

    require_problem_owner(user, problem)

    if problem.status == "PUBLISHED" and not is_admin(user):
        raise OJError("Đề đã công khai: phải gửi bản sửa để Admin duyệt.", 403)

    testcase = find_problem_testcase(
        problem,
        testcase_id,
    )

    if not testcase:
        raise OJError(
            "Không tìm thấy testcase.",
            404,
        )

    db.session.delete(testcase)
    db.session.commit()

    return {
        "success": True,
        "message": "Đã xóa testcase.",
    }


def create_problem(
    current_user,
    payload,
):
    user = require_manager(current_user)

    title = normalize_text(
        payload.get("title")
    )
    description = normalize_text(
        payload.get("description")
    )

    if not title:
        raise OJError(
            "Tên bài không được để trống."
        )

    if len(title) > 500:
        raise OJError(
            "Tên bài tối đa 500 ký tự."
        )

    if not description:
        raise OJError(
            "Nội dung đề không được để trống."
        )

    difficulty = normalize_upper(
        payload.get("difficulty")
        or "EASY"
    )

    if difficulty not in DIFFICULTIES:
        raise OJError(
            "Độ khó không hợp lệ."
        )

    status = normalize_upper(
        payload.get("status")
        or "DRAFT"
    )

    if status not in PROBLEM_STATUSES:
        raise OJError(
            "Trạng thái bài không hợp lệ."
        )

    if not is_admin(user) and status != "DRAFT":
        raise OJError(
            "Giáo viên chỉ được tạo bản nháp.",
            403,
        )

    try:
        points = int(
            payload.get("points", 100)
        )
        time_limit_ms = int(
            payload.get(
                "timeLimitMs",
                1000,
            )
        )
        memory_limit_mb = int(
            payload.get(
                "memoryLimitMb",
                256,
            )
        )
    except (TypeError, ValueError):
        raise OJError(
            "Điểm hoặc giới hạn tài nguyên không hợp lệ."
        )

    if points <= 0:
        raise OJError(
            "Điểm phải lớn hơn 0."
        )

    if time_limit_ms <= 0:
        raise OJError(
            "Giới hạn thời gian phải lớn hơn 0."
        )

    if time_limit_ms > MAX_TIME_LIMIT_MS:
        raise OJError(
            "Giới hạn thời gian tối đa là 30000 ms."
        )

    if memory_limit_mb <= 0:
        raise OJError(
            "Giới hạn bộ nhớ phải lớn hơn 0."
        )

    metadata = payload.get("metadata")

    if not isinstance(metadata, dict):
        metadata = {}

    # Cột code vẫn NOT NULL + UNIQUE trong schema hiện tại.
    # Giá trị TEMP chỉ tồn tại trong transaction để PostgreSQL
    # có thể cấp ID trước khi code được đồng bộ thành ID.
    import uuid

    problem = OJProblem(
        code=f"TEMP-{uuid.uuid4().hex}",
        title=title,
        description=description,
        input_description=normalize_text(
            payload.get("inputDescription")
        ),
        output_description=normalize_text(
            payload.get("outputDescription")
        ),
        constraints_text=normalize_text(
            payload.get("constraints")
        ),
        difficulty=difficulty,
        category=normalize_text(
            payload.get("category")
        ) or None,
        points=points,
        time_limit_ms=time_limit_ms,
        memory_limit_mb=memory_limit_mb,
        status=status,
        created_by=user.id,
        metadata_json=metadata,
    )

    db.session.add(problem)

    # PostgreSQL sinh ID giống cơ chế Exams.
    db.session.flush()

    # Giữ cột legacy code đồng bộ với ID.
    # Client không được tự đặt mã này.
    problem.code = str(problem.id)

    db.session.commit()

    return {
        "success": True,
        "message": "Đã tạo bài lập trình.",
        "problem": serialize_problem(
            problem,
            include_detail=True,
            include_samples=True,
        ),
    }


def update_problem(
    current_user,
    problem_id,
    payload,
):
    user = require_manager(current_user)

    problem = find_problem(problem_id)

    if not problem:
        raise OJError(
            "Không tìm thấy bài lập trình.",
            404,
        )

    require_problem_owner(user, problem)

    if problem.status == "PUBLISHED" and not is_admin(user):
        raise OJError("Đề đã công khai: phải gửi bản sửa để Admin duyệt.", 403)

    # -------------------------------------------------
    # 1. VALIDATE + NORMALIZE
    #
    # Không thay đổi ORM object ở giai đoạn này.
    # Nếu bất kỳ field nào không hợp lệ, request thất bại
    # mà problem vẫn giữ nguyên trạng thái ban đầu.
    # -------------------------------------------------

    changes = {}

    if "title" in payload:
        title = normalize_text(
            payload.get("title")
        )

        if not title:
            raise OJError(
                "Tên bài không được để trống."
            )

        if len(title) > 500:
            raise OJError(
                "Tên bài tối đa 500 ký tự."
            )

        changes["title"] = title

    if "description" in payload:
        description = normalize_text(
            payload.get("description")
        )

        if not description:
            raise OJError(
                "Nội dung đề không được để trống."
            )

        changes["description"] = description

    mappings = {
        "inputDescription":
            "input_description",
        "outputDescription":
            "output_description",
        "constraints":
            "constraints_text",
        "category":
            "category",
    }

    for source, target in mappings.items():
        if source in payload:
            value = normalize_text(
                payload.get(source)
            )

            changes[target] = value or None

    if "difficulty" in payload:
        difficulty = normalize_upper(
            payload.get("difficulty")
        )

        if difficulty not in DIFFICULTIES:
            raise OJError(
                "Độ khó không hợp lệ."
            )

        changes["difficulty"] = difficulty

    if "status" in payload:
        status = normalize_upper(
            payload.get("status")
        )

        if status not in PROBLEM_STATUSES:
            raise OJError(
                "Trạng thái bài không hợp lệ."
            )

        if not is_admin(user) and status != "DRAFT":
            raise OJError(
                "Giáo viên không được tự xuất bản bài.",
                403,
            )

        changes["status"] = status

    integer_fields = {
        "points": "points",
        "timeLimitMs": "time_limit_ms",
        "memoryLimitMb": "memory_limit_mb",
    }

    for source, target in integer_fields.items():
        if source not in payload:
            continue

        try:
            value = int(
                payload.get(source)
            )
        except (TypeError, ValueError):
            raise OJError(
                f"{source} không hợp lệ."
            )

        if value <= 0:
            raise OJError(
                f"{source} phải lớn hơn 0."
            )

        if (
            source == "timeLimitMs"
            and value > MAX_TIME_LIMIT_MS
        ):
            raise OJError(
                "Giới hạn thời gian tối đa là 30000 ms."
            )

        changes[target] = value

    if "metadata" in payload:
        metadata = payload.get("metadata")

        if not isinstance(metadata, dict):
            raise OJError(
                "metadata phải là object."
            )

        changes["metadata_json"] = metadata

    # -------------------------------------------------
    # 2. APPLY
    #
    # Chỉ tới đây mới mutate ORM object vì toàn bộ
    # payload đã vượt qua validation.
    # -------------------------------------------------

    for target, value in changes.items():
        setattr(
            problem,
            target,
            value,
        )

    problem.updated_at = utc_now()

    db.session.commit()

    return {
        "success": True,
        "message": "Đã cập nhật bài lập trình.",
        "problem": serialize_problem(
            problem,
            include_detail=True,
            include_samples=True,
        ),
    }


def add_testcase(
    current_user,
    problem_id,
    payload,
):
    user = require_manager(current_user)

    problem = find_problem(problem_id)

    if not problem:
        raise OJError(
            "Không tìm thấy bài lập trình.",
            404,
        )

    require_problem_owner(user, problem)

    if problem.status == "PUBLISHED" and not is_admin(user):
        raise OJError("Đề đã công khai: phải gửi bản sửa để Admin duyệt.", 403)

    if "input" not in payload:
        raise OJError(
            "Thiếu dữ liệu input."
        )

    if "output" not in payload:
        raise OJError(
            "Thiếu đáp án output."
        )

    input_data = str(
        payload.get("input")
        if payload.get("input") is not None
        else ""
    )

    output_data = str(
        payload.get("output")
        if payload.get("output") is not None
        else ""
    )

    position = payload.get("position")

    if position is None:
        last_position = (
            db.session.execute(
                db.select(
                    db.func.max(
                        OJTestCase.position
                    )
                )
                .where(
                    OJTestCase.problem_id
                    == problem.id
                )
            )
            .scalar()
        )

        position = (
            int(last_position) + 1
            if last_position is not None
            else 1
        )
    else:
        try:
            position = int(position)
        except (TypeError, ValueError):
            raise OJError(
                "Vị trí testcase không hợp lệ."
            )

    if position < 1:
        raise OJError(
            "Vị trí testcase phải từ 1."
        )

    existing = (
        db.session.execute(
            db.select(OJTestCase)
            .where(
                OJTestCase.problem_id
                == problem.id,
                OJTestCase.position
                == position,
            )
        )
        .scalar_one_or_none()
    )

    if existing:
        raise OJError(
            "Vị trí testcase đã tồn tại.",
            409,
        )

    points = payload.get("points")

    if points is not None:
        try:
            points = int(points)
        except (TypeError, ValueError):
            raise OJError(
                "Điểm testcase không hợp lệ."
            )

        if points < 0:
            raise OJError(
                "Điểm testcase không được âm."
            )

    testcase = OJTestCase(
        problem_id=problem.id,
        position=position,
        input_data=input_data,
        expected_output=output_data,
        is_sample=bool(
            payload.get("isSample", False)
        ),
        points=points,
    )

    db.session.add(testcase)
    db.session.commit()

    # Cố ý không trả expected_output của hidden testcase.
    data = {
        "id": testcase.id,
        "position": testcase.position,
        "isSample": testcase.is_sample,
        "points": testcase.points,
    }

    if testcase.is_sample:
        data.update({
            "input": testcase.input_data,
            "output": testcase.expected_output,
        })

    return {
        "success": True,
        "message": "Đã thêm testcase.",
        "testcase": data,
    }


def create_submission(
    current_user,
    problem_id,
    payload,
):
    user = require_user(current_user)

    problem = find_problem(problem_id)

    if not problem:
        raise OJError(
            "Không tìm thấy bài lập trình.",
            404,
        )

    if not can_access_problem(user, problem):
        raise OJError(
            "Không tìm thấy bài lập trình.",
            404,
        )

    language = normalize_upper(
        payload.get("language")
    )

    if language not in SUPPORTED_LANGUAGES:
        raise OJError(
            "Ngôn ngữ lập trình không được hỗ trợ."
        )

    source_code = str(
        payload.get("sourceCode")
        or ""
    )

    if not source_code.strip():
        raise OJError(
            "Source problem_id không được để trống."
        )

    # Giới hạn 256 KiB cho một bài nộp.
    if len(
        source_code.encode("utf-8")
    ) > 256 * 1024:
        raise OJError(
            "Source problem_id vượt quá giới hạn 256 KiB.",
            413,
        )

    submission = OJSubmission(
        problem_id=problem.id,
        user_id=user.id,
        language=language,
        source_code=source_code,
        verdict="PENDING",
        score=0,
    )

    db.session.add(submission)
    db.session.commit()

    # VNOJ/DMOJ is the only judge backend.
    # PostgreSQL submission is committed before HTTP dispatch.
    from oj.dmoj.client import (
        DMOJClientError,
        submit_to_dmoj,
    )

    metadata = (
        problem.metadata_json
        if isinstance(problem.metadata_json, dict)
        else {}
    )

    vnoj_problem_code = metadata.get("vnoj_problem_code")

    if isinstance(vnoj_problem_code, str) and vnoj_problem_code.strip():
        try:
            dispatch_result = submit_to_dmoj(
                zuny_submission_id=submission.id,
                problem_code=vnoj_problem_code.strip(),
                language=submission.language,
                source_code=submission.source_code,
            )

            current_app.logger.info(
                "VNOJ dispatch accepted: zuny_id=%s vnoj_id=%s",
                submission.id,
                dispatch_result["vnoj_submission_id"],
            )

        except (DMOJClientError, ValueError) as exc:
            current_app.logger.warning(
                "VNOJ dispatch pending: zuny_id=%s reason=%s",
                submission.id,
                str(exc),
            )
    else:
        current_app.logger.warning(
            "VNOJ mapping missing: problem_id=%s submission_id=%s",
            problem.id,
            submission.id,
        )

    return {
        "success": True,
        "message":
            "Đã tiếp nhận bài nộp và đưa vào hàng chờ chấm.",
        "submission": serialize_submission(
            submission,
            include_source=True,
        ),
    }


def get_my_submissions(
    current_user,
    problem_id=None,
):
    user = require_user(current_user)

    statement = (
        db.select(OJSubmission)
        .where(
            OJSubmission.user_id
            == user.id
        )
    )

    if problem_id:
        problem = find_problem(problem_id)

        if not problem:
            raise OJError(
                "Không tìm thấy bài lập trình.",
                404,
            )

        statement = statement.where(
            OJSubmission.problem_id
            == problem.id
        )

    submissions = (
        db.session.execute(
            statement.order_by(
                OJSubmission.created_at.desc(),
                OJSubmission.id.desc(),
            )
            .limit(100)
        )
        .scalars()
        .all()
    )

    return {
        "success": True,
        "submissions": [
            serialize_submission(row)
            for row in submissions
        ],
    }


def get_submission_detail(
    current_user,
    submission_id,
):
    user = require_user(current_user)

    submission = db.session.get(
        OJSubmission,
        submission_id,
    )

    if not submission:
        raise OJError(
            "Không tìm thấy bài nộp.",
            404,
        )

    if (
        int(submission.user_id)
        != int(user.id)
        and not is_teacher(user)
    ):
        raise OJError(
            "Bạn không có quyền xem bài nộp này.",
            403,
        )

    # Synchronize only after authorization has succeeded.
    # The integration remains disabled outside the isolated test DB.
    if submission.verdict == "PENDING":
        try:
            from sqlalchemy import text as sa_text
            from oj.dmoj.sync import sync_submission_result

            current_database = db.session.execute(
                sa_text("SELECT current_database()")
            ).scalar_one()

            if current_database == "zuny_oj_security_test":
                # Release the read transaction before the remote HTTP call.
                db.session.rollback()

                sync_submission_result(int(submission.id))

                # Discard any stale ORM state after the atomic update.
                db.session.expire_all()
                submission = db.session.get(
                    OJSubmission,
                    submission_id,
                )

        except Exception:
            # Temporary VNOJ failures must not break the detail API.
            db.session.rollback()
            submission = db.session.get(
                OJSubmission,
                submission_id,
            )

    return {
        "success": True,
        "submission": serialize_submission(
            submission,
            include_source=True,
            include_results=True,
        ),
    }


def analyze_submission(
    current_user,
    submission_id,
):
    user = require_user(current_user)
    submission = db.session.get(OJSubmission, submission_id)

    if not submission:
        raise OJError("Không tìm thấy bài nộp.", 404)

    if int(submission.user_id) != int(user.id):
        raise OJError("Bạn không có quyền phân tích bài nộp này.", 403)

    problem = db.session.get(OJProblem, submission.problem_id)
    detail = serialize_submission(submission, include_results=True)

    try:
        analysis = create_oj_analysis(
            problem,
            submission,
            detail.get("testResults", []),
        )
    except Exception as error:
        from chatbot.service import ChatbotError

        if isinstance(error, ChatbotError):
            raise OJError(error.args[0], 503)
        raise

    return {
        "success": True,
        "submissionId": submission.id,
        "analysis": analysis,
    }


# Review snapshots are separate from the live published problem and testcase rows.
_REVIEW_FIELDS = {
    "title": "title", "description": "description", "category": "category",
    "difficulty": "difficulty", "points": "points",
    "timeLimitMs": "time_limit_ms", "memoryLimitMb": "memory_limit_mb",
    "metadata": "metadata_json",
}

def _review_enabled():
    # Default secure, including on Production with missing config.
    return not (current_app.debug and current_app.config.get("OJ_LOCAL_REVIEW_BYPASS", False))

def _review_payload(payload):
    if not isinstance(payload, dict):
        raise OJError("Dữ liệu duyệt không hợp lệ.")
    fields = payload.get("problem")
    cases = payload.get("testcases")
    if not isinstance(fields, dict) or not isinstance(cases, list) or not cases:
        raise OJError("Cần nội dung bài và ít nhất một testcase.")
    if set(fields) - set(_REVIEW_FIELDS):
        raise OJError("Có trường nội dung không được hỗ trợ.")
    required = set(_REVIEW_FIELDS) - {"category", "metadata"}
    if required - set(fields):
        raise OJError("Thiếu thông tin bài toán.")
    if not normalize_text(fields.get("title")) or len(fields["title"]) > 500:
        raise OJError("Tên bài không hợp lệ.")
    if not normalize_text(fields.get("description")):
        raise OJError("Nội dung bài không được để trống.")
    if normalize_upper(fields.get("difficulty")) not in DIFFICULTIES:
        raise OJError("Độ khó không hợp lệ.")
    for key in ("points", "timeLimitMs", "memoryLimitMb"):
        if type(fields.get(key)) is not int or fields[key] <= 0:
            raise OJError(f"{key} phải là số nguyên dương.")
    if fields["timeLimitMs"] > MAX_TIME_LIMIT_MS:
        raise OJError("Giới hạn thời gian vượt 30000 ms.")
    if "metadata" in fields and not isinstance(fields["metadata"], dict):
        raise OJError("metadata không hợp lệ.")
    if "category" in fields and fields["category"] is not None and not isinstance(fields["category"], str):
        raise OJError("category không hợp lệ.")
    if len(cases) > 10000:
        raise OJError("Quá nhiều testcase.")
    normalized = []
    for i, case in enumerate(cases, 1):
        if not isinstance(case, dict) or not isinstance(case.get("input"), str) or not isinstance(case.get("output"), str):
            raise OJError(f"Testcase {i} thiếu input/output.")
        pts = case.get("points", 1)
        if pts is not None and (type(pts) is not int or pts < 0):
            raise OJError(f"Điểm testcase {i} không hợp lệ.")
        normalized.append({"position": i, "input": case["input"], "output": case["output"], "isSample": case.get("isSample") is True, "points": pts})
    clean = {key: fields[key] for key in fields}
    return {"problem": clean, "testcases": normalized}

def submit_problem_review(current_user, problem_id, payload):
    user = require_manager(current_user)
    problem = find_problem(problem_id)
    if not problem:
        raise OJError("Không tìm thấy bài.", 404)
    require_problem_owner(user, problem)
    snapshot = _review_payload(payload)
    if not _review_enabled() or is_admin(user):
        # Use same transaction as review approval, without creating a pending record.
        _apply_review_snapshot(problem, snapshot)
        db.session.commit()
        return {"success": True, "state": "APPROVED", "problemId": problem.id}
    existing = db.session.execute(db.select(OJProblemReview).where(
        OJProblemReview.problem_id == problem.id,
        OJProblemReview.state == "PENDING_REVIEW",
    )).scalar_one_or_none()
    if existing:
        raise OJError("Bài đang có phiên bản chờ duyệt.", 409)
    review = OJProblemReview(
        problem_id=problem.id, requested_by=user.id, state="PENDING_REVIEW",
        snapshot=snapshot, base_updated_at=problem.updated_at,
    )
    db.session.add(review)
    db.session.commit()
    return {"success": True, "state": "PENDING_REVIEW", "reviewId": review.id, "problemId": problem.id}

def _apply_review_snapshot(problem, snapshot):
    fields = snapshot["problem"]
    for source, target in _REVIEW_FIELDS.items():
        if source in fields:
            setattr(problem, target, fields[source])
    # Historical submission results reference testcase IDs. Never delete or
    # mutate those rows after submissions exist; their original input/output
    # must remain attributable to the results that were graded against them.
    existing_cases = db.session.execute(
        db.select(OJTestCase).where(OJTestCase.problem_id == problem.id)
        .order_by(OJTestCase.position)
    ).scalars().all()
    has_submissions = db.session.execute(
        db.select(OJSubmission.id).where(OJSubmission.problem_id == problem.id).limit(1)
    ).first() is not None
    if has_submissions:
        old_cases = [
            (row.position, row.input_data, row.expected_output, row.is_sample, row.points)
            for row in existing_cases
        ]
        new_cases = [
            (case["position"], case["input"], case["output"], case["isSample"], case["points"])
            for case in snapshot["testcases"]
        ]
        if old_cases != new_cases:
            raise OJError(
                "Bài đã có lượt nộp; không thể thay đổi testcase vì sẽ ảnh hưởng lịch sử chấm.",
                409,
            )
        # Testcases are unchanged: preserve their IDs and submission links.
    else:
        db.session.query(OJTestCase).filter(OJTestCase.problem_id == problem.id).delete(synchronize_session=False)
        db.session.flush()
        for case in snapshot["testcases"]:
            db.session.add(OJTestCase(
                problem_id=problem.id, position=case["position"],
                input_data=case["input"], expected_output=case["output"],
                is_sample=case["isSample"], points=case["points"],
            ))
    problem.status = "PUBLISHED"
    problem.updated_at = utc_now()

def list_problem_reviews(current_user):
    user = require_manager(current_user)
    query = db.select(OJProblemReview).order_by(OJProblemReview.id.desc())
    if not is_admin(user):
        query = query.where(OJProblemReview.requested_by == user.id)
    reviews = db.session.execute(query).scalars().all()
    return {"success": True, "reviews": [{
        "id": row.id, "problemId": row.problem_id, "state": row.state,
        "requestedBy": row.requested_by, "reviewedBy": row.reviewed_by,
        "reviewNote": row.review_note, "createdAt": row.created_at.isoformat() if row.created_at else None,
        "title": (row.snapshot or {}).get("problem", {}).get("title", ""),
        "testcaseCount": len((row.snapshot or {}).get("testcases", [])),
    } for row in reviews]}

def decide_problem_review(current_user, review_id, payload):
    user = require_manager(current_user)
    if not is_admin(user):
        raise OJError("Chỉ ADMIN_DEV được duyệt đề.", 403)
    review = db.session.execute(db.select(OJProblemReview).where(
        OJProblemReview.id == review_id).with_for_update()).scalar_one_or_none()
    if not review:
        raise OJError("Không tìm thấy yêu cầu duyệt.", 404)
    if review.state != "PENDING_REVIEW":
        raise OJError("Yêu cầu đã được xử lý.", 409)
    decision = normalize_upper((payload or {}).get("decision"))
    if decision not in {"APPROVED", "REJECTED"}:
        raise OJError("Quyết định phải là APPROVED hoặc REJECTED.")
    problem = db.session.execute(db.select(OJProblem).where(
        OJProblem.id == review.problem_id).with_for_update()).scalar_one_or_none()
    if not problem:
        raise OJError("Bài toán không còn tồn tại.", 404)
    if decision == "APPROVED":
        # Reject stale snapshots: another admin or process modified live problem.
        if problem.updated_at != review.base_updated_at:
            raise OJError("Bài toán đã thay đổi sau khi gửi duyệt. Cần gửi lại.", 409)
        _apply_review_snapshot(problem, _review_payload(review.snapshot))
    review.state = decision
    review.reviewed_by = user.id
    review.reviewed_at = utc_now()
    review.review_note = normalize_text((payload or {}).get("note"))[:2000]
    db.session.commit()
    return {"success": True, "state": decision, "reviewId": review.id}

# ZUNY OJ contest service — append to backend/oj/oj_service.py
# Requires existing helpers: db, OJError, require_user, require_manager,
# is_admin, normalize_text, normalize_upper, utc_now.
from datetime import datetime as _contest_datetime
from models.oj import OJContest, OJContestProblem

_CONTEST_STATUSES = {'DRAFT', 'PUBLISHED', 'ARCHIVED'}


def _contest_timestamp(value, field):
    if value is None or value == '':
        return None
    if not isinstance(value, str):
        raise OJError(f'{field} phải là chuỗi thời gian ISO 8601.')
    try:
        result = _contest_datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError:
        raise OJError(f'{field} không đúng định dạng ISO 8601.')
    if result.tzinfo is None or result.utcoffset() is None:
        raise OJError(f'{field} phải chứa múi giờ.')
    return result


def _contest_fields(payload, contest=None):
    if not isinstance(payload, dict):
        raise OJError('Dữ liệu kỳ thi không hợp lệ.')
    allowed = {'title', 'description', 'startsAt', 'endsAt', 'status'}
    if set(payload) - allowed:
        raise OJError('Dữ liệu kỳ thi chứa trường không được hỗ trợ.')
    title = normalize_text(payload.get('title', contest.title if contest else ''))
    if not title or len(title) > 300:
        raise OJError('Tên kỳ thi phải dài từ 1 đến 300 ký tự.')
    description = payload.get('description', contest.description if contest else None)
    if description is not None and not isinstance(description, str):
        raise OJError('Mô tả kỳ thi phải là văn bản.')
    status = normalize_upper(payload.get('status', contest.status if contest else 'DRAFT'))
    if status not in _CONTEST_STATUSES:
        raise OJError('Trạng thái kỳ thi không hợp lệ.')
    starts = (_contest_timestamp(payload['startsAt'], 'startsAt') if 'startsAt' in payload
              else (contest.starts_at if contest else None))
    ends = (_contest_timestamp(payload['endsAt'], 'endsAt') if 'endsAt' in payload
            else (contest.ends_at if contest else None))
    if starts is not None and ends is not None and ends <= starts:
        raise OJError('Thời gian kết thúc phải sau thời gian bắt đầu.')
    return title, description, starts, ends, status


def _serialize_contest(contest):
    return {
        'id': contest.id,
        'title': contest.title,
        'description': contest.description or '',
        'startsAt': contest.starts_at.isoformat() if contest.starts_at else None,
        'endsAt': contest.ends_at.isoformat() if contest.ends_at else None,
        'status': contest.status,
        'createdBy': contest.created_by,
        'createdAt': contest.created_at.isoformat() if contest.created_at else None,
        'updatedAt': contest.updated_at.isoformat() if contest.updated_at else None,
    }


def list_contests(current_user):
    user = require_user(current_user)
    statement = db.select(OJContest)
    if not is_admin(user):
        # A teacher can inspect their own drafts; students only published contests.
        from_self = (OJContest.created_by == user.id) if normalize_upper(user.role) == 'TEACHER' else db.false()
        statement = statement.where(db.or_(OJContest.status == 'PUBLISHED', from_self))
    rows = db.session.execute(statement.order_by(OJContest.id.desc())).scalars().all()
    return {'success': True, 'contests': [_serialize_contest(row) for row in rows]}


def create_contest(current_user, payload):
    user = require_manager(current_user)
    title, description, starts, ends, status = _contest_fields(payload)
    if not is_admin(user) and status != 'DRAFT':
        raise OJError('Giáo viên chỉ được tạo kỳ thi ở trạng thái nháp.', 403)
    contest = OJContest(title=title, description=description, starts_at=starts,
                        ends_at=ends, status=status, created_by=user.id)
    db.session.add(contest)
    db.session.commit()
    return {'success': True, 'contest': _serialize_contest(contest)}


def update_contest(current_user, contest_id, payload):
    user = require_manager(current_user)
    contest = db.session.execute(db.select(OJContest).where(
        OJContest.id == contest_id).with_for_update()).scalar_one_or_none()
    if contest is None:
        raise OJError('Không tìm thấy kỳ thi.', 404)
    if not is_admin(user):
        if contest.created_by != user.id:
            raise OJError('Bạn không có quyền sửa kỳ thi này.', 403)
        if contest.status != 'DRAFT':
            raise OJError('Kỳ thi đã công khai không thể sửa trực tiếp.', 403)
    title, description, starts, ends, status = _contest_fields(payload, contest)
    if not is_admin(user) and status != 'DRAFT':
        raise OJError('Chỉ quản trị viên được thay đổi trạng thái kỳ thi.', 403)
    contest.title = title
    contest.description = description
    contest.starts_at = starts
    contest.ends_at = ends
    contest.status = status
    contest.updated_at = utc_now()
    db.session.commit()
    return {'success': True, 'contest': _serialize_contest(contest)}
