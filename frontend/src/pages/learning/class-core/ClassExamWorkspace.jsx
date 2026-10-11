import { lazy, Suspense, useMemo } from 'react';
import { DataUnavailable } from '../class-ui/ClassWidgets.jsx';
import useExamsPage from '../../../hooks/exam/useExamsPage.js';

const CreateExamModal = lazy(() => import('../../../components/exam/CreateExamModal.jsx'));

function getClassExamTypeText(exam = {}) {
  const questions = Array.isArray(exam.questions) ? exam.questions : [];
  const hasEssay = questions.some((question) => question.type === 'essay');
  const hasChoice = questions.some((question) => question.type !== 'essay');
  if (hasEssay && hasChoice) return 'Trắc nghiệm + Tự luận';
  if (hasEssay) return 'Tự luận';
  return 'Trắc nghiệm';
}

function getClassExamStatus(exam = {}) {
  if (exam.isActive) return { id: 'active', label: 'Đang mở' };
  if (exam.isUpcoming) return { id: 'draft', label: 'Nháp' };
  return { id: 'ended', label: 'Đã đóng' };
}

function formatClassExamDate(value) {
  if (!value) return 'Chưa đặt hạn';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Chưa đặt hạn';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function ClassExamWorkspace({ selectedClass }) {
  const page = useExamsPage();
  const allExams = Array.isArray(page.exams) ? page.exams : [];
  const visibleExams = Array.isArray(page.visibleExams) ? page.visibleExams : [];
  const examCounts = useMemo(() => ({
    total: allExams.length,
    active: allExams.filter((exam) => exam.isActive).length,
    draft: allExams.filter((exam) => exam.isUpcoming).length,
    ended: allExams.filter((exam) => !exam.isActive && !exam.isUpcoming).length,
  }), [allExams]);

  if (page.roleLoading) {
    return (
      <div className="class-exam-page">
        <section className="class-exam-head"><div><span>Đề thi · đồng bộ module Đề thi</span><h3>Đề thi</h3><p>Đang tải dữ liệu đề thi của giáo viên...</p></div></section>
        <div className="class-exam-skeleton">{Array.from({ length: 5 }, (_, index) => <i key={index} />)}</div>
      </div>
    );
  }

  if (!page.canManage) {
    return <div className="class-exam-page"><DataUnavailable icon="▤" text="Tài khoản hiện tại không có quyền quản lý đề thi." /></div>;
  }

  return (
    <div className="class-exam-page">
      <section className="class-exam-head">
        <div>
          <span>Đề thi · đồng bộ module Đề thi</span>
          <h3>Đề thi</h3>
          <p>Hiển thị trực tiếp các đề thi từ module Đề thi trong workspace lớp {selectedClass?.name || 'hiện tại'}.</p>
        </div>
        <div className="class-exam-head-actions">
          <button type="button" className="class-exam-secondary-btn" onClick={() => window.location.assign('/exams')}>Mở trang Đề thi ↗</button>
          <button type="button" className="class-exam-create-btn" onClick={page.openCreateModal}>＋ Tạo đề thi</button>
        </div>
      </section>

      <section className="class-exam-stat-grid">
        <article><span>▤</span><div><strong>{examCounts.total}</strong><small>Tổng đề thi</small></div></article>
        <article className="active"><span>●</span><div><strong>{examCounts.active}</strong><small>Đang mở</small></div></article>
        <article className="draft"><span>◷</span><div><strong>{examCounts.draft}</strong><small>Nháp / sắp mở</small></div></article>
        <article className="ended"><span>✓</span><div><strong>{examCounts.ended}</strong><small>Đã đóng</small></div></article>
      </section>

      <section className="class-exam-toolbar">
        <div className="class-exam-tabs" role="tablist" aria-label="Trạng thái đề thi">
          {[['all','Tất cả'],['published','Đang mở'],['draft','Nháp'],['ended','Đã đóng']].map(([value, label]) => (
            <button type="button" key={value} className={page.publishFilter === value ? 'active' : ''} onClick={() => page.setPublishFilter(value)}>{label}</button>
          ))}
        </div>
        <div className="class-exam-filters">
          <label className="class-exam-search"><span>⌕</span><input value={page.search || ''} onChange={(event) => page.setSearch(event.target.value)} placeholder="Tìm theo tên, môn học hoặc mã đề..." /></label>
          <select value={page.privacyFilter || 'all'} onChange={(event) => page.setPrivacyFilter(event.target.value)} aria-label="Lọc quyền riêng tư">
            <option value="all">Tất cả đề thi</option>
            <option value="public">Công khai</option>
            <option value="private">Riêng tư</option>
          </select>
        </div>
      </section>

      {visibleExams.length ? (
        <section className="class-exam-table-wrap">
          <div className="class-exam-table">
            <div className="class-exam-row class-exam-row-head"><span>Tên đề thi</span><span>Môn</span><span>Loại</span><span>Thời gian</span><span>Hạn nộp</span><span>Trạng thái</span><span>Thao tác</span></div>
            {visibleExams.map((exam) => {
              const status = getClassExamStatus(exam);
              return (
                <div className="class-exam-row" key={exam.id}>
                  <div className="class-exam-title"><strong>{exam.title || 'Đề thi chưa đặt tên'}</strong><small>{exam.questionCount || exam.questions?.length || 0} câu hỏi{Array.isArray(exam.studentResults) ? ` · ${exam.studentResults.length} học sinh` : ''}</small></div>
                  <span>{exam.subject || '—'}</span>
                  <span>{getClassExamTypeText(exam)}</span>
                  <span>◷ {exam.duration || 45} phút</span>
                  <span>{formatClassExamDate(exam.closeDate)}</span>
                  <span><b className={`class-exam-status ${status.id}`}>{status.label}</b></span>
                  <div className="class-exam-actions">
                    <button type="button" title="Xem trước" aria-label="Xem trước đề thi" onClick={() => page.previewExam?.(exam)}>◉</button>
                    <button type="button" title="Chỉnh sửa" aria-label="Chỉnh sửa đề thi" onClick={() => page.openEditModal?.(exam)}>✎</button>
                    <button type="button" title="Sao chép liên kết" aria-label="Sao chép liên kết đề thi" onClick={() => page.copyExamLink?.(exam)}>⧉</button>
                    <button type="button" className="danger" title="Xóa" aria-label="Xóa đề thi" onClick={() => page.setDeleteConfirmExam?.(exam)}>×</button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="class-exam-empty"><span>▤</span><strong>Không tìm thấy đề thi phù hợp</strong><p>Thử đổi trạng thái, quyền riêng tư hoặc từ khóa tìm kiếm.</p></section>
      )}

      {page.createOpen ? (
        <Suspense fallback={null}>
          <CreateExamModal
        open={Boolean(page.createOpen)}
        onClose={page.closeCreateModal}
        onSave={page.saveExam}
        editingExam={page.editingExam}
        teacherSubject={page.teacherSubject}
        teacherName={page.teacherName}
        availableClasses={page.classes || []}
          />
        </Suspense>
      ) : null}

      {page.deleteConfirmExam ? (
        <div className="modal-backdrop" onMouseDown={page.closeDeleteConfirm}>
          <div className="class-modal class-exam-delete-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head"><div><p>Xác nhận xóa</p><h2>Xóa đề thi?</h2></div><button type="button" className="icon-btn" onClick={page.closeDeleteConfirm}>×</button></div>
            <p className="class-exam-delete-copy">Bạn có chắc muốn xóa đề “{page.deleteConfirmExam.title || 'Chưa có tên'}” khỏi hệ thống Đề thi?</p>
            <div className="modal-actions"><button type="button" className="ghost-btn" onClick={page.closeDeleteConfirm}>Hủy</button><button type="button" className="danger-btn" onClick={page.confirmDeleteExam}>Xóa đề thi</button></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}


export default ClassExamWorkspace;
