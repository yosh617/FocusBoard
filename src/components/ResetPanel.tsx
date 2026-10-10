import { useState } from "react";
import { clearAppIndexedDb, clearAppLocalData } from "../utils/storage";
import { clearPwaCachesAndWorkers } from "../utils/pwaCleanup";
import { ConfirmDialog } from "./ui/ConfirmDialog";

type Props = {
  onResetSettings: () => void;
  onClearTimer: () => void;
  onMessage: (message: string) => void;
};

export function ResetPanel({ onResetSettings, onClearTimer, onMessage }: Props) {
  const [showDeleteGuide, setShowDeleteGuide] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState<"settings" | "timer" | "everything" | "pwa" | null>(null);

  const clearEverything = async () => {
    setBusy(true);
    clearAppLocalData();
    await clearAppIndexedDb().catch(() => undefined);
    window.location.reload();
  };

  const clearPwa = async () => {
    setBusy(true);
    try {
      const result = await clearPwaCachesAndWorkers();
      onMessage(result.supported
        ? `キャッシュ${result.cachesDeleted}件と、オフライン動作に関する情報${result.registrationsDeleted}件を削除しました。アプリを再読み込みしてください。`
        : "このブラウザではオフライン用データを削除できません。");
    } catch {
      onMessage("オフライン用データを削除できませんでした。ブラウザのWebサイトデータ設定をご確認ください。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="settings-section settings-section--danger" aria-labelledby="reset-heading">
      <h3 id="reset-heading">リセットと削除</h3>
      <div className="reset-actions">
        <div className="reset-actions__individual" role="group" aria-label="個別にリセット">
          <button type="button" className="reset-action" onClick={() => setPendingAction("settings")}>
            <strong>設定を初期化</strong>
          </button>
          <button type="button" className="reset-action" onClick={() => setPendingAction("timer")}>
            <strong>タイマー状態を削除</strong>
          </button>
        </div>
        <div className="reset-actions__destructive" role="group" aria-labelledby="reset-data-heading">
          <h4 id="reset-data-heading">データを削除</h4>
          <button type="button" className="reset-action" onClick={() => setPendingAction("everything")} disabled={busy}>
            <strong>アプリ内データをすべて削除</strong>
          </button>
          <button type="button" className="reset-action" onClick={() => setPendingAction("pwa")} disabled={busy} aria-busy={busy}>
            <strong>{busy ? "削除しています…" : "オフライン用データを削除"}</strong>
          </button>
        </div>
        <button type="button" className="reset-actions__guide" onClick={() => setShowDeleteGuide((shown) => !shown)} aria-expanded={showDeleteGuide}>
          {showDeleteGuide ? "アプリの削除手順を隠す" : "アプリの削除手順を表示"}
        </button>
      </div>
      {showDeleteGuide && (
        <div className="delete-guide" role="note">
          <h4>iPadのホーム画面から削除する方法</h4>
          <ol>
            <li>ホーム画面でFocusBoardのアイコンを長押しします。</li>
            <li>「ブックマークを削除」または「Appを削除」を選びます。</li>
            <li>必要であれば、Safariの設定からWebサイトデータも削除します。</li>
          </ol>
          <p>アプリ内でデータをすべて削除すると、設定、タイマー、背景画像、タスク、プロジェクト、集中履歴が消えます。</p>
        </div>
      )}
      <ConfirmDialog
        open={pendingAction !== null}
        title={pendingAction === "settings" ? "設定を初期化しますか？" : pendingAction === "timer" ? "タイマー状態を削除しますか？" : pendingAction === "everything" ? "アプリ内データをすべて削除しますか？" : "オフライン用データを削除しますか？"}
        description={pendingAction === "settings"
          ? "表示やタイマーなどの設定を初期値に戻します。タスクと集中履歴は残ります。"
          : pendingAction === "timer"
            ? "進行中または一時停止中のタイマーを消します。タスクと集中履歴は残ります。"
            : pendingAction === "everything"
              ? "設定、タイマー、背景画像、タスク、プロジェクト、集中履歴を削除します。この操作は元に戻せません。"
              : "オフライン用の保存データを削除します。アプリの再読み込みが必要です。"}
        confirmLabel={pendingAction === "settings" ? "初期化する" : "削除する"}
        onCancel={() => setPendingAction(null)}
        onConfirm={() => {
          const action = pendingAction;
          setPendingAction(null);
          if (action === "settings") onResetSettings();
          if (action === "timer") onClearTimer();
          if (action === "everything") void clearEverything();
          if (action === "pwa") void clearPwa();
        }}
      />
    </section>
  );
}
