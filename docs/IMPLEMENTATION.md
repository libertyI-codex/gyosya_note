# 実装概要 — 買取業者ノート Ver.1.0 試作3

## バージョンと基本構成

- 画面表示：`買取業者ノート Ver.1.0 試作3`
- 内部バージョン：`1.0.0-prototype.3`
- IndexedDB：`kaitori-company-note`、version `2`を維持
- JSONバックアップ：`schemaVersion: 3`
- Service Workerキャッシュ：`kaitori-company-note-v1-prototype3`
- 外部ライブラリ、CDN、API、サーバーを使用しないローカル完結構成

主な役割は次のとおりです。

- `index.html`：探す・案件・業者・その他の4画面、共通ダイアログ、PWAメタデータ
- `css/styles.css`：390px優先のレスポンシブ表示、4列ナビ、固定ヘッダー／本文スクロール／固定フッター型ダイアログ
- `js/constants.js`：バージョン、エリア、案件種別、個別要因、買取対象の共通カタログ
- `js/utils.js`：文字・かな・ID正規化、検索、並び順、エリア包含、旧対象移行、CSV、バックアップ検証
- `js/db.js`：IndexedDB／localStorageフォールバック、データモデル移行、CRUD、JSONバックアップ・復元
- `js/app.js`：単一画面ルーター、業者UI、よみがな入力補助、ダイアログとPWA更新制御
- `js/cases-ui.js`：案件・回答・類似案件・おすすめ業者・業者回答履歴
- `sw.js`：試作3アプリシェルのキャッシュとオフライン再起動

## 案件画面が開かなかった原因と修正

試作2の同一世代のソースでは、`data-nav="cases"`、`data-screen="cases"`、ルーターの`cases`名は一致していました。実利用時の主因は、旧Service Workerが制御している更新直後に、network-firstで取得した新しい`index.html`と、cache-firstで返した古い`app.js`／`styles.css`が同じ画面へ混在し得たことです。

この状態では、新HTMLにだけ存在する「案件」ボタンを旧ルーターが認識せず、古い3列CSSによって4番目のナビが次の行へ落ちる可能性もありました。キャッシュ名を変えるだけでは、旧Workerが制御する最初の読込みの整合性までは保証できません。

試作3では次の対策を行いました。

- CSS・JavaScript・主要PWA資産のURLへ`?v=prototype3`を付け、新旧URLを分離
- `sw.js`の静的資産検索を、全キャッシュ横断の`caches.match()`ではなく、現在の`CACHE_NAME`内だけの`cache.match()`へ変更
- Service Worker登録へ`updateViaCache: "none"`を指定
- 起動時から既存Workerの制御下だった更新時だけ`controllerchange`で未保存入力を確認し、安全な場合に1回再読込み。初回インストールの`clients.claim()`では再読込みせず、直後に開いた登録ダイアログを閉じない
- ナビ操作を`.bottom-nav__inner`の単一イベント委譲へ集約
- `event.target.closest("button[data-route]")`を使用し、アイコン、文字、余白のどこを押しても同じ経路で処理
- `ROUTES`と`navigate()`へ、画面の`hidden`／`aria-hidden`、active、`aria-current`、FAB動作、再描画、履歴を集約
- 戻る操作は`popstate`から同じ`navigate()`を呼び、別ルーターを作らない

下部ナビは`grid-template-columns: repeat(4, minmax(0, 1fr))`の1段4列です。各ボタンは`width: 100%`、`min-width: 0`、ラベルは`white-space: nowrap`とし、選択中も文字サイズや寸法を変えません。

## 選択ボタンのレイアウト安定化

試作2では、選択時だけ`.chip.is-selected::before`へチェック記号と余白を追加していたため、チップの横幅と折返し位置が変わりました。

試作3では未選択時から同じ12pxの疑似要素領域を確保し、選択時は内容と透明度だけを切り替えます。font-size、line-height、padding、margin、border-width、min-heightは選択前後で同一です。エリア、買取対象、案件種別、個別要因、案件状況、回答状況、回答理由、絞り込み、下部ナビへ同じ寸法固定方針を適用します。

## 業者登録ダイアログとスクロール制御

試作2はダイアログを3領域に分けていましたが、高さ指定が実質`100dvh`依存で、`VisualViewport`を参照していませんでした。iPhoneのキーボードや動的ブラウザUIで実表示領域が縮んだ際、外枠の`overflow: hidden`と組み合わさり、本文や保存フッターが操作範囲外になる可能性がありました。背景ロックもCSSの`:has(dialog[open])`任せで、明示的なスクロール位置の保存・復元がありませんでした。旧CSSと新HTMLのキャッシュ混在も症状を悪化させる要因でした。

試作3の全ダイアログは次の3行グリッドです。

1. `.dialog-header`：見出しと44pxの閉じるボタン
2. `.dialog-body`：`min-height: 0`、縦方向だけをスクロール
3. `.dialog-footer`：保存・キャンセル操作とsafe area余白

高さは`100vh`、`100svh`、`100dvh`の順でフォールバックし、`visualViewport.height`を`--visual-viewport-height`へ反映します。viewportの`resize`と`scroll`でも更新するため、キーボード表示中の狭い領域へ追従します。

ダイアログを開くと本文を先頭へ戻し、現在の`scrollY`を保存して`body.has-dialog-open`で背景を固定します。閉じる、キャンセル、保存、ダイアログ間遷移はいずれも共通制御を通り、最後のダイアログが閉じた時点でbodyの固定とスクロール位置を復元します。フォーカスはネイティブ`dialog`内に保ち、閉じた後は起点または現在のナビへ戻します。

## 業者名よみがなとIME入力補助

業者データへ任意の`companyNameKana`を追加しました。保存時はNFKCと空白整理を行い、カタカナをひらがなへ変換します。フリーワード検索へ含め、業者名順は`companyNameKana || companyName`を日本語Collatorで比較します。業者カード、詳細、JSON、業者CSV、案件・回答CSVにも反映します。

業者名欄では次のイベントを利用します。

- `compositionstart`：IME変換開始と読み候補の初期化
- `compositionupdate`：変換確定前のかなを安全な候補として記録
- `beforeinput`：環境が提供するcompositionデータを補完
- `compositionend`：取得できた読みを候補欄へ反映
- `input`：カタカナ業者名から安全にひらがな候補を作成

候補は、かなを含み漢字を含まない場合だけ採用します。確定済みの任意の漢字を辞書なしで推測しません。会社名に漢字とカタカナが混在する場合はカタカナ部分だけをひらがなへ変換できます。

自動更新中を示す内部フラグと`kanaManuallyEdited`を分離しています。よみがな欄に既存値がある場合、または利用者が一度手動編集した場合は、自動候補で上書きしません。自動入力時は「自動候補」、手入力後は手入力値を保存する旨を補助表示します。

## 買取エリアと包含関係

エリアは表示ラベルではなく次の12 IDで管理します。

`yokohama`、`kawasaki`、`shonan`、`kenou`、`yokosuka-miura`、`kensei`、`kanagawa-all`、`tokyo`、`chiba`、`kanto`、`nationwide`、`other`

`AREA_OPTIONS`、`AREA_INCLUSION_RULES`、ID・ラベル対応表を`constants.js`へ集約しました。

- 神奈川県全域：横浜、川崎、湘南、県央、横須賀・三浦、県西と自身を選択
- 関東：全国・その他を除く関東対象と自身を選択
- 全国：その他を除く全エリアを選択
- 広域項目をOFFにした場合：広域項目自身だけを解除し、展開済みの下位項目は維持
- 「すべて解除」：その画面のエリア選択を空にする

検索・おすすめ判定では、保存値が広域項目だけの旧データでも`expandAreaSelection()`で包含範囲を解釈します。したがって神奈川県全域は横浜案件、関東は千葉案件、全国は通常エリア案件へ一致し、「その他」は自動包含しません。

## 共通化した買取対象

案件側と業者側の候補を二重定義せず、次を共通利用します。

- `CASE_TYPE_OPTIONS`：案件種別10項目
- `CASE_FACTOR_GROUPS`：4カテゴリ、個別要因17項目
- `PURCHASE_TARGET_OPTIONS`：案件種別と個別要因をカテゴリ付きで束ねた表示定義
- `PURCHASE_TARGET_IDS`：案件種別10項目＋個別要因17項目
- `PURCHASE_TARGET_ALL_IDS`：「その他」を除く案件種別9項目＋個別要因17項目、合計26 ID

業者の正規保存項目は`purchaseTargetIds`です。「全て」は選択操作用の仮想値で、押すと26 IDを選択します。「その他」は自動選択しません。「全て」をOFFにしても展開済み項目は残り、「すべて解除」で明示的に空へ戻せます。

「その他」を選ぶと`customPurchaseTarget`入力欄を表示します。最大300文字の任意入力で、選択を解除して欄が非表示になっても値を直ちに削除しません。検索、カード上の登録有無、詳細、JSON、CSVへ反映します。

案件へのおすすめ順位は、新しい共通IDで次を別々に判定します。

- エリア一致：100点
- 案件種別一致：80点
- 個別要因一致：1件20点、最大10件
- お気に入り：40点
- 類似案件への過去回答：1件8点、最大10件
- 過去の成約：1件25点、最大10件

温度感は点数にも候補表示にも使用しません。

## 旧買取対象の冪等移行

IndexedDB versionは2のまま、起動時に`settings.companyDataModelVersion`を確認して業者データモデルだけを3へ移行します。移行は`companies`と`settings`のreadwriteトランザクション内で行い、`cases`と`caseResponses`には変更を加えません。localStorageフォールバックにも同じ処理を適用します。

旧`propertyTypes`は次の方針で処理します。

- 一意に対応できる値を共通IDへ変換
- 一棟アパート／一棟マンションは`income-building`へ統合
- 区分マンションのように空室／OCを一意に決められない値は`legacyPurchaseTargets`へ保持
- 共有持分、古家付き土地、任意売却など固定候補に一意対応しない値も`legacyPurchaseTargets`へ保持
- 既存の`customPurchaseTarget`を保持
- ID配列と旧値配列を正規化・重複除去

移行済みフラグと重複除去により、再起動しても値は増えません。既存レコードの元`propertyTypes`や`temperature`は互換保護のためIndexedDB上で強制削除せず、新しいUI・検索・CSV・JSONからは使用しません。サンプル初期化フラグも維持し、既存利用者へサンプルを再追加しません。

## 温度感の通常機能からの削除

業者登録・編集・詳細・カード、探す、業者一覧の絞り込みと並び替え、おすすめ点数、統計、サンプル、CSS、aria-label、README、業者CSV、新規JSONから温度感を削除しました。

新規保存される正規業者データとschemaVersion 3バックアップには`temperature`を含めません。schemaVersion 1・2に`temperature`が残っていても復元を拒否せず、他の項目を正規化して取り込みます。旧設定の`defaultSort: "temperature"`は`name`へ変換します。なお回答理由の「現在仕入れ休止」は案件回答の理由であり、削除対象の業者温度感とは別項目です。

## IndexedDB v2とJSON schemaVersion 3

IndexedDBのストア構成は変更していません。

- `companies`：業者情報、keyPath `id`
- `settings`：候補・移行状態、keyPath `id`
- `cases`：案件情報、keyPath `id`
- `caseResponses`：案件と業者の回答、keyPath `id`、`[caseId, companyId]`一意索引

schemaVersion 3の業者には、`companyNameKana`、`purchaseTargetIds`、`customPurchaseTarget`、`legacyPurchaseTargets`を保存し、`temperature`と旧`propertyTypes`は書き出しません。schemaVersion 1・2・3を復元可能で、旧データは同じ正規化・買取対象移行を通します。

復元前に全件を検証し、不正なID、参照、重複、案件種別、個別要因、回答状況、金額、日付、試作3の不正な買取対象IDを拒否します。追加復元はID衝突を再採番して回答参照も更新し、置換復元は4ストアを同一トランザクションで処理します。検証またはトランザクション失敗時は既存データを変更しません。

CSVはUTF-8 BOM、CRLF、引用符処理、数式注入対策を維持します。

- 業者一覧CSV：よみがなとその他補足を含む12列、温度感列なし
- 案件・回答CSV：業者名の隣へよみがなを追加した24列、回答0件の案件も1行出力

## PWAとオフライン

Service Workerキャッシュ名は`kaitori-company-note-v1-prototype3`です。install時に試作3のアプリシェルを一括キャッシュし、activate時は`kaitori-company-note-`で始まる旧キャッシュだけを削除します。他アプリのキャッシュには触れません。

画面遷移はnetwork-first、失敗時は現在の試作3キャッシュ内の対象URLまたは`index.html`へフォールバックします。静的資産は現在の試作3キャッシュ内だけをcache-firstで取得し、同一オリジンのGET以外、`tel:`、`mailto:`はキャッシュしません。`file://`ではService Workerだけを登録せず、業者・案件・回答、JSON、CSVは相対パスと端末内保存で動作します。

## QA構成

試作3固有のQAは次のファイルへ分離しています。

- `qa-prototype3-navigation.cjs`：単一ルーター、1クリック1遷移、4列ナビ、versioned assets、現在キャッシュ限定
- `qa-prototype3-dialog-scroll.cjs`：3領域、viewport fallback、VisualViewport、body lock、開閉後の復元
- `qa-prototype3-company-kana.cjs`：かな正規化、IME安全条件、手動上書き防止、検索・並び・CSV
- `qa-prototype3-area-selection.cjs`：千葉、3広域一括選択、解除、包含検索
- `qa-prototype3-purchase-targets.cjs`：共通10＋17項目、「全て」、その他補足、旧対象移行、おすすめ点数
- `qa-prototype3-temperature-removal.cjs`：通常機能・新規CSV・新規JSONからの温度感削除、旧バックアップ互換
- `qa-prototype3-data-compatibility.cjs`：IndexedDB v2維持、既存4ストア、冪等移行、schema 1・2・3
- `qa-prototype3-browser.cjs`：390×844、390×500、1440、ナビ連打、各登録経路、PWA・オフライン、Console監視
- `qa-prototype3-deployment-hash.cjs`：配置元と指定フォルダの相対パス・SHA-256照合

既存の静的、単体、案件、バックアップ、DB移行、性能QAも回帰確認に利用します。詳細な実行結果は`docs/TEST-RESULTS.md`へ分離し、本書では実装構造と検証範囲だけを扱います。

## 現在の制限

- ブラウザは確定済みの任意の漢字から正しい読みを推測できないため、IMEが読みを提供しない場合は空欄のままです。
- カタカナは安全に変換できますが、漢字と混在する名前ではカタカナ部分だけが候補になる場合があります。
- 案件種別と個別要因の固定候補編集、通知、クラウド同期、ログイン、添付、AI査定は実装していません。
- データは端末内保存のため、SafariのWebサイトデータ削除で消える可能性があります。定期的なJSONバックアップが必要です。
