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

function formatTimelineDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", weekday: "short" });
}

function formatTimelineTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

function getTimelinePosition(timestamp: number, date: string) {
  const startOfDay = new Date(`${date}T00:00:00`).getTime();
  return Math.max(0, Math.min(100, (timestamp - startOfDay) / 86_400_000 * 100));
}

function toDateTimeLocal(timestamp: number) {
  const localTimestamp = timestamp - new Date(timestamp).getTimezoneOffset() * 60_000;
  return new Date(localTimestamp).toISOString().slice(0, 16);
}

function getPausedDurationMs(session: FocusSessionRecord) {
  return (session.pauseIntervals ?? []).reduce((total, interval) => total + Math.max(0, interval.endedAt - interval.startedAt), 0);
}

function SessionEditForm({ session, onCancel, onSave }: {
  session: FocusSessionRecord;
  onCancel: () => void;
  onSave: (patch: Partial<FocusSessionRecord>) => Promise<boolean>;
}) {
  const pauseIntervals = session.pauseIntervals ?? [];
  const [endedAt, setEndedAt] = useState(toDateTimeLocal(session.endedAt));
  const [startedAt, setStartedAt] = useState(toDateTimeLocal(session.startedAt));
  const [durationMinutes, setDurationMinutes] = useState(String(Math.round(session.focusedDurationMs / 60_000)));
  const [result, setResult] = useState<FocusSessionRecord["result"]>(session.result);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const startedAtMs = new Date(startedAt).getTime();
    const endedAtMs = new Date(endedAt).getTime();
    const minutes = Number(durationMinutes);
    if (!Number.isFinite(startedAtMs) || !Number.isFinite(endedAtMs) || endedAtMs < startedAtMs || !Number.isInteger(minutes) || minutes < 0 || minutes > 1_440) {
      setError("終了日時と勉強時間を確認してください。");
      return;
    }
    setError("");
    setSaving(true);
    const saved = await onSave({
      startedAt: pauseIntervals.length > 0 ? startedAtMs : endedAtMs - minutes * 60_000,
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
        <label>開始日時<input type="datetime-local" value={startedAt} onChange={(event) => setStartedAt(event.target.value)} required /></label>
        <label>終了日時<input type="datetime-local" value={endedAt} onChange={(event) => setEndedAt(event.target.value)} required /></label>
        <label>勉強時間（分）<input type="number" min={0} max={1_440} step={1} inputMode="numeric" value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)} readOnly={pauseIntervals.length > 0} required /></label>
        <label>結果<select value={result} onChange={(event) => setResult(event.target.value as FocusSessionRecord["result"])}><option value="completed">完了</option><option value="cancelled">中断</option></select></label>
      </div>
      {pauseIntervals.length > 0 && <p className="session-history__pause-note">一時停止 {formatFocusedTime(getPausedDurationMs(session))}（{pauseIntervals.length}回）</p>}
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
      <section className="focus-timeline-section" aria-labelledby="focus-timeline-title">
        <div className="report-section-heading"><div><h4 id="focus-timeline-title">実施時間帯</h4><p>{report.periodLabel}・色付きの帯が実施時間</p></div><strong>{formatFocusedTime(report.focusedMs)}</strong></div>
        <div className="focus-timeline__scroll">
          <div className="focus-timeline" aria-label={`${report.periodLabel}の集中タイムライン`}>
            <div className="focus-timeline__axis" aria-hidden="true">
              <span />
              <div>{[0, 4, 8, 12, 16, 20, 24].map((hour) => <span key={hour} style={{ left: `${hour / 24 * 100}%` }}>{`${String(hour).padStart(2, "0")}:00`}</span>)}</div>
            </div>
            <div className="focus-timeline__rows">
              {report.timeline.map((day) => (
                <div className="focus-timeline__row" key={day.date}>
                  <time dateTime={day.date}>{formatTimelineDate(day.date)}</time>
                  <div className="focus-timeline__track">
                    <div className="focus-timeline__grid" aria-hidden="true">{Array.from({ length: 24 }, (_, hour) => <i key={hour} />)}</div>
                    {day.segments.map((segment, index) => {
                      const left = getTimelinePosition(segment.startAt, day.date);
                      const right = getTimelinePosition(segment.endAt, day.date);
                      return <span
                        className={`focus-timeline__segment${segment.result === "cancelled" ? " is-cancelled" : ""}`}
                        style={{ left: `${left}%`, width: `${Math.max(.4, right - left)}%` }}
                        role="img"
                        aria-label={`${segment.taskTitle} ${formatTimelineTime(segment.startAt)}〜${formatTimelineTime(segment.endAt)} ${segment.result === "completed" ? "完了" : "中断"}`}
                        title={`${segment.taskTitle}・${formatTimelineTime(segment.startAt)}〜${formatTimelineTime(segment.endAt)}`}
                        key={`${segment.sessionId}-${segment.startAt}-${index}`}
                      />;
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <details className="focus-timeline__details">
          <summary>実施記録を時刻で確認</summary>
          <ol>
            {report.timeline.flatMap((day) => day.segments.map((segment, index) => <li key={`${segment.sessionId}-${segment.startAt}-${index}`}>
              <time dateTime={new Date(segment.startAt).toISOString()}>{formatTimelineDate(day.date)} {formatTimelineTime(segment.startAt)}〜{formatTimelineTime(segment.endAt)}</time>
              <span>{segment.taskTitle}</span>
              <em>{segment.result === "completed" ? "完了" : "中断"}</em>
            </li>))}
          </ol>
        </details>
        <p className="report-caption">一時停止中は帯を分けて表示しています。帯と一覧で実施時刻を確認できます。</p>
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
                <div><strong>{formatFocusedTime(session.focusedDurationMs)}</strong><span>{session.result === "completed" ? "完了" : "中断"}{getPausedDurationMs(session) > 0 ? `・休止 ${formatFocusedTime(getPausedDurationMs(session))}` : ""}</span></div>
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
