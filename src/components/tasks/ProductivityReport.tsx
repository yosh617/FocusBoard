import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { FocusSessionRecord } from "../../types/focusSession";
import type { TaskRecord } from "../../types/task";
import { calculateFocusedDurationMs, getFocusedDurationMs } from "../../utils/focusSession";
import { createFocusHeatmap, createProductivityReport, formatFocusedTime, type ReportPeriod } from "../../utils/productivityReport";
import { toLocalDateKey } from "../../utils/taskQueries";
import "./ProductivityReport.css";

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

function formatHistoryDay(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("ja-JP", {
    month: "long",
    day: "numeric",
    weekday: "short"
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

function getScrollContainer(element: HTMLElement) {
  let current: HTMLElement | null = element.parentElement;
  while (current) {
    const overflowY = window.getComputedStyle(current).overflowY;
    if ((overflowY === "auto" || overflowY === "scroll") && current.scrollHeight > current.clientHeight) return current;
    current = current.parentElement;
  }
  return document.scrollingElement as HTMLElement | null;
}

function SessionEditForm({ session, onCancel, onSave }: {
  session: FocusSessionRecord;
  onCancel: () => void;
  onSave: (patch: Partial<FocusSessionRecord>) => Promise<boolean>;
}) {
  const pauseIntervals = session.pauseIntervals ?? [];
  const [endedAt, setEndedAt] = useState(toDateTimeLocal(session.endedAt));
  const [startedAt, setStartedAt] = useState(toDateTimeLocal(session.startedAt));
  const [result, setResult] = useState<FocusSessionRecord["result"]>(session.result);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const startedAtMs = new Date(startedAt).getTime();
    const endedAtMs = new Date(endedAt).getTime();
    if (!Number.isFinite(startedAtMs) || !Number.isFinite(endedAtMs) || endedAtMs < startedAtMs) {
      setError("終了日時と勉強時間を確認してください。");
      return;
    }
    setError("");
    setSaving(true);
    const saved = await onSave({
      startedAt: startedAtMs,
      endedAt: endedAtMs,
      focusedDurationMs: calculateFocusedDurationMs(startedAtMs, endedAtMs, pauseIntervals),
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
        <label>実働時間（自動計算）<output className="session-history__computed-time">{formatFocusedTime(calculateFocusedDurationMs(Number.isFinite(new Date(startedAt).getTime()) ? new Date(startedAt).getTime() : session.startedAt, Number.isFinite(new Date(endedAt).getTime()) ? new Date(endedAt).getTime() : session.endedAt, pauseIntervals))}</output></label>
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
  const [view, setView] = useState<"home" | "annual" | "timeline">("home");
  const [selectedChartPoint, setSelectedChartPoint] = useState<string | null>(null);
  const previousViewRef = useRef(view);
  const reportRootRef = useRef<HTMLDivElement>(null);
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const returnEntryRef = useRef<"annual" | "timeline">("annual");
  const savedScrollRef = useRef<{ element: HTMLElement; top: number } | null>(null);
  const report = useMemo(
    () => createProductivityReport(tasks, sessions, period, now, workMinutes, periodOffset),
    [now, period, periodOffset, sessions, tasks, workMinutes]
  );
  const comparisonSeries = useMemo(() => {
    if (period !== "day") return report.dailyFocus.map((item) => ({ label: period === "week" ? new Date(`${item.date}T00:00:00`).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" }) : `${new Date(`${item.date}T00:00:00`).getDate()}日`, value: item.focusedMs }));
    const sumHourly = (timeline: typeof report.timeline) => {
      const hourly = Array.from({ length: 24 }, () => 0);
      for (const day of timeline) for (const segment of day.segments) {
        let cursor = segment.startAt;
        while (cursor < segment.endAt) {
          const end = Math.min(segment.endAt, new Date(new Date(cursor).setMinutes(0, 0, 0) + 60 * 60_000).getTime());
          hourly[new Date(cursor).getHours()] += end - cursor;
          cursor = end;
        }
      }
      return hourly;
    };
    const current = sumHourly(report.timeline);
    return current.map((value, hour) => ({ label: `${String(hour).padStart(2, "0")}時`, value }));
  }, [period, report]);
  const focusHeatmap = useMemo(() => createFocusHeatmap(sessions, now), [now, sessions]);
  const activityScrollRef = useRef<HTMLDivElement>(null);
  const todayKey = toLocalDateKey(now);
  useEffect(() => {
    const scrollElement = activityScrollRef.current;
    if (!scrollElement) return;
    const alignToLatest = () => {
      scrollElement.scrollLeft = Math.max(0, scrollElement.scrollWidth - scrollElement.clientWidth);
    };
    alignToLatest();
    const frame = window.requestAnimationFrame(alignToLatest);
    return () => window.cancelAnimationFrame(frame);
  }, [focusHeatmap.weeks.length, view]);
  useEffect(() => {
    const previousView = previousViewRef.current;
    previousViewRef.current = view;
    if (previousView === view) return;
    if (view === "home") {
      if (savedScrollRef.current) savedScrollRef.current.element.scrollTop = savedScrollRef.current.top;
      reportRootRef.current?.querySelector<HTMLButtonElement>(`[data-report-entry="${returnEntryRef.current}"]`)?.focus();
    } else backButtonRef.current?.focus();
  }, [view]);
  const periodLabel = period === "day" ? "日" : period === "week" ? "週" : "月";
  const completedTaskCount = tasks.filter((task) => task.status === "completed" && task.completedAt !== null && task.completedAt >= report.startAt && task.completedAt < report.endAt).length;

  return (
    <div ref={reportRootRef} className={`productivity-report${focusHeatmap.totalFocusedMs === 0 ? " productivity-report--no-activity" : ""}`} data-report-view={view}>
      {view !== "home" && <button ref={backButtonRef} className="report-back" type="button" onClick={() => setView("home")}>‹ レポートに戻る</button>}
      <div className="report-heading">
        <h3>レポート</h3>
        <div className="report-period" role="group" aria-label="集計期間" hidden={view === "annual"}>
          {periods.map((item) => <button type="button" aria-pressed={period === item.value} onClick={() => { setPeriod(item.value); setPeriodOffset(0); setEditingSessionId(null); setSelectedChartPoint(null); }} key={item.value}>{item.label}</button>)}
        </div>
        <div className="report-heading__controls" hidden={view === "annual"}>
          <div className="report-period-navigation" role="group" aria-label="レポート期間の移動">
            <button type="button" aria-label={`前の${periodLabel}`} onClick={() => { setPeriodOffset((current) => current - 1); setEditingSessionId(null); setSelectedChartPoint(null); }}>‹</button>
            <span aria-live="polite">{report.periodLabel}</span>
            <button type="button" aria-label={`次の${periodLabel}`} disabled={periodOffset >= 0} onClick={() => { setPeriodOffset((current) => Math.min(0, current + 1)); setEditingSessionId(null); setSelectedChartPoint(null); }}>›</button>
            <button className="report-period-navigation__current" type="button" disabled={periodOffset >= 0} onClick={() => { setPeriodOffset(0); setEditingSessionId(null); setSelectedChartPoint(null); }}>現在</button>
          </div>
        </div>
      </div>

      {view === "home" && <nav className="report-chart-nav" aria-label="詳しいレポート"><button data-report-entry="annual" type="button" onClick={(event) => { returnEntryRef.current = "annual"; const scrollable = getScrollContainer(event.currentTarget); if (scrollable) savedScrollRef.current = { element: scrollable, top: scrollable.scrollTop }; setView("annual"); }}><span>年間の集中記録</span><strong>{formatFocusedTime(focusHeatmap.totalFocusedMs)}</strong><small>1年間の記録を見る &gt;</small></button><button data-report-entry="timeline" type="button" onClick={(event) => { returnEntryRef.current = "timeline"; const scrollable = getScrollContainer(event.currentTarget); if (scrollable) savedScrollRef.current = { element: scrollable, top: scrollable.scrollTop }; setView("timeline"); }}><span>実施時間帯</span><strong>{formatFocusedTime(report.focusedMs)}</strong><small>{report.periodLabel}の時間帯を見る &gt;</small></button></nav>}

      <section className="report-activity" aria-labelledby="report-activity-title" hidden={view !== "annual"}>
        <div className="report-activity__heading">
          <div>
            <h4 id="report-activity-title">直近1年の集中記録</h4>
          </div>
          <strong>{formatFocusedTime(focusHeatmap.totalFocusedMs)}</strong>
        </div>
        <div className="report-activity__calendar" aria-label="直近1年の集中時間ヒートマップ">
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
          <div className="report-activity__scroll" ref={activityScrollRef}>
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
                        data-today={day.date === todayKey ? "true" : undefined}
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
      </section>

      <section className="report-summary" aria-label={`${report.periodLabel}のサマリー`} hidden={view !== "home"}>
        <div className="report-stats">
          <div><span>集中時間</span><strong>{formatFocusedTime(report.focusedMs)}</strong></div>
          <div><span>完了セッション</span><strong>{report.completedSessions}回</strong></div>
          <div><span>中断</span><strong>{report.cancelledSessions}回</strong></div>
          <div><span>完了タスク</span><strong>{completedTaskCount}件</strong></div>
        </div>
      </section>

      {view === "home" && <section className="report-comparison" aria-label={`${report.periodLabel}の集中時間の推移`}><h4>集中時間の推移</h4><p>{period === "day" ? "時間別" : "日別"} ・ {report.periodLabel}</p>{period === "day" && <p className="report-comparison__note">日をまたぐ記録は、選択日の時間帯に含まれる分を表示します。</p>}{comparisonSeries.every((item) => item.value === 0) ? <p className="report-empty">グラフにできる集中記録はありません。</p> : <div className="report-comparison__chart" aria-label={`${report.periodLabel}の${period === "day" ? "時間別" : "日別"}集中時間`}>
        {comparisonSeries.map((item) => { const max = Math.max(1, ...comparisonSeries.map((point) => point.value)); return <button type="button" className="report-comparison__column" key={item.label} title={`${item.label}：${formatFocusedTime(item.value)}`} aria-label={`${item.label}、集中時間 ${formatFocusedTime(item.value)}`} aria-pressed={selectedChartPoint === item.label} onClick={() => setSelectedChartPoint(item.label)}><i aria-hidden="true"><b style={{ height: `${Math.max(item.value > 0 ? 3 : 0, item.value / max * 100)}%` }} /></i><small>{item.label}</small></button>; })}
      </div>}{selectedChartPoint && comparisonSeries.some((item) => item.label === selectedChartPoint) && <p className="report-comparison__selected" aria-live="polite">{selectedChartPoint}：集中 {formatFocusedTime(comparisonSeries.find((item) => item.label === selectedChartPoint)?.value ?? 0)}</p>}</section>}

      {report.focusedMs === 0 ? <section className="report-empty-state" aria-labelledby="report-empty-title" hidden={view !== "home" && view !== "timeline"}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10M10 20V5M16 20v-7M22 20H2" /></svg>
        <div><h4 id="report-empty-title">この期間の集中記録はありません</h4><p>{report.periodLabel}。タイマーを使うと、ここに記録が表示されます。</p></div>
      </section> : <>
      <section className="focus-timeline-section" aria-labelledby="focus-timeline-title" hidden={view !== "timeline"}>
        <div className="report-section-heading"><h4 id="focus-timeline-title">実施時間帯</h4><strong>{formatFocusedTime(report.focusedMs)}</strong></div>
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
      </section>

      <section aria-labelledby="project-report-title" hidden={view !== "home"}>
        <h4 id="project-report-title">プロジェクト別</h4>
        {report.projectBreakdown.length === 0 ? <p className="report-empty">集計できるプロジェクトはありません。</p> : (
          <div className="report-breakdown">
            {report.projectBreakdown.map((item) => <div key={item.key}><span>{item.label}</span><i><b style={{ width: `${item.ratio * 100}%` }} /></i><strong>{formatFocusedTime(item.focusedMs)}（{Math.round(item.ratio * 100)}%）</strong></div>)}
          </div>
        )}
      </section>

      <section aria-labelledby="task-report-title" hidden={view !== "home"}>
        <details className="report-disclosure">
          <summary><span id="task-report-title">タスク別 見積もり対実績</span><strong>{report.taskComparisons.length}件</strong></summary>
          {report.taskComparisons.length === 0 ? <p className="report-empty">タスクに紐づく集中記録はありません。</p> : (
            <div className="report-table-wrap">
              <table><thead><tr><th>タスク</th><th>見積もり</th><th>実績</th></tr></thead><tbody>{report.taskComparisons.map((item) => <tr key={item.id}><th>{item.title}</th><td>{item.estimatedMinutes > 0 ? `${item.estimatedMinutes}分` : "—"}</td><td>{formatFocusedTime(item.focusedMs)}</td></tr>)}</tbody></table>
            </div>
          )}
        </details>
      </section>
      </>}

      <section aria-labelledby="history-title" hidden={view !== "home"}>
        <details className="report-disclosure">
          <summary><span id="history-title">セッション履歴</span><strong>{report.history.length}件</strong></summary>
          {report.history.length === 0 ? <p className="report-empty">この期間の履歴はありません。</p> : (
            <>
            {report.history.length > 50 && <p className="session-history__limit-note">最新50件を表示しています。</p>}
            <div className="session-history-groups">{Object.entries(report.history.slice(0, 50).reduce<Record<string, FocusSessionRecord[]>>((groups, session) => {
              const date = toLocalDateKey(new Date(session.startedAt));
              (groups[date] ??= []).push(session);
              return groups;
            }, {})).map(([date, daySessions]) => {
              const focusedMs = daySessions.reduce((total, session) => total + getFocusedDurationMs(session), 0);
              const completedCount = daySessions.filter((session) => session.result === "completed").length;
              return <section className="session-history-day" aria-label={`${formatHistoryDay(date)}の集中記録`} key={date}>
                <header className="session-history-day__heading">
                  <h5>{formatHistoryDay(date)}</h5>
                  <p><span>集中 {formatFocusedTime(focusedMs)}</span><span>完了 {completedCount}回</span></p>
                </header>
                <ol className="session-history">{daySessions.map((session) => {
                  const isEditing = editingSessionId === session.id;
                  return <li className={`${isEditing ? "is-editing " : ""}${session.result === "cancelled" ? "is-cancelled" : ""}`} key={session.id}>
                    <button
                      className="session-history__select"
                      type="button"
                      aria-expanded={isEditing}
                      aria-label={`集中記録を編集：${session.taskTitleSnapshot ?? "タスクなし"} ${formatHistoryDate(session.startedAt)}から${formatHistoryDate(session.endedAt)}、${session.result === "completed" ? "完了" : "中断"}`}
                      onClick={() => setEditingSessionId((current) => current === session.id ? null : session.id)}
                    >
                      <span className="session-history__copy"><strong>{session.taskTitleSnapshot ?? "タスクなし"}</strong><span>{formatFocusedTime(getFocusedDurationMs(session))} ・ {session.result === "completed" ? "完了" : "中断"}{session.projectNameSnapshot ? ` ・ ${session.projectNameSnapshot}` : ""}{getPausedDurationMs(session) > 0 ? ` ・ 休止 ${formatFocusedTime(getPausedDurationMs(session))}` : ""}</span></span>
                      <span className="session-history__times"><time dateTime={new Date(session.startedAt).toISOString()}>{formatTimelineTime(session.startedAt)}</time><i aria-hidden="true" /> <time dateTime={new Date(session.endedAt).toISOString()}>{formatTimelineTime(session.endedAt)}</time></span>
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
              </section>;
            })}</div>
            </>
          )}
        </details>
      </section>
    </div>
  );
}
