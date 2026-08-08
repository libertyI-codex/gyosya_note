"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const context = vm.createContext({ window: {}, console, Intl, Date, Math, Set, Map, Uint8Array, URL, Blob, setTimeout, clearTimeout });
Object.assign(context.window, { window: context.window, Intl, Date, Math, Set, Map, Uint8Array });
for (const file of ["js/constants.js", "js/utils.js"]) vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
const K = context.window.KCN;
let passed = 0;

function test(name, fn) {
  try { fn(); passed += 1; console.log(`PASS ${name}`); }
  catch (error) { console.error(`FAIL ${name}`); throw error; }
}

function makeCase(overrides = {}) {
  return K.normalizeCase({ id: "case-1", caseName: "横浜市南区・古家付き土地", location: "横浜市南区", area: "横浜", caseType: "detached-single-lot", factors: ["development", "rebuild-impossible"], askingPrice: 30000000, landArea: 100.5, buildingArea: 72.25, status: "相談中", memo: "概要", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-02T00:00:00.000Z", ...overrides });
}

function makeResponse(overrides = {}) {
  return K.normalizeCaseResponse({ id: "response-1", caseId: "case-1", companyId: "company-1", responseStatus: "打診済み", responseAmount: null, responseDate: "", responseFactors: [], responseReason: "", memo: "", followUpDate: "", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-02T00:00:00.000Z", ...overrides });
}

test("Prototype3の版・DB版", () => {
  assert.equal(K.APP.versionNumber, "1.0.0-prototype.3");
  assert.equal(K.APP.schemaVersion, 3);
  assert.equal(K.APP.dbVersion, 2);
});

test("案件種別10項目は内部IDと表示を分離", () => {
  assert.equal(K.CASE_TYPES.length, 10);
  assert.deepEqual(Array.from(K.CASE_TYPES, (item) => item.label), ["戸建1宅地", "戸建分譲", "一棟収益", "区分M（空室）", "区分M（OC）", "土地", "事業用地", "店舗・事務所", "ビル", "その他"]);
  assert.equal(K.CASE_TYPES.every((item) => item.id && item.label && item.id !== item.label), true);
});

test("指定4カテゴリ・列挙17個別要因", () => {
  assert.equal(K.CASE_FACTOR_GROUPS.length, 4);
  assert.equal(K.CASE_FACTOR_IDS.length, 17);
  assert.ok(K.CASE_FACTOR_IDS.includes("rebuild-impossible"));
  assert.equal(K.CASE_FACTOR_LABELS["accident-psychological-defect"], "事故・心理的瑕疵");
});

test("案件名だけで正規化・未選択種別を維持", () => {
  const item = K.normalizeCase({ id: "minimal", caseName: " 案件名だけ ", caseType: "", askingPrice: null });
  assert.equal(item.caseName, "案件名だけ");
  assert.equal(item.caseType, "");
  assert.deepEqual(Array.from(item.factors), []);
  assert.equal(item.status, "相談中");
});

test("案件の全項目と0円・小数面積", () => {
  const item = makeCase({ askingPrice: 0, landArea: 0, buildingArea: 88.25 });
  assert.equal(item.askingPrice, 0);
  assert.equal(item.landArea, 0);
  assert.equal(item.buildingArea, 88.25);
  assert.deepEqual(Array.from(item.factors), ["development", "rebuild-impossible"]);
});

test("案件状況6項目と初期値", () => {
  assert.deepEqual(Array.from(K.CASE_STATUSES), ["相談中", "買取打診中", "回答待ち", "回答済み", "成約", "見送り"]);
  assert.equal(K.normalizeCase({ caseName: "x" }).status, "相談中");
});

test("回答状況6項目と初期値", () => {
  assert.deepEqual(Array.from(K.RESPONSE_STATUSES), ["打診済み", "回答待ち", "金額回答", "条件付き", "見送り", "成約"]);
  assert.equal(makeResponse().responseStatus, "打診済み");
});

test("回答の任意金額はnullと0を区別", () => {
  assert.equal(makeResponse({ responseAmount: null }).responseAmount, null);
  assert.equal(makeResponse({ responseAmount: 0 }).responseAmount, 0);
});

test("回答理由9項目と日付", () => {
  assert.equal(K.RESPONSE_REASONS.length, 9);
  const response = makeResponse({ responseReason: "条件付きなら検討可", responseDate: "2026-08-04", followUpDate: "2026-08-11" });
  assert.equal(response.responseReason, "条件付きなら検討可");
  assert.equal(response.followUpDate, "2026-08-11");
});

test("回答関連要因は有効IDを保持", () => {
  const response = makeResponse({ responseFactors: ["development", "leasehold"] });
  assert.deepEqual(Array.from(response.responseFactors), ["development", "leasehold"]);
});

test("回答状況順は成約→金額→条件→待ち→打診→見送り", () => {
  const statuses = ["見送り", "打診済み", "回答待ち", "条件付き", "金額回答", "成約"];
  const sorted = statuses.map((status, index) => makeResponse({ id: String(index), responseStatus: status })).sort((a, b) => K.compareResponses(a, b, "status"));
  assert.deepEqual(Array.from(sorted, (item) => item.responseStatus), ["成約", "金額回答", "条件付き", "回答待ち", "打診済み", "見送り"]);
});

test("同じ回答状況は金額降順・未入力末尾", () => {
  const sorted = [null, 10000000, 20000000].map((amount, index) => makeResponse({ id: String(index), responseStatus: "金額回答", responseAmount: amount })).sort((a, b) => K.compareResponses(a, b, "status"));
  assert.deepEqual(Array.from(sorted, (item) => item.responseAmount), [20000000, 10000000, null]);
});

test("類似案件は種別を最優先し自分を除外", () => {
  const source = makeCase();
  const candidates = [
    makeCase({ id: "same", caseType: "detached-single-lot", factors: [], area: "県央" }),
    makeCase({ id: "factors", caseType: "land", factors: ["development", "rebuild-impossible"], area: "横浜" }),
    source
  ];
  const result = K.findSimilarCases(source, candidates, 10);
  assert.equal(result[0].id, "same");
  assert.equal(result.some((item) => item.id === source.id), false);
});

test("類似案件は次に要因数、次にエリア", () => {
  const source = makeCase();
  const result = K.findSimilarCases(source, [
    makeCase({ id: "area", caseType: "land", factors: [], area: "横浜" }),
    makeCase({ id: "factor", caseType: "land", factors: ["development"], area: "県央" })
  ], 10);
  assert.equal(result[0].id, "factor");
});

test("業者履歴は案件を紐付けて状況集計", () => {
  const history = K.buildCompanyHistory("company-1", [makeCase()], [makeResponse({ responseStatus: "金額回答", responseFactors: ["development"] })]);
  assert.equal(history.total, 1);
  assert.equal(history.statusCounts["金額回答"], 1);
  assert.equal(history.items[0].case.caseType, "detached-single-lot");
});

test("案件検索はtype・factor・area・queryをAND", () => {
  const item = makeCase();
  assert.equal(K.matchesCase(item, { area: "横浜", caseType: "detached-single-lot", factor: "development", query: "南区 概要" }), true);
  assert.equal(K.matchesCase(item, { area: "横浜", caseType: "land" }), false);
});

test("案件回答CSVは24列・回答0件も1行", () => {
  const csv = K.buildCaseResponsesCsv([makeCase()], [], []);
  const lines = csv.slice(1).split("\r\n");
  assert.equal(lines.length, 2);
  assert.equal((lines[0].match(/","/g) || []).length + 1, 24);
  assert.ok(lines[1].includes("横浜市南区・古家付き土地"));
});

test("案件回答CSVはBOM・CRLF・数式注入対策", () => {
  const csv = K.buildCaseResponsesCsv([makeCase({ caseName: "=1+1" })], [], []);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.ok(csv.includes("\r\n"));
  assert.ok(csv.includes("'=1+1"));
});

console.log(`CASES UNIT RESULT: ${passed} tests passed`);
