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

  const APP = Object.freeze({
    displayName: "買取業者ノート",
    internalName: "Kaitori Company Note",
    version: "Ver.1.0 試作1",
    versionNumber: "1.0-prototype1",
    schemaVersion: 1,
    dbName: "kaitori-company-note",
    dbVersion: 1,
    companyStore: "companies",
    settingsStore: "settings",
    settingsId: "app-settings",
    backupFormat: "kaitori-company-note-backup",
    cacheName: "kaitori-company-note-v1-prototype1",
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
    DEFAULT_SETTINGS,
    SAMPLE_COMPANIES
  });
})(window);
