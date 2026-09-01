import { useMemo, useState } from "react";
import type { FocusSessionRecord } from "../../types/focusSession";
import type { TaskRecord } from "../../types/task";
import { createFocusHeatmap, createProductivityReport, formatFocusedTime, type ReportPeriod } from "../../utils/productivityReport";

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
  const focusHeatmap = useMemo(() => createFocusHeatmap(sessions, now), [now, sessions]);
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

      <section className="report-activity" aria-labelledby="report-activity-title">
        <div className="report-activity__heading">
          <div>
            <h4 id="report-activity-title">勉強時間</h4>
            <p>直近1年の集中記録</p>
          </div>
          <strong>{formatFocusedTime(focusHeatmap.totalFocusedMs)}</strong>
        </div>
        <div className="report-activity__scroll">
          <div className="report-activity__calendar" aria-label="直近1年の勉強時間ヒートマップ">
            <div className="report-activity__weekdays" aria-hidden="true">
              <span className="report-activity__month-spacer" />
              <span>日</span>
              <span>月</span>
              <span>火</span>
              <span>水</span>
              <span>木</span>
              <span>金</span>
              <span>土</span>
            </div>
            <div className="report-activity__graph">
              <div className="report-activity__months" aria-hidden="true">
                {focusHeatmap.weeks.map((week, index) => {
                  const month = new Date(`${week[0].date}T00:00:00`).getMonth();
                  const previousMonth = index === 0 ? -1 : new Date(`${focusHeatmap.weeks[index - 1][0].date}T00:00:00`).getMonth();
                  return <span key={week[0].date}>{month !== previousMonth ? `${month + 1}月` : ""}</span>;
                })}
              </div>
              <div className="report-activity__grid">
                {focusHeatmap.weeks.map((week) => (
                  <div className="report-activity__week" key={week[0].date}>
                    {week.map((day) => (
                      <span
                        className="report-activity__day"
                        data-level={day.level}
                        data-future={day.isFuture ? "true" : undefined}
                        key={day.date}
                        role="img"
                        aria-label={`${new Date(`${day.date}T00:00:00`).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" })} ${day.isFuture ? "予定" : formatFocusedTime(day.focusedMs)}`}
                        title={`${day.date.replaceAll("-", "/")}：${day.isFuture ? "予定" : formatFocusedTime(day.focusedMs)}`}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="report-activity__legend" aria-hidden="true">
          <span>少ない</span>
          {[0, 1, 2, 3, 4].map((level) => <i data-level={level} key={level} />)}
          <span>多い</span>
        </div>
      </section>

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
