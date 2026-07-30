# FocusBoard タスクUI/UX監査

更新日: 2026-07-30
対象: タスク一覧、タスク詳細、集中レポート、データ管理  
評価環境: Headless Chrome、375×812 / 768×1024 / 1024×768

## 結論

変更前は、機能量に対して画面が細く、モード切替・リスト選択・プロジェクト選択が横並びの小さな操作へ集中していました。変更後は、タスク・レポート・データを第一階層のナビゲーションへ分離し、iPad横向きではサイドナビと作業領域、狭い画面では全幅の横ナビへ切り替わります。

これはユーザーテストではなく、同一データを使ったヒューリスティック評価と実ブラウザ描画の比較です。

## 変更前の主な問題

| 優先度 | 問題 | スクリーンショット上の根拠 | 影響 |
| --- | --- | --- | --- |
| 高 | 広い画面でもドロワーが約430px | 1024px画面の半分以上が背景のまま | 一覧、追加、詳細が狭い1列へ押し込まれる |
| 高 | 情報設計が平坦 | ヘッダー、スマートリスト、プロジェクトが連続する横ボタン列 | 現在地と主要操作が判別しにくい |
| 高 | 詳細が一覧末尾に表示 | 選択した行と編集フォームが離れる | タスクが増えるほど編集対象を見失う |
| 高 | レポート／データにもタスクナビが残る | 内容より先に2段のナビを表示 | 関係のない操作が画面を占有する |
| 中 | モバイルの操作密度が高い | ヘッダー操作と2本の横スクロール列が集中 | タッチ時の誤操作と探索負荷が増える |
| 中 | 視覚階層が弱い | 淡い青のカードと境界線がほぼ同じ強さ | 主操作、補助情報、選択状態の差が弱い |
| 中 | 空状態が説明不足 | 1行のテキストだけを表示 | 次に何をすべきか分かりにくい |

## 実施した改善

- タスク／レポート／データを、アイコン付きの第一階層ナビゲーションへ変更
- iPad横向き・PCでは、スマートリストとプロジェクトを常時確認できるサイドナビを採用
- 820px以下では、全幅ドロワーとタッチ向け横ナビへ切り替え
- レポート／データ画面ではタスク用ナビを非表示にし、内容を全幅表示
- タスク名、件数、検索、クイック追加の順に画面の情報階層を再構成
- 選択タスクの詳細を、そのタスク行の直下へ展開
- プロジェクト作成を「新規」から明示的に開く方式へ変更
- 空状態へ見出し、説明、SVGアイコンを追加
- 主要カード、選択状態、主ボタン、補助情報のコントラストと余白を整理
- 絵文字を使わず、同一の線画SVGで操作アイコンを統一
- 既存のフォーカス表示、キーボード操作、フォーカストラップ、reduced motion対応を維持

## スクリーンショット比較

| 画面 | 変更前 | 変更後 |
| --- | --- | --- |
| モバイル・タスク詳細 | [before-mobile-tasks.png](screenshots/ui-audit/before-mobile-tasks.png) | [after-mobile-tasks.png](screenshots/ui-audit/after-mobile-tasks.png) |
| iPad横向き・タスク詳細 | [before-tablet-tasks.png](screenshots/ui-audit/before-tablet-tasks.png) | [after-tablet-tasks.png](screenshots/ui-audit/after-tablet-tasks.png) |
| iPad縦向き・レポート | [before-tablet-report.png](screenshots/ui-audit/before-tablet-report.png) | [after-tablet-report.png](screenshots/ui-audit/after-tablet-report.png) |
| モバイル・データ管理 | [before-mobile-data.png](screenshots/ui-audit/before-mobile-data.png) | [after-mobile-data.png](screenshots/ui-audit/after-mobile-data.png) |

ヘッドレス環境には日本語フォントが入っていないため、画像内の日本語が四角形で表示される箇所があります。DOM上の日本語ラベル、レイアウト寸法、操作領域の評価には影響しません。

## 評価結果

5点満点。変更後の点数は、実装後のスクリーンショットとDOM計測に基づきます。

| 観点 | 変更前 | 変更後 | 評価 |
| --- | ---: | ---: | --- |
| 情報階層 | 2 | 4 | モード、リスト、作業内容を3階層に整理 |
| 現在地の分かりやすさ | 2 | 4 | 第一階層タブと選択リストを明確化 |
| タスク追加の効率 | 3 | 4 | 見出し直下に主入力を固定し、日付を補助入力化 |
| 一覧から詳細編集への流れ | 2 | 5 | 選択行の直下に詳細を展開 |
| レスポンシブ | 2 | 4 | 375pxで横スクロールなし、768px以下は全幅 |
| タッチ操作 | 3 | 4 | タスク画面内の操作領域を44px以上に統一 |
| 視覚的一貫性 | 2 | 4 | SVG、余白、境界線、選択状態を統一 |
| レポートの可読性 | 3 | 4 | 不要ナビを除去し、数値とカード階層を強調 |

## 実ブラウザ計測

375×812のタスク詳細表示時:

- viewport: 375px
- document: clientWidth 375px / scrollWidth 375px
- body: clientWidth 375px / scrollWidth 375px
- task drawer: clientWidth 374px / scrollWidth 374px
- task workspace: clientWidth 374px / scrollWidth 374px
- タスクドロワー内の表示中操作要素: 44px未満なし

## 残る改善候補

1. 実機iPadで、ソフトウェアキーボード表示時の追加・詳細フォームを確認する
2. 100件を超える一覧で、描画時間とスクロール位置維持を計測する
3. 検索を現在リスト内だけでなく全タスク対象にも切り替えられるようにする
4. 複数選択、期限・プロジェクトの一括変更を追加する
5. ユーザー操作テストで「追加」「今日へ整理」「詳細編集」「集中開始」の完了時間を比較する

## 2026-07-29 最終QA（Chromium viewport QA）

評価環境はローカル Vite（`http://127.0.0.1:5173/`）、Playwright Chromium、テストブラウザのローカルデータである。実機確認・ユーザーテストではない。ヘッドレス環境の日本語フォント制約により、画像内の日本語が四角形になる場合があるが、DOMラベル、寸法、ポインター操作の検証には影響しない。

### CP2の改善前後

375pxで空状態のヒーロー領域は約1263pxから723px、入力位置は約2082pxから1493pxへ短縮した。タスクあり状態のヒーロー領域は約1668pxから約1099pxへ短縮した。今回のChromium QAでは、保存後に対象タスクを明日へ移した状態でヒーローは861pxだった（内容・状態により高さは変動）。

### 4幅の結果

| viewport | document client/scroll | drawer client/scroll（表示寸法） | workspace client/scroll | toolbar | console error | 44px未満の可視操作 | 判定 |
| --- | --- | --- | --- | --- | ---: | --- | --- |
| 375×812 | 375 / 375 | 375 / 375（375×763） | 375 / 375 | static | 0 | 0件 | 合格 |
| 768×1024 | 768 / 768 | 768 / 768（768×920） | 768 / 768 | static | 0 | 0件 | 合格 |
| 1024×768 | 1024 / 1024 | 939 / 939（940×768） | 723 / 723 | static | 0 | 0件 | 合格 |
| 1440×900 | 1440 / 1440 | 939 / 939（940×900） | 723 / 723 | static | 0 | 0件 | 合格 |

4幅すべてでtoolbarは`static`だった。4幅すべてでdocument、drawer、workspaceの横方向scrollWidthはclientWidthと一致した。表示中buttonの44px未満は0件であり、console errorは最終時点で0件（warning 1件はあり）。

### ポインター操作フロー

375pxで通常のclick操作により、タスクランチャーから一覧・詳細を開いた。詳細上部の期限（明日）、通知（今日18:00）、集中目安（4セット）のクイック操作と`変更を保存`をクリックした。一覧の開始ボタンで「数学の復習」のタイマーを開始し、ドロワーが閉じて実行中のフローティングタイマーとランチャー要約を確認した。実行中ランチャーからタスク詳細を再表示し、`数学の復習の詳細からタイマーへ戻る`をクリックしてタイマー画面へ戻った。最終再QAでは詳細の通知「明日09:00」から`変更を保存`する通常clickも成功した。フローは成功した。

44px要件を含む本チェックポイントの受入条件は満たしたため、2026-07-29時点のChromium viewport QAの最終受入は可とする。実機iPad/Safari等の未実施事項は残る。ソースコードの修正は本QAでは行っていない。

### 最終QAスクリーンショット

| viewport | 画像 |
| --- | --- |
| 375×812 | [final-mobile-tasks.png](screenshots/ui-audit/final-mobile-tasks.png) |
| 768×1024 | [final-tablet-portrait-tasks.png](screenshots/ui-audit/final-tablet-portrait-tasks.png) |
| 1024×768 | [final-tablet-landscape-tasks.png](screenshots/ui-audit/final-tablet-landscape-tasks.png) |
| 1440×900 | [final-desktop-tasks.png](screenshots/ui-audit/final-desktop-tasks.png) |

## 2026-07-30 統合UI・アクセシビリティ仕上げ

ホームのタスク起点と設定起点は、共通のホームドックにアイコンと文字を併記して配置した。「背景タップ時のみ」を選んだ場合は、タスク詳細カードを背景タップ後だけ一時表示し、カードを開いている間もドックを残すため、現在地の把握と次の操作を両立する。タスクカードの「表示」設定は、「常に表示」と「背景タップ時のみ」を説明文付きで選択でき、選択状態を色だけで伝えない。

今回の監査では、ホームドック、ランチャー、タスク／設定パネル、タスク行と主要アクションを対象に、表示中の操作領域を44×44px以上、キーボードの`focus-visible`、本文の4.5:1を目安とするコントラスト、アイコン単独にしないラベルを確認した。`prefers-reduced-motion`では遷移を止め、`prefers-reduced-transparency`では背景上のドック／カード／パネルを不透明寄りにし、`prefers-contrast: more`では境界線・選択状態・フォーカスリングを強める。通常表示のレイアウトとタイマー／タスク／保存仕様は変更していない。

判断はAppleの[Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)、[Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons)、[Modality](https://developer.apple.com/design/human-interface-guidelines/modality)、[Design principles](https://developer.apple.com/design/human-interface-guidelines/design-principles)を参照した。ここでは公式ガイドの長文を転載せず、十分な操作領域、明確なラベル、操作後も戻り先を失わないパネル切替、ユーザー設定の尊重として実装へ対応付けている。

既存スクリーンショットQAの記録は375×812、768×1024、1024×768、1440×900である。今回のアクセシビリティ仕上げでは390×844も確認対象に加え、モバイルからデスクトップまで横スクロールを増やさず、ドック・カード・パネルの操作領域を維持する方針とした。
