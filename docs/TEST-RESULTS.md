# TEST RESULTS — 買取業者ノート Ver.1.0 試作3

実行日：2026-08-08  
内部バージョン：`1.0.0-prototype.3`  
IndexedDB：version `2`  
JSON：schemaVersion `3`  
Service Worker：`kaitori-company-note-v1-prototype3`

## 対象

- 配置元：`C:\Users\tbska\Documents\Codex\2026-08-04\kaitori-company-note-ver-1-0-2`
- 配置先：`C:\Users\tbska\Documents\Codex\09_買取業者ノート\current\kaitori-company-local`
- 起動ファイル：`C:\Users\tbska\Documents\Codex\09_買取業者ノート\current\kaitori-company-local\index.html`
- 実行環境：Windows、Microsoft Edge Chromium headless、Playwright、ローカルNode HTTPサーバー、`file://`

## 総合結果

**合格**。静的・単体・移行・性能の141チェック、ブラウザの62チェック、配置SHA-256の2チェック、合計205チェックが合格しました。

- JavaScript構文エラー：0
- `pageerror`：0
- Console未処理エラー：0
- 外部CDN・外部API・外部フレームワーク：0
- 390×844px：合格
- 390×500px：合格
- 390×360px相当のキーボード表示時：合格
- 1440×900px：合格
- `file://`：合格
- HTTP：合格
- PWA：合格
- オフライン再起動：合格
- 配置元・配置先：48ファイル、相対パスとSHA-256が全件一致

## 原因調査と修正確認

### 「案件」が開かなかった原因

試作2の同一ソース内では、案件ボタンの `data-nav="cases"`、案件画面、ルーターの `cases` 名は一致していました。実利用時の主因はPWA更新時の資産混在です。旧Service Workerが制御する状態で、新しい `index.html` と、全キャッシュ横断の `caches.match()` が返す旧 `app.js`／`styles.css` が同じ画面へ混在し、4番目の画面と旧ルーター・旧3列CSSが一致しない状態になり得ました。

修正後は次を確認しました。

- CSS・JavaScript・manifest・主要アイコンへ `?v=prototype3` を付与
- 静的資産は現在の `CACHE_NAME` 内だけを検索
- `updateViaCache: "none"`
- `ROUTES` と `navigate()` の単一ルーター
- 下部ナビは1個のイベント委譲で `event.target.closest("button[data-route]")` を使用
- 画面、active、`aria-current`、見出し、FAB、再描画、履歴を同じ処理で同期
- アイコン、文字、余白を各1回タップ：すべて1回だけ遷移
- 10回連続切替、再読込、履歴戻る、PWAオフライン再起動：合格

### 業者登録ダイアログの原因

試作2は高さが実質 `100dvh` だけに依存し、iPhoneの動的ブラウザUIやキーボードで縮む `VisualViewport` を反映していませんでした。外枠の `overflow: hidden` と暗黙的な背景ロックにより、本文末尾や保存フッターが実表示領域外へ出る可能性がありました。また、初回Service Workerの `clients.claim()` による `controllerchange` が起動直後の登録画面を再読込で閉じる競合もありました。

修正後は次を確認しました。

- 固定ヘッダー／本文だけ縦スクロール／固定フッターの3領域
- `100vh` → `100svh` → `100dvh` のフォールバック
- VisualViewportの高さをCSS変数へ反映
- `body.has-dialog-open` の明示的ロック、スクロール位置保存・復元
- 初回Worker取得では再読込せず、既存PWA更新時だけ未保存入力を確認して1回再読込
- 保存後はDB書込みと一覧再描画が完了してからダイアログを閉じる
- 390×500、390×844、390×360相当で本文末尾・保存ボタン操作：合格
- 連続5回開閉後のbodyロック解除：合格
- 探す＋、業者＋、0件ボタン、複製、重複警告から戻る：合格

### 選択ボタンのずれ

試作2は選択時だけチェック記号と余白を追加していました。試作3は未選択時から疑似要素の領域を確保し、選択時は色、境界色、影、記号の不透明度だけを変更します。

- font-size、line-height、padding、margin、border-width、min-height、letter-spacing、font-weight：選択前後で一致
- 幅、高さ、隣接チップとの相対位置：一致
- エリア、買取対象、案件種別、個別要因、回答状況、回答理由、下部ナビ：合格

## データ互換・移行

### IndexedDB version 2維持

ストアは `companies`、`settings`、`cases`、`caseResponses` の4つで変更ありません。

実ブラウザのIndexedDB v2へ試作2形式の業者1件、案件1件、回答1件、設定を直接投入し、試作3を再読込して確認しました。

- companies件数、company ID、名称、担当者、電話、メール、エリア、お気に入り、メモ、作成日、更新日：維持
- cases件数・ID・内容：維持
- caseResponses件数・ID・caseId・companyId：維持
- settingsとsampleInitialized：維持
- `companyNameKana`：空文字で補完
- 一意変換できる旧対象「土地」：`land` へ移行
- 曖昧な「区分マンション」：`legacyPurchaseTargets` へ保持
- `companyDataModelVersion: 3`
- 2回目の再読込で件数・対象ID・旧対象に重複なし
- サンプル再追加なし
- アーカイブ状態・回答履歴を維持

旧 `temperature` と `propertyTypes` は移行時の元データ保護のため、既存の生レコードから強制削除しません。通常の読み込み、表示、検索、並び替え、おすすめ点数、新規保存、新規CSV、新規JSONでは使用しません。

## よみがな

- `companyNameKana` の手入力・ひらがな保存：合格
- カタカナからひらがな候補：合格
- `compositionstart`／`compositionupdate`／`compositionend` の読み候補：合格
- `beforeinput`／`input` の補助取得：合格
- 漢字を勝手に推測しない：合格
- 既存値・手動編集後を自動上書きしない：合格
- よみがな検索・よみがな優先の業者名順：合格
- JSON・業者CSV・案件回答CSV：合格

## エリア

- 12項目と内部ID：合格
- 千葉：選択・保存・検索合格
- 神奈川県全域：自身＋6地域を選択
- 関東：全国・その他以外を選択
- 全国：その他以外を選択
- 広域項目OFF：自身だけOFF、下位項目を維持
- すべて解除：合格
- 神奈川県全域業者→横浜案件：一致
- 関東業者→千葉案件：一致
- 全国業者→通常エリア案件：一致
- その他：自動包含なし

## 買取対象

- 案件種別10項目と個別要因17項目を同じ定義から生成：合格
- カテゴリ別表示と複数選択：合格
- 「全て」：案件種別のその他を除く9項目＋個別要因17項目＋自身を選択
- その他は「全て」で自動選択しない：合格
- 「全て」OFFで個別選択を維持：合格
- すべて解除：合格
- その他補足の保存、選択解除後の保持、検索、詳細表示：合格
- 業者カードの先頭数件＋残件数表示：合格
- おすすめ判定で案件種別一致と個別要因一致数を別加点・別表示：合格

## 温度感削除

登録、編集、詳細、カード、検索、絞り込み、並び替え、おすすめ点数、統計、サンプル、CSS、aria-label、業者CSV、新規JSONから削除済みです。

- schemaVersion 3の会社データに `temperature` なし
- 業者CSVに温度感列なし
- schemaVersion 1・2のtemperature付きJSON：復元合格
- 旧設定 `defaultSort: "temperature"`：業者名順へ安全に変換

## JSON・CSV

- schemaVersion 3保存：合格
- schemaVersion 1・2・3復元：合格
- 追加復元のID再採番と回答参照追従：合格
- 4ストアの置換復元：合格
- 不正ID、参照、重複、種別、要因、状況、金額、日付の拒否：合格
- 復元失敗時に既存データ維持：合格
- 業者CSV：12列、よみがな・その他補足あり、温度感なし
- 案件・回答CSV：24列、業者名の直後によみがな、回答0件案件も出力
- UTF-8 BOM、CRLF、引用符、Excel数式注入対策：合格

## 性能

想定データ（業者500社、案件1,000件、回答10,000件）を配置先で測定しました。

| 処理 | 実測 | 上限 |
|---|---:|---:|
| constants＋utils読込 | 72.86 ms | 2,000 ms |
| 500業者の正規化 | 40.76 ms | 2,000 ms |
| 1,000案件の正規化 | 34.24 ms | 2,000 ms |
| 10,000回答の正規化 | 371.95 ms | 5,000 ms |
| 1,000案件×50回の検索 | 1,499.69 ms | 3,500 ms |
| 1,000案件から25回の類似検索 | 1,110.94 ms | 7,000 ms |
| 代表250業者の履歴集計 | 599.46 ms | 5,000 ms |
| 500業者の日本語名sort | 6.62 ms | 2,000 ms |
| 案件1,000・回答10,000のCSV | 401.33 ms | 5,000 ms |

すべて設定上限内です。

## レスポンシブ・起動・PWA

- 390×844：下部4ナビ1段、均等幅、44px以上、横スクロールなし
- 390×500：下部4ナビ1段、ダイアログ最下部と保存操作、固定ヘッダー・フッター
- 390×360相当：キーボード表示時の入力・保存操作
- 1440×900：1段4ナビ、案件・検索・ダイアログ崩れなし
- `file://`：業者・案件・回答、検索、編集、JSON、CSV合格。Service Workerは登録しない
- HTTP：IndexedDB、全画面、登録、検索、編集合格
- PWA：manifest、Worker登録、現在キャッシュ限定、オフラインシェル合格
- オフライン再起動：案件を1回タップで1回だけ表示
- activate：旧 `kaitori-company-note-` 系を削除し、無関係なキャッシュを維持
- `tel:`／`mailto:`：リンク生成と未登録時非表示を確認

## QAファイル

既存QAを試作3へ更新し、次を追加しました。

- `qa-prototype3-navigation.cjs`
- `qa-prototype3-dialog-scroll.cjs`
- `qa-prototype3-company-kana.cjs`
- `qa-prototype3-area-selection.cjs`
- `qa-prototype3-purchase-targets.cjs`
- `qa-prototype3-temperature-removal.cjs`
- `qa-prototype3-data-compatibility.cjs`
- `qa-prototype3-browser.cjs`
- `qa-prototype3-deployment-hash.cjs`

必須85項目との対応は `docs/QA-MATRIX-PROTOTYPE3.md` に記録しています。

## 現在残る制限

- IMEのcomposition情報量はOS、ブラウザ、日本語入力方式に依存します。確定済み漢字からの読み推測はしません。
- 390pxの自動QAはChromiumのビューポート・タッチ環境で行っています。物理iPhone Safariのホーム画面追加、電話・メールアプリ遷移、キーボード固有差は端末設定にも依存します。
- `file://` ではブラウザ仕様によりService Worker、PWA、オフラインキャッシュを利用できません。
- ログイン、クラウド同期、複数端末同期、通知、CSV入力、詳細CRM機能はありません。
- 端末のサイトデータ削除でIndexedDBが消える可能性があるため、定期的なJSONバックアップが必要です。
