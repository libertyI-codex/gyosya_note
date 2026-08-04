# TEST RESULTS — 買取業者ノート Ver.1.0 試作2

- 実施日：2026-08-04（Asia/Tokyo）
- 内部版：`1.0.0-prototype.2`
- IndexedDB：version 2
- Service Worker：`kaitori-company-note-v1-prototype2`
- ブラウザ：Microsoft Edge / Chromium（headless Playwright）
- 必須62項目の対応表：`docs/QA-MATRIX-PROTOTYPE2.md`

## 総合結果

全自動スイート合格。JavaScript構文エラー、ブラウザの未処理例外、`console.error`、意図しない外部通信は検出されませんでした。

| スイート | 結果 |
|---|---:|
| `qa-static.cjs` | 9 / 9 PASS |
| `qa-unit.cjs` | 17 / 17 PASS |
| `qa-cases-static.cjs` | 16 / 16 PASS |
| `qa-cases-unit.cjs` | 18 / 18 PASS |
| `qa-backup-v2.cjs` | 11 / 11 PASS |
| `qa-db-migration-v2.cjs` | 2 / 2 PASS |
| `qa-case-performance.cjs` | 全ガードレールPASS |
| `qa-browser.cjs` | 28 / 28 PASS |
| `qa-cases-browser.cjs` | 16 / 16 PASS |

## IndexedDB v1→v2移行

- v1の `companies` と `settings` を用意してv2へ実ブラウザupgrade：PASS
- upgrade前後のraw `companies` / `settings` を `deepEqual`：PASS
- 既存会社ID、名称、担当者、電話、メール、エリア、対象、温度感、お気に入り、メモ、作成日、更新日：一致
- サンプル再追加なし：PASS
- `cases` / `caseResponses` と必須インデックス作成：PASS
- `[caseId, companyId]` 複合ユニークインデックス：PASS

## 案件・回答

- 案件名だけ／全項目の保存、単一案件種別、複数個別要因、編集、複製、削除：PASS
- 案件削除時の回答連鎖削除：PASS
- 案件フリーワード、案件種別、個別要因、回答待ち絞り込み：PASS
- 1社／複数社追加、追加済み業者除外、重複防止：PASS
- 回答状況、金額、理由、関連要因、回答日、次回確認日、メモ：PASS
- 回答状況順、金額降順、未入力末尾：PASS
- 業者詳細の回答件数・案件種別・個別要因集計、案件リンク：PASS
- 回答履歴がある業者のアーカイブ、過去回答表示、復元：PASS
- 類似案件の種別→共通要因数→エリア→更新日、自分除外：PASS

## JSON・CSV

- schemaVersion 2 JSON保存：PASS
- schemaVersion 1後方互換：PASS
- v2追加／置換復元：PASS
- ID衝突時の再採番と回答参照更新：PASS
- 不正caseId／companyId、重複ペア、不正種別・要因・状況・金額・日付拒否：PASS
- 復元失敗時の既存データ維持：PASS
- 業者一覧CSV：PASS
- 案件・回答23列CSV、1回答1行、回答0件案件：PASS
- UTF-8 BOM、CRLF、引用符、数式注入対策：PASS

## 性能

fixtureは指定どおり500業者、1,000案件、10,000回答です。Node同梱ランタイムでの代表計測：

| 処理 | 結果 | ガードレール |
|---|---:|---:|
| 500業者正規化 | 40.30ms | 2,000ms |
| 1,000案件正規化 | 32.77ms | 2,000ms |
| 10,000回答正規化 | 423.02ms | 5,000ms |
| 案件検索50回 | 1,485.32ms | 3,500ms |
| 類似検索25回 | 1,600.80ms | 7,000ms |
| 250業者の履歴集計 | 662.35ms | 5,000ms |
| 案件・回答CSV | 349.57ms | 5,000ms |

## 表示・起動・PWA

- 390×844：既存業者画面／案件画面とも操作、44px、横スクロールなし：PASS
- 390×500：業者／案件ダイアログ最下部、固定見出し、保存ボタン：PASS
- 1440×900：業者／案件表示、横スクロールなし：PASS
- `file://`：業者CRUD、案件・回答保存／再読込、JSON／CSV、Service Worker無効：PASS
- HTTP：IndexedDB、全UI、Console監視：PASS
- PWA：manifest、Service Worker制御：PASS
- オフライン再起動：業者・案件・回答保持：PASS
- 旧 `kaitori-company-note-` キャッシュ削除、無関係キャッシュ保持：PASS

証跡画像は `tests/artifacts/` に保存しています。

## 実環境に残る確認制限

- レスポンシブ検証はEdge/Chromiumで、iPhone Safari実機では未確認です。
- iPhoneのホーム画面への実追加、ソフトキーボード表示中の操作は未確認です。
- `tel:` / `mailto:` は安全なリンク生成までで、OSの電話・メールアプリ実起動は未確認です。
- CSV形式は検証済みですが、Microsoft Excel実アプリでの目視は未確認です。
- GitHub Pages向け相対パスとPWA構成は検証済みですが、実公開はしていません。
- 性能値はPC上のNode計測で、iPhone実機の応答時間保証ではありません。
