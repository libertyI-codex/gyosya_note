# 実装概要 — Ver.1.0 試作2

## アプリ構成

- `index.html` — 探す／案件／業者／その他と各モーダル
- `css/styles.css` — 390px優先、44pxタップ領域、safe area、固定ヘッダー／フッター付きダイアログ
- `js/constants.js` — アプリ版、業者候補、案件種別、個別要因、案件・回答状況
- `js/utils.js` — 正規化、検索、並び替え、類似判定、履歴集計、バックアップ検証、2種類のCSV
- `js/db.js` — IndexedDB v2、4ストア、原子的CRUD／移行／復元
- `js/cases-ui.js` — 案件、回答、業者候補、類似案件、履歴、アーカイブUI
- `js/app.js` — 既存業者UI、4ナビ、バックアップ、PWA登録、共通ダイアログ制御
- `manifest.webmanifest` / `sw.js` — PWAとオフラインアプリシェル
- `icons/` とPNG 4点 — 既存仕事用シリーズの中央文字「買」
- `tests/` — 静的・純粋関数・移行・バックアップ・性能・実ブラウザQA

## 画面

1. 探す
2. 案件
3. 業者
4. その他
5. 業者登録／詳細
6. 案件登録／詳細
7. 回答編集、業者複数追加、類似案件
8. JSON復元、候補編集、詳細設定／アーカイブ

## IndexedDB v2

DB名は `kaitori-company-note`、versionは `2` です。

- `companies`（keyPath `id`）
- `settings`（keyPath `id`）
- `cases`（keyPath `id`、`updatedAt` / `createdAt` / `status` / `area` / `caseType` 等）
- `caseResponses`（keyPath `id`、`caseId` / `companyId` / `responseStatus` / `followUpDate` 等）
- `caseResponses.caseCompany` は `[caseId, companyId]` の複合ユニークインデックス

v1からのupgradeでは新ストアとインデックスだけを追加し、既存の `companies` と `settings` の生レコードへ書き込みません。`isArchived`等は読み込み時の正規化で安全に補完します。

## 検索とスコアリング

- 業者検索：分類間AND、同分類内OR、広域エリア包含、電話記号除去
- 案件検索：進捗、エリア、案件種別、個別要因、案件・回答・業者横断フリーワード
- 類似案件：案件種別一致→共通要因数→エリア一致→更新日の辞書式優先
- おすすめ業者：エリア一致、買取対象対応、お気に入り、温度感、同じ要因への過去回答件数を加点

## 整合性と復元安全性

- 案件削除と紐づく回答削除は同一トランザクション
- 回答一括追加は同一トランザクション
- 回答変更時に案件の更新日も同一トランザクションで更新
- 回答履歴がある業者は通常削除せずアーカイブ
- schemaVersion 1と2を復元可能
- 追加復元のID衝突は再採番し、回答参照も更新
- 置換復元は4ストアと設定を同一トランザクションで処理
- 全件検証またはトランザクション失敗時は既存データを変更しない

## PWAとデザイン

Service Workerキャッシュ名は `kaitori-company-note-v1-prototype2` です。activate時は `kaitori-company-note-` 接頭辞の旧キャッシュだけを削除し、他アプリのキャッシュは残します。色は濃紺・アイボリー・落ち着いたグレー・控えめな赤錆アクセントを使用し、アイコンは外部サービスを使わず既存SVG体系からローカル生成しています。
