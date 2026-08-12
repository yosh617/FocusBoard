import { useMemo, useState, type ChangeEvent } from "react";
import type { FocusSessionRecord } from "../../types/focusSession";
import type { ProjectRecord } from "../../types/project";
import type { TaskRecord } from "../../types/task";
import { createProductivityBackup, parseProductivityBackup, stringifyProductivityBackup, type ProductivityBackup } from "../../utils/productivityBackup";
import { analyzeProductivityImport, applyProductivityImportPlan, getProductivityImportCounts, isValidProductivityDataSet, type ConflictPreference, type ImportStrategy } from "../../utils/productivityImport";
import { toLocalDateKey } from "../../utils/taskQueries";

const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

export function ProductivityBackupPanel({ tasks, projects, sessions, storageAvailable, onImport }: {
  tasks: TaskRecord[];
  projects: ProjectRecord[];
  sessions: FocusSessionRecord[];
  storageAvailable: boolean;
  onImport: (backup: ProductivityBackup, strategy: ImportStrategy, conflictPreference: ConflictPreference) => Promise<boolean>;
}) {
  const [preview, setPreview] = useState<ProductivityBackup | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [strategy, setStrategy] = useState<ImportStrategy>("smart-merge");
  const [conflictPreference, setConflictPreference] = useState<ConflictPreference>("current");
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const importPlan = useMemo(() => preview ? analyzeProductivityImport({ tasks, projects, sessions }, preview, strategy) : null, [preview, projects, sessions, strategy, tasks]);
  const importCounts = useMemo(() => importPlan ? getProductivityImportCounts(importPlan) : null, [importPlan]);
  const mergedDataIsValid = useMemo(() => importPlan
    ? isValidProductivityDataSet(applyProductivityImportPlan({ tasks, projects, sessions }, importPlan, conflictPreference))
    : true, [conflictPreference, importPlan, projects, sessions, tasks]);
  const conflicts = useMemo(() => importPlan ? [
    ...importPlan.tasks.conflicts.map((conflict) => ({ id: `task:${conflict.id}`, type: "タスク", current: conflict.current.title, incoming: conflict.incoming.title })),
    ...importPlan.projects.conflicts.map((conflict) => ({ id: `project:${conflict.id}`, type: "プロジェクト", current: conflict.current.name, incoming: conflict.incoming.name })),
    ...importPlan.sessions.conflicts.map((conflict) => ({ id: `session:${conflict.id}`, type: "集中履歴", current: conflict.current.taskTitleSnapshot ?? "タスクなし", incoming: conflict.incoming.taskTitleSnapshot ?? "タスクなし" }))
  ] : [], [importPlan]);

  const exportBackup = () => {
    const backup = createProductivityBackup(tasks, projects, sessions);
    const url = URL.createObjectURL(new Blob([stringifyProductivityBackup(backup)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `focusboard-backup-${toLocalDateKey(new Date())}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    setMessage("バックアップを書き出しました。端末のファイルに保存してください。");
  };

  const selectFile = async (event: ChangeEvent<HTMLInputElement>) => {
    setPreview(null);
    setMessage("");
    setStrategy("smart-merge");
    setConflictPreference("current");
    setReplaceConfirmed(false);
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
    if (!preview || !mergedDataIsValid || strategy === "replace" && !replaceConfirmed) return;
    setBusy(true);
    const restored = await onImport(preview, strategy, conflictPreference).catch(() => false);
    setBusy(false);
    if (restored) {
      setMessage(strategy === "replace" ? "完全置換が完了しました。" : strategy === "add-only" ? "新しいデータだけを追加しました。" : "スマートマージが完了しました。");
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
        <p>ファイルを検証し、変更内容と競合を表示してから反映します。</p>
        <label className={`secondary-button backup-file${!storageAvailable || busy ? " is-disabled" : ""}`} htmlFor="productivity-backup-file">JSONを選択</label>
        <input className="visually-hidden" id="productivity-backup-file" type="file" accept="application/json,.json" disabled={!storageAvailable || busy} onChange={(event) => void selectFile(event)} />
        {preview && importPlan && importCounts && <div className="backup-preview" role="region" aria-labelledby="backup-preview-title">
          <strong id="backup-preview-title">復元前の確認</strong>
          <p>ファイル内容: タスク {preview.tasks.length}件・プロジェクト {preview.projects.length}件・履歴 {preview.sessions.length}件</p>
          <fieldset className="backup-strategies"><legend>反映方法</legend>
            <label><input type="radio" name="import-strategy" value="smart-merge" checked={strategy === "smart-merge"} onChange={() => { setStrategy("smart-merge"); setReplaceConfirmed(false); }} /><span><strong>スマートマージ（推奨）</strong><small>新しい更新を採用し、古い内容は残します。</small></span></label>
            <label><input type="radio" name="import-strategy" value="add-only" checked={strategy === "add-only"} onChange={() => { setStrategy("add-only"); setReplaceConfirmed(false); }} /><span><strong>追加のみ</strong><small>既存IDを変更せず、新しいIDだけ追加します。</small></span></label>
            <label><input type="radio" name="import-strategy" value="replace" checked={strategy === "replace"} onChange={() => setStrategy("replace")} /><span><strong>完全置換</strong><small>端末データを消し、ファイルと同じ状態にします。</small></span></label>
          </fieldset>
          <div className="backup-diff" aria-label="変更予定件数">
            <span><strong>{importCounts.inserts}</strong>追加</span>
            <span><strong>{importCounts.updates}</strong>更新</span>
            <span><strong>{importCounts.unchanged}</strong>同一</span>
            <span><strong>{importCounts.keptCurrent}</strong>端末を維持</span>
            <span><strong>{importCounts.conflicts}</strong>競合</span>
            <span><strong>{importCounts.deletions}</strong>削除</span>
          </div>
          {conflicts.length > 0 && <div className="backup-conflicts">
            <fieldset><legend>競合時の扱い</legend><label><input type="radio" name="conflict-preference" checked={conflictPreference === "current"} onChange={() => setConflictPreference("current")} />端末を残す（推奨）</label><label><input type="radio" name="conflict-preference" checked={conflictPreference === "incoming"} onChange={() => setConflictPreference("incoming")} />ファイルを採用</label></fieldset>
            <ul>{conflicts.slice(0, 10).map((conflict) => <li key={conflict.id}><strong>{conflict.type}</strong><span>端末: {conflict.current}</span><span>ファイル: {conflict.incoming}</span></li>)}</ul>
            {conflicts.length > 10 && <p>ほか {conflicts.length - 10}件の競合があります。</p>}
          </div>}
          {strategy === "replace" && <label className="backup-replace-confirm"><input type="checkbox" checked={replaceConfirmed} onChange={(event) => setReplaceConfirmed(event.target.checked)} /><span>端末にだけあるデータ{importCounts.deletions}件が削除されることを確認しました。</span></label>}
          {!mergedDataIsValid && <p className="backup-message" role="alert">この反映方法では親子関係またはプロジェクト参照が不正になるため実行できません。競合の扱いか反映方法を変更してください。</p>}
          <button className="primary-button" type="button" disabled={busy || !mergedDataIsValid || strategy === "replace" && !replaceConfirmed} onClick={() => void restore()}>{busy ? "反映中" : strategy === "replace" ? "完全置換を実行" : strategy === "add-only" ? "新しいデータを追加" : "スマートマージを実行"}</button>
        </div>}
      </section>
      {message && <p className="backup-message" role="status">{message}</p>}
    </div>
  );
}
