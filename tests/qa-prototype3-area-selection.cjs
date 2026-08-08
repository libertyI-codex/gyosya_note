"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const context = vm.createContext({ window: {}, console, Intl, Date, Math, Set, Map, Uint8Array, URL, Blob, Promise, setTimeout, clearTimeout });
Object.assign(context.window, context, { window: context.window });
for (const file of ["js/constants.js", "js/utils.js"]) vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
const K = context.window.KCN;
let passed = 0;

function test(name, callback) {
  try { callback(); passed += 1; console.log(`PASS ${name}`); }
  catch (error) { console.error(`FAIL ${name}`); throw error; }
}

const expected = [
  ["yokohama", "横浜"], ["kawasaki", "川崎"], ["shonan", "湘南"], ["kenou", "県央"],
  ["yokosuka-miura", "横須賀・三浦"], ["kensei", "県西"], ["kanagawa-all", "神奈川県全域"],
  ["tokyo", "東京都"], ["chiba", "千葉"], ["kanto", "関東"], ["nationwide", "全国"], ["other", "その他"]
];
const kanagawaChildren = ["yokohama", "kawasaki", "shonan", "kenou", "yokosuka-miura", "kensei"];

function expanded(values) {
  return new Set(K.expandAreaSelection(values));
}

test("area catalog has stable IDs, labels, and Chiba", () => {
  assert.deepEqual(Array.from(K.AREA_OPTIONS, (item) => [item.id, item.label]), expected);
  assert.equal(new Set(K.AREA_IDS).size, 12);
  assert.equal(K.AREA_LABELS.chiba, "千葉");
  assert.equal(K.AREA_ID_BY_LABEL["千葉"], "chiba");
});

test("Kanagawa-wide expands to itself and six regions", () => {
  const selection = expanded(["kanagawa-all"]);
  assert.deepEqual([...selection], [...kanagawaChildren, "kanagawa-all"]);
  assert.equal(selection.has("tokyo"), false);
  assert.equal(selection.has("other"), false);
});

test("Kanto expands to every regional item except nationwide and other", () => {
  const selection = expanded(["kanto"]);
  const expectedIds = Array.from(K.AREA_IDS).filter((id) => !["nationwide", "other"].includes(id));
  assert.deepEqual([...selection], expectedIds);
  assert.equal(selection.has("chiba"), true);
  assert.equal(selection.has("kanto"), true);
});

test("nationwide expands to every item except other", () => {
  const selection = expanded(["nationwide"]);
  assert.deepEqual([...selection], Array.from(K.AREA_IDS).filter((id) => id !== "other"));
  assert.equal(selection.has("other"), false);
});

test("expansion is deterministic, non-recursive, and idempotent", () => {
  const once = Array.from(K.expandAreaSelection(["nationwide", "yokohama", "nationwide"]));
  const twice = Array.from(K.expandAreaSelection(once));
  assert.deepEqual(twice, once);
  assert.equal(new Set(once).size, once.length);
});

test("legacy labels normalize to IDs without losing unknown values", () => {
  assert.equal(K.normalizeAreaId("横浜"), "yokohama");
  assert.equal(K.normalizeAreaId("yokohama"), "yokohama");
  const company = K.normalizeCompany({ id: "legacy-area", companyName: "旧業者", areas: ["横浜", "全国", "独自地域"] });
  assert.ok(company.areas.includes("yokohama"));
  assert.ok(company.areas.includes("nationwide"));
  assert.ok(company.areas.includes("独自地域"), "unknown legacy area information must be retained");
});

test("broad company areas match their contained case areas", () => {
  assert.equal(K.areaMatches(["kanagawa-all"], ["yokohama"]), true);
  assert.equal(K.areaMatches(["kanto"], ["chiba"]), true);
  assert.equal(K.areaMatches(["nationwide"], ["tokyo"]), true);
  assert.equal(K.areaMatches(["other"], ["yokohama"]), false);
  assert.equal(K.areaMatches(["tokyo"], ["chiba"]), false);
  assert.equal(K.areaMatches(["神奈川県全域"], ["横浜"]), true, "legacy labels must participate in inclusion matching");
});

test("AREA_INCLUSION_RULES exactly encode the three bulk actions", () => {
  assert.deepEqual(Array.from(K.AREA_INCLUSION_RULES["kanagawa-all"]), [...kanagawaChildren, "kanagawa-all"]);
  assert.deepEqual(Array.from(K.AREA_INCLUSION_RULES.kanto), Array.from(K.AREA_IDS).filter((id) => !["nationwide", "other"].includes(id)));
  assert.deepEqual(Array.from(K.AREA_INCLUSION_RULES.nationwide), Array.from(K.AREA_IDS).filter((id) => id !== "other"));
});

console.log(`PROTOTYPE3 AREA SELECTION RESULT: ${passed} tests passed`);
