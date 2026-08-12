import { useEffect, useRef } from "react";

type Props = {
  open: boolean;
  taskTitle: string;
  focusedDurationLabel: string | null;
  nextModeLabel: string;
  remainingTodayCount: number;
  nextTaskTitle: string | null;
  nextTaskDetail: string | null;
  onStartBreak: () => void;
  onStartNextTask: () => void;
  onContinueTask: () => void;
  onCompleteTask: () => void;
  onOpenTaskList: () => void;
  onClose: () => void;
};

export function SessionCompleteDialog({
  open,
  taskTitle,
  focusedDurationLabel,
  nextModeLabel,
  remainingTodayCount,
  nextTaskTitle,
  nextTaskDetail,
  onStartBreak,
  onStartNextTask,
  onContinueTask,
  onCompleteTask,
  onOpenTaskList,
  onClose
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const recommendedFlowLabel = nextTaskTitle
    ? `${nextModeLabel}のあとに${nextTaskTitle}`
    : `${nextModeLabel}のあとに一覧から次を選ぶ`;
  const recommendedFlowDetail = nextTaskTitle
    ? `${nextTaskDetail ?? "休憩後に、そのまま次の集中へ移れます。"}${remainingTodayCount > 0 ? ` 今日の未完了はあと${remainingTodayCount}件です。` : ""}`
    : remainingTodayCount > 0
      ? `今日は優先タスクがひと区切りです。${nextModeLabel}のあとで、残り${remainingTodayCount}件から次を選べます。`
      : "今日は優先タスクがひと区切りです。休憩後は一覧から次を選べます。";

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    primaryRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !dialogRef.current) return;
      const buttons = [...dialogRef.current.querySelectorAll<HTMLButtonElement>("button:not([disabled])")];
      const first = buttons[0];
      const last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, [onClose, open]);

  if (!open) return null;
  return (
    <div className="session-complete-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="session-complete" role="dialog" aria-modal="true" aria-labelledby="session-complete-title" ref={dialogRef}>
        <p className="eyebrow">SESSION COMPLETE</p>
        <h2 id="session-complete-title">集中セッション完了</h2>
        <p><strong>{taskTitle}</strong>の集中時間を記録しました。</p>
        <div className="session-complete__summary" aria-label="完了した集中の概要">
          <div>
            <span>記録した集中</span>
            <strong>{focusedDurationLabel ?? "00:00"}</strong>
          </div>
          <div>
            <span>次のおすすめ</span>
            <strong>{nextModeLabel}</strong>
          </div>
          <div>
            <span>今日の未完了</span>
            <strong>{remainingTodayCount}件</strong>
          </div>
        </div>
        <section className="session-complete__plan" aria-labelledby="session-complete-plan-title">
          <div className="session-complete__plan-copy">
            <span>おすすめの流れ</span>
            <h3 id="session-complete-plan-title">{recommendedFlowLabel}</h3>
            <p>{recommendedFlowDetail}</p>
          </div>
          <div className="session-complete__plan-actions">
            <button className="primary-button session-complete__choice" type="button" onClick={onStartBreak} ref={primaryRef} aria-label="休憩を開始">
              <strong>休憩を開始</strong>
              <span>{nextModeLabel}へ移って流れを続けます。</span>
            </button>
            {nextTaskTitle && (
              <button className="secondary-button session-complete__next-action" type="button" onClick={onStartNextTask} aria-label={`${nextTaskTitle}を開始`}>
                <strong>次のタスクへ</strong>
                <span>{nextTaskTitle}</span>
              </button>
            )}
          </div>
        </section>
        {!nextTaskTitle && <p className="session-complete__note">休憩後は一覧から次を選べます。必要なら今ここで完了や継続も選べます。</p>}
        <div className="session-complete__actions">
          <button className="secondary-button session-complete__choice" type="button" onClick={onContinueTask} aria-label="同じタスクを続ける">
            <strong>同じタスクを続ける</strong>
            <span>もう1セッション続けて進めます。</span>
          </button>
          <button className="secondary-button session-complete__choice" type="button" onClick={onCompleteTask} aria-label="タスクを完了">
            <strong>タスクを完了</strong>
            <span>記録を残したままタスクを閉じます。</span>
          </button>
          <button className="secondary-button session-complete__choice" type="button" onClick={onOpenTaskList} aria-label="タスク一覧を開く">
            <strong>一覧で次を選ぶ</strong>
            <span>今日の残りや候補を見ながら次を決めます。</span>
          </button>
          <button className="text-button" type="button" onClick={onClose}>未完了のまま閉じる</button>
        </div>
      </div>
    </div>
  );
}
