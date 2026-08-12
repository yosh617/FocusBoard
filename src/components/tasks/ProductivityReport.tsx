import { useMemo, useState } from "react";
import type { FocusSessionRecord } from "../../types/focusSession";
import type { TaskRecord } from "../../types/task";
import { addLocalDays, toLocalDateKey } from "../../utils/taskQueries";
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

function getFocusStreak(sessions: FocusSessionRecord[], now: Date) {
  const focusedDates = new Set(
    sessions
      .filter((session) => session.mode === "work" && session.focusedDurationMs > 0)
      .map((session) => toLocalDateKey(new Date(session.endedAt)))
  );
  let streak = 0;
  let cursor = toLocalDateKey(now);
  while (focusedDates.has(cursor)) {
    streak += 1;
    cursor = addLocalDays(cursor, -1);
  }
  return streak;
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
  const todayReport = useMemo(
    () => createProductivityReport(tasks, sessions, "day", now, workMinutes),
    [now, sessions, tasks, workMinutes]
  );
  const maxDailyFocus = Math.max(1, ...report.dailyFocus.map((day) => day.focusedMs));
  const todayTaskCount = report.todayRemainingTasks + report.todayCompletedTasks;
  const todayCompletionRate = todayTaskCount === 0 ? 0 : Math.round((report.todayCompletedTasks / todayTaskCount) * 100);
  const activeDays = report.dailyFocus.filter((day) => day.focusedMs > 0).length;
  const averageFocusedMs = activeDays === 0 ? 0 : Math.round(report.focusedMs / activeDays);
  const focusStreak = useMemo(() => getFocusStreak(sessions, now), [now, sessions]);
  const topProject = report.projectBreakdown[0];

  return (
    <div className="productivity-report">
      <div className="report-heading">
        <div><p className="eyebrow">LOCAL REPORT</p><h3>集中レポート</h3></div>
        <div className="report-period" aria-label="集計期間">
          {periods.map((item) => <button type="button" aria-pressed={period === item.value} onClick={() => setPeriod(item.value)} key={item.value}>{item.label}</button>)}
        </div>
      </div>

      <section className="report-overview" aria-labelledby="report-overview-title">
        <div className="report-overview__header">
          <div>
            <h4 id="report-overview-title">いまのペース</h4>
            <p>{report.periodLabel}の集中状況を今日の流れに合わせて確認できます。</p>
          </div>
          <strong>{formatFocusedTime(report.focusedMs)}</strong>
        </div>
        <div className="report-overview__stats">
          <div><span>今日の進捗</span><strong>{todayCompletionRate}%</strong></div>
          <div><span>継続日数</span><strong>{focusStreak}日</strong></div>
          <div><span>平均集中</span><strong>{averageFocusedMs > 0 ? formatFocusedTime(averageFocusedMs) : "0分"}</strong></div>
          <div><span>主なプロジェクト</span><strong>{topProject?.label ?? "まだありません"}</strong></div>
        </div>
        <div className="report-overview__progress" aria-label="今日のタスク進捗">
          <div>
            <span>今日のタスク進行</span>
            <strong>{todayTaskCount === 0 ? "まだ今日のタスクはありません" : `${report.todayCompletedTasks} / ${todayTaskCount}件が完了`}</strong>
          </div>
          <progress max={100} value={todayCompletionRate} aria-label={`今日のタスク進捗 ${todayCompletionRate}%`} />
        </div>
      </section>

      <section aria-labelledby="today-summary-title">
        <h4 id="today-summary-title">今日の予定</h4>
        <div className="report-stats">
          <div><span>見積もり</span><strong>{report.todayEstimatedMinutes}分</strong></div>
          <div><span>実集中</span><strong>{formatFocusedTime(todayReport.focusedMs)}</strong></div>
          <div><span>残タスク</span><strong>{report.todayRemainingTasks}件</strong></div>
          <div><span>完了</span><strong>{report.todayCompletedTasks}件</strong></div>
        </div>
      </section>

      <section aria-labelledby="focus-trend-title">
        <div className="report-section-heading"><div><h4 id="focus-trend-title">集中時間</h4><p>{report.periodLabel}</p></div><strong>{formatFocusedTime(report.focusedMs)}</strong></div>
        {report.focusedMs === 0 ? <p className="report-empty">この期間の集中記録はまだありません。</p> : (
          <div className="report-bars" aria-label="日別集中時間">
            {report.dailyFocus.map((day) => (
              <div className="report-bar" key={day.date}>
                <span>{day.date.slice(5).replace("-", "/")}</span>
                <i><b style={{ width: `${day.focusedMs / maxDailyFocus * 100}%` }} /></i>
                <strong>{formatFocusedTime(day.focusedMs)}</strong>
              </div>
            ))}
          </div>
        )}
        <p className="report-caption">完了 {report.completedSessions}回・中断 {report.cancelledSessions}回</p>
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
    </div>
  );
}
