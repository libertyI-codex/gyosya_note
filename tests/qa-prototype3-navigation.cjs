"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const html = read("index.html");
const css = read("css/styles.css");
const app = read("js/app.js");
const sw = read("sw.js");
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

function attributeValues(source, attribute) {
  const expression = new RegExp(`${attribute}=["']([^"']+)["']`, "g");
  return [...source.matchAll(expression)].map((match) => match[1]);
}

function cssBlock(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "s"));
  assert.ok(match, `CSS rule is required: ${selector}`);
  return match[1];
}

test("4 routes and 4 screens use one stable route contract", () => {
  const routes = attributeValues(html, "data-route");
  const screens = attributeValues(html, "data-screen");
  assert.deepEqual([...new Set(routes)], ["search", "cases", "list", "other"]);
  assert.deepEqual([...new Set(screens)], ["search", "cases", "list", "other"]);
  assert.equal(routes.length, 4, "bottom navigation must contain exactly four route buttons");
  assert.match(html, /id=["']screen-cases["'][^>]*data-screen=["']cases["']|data-screen=["']cases["'][^>]*id=["']screen-cases["']/);
});

test("case navigation button remains a real button whose descendants cannot steal the route", () => {
  const caseButton = html.match(/<button\b[^>]*data-route=["']cases["'][^>]*>([\s\S]*?)<\/button>/);
  assert.ok(caseButton, "cases route button is required");
  assert.match(caseButton[0], /type=["']button["']/);
  assert.match(caseButton[1], /<svg\b/);
  assert.match(caseButton[1], /<span\b[^>]*>\s*案件\s*<\/span>/);
  assert.doesNotMatch(caseButton[1], /pointer-events\s*:/i, "route must be resolved with closest(), not descendant pointer hacks");
});

test("screen changes are centralized in KCN.app.navigate", () => {
  const declarations = app.match(/function\s+navigate\s*\(/g) || [];
  assert.equal(declarations.length, 1, "there must be exactly one navigate() implementation");
  assert.match(app, /KCN\.app\s*=|global\.KCN\.app\s*=/);
  assert.match(app, /\bnavigate\s*,|\bnavigate\s*:/, "navigate must be exposed for deterministic QA and back actions");
  assert.match(app, /closest\s*\(\s*["'][^"']*\[data-route\][^"']*["']\s*\)/, "navigation click must resolve icon/text/padding with closest()");
  assert.match(app, /navigate\s*\(\s*(?:route|button\.dataset\.route|[^)]*dataset\.route)/, "route clicks must call the one router");
  assert.match(app, /aria-current/);
  assert.match(app, /renderAll\s*\(/, "cases route must refresh the case list");
});

test("bottom navigation is an unwrappable four-column grid", () => {
  const inner = cssBlock(".bottom-nav__inner");
  const button = cssBlock(".bottom-nav button");
  assert.match(inner, /display\s*:\s*grid\s*;/);
  assert.match(inner, /grid-template-columns\s*:\s*repeat\(4\s*,\s*minmax\(0\s*,\s*1fr\)\)\s*;/);
  assert.doesNotMatch(inner, /auto-fit|auto-fill|flex-wrap/i);
  assert.match(button, /min-width\s*:\s*0\s*;/);
  assert.match(button, /min-height\s*:\s*(?:var\([^)]*\)|4[4-9]px|[5-9]\dpx)\s*;/);
  assert.match(css, /\.bottom-nav button span\s*\{[^}]*white-space\s*:\s*nowrap/s);
  assert.match(cssBlock(".bottom-nav"), /env\(safe-area-inset-bottom\)/);
});

test("active navigation never changes typography geometry", () => {
  const normal = cssBlock(".bottom-nav button");
  const active = cssBlock(".bottom-nav button.is-active");
  const forbidden = ["font-size", "line-height", "padding", "margin", "border-width", "min-height", "width", "letter-spacing"];
  forbidden.forEach((property) => {
    assert.doesNotMatch(active, new RegExp(`${property}\\s*:`), `active nav must not change ${property}`);
  });
  assert.match(normal, /font-size\s*:/, "normal font size must be explicit and stable");
});

test("the FAB route contract keeps case and company creation separate", () => {
  assert.match(app, /(?:currentScreen|currentRoute)\s*===\s*["']cases["']/);
  assert.match(app, /openNewCase\s*\(/);
  assert.match(app, /openNewCompany\s*\(/);
  assert.match(app, /setAttribute\s*\(\s*["']aria-label["']/);
  assert.match(app, /setAttribute\s*\(\s*["']title["']/);
});

test("prototype3 assets cannot be mixed with a prototype2 worker cache", () => {
  const assetUrls = [...html.matchAll(/(?:href|src)=["'](\.\/(?:css|js)\/[^"']+)["']/g)].map((match) => match[1]);
  assert.ok(assetUrls.length >= 6);
  assetUrls.forEach((url) => assert.match(url, /[?&]v=prototype3(?:&|$)/, url));
  assetUrls.forEach((url) => assert.ok(sw.includes(`"${url}"`), `service-worker shell must use the exact versioned URL: ${url}`));
  assert.match(app, /register\s*\(\s*["']\.\/sw\.js\?v=prototype3["']/);
  assert.match(app, /updateViaCache\s*:\s*["']none["']/);
  assert.match(sw, /kaitori-company-note-v1-prototype3/);
  assert.doesNotMatch(sw, /kaitori-company-note-v1-prototype2/);
});

console.log(`PROTOTYPE3 NAVIGATION RESULT: ${passed} tests passed`);
