"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

const root = path.resolve(__dirname, "..");
const memory = new Map();
const sandboxConsole = {
  ...console,
  warn: (...args) => {
    if (String(args[0] || "").includes("IndexedDBを利用できないため")) return;
    console.warn(...args);
  }
};
const localStorage = {
  getItem: (key) => memory.has(key) ? memory.get(key) : null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key)
};
const window = {
  console: sandboxConsole, Intl, Date, Math, Set, Map, Uint8Array, URL, Blob,
  crypto: webcrypto, localStorage, setTimeout, clearTimeout
};
window.window = window;
const context = vm.createContext({
  window, console: sandboxConsole, Intl, Date, Math, Set, Map, Uint8Array, URL, Blob, setTimeout, clearTimeout
});
for (const file of ["js/constants.js", "js/utils.js", "js/db.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
}
const K = window.KCN;
let passed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function legacyCompany(overrides = {}) {
  return {
    id: "legacy-company",
    companyName: "旧形式不動産",
    contactName: "担当",
    phone: "045-000-0000",
    email: "old@example.test",
    areas: ["神奈川県全域"],
    customArea: "",
    propertyTypes: ["土地", "区分マンション", "一棟アパート", "共有持分", "事故・訳あり"],
    temperature: "積極的",
    isFavorite: true,
    memo: "旧情報",
    isArchived: false,
    archivedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-02-01T00:00:00.000Z",
    ...overrides
  };
}

function oldEnvelope(schemaVersion) {
  return {
    format: K.APP.backupFormat,
    appName: K.APP.displayName,
    appVersion: schemaVersion === 1 ? "Ver.1.0 試作1" : "Ver.1.0 試作2",
    schemaVersion,
    exportedAt: "2026-08-04T00:00:00.000Z",
    companies: [legacyCompany()],
    cases: schemaVersion >= 2 ? [{
      id: "case-1", caseName: "旧案件", location: "", area: "横浜", customArea: "",
      caseType: "land", customCaseType: "", factors: [], askingPrice: null, landArea: null,
      buildingArea: null, status: "相談中", memo: "", createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    }] : undefined,
    caseResponses: schemaVersion >= 2 ? [{
      id: "response-1", caseId: "case-1", companyId: "legacy-company", responseStatus: "打診済み",
      responseAmount: null, responseDate: "", responseFactors: [], responseReason: "", memo: "",
      followUpDate: "", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z"
    }] : undefined,
    settings: {
      id: K.APP.settingsId,
      areaOptions: ["横浜", "神奈川県全域"],
      propertyTypeOptions: ["土地", "戸建"],
      defaultSort: "temperature",
      sampleInitialized: true
    }
  };
}

(async () => {
  await test("試作3の版・schema 3・IndexedDB v2", () => {
    assert.equal(K.APP.displayVersion, "Ver.1.0 試作3");
    assert.equal(K.APP.versionNumber, "1.0.0-prototype.3");
    assert.equal(K.APP.schemaVersion, 3);
    assert.equal(K.APP.dbVersion, 2);
  });

  await test("エリアは12件のID/表示カタログで千葉を含む", () => {
    assert.equal(K.AREA_OPTIONS.length, 12);
    assert.equal(K.AREA_LABELS.chiba, "千葉");
    assert.equal(K.normalizeAreaId("神奈川県全域"), "kanagawa-all");
    assert.equal(K.areaLabel("yokohama"), "横浜");
  });

  await test("神奈川県全域・関東・全国の展開とその他除外", () => {
    assert.deepEqual(Array.from(K.expandAreaSelection(["kanagawa-all"])), [
      "yokohama", "kawasaki", "shonan", "kenou", "yokosuka-miura", "kensei", "kanagawa-all"
    ]);
    const kanto = K.expandAreaSelection(["kanto"]);
    assert.ok(kanto.includes("chiba"));
    assert.ok(!kanto.includes("nationwide") && !kanto.includes("other"));
    const nationwide = K.expandAreaSelection(["nationwide"]);
    assert.ok(nationwide.includes("kanto") && nationwide.includes("nationwide"));
    assert.ok(!nationwide.includes("other"));
  });

  await test("広域エリアを旧ラベル/IDどちらでも検索一致", () => {
    assert.equal(K.areaMatches(["神奈川県全域"], ["横浜"]), true);
    assert.equal(K.areaMatches(["kanto"], ["chiba"]), true);
    assert.equal(K.areaMatches(["全国"], ["東京都"]), true);
    assert.equal(K.areaMatches(["nationwide"], ["other"]), false);
  });

  await test("案件種別10・個別要因17を同じ買取対象カタログで共有", () => {
    assert.equal(K.CASE_TYPE_IDS.length, 10);
    assert.equal(K.CASE_FACTOR_IDS.length, 17);
    assert.equal(K.PURCHASE_TARGET_IDS.length, 27);
    assert.equal(K.PURCHASE_TARGET_ALL_IDS.length, 26);
    assert.ok(!K.PURCHASE_TARGET_ALL_IDS.includes("other"));
    const all = K.expandPurchaseTargetSelection(["all"]);
    assert.equal(all.length, 27);
    assert.equal(all[0], "all");
    assert.ok(!all.includes("other"));
  });

  await test("旧買取対象を変換し曖昧項目を失わない", () => {
    const migrated = K.migrateLegacyPurchaseTargets(legacyCompany().propertyTypes, [], []);
    assert.deepEqual(Array.from(migrated.purchaseTargetIds), [
      "land", "income-building", "accident-psychological-defect"
    ]);
    assert.deepEqual(Array.from(migrated.legacyPurchaseTargets), ["区分マンション", "共有持分"]);
  });

  await test("旧買取対象移行は冪等", () => {
    const once = K.normalizeCompany(legacyCompany());
    const twice = K.normalizeCompany({ ...legacyCompany(), ...once });
    assert.deepEqual(Array.from(twice.purchaseTargetIds), Array.from(once.purchaseTargetIds));
    assert.deepEqual(Array.from(twice.legacyPurchaseTargets), Array.from(once.legacyPurchaseTargets));
    assert.equal(new Set(twice.purchaseTargetIds).size, twice.purchaseTargetIds.length);
  });

  await test("会社の試作3項目を正規化し通常データから温度感を除外", () => {
    const company = K.normalizeCompany({
      ...legacyCompany(), companyNameKana: "キュウケイシキフドウサン",
      customPurchaseTarget: " ホテル\n工場 "
    });
    assert.equal(company.companyNameKana, "きゅうけいしきふどうさん");
    assert.equal(company.customPurchaseTarget, "ホテル\n工場");
    assert.equal(Object.hasOwn(company, "temperature"), false);
    assert.equal(Object.hasOwn(company, "propertyTypes"), false);
  });

  await test("保存レコード移行は旧フィールドを保持して新項目を補完", () => {
    const stored = K.migrateStoredCompany(legacyCompany());
    assert.equal(stored.temperature, "積極的");
    assert.deepEqual(Array.from(stored.propertyTypes), legacyCompany().propertyTypes);
    assert.ok(stored.purchaseTargetIds.includes("land"));
    assert.ok(stored.legacyPurchaseTargets.includes("区分マンション"));
  });

  await test("カタカナ→ひらがな、読み検索、読み順", () => {
    assert.equal(K.katakanaToHiragana("オープンハウス"), "おーぷんはうす");
    const company = K.normalizeCompany({ id: "kana", companyName: "日税不動産", companyNameKana: "にちぜいふどうさん" });
    assert.equal(K.matchesCompany(company, { query: "ニチゼイ" }), true);
    const rows = [
      K.normalizeCompany({ id: "z", companyName: "青木", companyNameKana: "あおき" }),
      K.normalizeCompany({ id: "a", companyName: "赤坂", companyNameKana: "あかさか" })
    ].sort((a, b) => K.compareCompanies(a, b, "name"));
    assert.deepEqual(rows.map((row) => row.id), ["z", "a"]);
  });

  await test("業者CSVは12列・読み/補足あり・温度感なし", () => {
    const csv = K.buildCsv([K.normalizeCompany({
      ...legacyCompany(), companyNameKana: "きゅうけいしきふどうさん", customPurchaseTarget: "ホテル"
    })]);
    const header = csv.slice(1).split("\r\n")[0];
    assert.equal((header.match(/","/g) || []).length + 1, 12);
    assert.ok(header.includes("業者名よみがな") && header.includes("その他補足"));
    assert.ok(!header.includes("温度感"));
  });

  await test("案件回答CSVは業者名よみがなを含む24列", () => {
    const csv = K.buildCaseResponsesCsv([], [], []);
    const header = csv.slice(1);
    assert.equal((header.match(/","/g) || []).length + 1, 24);
    assert.ok(header.includes('"業者名","業者名よみがな","担当者名"'));
    assert.ok(!header.includes("温度感"));
  });

  await test("schemaVersion 1・2をtemperature付きで復元", () => {
    [1, 2].forEach((schemaVersion) => {
      const validated = K.validateBackup(oldEnvelope(schemaVersion));
      assert.equal(validated.sourceSchemaVersion, schemaVersion);
      assert.equal(validated.companies[0].companyNameKana, "");
      assert.ok(validated.companies[0].purchaseTargetIds.includes("land"));
      assert.equal(Object.hasOwn(validated.companies[0], "temperature"), false);
    });
  });

  await test("schemaVersion 3は不正な買取対象IDを拒否", () => {
    const input = oldEnvelope(2);
    input.schemaVersion = 3;
    input.companies = [{
      ...K.serializeCompanyForBackup(legacyCompany()), purchaseTargetIds: ["invalid-target"]
    }];
    assert.throws(() => K.validateBackup(input), /買取対象ID/);
  });

  await test("fallback初期化で件数/案件/回答/お気に入りを維持し再移行しない", async () => {
    const old = oldEnvelope(2);
    localStorage.setItem(K.APP.localFallbackKey, JSON.stringify({
      companies: old.companies,
      cases: old.cases,
      caseResponses: old.caseResponses,
      settings: old.settings
    }));
    await K.db.initialize();
    const once = JSON.parse(localStorage.getItem(K.APP.localFallbackKey));
    assert.equal(once.companies.length, 1);
    assert.equal(once.cases.length, 1);
    assert.equal(once.caseResponses.length, 1);
    assert.equal(once.companies[0].isFavorite, true);
    assert.equal(once.companies[0].temperature, "積極的");
    assert.ok(once.companies[0].purchaseTargetIds.includes("land"));
    assert.equal(once.settings.companyDataModelVersion, 3);
    await K.db.initialize();
    const twice = JSON.parse(localStorage.getItem(K.APP.localFallbackKey));
    assert.equal(twice.companies.length, 1);
    assert.deepEqual(twice.companies[0].purchaseTargetIds, once.companies[0].purchaseTargetIds);
    assert.deepEqual(twice.companies[0].legacyPurchaseTargets, once.companies[0].legacyPurchaseTargets);
  });

  await test("新規バックアップはschema 3でtemperature/propertyTypesを除外", async () => {
    const backup = await K.db.createBackup();
    assert.equal(backup.schemaVersion, 3);
    assert.equal(backup.appVersion, "Ver.1.0 試作3");
    assert.equal(backup.companies.length, 1);
    assert.equal(Object.hasOwn(backup.companies[0], "temperature"), false);
    assert.equal(Object.hasOwn(backup.companies[0], "propertyTypes"), false);
    assert.ok(Object.hasOwn(backup.companies[0], "companyNameKana"));
    assert.ok(Object.hasOwn(backup.companies[0], "purchaseTargetIds"));
    assert.equal(JSON.stringify(backup).includes('"temperature"'), false);
  });

  console.log(`PROTOTYPE3 DATA COMPATIBILITY RESULT: ${passed} tests passed`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
