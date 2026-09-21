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
  const [pendingAction, setPendingAction] = useState<"everything" | "pwa" | null>(null);

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
        ? `キャッシュ${result.cachesDeleted}件、Service Worker${result.registrationsDeleted}件を削除しました。アプリを再読み込みしてください。`
        : "このブラウザはキャッシュまたはService Workerの削除に対応していません。");
    } catch {
      onMessage("キャッシュの削除中にエラーが発生しました。SafariのWebサイトデータ設定をご確認ください。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="settings-section settings-section--danger" aria-labelledby="reset-heading">
      <h3 id="reset-heading">リセット / 削除</h3>
      <p className="settings-help">必要なデータだけを個別に初期化できます。</p>
      <div className="reset-actions">
        <button type="button" className="secondary-button" onClick={onResetSettings}>設定を初期化</button>
        <button type="button" className="secondary-button" onClick={onClearTimer}>タイマー状態を削除</button>
        <button type="button" className="danger-button" onClick={() => setPendingAction("everything")} disabled={busy}>すべてのローカルデータを削除</button>
        <button type="button" className="danger-button" onClick={() => setPendingAction("pwa")} disabled={busy}>キャッシュとService Workerを削除</button>
        <button type="button" className="secondary-button" onClick={() => setShowDeleteGuide((shown) => !shown)} aria-expanded={showDeleteGuide}>
          PWA削除方法を表示
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
          <p>アプリ内の「すべてのローカルデータを削除」では、設定、タイマー、背景画像、タスク、プロジェクト、集中履歴を削除できます。</p>
        </div>
      )}
      <ConfirmDialog
        open={pendingAction !== null}
        title={pendingAction === "everything" ? "ローカルデータをすべて削除しますか？" : "キャッシュとService Workerを削除しますか？"}
        description={pendingAction === "everything"
          ? "設定、タイマー、背景画像、タスク、プロジェクト、集中履歴を削除します。この操作は元に戻せません。"
          : "オフラインキャッシュと、このアプリのService Workerを削除します。アプリの再読み込みが必要です。"}
        confirmLabel="削除する"
        onCancel={() => setPendingAction(null)}
        onConfirm={() => {
          const action = pendingAction;
          setPendingAction(null);
          if (action === "everything") void clearEverything();
          if (action === "pwa") void clearPwa();
        }}
      />
    </section>
  );
}
