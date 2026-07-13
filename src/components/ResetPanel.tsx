import { useState } from "react";
import { clearAppIndexedDb, clearAppLocalData } from "../utils/storage";
import { clearPwaCachesAndWorkers } from "../utils/pwaCleanup";

type Props = {
  onResetSettings: () => void;
  onClearTimer: () => void;
  onMessage: (message: string) => void;
};

export function ResetPanel({ onResetSettings, onClearTimer, onMessage }: Props) {
  const [showDeleteGuide, setShowDeleteGuide] = useState(false);
  const [busy, setBusy] = useState(false);

  const clearEverything = async () => {
    if (!window.confirm("設定とタイマー状態をすべて削除します。この操作は元に戻せません。続けますか？")) return;
    setBusy(true);
    clearAppLocalData();
    await clearAppIndexedDb().catch(() => undefined);
    window.location.reload();
  };

  const clearPwa = async () => {
    if (!window.confirm("オフラインキャッシュと、このアプリのService Workerを削除しますか？")) return;
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
        <button type="button" className="danger-button" onClick={clearEverything} disabled={busy}>すべてのローカルデータを削除</button>
        <button type="button" className="danger-button" onClick={clearPwa} disabled={busy}>キャッシュとService Workerを削除</button>
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
          <p>アプリ内の「すべてのローカルデータを削除」では、保存済みの設定とタイマー状態を初期化できます。</p>
        </div>
      )}
    </section>
  );
}
