import { useMemo, useState } from "react";
import type { FocusSessionRecord } from "../../types/focusSession";
import type { TaskRecord } from "../../types/task";
import { createProductivityReport, formatFocusedTime, type ReportPeriod } from "../../utils/productivityReport";

const periods: { value: ReportPeriod; label: string }[] = [
  { value: "day", label: "日" },
  { value: "week", label: "週" },
  { value: "month", label: "月" }
];

function formatHistoryDate(timestamp: number) {
  return new Date(timestamp).toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function ProductivityReport({ tasks, sessions, workMinutes, now = new Date() }: {
  tasks: TaskRecord[];
  sessions: FocusSessionRecord[];
  workMinutes: number;
  now?: Date;
}) {
  const [period, setPeriod] = useState<ReportPeriod>("week");
  const report = useMemo(
    () => createProductivityReport(tasks, sessions, period, now, workMinutes),
    [now, period, sessions, tasks, workMinutes]
  );
  const maxDailyFocus = Math.max(1, ...report.dailyFocus.map((day) => day.focusedMs));
  const todayTaskCount = report.todayRemainingTasks + report.todayCompletedTasks;
  const todayCompletionRate = todayTaskCount === 0 ? 0 : Math.round((report.todayCompletedTasks / todayTaskCount) * 100);

  return (
    <div className="productivity-report">
      <div className="report-heading">
        <h3>集中レポート</h3>
        <div className="report-period" aria-label="集計期間">
          {periods.map((item) => <button type="button" aria-pressed={period === item.value} onClick={() => setPeriod(item.value)} key={item.value}>{item.label}</button>)}
        </div>
      </div>

      <section className="report-summary" aria-label={`${report.periodLabel}のサマリー`}>
        <div className="report-stats">
          <div><span>集中時間</span><strong>{formatFocusedTime(report.focusedMs)}</strong></div>
          <div><span>完了セッション</span><strong>{report.completedSessions}回</strong></div>
          <div><span>中断</span><strong>{report.cancelledSessions}回</strong></div>
          <div><span>今日のタスク</span><strong>{todayTaskCount === 0 ? "—" : `${report.todayCompletedTasks} / ${todayTaskCount}`}</strong></div>
        </div>
        {todayTaskCount > 0 && <progress max={100} value={todayCompletionRate} aria-label={`今日のタスク進捗 ${todayCompletionRate}%`} />}
      </section>

      {report.focusedMs === 0 ? <section className="report-empty-state" aria-labelledby="report-empty-title">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10M10 20V5M16 20v-7M22 20H2" /></svg>
        <div><h4 id="report-empty-title">この期間の集中記録はまだありません。</h4><p>{report.periodLabel}</p></div>
      </section> : <>
      <section aria-labelledby="focus-trend-title">
        <div className="report-section-heading"><div><h4 id="focus-trend-title">集中時間</h4><p>{report.periodLabel}</p></div><strong>{formatFocusedTime(report.focusedMs)}</strong></div>
        <div className="report-bars" aria-label="日別集中時間">
          {report.dailyFocus.map((day) => (
            <div className="report-bar" key={day.date}>
              <span>{day.date.slice(5).replace("-", "/")}</span>
              <i><b style={{ width: `${day.focusedMs / maxDailyFocus * 100}%` }} /></i>
              <strong>{formatFocusedTime(day.focusedMs)}</strong>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="project-report-title">
        <h4 id="project-report-title">プロジェクト別</h4>
        {report.projectBreakdown.length === 0 ? <p className="report-empty">集計できるプロジェクトはありません。</p> : (
          <div className="report-breakdown">
            {report.projectBreakdown.map((item) => <div key={item.key}><span>{item.label}</span><i><b style={{ width: `${item.ratio * 100}%` }} /></i><strong>{formatFocusedTime(item.focusedMs)}（{Math.round(item.ratio * 100)}%）</strong></div>)}
          </div>
        )}
      </section>

      <section aria-labelledby="task-report-title">
        <h4 id="task-report-title">タスク別 見積もり対実績</h4>
        {report.taskComparisons.length === 0 ? <p className="report-empty">タスクに紐づく集中記録はありません。</p> : (
          <div className="report-table-wrap">
            <table><thead><tr><th>タスク</th><th>見積もり</th><th>実績</th></tr></thead><tbody>{report.taskComparisons.map((item) => <tr key={item.id}><th>{item.title}</th><td>{item.estimatedMinutes > 0 ? `${item.estimatedMinutes}分` : "—"}</td><td>{formatFocusedTime(item.focusedMs)}</td></tr>)}</tbody></table>
          </div>
        )}
      </section>

      <section aria-labelledby="history-title">
        <h4 id="history-title">セッション履歴</h4>
        {report.history.length === 0 ? <p className="report-empty">この期間の履歴はありません。</p> : (
          <ol className="session-history">{report.history.slice(0, 50).map((session) => <li key={session.id}><div><strong>{session.taskTitleSnapshot ?? "タスクなし"}</strong><span>{session.projectNameSnapshot ?? "プロジェクトなし"}・{formatHistoryDate(session.endedAt)}</span></div><div><strong>{formatFocusedTime(session.focusedDurationMs)}</strong><span>{session.result === "completed" ? "完了" : "中断"}</span></div></li>)}</ol>
        )}
      </section>
      </>}
    </div>
  );
}
