"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const artifacts = path.join(__dirname, "artifacts");
fs.mkdirSync(artifacts, { recursive: true });

function loadChromium() {
  const candidates = [
    "playwright",
    "C:/Users/tbska/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
    path.resolve(path.dirname(process.execPath), "..", "node_modules", "playwright")
  ];
  let lastError;
  for (const candidate of candidates) {
    try { return require(candidate).chromium; }
    catch (error) { lastError = error; }
  }
  throw lastError || new Error("Playwright is not available.");
}

function browserExecutable(chromium) {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    chromium.executablePath(),
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate));
}

const mime = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8", ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8", ".md": "text/markdown; charset=utf-8"
};

function startServer() {
  const server = http.createServer((request, response) => {
    const rawPath = decodeURIComponent((request.url || "/").split("?")[0]);
    if (rawPath === "/__seed__") {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end("<!doctype html><meta charset=utf-8><title>cache seed</title>");
      return;
    }
    const relative = rawPath === "/" ? "index.html" : path.normalize(rawPath).replace(/^(\\|\/)+/, "");
    const file = path.resolve(root, relative);
    if (!file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.statusCode = 404;
      response.end("Not found");
      return;
    }
    response.setHeader("Content-Type", mime[path.extname(file).toLowerCase()] || "application/octet-stream");
    response.setHeader("Cache-Control", "no-store");
    response.end(fs.readFileSync(file));
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

let passed = 0;
const results = [];
async function check(name, callback) {
  try {
    await callback();
    passed += 1;
    results.push({ name, status: "PASS" });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, status: "FAIL", error: error.message });
    console.error(`FAIL ${name}`);
    throw error;
  }
}

async function ready(page) {
  await page.waitForFunction(() => window.KCN && KCN.app && KCN.app.getState().initialized && KCN.caseUI && KCN.caseUI.isInitialized(), null, { timeout: 15000 });
  await page.locator("#loading-overlay").waitFor({ state: "hidden" });
}

async function resetData(page) {
  await page.evaluate(async () => {
    await KCN.db.clearAllData();
    await KCN.app.reloadData();
  });
}

async function forceClose(page, selector) {
  await page.evaluate((value) => {
    const dialog = document.querySelector(value);
    if (dialog && dialog.open) KCN.app.closeDialog(dialog, { force: true });
  }, selector);
  await page.locator(selector).waitFor({ state: "hidden" });
}

async function route(page, name) {
  await page.locator(`[data-route="${name}"]`).click();
  await page.locator(`#screen-${name === "list" ? "list" : name}`).waitFor({ state: "visible" });
}

async function selectedValues(page, container) {
  return page.locator(`${container} [data-value][aria-pressed="true"]`).evaluateAll((buttons) => buttons.map((button) => button.dataset.value));
}

async function styleSnapshot(locator, adjacent) {
  return locator.evaluate((element, adjacentSelector) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const next = adjacentSelector ? document.querySelector(adjacentSelector)?.getBoundingClientRect() : null;
    return {
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      next: next ? { x: next.x, y: next.y, width: next.width, height: next.height } : null,
      fontSize: style.fontSize, lineHeight: style.lineHeight, padding: style.padding, margin: style.margin,
      borderWidth: style.borderWidth, minHeight: style.minHeight, letterSpacing: style.letterSpacing,
      fontWeight: style.fontWeight
    };
  }, adjacent || "");
}

function assertStable(before, after, label) {
  for (const key of ["fontSize", "lineHeight", "padding", "margin", "borderWidth", "minHeight", "letterSpacing", "fontWeight"]) {
    assert.equal(after[key], before[key], `${label}: ${key}`);
  }
  assert.ok(Math.abs(after.rect.width - before.rect.width) <= 0.5, `${label}: width changed`);
  assert.ok(Math.abs(after.rect.height - before.rect.height) <= 0.5, `${label}: height changed`);
  if (before.next && after.next) {
    assert.ok(Math.abs((after.next.x - after.rect.x) - (before.next.x - before.rect.x)) <= 0.5, `${label}: adjacent x moved`);
    assert.ok(Math.abs((after.next.y - after.rect.y) - (before.next.y - before.rect.y)) <= 0.5, `${label}: adjacent y moved`);
  }
}

async function openCompany(page, routeName = "search") {
  await route(page, routeName);
  await page.locator("#add-company-fab").click();
  await page.locator("#company-dialog").waitFor({ state: "visible" });
}

async function runMain(browser, origin) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, acceptDownloads: true, serviceWorkers: "block" });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  await page.goto(origin, { waitUntil: "load" });
  await ready(page);
  await resetData(page);

  await check("IndexedDB v2 migrates legacy company targets in place without changing cases or responses", async () => {
    await page.evaluate(async () => {
      const open = indexedDB.open(KCN.APP.dbName, KCN.APP.dbVersion);
      const db = await new Promise((resolve, reject) => {
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      await new Promise((resolve, reject) => {
        const transaction = db.transaction([
          KCN.APP.companyStore, KCN.APP.settingsStore, KCN.APP.caseStore, KCN.APP.responseStore
        ], "readwrite");
        const companies = transaction.objectStore(KCN.APP.companyStore);
        const settings = transaction.objectStore(KCN.APP.settingsStore);
        const cases = transaction.objectStore(KCN.APP.caseStore);
        const responses = transaction.objectStore(KCN.APP.responseStore);
        companies.clear(); settings.clear(); cases.clear(); responses.clear();
        companies.put({
          id: "compat-company", companyName: "旧形式業者", contactName: "既存担当",
          phone: "03-1234-5678", email: "old@example.jp", areas: ["神奈川県全域"],
          propertyTypes: ["土地", "区分マンション"], temperature: "積極的", isFavorite: true,
          memo: "既存メモ", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z"
        });
        settings.put({ ...KCN.DEFAULT_SETTINGS, id: KCN.APP.settingsId, companyDataModelVersion: 2, sampleInitialized: true });
        cases.put({ id: "compat-case", caseName: "既存案件", location: "横浜市", area: "yokohama", caseType: "land", factors: [], status: "相談中", memo: "", createdAt: "2026-01-03T00:00:00.000Z", updatedAt: "2026-01-03T00:00:00.000Z" });
        responses.put({ id: "compat-response", caseId: "compat-case", companyId: "compat-company", responseStatus: "打診済み", responseAmount: null, responseDate: "", responseFactors: [], responseReason: "", memo: "", followUpDate: "", createdAt: "2026-01-04T00:00:00.000Z", updatedAt: "2026-01-04T00:00:00.000Z" });
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error || new Error("seed aborted"));
      });
      db.close();
    });
    await page.reload({ waitUntil: "load" });
    await ready(page);
    const migrated = await page.evaluate(async () => {
      const companies = await KCN.db.getAllCompanies();
      const cases = await KCN.db.getAllCases();
      const responses = await KCN.db.getAllCaseResponses();
      const settings = await KCN.db.getSettings();
      return { companies, cases, responses, settings };
    });
    assert.equal(migrated.companies.length, 1);
    assert.equal(migrated.companies[0].id, "compat-company");
    assert.equal(migrated.companies[0].companyName, "旧形式業者");
    assert.equal(migrated.companies[0].isFavorite, true);
    assert.equal(migrated.companies[0].purchaseTargetIds.includes("land"), true);
    assert.equal(migrated.companies[0].legacyPurchaseTargets.includes("区分マンション"), true);
    assert.equal(migrated.cases.length, 1);
    assert.equal(migrated.responses.length, 1);
    assert.equal(migrated.responses[0].companyId, "compat-company");
    assert.equal(migrated.settings.companyDataModelVersion, 3);
    await page.reload({ waitUntil: "load" });
    await ready(page);
    assert.deepEqual(await page.evaluate(async () => {
      const companies = await KCN.db.getAllCompanies();
      return [companies.length, companies[0].purchaseTargetIds, companies[0].legacyPurchaseTargets];
    }), [1, ["land"], ["区分マンション"]]);
    await resetData(page);
  });

  await check("case route works once from icon, text, and padding with synchronized state", async () => {
    await route(page, "search");
    await page.evaluate(() => {
      window.__prototype3RenderCount = 0;
      const original = KCN.caseUI.renderAll;
      KCN.caseUI.renderAll = function (...args) {
        window.__prototype3RenderCount += 1;
        return original.apply(this, args);
      };
    });
    await page.locator('[data-route="cases"] svg').dispatchEvent("click");
    await page.locator("#screen-cases").waitFor({ state: "visible" });
    assert.equal(await page.evaluate(() => window.__prototype3RenderCount), 1, "one click must trigger one case render");
    assert.equal(await page.locator('[data-route="cases"]').getAttribute("aria-current"), "page");
    assert.equal(await page.locator('[data-route="cases"]').evaluate((button) => button.classList.contains("is-active")), true);
    assert.match(await page.locator("#add-company-fab").getAttribute("aria-label"), /案件/);

    await page.locator('[data-route="search"] span').dispatchEvent("click");
    await page.locator("#screen-search").waitFor({ state: "visible" });
    const box = await page.locator('[data-route="cases"]').boundingBox();
    await page.mouse.click(box.x + box.width - 4, box.y + box.height / 2);
    await page.locator("#screen-cases").waitFor({ state: "visible" });
  });

  await check("all four routes survive ten consecutive transitions and reload", async () => {
    const sequence = ["search", "cases", "list", "other", "cases", "search", "list", "cases", "other", "cases"];
    for (const name of sequence) {
      await route(page, name);
      assert.equal(await page.locator(`[data-route="${name}"]`).getAttribute("aria-current"), "page");
      assert.equal(await page.locator('[data-route][aria-current="page"]').count(), 1);
    }
    await page.reload({ waitUntil: "load" });
    await ready(page);
    await route(page, "cases");
    assert.equal(await page.locator("#screen-cases").isVisible(), true);
    assert.match(await page.locator("#screen-cases h2").first().textContent(), /案件/);
    await route(page, "search");
    await route(page, "cases");
    await page.goBack();
    await page.locator("#screen-search").waitFor({ state: "visible" });
    assert.equal(await page.locator('[data-route="search"]').getAttribute("aria-current"), "page");
  });

  await check("390x844 bottom nav is one equal-width row with stable active typography", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await route(page, "search");
    const before = await page.locator('[data-route="cases"]').evaluate((button) => {
      const style = getComputedStyle(button); const rect = button.getBoundingClientRect();
      return { fontSize: style.fontSize, lineHeight: style.lineHeight, width: rect.width, height: rect.height };
    });
    await route(page, "cases");
    const after = await page.locator('[data-route="cases"]').evaluate((button) => {
      const style = getComputedStyle(button); const rect = button.getBoundingClientRect();
      return { fontSize: style.fontSize, lineHeight: style.lineHeight, width: rect.width, height: rect.height };
    });
    assert.deepEqual(after, before);
    const nav = await page.locator(".bottom-nav__inner").evaluate((element) => {
      const rects = Array.from(element.querySelectorAll("button"), (button) => button.getBoundingClientRect());
      return { rows: new Set(rects.map((rect) => Math.round(rect.top))).size, widths: rects.map((rect) => rect.width), client: element.clientWidth, scroll: element.scrollWidth };
    });
    assert.equal(nav.rows, 1);
    assert.ok(nav.widths.every((width) => Math.abs(width - nav.widths[0]) <= 1));
    assert.equal(nav.scroll, nav.client);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  });

  await check("company dialog opens from search/list FAB and the zero-company action", async () => {
    await openCompany(page, "search");
    await forceClose(page, "#company-dialog");
    await openCompany(page, "list");
    await forceClose(page, "#company-dialog");
    await route(page, "list");
    const empty = page.locator('[data-empty-action="add-company"]');
    await empty.waitFor({ state: "visible" });
    await empty.click();
    await page.locator("#company-dialog").waitFor({ state: "visible" });
    await forceClose(page, "#company-dialog");
  });

  await check("390x500 dialog scroll keeps header/footer fixed and restores background", async () => {
    await page.setViewportSize({ width: 390, height: 500 });
    const overflowBefore = await page.locator("body").evaluate((body) => getComputedStyle(body).overflowY);
    await openCompany(page, "search");
    const geometryBefore = await page.locator("#company-dialog").evaluate((dialog) => {
      const header = dialog.querySelector(".dialog-header").getBoundingClientRect();
      const body = dialog.querySelector(".dialog-body");
      const footer = dialog.querySelector(".dialog-footer").getBoundingClientRect();
      const save = dialog.querySelector("#save-company").getBoundingClientRect();
      return { headerTop: header.top, footerTop: footer.top, footerBottom: footer.bottom, saveBottom: save.bottom, bodyClient: body.clientHeight, bodyScroll: body.scrollHeight };
    });
    assert.ok(geometryBefore.bodyScroll > geometryBefore.bodyClient);
    assert.ok(geometryBefore.footerBottom <= 500 + 1);
    assert.ok(geometryBefore.saveBottom <= 500 + 1);
    assert.equal(await page.locator("body").evaluate((body) => getComputedStyle(body).overflow), "hidden");
    await page.locator("#company-dialog .dialog-body").evaluate((body) => { body.scrollTop = body.scrollHeight; });
    const geometryAfter = await page.locator("#company-dialog").evaluate((dialog) => ({
      headerTop: dialog.querySelector(".dialog-header").getBoundingClientRect().top,
      footerTop: dialog.querySelector(".dialog-footer").getBoundingClientRect().top,
      scrollTop: dialog.querySelector(".dialog-body").scrollTop
    }));
    assert.ok(geometryAfter.scrollTop > 0);
    assert.ok(Math.abs(geometryAfter.headerTop - geometryBefore.headerTop) <= 1);
    assert.ok(Math.abs(geometryAfter.footerTop - geometryBefore.footerTop) <= 1);
    await page.screenshot({ path: path.join(artifacts, "prototype3-390x500-company-dialog.png") });
    await forceClose(page, "#company-dialog");
    assert.equal(await page.locator("body").evaluate((body) => getComputedStyle(body).overflowY), overflowBefore);
  });

  await check("dialog survives repeated open/close and keyboard-equivalent short viewport", async () => {
    for (let index = 0; index < 5; index += 1) {
      await openCompany(page, "search");
      await forceClose(page, "#company-dialog");
      assert.equal(await page.locator("body").evaluate((body) => getComputedStyle(body).overflow === "hidden"), false);
    }
    await page.setViewportSize({ width: 390, height: 360 });
    await openCompany(page, "search");
    const save = await page.locator("#save-company").boundingBox();
    assert.ok(save && save.y + save.height <= 360 + 1);
    await forceClose(page, "#company-dialog");
  });

  await check("katakana and IME composition create editable candidates without overwriting manual kana", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openCompany(page, "search");
    await page.locator("#company-name").fill("リバブル");
    assert.equal(await page.locator("#company-name-kana").inputValue(), "りばぶる");
    await page.locator("#company-name-kana").fill("てしゅうせい");
    await page.locator("#company-name").fill("オープンハウス");
    assert.equal(await page.locator("#company-name-kana").inputValue(), "てしゅうせい", "manual kana must win");
    await forceClose(page, "#company-dialog");
    await openCompany(page, "search");
    await page.locator("#company-name").evaluate((input) => {
      input.value = "";
      input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "" }));
      input.dispatchEvent(new CompositionEvent("compositionupdate", { bubbles: true, data: "にっぜいふどうさん" }));
      input.value = "日税不動産";
      input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "日税不動産" }));
      input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertCompositionText", data: "日税不動産" }));
    });
    assert.equal(await page.locator("#company-name-kana").inputValue(), "にっぜいふどうさん");
    assert.match(await page.locator("#company-kana-hint").textContent(), /自動候補|IME/);
    await forceClose(page, "#company-dialog");
  });

  await check("area bulk actions, Chiba, off behavior, and clear-all follow inclusion rules", async () => {
    await openCompany(page, "search");
    const container = "#form-area-chips";
    const chip = page.locator(`${container} [data-value="yokohama"]`);
    const adjacent = `${container} [data-value="kawasaki"]`;
    const stableBefore = await styleSnapshot(chip, adjacent);
    await page.locator(`${container} [data-value="kanagawa-all"]`).click();
    let values = await selectedValues(page, container);
    ["yokohama", "kawasaki", "shonan", "kenou", "yokosuka-miura", "kensei", "kanagawa-all"].forEach((id) => assert.ok(values.includes(id), id));
    await page.locator(`${container} [data-value="kanagawa-all"]`).click();
    values = await selectedValues(page, container);
    assert.equal(values.includes("kanagawa-all"), false);
    assert.equal(values.includes("yokohama"), true, "turning off broad area must retain expanded children");
    const stableAfter = await styleSnapshot(chip, adjacent);
    assertStable(stableBefore, stableAfter, "area chip");

    await page.locator('[data-clear-chip-scope="form-areas"]').click();
    assert.deepEqual(await selectedValues(page, container), []);
    await page.locator(`${container} [data-value="kanto"]`).click();
    values = await selectedValues(page, container);
    assert.equal(values.includes("chiba"), true);
    assert.equal(values.includes("nationwide"), false);
    assert.equal(values.includes("other"), false);
    await page.locator('[data-clear-chip-scope="form-areas"]').click();
    await page.locator(`${container} [data-value="nationwide"]`).click();
    values = await selectedValues(page, container);
    assert.equal(values.includes("nationwide"), true);
    assert.equal(values.includes("chiba"), true);
    assert.equal(values.includes("other"), false);
    await page.locator('[data-clear-chip-scope="form-areas"]').click();
    await page.locator(`${container} [data-value="chiba"]`).click();
    assert.deepEqual(await selectedValues(page, container), ["chiba"]);
    await forceClose(page, "#company-dialog");
  });

  await check("purchase targets share 10+17 categories, All excludes other, and custom supplement persists", async () => {
    await openCompany(page, "search");
    const container = "#form-property-chips";
    assert.equal(await page.locator(`${container} [data-value]`).count(), 28, "27 real targets plus virtual All");
    assert.equal(await page.locator(`${container} .purchase-target-group`).count(), 6, "bulk action plus five business categories");
    const land = page.locator(`${container} [data-value="land"]`);
    const before = await styleSnapshot(land, `${container} [data-value="business-land"]`);
    await page.locator(`${container} [data-value="all"]`).click();
    let values = await selectedValues(page, container);
    assert.equal(values.includes("all"), true);
    assert.equal(values.includes("other"), false);
    assert.equal(values.filter((value) => value !== "all").length, 26);
    await page.locator(`${container} [data-value="all"]`).click();
    values = await selectedValues(page, container);
    assert.equal(values.includes("all"), false);
    assert.equal(values.includes("land"), true, "turning off All must retain selected real targets");
    const after = await styleSnapshot(land, `${container} [data-value="business-land"]`);
    assertStable(before, after, "purchase target chip");
    await page.locator('[data-clear-chip-scope="form-purchase-targets"]').click();
    assert.deepEqual(await selectedValues(page, container), []);
    await page.locator(`${container} [data-value="other"]`).click();
    assert.equal(await page.locator("#custom-purchase-target-field").isVisible(), true);
    await page.locator("#custom-purchase-target").fill("ホテル・医療施設");
    await page.locator(`${container} [data-value="other"]`).click();
    assert.equal(await page.locator("#custom-purchase-target").inputValue(), "ホテル・医療施設", "unselecting other must not erase input");
    await forceClose(page, "#company-dialog");
  });

  await check("case type and factor selection has stable geometry", async () => {
    await route(page, "cases");
    await page.locator("#add-company-fab").click();
    await page.locator("#case-dialog").waitFor({ state: "visible" });
    const type = page.locator('[data-case-type-value="land"]');
    const typeBefore = await styleSnapshot(type, '[data-case-type-value="business-land"]');
    await type.click();
    assertStable(typeBefore, await styleSnapshot(type, '[data-case-type-value="business-land"]'), "case type chip");
    await page.locator("#case-dialog .case-more-fields > summary").click();
    const factor = page.locator('[data-case-factor-value="development"]');
    const factorBefore = await styleSnapshot(factor, '[data-case-factor-value="cliff-retaining-wall"]');
    await factor.click();
    assertStable(factorBefore, await styleSnapshot(factor, '[data-case-factor-value="cliff-retaining-wall"]'), "factor chip");
    await forceClose(page, "#case-dialog");
  });

  await check("response status and reason controls do not change geometry when selected", async () => {
    await page.evaluate(() => {
      const status = document.querySelector("#response-status");
      const reason = document.querySelector("#response-reason");
      status.replaceChildren(...KCN.RESPONSE_STATUSES.map((value) => new Option(value, value)));
      reason.replaceChildren(...KCN.RESPONSE_REASONS.map((value) => new Option(value, value)));
      KCN.app.openDialog(document.querySelector("#response-dialog"), status);
    });
    await page.locator("#response-dialog").waitFor({ state: "visible" });
    await page.locator("#response-more-fields > summary").click();
    const before = await page.locator("#response-dialog").evaluate((dialog) => {
      const toBox = (element) => { const rect = element.getBoundingClientRect(); const style = getComputedStyle(element); return { width: rect.width, height: rect.height, fontSize: style.fontSize, lineHeight: style.lineHeight, padding: style.padding, borderWidth: style.borderWidth }; };
      return { status: toBox(dialog.querySelector("#response-status")), reason: toBox(dialog.querySelector("#response-reason")) };
    });
    await page.locator("#response-status").selectOption({ index: 2 });
    await page.locator("#response-reason").selectOption({ index: 3 });
    const after = await page.locator("#response-dialog").evaluate((dialog) => {
      const toBox = (element) => { const rect = element.getBoundingClientRect(); const style = getComputedStyle(element); return { width: rect.width, height: rect.height, fontSize: style.fontSize, lineHeight: style.lineHeight, padding: style.padding, borderWidth: style.borderWidth }; };
      return { status: toBox(dialog.querySelector("#response-status")), reason: toBox(dialog.querySelector("#response-reason")) };
    });
    assert.deepEqual(after, before);
    await forceClose(page, "#response-dialog");
  });

  await check("company save, kana search, custom search, detail, duplicate, and duplicate-return paths work", async () => {
    await openCompany(page, "search");
    await page.locator("#company-name").fill("リバブルQA");
    await page.locator("#company-name-kana").fill("りばぶるきゅーえー");
    await page.locator('#form-area-chips [data-value="chiba"]').click();
    await page.locator('#form-property-chips [data-value="land"]').click();
    await page.locator('#form-property-chips [data-value="other"]').click();
    await page.locator("#custom-purchase-target").fill("ホテル・倉庫");
    await page.locator("#save-company").click();
    await page.locator("#company-dialog").waitFor({ state: "hidden" });
    const id = await page.evaluate(async () => (await KCN.db.getAllCompanies()).find((company) => company.companyName === "リバブルQA").id);

    await route(page, "search");
    await page.locator("#search-query").fill("リバブルキューエー");
    assert.match(await page.locator("#search-results").textContent(), /リバブルQA/);
    await page.locator("#search-query").fill("ホテル");
    assert.match(await page.locator("#search-results").textContent(), /リバブルQA/);
    await page.locator(`[data-detail-id="${id}"]`).first().click();
    await page.locator("#detail-dialog").waitFor({ state: "visible" });
    const detail = await page.locator("#detail-content").textContent();
    assert.match(detail, /りばぶるきゅーえー/);
    assert.match(detail, /ホテル・倉庫/);
    assert.doesNotMatch(detail, /温度感|積極的|現在休止/);
    await page.locator('[data-detail-action="duplicate"]').click();
    await page.locator("#company-dialog").waitFor({ state: "visible" });
    assert.match(await page.locator("#company-dialog-title").textContent(), /複製/);
    await forceClose(page, "#company-dialog");

    await openCompany(page, "search");
    await page.locator("#company-name").fill("リバブルQA");
    await page.locator("#save-company").click();
    await page.locator("#duplicate-warning").waitFor({ state: "visible" });
    await page.locator(`[data-duplicate-detail-id="${id}"]`).click();
    await page.locator("#detail-dialog").waitFor({ state: "visible" });
    await page.locator('[data-detail-action="return-to-form"]').click();
    await page.locator("#company-dialog").waitFor({ state: "visible" });
    await forceClose(page, "#company-dialog");
  });

  await check("390x500 and 1440 keep one nav row, no horizontal overflow, and usable dialogs", async () => {
    for (const viewport of [{ width: 390, height: 500 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(viewport);
      await route(page, "cases");
      const rows = await page.locator(".bottom-nav__inner button").evaluateAll((buttons) => new Set(buttons.map((button) => Math.round(button.getBoundingClientRect().top))).size);
      assert.equal(rows, 1, `${viewport.width}x${viewport.height}`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await openCompany(page, "list");
      assert.equal(await page.locator("#save-company").isVisible(), true);
      await forceClose(page, "#company-dialog");
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await route(page, "cases");
    await page.screenshot({ path: path.join(artifacts, "prototype3-1440-cases.png") });
  });

  await check("HTTP run has no unhandled JavaScript or console errors", async () => {
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);
  });

  await context.close();
}

async function runFile(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(pathToFileURL(path.join(root, "index.html")).href, { waitUntil: "load" });
  await ready(page);
  await check("file protocol opens cases and company dialog without a service worker", async () => {
    await page.locator('[data-route="cases"] svg').dispatchEvent("click");
    await page.locator("#screen-cases").waitFor({ state: "visible" });
    await page.locator('[data-route="search"] span').dispatchEvent("click");
    await page.locator("#add-company-fab").click();
    await page.locator("#company-dialog").waitFor({ state: "visible" });
    await forceClose(page, "#company-dialog");
    const registrations = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return 0;
      try { return (await navigator.serviceWorker.getRegistrations()).length; }
      catch (error) { return location.protocol === "file:" ? 0 : -1; }
    });
    assert.equal(registrations, 0);
    assert.deepEqual(errors, []);
  });
  await context.close();
}

async function runPwa(browser, origin) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "allow" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${origin}__seed__`, { waitUntil: "load" });
  await page.evaluate(async () => {
    await caches.open("kaitori-company-note-v1-prototype2");
    await caches.open("unrelated-app-cache");
  });
  await page.goto(origin, { waitUntil: "load" });
  await ready(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  if (!await page.evaluate(() => Boolean(navigator.serviceWorker.controller))) {
    await page.reload({ waitUntil: "load" });
    await ready(page);
  }

  await check("PWA activation removes only old app caches", async () => {
    await page.waitForFunction(async () => !(await caches.keys()).includes("kaitori-company-note-v1-prototype2"));
    const keys = await page.evaluate(() => caches.keys());
    assert.ok(keys.includes("kaitori-company-note-v1-prototype3"));
    assert.ok(keys.includes("unrelated-app-cache"));
  });

  await check("offline restart still opens the case route exactly once", async () => {
    await context.setOffline(true);
    await page.reload({ waitUntil: "load" });
    await ready(page);
    await page.evaluate(() => {
      window.__offlineRenderCount = 0;
      const original = KCN.caseUI.renderAll;
      KCN.caseUI.renderAll = function (...args) { window.__offlineRenderCount += 1; return original.apply(this, args); };
    });
    await page.locator('[data-route="cases"] span').dispatchEvent("click");
    await page.locator("#screen-cases").waitFor({ state: "visible" });
    assert.equal(await page.evaluate(() => window.__offlineRenderCount), 1);
    assert.equal(await page.evaluate(() => KCN.APP.versionNumber), "1.0.0-prototype.3");
    assert.deepEqual(errors, []);
    await context.setOffline(false);
  });
  await context.close();
}

(async () => {
  const chromium = loadChromium();
  const executablePath = browserExecutable(chromium);
  assert.ok(executablePath, "Chromium or Edge executable is required");
  const server = await startServer();
  const origin = `http://127.0.0.1:${server.address().port}/`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath, args: ["--disable-gpu", "--no-first-run"] });
    await runMain(browser, origin);
    await runFile(browser);
    await runPwa(browser, origin);
    fs.writeFileSync(path.join(artifacts, "prototype3-browser-results.json"), JSON.stringify({ passed, results }, null, 2));
    console.log(`PROTOTYPE3 BROWSER RESULT: ${passed} tests passed`);
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  fs.writeFileSync(path.join(artifacts, "prototype3-browser-results.json"), JSON.stringify({ passed, results }, null, 2));
  console.error(error);
  process.exitCode = 1;
});
