import { useEffect, useState } from 'react';
import classroomApi from '../../../services/classroomApi.js';
import { useAuth } from '../../../contexts/AuthContext.jsx';
import { getUserAvatar } from '../../../utils/userAvatar.js';
import styles from './attendanceQrStyles.js';

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function getInitial(value) {
  return String(value || '').trim().charAt(0).toUpperCase() || '?';
}

export function AttendanceQrCheckIn({ classId, date, token }) {
  const { user, userDetails } = useAuth();
  const authUser = user;

  const [classInfo, setClassInfo] = useState(null);
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [checkInChoice, setCheckInChoice] = useState('present');
  const [excusedNote, setExcusedNote] = useState('');
  const [clock, setClock] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(
      () => setClock(Date.now()),
      1000
    );

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!classId || !date || !token) {
      setStatus('invalid');
      setError('Mã QR không hợp lệ.');
      setClassInfo(null);
      setSession(null);
      return undefined;
    }

    let cancelled = false;

    const loadQrSession = async () => {
      try {
        const [classResult, qrResult] = await Promise.all([
          classroomApi.getClassroom(classId),
          classroomApi.getAttendanceQr(
            classId,
            date,
            { token }
          ),
        ]);

        if (cancelled) return;

        setClassInfo(
          classResult?.classroom
          || classResult?.class
          || null
        );

        const attendance =
          qrResult?.attendance
          || null;

        setSession(attendance);

        if (!qrResult?.valid) {
          setStatus('expired');
          setError(
            'Mã QR đã hết hiệu lực hoặc đã được thay mới.'
          );
          return;
        }

        if (
          !attendance?.qrExpiresAt
          || Date.now() >= Number(attendance.qrExpiresAt)
        ) {
          setStatus('expired');
          setError(
            'Mã QR đã hết hạn. Vui lòng quét mã mới từ giáo viên.'
          );
          return;
        }

        setStatus((current) =>
          current === 'success'
            ? current
            : 'ready'
        );

        setError('');
      } catch (apiError) {
        if (cancelled) return;

        setSession(null);
        setStatus('invalid');
        setError(
          apiError?.message
          || 'Không thể kiểm tra mã QR.'
        );
      }
    };

    loadQrSession();

    const intervalId = window.setInterval(
      loadQrSession,
      4000
    );

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [classId, date, token]);

  const expiresIn = Math.max(
    0,
    Number(session?.qrExpiresAt || 0) - clock
  );

  const minutes = Math.floor(
    expiresIn / 60000
  );

  const seconds = Math.floor(
    (expiresIn % 60000) / 1000
  );

  const confirmCheckIn = async () => {
    if (
      !authUser?.uid
      || !session
      || session.qrToken !== token
      || Date.now() >= Number(session.qrExpiresAt || 0)
    ) {
      return;
    }

    if (
      normalizeText(userDetails?.role).includes('teacher')
    ) {
      setError(
        'Tài khoản giáo viên không được điểm danh như học sinh.'
      );
      return;
    }

    if (
      checkInChoice === 'excused'
      && !excusedNote.trim()
    ) {
      setError(
        'Vui lòng nhập lý do vắng có phép.'
      );
      return;
    }

    try {
      setConfirming(true);
      setError('');

      const result =
        await classroomApi.attendanceCheckIn(
          classId,
          date,
          {
            token,
            status: checkInChoice,
            note:
              checkInChoice === 'excused'
                ? excusedNote.trim()
                : '',
          }
        );

      if (result?.attendance) {
        setSession(result.attendance);
      }

      setStatus('success');
    } catch (apiError) {
      setError(
        apiError?.message
        || 'Không thể xác nhận điểm danh.'
      );
    } finally {
      setConfirming(false);
    }
  };

  const checkInDisplayName =
    userDetails?.fullName ||
    userDetails?.displayName ||
    userDetails?.name ||
    authUser?.displayName ||
    authUser?.email?.split('@')?.[0] ||
    'Học sinh';

  const checkInAvatar = getUserAvatar({
    ...(authUser || {}),
    ...(userDetails || {}),
  });

  return (
    <main className="qr-student-checkin-page">
      <section className="qr-student-checkin-card">
        <div className="qr-checkin-logo">✓</div>
        <span className="qr-checkin-eyebrow">Điểm danh QR</span>
        <h1>{classInfo?.name || 'Lớp học'}</h1>

        {status === 'loading'
          ? <p>Đang kiểm tra mã điểm danh...</p>
          : null}

        {!authUser
          ? (
            <div className="qr-checkin-message warning">
              <strong>Bạn chưa đăng nhập</strong>
              <span>Vui lòng đăng nhập tài khoản học sinh rồi quét lại mã QR.</span>
            </div>
          )
          : null}

        {status === 'ready' && authUser
          ? (
            <>
              <div className="qr-checkin-student">
                <span className={checkInAvatar ? 'has-image' : ''}>
                  {checkInAvatar
                    ? (
                      <img
                        src={checkInAvatar}
                        alt=""
                        referrerPolicy="no-referrer"
                      />
                    )
                    : getInitial(checkInDisplayName)}
                </span>

                <div>
                  <strong>{checkInDisplayName}</strong>
                  <small>{authUser.email || userDetails?.email || ''}</small>
                </div>
              </div>

              <div className="qr-checkin-time">
                Mã còn hiệu lực{' '}
                <b>
                  {minutes}:{String(seconds).padStart(2, '0')}
                </b>
              </div>

              <div className="qr-checkin-choice">
                <button
                  type="button"
                  className={checkInChoice === 'present' ? 'active' : ''}
                  onClick={() => {
                    setCheckInChoice('present');
                    setError('');
                  }}
                >
                  ✓ Có mặt
                </button>

                <button
                  type="button"
                  className={
                    checkInChoice === 'excused'
                      ? 'active excused'
                      : 'excused'
                  }
                  onClick={() => {
                    setCheckInChoice('excused');
                    setError('');
                  }}
                >
                  ○ Vắng có phép
                </button>
              </div>

              {checkInChoice === 'excused'
                ? (
                  <label className="qr-excused-note">
                    <span>Lý do vắng có phép</span>
                    <textarea
                      rows="3"
                      value={excusedNote}
                      onChange={(event) =>
                        setExcusedNote(event.target.value)}
                      placeholder="Nhập lý do để giáo viên thấy trong ghi chú điểm danh..."
                    />
                  </label>
                )
                : null}

              <button
                type="button"
                className="qr-confirm-btn"
                onClick={confirmCheckIn}
                disabled={confirming}
              >
                {confirming
                  ? 'Đang xác nhận...'
                  : 'Xác nhận điểm danh'}
              </button>
            </>
          )
          : null}

        {status === 'success'
          ? (
            <div className="qr-checkin-success">
              <span>✓</span>
              <strong>Điểm danh thành công</strong>
              <p>
                Giáo viên sẽ thấy trạng thái{' '}
                {checkInChoice === 'excused'
                  ? 'Vắng có phép'
                  : 'Có mặt'}{' '}
                theo thời gian thực.
              </p>
            </div>
          )
          : null}

        {error
          ? <p className="qr-checkin-error">{error}</p>
          : null}
      </section>

      <style>{styles}</style>
    </main>
  );
}



export default AttendanceQrCheckIn;
