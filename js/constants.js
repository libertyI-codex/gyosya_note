(function (global) {
  "use strict";

  const AREA_OPTIONS = [
    "横浜",
    "川崎",
    "湘南",
    "県央",
    "横須賀・三浦",
    "県西",
    "東京都",
    "神奈川県全域",
    "関東",
    "全国",
    "その他"
  ];

  const PROPERTY_TYPE_OPTIONS = [
    "土地",
    "戸建",
    "区分マンション",
    "一棟アパート",
    "一棟マンション",
    "一棟収益",
    "店舗・事務所",
    "ビル",
    "借地",
    "底地",
    "再建築不可",
    "共有持分",
    "市街化調整区域",
    "古家付き土地",
    "事故・訳あり",
    "任意売却",
    "その他"
  ];

  const TEMPERATURES = Object.freeze({
    ACTIVE: "積極的",
    NORMAL: "通常",
    PAUSED: "現在休止"
  });

  const CASE_TYPE_OPTIONS = Object.freeze([
    { id: "detached-single-lot", label: "戸建1宅地" },
    { id: "detached-subdivision", label: "戸建分譲" },
    { id: "income-building", label: "一棟収益" },
    { id: "condo-vacant", label: "区分M（空室）" },
    { id: "condo-occupied", label: "区分M（OC）" },
    { id: "land", label: "土地" },
    { id: "business-land", label: "事業用地" },
    { id: "shop-office", label: "店舗・事務所" },
    { id: "building", label: "ビル" },
    { id: "other", label: "その他" }
  ].map((option) => Object.freeze(option)));

  const CASE_TYPE_IDS = Object.freeze(CASE_TYPE_OPTIONS.map((option) => option.id));
  const CASE_TYPE_LABELS = Object.freeze(CASE_TYPE_OPTIONS.reduce((labels, option) => {
    labels[option.id] = option.label;
    return labels;
  }, {}));

  const CASE_FACTOR_GROUPS = Object.freeze([
    {
      id: "construction",
      label: "建築・土地形状",
      options: [
        { id: "old-earthquake-standard", label: "旧耐震" },
        { id: "development", label: "造成" },
        { id: "cliff-retaining-wall", label: "崖・擁壁" },
        { id: "narrow-lot", label: "狭小地" },
        { id: "flagpole-lot", label: "旗竿地" },
        { id: "irregular-lot", label: "不整形地" },
        { id: "rebuild-impossible", label: "再建築不可" }
      ]
    },
    {
      id: "rights",
      label: "権利・占有",
      options: [
        { id: "leasehold", label: "借地" },
        { id: "leased-land-owner-right", label: "底地" },
        { id: "eviction", label: "立ち退き" }
      ]
    },
    {
      id: "legal-land",
      label: "法令・土地",
      options: [
        { id: "adjustment-zone", label: "調整区域" },
        { id: "forest", label: "山林" },
        { id: "farmland", label: "農地" },
        { id: "nonconforming", label: "既存不適格" },
        { id: "buried-cultural-property", label: "埋蔵文化財" }
      ]
    },
    {
      id: "sale-product",
      label: "売却条件・商品",
      options: [
        { id: "leaseback", label: "リースバック" },
        { id: "accident-psychological-defect", label: "事故・心理的瑕疵" }
      ]
    }
  ].map((group) => Object.freeze({
    ...group,
    options: Object.freeze(group.options.map((option) => Object.freeze(option)))
  })));

  const CASE_FACTOR_OPTIONS = Object.freeze(CASE_FACTOR_GROUPS.flatMap((group) => group.options));
  const CASE_FACTOR_IDS = Object.freeze(CASE_FACTOR_OPTIONS.map((option) => option.id));
  const CASE_FACTOR_LABELS = Object.freeze(CASE_FACTOR_OPTIONS.reduce((labels, option) => {
    labels[option.id] = option.label;
    return labels;
  }, {}));

  const CASE_STATUSES = Object.freeze(["相談中", "買取打診中", "回答待ち", "回答済み", "成約", "見送り"]);
  const RESPONSE_STATUSES = Object.freeze(["打診済み", "回答待ち", "金額回答", "条件付き", "見送り", "成約"]);
  const RESPONSE_REASONS = Object.freeze([
    "金額が合わない",
    "エリア外",
    "物件種別対象外",
    "個別要因が難しい",
    "現在仕入れ休止",
    "社内稟議否決",
    "他案件を優先",
    "条件付きなら検討可",
    "その他"
  ]);

  const APP = Object.freeze({
    displayName: "買取業者ノート",
    internalName: "Kaitori Company Note",
    displayVersion: "Ver.1.0 試作2",
    version: "Ver.1.0 試作2",
    versionNumber: "1.0.0-prototype.2",
    schemaVersion: 2,
    dbName: "kaitori-company-note",
    dbVersion: 2,
    companyStore: "companies",
    settingsStore: "settings",
    caseStore: "cases",
    responseStore: "caseResponses",
    settingsId: "app-settings",
    backupFormat: "kaitori-company-note-backup",
    cacheName: "kaitori-company-note-v1-prototype2",
    localFallbackKey: "kaitori-company-note-local-fallback-v1"
  });

  const DEFAULT_SETTINGS = Object.freeze({
    id: APP.settingsId,
    areaOptions: AREA_OPTIONS,
    propertyTypeOptions: PROPERTY_TYPE_OPTIONS,
    defaultSort: "name",
    schemaVersion: APP.schemaVersion,
    sampleInitialized: false,
    updatedAt: null
  });

  const SAMPLE_COMPANIES = Object.freeze([
    {
      id: "sample-yokohama-kaitori",
      companyName: "サンプル横浜買取",
      contactName: "山田（サンプル）",
      phone: "045-000-0001",
      email: "yokohama@example.invalid",
      areas: ["横浜", "神奈川県全域"],
      customArea: "横浜市南部を中心に相談可",
      propertyTypes: ["土地", "戸建", "古家付き土地"],
      temperature: TEMPERATURES.ACTIVE,
      isFavorite: true,
      memo: "【サンプル】決裁が早い。築古戸建も相談可。実在する業者情報ではありません。",
      isSample: true
    },
    {
      id: "sample-shonan-realestate",
      companyName: "サンプル湘南不動産",
      contactName: "佐藤（サンプル）",
      phone: "0466-000-002",
      email: "",
      areas: ["湘南", "横須賀・三浦"],
      customArea: "鎌倉・逗子も相談可",
      propertyTypes: ["土地", "戸建", "再建築不可"],
      temperature: TEMPERATURES.NORMAL,
      isFavorite: false,
      memo: "【サンプル】難あり案件にも対応。実在する業者情報ではありません。",
      isSample: true
    },
    {
      id: "sample-income-property",
      companyName: "サンプル収益物件社",
      contactName: "鈴木（サンプル）",
      phone: "",
      email: "income@example.invalid",
      areas: ["東京都", "関東"],
      customArea: "",
      propertyTypes: ["一棟アパート", "一棟マンション", "一棟収益"],
      temperature: TEMPERATURES.PAUSED,
      isFavorite: false,
      memo: "【サンプル】一棟は利回り重視。現在は仕入れ休止中。実在する業者情報ではありません。",
      isSample: true
    }
  ]);

  global.KCN = global.KCN || {};
  Object.assign(global.KCN, {
    APP,
    AREA_OPTIONS,
    PROPERTY_TYPE_OPTIONS,
    TEMPERATURES,
    CASE_TYPES: CASE_TYPE_OPTIONS,
    CASE_TYPE_OPTIONS,
    CASE_TYPE_IDS,
    CASE_TYPE_LABELS,
    CASE_FACTOR_GROUPS,
    CASE_FACTORS: CASE_FACTOR_OPTIONS,
    CASE_FACTOR_OPTIONS,
    CASE_FACTOR_IDS,
    CASE_FACTOR_LABELS,
    CASE_STATUSES,
    RESPONSE_STATUSES,
    RESPONSE_REASONS,
    DEFAULT_SETTINGS,
    SAMPLE_COMPANIES
  });
})(window);
