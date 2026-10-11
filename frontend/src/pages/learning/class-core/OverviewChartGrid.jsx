import { useState } from 'react';

function DonutChart({ segments = [], centerValue = '—', centerLabel = '' }) {
  const [hoveredSegment, setHoveredSegment] = useState(null);
  const total = segments.reduce((sum, item) => sum + item.value, 0);
  let offset = 0;
  return (
    <div className="dashboard-donut-wrap chart-tooltip-host" onMouseLeave={() => setHoveredSegment(null)}>
      <svg className="dashboard-donut" viewBox="0 0 120 120" role="img" aria-label={centerLabel}>
        <circle cx="60" cy="60" r="43" fill="none" stroke="currentColor" strokeWidth="15" className="chart-track" />
        {total > 0 ? segments.map((item) => {
          const percent = item.value / total;
          const dash = percent * 270.18;
          const currentOffset = offset;
          offset += dash;
          return (
            <circle
              key={item.label}
              cx="60"
              cy="60"
              r="43"
              fill="none"
              stroke={item.color}
              strokeWidth="15"
              strokeLinecap="butt"
              strokeDasharray={`${dash} ${270.18 - dash}`}
              strokeDashoffset={-currentOffset}
              transform="rotate(-90 60 60)"
              className={hoveredSegment?.label === item.label ? 'chart-hover-active' : 'chart-hover-target'}
              onMouseEnter={() => setHoveredSegment(item)}
            />
          );
        }) : null}
        <text x="60" y="57" textAnchor="middle" className="chart-center-value">{centerValue}</text>
        <text x="60" y="73" textAnchor="middle" className="chart-center-label">{centerLabel}</text>
      </svg>
      {hoveredSegment ? <div className="chart-hover-tooltip donut-tooltip"><strong>{hoveredSegment.label}</strong><span>Số học sinh: <b>{hoveredSegment.value}</b></span>{total > 0 ? <small>{Math.round((hoveredSegment.value / total) * 100)}% tổng số có dữ liệu</small> : null}</div> : null}
      <div className="dashboard-chart-legend">
        {segments.map((item) => <span key={item.label}><i style={{ background: item.color }} />{item.label} <b>{item.value}</b></span>)}
      </div>
    </div>
  );
}

function AttendanceMonthChart({ data = [], monthLabel = '' }) {
  if (!data.some((item) => item.total > 0)) return <div className="chart-empty">Chưa có dữ liệu điểm danh trong {monthLabel}.</div>;
  return (
    <div className="attendance-month-chart">
      <div className="attendance-month-bars">
        {data.map((item) => {
          const rate = item.total ? Math.round((item.present / item.total) * 100) : 0;
          return (
            <div className="attendance-month-day chart-tooltip-host" key={item.key}>
              <div className="attendance-month-track"><i className="chart-hover-target" style={{ height: `${rate}%` }} /></div>
              <span>{item.shortLabel}</span>
              <div className="chart-hover-tooltip attendance-tooltip"><strong>{item.label}</strong><span>Có mặt: <b>{item.present}</b></span><span>Vắng: <b>{item.absent}</b></span><small>Tỷ lệ có mặt {rate}%</small></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AttendanceWeekChart({ data = [] }) {
  if (!data.some((item) => item.total > 0)) return <div className="chart-empty">Chưa có dữ liệu điểm danh trong tuần này.</div>;
  return (
    <div className="attendance-week-chart">
      {data.map((item) => (
        <div className="attendance-week-column chart-tooltip-host" key={item.key}>
          <div className="attendance-week-bars">
            <i className="attendance-present chart-hover-target" style={{ height: `${item.total ? Math.max(8, (item.present / item.total) * 100) : 0}%` }}><b>{item.present || ''}</b></i>
            <i className="attendance-absent chart-hover-target" style={{ height: `${item.total ? Math.max(item.absent ? 8 : 0, (item.absent / item.total) * 100) : 0}%` }}><b>{item.absent || ''}</b></i>
          </div>
          <span>{item.label}</span>
          <div className="chart-hover-tooltip attendance-tooltip"><strong>{item.label}</strong><span>Có mặt: <b>{item.present}</b></span><span>Vắng: <b>{item.absent}</b></span>{item.late ? <span>Trễ: <b>{item.late}</b></span> : null}<small>Tổng lượt: {item.total}</small></div>
        </div>
      ))}
    </div>
  );
}

export default function OverviewChartGrid({ scoreDistribution, scoredStudentCount, attendanceSummary }) {
  return (
<section className="overview-chart-grid">
                <article className="overview-chart-card">
                  <div className="figma-panel-head"><div><h4>Phân bố kết quả học tập</h4><p>Giỏi, đạt và chưa đạt theo điểm trung bình</p></div></div>
                  <DonutChart segments={scoreDistribution} centerValue={scoredStudentCount || '—'} centerLabel="học sinh" />
                </article>
                <article className="overview-chart-card overview-chart-wide">
                  <div className="figma-panel-head"><div><h4>Điểm danh {attendanceSummary.monthLabel}</h4><p>{attendanceSummary.monthRate === null ? 'Chưa có dữ liệu trong tháng hiện tại' : `Tỷ lệ có mặt: ${attendanceSummary.monthRate}%`}</p></div></div>
                  <AttendanceMonthChart data={attendanceSummary.monthDays} monthLabel={attendanceSummary.monthLabel} />
                </article>
                <article className="overview-chart-card">
                  <div className="figma-panel-head"><div><h4>Điểm danh tuần này</h4><p>Thứ hai đến chủ nhật · tự đổi khi sang tuần mới</p></div></div>
                  <AttendanceWeekChart data={attendanceSummary.weekDays} />
                </article>
              </section>
  );
}
