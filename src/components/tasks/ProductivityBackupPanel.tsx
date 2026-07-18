import { useState, type ChangeEvent } from "react";
import type { FocusSessionRecord } from "../../types/focusSession";
import type { ProjectRecord } from "../../types/project";
import type { TaskRecord } from "../../types/task";
import { createProductivityBackup, parseProductivityBackup, stringifyProductivityBackup, type ProductivityBackup } from "../../utils/productivityBackup";
import { toLocalDateKey } from "../../utils/taskQueries";

const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

export function ProductivityBackupPanel({ tasks, projects, sessions, storageAvailable, onImport }: {
  tasks: TaskRecord[];
  projects: ProjectRecord[];
  sessions: FocusSessionRecord[];
  storageAvailable: boolean;
  onImport: (backup: ProductivityBackup) => Promise<boolean>;
}) {
  const [preview, setPreview] = useState<ProductivityBackup | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const exportBackup = () => {
    const backup = createProductivityBackup(tasks, projects, sessions);
    const url = URL.createObjectURL(new Blob([stringifyProductivityBackup(backup)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `focusboard-backup-${toLocalDateKey(new Date())}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage("バックアップを書き出しました。端末のファイルに保存してください。");
  };

  const selectFile = async (event: ChangeEvent<HTMLInputElement>) => {
    setPreview(null);
    setMessage("");
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) {
      setMessage("バックアップは20MB以下のJSONファイルを選んでください。");
      return;
    }
    try {
      const parsed = parseProductivityBackup(JSON.parse(await file.text()));
      if (!parsed) {
        setMessage("FocusBoardの有効なバックアップではありません。データは変更していません。");
        return;
      }
      setPreview(parsed);
    } catch {
      setMessage("JSONファイルを読み込めませんでした。データは変更していません。");
    }
  };

  const restore = async () => {
    if (!preview || !window.confirm("表示中の件数を復元します。同じIDのデータはバックアップの内容で上書きされます。続けますか？")) return;
    setBusy(true);
    const restored = await onImport(preview);
    setBusy(false);
    if (restored) {
      setMessage("復元が完了しました。同じIDは上書きし、端末だけにあるデータは残しています。");
      setPreview(null);
    } else {
      setMessage("バックアップを復元できませんでした。端末の保存設定を確認してください。");
    }
  };

  return (
    <div className="productivity-backup">
      <div><p className="eyebrow">LOCAL BACKUP</p><h3>バックアップと復元</h3></div>
      <div className="backup-callout"><strong>データは外部へ送信されません</strong><span>タスク、プロジェクト、集中履歴を1つのJSONファイルとして端末内で処理します。背景画像と表示設定は含みません。</span></div>
      <section aria-labelledby="backup-export-title">
        <h4 id="backup-export-title">書き出し</h4>
        <p>タスク {tasks.length}件・プロジェクト {projects.length}件・履歴 {sessions.length}件</p>
        <button className="primary-button" type="button" onClick={exportBackup}>JSONを書き出す</button>
      </section>
      <section aria-labelledby="backup-restore-title">
        <h4 id="backup-restore-title">復元</h4>
        <p>ファイルを検証して件数を表示してから復元します。同じIDは上書きし、この端末だけにあるデータは残します。</p>
        <label className={`secondary-button backup-file${!storageAvailable || busy ? " is-disabled" : ""}`} htmlFor="productivity-backup-file">JSONを選択</label>
        <input className="visually-hidden" id="productivity-backup-file" type="file" accept="application/json,.json" disabled={!storageAvailable || busy} onChange={(event) => void selectFile(event)} />
        {preview && <div className="backup-preview" role="status"><strong>復元前の確認</strong><span>タスク {preview.tasks.length}件</span><span>プロジェクト {preview.projects.length}件</span><span>履歴 {preview.sessions.length}件</span><button className="primary-button" type="button" disabled={busy} onClick={() => void restore()}>{busy ? "復元中" : "この内容を復元"}</button></div>}
      </section>
      {message && <p className="backup-message" role="status">{message}</p>}
    </div>
  );
}
