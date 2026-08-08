"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const node = process.execPath;
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

function read(relative) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

function pngInfo(relative) {
  const buffer = fs.readFileSync(path.join(root, relative));
  assert.equal(buffer.subarray(1, 4).toString("ascii"), "PNG");
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    bitDepth: buffer[24],
    colorType: buffer[25]
  };
}

test("必須ファイルがすべて存在", () => {
  for (const relative of [
    "index.html", "css/styles.css", "js/constants.js", "js/utils.js", "js/db.js", "js/cases-ui.js", "js/app.js",
    "manifest.webmanifest", "sw.js", "apple-touch-icon.png", "icon-192.png", "icon-512.png",
    "icon-maskable-512.png", "icons/icon-source.svg", "README.md"
  ]) assert.equal(fs.existsSync(path.join(root, relative)), true, relative);
});

test("全JavaScriptの構文が正しい", () => {
  for (const relative of ["js/constants.js", "js/utils.js", "js/db.js", "js/cases-ui.js", "js/app.js", "sw.js"]) {
    execFileSync(node, ["--check", path.join(root, relative)], { stdio: "pipe" });
  }
});

test("file対応のclassic defer scriptsと相対パス", () => {
  const html = read("index.html");
  assert.equal(/<script[^>]+type=["']module/i.test(html), false);
  assert.equal((html.match(/<script defer src="\.\/js\//g) || []).length, 5);
  assert.equal(/(?:src|href)="\/(?!\/)/.test(html), false);
  assert.ok(html.includes('rel="apple-touch-icon"'));
});

test("外部CDN・外部API参照がない", () => {
  const appFiles = ["index.html", "css/styles.css", "js/constants.js", "js/utils.js", "js/db.js", "js/cases-ui.js", "js/app.js", "manifest.webmanifest", "sw.js"];
  for (const relative of appFiles) {
    const content = read(relative);
    assert.equal(/https?:\/\//i.test(content), false, relative);
  }
});

test("manifestのPWA項目とアイコンが正しい", () => {
  const manifest = JSON.parse(read("manifest.webmanifest"));
  assert.equal(manifest.name, "買取業者ノート");
  assert.equal(manifest.start_url, "./index.html");
  assert.equal(manifest.scope, "./");
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192"));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512" && icon.purpose === "any"));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512" && icon.purpose === "maskable"));
});

test("PNG寸法と完全不透明形式", () => {
  const expected = {
    "apple-touch-icon.png": 180,
    "icon-192.png": 192,
    "icon-512.png": 512,
    "icon-maskable-512.png": 512
  };
  for (const [relative, size] of Object.entries(expected)) {
    const info = pngInfo(relative);
    assert.equal(info.width, size, relative);
    assert.equal(info.height, size, relative);
    assert.equal(info.bitDepth, 8, relative);
    assert.equal([0, 2, 3].includes(info.colorType), true, `${relative} has alpha color type ${info.colorType}`);
  }
});

test("Service Workerのキャッシュ名・安全な旧版削除・外部URL除外", () => {
  const sw = read("sw.js");
  assert.ok(sw.includes('"kaitori-company-note-v1-prototype3"'));
  assert.ok(sw.includes('name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME'));
  assert.ok(sw.includes("url.origin !== self.location.origin"));
  assert.ok(sw.includes("request.method !== \"GET\""));
  assert.ok(sw.includes("['http:', 'https:'].includes(url.protocol)"));
});

test("IndexedDB version 2と4ストア", () => {
  const constants = read("js/constants.js");
  const db = read("js/db.js");
  assert.ok(constants.includes("dbVersion: 2"));
  assert.ok(constants.includes('companyStore: "companies"'));
  assert.ok(constants.includes('settingsStore: "settings"'));
  assert.ok(constants.includes('caseStore: "cases"'));
  assert.ok(constants.includes('responseStore: "caseResponses"'));
  assert.ok(db.includes("indexedDB.open(KCN.APP.dbName, KCN.APP.dbVersion)"));
});

test("スマートフォン安全領域・44px・横スクロール対策", () => {
  const css = read("css/styles.css");
  const html = read("index.html");
  assert.ok(html.includes("viewport-fit=cover"));
  assert.ok(css.includes("env(safe-area-inset-bottom)"));
  assert.ok(css.includes("overflow-x: hidden"));
  assert.ok(css.includes("min-height: 44px"));
  assert.ok(css.includes("100dvh"));
});

console.log(`STATIC RESULT: ${passed} tests passed`);
