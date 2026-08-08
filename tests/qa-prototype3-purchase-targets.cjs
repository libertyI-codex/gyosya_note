"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const context = vm.createContext({ window: {}, console, Intl, Date, Math, Set, Map, Uint8Array, URL, Blob, Promise, setTimeout, clearTimeout });
Object.assign(context.window, context, { window: context.window });
for (const file of ["js/constants.js", "js/utils.js"]) vm.runInContext(read(file), context, { filename: file });
const K = context.window.KCN;
let passed = 0;

function test(name, callback) {
  try { callback(); passed += 1; console.log(`PASS ${name}`); }
  catch (error) { console.error(`FAIL ${name}`); throw error; }
}

function sorted(values) {
  return Array.from(values).sort();
}

test("one catalog supplies ten case types and seventeen factors", () => {
  assert.equal(K.CASE_TYPE_OPTIONS.length, 10);
  assert.equal(K.FACTOR_CATEGORIES.length, 4);
  assert.equal(K.CASE_FACTOR_OPTIONS.length, 17);
  assert.equal(new Set(K.CASE_TYPE_IDS).size, 10);
  assert.equal(new Set(K.CASE_FACTOR_IDS).size, 17);
  assert.equal(new Set([...K.CASE_TYPE_IDS, ...K.CASE_FACTOR_IDS]).size, 27);
  assert.strictEqual(K.FACTOR_CATEGORIES, K.CASE_FACTOR_GROUPS, "factor categories must be aliases of one source, not duplicate arrays");
});

test("purchase target groups are derived from the shared case/factor catalogs", () => {
  assert.ok(Array.isArray(K.PURCHASE_TARGET_OPTIONS));
  const optionIds = K.PURCHASE_TARGET_OPTIONS.flatMap((group) => group.options).map((option) => option.id);
  assert.deepEqual(sorted(optionIds), sorted([...K.CASE_TYPE_IDS, ...K.CASE_FACTOR_IDS]));
  assert.deepEqual(sorted(K.PURCHASE_TARGET_IDS), sorted(optionIds));
  assert.equal(K.PURCHASE_TARGET_IDS.length, 27);
});

test("All selects 9 non-other case types plus all 17 factors", () => {
  const expected = [...K.CASE_TYPE_IDS.filter((id) => id !== "other"), ...K.CASE_FACTOR_IDS];
  assert.deepEqual(Array.from(K.PURCHASE_TARGET_ALL_IDS), expected);
  assert.equal(K.PURCHASE_TARGET_ALL_IDS.length, 26);
  assert.equal(K.PURCHASE_TARGET_ALL_IDS.includes("other"), false);
  assert.equal(K.PURCHASE_TARGET_ALL_IDS.includes("all"), false, "All is a virtual action, not persisted business data");
});

test("legacy purchase targets map only when unambiguous", () => {
  const migrated = K.migrateLegacyPurchaseTargets([
    "土地", "戸建", "区分マンション", "一棟アパート", "一棟マンション", "一棟収益",
    "店舗・事務所", "ビル", "借地", "底地", "再建築不可", "市街化調整区域", "事故・訳あり", "任意売却"
  ], [], []);
  const expectedMapped = [
    "land", "detached-single-lot", "income-building", "shop-office", "building", "leasehold",
    "leased-land-owner-right", "rebuild-impossible", "adjustment-zone", "accident-psychological-defect"
  ];
  expectedMapped.forEach((id) => assert.ok(migrated.purchaseTargetIds.includes(id), `mapped target: ${id}`));
  assert.equal(migrated.purchaseTargetIds.includes("condo-vacant"), false);
  assert.equal(migrated.purchaseTargetIds.includes("condo-occupied"), false);
  assert.ok(migrated.legacyPurchaseTargets.includes("区分マンション"));
  assert.ok(migrated.legacyPurchaseTargets.includes("任意売却"));
});

test("legacy migration is idempotent and never duplicates retained information", () => {
  const once = K.migrateLegacyPurchaseTargets(["土地", "一棟アパート", "区分マンション"], ["land"], ["区分マンション"]);
  const twice = K.migrateLegacyPurchaseTargets(["土地", "一棟アパート", "区分マンション"], once.purchaseTargetIds, once.legacyPurchaseTargets);
  assert.deepEqual(sorted(twice.purchaseTargetIds), sorted(once.purchaseTargetIds));
  assert.deepEqual(sorted(twice.legacyPurchaseTargets), sorted(once.legacyPurchaseTargets));
  assert.equal(new Set(twice.purchaseTargetIds).size, twice.purchaseTargetIds.length);
  assert.equal(new Set(twice.legacyPurchaseTargets).size, twice.legacyPurchaseTargets.length);
});

test("normalizeCompany retains new and legacy target data plus custom supplement", () => {
  const company = K.normalizeCompany({
    id: "targets", companyName: "特殊用途社", propertyTypes: ["土地", "区分マンション"],
    purchaseTargetIds: ["forest", "other"], customPurchaseTarget: "ホテル・工場", legacyPurchaseTargets: ["独自旧項目"]
  });
  ["land", "forest", "other"].forEach((id) => assert.ok(company.purchaseTargetIds.includes(id)));
  assert.deepEqual(sorted(company.legacyPurchaseTargets), sorted(["区分マンション", "独自旧項目"]));
  assert.equal(company.customPurchaseTarget, "ホテル・工場");
  assert.equal(K.normalizeCompany(company).customPurchaseTarget, "ホテル・工場");
});

test("company target search uses common IDs and custom supplement", () => {
  const company = K.normalizeCompany({
    id: "search-target", companyName: "対象社", purchaseTargetIds: ["detached-single-lot", "development"],
    customPurchaseTarget: "医療施設・倉庫"
  });
  assert.equal(K.matchesCompany(company, { propertyTypes: ["detached-single-lot"] }), true);
  assert.equal(K.matchesCompany(company, { propertyTypes: ["development"] }), true);
  assert.equal(K.matchesCompany(company, { propertyTypes: ["land"] }), false);
  assert.equal(K.matchesCompany(company, { query: "医療施設" }), true);
});

test("recommendation source uses type, factors, history, favorite, and success but never temperature", () => {
  const source = read("js/cases-ui.js");
  for (const token of ["purchaseTargetIds", "caseType", "factors", "isFavorite", "similar", "成約"]) {
    assert.ok(source.includes(token), `recommendation signal is required: ${token}`);
  }
  assert.doesNotMatch(source, /temperature|TEMPERATURES/i);
});

console.log(`PROTOTYPE3 PURCHASE TARGETS RESULT: ${passed} tests passed`);
