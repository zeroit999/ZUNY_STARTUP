import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import Editor from '@monaco-editor/react';
import { BarChart3, BookOpen, ClipboardList, Code2, MessageSquare, Trophy } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext.jsx';
import ojApi from '../../services/ojApi.js';
import LcojProblemEditor from './LcojProblemEditor.jsx';
import MaintenanceState from '../../components/ui/MaintenanceState.jsx';

const difficultyLabels = { EASY: 'Dễ', MEDIUM: 'Trung bình', HARD: 'Khó' };
const verdictLabels = {
  PENDING: 'Đang chờ',
  JUDGING: 'Đang chấm',
  AC: 'Accepted',
  WA: 'Wrong Answer',
  TLE: 'Time Limit',
  MLE: 'Memory Limit',
  RE: 'Runtime Error',
  CE: 'Compile Error',
  IE: 'Internal Error',
  SC: 'Skipped / Chưa chấm',
};

function Icon({ name, size = 18 }) {
  const paths = {
    code: <><path d="m8 9-3 3 3 3M16 9l3 3-3 3M14 5l-4 14" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    trophy: <><path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4Z" /><path d="M7 6H4v2a4 4 0 0 0 4 4M17 6h3v2a4 4 0 0 1-4 4" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function EmptyState({ title, description }) {
  return <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
    <p className="font-extrabold text-slate-700">{title}</p>
    <p className="mt-2 text-sm text-slate-500">{description}</p>
  </div>;
}

function Heading({ title, description }) {
  return <div className="mb-7">
    <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
    <p className="mt-1.5 text-sm text-slate-500">{description}</p>
  </div>;
}

function ProblemDetail({ problemId, onBack }) {
  const [data, setData] = useState(null);
  // 58.20D: Restore language and source atomically on mount.
  const [codeDraft, setCodeDraft] = useState(() => {
    try {
      const savedLanguage =
        localStorage.getItem(`zuny:oj:language:${problemId}`) || 'CPP23';
      const savedCode =
        localStorage.getItem(
          `zuny:oj:solution:${problemId}:${savedLanguage}`
        ) || '';
      return { language: savedLanguage, sourceCode: savedCode };
    } catch {
      return { language: 'CPP23', sourceCode: '' };
    }
  });
  const { language, sourceCode } = codeDraft;
  const setSourceCode = (next) => {
    setCodeDraft((current) => ({
      ...current,
      sourceCode: typeof next === 'function'
        ? next(current.sourceCode)
        : next,
    }));
  };
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submissionId, setSubmissionId] = useState(null);
  const [submissionResult, setSubmissionResult] = useState(null);
  const [pollError, setPollError] = useState('');
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  // oj-hide-page-scrollbar-v2
  useEffect(() => {
    document.documentElement.classList.add('zuny-oj-hide-page-scrollbar');
    document.body.classList.add('zuny-oj-hide-page-scrollbar');
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';

    return () => {
      document.documentElement.classList.remove('zuny-oj-hide-page-scrollbar');
      document.body.classList.remove('zuny-oj-hide-page-scrollbar');
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, []);

  const [aiOpen, setAiOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const aiRequestRef = useRef(null);
  const aiGenerationRef = useRef(0);
  const submittingRef = useRef(false);
  // oj-split-workspace-v1
  const workspaceRef = useRef(null);
  const dragCleanupRef = useRef(null);
  const [splitPercent, setSplitPercent] = useState(() => {
    try {
      const saved = Number(localStorage.getItem('zuny:oj:split:v1'));
      return Number.isFinite(saved) && saved >= 30 && saved <= 70 ? saved : 50;
    } catch {
      return 50;
    }
  });
  const [maximized, setMaximized] = useState(false);
  const [mobileTab, setMobileTab] = useState('statement');

  useEffect(() => {
    if (!aiOpen && !resultOpen) return undefined;

    const onEscape = (event) => {
      if (event.key === 'Escape') {
        setAiOpen(false);
        setResultOpen(false);
      }
    };

    window.addEventListener('keydown', onEscape);

    return () => {
      window.removeEventListener('keydown', onEscape);
    };
  }, [aiOpen, resultOpen]);

  const draftKey = `zuny:oj:solution:${problemId}:${language}`;

  useEffect(() => {
    try {
      localStorage.setItem(draftKey, sourceCode);
      localStorage.setItem(`zuny:oj:language:${problemId}`, language);
    } catch {
      // Storage unavailable.
    }
  }, [draftKey, sourceCode, problemId, language]);

  useEffect(() => () => {
    dragCleanupRef.current?.();
  }, []);

  const startResize = (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    if (!workspaceRef.current) return;
    event.preventDefault();

    dragCleanupRef.current?.();

    const update = (clientX) => {
      const bounds = workspaceRef.current?.getBoundingClientRect();
      if (!bounds?.width) return;
      const next = Math.max(30, Math.min(70, ((clientX - bounds.left) / bounds.width) * 100));
      setSplitPercent(next);
      try {
        localStorage.setItem('zuny:oj:split:v1', String(next));
      } catch {
        // Storage unavailable.
      }
    };

    const onMove = (moveEvent) => update(moveEvent.clientX);
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      dragCleanupRef.current = null;
    };

    dragCleanupRef.current = onUp;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    update(event.clientX);
  };

  const changeSplitByKeyboard = (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    setSplitPercent((previous) => {
      let next = previous;
      if (event.key === 'ArrowLeft') next -= 5;
      if (event.key === 'ArrowRight') next += 5;
      if (event.key === 'Home') next = 30;
      if (event.key === 'End') next = 70;
      next = Math.max(30, Math.min(70, next));
      try {
        localStorage.setItem('zuny:oj:split:v1', String(next));
      } catch {
        // Storage unavailable.
      }
      return next;
    });
  };


  useEffect(() => {
    let active = true;
    ojApi.getProblem(problemId).then((result) => {
      if (active) setData(result.problem);
    }).catch((error) => {
      if (active) setMessage(error?.response?.data?.message || 'Không thể tải đề bài.');
    }).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [problemId]);

  useEffect(() => {
    if (!submissionId) return undefined;

    let active = true;
    let timer;
    let attempts = 0;

    const poll = async () => {
      try {
        const response = await ojApi.getSubmission(submissionId);
        if (!active) return;

        const result = response?.submission;
        if (!result) throw new Error('Không nhận được kết quả bài nộp.');

        setSubmissionResult(result);
        setPollError('');
        if (!['PENDING', 'JUDGING'].includes(result.verdict)) {
          setMessage('');
        }

        if (['PENDING', 'JUDGING'].includes(result.verdict)) {
          attempts += 1;
          if (attempts < 60) {
            timer = setTimeout(poll, 2000);
          } else {
            setPollError('Quá thời gian theo dõi. Bạn có thể xem lại tại mục Bài nộp.');
          }
        }
      } catch (error) {
        if (!active) return;
        setPollError(error?.message || 'Không thể tải kết quả chấm.');
        attempts += 1;
        if (attempts < 10 && error?.response?.status !== 401 && error?.response?.status !== 403) {
          timer = setTimeout(poll, 3000);
        }
      }
    };

    poll();

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [submissionId]);

  const analyzeWithAI = async () => {
    const id = submissionResult?.id || submissionId;
    if (!id) return;
    if (!['WA', 'TLE', 'MLE', 'RE', 'CE', 'IE'].includes(submissionResult?.verdict)) return;

    setAiOpen(true);

    if (aiAnalysis || aiRequestRef.current === id) return;

    const generation = aiGenerationRef.current;
    aiRequestRef.current = id;
    setAiLoading(true);
    setAiError('');

    try {
      const response = await ojApi.analyzeSubmission(id);
      if (generation !== aiGenerationRef.current) return;

      const analysis = response?.analysis;
      const text = typeof analysis === 'string'
        ? analysis
        : analysis?.content || analysis?.text || analysis?.message || '';

      if (!text) throw new Error('AI không trả về nội dung phân tích.');
      setAiAnalysis(text);
    } catch (error) {
      if (generation !== aiGenerationRef.current) return;
      setAiError(error?.response?.data?.message || error?.message || 'Không thể phân tích bài nộp.');
    } finally {
      if (aiRequestRef.current === id) {
        aiRequestRef.current = null;
      }
      if (generation === aiGenerationRef.current) setAiLoading(false);
    }
  };

  const submit = async () => {
    if (submittingRef.current) return;

    if (!sourceCode.trim()) {
      setMessage('Vui lòng nhập mã nguồn trước khi nộp bài.');
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setSubmissionId(null);
    setSubmissionResult(null);
    aiGenerationRef.current += 1;
    aiRequestRef.current = null;
    setAiAnalysis('');
    setAiOpen(false);
    setResultOpen(false);
    setAiError('');
    setAiLoading(false);
    setPollError('');
    setMessage('Đang gửi bài nộp...');

    try {
      const response = await ojApi.submitProblem(problemId, { language, sourceCode });
      const submission = response?.submission;
      const id = submission?.id ?? response?.submissionId ?? response?.submission_id;

      if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) {
        setMessage('Đã gửi yêu cầu nhưng máy chủ không trả về mã bài nộp hợp lệ. Kiểm tra mục Bài nộp trước khi gửi lại.');
        return;
      }

      setSubmissionId(Number(id));
      setSubmissionResult(submission || null);
      setMessage(`Đã nhận bài nộp #${id}. Đang theo dõi kết quả chấm...`);
    } catch (error) {
      setMessage(error?.response?.data?.message || error?.message || 'Không thể nộp bài.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  if (loading) return <EmptyState title="Đang tải đề bài..." description="Dữ liệu được lấy từ PostgreSQL." />;
  if (!data) return <EmptyState title="Không tìm thấy đề bài" description={message} />;

  // oj-one-screen-v8
  // oj-compact-verdict-v7
  // oj-ai-popup-v6
  // oj-balanced-workspace-v5
  // oj-editor-toolbar-v4
  // oj-compact-ai-results-v3
  // oj-balanced-layout-v2
  return <div className="mx-auto max-w-[1180px] pb-10">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <button onClick={onBack} className="inline-flex items-center gap-2 text-sm font-bold text-indigo-600 transition hover:text-indigo-800">
        <span aria-hidden="true">←</span> Kho bài tập
      </button>
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
        <span className="hidden sm:inline">Bài tập</span><span className="hidden sm:inline">/</span><span className="text-slate-600">OJ-{data.code}</span>
      </div>
    </div>

    <div className="mb-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-5 py-5 sm:px-7">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.16em] text-indigo-600">
            <span>OJ-{data.code}</span><span className="h-1 w-1 rounded-full bg-slate-300" /><span className="text-slate-400">Bài tập</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">{data.title}</h1>
        </div>
        <span className="rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1.5 text-xs font-extrabold text-indigo-700">
          {difficultyLabels[data.difficulty] || data.difficulty}
        </span>
      </div>
      <div className="grid grid-cols-2 divide-x divide-slate-100 sm:grid-cols-4">
        <div className="px-5 py-3.5"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Thời gian</p><p className="mt-1 text-sm font-extrabold text-slate-700">{data.timeLimitMs} ms</p></div>
        <div className="px-5 py-3.5"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Bộ nhớ</p><p className="mt-1 text-sm font-extrabold text-slate-700">{data.memoryLimitMb} MB</p></div>
        <div className="border-t border-slate-100 px-5 py-3.5 sm:border-t-0"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Ngôn ngữ</p><p className="mt-1 text-sm font-extrabold text-slate-700">{(data.languages || []).length || 4} lựa chọn</p></div>
        <div className="border-t border-slate-100 px-5 py-3.5 sm:border-t-0"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Trạng thái</p><p className="mt-1 text-sm font-extrabold text-emerald-600">Đang mở</p></div>
      </div>
    </div>

    <div className="mb-3 flex rounded-xl border border-slate-200 bg-white p-1 lg:hidden">
      <button type="button" onClick={() => setMobileTab('statement')}
        className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-bold ${
          mobileTab === 'statement' ? 'bg-violet-100 text-violet-700' : 'text-slate-500'
        }`}>Đề bài</button>
      <button type="button" onClick={() => setMobileTab('code')}
        className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-bold ${
          mobileTab === 'code' ? 'bg-violet-100 text-violet-700' : 'text-slate-500'
        }`}>Viết code</button>
    </div>
    <div
      ref={workspaceRef}
      className="flex min-w-0 items-stretch gap-0 max-lg:flex-col"
    >
      <article
        className={`min-w-0 overflow-hidden lg:block lg:self-start rounded-2xl border border-slate-200 bg-white shadow-sm ${
          mobileTab === 'statement' ? 'block' : 'hidden lg:block'
        } ${maximized ? 'lg:!hidden' : ''}`}
        style={{ width: '100%', flex: `0 0 ${splitPercent}%` }}
      >
        <div className="border-b border-slate-100 px-5 pt-4 sm:px-7">
          <div className="flex gap-6 text-sm font-bold">
            <span className="border-b-2 border-indigo-600 pb-3 text-indigo-700">Đề bài</span>
            <span className="pb-3 text-slate-400">Thảo luận</span>
          </div>
        </div>
        <div className="px-5 py-4 sm:px-6 sm:py-5">
          <div className="whitespace-pre-wrap break-words text-[15px] leading-8 text-slate-700">{data.description || 'Đề bài chưa có nội dung.'}</div>
          {data.inputDescription && <section className="mt-8 border-t border-slate-100 pt-6"><h2 className="text-base font-extrabold text-slate-900">Dữ liệu vào</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-600">{data.inputDescription}</p></section>}
          {data.outputDescription && <section className="mt-7 border-t border-slate-100 pt-6"><h2 className="text-base font-extrabold text-slate-900">Dữ liệu ra</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-600">{data.outputDescription}</p></section>}
          {data.samples?.length > 0 && <section className="mt-7 border-t border-slate-100 pt-6"><h2 className="text-base font-extrabold text-slate-900">Ví dụ</h2><div className="mt-3 space-y-4">{data.samples.map((sample, index) => <div key={sample.id} className="overflow-hidden rounded-xl border border-slate-200"><div className="grid grid-cols-2 bg-slate-50 text-[10px] font-extrabold uppercase tracking-wider text-slate-400"><span className="px-3 py-2">Input {index + 1}</span><span className="border-l border-slate-200 px-3 py-2">Output {index + 1}</span></div><div className="grid grid-cols-2 divide-x divide-slate-200"><pre className="overflow-x-auto px-3 py-3 text-xs leading-6 text-slate-700">{sample.input}</pre><pre className="overflow-x-auto px-3 py-3 text-xs leading-6 text-slate-700">{sample.output}</pre></div></div>)}</div></section>}
        </div>
      </article>

      <div
        role="separator"
        aria-label="Kéo để điều chỉnh độ rộng hai cột"
        aria-orientation="vertical"
        aria-valuemin={30}
        aria-valuemax={70}
        aria-valuenow={Math.round(splitPercent)}
        tabIndex={0}
        onPointerDown={startResize}
        onKeyDown={changeSplitByKeyboard}
        className={`group hidden w-3 shrink-0 cursor-col-resize touch-none items-center justify-center focus-visible:bg-violet-100 lg:flex ${
          maximized ? 'lg:!hidden' : ''
        }`}
      >
        <div className="h-48 w-1 rounded-full bg-slate-200 group-hover:bg-violet-500" />
      </div>
      <section
        className={`min-w-0 overflow-hidden lg:self-start rounded-2xl border border-slate-200 bg-white shadow-sm ${
          mobileTab === 'code' ? 'block' : 'hidden lg:block'
        }`}
        style={{ flex: '1 1 0%', width: '100%' }}
      >
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-extrabold text-slate-900">Trình soạn thảo</h2>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setMaximized((v) => !v)}
                className="hidden rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold text-slate-600 lg:inline-flex"
              >
                {maximized ? 'Thu nhỏ' : 'Mở rộng'}
              </button>
          <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={analyzeWithAI}
            disabled={
              !submissionResult ||
              !['WA', 'TLE', 'MLE', 'RE', 'CE', 'IE'].includes(submissionResult.verdict)
            }
            title={
              !submissionResult
                ? 'Hãy nộp bài để sử dụng OJ AI'
                : submissionResult.verdict === 'AC'
                  ? 'Bài đã Accepted'
                  : ['PENDING', 'JUDGING'].includes(submissionResult.verdict)
                    ? 'Đang chờ kết quả chấm'
                    : 'Phân tích lỗi bài nộp bằng AI'
            }
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-extrabold text-violet-700 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span aria-hidden="true">✦</span>
            {aiLoading ? 'Đang phân tích...' : aiAnalysis ? 'Xem OJ AI' : 'OJ AI'}
          </button>
          <button id={`zuny-oj-submit-${problemId}`} onClick={submit} disabled={submitting} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-extrabold text-white shadow-[0_7px_18px_rgba(79,70,229,0.20)] transition hover:bg-indigo-700 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60">{submitting ? 'Đang gửi...' : 'Nộp bài'} <span aria-hidden="true">→</span></button>
          </div>
            </div>
          </div>
          <p className="mt-1 text-xs text-slate-400">Chọn ngôn ngữ và gửi lời giải của bạn.</p>
        </div>
        <div className="p-5">
          <label className="text-xs font-extrabold text-slate-600">Ngôn ngữ lập trình<select value={language} onChange={(event) => {
            const next = event.target.value;
            if (next === language) return;
            try {
              localStorage.setItem(
                `zuny:oj:solution:${problemId}:${language}`,
                sourceCode
              );
              localStorage.setItem(`zuny:oj:language:${problemId}`, next);
            } catch {
              // Storage unavailable.
            }
            let nextCode = '';
            try {
              nextCode =
                localStorage.getItem(
                  `zuny:oj:solution:${problemId}:${next}`
                ) || '';
            } catch {
              // Storage unavailable.
            }
            setCodeDraft({ language: next, sourceCode: nextCode });
          }} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100">
            {(data.languages || ['CPP23', 'PYTHON314']).map((item) => <option key={item}>{item}</option>)}
          </select></label>
          <div className="mt-4 overflow-hidden rounded-xl border border-slate-800 bg-[#0b1020]">
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 text-[10px] font-bold text-slate-500"><span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-violet-400" />
              {language.startsWith('CPP') ? 'main.cpp' : language.startsWith('PYTHON') || language === 'PY3' ? 'main.py' : 'main.txt'}
            </span>
            <span>Monaco · {language}</span></div>
            <div className="h-[280px] min-h-[240px]">
              <Editor
                height="100%"
                language={language.startsWith('CPP') ? 'cpp' : language.startsWith('PYTHON') ? 'python' : 'plaintext'}
                theme="vs-dark"
                value={sourceCode}
                onChange={(value) => setSourceCode(value ?? '')}
                onMount={(editor, monaco) => {
                  editor.addCommand(
                    monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
                    () => document.getElementById(`zuny-oj-submit-${problemId}`)?.click()
                  );
                }}
                options={{
                  automaticLayout: true,
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineHeight: 22,
                  tabSize: 4,
                  wordWrap: 'on',
                  scrollBeyondLastLine: false,
                  padding: { top: 14, bottom: 14 },
                }}
              />
            </div>
          </div>
          {/* oj-ai-toolbar-v1 */}
          {message && <p role="status" className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">{message}</p>}
          {submissionResult && (
            <div
              className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3"
              aria-live="polite"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  aria-hidden="true"
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base font-black ${
                    submissionResult.verdict === 'AC'
                      ? 'bg-emerald-100 text-emerald-700'
                      : ['PENDING', 'JUDGING'].includes(submissionResult.verdict)
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'bg-rose-100 text-rose-700'
                  }`}
                >
                  {submissionResult.verdict === 'AC'
                    ? '✓'
                    : ['PENDING', 'JUDGING'].includes(submissionResult.verdict)
                      ? '…'
                      : '×'}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-extrabold text-slate-800">
                    {verdictLabels[submissionResult.verdict] || submissionResult.verdict}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Bài nộp #{submissionResult.id || submissionId}
                    {' · '}
                    {submissionResult.score ?? '—'} điểm
                    {' · '}
                    {submissionResult.executionTimeMs ?? '—'} ms
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setResultOpen(true)}
                className="shrink-0 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-bold text-indigo-700 transition hover:bg-indigo-50"
              >
                Xem chi tiết ↗
              </button>
            </div>
          )}
          {pollError && <p role="alert" className="mt-3 text-xs text-amber-700">{pollError}</p>}
        </div>
      </section>
    </div>

    {resultOpen && submissionResult && (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-[3px] sm:p-6"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            setResultOpen(false);
          }
        }}
      >
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="zuny-oj-result-title"
          className="flex max-h-[88dvh] w-full max-w-[680px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        >
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-6">
            <div>
              <h2
                id="zuny-oj-result-title"
                className="text-base font-extrabold text-slate-900"
              >
                Chi tiết bài nộp #{submissionResult.id || submissionId}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Kết quả chấm và từng testcase
              </p>
            </div>
            <button
              type="button"
              onClick={() => setResultOpen(false)}
              aria-label="Đóng chi tiết bài nộp"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100"
            >
              ✕ Đóng
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
            <div className="mb-4 rounded-xl bg-indigo-50 px-4 py-3">
              <p className="text-sm font-extrabold text-indigo-800">
                {verdictLabels[submissionResult.verdict] || submissionResult.verdict}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Điểm</p>
                <p className="mt-1 font-extrabold">
                  {submissionResult.score ?? '—'}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Thời gian</p>
                <p className="mt-1 font-extrabold">
                  {submissionResult.executionTimeMs ?? '—'} ms
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Bộ nhớ</p>
                <p className="mt-1 font-extrabold">
                  {submissionResult.memoryUsedKb ?? '—'} KiB
                </p>
              </div>
            </div>

            <h3 className="mb-3 mt-6 text-sm font-extrabold text-slate-800">
              Kết quả testcase
            </h3>

            {Array.isArray(submissionResult.testResults) &&
            submissionResult.testResults.length > 0 ? (
              <div className="space-y-2">
                {submissionResult.testResults.map((item) => (
                  <div
                    key={item.position}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-3 text-xs"
                  >
                    <span className="font-bold">
                      Test #{item.position}
                    </span>
                    <span className="font-semibold">
                      {verdictLabels[item.verdict] || item.verdict}
                    </span>
                    <span className="text-slate-500">
                      {item.points} điểm
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                Chưa có kết quả testcase.
              </p>
            )}
          </div>

          <footer className="flex justify-end border-t border-slate-100 bg-slate-50 px-4 py-3 sm:px-6">
            <button
              type="button"
              onClick={() => setResultOpen(false)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700"
            >
              Quay lại lập trình
            </button>
          </footer>
        </section>
      </div>
    )}

    {aiOpen && (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-[3px] sm:p-6"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            setAiOpen(false);
          }
        }}
      >
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="zuny-oj-ai-dialog-title"
          className="flex max-h-[88dvh] w-full max-w-[780px] min-w-0 flex-col overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-2xl"
        >
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-6 sm:py-4">
            <div className="min-w-0">
              <h2
                id="zuny-oj-ai-dialog-title"
                className="text-base font-extrabold text-slate-900"
              >
                ✦ OJ AI — Phân tích bài nộp
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Bài nộp #{submissionResult?.id || submissionId}
                {' · '}
                {verdictLabels[submissionResult?.verdict] || submissionResult?.verdict}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAiOpen(false)}
              aria-label="Đóng cửa sổ OJ AI"
              className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100"
            >
              ✕ Đóng
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
            {aiLoading && !aiAnalysis && (
              <div role="status" className="rounded-xl bg-violet-50 p-4 text-sm text-violet-700">
                Đang phân tích lỗi bài nộp. Vui lòng chờ...
              </div>
            )}

            {aiError && (
              <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">
                {aiError}
              </p>
            )}

            {aiAnalysis && (
              <div className="min-w-0 break-words text-sm leading-7 text-slate-700 [&_h1]:mb-3 [&_h1]:text-lg [&_h1]:font-extrabold [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-base [&_h2]:font-bold [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:font-bold [&_p]:my-2 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_pre]:my-3 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-slate-900 [&_pre]:p-4 [&_pre]:text-xs [&_pre]:leading-6 [&_pre]:text-slate-100 [&_code]:break-words [&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-violet-300 [&_blockquote]:pl-4">
                <ReactMarkdown>{aiAnalysis}</ReactMarkdown>
              </div>
            )}

            {!aiLoading && !aiAnalysis && !aiError && (
              <p className="text-sm text-slate-500">
                Chưa có nội dung phân tích.
              </p>
            )}
          </div>

          <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-4 py-3 sm:px-6">
            <span className="text-xs text-slate-500">
              Đóng cửa sổ vẫn giữ phân tích trong phiên hiện tại.
            </span>
            <button
              type="button"
              onClick={() => setAiOpen(false)}
              className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700"
            >
              Quay lại lập trình
            </button>
          </footer>
        </section>
      </div>
    )}
  </div>;
}

function Problems({ canManage, onSelect, onManage }) {
  const [problems, setProblems] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    ojApi.listProblems()
      .then((result) => {
        if (active) setProblems(Array.isArray(result.problems) ? result.problems : []);
      })
      .catch((reason) => {
        if (active) setError(reason?.response?.data?.message || 'Không thể tải danh sách bài tập.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);
  const filtered = useMemo(() => problems.filter((item) => `${item.title} ${item.code}`.toLowerCase().includes(query.toLowerCase())), [problems, query]);
  return <div>
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><Heading title="Kho bài tập" description="Danh sách bài tập được lấy trực tiếp từ PostgreSQL." />{canManage && <button onClick={onManage} className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-extrabold text-white sm:w-auto">Tạo đề mới</button>}</div>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-4"><label className="flex max-w-md items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5"><Icon name="search" size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full text-sm outline-none" placeholder="Tìm mã hoặc tên đề..." /></label></div>
      {loading && <div className="p-10 text-center text-sm text-slate-500">Đang tải dữ liệu...</div>}
      {!loading && error && <div className="p-10 text-center text-sm text-rose-600">{error}</div>}
      {!loading && !error && !filtered.length && <div className="p-10 text-center text-sm text-slate-500">Chưa có bài tập phù hợp.</div>}
      {!loading && !error && filtered.length > 0 && <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left"><thead className="bg-slate-50 text-xs text-slate-500"><tr>{['Mã đề', 'Tên bài', 'Chủ đề', 'Độ khó', 'Trạng thái', 'Cập nhật'].map((label) => <th key={label} className="px-5 py-4">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{filtered.map((problem) => <tr key={problem.id} onClick={() => onSelect(problem.id)} className="cursor-pointer text-sm hover:bg-indigo-50/40"><td className="px-5 py-4 font-bold text-indigo-600">OJ-{problem.code}</td><td className="px-5 py-4 font-bold text-slate-800">{problem.title}</td><td className="px-5 py-4 text-slate-500">{problem.category || '—'}</td><td className="px-5 py-4 text-slate-500">{difficultyLabels[problem.difficulty] || problem.difficulty || '—'}</td><td className="px-5 py-4 text-slate-500">{problem.status || '—'}</td><td className="px-5 py-4 text-slate-400">{problem.updatedAt ? new Date(problem.updatedAt).toLocaleDateString('vi-VN') : '—'}</td></tr>)}</tbody></table></div>}
    </section>
  </div>;
}

function ProblemManagement({ onCreate, onEdit }) {
  const [problems, setProblems] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    ojApi.listProblems()
      .then((result) => {
        if (active) setProblems(Array.isArray(result.problems) ? result.problems : []);
      })
      .catch((reason) => {
        if (active) setError(reason?.response?.data?.message || 'Không thể tải danh sách đề.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const filtered = useMemo(
    () => problems.filter((item) => `${item.title} ${item.code}`.toLowerCase().includes(query.toLowerCase())),
    [problems, query],
  );

  return <div>
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <Heading title="Quản lý đề" description="Quản lý các đề do bạn tạo và các đề được lưu trong PostgreSQL." />
      <button onClick={onCreate} className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-extrabold text-white hover:bg-indigo-700 sm:w-auto">+ Tạo đề mới</button>
    </div>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-4">
        <input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full max-w-md rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-500" placeholder="Tìm mã hoặc tên đề..." />
      </div>
      {loading && <div className="p-10 text-center text-sm text-slate-500">Đang tải danh sách đề...</div>}
      {!loading && error && <div className="p-10 text-center text-sm text-rose-600">{error}</div>}
      {!loading && !error && !filtered.length && <EmptyState title="Chưa có đề bài" description="Bấm “Tạo đề mới” để bắt đầu tạo đề." />}
      {!loading && !error && filtered.length > 0 && <div className="overflow-x-auto">
        <table className="w-full min-w-[780px] text-left">
          <thead className="bg-slate-50 text-xs text-slate-500"><tr>{['Mã đề', 'Tên bài', 'Độ khó', 'Trạng thái', 'Cập nhật', 'Thao tác'].map((label) => <th key={label} className="px-5 py-4">{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((problem) => <tr key={problem.id} className="text-sm hover:bg-slate-50">
              <td className="px-5 py-4 font-bold text-indigo-600">OJ-{problem.code}</td>
              <td className="px-5 py-4 font-bold text-slate-800">{problem.title}</td>
              <td className="px-5 py-4 text-slate-500">{difficultyLabels[problem.difficulty] || problem.difficulty || '—'}</td>
              <td className="px-5 py-4"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{problem.status || '—'}</span></td>
              <td className="px-5 py-4 text-slate-400">{problem.updatedAt ? new Date(problem.updatedAt).toLocaleDateString('vi-VN') : '—'}</td>
              <td className="px-5 py-4"><button onClick={() => onEdit(problem.id)} className="rounded-lg bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100">Chỉnh sửa</button></td>
            </tr>)}
          </tbody>
        </table>
      </div>}
    </section>
  </div>;
}

function Submissions() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { ojApi.listSubmissions().then((result) => setItems(result.submissions || [])).finally(() => setLoading(false)); }, []);
  return <div><Heading title="Bài nộp" description="Lịch sử bài nộp của tài khoản hiện tại từ PostgreSQL." />{loading ? <EmptyState title="Đang tải..." description="" /> : !items.length ? <EmptyState title="Chưa có bài nộp" description="Học sinh có thể nộp bài sau khi mở một đề bài." /> : <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm"><table className="w-full min-w-[760px] text-left"><thead className="bg-slate-50 text-xs text-slate-500"><tr>{['Mã', 'Bài tập', 'Ngôn ngữ', 'Kết quả', 'Điểm', 'Thời gian'].map((label) => <th key={label} className="px-5 py-4">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{items.map((item) => <tr key={item.id} className="text-sm"><td className="px-5 py-4 font-bold text-indigo-600">#{item.id}</td><td className="px-5 py-4">{item.problemTitle || `OJ-${item.problemCode}`}</td><td className="px-5 py-4 text-slate-500">{item.language}</td><td className="px-5 py-4 font-bold">{verdictLabels[item.verdict] || item.verdict}</td><td className="px-5 py-4">{item.score}</td><td className="px-5 py-4 text-slate-400">{item.createdAt ? new Date(item.createdAt).toLocaleString('vi-VN') : '—'}</td></tr>)}</tbody></table></section>}</div>;
}

/* eslint-disable no-unused-vars -- Contest đang bảo trì; giữ source để khôi phục. */
function ContestForm({ contest, problems, onBack, onSaved }) {
  const [form, setForm] = useState({
    title: contest?.title || '',
    description: contest?.description || '',
    startsAt: contest?.startsAt ? contest.startsAt.slice(0, 16) : '',
    endsAt: contest?.endsAt ? contest.endsAt.slice(0, 16) : '',
    status: contest?.status || 'DRAFT',
    problemIds: contest?.problems?.map((problem) => problem.id) || [],
  });
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const result = contest
        ? await ojApi.updateContest(contest.id, form)
        : await ojApi.createContest(form);
      setMessage(result.message || 'Đã lưu cuộc thi.');
      onSaved();
    } catch (error) {
      setMessage(error?.response?.data?.message || 'Không thể lưu cuộc thi.');
    } finally {
      setSaving(false);
    }
  };
  return <div>
    <button onClick={onBack} className="mb-5 text-sm font-bold text-indigo-600">← Quay lại danh sách cuộc thi</button>
    <Heading title={contest ? 'Chỉnh sửa cuộc thi' : 'Tạo cuộc thi'} description="Thông tin được lưu trực tiếp vào PostgreSQL." />
    <form onSubmit={submit} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <label className="block text-sm font-bold text-slate-700">Tên cuộc thi<input required value={form.title} onChange={(event) => update('title', event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-indigo-500" /></label>
        <label className="mt-5 block text-sm font-bold text-slate-700">Mô tả<textarea value={form.description} onChange={(event) => update('description', event.target.value)} className="mt-2 min-h-36 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-indigo-500" /></label>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-bold text-slate-700">Bắt đầu<input type="datetime-local" value={form.startsAt} onChange={(event) => update('startsAt', event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 font-normal" /></label>
          <label className="text-sm font-bold text-slate-700">Kết thúc<input type="datetime-local" value={form.endsAt} onChange={(event) => update('endsAt', event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 font-normal" /></label>
        </div>
        <label className="mt-5 block text-sm font-bold text-slate-700">Trạng thái<select value={form.status} onChange={(event) => update('status', event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 font-normal"><option value="DRAFT">Bản nháp</option><option value="PUBLISHED">Công khai</option><option value="ARCHIVED">Lưu trữ</option></select></label>
        {message && <p className="mt-5 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{message}</p>}
      </section>
      <section className="h-fit rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="font-extrabold">Bài tập trong cuộc thi</h2>
        <p className="mt-1 text-xs text-slate-500">Chọn các bài đã có trong PostgreSQL.</p>
        <div className="mt-4 max-h-96 space-y-2 overflow-y-auto">{problems.length ? problems.map((problem) => <label key={problem.id} className="flex items-start gap-3 rounded-xl border border-slate-100 p-3 text-sm hover:bg-slate-50"><input type="checkbox" checked={form.problemIds.includes(problem.id)} onChange={(event) => update('problemIds', event.target.checked ? [...form.problemIds, problem.id] : form.problemIds.filter((id) => id !== problem.id))} className="mt-1" /><span><b>OJ-{problem.code}</b><span className="ml-2 text-slate-600">{problem.title}</span></span></label>) : <p className="py-6 text-center text-sm text-slate-500">Chưa có bài tập để chọn.</p>}</div>
        <button disabled={saving} className="mt-5 w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-extrabold text-white disabled:opacity-50">{saving ? 'Đang lưu...' : contest ? 'Lưu thay đổi' : 'Tạo cuộc thi'}</button>
      </section>
    </form>
  </div>;
}

function Contests({ canManage }) {
  const [contests, setContests] = useState([]);
  const [problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const load = () => Promise.all([ojApi.listContests(), ojApi.listProblems()]).then(([contestResult, problemResult]) => {
    setContests(contestResult.contests || []);
    setProblems(problemResult.problems || []);
  }).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);
  if (editing) return <ContestForm contest={editing === 'new' ? null : editing} problems={problems} onBack={() => setEditing(null)} onSaved={() => { setEditing(null); setLoading(true); load(); }} />;
  return <div><div className="mb-7 flex flex-wrap items-end justify-between gap-4"><Heading title="Cuộc thi" description="Các cuộc thi được lấy trực tiếp từ PostgreSQL." />{canManage && <button onClick={() => setEditing('new')} className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-extrabold text-white sm:w-auto">+ Tạo contest</button>}</div>{loading ? <EmptyState title="Đang tải..." description="" /> : !contests.length ? <EmptyState title="Chưa có cuộc thi" description={canManage ? 'Bấm “Tạo contest” để bắt đầu.' : 'Cuộc thi sẽ hiển thị khi được tạo trong hệ thống.'} /> : <div className="grid gap-4 md:grid-cols-2">{contests.map((contest) => <article key={contest.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-indigo-600">{contest.status}</p><h2 className="mt-1 text-lg font-extrabold">{contest.title}</h2></div>{canManage && <button onClick={() => setEditing(contest)} className="text-xs font-bold text-indigo-600">Chỉnh sửa</button>}</div><p className="mt-3 line-clamp-3 text-sm text-slate-500">{contest.description || 'Chưa có mô tả.'}</p><p className="mt-4 text-xs text-slate-400">{contest.problems.length} bài tập</p></article>)}</div>}</div>;
}

function EmptyPage({ title, description }) {
  return <div><Heading title={title} description={description} /><EmptyState title="Chưa có dữ liệu" description="Dữ liệu sẽ hiển thị khi được tạo trong hệ thống." /></div>;
}

function OjSidebar({ items, page, onNavigate }) {
  const [desktopHovered, setDesktopHovered] = useState(false);
  const expanded = desktopHovered;
  const icons = {
    'Bài tập': BookOpen,
    'Cuộc thi': Trophy,
    'Quản lý đề': ClipboardList,
    'Bài nộp': Code2,
    'Xếp hạng': BarChart3,
    'Thảo luận': MessageSquare,
  };

  const navigate = (item) => {
    onNavigate(item);
  };

  const content = () => <aside className={`relative flex h-fit max-h-[calc(100dvh-112px)] flex-col overflow-hidden rounded-[26px] border border-slate-200 bg-white text-slate-900 shadow-none transition-[width] duration-300 ease-out ${expanded ? 'w-[240px]' : 'w-16'}`}>
    <div className={`flex h-[64px] shrink-0 items-center border-b border-slate-200/80 ${expanded ? 'gap-3 px-3' : 'justify-center px-1'}`}>
      <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[16px] bg-slate-50 shadow-[0_7px_22px_rgba(99,102,241,0.30)] ring-1 ring-violet-200">
        <span className="absolute inset-[3px] rounded-[11px] bg-gradient-to-br from-cyan-400 via-indigo-500 to-fuchsia-500" />
        <span className="relative flex h-8 w-8 items-center justify-center rounded-[9px] bg-white text-sm font-black tracking-[-0.08em] text-violet-700">Z</span>
      </div>
      {expanded && <div className="min-w-0 flex-1"><p className="truncate text-sm font-black tracking-wide text-violet-700">ZUNY OJ</p></div>}
    </div>
    <nav className={`shrink-0 py-3 ${expanded ? 'px-2.5' : 'px-1.5'}`} aria-label="Điều hướng OJ">
      {items.map((item) => {
        const ItemIcon = icons[item];
        const active = page === item;
        return <button key={item} type="button" onClick={() => navigate(item)} title={!expanded ? item : undefined} aria-label={item} aria-current={active ? 'page' : undefined} className={`group relative flex h-11 w-full items-center rounded-[16px] transition-all duration-200 ${expanded ? 'gap-3 px-3' : 'justify-center px-0'} ${active ? 'bg-violet-100 text-violet-700 shadow-[inset_0_0_0_1px_rgba(139,92,246,0.16)]' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}>
          {active && <span className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full bg-gradient-to-b from-violet-400 to-fuchsia-400 shadow-[0_0_10px_rgba(167,139,250,0.95)]" />}
          <ItemIcon className={`h-5 w-5 shrink-0 transition ${active ? 'text-violet-600' : 'text-current'}`} />
          {expanded && <span className="min-w-0 flex-1 truncate text-left text-[15px] font-semibold">{item}</span>}
        </button>;
      })}
    </nav>
  </aside>;

  return <>
    <div className="fixed left-4 top-1/2 z-40 hidden -translate-y-1/2 lg:block" onMouseEnter={() => setDesktopHovered(true)} onMouseLeave={() => setDesktopHovered(false)}>{content()}</div>
    <nav className="exam-mobile-navbar lg:hidden" aria-label="Điều hướng OJ">
      {items.map((item) => {
        const ItemIcon = icons[item];
        return <button key={item} type="button" className={page === item ? 'active' : ''} onClick={() => navigate(item)} aria-label={item}>
          <span><ItemIcon className="h-5 w-5" /></span>
          <small>{item}</small>
        </button>;
      })}
    </nav>
  </>;
}


// oj-url-navigation-v2
const OJ_PATHS = {
  'Bài tập': '/oj/problems',
  'Cuộc thi': '/oj/contests',
  'Quản lý đề': '/oj/manage/problems',
  'Bài nộp': '/oj/submissions',
  'Xếp hạng': '/oj/rankings',
  'Thảo luận': '/oj/discussions',
};

function parseOjRoute(pathname, canManage) {
  const path = pathname.replace(/\/+$/, '') || '/oj';

  if (path === '/oj') {
    return {
      redirect: canManage
        ? OJ_PATHS['Quản lý đề']
        : OJ_PATHS['Bài tập'],
    };
  }

  const simpleRoutes = {
    '/oj/problems': 'Bài tập',
    '/oj/contests': 'Cuộc thi',
    '/oj/submissions': 'Bài nộp',
    '/oj/rankings': 'Xếp hạng',
    '/oj/discussions': 'Thảo luận',
  };

  if (simpleRoutes[path]) {
    return { page: simpleRoutes[path] };
  }

  const problem = path.match(/^\/oj\/problems\/(\d+)$/);

  if (problem) {
    return {
      page: 'Bài tập',
      selectedProblem: Number(problem[1]),
    };
  }

  if (path === '/oj/manage/problems') {
    return canManage
      ? { page: 'Quản lý đề' }
      : { forbidden: true };
  }

  if (path === '/oj/manage/problems/new') {
    return canManage
      ? { page: 'Quản lý đề', creatingProblem: true }
      : { forbidden: true };
  }

  const edit = path.match(/^\/oj\/manage\/problems\/(\d+)\/edit$/);

  if (edit) {
    return canManage
      ? {
          page: 'Quản lý đề',
          editingProblemId: Number(edit[1]),
        }
      : { forbidden: true };
  }

  return { notFound: true };
}

export default function OJPortal() {
  const { isAdminDev, canManageOJ } = useAuth();
  const canManage = Boolean(isAdminDev || canManageOJ);

  const location = useLocation();
  const navigate = useNavigate();

  const route = parseOjRoute(location.pathname, canManage);
  const page = route.page || 'Bài tập';

  const nav = canManage
    ? ['Bài tập', 'Cuộc thi', 'Quản lý đề', 'Bài nộp', 'Xếp hạng', 'Thảo luận']
    : ['Bài tập', 'Cuộc thi', 'Bài nộp', 'Xếp hạng', 'Thảo luận'];

  const go = (next) => {
    if (next === 'Quản lý đề' && !canManage) return;

    const target = OJ_PATHS[next];

    if (target) navigate(target);
  };

  if (route.redirect) {
    return <Navigate to={route.redirect} replace />;
  }

  if (route.forbidden || route.notFound) {
    return (
      <div className="mx-auto max-w-xl px-5 py-20 text-center">
        <h1 className="text-xl font-extrabold text-slate-900">
          {route.forbidden
            ? 'Không có quyền truy cập'
            : 'Không tìm thấy trang OJ'}
        </h1>
        <button
          type="button"
          onClick={() => navigate('/oj/problems', { replace: true })}
          className="mt-6 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white"
        >
          Về kho bài tập
        </button>
      </div>
    );
  }

  let content;

  if (route.selectedProblem) {
    content = (
      <ProblemDetail
        key={route.selectedProblem}
        problemId={route.selectedProblem}
        onBack={() => navigate('/oj/problems')}
      />
    );
  } else if (route.creatingProblem || route.editingProblemId) {
    content = (
      <LcojProblemEditor
        key={route.creatingProblem ? 'new' : route.editingProblemId}
        editingProblemId={
          route.creatingProblem ? null : route.editingProblemId
        }
        isAdmin={isAdminDev}
        onBack={() => navigate('/oj/manage/problems')}
      />
    );
  } else {
    content = (
      <>
        {page === 'Bài tập' && (
          <Problems
            canManage={canManage}
            onSelect={(id) => navigate(`/oj/problems/${id}`)}
            onManage={() => navigate('/oj/manage/problems/new')}
          />
        )}

        {page === 'Quản lý đề' && (
          <ProblemManagement
            onCreate={() => navigate('/oj/manage/problems/new')}
            onEdit={(id) =>
              navigate(`/oj/manage/problems/${id}/edit`)
            }
          />
        )}

        {page === 'Bài nộp' && <Submissions />}

        {page === 'Cuộc thi' && (
          <MaintenanceState
            badge="Online Judge"
            title="Cuộc thi đang bảo trì"
            subtitle="Tính năng đang được hoàn thiện"
            description="Chức năng cuộc thi đang được hoàn thiện và sẽ sớm quay trở lại."
          />
        )}

        {page === 'Xếp hạng' && (
          <EmptyPage
            title="Xếp hạng"
            description="Bảng xếp hạng được lấy từ PostgreSQL."
          />
        )}

        {page === 'Thảo luận' && (
          <EmptyPage
            title="Thảo luận"
            description="Các thảo luận được lấy từ PostgreSQL."
          />
        )}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <OjSidebar items={nav} page={page} onNavigate={go} />
      <main className="mx-auto max-w-[1440px] px-4 pt-5 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-5 sm:pt-6 lg:pb-6 lg:pl-32 lg:pr-10">
        {content}
      </main>
    </div>
  );
}
