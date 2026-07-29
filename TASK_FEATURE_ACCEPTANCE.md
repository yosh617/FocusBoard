# FocusBoard タスク機能 受入証跡

更新日: 2026-07-29
対象: `TASK_FEATURE_PLAN.md` の5目標と既存FocusBoard機能の維持
ブラウザ証跡: Playwright Chromium viewport QA。実機確認ではない。

## 受入概要

タスクの保存、一覧、詳細、タイマー連携、期限・繰り返し、レポート、バックアップの実装と自動テストは追跡可能である。2026-07-29の4幅Chromium QAでは横溢れなし、表示中buttonの44×44px以上、console error 0、指定のタスク詳細・タイマー復帰フロー成功を確認した。Chromium viewport QAの最終受入は可とする。viewport計測は`UI_UX_AUDIT.md`の「2026-07-29 最終QA」を参照する。

## 元計画の5目標

| 目標 | 実装の主な根拠 | 自動テストの根拠 | Chromium viewport QA |
| --- | --- | --- | --- |
| 1. 今日取り組むタスクを選べる | `src/components/tasks/TaskLauncher.tsx`、`src/components/tasks/TaskDrawer.tsx`、`src/utils/taskQueries.ts` | `TaskLauncher.test.tsx` のおすすめ表示、`TaskDrawer.test.tsx` の日次サマリー・スマートリスト・フォーカス候補、`taskQueries.test.ts` | ランチャーから一覧/詳細を開き、対象タスクを選択。 |
| 2. タスクからポモドーロ/タイマーを開始できる | `src/App.tsx`、`src/components/tasks/TaskDrawer.tsx`、`src/hooks/usePomodoroTimer.ts` | `TaskDrawer.test.tsx` の行/詳細から開始、`App.test.tsx` の実行中タスク再表示、`usePomodoroTimer.test.tsx` の開始/終了 | 一覧の開始clickで実行中フローティングタイマーへ遷移し、実行中詳細から復帰。 |
| 3. 集中時間・完了ポモドーロをタスクへ記録できる | `src/hooks/useTasks.ts`、`src/utils/productivityStorage.ts`、`src/types/timer.ts` | `useTasks.test.tsx` の冪等なタスクセッション記録、`usePomodoroTimer.test.tsx` の完了/中断イベント、`App.test.tsx` の完了ダイアログ | このQAでは25分完了まで待機せず、開始・関連付け・復帰のみ確認。 |
| 4. 期限、繰り返し、サブタスク、メモを端末内で管理できる | `src/components/tasks/TaskDrawer.tsx`、`src/utils/repeatRule.ts`、`src/utils/taskValidation.ts`、`src/hooks/useTaskReminders.ts` | `TaskDrawer.test.tsx` の期限/通知/見積/繰り返し/サブタスク、`repeatRule.test.ts`、`taskValidation.test.ts`、`useTaskReminders.test.tsx` | 期限・通知・見積の上部クイック操作と`変更を保存`を通常clickで確認。 |
| 5. 日・週・月、タスク/プロジェクト別の実績を確認できる | `src/components/tasks/ProductivityReport.tsx`、`src/utils/productivityReport.ts` | `ProductivityReport.test.tsx`、`productivityReport.test.ts` の日/週/月・タスク/プロジェクト集計 | 本QAはタスク画面を代表撮影。レポート実ブラウザ回帰は対象外。 |

## 既存UIと保存基盤を維持する証跡

| 領域 | 実装ファイル | 自動テスト/根拠 |
| --- | --- | --- |
| UIシェル、設定、背景編集、時計、フローティングタイマー | `src/App.tsx`、`SettingsPanel.tsx`、`BackgroundSlideshow.tsx`、`ClockWidget.tsx`、`FloatingTimer.tsx` | `App.test.tsx`の設定、背景編集、時計、フローティングタイマー最小化・位置復元、タスクワークスペース起動。`BackgroundSlideshow.test.tsx`。 |
| settings migration/validation | `src/utils/storage.ts`、`src/utils/settingsExport.ts` | `storage.test.ts`の破損JSON、旧設定migration、背景/時計位置・色、localStorage障害。`settingsExport.test.ts`。 |
| task-aware timer storage migration/validation | `src/utils/storage.ts`、`src/types/timer.ts` | `storage.test.ts`のrunning state修復、旧count-up、TimerStateのtask-aware field復元/不正値除外。 |
| productivity storage validation/migration/transaction | `src/utils/productivityStorage.ts`、`src/utils/productivityImport.ts`、`src/utils/productivityBackup.ts` | `productivityStorage.test.ts`のstore/index、abort時の原子性、無効レコード除外、参照/循環修復、完全置換transaction。`productivityImport.test.ts`、`productivityBackup.test.ts`、`ProductivityBackupPanel.test.tsx`。 |

## 範囲と未実施事項

- 対象外はアカウント、クラウド/複数端末同期、共同編集、外部カレンダー/タスク連携、ブロック機能等であり、`TASK_FEATURE_PLAN.md`「対象外」に従う。
- 実機iPad/Safari、VoiceOver、PWA再開、500件以上の実データ性能、タイムゾーンを切り替えた実行環境試験は、このChromium viewport QAでは確認していない。
- 実機未実施事項は残るが、4幅Chromium viewportでの横溢れ、表示中buttonの44×44px、console error、タスク詳細・タイマー復帰は合格した。スクリーンショットは`UI_UX_AUDIT.md`にリンクした4枚を参照する。

## 最終検証コマンド

本チェックポイントはソース変更なしのため、自動テストの再実行は不要とした。最終統合時には次を実行する。

    npm test
    npm run build
    git diff --check
    file screenshots/ui-audit/final-*.png

加えて、375×812、768×1024、1024×768、1440×900のChromium viewportで、横溢れ、44×44px、toolbarの通常フローと詳細操作の非遮蔽、console error、タスク開始から実行中詳細・タイマー復帰を再確認する。
