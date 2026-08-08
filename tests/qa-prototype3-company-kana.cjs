"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const context = vm.createContext({
  window: {}, console, Intl, Date, Math, Set, Map, Uint8Array, URL, Blob, Promise,
  setTimeout, clearTimeout
});
Object.assign(context.window, context, { window: context.window });
for (const file of ["js/constants.js", "js/utils.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
}
const K = context.window.KCN;
let passed = 0;

function test(name, callback) {
  try { callback(); passed += 1; console.log(`PASS ${name}`); }
  catch (error) { console.error(`FAIL ${name}`); throw error; }
}

function csvHeader(csv) {
  return csv.slice(1).split("\r\n", 1)[0].split(",").map((field) => field.replace(/^"|"$/g, ""));
}

test("kana utility converts katakana without guessing kanji", () => {
  assert.equal(typeof K.katakanaToHiragana, "function");
  assert.equal(K.katakanaToHiragana("リバブル"), "りばぶる");
  assert.equal(K.katakanaToHiragana("オープンハウス"), "おーぷんはうす");
  assert.equal(K.katakanaToHiragana("株式会社日税不動産"), "株式会社日税不動産", "kanji must not be guessed");
  assert.equal(K.katakanaToHiragana("ＡＢＣ・カンパニー"), "ABC・かんぱにー", "NFKC width normalization is intentional");
});

test("companyNameKana is optional, editable, normalized, and persisted", () => {
  const empty = K.normalizeCompany({ id: "empty", companyName: "日税不動産" });
  assert.equal(empty.companyNameKana, "");
  const company = K.normalizeCompany({
    id: "kana", companyName: "株式会社日税不動産情報センター", companyNameKana: " カブシキガイシャ　ニチゼイフドウサンジョウホウセンター "
  });
  assert.equal(company.companyNameKana, "かぶしきがいしゃ にちぜいふどうさんじょうほうせんたー");
  assert.equal(K.normalizeCompany(company).companyNameKana, company.companyNameKana, "normalization must be idempotent");
});

test("search normalization unifies width, case, spaces, and katakana/hiragana", () => {
  assert.equal(typeof K.normalizeSearchText, "function");
  assert.equal(K.normalizeSearchText("　リバブル　ＡＢＣ  "), "りばぶる abc");
  assert.equal(K.normalizeSearchText("りばぶる abc"), "りばぶる abc");
});

test("company free-word search includes companyNameKana", () => {
  const company = K.normalizeCompany({
    id: "search-kana", companyName: "東急リバブル", companyNameKana: "とうきゅうりばぶる", memo: ""
  });
  assert.equal(K.matchesCompany(company, { query: "トウキュウ リバブル" }), true);
  assert.equal(K.matchesCompany(company, { query: "とうきゅうりばぶる" }), true);
  assert.equal(K.matchesCompany(company, { query: "みつい" }), false);
});

test("name sort uses kana first and company name as fallback", () => {
  const companies = [
    K.normalizeCompany({ id: "z", companyName: "青木不動産", companyNameKana: "わかば" }),
    K.normalizeCompany({ id: "a", companyName: "Ｚ不動産", companyNameKana: "あおぞら" }),
    K.normalizeCompany({ id: "fallback", companyName: "いろは不動産", companyNameKana: "" })
  ];
  const sorted = companies.sort((a, b) => K.compareCompanies(a, b, "name"));
  assert.deepEqual(Array.from(sorted, (item) => item.id), ["a", "fallback", "z"]);
});

test("company CSV contains the kana column and value", () => {
  const company = K.normalizeCompany({ id: "csv-kana", companyName: "日税不動産", companyNameKana: "にちぜいふどうさん" });
  const csv = K.buildCsv([company]);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.deepEqual(csvHeader(csv).slice(0, 3), ["業者名", "業者名よみがな", "担当者名"]);
  assert.match(csv, /にちぜいふどうさん/);
});

test("case-response CSV places kana immediately after company name", () => {
  const csv = K.buildCaseResponsesCsv([], [], []);
  const header = csvHeader(csv);
  const companyIndex = header.indexOf("業者名");
  assert.ok(companyIndex >= 0);
  assert.equal(header[companyIndex + 1], "業者名よみがな");
  assert.equal(header.length, 24);
});

console.log(`PROTOTYPE3 COMPANY KANA RESULT: ${passed} tests passed`);
