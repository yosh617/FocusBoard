import { useMemo, useState, type FormEvent } from "react";
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

function toDateTimeLocal(timestamp: number) {
  const localTimestamp = timestamp - new Date(timestamp).getTimezoneOffset() * 60_000;
  return new Date(localTimestamp).toISOString().slice(0, 16);
}

function SessionEditForm({ session, onCancel, onSave }: {
  session: FocusSessionRecord;
  onCancel: () => void;
  onSave: (patch: Partial<FocusSessionRecord>) => Promise<boolean>;
}) {
  const [endedAt, setEndedAt] = useState(toDateTimeLocal(session.endedAt));
  const [durationMinutes, setDurationMinutes] = useState(String(Math.round(session.focusedDurationMs / 60_000)));
  const [result, setResult] = useState<FocusSessionRecord["result"]>(session.result);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const endedAtMs = new Date(endedAt).getTime();
    const minutes = Number(durationMinutes);
    if (!Number.isFinite(endedAtMs) || !Number.isInteger(minutes) || minutes < 0 || minutes > 1_440) {
      setError("終了日時と勉強時間を確認してください。");
      return;
    }
    setError("");
    setSaving(true);
    const saved = await onSave({
      startedAt: endedAtMs - minutes * 60_000,
      endedAt: endedAtMs,
      focusedDurationMs: minutes * 60_000,
      result
    });
    setSaving(false);
    if (!saved) setError("集中記録を保存できませんでした。");
  };

  return (
    <form className="session-history__editor" onSubmit={handleSubmit} aria-label="集中記録を編集">
      <div className="session-history__fields">
        <label>終了日時<input type="datetime-local" value={endedAt} onChange={(event) => setEndedAt(event.target.value)} required /></label>
        <label>勉強時間（分）<input type="number" min={0} max={1_440} step={1} inputMode="numeric" value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)} required /></label>
        <label>結果<select value={result} onChange={(event) => setResult(event.target.value as FocusSessionRecord["result"])}><option value="completed">完了</option><option value="cancelled">中断</option></select></label>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="session-history__editor-actions">
        <button type="submit" disabled={saving}>{saving ? "保存中" : "記録を保存"}</button>
        <button type="button" onClick={onCancel} disabled={saving}>キャンセル</button>
      </div>
    </form>
  );
}

export function ProductivityReport({ tasks, sessions, workMinutes, onUpdateSession, now = new Date() }: {
  tasks: TaskRecord[];
  sessions: FocusSessionRecord[];
  workMinutes: number;
  onUpdateSession: (id: string, patch: Partial<FocusSessionRecord>) => Promise<boolean>;
  now?: Date;
}) {
  const [period, setPeriod] = useState<ReportPeriod>("week");
  const [periodOffset, setPeriodOffset] = useState(0);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const report = useMemo(
    () => createProductivityReport(tasks, sessions, period, now, workMinutes, periodOffset),
    [now, period, periodOffset, sessions, tasks, workMinutes]
  );
  const focusHeatmap = useMemo(() => createFocusHeatmap(sessions, now), [now, sessions]);
  const periodLabel = period === "day" ? "日" : period === "week" ? "週" : "月";
  const maxDailyFocus = Math.max(1, ...report.dailyFocus.map((day) => day.focusedMs));
  const todayTaskCount = report.todayRemainingTasks + report.todayCompletedTasks;
  const todayCompletionRate = todayTaskCount === 0 ? 0 : Math.round((report.todayCompletedTasks / todayTaskCount) * 100);

  return (
    <div className="productivity-report">
      <div className="report-heading">
        <h3>集中レポート</h3>
        <div className="report-period" aria-label="集計期間">
          {periods.map((item) => <button type="button" aria-pressed={period === item.value} onClick={() => { setPeriod(item.value); setPeriodOffset(0); setEditingSessionId(null); }} key={item.value}>{item.label}</button>)}
        </div>
      </div>
      <div className="report-period-navigation" aria-label="レポート期間の移動">
        <button type="button" aria-label={`前の${periodLabel}`} onClick={() => { setPeriodOffset((current) => current - 1); setEditingSessionId(null); }}>‹</button>
        <span aria-live="polite">{report.periodLabel}</span>
        <button type="button" aria-label={`次の${periodLabel}`} disabled={periodOffset >= 0} onClick={() => { setPeriodOffset((current) => Math.min(0, current + 1)); setEditingSessionId(null); }}>›</button>
        {periodOffset < 0 && <button className="report-period-navigation__current" type="button" onClick={() => { setPeriodOffset(0); setEditingSessionId(null); }}>現在</button>}
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
      </>}

      <section aria-labelledby="history-title">
        <h4 id="history-title">セッション履歴</h4>
        {report.history.length === 0 ? <p className="report-empty">この期間の履歴はありません。</p> : (
          <ol className="session-history">{report.history.slice(0, 50).map((session) => {
            const isEditing = editingSessionId === session.id;
            return <li className={isEditing ? "is-editing" : undefined} key={session.id}>
              <button
                className="session-history__select"
                type="button"
                aria-pressed={isEditing}
                aria-label={`集中記録を編集：${session.taskTitleSnapshot ?? "タスクなし"} ${formatHistoryDate(session.endedAt)}`}
                onClick={() => setEditingSessionId((current) => current === session.id ? null : session.id)}
              >
                <div><strong>{session.taskTitleSnapshot ?? "タスクなし"}</strong><span>{session.projectNameSnapshot ?? "プロジェクトなし"}・{formatHistoryDate(session.endedAt)}</span></div>
                <div><strong>{formatFocusedTime(session.focusedDurationMs)}</strong><span>{session.result === "completed" ? "完了" : "中断"}</span></div>
              </button>
              {isEditing && <SessionEditForm
                session={session}
                onCancel={() => setEditingSessionId(null)}
                onSave={async (patch) => {
                  const saved = await onUpdateSession(session.id, patch);
                  if (saved) setEditingSessionId(null);
                  return saved;
                }}
              />}
            </li>;
          })}</ol>
        )}
      </section>
    </div>
  );
}
