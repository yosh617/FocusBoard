# Study Clock

iPadのホーム画面に追加して、勉強中に表示しておける時計・ポモドーロPWAです。サーバーやアカウントは不要で、設定とタイマー状態は端末内だけに保存されます。

## 機能

- フェード式の背景スライドショーとグラデーションフォールバック
- 12/24時間、秒表示、サイズ、色、フォント、配置を変更できる時計
- `Intl.DateTimeFormat`を使った日本語の日付・曜日
- 作業、短い休憩、長い休憩に対応したポモドーロ
- `endAt`基準で、画面を閉じた後や再読み込み後もずれにくいタイマー
- iPadの縦向き・横向き、safe area、タッチ操作に対応した設定ドロワー
- オフライン起動、設定初期化、タイマー削除、ローカルデータ削除、PWAキャッシュ削除

## 開発環境の準備

Node.js 20以降とnpmをインストールしてください。WindowsではPowerShellまたはWindows Terminalで次を実行します。

```bash
npm install
npm run dev
```

Viteが表示したURLをブラウザで開きます。同一ネットワークのiPadから確認するときは`npm run dev -- --host`を使用してください。

## テストとビルド

```bash
npm test
npm run build
npm run preview
```

成果物は`dist`に生成されます。通常のビルドは相対パスを使用するため、サブディレクトリからも配信できます。明示的な公開パスを使う場合は、Windows PowerShellで次のように指定します。

```powershell
$env:VITE_BASE_PATH="/repository-name/"
npm run build
```

## GitHub Pagesへの公開

1. このプロジェクトをGitHubリポジトリの`main`ブランチへpushします。
2. GitHubの **Settings → Pages** を開きます。
3. **Build and deployment** のSourceを **GitHub Actions** に設定します。
4. `main`へのpush、またはActions画面の手動実行で`.github/workflows/deploy.yml`がテストとビルドを行い、`dist`を公開します。
5. `https://<user>.github.io/<repository-name>/`へアクセスします。

Actionsではリポジトリ名から`VITE_BASE_PATH`を設定するため、Project PagesでもアセットとService Workerが正しい範囲に配置されます。ユーザーサイト用の`<user>.github.io`リポジトリでは、必要に応じてworkflowの値を`/`へ変更してください。

## iPadのホーム画面に追加

1. 公開URLをiPadのSafariで開きます。
2. 共有ボタンを押し、**ホーム画面に追加**を選びます。
3. 名前を確認して**追加**を押します。
4. 以後はホーム画面のStudy Clockアイコンからstandalone表示で起動できます。

初回読み込み後は主要ファイルがService Workerへキャッシュされ、オフラインでも起動できます。新しい版の反映にはオンライン状態で一度起動してください。

## 保存と初期化

設定は`study-clock:settings`、タイマーは`study-clock:timer`としてlocalStorageへ保存します。設定データはversionを持ち、不正データや保存機能が利用できない場合も初期値で起動します。

右下の設定ボタンにある **リセット / 削除** から、次を個別に実行できます。

- 設定だけを初期化
- タイマー状態だけを削除
- このアプリのローカルデータをすべて削除
- このPWAのキャッシュとService Workerを削除

完全削除する場合は、先にローカルデータを削除し、iPadホーム画面のStudy Clockを長押しして **ブックマークを削除** または **Appを削除** を選びます。必要に応じてiPadの **設定 → Safari → 詳細 → Webサイトデータ** から公開サイトのデータも削除してください。Webアプリからホーム画面のアイコン自体を削除することはできません。

## 今後追加しやすい機能

設定、時計、タイマー、保存処理、PWA削除処理はコンポーネント・hooks・utilsへ分離しています。将来はタスク管理、学習時間の履歴、背景画像の追加UIなどを独立して追加できます。現在はログイン、クラウド同期、学習履歴、外部サービス連携を含みません。
