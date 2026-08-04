"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const context = vm.createContext({
  window: {},
  console,
  Intl,
  Date,
  Math,
  Set,
  Map,
  Uint8Array,
  URL,
  Blob,
  setTimeout,
  clearTimeout
});
context.window.window = context.window;
context.window.Intl = Intl;
context.window.Date = Date;
context.window.Math = Math;
context.window.Set = Set;
context.window.Uint8Array = Uint8Array;

for (const relative of ["js/constants.js", "js/utils.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, relative), "utf8"), context, { filename: relative });
}

const K = context.window.KCN;
let passed = 0;

function test(name, callback) {
  try {
    callback();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function company(overrides = {}) {
  return K.normalizeCompany({
    id: overrides.id || K.uuid(),
    companyName: "横浜買取株式会社",
    contactName: "山田 太郎",
    phone: "045-123-4567",
    email: "INFO@EXAMPLE.JP",
    areas: ["横浜"],
    customArea: "横浜市南区中心",
    propertyTypes: ["土地", "戸建"],
    temperature: "積極的",
    isFavorite: true,
    memo: "再建築不可も相談可",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z",
    ...overrides
  });
}

test("NFKC・大小文字・全半角空白の正規化", () => {
  assert.equal(K.normalizeText("  ＡＢＣ　　株式会社  "), "abc 株式会社");
  assert.equal(K.normalizeCompanyKey(" ＡＢＣ　 株式会社 "), "abc株式会社");
});

test("電話番号の記号除去とtelリンク", () => {
  assert.equal(K.normalizePhone("（０４５）123-4567"), "0451234567");
  assert.equal(K.phoneHref("+81 (45) 123-4567"), "tel:+81451234567");
  assert.equal(K.phoneHref("未登録"), "");
});

test("メールのtrimと小文字化", () => {
  assert.equal(K.normalizeEmail(" INFO@EXAMPLE.JP "), "info@example.jp");
  assert.equal(K.isPlausibleEmail("info@example.jp"), true);
  assert.equal(K.isPlausibleEmail("invalid@"), false);
  assert.equal(K.mailtoHref("info@example.jp", "買取案件のご相談"), "mailto:info@example.jp?subject=%E8%B2%B7%E5%8F%96%E6%A1%88%E4%BB%B6%E3%81%AE%E3%81%94%E7%9B%B8%E8%AB%87");
  assert.equal(K.mailtoHref("a?bcc=x@example.jp", "相談").includes("?bcc="), false);
});

test("エリアだけで検索", () => {
  assert.equal(K.matchesCompany(company(), { areas: ["横浜"], propertyTypes: [] }), true);
  assert.equal(K.matchesCompany(company(), { areas: ["湘南"], propertyTypes: [] }), false);
});

test("広域エリア包含", () => {
  assert.equal(K.matchesCompany(company({ areas: ["全国"] }), { areas: ["横浜"] }), true);
  assert.equal(K.matchesCompany(company({ areas: ["関東"] }), { areas: ["東京都"] }), true);
  assert.equal(K.matchesCompany(company({ areas: ["横浜"] }), { areas: ["神奈川県全域"] }), false);
});

test("買取対象だけで検索・同項目内OR", () => {
  const c = company();
  assert.equal(K.matchesCompany(c, { propertyTypes: ["土地"] }), true);
  assert.equal(K.matchesCompany(c, { propertyTypes: ["区分マンション", "戸建"] }), true);
  assert.equal(K.matchesCompany(c, { propertyTypes: ["ビル", "底地"] }), false);
});

test("エリア＋対象はAND", () => {
  const c = company();
  assert.equal(K.matchesCompany(c, { areas: ["横浜"], propertyTypes: ["土地"] }), true);
  assert.equal(K.matchesCompany(c, { areas: ["横浜"], propertyTypes: ["ビル"] }), false);
  assert.equal(K.matchesCompany(c, { areas: ["湘南"], propertyTypes: ["土地"] }), false);
});

test("業者名・担当者・メモの横断検索", () => {
  const c = company();
  assert.equal(K.matchesCompany(c, { query: "横浜買取" }), true);
  assert.equal(K.matchesCompany(c, { query: "山田" }), true);
  assert.equal(K.matchesCompany(c, { query: "再建築不可" }), true);
  assert.equal(K.matchesCompany(c, { query: "山田 再建築不可" }), true);
  assert.equal(K.matchesCompany(c, { query: "山田 不一致" }), false);
});

test("電話番号は記号なしで検索", () => {
  assert.equal(K.matchesCompany(company(), { query: "0451234567" }), true);
  assert.equal(K.matchesCompany(company(), { query: "045-123-4567" }), true);
});

test("お気に入りと温度感の絞り込み", () => {
  const c = company();
  assert.equal(K.matchesCompany(c, { favoriteOnly: true, temperature: "積極的" }), true);
  assert.equal(K.matchesCompany(c, { favoriteOnly: true, temperature: "通常" }), false);
  assert.equal(K.matchesCompany(company({ isFavorite: false }), { favoriteOnly: true }), false);
});

test("検索結果はお気に入り・温度感・日本語名順", () => {
  const list = [
    company({ id: "3", companyName: "青空", isFavorite: false, temperature: "積極的" }),
    company({ id: "2", companyName: "赤坂", isFavorite: true, temperature: "通常" }),
    company({ id: "1", companyName: "青木", isFavorite: true, temperature: "積極的" })
  ].sort((a, b) => K.compareCompanies(a, b, "search"));
  assert.deepEqual(Array.from(list, (item) => item.id), ["1", "2", "3"]);
});

test("一覧の各並び替え", () => {
  const list = [
    company({ id: "a", companyName: "株式会社10", isFavorite: false, temperature: "現在休止", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-03T00:00:00.000Z" }),
    company({ id: "b", companyName: "株式会社2", isFavorite: true, temperature: "通常", createdAt: "2026-08-03T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" }),
    company({ id: "c", companyName: "株式会社1", isFavorite: false, temperature: "積極的", createdAt: "2026-08-02T00:00:00.000Z", updatedAt: "2026-08-02T00:00:00.000Z" })
  ];
  assert.deepEqual(Array.from([...list].sort((a, b) => K.compareCompanies(a, b, "name")), (x) => x.id), ["c", "b", "a"]);
  assert.equal([...list].sort((a, b) => K.compareCompanies(a, b, "favorite"))[0].id, "b");
  assert.equal([...list].sort((a, b) => K.compareCompanies(a, b, "temperature"))[0].id, "c");
  assert.equal([...list].sort((a, b) => K.compareCompanies(a, b, "updated"))[0].id, "a");
  assert.equal([...list].sort((a, b) => K.compareCompanies(a, b, "created"))[0].id, "b");
});

test("業者名・電話・メールの重複候補", () => {
  const existing = company({ id: "existing", companyName: "ＡＢＣ　不動産", phone: "045-123-4567", email: "INFO@EXAMPLE.JP" });
  const candidate = company({ id: "new", companyName: "abc 不動産", phone: "(045)1234567", email: "info@example.jp" });
  const duplicates = K.findDuplicates(candidate, [existing]);
  assert.equal(duplicates.length, 1);
  assert.deepEqual(Array.from(duplicates[0].reasons), ["業者名", "電話番号", "メール"]);
});

function backup(overrides = {}) {
  return {
    format: K.APP.backupFormat,
    appName: K.APP.displayName,
    appVersion: K.APP.version,
    schemaVersion: 1,
    exportedAt: "2026-08-04T00:00:00.000Z",
    companies: [company({ id: "backup-1" })],
    settings: { ...K.DEFAULT_SETTINGS, sampleInitialized: true },
    ...overrides
  };
}

test("正しいJSONバックアップを検証", () => {
  const validated = K.validateBackup(backup());
  assert.equal(validated.companies.length, 1);
  assert.equal(validated.companies[0].companyName, "横浜買取株式会社");
});

test("不正JSON構造を拒否", () => {
  assert.throws(() => K.validateBackup(backup({ format: "wrong" })));
  assert.throws(() => K.validateBackup(backup({ companies: {} })));
  assert.throws(() => K.validateBackup(backup({ companies: [{ companyName: "IDなし" }] })));
  assert.throws(() => K.validateBackup(backup({ companies: [{ id: "x", companyName: 123 }] })));
  assert.throws(() => K.validateBackup(backup({ companies: [company({ id: "same" }), company({ id: "same" })] })));
  assert.throws(() => K.validateBackup(backup({ companies: [company({ id: "same" }), company({ id: " same " })] })));
  assert.throws(() => K.validateBackup(backup({ schemaVersion: 2 })));
  assert.throws(() => K.validateBackup(backup({ settings: { defaultSort: "unknown" } })));
  assert.throws(() => K.validateBackup(backup({ settings: { areaOptions: [], propertyTypeOptions: ["土地"] } })));
});

test("CSVはUTF-8 BOM・指定列・引用符・改行・数式対策", () => {
  const csv = K.buildCsv([company({ companyName: '=HYPERLINK("x")', memo: 'カンマ, 引用符"\n改行' })]);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.match(csv, /^\uFEFF"業者名","担当者名","電話番号","メール","買取エリア","買取対象","温度感","お気に入り","メモ","登録日","更新日"\r\n/);
  assert.ok(csv.includes("'=HYPERLINK("));
  assert.ok(csv.includes('引用符""'));
  assert.ok(csv.includes("\n改行"));
});

test("サンプルは3社で識別可能", () => {
  assert.equal(K.SAMPLE_COMPANIES.length, 3);
  assert.equal(K.SAMPLE_COMPANIES.every((item) => item.isSample && item.companyName.includes("サンプル")), true);
});

console.log(`UNIT RESULT: ${passed} tests passed`);
