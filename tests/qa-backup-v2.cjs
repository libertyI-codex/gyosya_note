"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

const root = path.resolve(__dirname, "..");
const memory = new Map();
const localStorage = {
  getItem: (key) => memory.has(key) ? memory.get(key) : null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key)
};
const window = { console, Intl, Date, Math, Set, Map, Uint8Array, URL, Blob, crypto: webcrypto, localStorage, setTimeout, clearTimeout };
window.window = window;
const context = vm.createContext({ window, console, Intl, Date, Math, Set, Map, Uint8Array, URL, Blob, setTimeout, clearTimeout });
for (const file of ["js/constants.js", "js/utils.js", "js/db.js"]) vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
const K = window.KCN;
let passed = 0;

async function test(name, fn) {
  try { await fn(); passed += 1; console.log(`PASS ${name}`); }
  catch (error) { console.error(`FAIL ${name}`); throw error; }
}

function company(id = "company-1") {
  return K.normalizeCompany({ id, companyName: `業者${id}`, areas: ["横浜"], propertyTypes: ["土地"], temperature: "通常", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" });
}

function caseRecord(id = "case-1") {
  return K.normalizeCase({ id, caseName: `案件${id}`, area: "横浜", caseType: "land", factors: ["narrow-lot"], status: "回答待ち", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" });
}

function response(id = "response-1", caseId = "case-1", companyId = "company-1") {
  return K.normalizeCaseResponse({ id, caseId, companyId, responseStatus: "金額回答", responseAmount: 2000000, responseDate: "2026-08-04", responseFactors: ["narrow-lot"], responseReason: "条件付きなら検討可", followUpDate: "2026-08-10", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-04T00:00:00.000Z" });
}

function envelope(overrides = {}) {
  return {
    format: K.APP.backupFormat,
    appName: K.APP.displayName,
    appVersion: K.APP.version,
    schemaVersion: 2,
    exportedAt: "2026-08-04T00:00:00.000Z",
    companies: [company()],
    cases: [caseRecord()],
    caseResponses: [response()],
    settings: { ...K.DEFAULT_SETTINGS, sampleInitialized: true },
    ...overrides
  };
}

(async () => {
  await test("schemaVersion 1は案件・回答を空配列で復元可能", async () => {
    const validated = K.validateBackup({ ...envelope(), schemaVersion: 1, cases: undefined, caseResponses: undefined });
    assert.equal(validated.companies.length, 1);
    assert.deepEqual(Array.from(validated.cases), []);
    assert.deepEqual(Array.from(validated.caseResponses), []);
  });

  await test("schemaVersion 2の全配列を検証", async () => {
    const validated = K.validateBackup(envelope());
    assert.equal(validated.sourceSchemaVersion, 2);
    assert.equal(validated.cases[0].caseName, "案件case-1");
    assert.equal(validated.caseResponses[0].responseAmount, 2000000);
  });

  await test("case ID・response ID重複を拒否", async () => {
    assert.throws(() => K.validateBackup(envelope({ cases: [caseRecord(), caseRecord()] })));
    assert.throws(() => K.validateBackup(envelope({ caseResponses: [response(), response()] })));
  });

  await test("存在しないcaseId・companyId参照を拒否", async () => {
    assert.throws(() => K.validateBackup(envelope({ caseResponses: [response("r", "missing", "company-1")] })));
    assert.throws(() => K.validateBackup(envelope({ caseResponses: [response("r", "case-1", "missing")] })));
  });

  await test("同一案件・業者の回答重複を拒否", async () => {
    assert.throws(() => K.validateBackup(envelope({ caseResponses: [response("r1"), response("r2")] })));
  });

  await test("不正な種別・要因・状況・金額・日付を拒否", async () => {
    assert.throws(() => K.validateBackup(envelope({ cases: [{ ...caseRecord(), caseType: "invalid" }] })));
    assert.throws(() => K.validateBackup(envelope({ cases: [{ ...caseRecord(), factors: ["invalid"] }] })));
    assert.throws(() => K.validateBackup(envelope({ caseResponses: [{ ...response(), responseStatus: "invalid" }] })));
    assert.throws(() => K.validateBackup(envelope({ caseResponses: [{ ...response(), responseAmount: -1 }] })));
    assert.throws(() => K.validateBackup(envelope({ caseResponses: [{ ...response(), responseDate: "2026-99-99" }] })));
  });

  await test("案件から後で外れた有効要因を安全に復元", async () => {
    const validated = K.validateBackup(envelope({ cases: [{ ...caseRecord(), factors: [] }], caseResponses: [response()] }));
    assert.deepEqual(Array.from(validated.caseResponses[0].responseFactors), ["narrow-lot"]);
  });

  await test("createBackupはschemaVersion 2と4データ領域", async () => {
    await K.db.initialize();
    await K.db.clearAllData();
    await K.db.putCompany(company());
    await K.db.putCase(caseRecord());
    await K.db.putCaseResponse(response());
    const backup = await K.db.createBackup();
    assert.equal(backup.schemaVersion, 2);
    assert.equal(backup.companies.length, 1);
    assert.equal(backup.cases.length, 1);
    assert.equal(backup.caseResponses.length, 1);
  });

  await test("追加復元はID衝突を再採番し参照を追従", async () => {
    const validated = K.validateBackup(envelope());
    const result = await K.db.restoreBackup(validated, "add");
    assert.equal(result.importedCompanies, 1);
    assert.equal(result.importedCases, 1);
    assert.equal(result.importedResponses, 1);
    const companies = await K.db.getAllCompanies();
    const cases = await K.db.getAllCases();
    const responses = await K.db.getAllCaseResponses();
    assert.equal(companies.length, 2);
    assert.equal(cases.length, 2);
    assert.equal(responses.length, 2);
    assert.equal(new Set(responses.map((item) => `${item.caseId}\0${item.companyId}`)).size, 2);
    responses.forEach((item) => {
      assert.ok(companies.some((companyItem) => companyItem.id === item.companyId));
      assert.ok(cases.some((caseItem) => caseItem.id === item.caseId));
    });
  });

  await test("置換復元は4領域を置換", async () => {
    const replacement = K.validateBackup(envelope({ companies: [company("only-company")], cases: [caseRecord("only-case")], caseResponses: [response("only-response", "only-case", "only-company")] }));
    const result = await K.db.restoreBackup(replacement, "replace");
    assert.equal(result.importedCompanies, 1);
    assert.deepEqual(Array.from(await K.db.getAllCompanies(), (item) => item.id), ["only-company"]);
    assert.deepEqual(Array.from(await K.db.getAllCases(), (item) => item.id), ["only-case"]);
    assert.deepEqual(Array.from(await K.db.getAllCaseResponses(), (item) => item.id), ["only-response"]);
  });

  await test("復元失敗時は既存fallbackデータを変更しない", async () => {
    const before = memory.get(K.APP.localFallbackKey);
    const broken = { companies: [company("bad-company")], cases: [], caseResponses: [response("bad-response", "missing", "bad-company")], settings: null };
    await assert.rejects(() => K.db.restoreBackup(broken, "replace"));
    assert.equal(memory.get(K.APP.localFallbackKey), before);
  });

  console.log(`BACKUP V2 RESULT: ${passed} tests passed`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
