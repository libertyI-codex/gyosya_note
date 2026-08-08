"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const html = read("index.html");
const css = read("css/styles.css");
const app = read("js/app.js");
let passed = 0;

function test(name, callback) {
  try { callback(); passed += 1; console.log(`PASS ${name}`); }
  catch (error) { console.error(`FAIL ${name}`); throw error; }
}

function cssBlock(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "s"));
  assert.ok(match, `CSS rule is required: ${selector}`);
  return match[1];
}

test("company dialog has header, one scrolling body, and action footer in order", () => {
  const dialog = html.match(/<dialog\b[^>]*id=["']company-dialog["'][^>]*>([\s\S]*?)<\/dialog>/);
  assert.ok(dialog, "#company-dialog is required");
  const shell = dialog[1];
  const header = shell.indexOf("class=\"dialog-header\"");
  const body = shell.indexOf("class=\"dialog-body\"");
  const footer = shell.indexOf("class=\"dialog-footer\"");
  assert.ok(header >= 0 && body > header && footer > body, "header/body/footer order is required");
  assert.equal((shell.match(/class=["'][^"']*dialog-body/g) || []).length, 1, "only the body region may scroll");
  assert.match(shell, /id=["']save-company["']/);
  assert.match(shell, /data-close-dialog=["']company-dialog["']/);
});

test("dialog shell uses the fixed-scroll-fixed grid pattern", () => {
  const shell = cssBlock(".dialog-shell");
  const body = cssBlock(".dialog-body");
  const footer = cssBlock(".dialog-footer");
  assert.match(shell, /display\s*:\s*grid\s*;/);
  assert.match(shell, /grid-template-rows\s*:\s*auto\s+minmax\(0\s*,\s*1fr\)\s+auto\s*;/);
  assert.match(shell, /overflow\s*:\s*hidden\s*;/);
  assert.match(body, /min-height\s*:\s*0\s*;/);
  assert.match(body, /overflow-y\s*:\s*auto\s*;/);
  assert.match(body, /overflow-x\s*:\s*hidden\s*;/);
  assert.match(footer, /safe-area-inset-bottom/);
});

test("dynamic, small, and legacy viewport units are all available", () => {
  assert.match(css, /100vh/);
  assert.match(css, /100svh/);
  assert.match(css, /100dvh/);
  const dvhIndex = css.lastIndexOf("100dvh");
  const vhIndex = css.indexOf("100vh");
  assert.ok(dvhIndex > vhIndex, "100dvh must override the 100vh fallback when supported");
});

test("native modal lifecycle has a single open/close path", () => {
  assert.match(app, /function\s+openDialog\s*\(/);
  assert.match(app, /showModal\s*\(/);
  assert.match(app, /function\s+closeDialog\s*\(/);
  assert.match(app, /dialog\.close\s*\(/);
  assert.match(app, /addEventListener\s*\(\s*["']close["']/);
  assert.match(css, /body(?::has\(dialog\[open\]\)|\.[\w-]*dialog[\w-]*)\s*\{[^}]*overflow\s*:\s*hidden/s,
    "background scroll must lock only while a dialog is open");
});

test("dialog and FAB account for bottom navigation and safe areas", () => {
  assert.match(cssBlock(".fab"), /safe-area-inset-bottom/);
  assert.match(cssBlock(".bottom-nav"), /safe-area-inset-bottom/);
  assert.match(cssBlock(".app-dialog"), /overflow\s*:\s*hidden/);
  assert.doesNotMatch(cssBlock(".dialog-body"), /position\s*:\s*fixed/);
});

console.log(`PROTOTYPE3 DIALOG SCROLL RESULT: ${passed} tests passed`);
