"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { performance } = require("node:perf_hooks");

const root = path.resolve(__dirname, "..");
const results = [];

function read(relative) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

function loadRuntime() {
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
    Promise,
    JSON,
    setTimeout,
    clearTimeout
  });
  Object.assign(context.window, {
    window: context.window,
    console,
    Intl,
    Date,
    Math,
    Set,
    Map,
    Uint8Array,
    URL,
    Blob,
    Promise,
    JSON,
    setTimeout,
    clearTimeout
  });
  for (const relative of ["js/constants.js", "js/utils.js"]) {
    vm.runInContext(read(relative), context, { filename: relative });
  }
  return context.window.KCN;
}

function measure(name, maximumMs, callback) {
  const startedAt = performance.now();
  const value = callback();
  const elapsedMs = performance.now() - startedAt;
  assert.ok(Number.isFinite(elapsedMs));
  assert.ok(elapsedMs < maximumMs, `${name}: ${elapsedMs.toFixed(2)}ms >= ${maximumMs}ms`);
  results.push({ name, elapsedMs: Number(elapsedMs.toFixed(2)), maximumMs });
  console.log(`PASS ${name}: ${elapsedMs.toFixed(2)}ms / ${maximumMs}ms`);
  return value;
}

function rawCompany(index) {
  return {
    id: `company-${index}`,
    companyName: `性能確認業者${String(index).padStart(4, "0")}`,
    contactName: `担当${index}`,
    phone: `045-${String(index % 10000).padStart(4, "0")}-0000`,
    email: `company-${index}@example.invalid`,
    areas: [index % 2 ? "横浜" : "東京都"],
    customArea: "",
    propertyTypes: [index % 2 ? "土地" : "戸建"],
    temperature: index % 3 === 0 ? "積極的" : (index % 3 === 1 ? "通常" : "現在休止"),
    isFavorite: index % 7 === 0,
    memo: `性能fixture ${index}`,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: `2026-08-${String((index % 3) + 1).padStart(2, "0")}T00:00:00.000Z`
  };
}

function rawCase(index, K) {
  const caseTypes = ["land", "detached-single-lot", "condo-vacant"];
  return {
    id: `case-${index}`,
    caseName: `性能確認案件 ${String(index).padStart(4, "0")}`,
    location: index % 2 ? "横浜市中区" : "東京都町田市",
    area: index % 2 ? "横浜" : "東京都",
    customArea: "",
    caseType: caseTypes[index % caseTypes.length],
    customCaseType: "",
    factors: [K.CASE_FACTOR_IDS[index % K.CASE_FACTOR_IDS.length], K.CASE_FACTOR_IDS[(index + 3) % K.CASE_FACTOR_IDS.length]],
    askingPrice: 10000000 + index * 10000,
    landArea: 80 + (index % 50),
    buildingArea: 60 + (index % 40),
    status: ["相談中", "買取打診中", "回答待ち", "回答済み", "成約", "見送り"][index % 6],
    memo: `案件fixture ${index}`,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: `2026-08-${String((index % 3) + 1).padStart(2, "0")}T00:00:00.000Z`
  };
}

function rawResponse(index, K) {
  const caseIndex = index % 1000;
  const companyIndex = (Math.floor(index / 1000) + caseIndex * 17) % 500;
  return {
    id: `response-${index}`,
    caseId: `case-${caseIndex}`,
    companyId: `company-${companyIndex}`,
    responseStatus: ["打診済み", "回答待ち", "金額回答", "条件付き", "見送り", "成約"][index % 6],
    responseAmount: index % 5 === 0 ? null : 9000000 + index * 1000,
    responseDate: `2026-08-${String((index % 28) + 1).padStart(2, "0")}`,
    responseFactors: [K.CASE_FACTOR_IDS[caseIndex % K.CASE_FACTOR_IDS.length]],
    responseReason: index % 4 === 0 ? "金額が合わない" : "",
    memo: `回答fixture ${index}`,
    followUpDate: index % 7 === 0 ? "2026-09-01" : "",
    companyNameSnapshot: `性能確認業者${String(companyIndex).padStart(4, "0")}`,
    contactNameSnapshot: `担当${companyIndex}`,
    phoneSnapshot: `045-${String(companyIndex % 10000).padStart(4, "0")}-0000`,
    emailSnapshot: `company-${companyIndex}@example.invalid`,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: `2026-08-${String((index % 3) + 1).padStart(2, "0")}T00:00:00.000Z`
  };
}

const sourceFiles = ["index.html", "css/styles.css", "js/constants.js", "js/utils.js", "js/db.js", "js/app.js", "sw.js"];
const totalSourceBytes = sourceFiles.reduce((sum, relative) => sum + fs.statSync(path.join(root, relative)).size, 0);
assert.ok(totalSourceBytes < 2 * 1024 * 1024, `app source budget exceeded: ${totalSourceBytes} bytes`);
console.log(`PASS app source budget: ${totalSourceBytes} bytes / 2097152 bytes`);

const K = measure("constants＋utils読込", 2000, loadRuntime);
for (const name of [
  "normalizeCompany",
  "normalizeCase",
  "normalizeCaseResponse",
  "matchesCase",
  "findSimilarCases",
  "buildCompanyHistory",
  "buildCaseResponsesCsv"
]) assert.equal(typeof K[name], "function", `KCN.${name}`);

const rawCompanies = Array.from({ length: 500 }, (_, index) => rawCompany(index));
const rawCases = Array.from({ length: 1000 }, (_, index) => rawCase(index, K));
const rawResponses = Array.from({ length: 10000 }, (_, index) => rawResponse(index, K));

K.normalizeCase(rawCases[0]);
K.normalizeCaseResponse(rawResponses[0]);

const companies = measure("500業者の正規化", 2000, () => rawCompanies.map((value) => K.normalizeCompany(value)));
const cases = measure("1,000案件の正規化", 2000, () => rawCases.map((value) => K.normalizeCase(value)));
const responses = measure("10,000回答の正規化", 5000, () => rawResponses.map((value) => K.normalizeCaseResponse(value)));

assert.equal(companies.length, 500);
assert.equal(cases.length, 1000);
assert.equal(responses.length, 10000);
assert.equal(new Set(responses.map((item) => `${item.caseId}\u0000${item.companyId}`)).size, 10000, "fixtureのcase/companyペアは一意であること");

K.matchesCase(cases[0], { query: "性能確認", caseType: "land", factors: [] });
measure("1,000案件×50回の検索", 3500, () => {
  let matched = 0;
  for (let iteration = 0; iteration < 50; iteration += 1) {
    for (const item of cases) {
      if (K.matchesCase(item, { query: "性能確認", caseType: iteration % 2 ? "land" : "", factors: [] })) matched += 1;
    }
  }
  assert.ok(matched > 0);
  return matched;
});

K.findSimilarCases(cases[0], cases, 10);
measure("1,000案件から25回の類似検索", 7000, () => {
  let total = 0;
  for (let index = 0; index < 25; index += 1) total += K.findSimilarCases(cases[index], cases, 10).length;
  assert.ok(total > 0);
  return total;
});

K.buildCompanyHistory("company-0", cases, responses);
const caseById = new Map(cases.map((item) => [item.id, item]));
const expectedHistory = new Map();
responses.forEach((response) => {
  const totals = expectedHistory.get(response.companyId) || { responses: 0, factors: 0 };
  totals.responses += 1;
  totals.factors += (caseById.get(response.caseId).factors || []).length;
  expectedHistory.set(response.companyId, totals);
});
measure("代表250業者の履歴集計（全体10,000回答）", 5000, () => {
  let total = 0;
  let caseTypeTotal = 0;
  let caseFactorTotal = 0;
  let expectedResponseTotal = 0;
  let expectedFactorTotal = 0;
  for (let index = 0; index < 250; index += 1) {
    const history = K.buildCompanyHistory(`company-${index}`, cases, responses);
    assert.equal(history.companyId, `company-${index}`);
    assert.ok(Array.isArray(history.items));
    const expected = expectedHistory.get(`company-${index}`) || { responses: 0, factors: 0 };
    assert.equal(history.total, expected.responses);
    expectedResponseTotal += expected.responses;
    expectedFactorTotal += expected.factors;
    history.items.forEach((item) => {
      assert.ok(item.case && item.case.caseType, "履歴から案件種別を集計できること");
      caseTypeTotal += 1;
      caseFactorTotal += item.case.factors.length;
    });
    total += history.total;
  }
  assert.equal(total, expectedResponseTotal);
  assert.equal(caseTypeTotal, expectedResponseTotal);
  assert.equal(caseFactorTotal, expectedFactorTotal);
  return total;
});

const sorted = measure("500業者の日本語名sort", 2000, () => [...companies].sort((a, b) => K.compareCompanies(a, b, "name")));
assert.equal(sorted.length, companies.length);

const csv = measure("1,000案件・10,000回答のCSV生成", 5000, () => K.buildCaseResponsesCsv(cases, responses, companies));
assert.equal(csv.charCodeAt(0), 0xfeff);
assert.ok(csv.startsWith("\uFEFF\"案件名\""));
assert.ok(csv.includes("\r\n"));
assert.ok(Buffer.byteLength(csv, "utf8") < 50 * 1024 * 1024, "CSV size budget exceeded");

console.log(JSON.stringify({
  suite: "qa-case-performance",
  sourceBytes: totalSourceBytes,
  fixture: { companies: companies.length, cases: cases.length, caseResponses: responses.length },
  results
}, null, 2));
