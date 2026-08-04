# 実装概要

## アプリ構成

- `index.html` — 探す／業者一覧／その他、登録編集・詳細・復元・候補編集ダイアログ
- `css/styles.css` — Liberty Codex系デザイン、390px優先、PC 2〜3列、safe area
- `js/constants.js` — 初期候補、温度感、アプリ定数、サンプル3社
- `js/utils.js` — 正規化、検索、並び替え、重複検知、バックアップ検証、CSV
- `js/db.js` — IndexedDB version 1、CRUD、初期化、原子的復元
- `js/app.js` — UI状態、描画、イベント、PWA登録
- `manifest.webmanifest` — PWAメタデータ
- `sw.js` — アプリシェル、オフライン、限定的な旧キャッシュ削除
- `icons/icon-source.svg` — 共通シリーズ準拠の1024px原本
- `apple-touch-icon.png`／`icon-192.png`／`icon-512.png`／`icon-maskable-512.png`
- `README.md` — 利用者向け手順と制限
- `tests/` — 静的、単体、実ブラウザQAと証跡

## 画面

1. 探す
2. 業者一覧
3. その他
4. 業者登録・編集（モーダル）
5. 業者詳細（モーダル）
6. JSON復元（モーダル）
7. 候補編集（モーダル）

## データ

IndexedDB名：`kaitori-company-note`、version：`1`

- `companies`（keyPath `id`）
- `settings`（keyPath `id`、`app-settings` 1レコード）

通常はIndexedDBを使用します。IndexedDBを開けない環境だけ、同一ブラウザ内のローカル互換保存へ切り替えます。

## 検索

- 分類間：AND
- 同じ分類内の複数選択：OR
- フリーワード内の空白区切り語：AND
- エリア：個別地域に対して神奈川県全域・関東・全国等の広域包含あり
- 物件種別：タグ一致
- 電話：記号を除いた数字でも検索
- 探す画面の順：お気に入り→温度感→日本語業者名→ID

## 復元安全性

全件をメモリ上で検証してから保存処理へ進みます。置換は`companies`と`settings`の同一readwriteトランザクションで行います。追加時の既存IDは上書きせずスキップします。検証またはトランザクション失敗時は既存データを変更しません。

## デザインとアイコン

既存のLiberty Codexシリーズ仕様を使用しています。

- 濃紺 `#0F1B2D`
- アイボリー `#FFF8E7`
- 金 `#E2C77F`
- 本アプリの赤錆アクセント `#A6533F`
- 左上の共通蝶紋
- 八角形プレート
- 中央文字「買」

SVGをローカルのEdge描画でPNG化し、外部画像生成AI・外部Webサービスは使用していません。
