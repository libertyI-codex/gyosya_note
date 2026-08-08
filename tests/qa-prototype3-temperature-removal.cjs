"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const context = vm.createContext({ window: {}, console, Intl, Date, Math, Set, Map, Uint8Array, URL, Blob, Promise, JSON, setTimeout, clearTimeout });
Object.assign(context.window, context, { window: context.window });
for (const file of ["js/constants.js", "js/utils.js", "js/db.js"]) vm.runInContext(read(file), context, { filename: file });
const K = context.window.KCN;
let passed = 0;

function test(name, callback) {
  try { callback(); passed += 1; console.log(`PASS ${name}`); }
  catch (error) { console.error(`FAIL ${name}`); throw error; }
}

function header(csv) {
  return csv.slice(1).split("\r\n", 1)[0];
}

test("normal UI, styles, and recommendations contain no temperature feature", () => {
  const forbiddenFiles = ["index.html", "css/styles.css", "js/app.js", "js/cases-ui.js"];
  const forbidden = [/temperature/i, /TEMPERATURES/, /温度感/, /積極的/, /現在休止/];
  forbiddenFiles.forEach((relative) => {
    const source = read(relative);
    forbidden.forEach((pattern) => assert.doesNotMatch(source, pattern, `${relative}: ${pattern}`));
  });
});

test("README documents removal without presenting temperature as a current feature", () => {
  const readme = read("README.md");
  assert.match(readme, /温度感[^\n]{0,40}削除|削除[^\n]{0,40}温度感/);
  assert.doesNotMatch(readme, /^##\s+温度感\s*$/m);
  assert.doesNotMatch(readme, /温度感順|すべて[／/]積極的[／/]通常[／/]現在休止/);
});

test("normal company records and samples no longer expose temperature", () => {
  const company = K.normalizeCompany({ id: "new", companyName: "新規業者", temperature: "積極的" });
  assert.equal(Object.hasOwn(company, "temperature"), false);
  K.SAMPLE_COMPANIES.forEach((sample) => assert.equal(Object.hasOwn(sample, "temperature"), false));
});

test("company CSV has the exact 12 prototype3 columns without temperature", () => {
  const expected = [
    "業者名", "業者名よみがな", "担当者名", "電話番号", "メール", "買取エリア", "買取対象",
    "その他補足", "お気に入り", "メモ", "登録日", "更新日"
  ];
  assert.equal(header(K.buildCsv([])), expected.map((value) => `"${value}"`).join(","));
  assert.doesNotMatch(header(K.buildCsv([])), /温度感/);
});

test("new schema3 backup strips legacy temperature", () => {
  const envelope = K.db.backupEnvelope
    ? K.db.backupEnvelope([K.normalizeCompany({ id: "backup", companyName: "バックアップ社", temperature: "通常" })], K.DEFAULT_SETTINGS, [], [])
    : null;
  if (envelope) {
    assert.equal(envelope.schemaVersion, 3);
    assert.equal(Object.hasOwn(envelope.companies[0], "temperature"), false);
    assert.doesNotMatch(JSON.stringify(envelope.companies), /temperature/);
  } else {
    const dbSource = read("js/db.js");
    assert.match(dbSource, /schemaVersion\s*:\s*KCN\.APP\.schemaVersion/);
    assert.doesNotMatch(dbSource.match(/function\s+backupEnvelope[\s\S]*?\n\s*\}/)?.[0] || "", /temperature/);
  }
});

test("schema1 and schema2 backups may contain temperature but restore ignores it", () => {
  for (const schemaVersion of [1, 2]) {
    const backup = {
      format: K.APP.backupFormat,
      appName: K.APP.displayName,
      appVersion: schemaVersion === 1 ? "Ver.1.0 試作1" : "Ver.1.0 試作2",
      schemaVersion,
      exportedAt: "2026-08-08T00:00:00.000Z",
      companies: [{ id: `legacy-${schemaVersion}`, companyName: "旧業者", temperature: "積極的", propertyTypes: ["土地"] }],
      settings: { ...K.DEFAULT_SETTINGS, schemaVersion, sampleInitialized: true },
      ...(schemaVersion === 2 ? { cases: [], caseResponses: [] } : {})
    };
    const validated = K.validateBackup(backup);
    assert.equal(validated.companies.length, 1);
    assert.equal(Object.hasOwn(validated.companies[0], "temperature"), false);
    assert.ok(validated.companies[0].purchaseTargetIds.includes("land"));
  }
});

test("version and cache contract are prototype3 while IndexedDB remains v2", () => {
  assert.equal(K.APP.version, "Ver.1.0 試作3");
  assert.equal(K.APP.versionNumber, "1.0.0-prototype.3");
  assert.equal(K.APP.schemaVersion, 3);
  assert.equal(K.APP.dbVersion, 2);
  assert.equal(K.APP.cacheName, "kaitori-company-note-v1-prototype3");
  assert.ok(read("sw.js").includes(K.APP.cacheName));
});

console.log(`PROTOTYPE3 TEMPERATURE REMOVAL RESULT: ${passed} tests passed`);
