"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const node = process.execPath;
let passed = 0;

function read(relative) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

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

function runtime() {
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
  for (const relative of ["js/constants.js", "js/utils.js", "js/db.js"]) {
    vm.runInContext(read(relative), context, { filename: relative });
  }
  return context.window.KCN;
}

function valuesFromDataAttribute(html, attribute) {
  const expression = new RegExp(`${attribute}=["']([^"']+)["']`, "g");
  return [...html.matchAll(expression)].map((match) => match[1]);
}

function parseCsvRow(line) {
  const fields = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quoted && character === '"' && line[index + 1] === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      fields.push(field);
      field = "";
    } else {
      field += character;
    }
  }
  fields.push(field);
  assert.equal(quoted, false, "CSVの引用符が閉じていること");
  return fields;
}

function v2BackupFixture(K) {
  const company = K.normalizeCompany({ id: "qa-company", companyName: "QA業者" });
  const caseValue = K.normalizeCase({
    id: "qa-case",
    caseName: "QA案件",
    caseType: "land",
    factors: ["development"],
    status: "相談中"
  });
  const response = K.normalizeCaseResponse({
    id: "qa-response",
    caseId: caseValue.id,
    companyId: company.id,
    responseStatus: "打診済み",
    responseFactors: ["development"]
  });
  return {
    format: K.APP.backupFormat,
    appName: K.APP.displayName,
    appVersion: K.APP.version,
    schemaVersion: 2,
    exportedAt: "2026-08-04T00:00:00.000Z",
    companies: [company],
    settings: { ...K.DEFAULT_SETTINGS, schemaVersion: 2, sampleInitialized: true },
    cases: [caseValue],
    caseResponses: [response]
  };
}

const expectedCaseStatuses = ["相談中", "買取打診中", "回答待ち", "回答済み", "成約", "見送り"];
const expectedResponseStatuses = ["打診済み", "回答待ち", "金額回答", "条件付き", "見送り", "成約"];
const expectedResponseReasons = [
  "金額が合わない",
  "エリア外",
  "物件種別対象外",
  "個別要因が難しい",
  "現在仕入れ休止",
  "社内稟議否決",
  "他案件を優先",
  "条件付きなら検討可",
  "その他"
];
const expectedCaseResponseHeaders = [
  "案件名",
  "所在地",
  "エリア",
  "案件種別",
  "個別要因",
  "売主希望額",
  "土地面積㎡",
  "建物面積㎡",
  "案件状況",
  "業者名",
  "担当者名",
  "回答状況",
  "回答金額",
  "回答日",
  "回答理由",
  "回答関連要因",
  "次回確認日",
  "回答メモ",
  "案件メモ",
  "案件登録日",
  "案件更新日",
  "回答登録日",
  "回答更新日"
];

test("Prototype2必須ファイルと全JavaScriptの構文", () => {
  const required = [
    "index.html",
    "css/styles.css",
    "js/constants.js",
    "js/utils.js",
    "js/db.js",
    "js/app.js",
    "manifest.webmanifest",
    "sw.js",
    "tests/qa-cases-static.cjs",
    "tests/qa-case-performance.cjs",
    "docs/QA-MATRIX-PROTOTYPE2.md"
  ];
  required.forEach((relative) => assert.equal(fs.existsSync(path.join(root, relative)), true, relative));
  for (const relative of [
    "js/constants.js",
    "js/utils.js",
    "js/db.js",
    "js/app.js",
    "sw.js",
    "tests/qa-cases-static.cjs",
    "tests/qa-case-performance.cjs"
  ]) {
    execFileSync(node, ["--check", path.join(root, relative)], { stdio: "pipe" });
  }
});

test("APP・schema・DB・cacheがPrototype2契約", () => {
  const K = runtime();
  assert.equal(K.APP.displayName, "買取業者ノート");
  assert.equal(K.APP.internalName, "Kaitori Company Note");
  assert.equal(K.APP.version, "Ver.1.0 試作2");
  assert.equal(K.APP.versionNumber, "1.0.0-prototype.2");
  assert.equal(K.APP.schemaVersion, 2);
  assert.equal(K.APP.dbVersion, 2);
  assert.equal(K.APP.cacheName, "kaitori-company-note-v1-prototype2");
  assert.equal(K.APP.caseStore, "cases");
  assert.equal(K.APP.responseStore, "caseResponses");
  assert.ok(read("sw.js").includes(`"${K.APP.cacheName}"`), "APPとService Workerのcache名を一致させてください");
});

test("固定status・reason列挙が仕様どおり", () => {
  const K = runtime();
  assert.equal(K.CASE_TYPE_OPTIONS.length, 10, "案件種別は10候補です");
  assert.equal(K.CASE_FACTOR_GROUPS.length, 4, "個別要因は4グループです");
  assert.equal(K.CASE_FACTOR_OPTIONS.length, 17, "個別要因は17候補です");
  assert.equal(new Set(K.CASE_TYPE_IDS).size, 10, "案件種別IDは一意です");
  assert.equal(new Set(K.CASE_FACTOR_IDS).size, 17, "個別要因IDは一意です");
  assert.deepEqual(Array.from(K.CASE_STATUSES || []), expectedCaseStatuses);
  assert.deepEqual(Array.from(K.RESPONSE_STATUSES || []), expectedResponseStatuses);
  assert.deepEqual(Array.from(K.RESPONSE_REASONS || []), expectedResponseReasons);
});

test("cases・caseResponses storesと参照index契約", () => {
  const source = read("js/db.js");
  for (const token of ["cases", "caseResponses", "caseId", "companyId", "caseType", "status", "responseStatus"]) {
    assert.ok(source.includes(token), `DB実装に ${token} が必要です`);
  }
  assert.match(source, /createObjectStore\s*\(/, "v2 store作成処理が必要です");
  assert.match(source, /createIndex\s*\(/, "v2 index作成処理が必要です");
  assert.match(source, /\[\s*["']caseId["']\s*,\s*["']companyId["']\s*\]/, "caseId＋companyIdの複合indexが必要です");
  assert.match(source, /unique\s*:\s*true/, "caseId＋companyIdの重複をDBでも拒否してください");
});

test("Prototype2の公開DB API契約", () => {
  const K = runtime();
  const expected = [
    "getAllCases",
    "getCase",
    "putCase",
    "deleteCaseWithResponses",
    "getCaseResponses",
    "putCaseResponse",
    "deleteCaseResponse",
    "setCompanyArchived",
    "archiveCompany",
    "restoreCompany",
    "getArchivedCompanies"
  ];
  expected.forEach((name) => assert.equal(typeof K.db[name], "function", `KCN.db.${name}`));
});

test("案件・回答・履歴・類似・CSVの公開純粋関数契約", () => {
  const K = runtime();
  const expected = [
    "normalizeCase",
    "normalizeCaseResponse",
    "matchesCase",
    "findSimilarCases",
    "buildCompanyHistory",
    "buildCaseResponsesCsv"
  ];
  expected.forEach((name) => assert.equal(typeof K[name], "function", `KCN.${name}`));
  assert.equal(typeof K.buildCaseResponseCsv, "function", "単数形CSV aliasも維持してください");
});

test("案件・回答の最小schemaを正規化できる", () => {
  const K = runtime();
  const companyValue = K.normalizeCompany({ id: "qa-company", companyName: "QA業者" });
  for (const key of ["isArchived", "archivedAt"]) assert.ok(Object.hasOwn(companyValue, key), `company.${key}`);
  assert.equal(companyValue.isArchived, false);

  const caseValue = K.normalizeCase({ id: "qa-case", caseName: "QA案件" });
  for (const key of [
    "id", "caseName", "location", "area", "customArea", "caseType", "customCaseType", "factors",
    "askingPrice", "landArea", "buildingArea", "status", "memo", "createdAt", "updatedAt"
  ]) assert.ok(Object.hasOwn(caseValue, key), `case.${key}`);
  assert.equal(caseValue.caseName, "QA案件");
  assert.ok(Array.isArray(caseValue.factors));

  const responseValue = K.normalizeCaseResponse({
    id: "qa-response",
    caseId: "qa-case",
    companyId: "qa-company",
    responseStatus: "打診済み"
  });
  for (const key of [
    "id", "caseId", "companyId", "responseStatus", "responseAmount", "responseDate", "responseFactors",
    "responseReason", "memo", "followUpDate", "companyNameSnapshot", "contactNameSnapshot",
    "phoneSnapshot", "emailSnapshot", "createdAt", "updatedAt"
  ]) assert.ok(Object.hasOwn(responseValue, key), `caseResponse.${key}`);
  assert.ok(Array.isArray(responseValue.responseFactors));
});

test("業者履歴から案件種別・個別要因を集計できる", () => {
  const K = runtime();
  const companyId = "qa-history-company";
  const caseA = K.normalizeCase({
    id: "qa-history-case-a",
    caseName: "QA履歴案件A",
    caseType: "land",
    factors: ["old-earthquake-standard", "development"]
  });
  const caseB = K.normalizeCase({
    id: "qa-history-case-b",
    caseName: "QA履歴案件B",
    caseType: "detached-single-lot",
    factors: ["development"]
  });
  const responses = [caseA, caseB].map((caseValue, index) => K.normalizeCaseResponse({
    id: `qa-history-response-${index}`,
    caseId: caseValue.id,
    companyId,
    responseStatus: "打診済み"
  }));
  const history = K.buildCompanyHistory(companyId, [caseA, caseB], responses);
  const typeCounts = {};
  const factorCounts = {};
  history.items.forEach((item) => {
    assert.ok(item.case, "履歴itemに案件情報が必要です");
    typeCounts[item.case.caseType] = (typeCounts[item.case.caseType] || 0) + 1;
    item.case.factors.forEach((factor) => {
      factorCounts[factor] = (factorCounts[factor] || 0) + 1;
    });
  });
  assert.deepEqual(typeCounts, { land: 1, "detached-single-lot": 1 });
  assert.deepEqual(factorCounts, { "old-earthquake-standard": 1, development: 2 });
});

test("案件検索・類似候補の純粋関数契約", () => {
  const K = runtime();
  const target = K.normalizeCase({
    id: "qa-similar-target",
    caseName: "ＡＢＣ　案件",
    location: "横浜市中区",
    area: "横浜",
    caseType: "land",
    factors: ["development", "narrow-lot"],
    status: "回答待ち",
    memo: "至急相談"
  });
  const close = K.normalizeCase({
    id: "qa-similar-close",
    caseName: "類似案件",
    area: "横浜",
    caseType: "land",
    factors: ["development"]
  });
  const far = K.normalizeCase({
    id: "qa-similar-far",
    caseName: "別案件",
    area: "東京都",
    caseType: "building",
    factors: ["farmland"]
  });
  assert.equal(K.matchesCase(target, { query: "abc 案件", areas: ["横浜"], caseTypes: ["land"] }), true);
  assert.equal(K.matchesCase(target, { factors: ["farmland", "narrow-lot"], statuses: ["回答待ち"] }), true, "同項目内はORです");
  assert.equal(K.matchesCase(target, { areas: ["東京都"], caseTypes: ["land"] }), false, "異なる項目間はANDです");
  const similar = K.findSimilarCases(target, [target, far, close], 10);
  assert.equal(similar.some((item) => item.id === target.id), false, "自分自身を除外します");
  assert.equal(similar[0].id, close.id, "種別・要因・エリアが近い案件を優先します");
});

test("v2 backup schemaとv1読込互換の静的契約", () => {
  const K = runtime();
  const v2 = K.validateBackup(v2BackupFixture(K));
  assert.equal(v2.companies.length, 1);
  assert.equal(v2.cases.length, 1);
  assert.equal(v2.caseResponses.length, 1);

  const v1 = K.validateBackup({
    format: K.APP.backupFormat,
    appName: K.APP.displayName,
    appVersion: "Ver.1.0 試作1",
    schemaVersion: 1,
    exportedAt: "2026-08-04T00:00:00.000Z",
    companies: [],
    settings: { ...K.DEFAULT_SETTINGS, schemaVersion: 1, sampleInitialized: true }
  });
  assert.deepEqual(Array.from(v1.cases || []), []);
  assert.deepEqual(Array.from(v1.caseResponses || []), []);
});

test("v2 backupは不正参照と重複ペアを全件検証前に拒否", () => {
  const K = runtime();
  const base = v2BackupFixture(K);
  const originalJson = JSON.stringify(base);
  const unknownCase = JSON.parse(originalJson);
  unknownCase.caseResponses[0].caseId = "missing-case";
  assert.throws(() => K.validateBackup(unknownCase), /案件/);
  const unknownCompany = JSON.parse(originalJson);
  unknownCompany.caseResponses[0].companyId = "missing-company";
  assert.throws(() => K.validateBackup(unknownCompany), /業者/);
  const duplicatePair = JSON.parse(originalJson);
  duplicatePair.caseResponses.push({ ...duplicatePair.caseResponses[0], id: "qa-response-duplicate" });
  assert.throws(() => K.validateBackup(duplicatePair), /重複/);
  assert.equal(JSON.stringify(base), originalJson, "検証失敗で入力fixtureを変更しません");
});

test("案件・回答CSVの23列ヘッダー契約", () => {
  const K = runtime();
  const csv = K.buildCaseResponsesCsv([], [], []);
  assert.equal(csv.charCodeAt(0), 0xfeff, "UTF-8 BOMが必要です");
  const header = csv.slice(1).split(/\r?\n/, 1)[0];
  assert.deepEqual(parseCsvRow(header), expectedCaseResponseHeaders);
  assert.ok(csv.includes("\r\n") || csv === `\uFEFF${header}`, "CSVはCRLFを使用してください");
});

test("回答0件の案件CSVとCSV injection対策", () => {
  const K = runtime();
  const caseValue = K.normalizeCase({
    id: "qa-csv-case",
    caseName: "=1+1",
    caseType: "land",
    status: "相談中"
  });
  const csv = K.buildCaseResponsesCsv([caseValue], [], []);
  const lines = csv.slice(1).split("\r\n");
  assert.equal(lines.length, 2, "回答0件でも案件を1行出力します");
  const row = parseCsvRow(lines[1]);
  assert.equal(row.length, expectedCaseResponseHeaders.length);
  assert.equal(row[0], "'=1+1", "数式先頭文字を無害化します");
  assert.equal(row[9], "", "回答のない案件は業者列を空欄にします");
  assert.equal(row[11], "", "回答のない案件は回答状況を空欄にします");
});

test("下部ナビと主要screenは4項目だけ", () => {
  const html = read("index.html");
  const navValues = valuesFromDataAttribute(html, "data-nav");
  const screenValues = valuesFromDataAttribute(html, "data-screen");
  assert.deepEqual([...new Set(navValues)], ["search", "cases", "list", "other"]);
  assert.deepEqual([...new Set(screenValues)], ["search", "cases", "list", "other"]);
  assert.equal(navValues.length, 4, "下部ナビbuttonは4個だけにしてください");
});

test("相対パス・外部依存なし・file起動互換", () => {
  const appFiles = [
    "index.html", "css/styles.css", "js/constants.js", "js/utils.js", "js/db.js", "js/app.js",
    "manifest.webmanifest", "sw.js"
  ];
  appFiles.forEach((relative) => assert.equal(/https?:\/\//i.test(read(relative)), false, relative));
  const html = read("index.html");
  assert.equal(/<script[^>]+type=["']module/i.test(html), false);
  assert.equal(/(?:src|href)=["']\/(?!\/)/.test(html), false);
  assert.ok(html.includes("viewport-fit=cover"));
  const app = read("js/app.js");
  assert.match(app, /location\.protocol/);
  assert.ok(app.includes("http:") && app.includes("https:"), "SW登録をHTTP(S)へ限定してください");
});

test("PWA cacheは同一origin GETだけを扱う", () => {
  const K = runtime();
  const sw = read("sw.js");
  assert.ok(sw.includes(K.APP.cacheName));
  assert.match(sw, /request\.method\s*!==?\s*["']GET["']/);
  assert.match(sw, /url\.origin\s*!==?\s*self\.location\.origin/);
  assert.match(sw, /url\.protocol/);
  assert.ok(sw.includes("http:") && sw.includes("https:"), "cache対象protocolをHTTP(S)へ限定してください");
  for (const relative of ["./index.html", "./css/styles.css", "./js/constants.js", "./js/utils.js", "./js/db.js", "./js/app.js"]) {
    assert.ok(sw.includes(relative), `APP_SHELL: ${relative}`);
  }
});

console.log(`PROTOTYPE2 STATIC RESULT: ${passed} tests passed`);
