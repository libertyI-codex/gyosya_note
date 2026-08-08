# 買取業者ノート Ver.1.0 試作3 QA対応表

試作3の必須テスト85項目を、静的契約、純粋関数、データ互換、実ブラウザ操作の4層で検証する。単なる文字列存在だけで合否を決めず、画面遷移、実寸、IndexedDB／フォールバック保存、Service Worker、file起動はブラウザまたは実データで確認する。

## QAファイル

| ファイル | 主な責務 |
|---|---|
| `tests/qa-prototype3-navigation.cjs` | route契約、単一router、4列固定CSS、FABコンテキスト |
| `tests/qa-prototype3-dialog-scroll.cjs` | dialogの固定header／scroll body／footer、viewport単位、背景ロック |
| `tests/qa-prototype3-company-kana.cjs` | カナ変換、正規化、検索、読み順、CSV |
| `tests/qa-prototype3-area-selection.cjs` | 12エリア、千葉、包含展開、旧ラベル互換 |
| `tests/qa-prototype3-purchase-targets.cjs` | 共通10＋17候補、全て、旧対象移行、検索、おすすめ信号 |
| `tests/qa-prototype3-temperature-removal.cjs` | 通常UI／CSS／おすすめ／CSV／新JSONから温度感を排除し旧JSONだけ許容 |
| `tests/qa-prototype3-data-compatibility.cjs` | schema 1・2・3、v2ストア維持、冪等移行、件数・関連・アーカイブ維持 |
| `tests/qa-prototype3-browser.cjs` | 実クリック、連続遷移、dialog実寸、IMEイベント、レスポンシブ、file／HTTP／PWA／offline |
| `tests/qa-prototype3-deployment-hash.cjs` | 配置元・配置先の相対パス一覧と全ファイルSHA-256 |

## 必須85項目

| No. | 要件 | 主QA | 必須assert／操作 |
|---:|---|---|---|
| 1 | 案件1回タップ | navigation, browser | `data-route=cases`から`#screen-cases`がvisible |
| 2 | 1タップ1切替 | browser | `caseUI.renderAll`計測値が1 |
| 3 | アイコン・文字・余白 | browser | SVG／spanへdispatch、button端座標をclick |
| 4 | 4画面連続切替 | browser | 10遷移ごとに対象screenとariaを確認 |
| 5 | 390pxで1段 | navigation, browser | nav buttonのtop座標が1種類 |
| 6 | 390×500で1段 | browser | viewport変更後もtop座標が1種類 |
| 7 | 1440pxで1段 | browser | viewport変更後もtop座標が1種類 |
| 8 | nav横スクロールなし | browser | `scrollWidth === clientWidth` |
| 9 | active文字サイズ不変 | navigation, browser | 選択前後のcomputed font-size／line-height一致 |
| 10 | aria-current | browser | 常に1個だけ`page` |
| 11 | 探す＋から登録 | browser | FAB→`#company-dialog[open]` |
| 12 | 業者＋から登録 | browser | list routeのFAB→dialog |
| 13 | 390×500最下部 | dialog-scroll, browser | bodyをscrollHeightまで移動、footer表示 |
| 14 | 390×844最下部 | browser | 同上、標準iPhone高さ |
| 15 | 見出し・閉じる固定 | browser | body scroll前後のheader座標一致 |
| 16 | 保存操作可能 | browser | save bounding boxがviewport内 |
| 17 | navへ隠れない | browser | footer bottomがviewport以下 |
| 18 | 背景スクロール復元 | browser | open中hidden、close後のoverflowが元値 |
| 19 | 連続開閉ロック解除 | browser | 5回開閉し毎回body解除 |
| 20 | キーボード相当狭画面 | browser | 390×360でも保存buttonがviewport内 |
| 21 | よみがな手入力 | browser | kana inputへfill |
| 22 | ひらがな保存 | company-kana, browser | 保存後DBの`companyNameKana` |
| 23 | カタカナ候補 | company-kana, browser | リバブル→りばぶる |
| 24 | IME読み候補 | browser | compositionstart/update/endをdispatch |
| 25 | 漢字を誤推測しない | company-kana | 漢字文字列が変換されない |
| 26 | 手動後は上書きなし | browser | kana手修正後に会社名変更、値維持 |
| 27 | よみがな検索 | company-kana, browser | カタカナqueryで保存会社を表示 |
| 28 | よみがな順 | company-kana | `compareCompanies(...,"name")` |
| 29 | JSON保存復元 | data-compatibility | schema3のkanaをvalidate／backup |
| 30 | CSV出力 | company-kana | 会社・案件回答CSVの読み列位置 |
| 31 | 選択前後font-size | navigation, browser | computed style一致 |
| 32 | 選択前後幅・高さ | browser | bounding box差0.5px以内 |
| 33 | 隣ボタン不動 | browser | adjacent x/y差0.5px以内 |
| 34 | 案件種別・要因不動 | browser | case type/factor選択前後実寸 |
| 35 | 回答状況・理由不動 | dialog-scroll, browser | native selectの固定geometry／共通選択CSS |
| 36 | 千葉選択 | area-selection, browser | `chiba`選択値 |
| 37 | 神奈川6地域展開 | area-selection, browser | 6地域＋自身 |
| 38 | 関東展開 | area-selection, browser | 全国・その他以外10ID |
| 39 | 全国展開 | area-selection, browser | その他以外11ID |
| 40 | その他は自動対象外 | area-selection, browser | 展開後`other=false` |
| 41 | 広域OFFで下位維持 | browser | broadのみfalse、横浜true |
| 42 | 全エリア解除 | browser | selected IDsが空 |
| 43 | 神奈川全域→横浜一致 | area-selection | `areaMatches` |
| 44 | 関東→千葉一致 | area-selection | `areaMatches` |
| 45 | 全国→通常地域一致 | area-selection | `areaMatches` |
| 46 | 案件種別10 | purchase-targets, browser | 共通catalog件数 |
| 47 | 要因17 | purchase-targets, browser | 共通catalog件数 |
| 48 | カテゴリ表示 | browser | 5 group見出し |
| 49 | 複数選択 | browser | aria-pressed複数true |
| 50 | 全て展開 | purchase-targets, browser | 26実項目＋仮想all |
| 51 | その他除外 | purchase-targets, browser | `other=false` |
| 52 | 全対象解除 | browser | selected IDsが空 |
| 53 | その他補足保存 | purchase-targets, browser | textarea→DB／再表示 |
| 54 | その他補足検索 | purchase-targets, browser | queryで会社表示 |
| 55 | 詳細で全項目 | browser | kana、全対象、補足text |
| 56 | おすすめ共通ID | purchase-targets | `purchaseTargetIds`＋caseType/factorsを使用 |
| 57 | 登録画面に温度感なし | temperature-removal | HTML／appを否定検索 |
| 58 | 詳細に温度感なし | temperature-removal, browser | detail text否定 |
| 59 | 検索条件になし | temperature-removal | HTML／appを否定検索 |
| 60 | 並び替えになし | temperature-removal | HTML／appを否定検索 |
| 61 | おすすめ点数になし | purchase-targets, temperature-removal | cases-uiを否定検索 |
| 62 | 統計になし | temperature-removal | HTML／appを否定検索 |
| 63 | 新CSVになし | temperature-removal | 12列header完全一致 |
| 64 | 新JSONになし | temperature-removal, data-compatibility | serialize後own property否定 |
| 65 | 旧temperature JSON可 | temperature-removal, data-compatibility | schema1／2 validate成功 |
| 66 | IndexedDB v2維持 | data-compatibility | `APP.dbVersion===2`、open契約 |
| 67 | companies件数維持 | data-compatibility | 移行前後件数 |
| 68 | cases維持 | data-compatibility | ID／件数 |
| 69 | responses維持 | data-compatibility | ID／caseId／companyId |
| 70 | 旧対象情報維持 | purchase-targets, data-compatibility | mapped＋legacyの和集合 |
| 71 | 移行冪等 | purchase-targets, data-compatibility | 2回実行後配列一致／重複なし |
| 72 | sample再追加なし | data-compatibility | sampleInitialized後件数一致 |
| 73 | favorite維持 | data-compatibility | boolean一致 |
| 74 | 回答履歴維持 | data-compatibility | response参照一致 |
| 75 | archive維持 | data-compatibility | isArchived／archivedAt一致 |
| 76 | 390×844操作 | browser | nav、case、company dialog操作 |
| 77 | 390×500操作 | browser | nav1段、dialog footer可視 |
| 78 | 1440崩れなし | browser | nav1段、dialog可視、screenshot |
| 79 | body横スクロールなし | browser | document scrollWidth <= innerWidth |
| 80 | file起動 | browser | route＋dialog、SW 0件 |
| 81 | HTTP起動 | browser | 全主要シナリオをlocalhostで実行 |
| 82 | PWA起動 | browser | active workerとprototype3 cache |
| 83 | offline再起動 | browser | offline reload後casesを1回で表示 |
| 84 | JS構文エラーなし | 全static＋`node --check` | 全JS／QAを構文検査 |
| 85 | Console未処理エラーなし | browser | pageerror／console error配列が空 |

## 追加の配置・キャッシュ回帰ゲート

- `qa-prototype3-browser.cjs`は、事前に`kaitori-company-note-v1-prototype2`と無関係なcacheを作り、試作3のactivate後に旧アプリcacheだけが消えることを確認する。
- `qa-prototype3-deployment-hash.cjs`は、`.git`、`.agents`、`.codex`を配布対象外として、配置元と指定フォルダの相対ファイル一覧・SHA-256を全件比較する。
- 配置後は指定フォルダ内のQAを実行する。ブラウザQAが生成するartifactで照合結果が変わらないよう、最終ブラウザQA後に配置元を再反映してからhash QAを実行する。

## 実行例

```powershell
$node = "C:\Users\tbska\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
Get-ChildItem tests\qa-prototype3-*.cjs | Where-Object Name -ne "qa-prototype3-deployment-hash.cjs" | ForEach-Object { & $node $_.FullName }
& $node tests\qa-prototype3-deployment-hash.cjs `
  "C:\Users\tbska\Documents\Codex\2026-08-04\kaitori-company-note-ver-1-0-2" `
  "C:\Users\tbska\Documents\Codex\09_買取業者ノート\current\kaitori-company-local"
```
