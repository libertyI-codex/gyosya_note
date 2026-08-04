# 買取業者ノート テスト結果

- 対象：Kaitori Company Note — Ver.1.0 試作1
- 実施日：2026-08-04
- ブラウザ：Microsoft Edge 150.0.4078.83（Chromium／ヘッドレス自動操作）
- 静的検査：9件 PASS
- 単体検査：17件 PASS
- ブラウザ統合検査：28件 PASS
- JavaScript構文エラー：0件
- Console未処理エラー：0件

## 必須49項目

| No. | 確認項目 | 結果 | 確認内容 |
|---:|---|:---:|---|
| 1 | 業者名だけで保存 | PASS | UIから保存しIndexedDBを直接確認 |
| 2 | 全項目を入力して保存 | PASS | 基本・条件・お気に入り・メモを確認 |
| 3 | エリア複数選択 | PASS | 横浜・川崎を同時保存 |
| 4 | 買取対象複数選択 | PASS | 土地・戸建を同時保存 |
| 5 | 温度感を選択 | PASS | 積極的を保存 |
| 6 | お気に入りを登録 | PASS | 保存値とカード星を確認 |
| 7 | 編集 | PASS | 担当者名を更新し再読込 |
| 8 | 複製 | PASS | 新ID・複製名・重複続行を確認 |
| 9 | 削除 | PASS | IndexedDBと画面から消えることを確認 |
| 10 | 削除確認 | PASS | 業者名入り確認文を捕捉 |
| 11 | エリアだけで検索 | PASS | 横浜のみで検索 |
| 12 | 買取対象だけで検索 | PASS | 土地のみで検索 |
| 13 | エリア＋対象 | PASS | 分類間ANDを確認 |
| 14 | 業者名検索 | PASS | 業者名の部分一致 |
| 15 | 担当者名検索 | PASS | 空白を含む担当者名を検索 |
| 16 | メモ検索 | PASS | メモの語句を検索 |
| 17 | 電話番号検索 | PASS | ハイフンなし数字列で検索 |
| 18 | お気に入りのみ | PASS | 星付きだけを表示 |
| 19 | 積極的のみ | PASS | 温度感で絞り込み |
| 20 | 条件解除 | PASS | 選択・文字・切替をすべて初期化 |
| 21 | `tel:`リンク | PASS | 表示電話を安全に数字化したURIを確認 |
| 22 | `mailto:`リンク | PASS | 宛先と件名URIを確認 |
| 23 | 連絡先未登録時 | PASS | 電話・メールリンクが存在しないことを確認 |
| 24 | 漢字の業者名順 | PASS | `Intl.Collator("ja-JP")`相当順を確認 |
| 25 | お気に入り順 | PASS | 星付きが先頭 |
| 26 | 温度感順 | PASS | 積極的→通常→現在休止 |
| 27 | 更新日順 | PASS | ISO日時の降順（登録日順も追加確認） |
| 28 | JSON保存 | PASS | 実ダウンロードを解析し形式を確認 |
| 29 | JSON追加復元 | PASS | 既存を残して新IDを追加 |
| 30 | JSON置換復元 | PASS | 確認後にcompanies・settingsを置換 |
| 31 | 不正JSON拒否 | PASS | format不正、型不正、重複ID等を拒否 |
| 32 | 復元失敗時の既存保持 | PASS | 復元前後のデータ文字列が完全一致 |
| 33 | CSV出力 | PASS | 実ダウンロードを取得 |
| 34 | Excel向けCSV | PASS | UTF-8 BOM、11列、CRLF、引用符を確認 |
| 35 | 同じ業者名の警告 | PASS | NFKC・空白正規化一致を確認 |
| 36 | 同じ電話番号の警告 | PASS | 記号を除去した一致を確認 |
| 37 | 警告後の続行 | PASS | 「このまま登録」で保存 |
| 38 | 390px操作 | PASS | タップ領域、長い業者名、操作フローを確認 |
| 39 | 390×500ダイアログ | PASS | 本文スクロール、固定見出し、最下部保存を確認 |
| 40 | 1440px表示 | PASS | 2列検索レイアウトとカードを確認 |
| 41 | body横スクロール | PASS | 390／390×500／1440で幅超過0 |
| 42 | 下部ナビとの重なり | PASS | 保存ボタンの中央ヒットテストと余白を確認 |
| 43 | `file://`起動 | PASS | 登録→再読込永続化→検索→編集→JSON/CSV |
| 44 | HTTP起動 | PASS | ローカルサーバーのサブパスで全機能確認 |
| 45 | PWA起動 | PASS | manifest、SW ready/active、controllerを確認 |
| 46 | オフライン再起動 | PASS | 通信遮断後に再読込しCSS・IndexedDBを確認 |
| 47 | 旧キャッシュ削除 | PASS | 自アプリ旧版だけ削除、無関係cacheを保持 |
| 48 | JavaScript構文 | PASS | 全JSとsw.jsを`node --check` |
| 49 | Console未処理エラー | PASS | pageerror、console.error、requestfailed 0件 |

## 追加確認

- 初期サンプルは初回3社、再読込後も3社で重複なし
- 検索チップとお気に入り切替後のキーボードフォーカスを維持
- 重複候補の既存詳細を確認しても、新規フォームの下書きを保持
- 全ボタンに実行時の`aria-label`あり
- 不正な電話・メールは警告後に利用者が保存続行可能
- 正規化後に衝突するJSON IDを復元前に拒否
- `mailto:`アドレス部をパーセントエンコードし、ヘッダー注入を防止
- Service Workerは同一オリジンのGETだけを扱い、`tel:`・`mailto:`をキャッシュしない
- `kaitori-company-note-v0-test`は削除し、`unrelated-app-cache`は保持
- PNGは180／192／512／maskable 512、8bit不透明形式
- 外部HTTP/HTTPS参照0件

## 証跡

- `tests/artifacts/browser-results.json`
- `tests/artifacts/390x844-search.png`
- `tests/artifacts/390x500-dialog.png`
- `tests/artifacts/1440-search.png`
- `tests/qa-static.cjs`
- `tests/qa-unit.cjs`
- `tests/qa-browser.cjs`

## 自動検査の境界

次はアプリ側の契約まで確認済みですが、実機側の操作は環境依存です。

- 電話・メール：正しい`tel:`／`mailto:` URIまで確認。OSアプリの実起動は未実施。
- iPhone：390px表示、safe-area CSS、manifest、Service Worker、オフラインまで確認。実機Safariのホーム画面追加は未実施。
- Excel：UTF-8 BOMとCSV構造まで確認。実Excelアプリでの目視は未実施。
