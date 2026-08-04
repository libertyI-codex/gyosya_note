"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("C:/Users/tbska/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");

const root = path.resolve(__dirname, "..");
const artifacts = path.join(__dirname, "artifacts");
const edgePath = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const port = 8765;
const httpUrl = `http://127.0.0.1:${port}/kaitori-company-local/`;
const fileUrl = pathToFileURL(path.join(root, "index.html")).href;
fs.mkdirSync(artifacts, { recursive: true });

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};

function startServer() {
  const server = http.createServer((request, response) => {
    try {
      const requestUrl = new URL(request.url, `http://${request.headers.host}`);
      let pathname = decodeURIComponent(requestUrl.pathname);
      const prefix = "/kaitori-company-local";
      if (pathname.startsWith(prefix)) pathname = pathname.slice(prefix.length);
      if (!pathname || pathname.endsWith("/")) pathname += "index.html";
      const relative = pathname.replace(/^\/+/, "");
      const resolved = path.resolve(root, relative);
      if (!resolved.startsWith(root + path.sep) && resolved !== root) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }
      response.writeHead(200, {
        "Content-Type": mimeTypes[path.extname(resolved).toLowerCase()] || "application/octet-stream",
        "Cache-Control": "no-cache",
        "Service-Worker-Allowed": "/kaitori-company-local/"
      });
      fs.createReadStream(resolved).pipe(response);
    } catch (error) {
      response.writeHead(500);
      response.end("Server error");
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

const results = [];
async function check(name, callback) {
  try {
    await callback();
    results.push({ name, status: "PASS" });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, status: "FAIL", error: error.stack || String(error) });
    console.error(`FAIL ${name}: ${error.message}`);
    throw error;
  }
}

function attachRuntimeMonitor(page, label) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(`${label} pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`${label} console.error: ${message.text()}`);
  });
  page.on("requestfailed", (request) => {
    const url = request.url();
    if (!url.startsWith("tel:") && !url.startsWith("mailto:") && !url.startsWith("data:") && !url.startsWith("blob:")) {
      errors.push(`${label} requestfailed: ${url} ${request.failure()?.errorText || ""}`);
    }
  });
  return errors;
}

async function waitForApp(page) {
  await page.waitForFunction(() => window.KCN && window.KCN.app && window.KCN.app.state.initialized === true, null, { timeout: 15000 });
}

async function clearDatabase(page) {
  await page.evaluate(async () => {
    await KCN.db.clearAllData();
    await KCN.app.reloadData();
  });
}

async function openNew(page) {
  await page.locator("#add-company-fab").click();
  await page.locator("#company-dialog").waitFor({ state: "visible" });
}

async function saveForm(page) {
  await page.locator("#save-company").click();
}

async function searchNames(page) {
  return page.locator("#search-results .company-card h4").allTextContents();
}

async function listNames(page) {
  return page.locator("#company-list .company-card h4").allTextContents();
}

async function resetSearch(page) {
  await page.locator("#clear-search").click();
}

async function runFunctional(browser) {
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = attachRuntimeMonitor(page, "functional");
  await page.goto(httpUrl, { waitUntil: "domcontentloaded" });
  await waitForApp(page);

  await check("初回サンプル3社・再読込で重複しない", async () => {
    assert.equal(await page.evaluate(() => KCN.app.state.companies.filter((c) => c.isSample).length), 3);
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForApp(page);
    assert.equal(await page.evaluate(() => KCN.app.state.companies.filter((c) => c.isSample).length), 3);
  });

  await clearDatabase(page);

  await check("業者名だけで保存", async () => {
    await openNew(page);
    await page.locator("#company-name").fill("業者名だけテスト");
    await saveForm(page);
    await page.locator("#company-dialog").waitFor({ state: "hidden" });
    const value = await page.evaluate(() => KCN.app.state.companies.find((c) => c.companyName === "業者名だけテスト"));
    assert.ok(value);
    assert.deepEqual(value.areas, []);
    assert.deepEqual(value.propertyTypes, []);
  });

  await check("全項目・複数エリア・複数対象・温度感・お気に入りを保存", async () => {
    await openNew(page);
    await page.locator("#company-name").fill("テスト総合買取");
    await page.locator("#contact-name").fill("山田 太郎");
    await page.locator("#company-phone").fill("045-123-4567");
    await page.locator("#company-email").fill("INFO@EXAMPLE.JP ");
    await page.locator('#form-area-chips .chip', { hasText: "横浜" }).click();
    await page.locator('#form-area-chips .chip', { hasText: "川崎" }).click();
    await page.locator("#custom-area").fill("横浜市南区中心");
    await page.locator('#form-property-chips .chip[data-value="土地"]').click();
    await page.locator('#form-property-chips .chip[data-value="戸建"]').click();
    await page.locator('input[name="temperature"][value="積極的"]').check();
    await page.locator("#company-favorite").check();
    await page.locator("#company-memo").fill("決裁が早い。再建築不可も相談可。");
    await saveForm(page);
    await page.locator("#company-dialog").waitFor({ state: "hidden" });
    const value = await page.evaluate(() => KCN.app.state.companies.find((c) => c.companyName === "テスト総合買取"));
    assert.ok(value);
    assert.deepEqual(value.areas, ["横浜", "川崎"]);
    assert.deepEqual(value.propertyTypes, ["土地", "戸建"]);
    assert.equal(value.temperature, "積極的");
    assert.equal(value.isFavorite, true);
    assert.equal(value.email, "info@example.jp");
  });

  await check("編集できる", async () => {
    const card = page.locator("#search-results .company-card").filter({ hasText: "テスト総合買取" });
    await card.getByRole("button", { name: /詳細/ }).click();
    await page.locator('[data-detail-action="edit"]').click();
    await page.locator("#contact-name").fill("山田 次郎");
    await saveForm(page);
    await page.locator("#company-dialog").waitFor({ state: "hidden" });
    assert.equal(await page.evaluate(() => KCN.app.state.companies.find((c) => c.companyName === "テスト総合買取").contactName), "山田 次郎");
  });

  await check("複製・重複警告後の続行", async () => {
    const card = page.locator("#search-results .company-card").filter({ hasText: "テスト総合買取" });
    await card.getByRole("button", { name: /詳細/ }).click();
    await page.locator('[data-detail-action="duplicate"]').click();
    assert.match(await page.locator("#company-name").inputValue(), /（複製）$/);
    await saveForm(page);
    await page.locator("#duplicate-warning").waitFor({ state: "visible" });
    assert.match(await page.locator("#duplicate-warning").innerText(), /同じ業者の可能性があります/);
    const draftName = await page.locator("#company-name").inputValue();
    await page.locator("#duplicate-list [data-duplicate-detail-id]").first().click();
    await page.locator("#detail-dialog").waitFor({ state: "visible" });
    assert.equal(await page.locator('[data-detail-action="return-to-form"]').count(), 1);
    assert.equal(await page.locator('[data-detail-action="edit"]').count(), 0);
    await page.locator('[data-detail-action="return-to-form"]').click();
    await page.locator("#company-dialog").waitFor({ state: "visible" });
    assert.equal(await page.locator("#company-name").inputValue(), draftName);
    await page.locator("#continue-duplicate-save").click();
    await page.locator("#company-dialog").waitFor({ state: "hidden" });
    const values = await page.evaluate(() => KCN.app.state.companies.filter((c) => c.companyName.startsWith("テスト総合買取")));
    assert.equal(values.length, 2);
    assert.notEqual(values[0].id, values[1].id);
  });

  await check("削除確認・削除・取り消し", async () => {
    const name = "テスト総合買取（複製）";
    const card = page.locator("#search-results .company-card").filter({ hasText: name });
    await card.getByRole("button", { name: /詳細/ }).click();
    let message = "";
    page.once("dialog", async (dialog) => {
      message = dialog.message();
      await dialog.accept();
    });
    await page.locator('[data-detail-action="delete"]').click();
    await page.waitForFunction((companyName) => !KCN.app.state.companies.some((c) => c.companyName === companyName), name);
    assert.ok(message.includes(name));
    await page.locator("#toast-action").click();
    await page.waitForFunction((companyName) => KCN.app.state.companies.some((c) => c.companyName === companyName), name);
  });

  await check("エリア・対象・AND/OR検索", async () => {
    await resetSearch(page);
    await page.locator('#search-area-chips .chip', { hasText: "横浜" }).click();
    await page.waitForFunction(() => document.activeElement?.dataset.value === "横浜");
    assert.ok((await searchNames(page)).includes("テスト総合買取"));
    await resetSearch(page);
    await page.locator('#search-property-chips .chip[data-value="土地"]').click();
    assert.ok((await searchNames(page)).includes("テスト総合買取"));
    await page.locator('#search-property-chips .chip[data-value="ビル"]').click();
    assert.ok((await searchNames(page)).includes("テスト総合買取"));
    await resetSearch(page);
    await page.locator('#search-area-chips .chip', { hasText: "横浜" }).click();
    await page.locator('#search-property-chips .chip[data-value="土地"]').click();
    assert.ok((await searchNames(page)).includes("テスト総合買取"));
  });

  await check("業者名・担当者・メモ・電話検索", async () => {
    for (const query of ["テスト総合買取", "山田 次郎", "再建築不可", "0451234567"]) {
      await resetSearch(page);
      await page.locator("#search-query").fill(query);
      assert.ok((await searchNames(page)).includes("テスト総合買取"), query);
    }
  });

  await check("お気に入り・積極的・条件解除", async () => {
    await resetSearch(page);
    await page.locator('label[for="search-favorite-only"]').click();
    assert.ok((await searchNames(page)).includes("テスト総合買取"));
    assert.equal((await searchNames(page)).includes("業者名だけテスト"), false);
    await resetSearch(page);
    await page.locator('#search-temperature [data-temperature="積極的"]').click();
    assert.ok((await searchNames(page)).includes("テスト総合買取"));
    assert.equal((await searchNames(page)).includes("業者名だけテスト"), false);
    await resetSearch(page);
    assert.equal(await page.locator("#search-query").inputValue(), "");
    assert.equal(await page.locator("#search-favorite-only").isChecked(), false);
  });

  await check("tel・mailtoと未登録時の非表示", async () => {
    await resetSearch(page);
    const full = page.locator("#search-results .company-card").filter({ has: page.getByRole("heading", { name: "テスト総合買取", exact: true }) });
    assert.equal(await full.locator('a[href^="tel:"]').getAttribute("href"), "tel:0451234567");
    assert.match(await full.locator('a[href^="mailto:"]').getAttribute("href"), /^mailto:info@example\.jp\?subject=/);
    const minimal = page.locator("#search-results .company-card").filter({ hasText: "業者名だけテスト" });
    assert.equal(await minimal.locator('a[href^="tel:"]').count(), 0);
    assert.equal(await minimal.locator('a[href^="mailto:"]').count(), 0);
  });

  await check("業者名・お気に入り・温度感・更新日・登録日順", async () => {
    await page.evaluate(async () => {
      await KCN.db.clearAllData();
      const base = {
        contactName: "", phone: "", email: "", areas: [], customArea: "", propertyTypes: [], memo: "", isSample: false
      };
      const rows = [
        { id: "sort-a", companyName: "株式会社10", isFavorite: false, temperature: "現在休止", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-04T00:00:00.000Z" },
        { id: "sort-b", companyName: "株式会社2", isFavorite: true, temperature: "通常", createdAt: "2026-08-04T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" },
        { id: "sort-c", companyName: "株式会社1", isFavorite: false, temperature: "積極的", createdAt: "2026-08-02T00:00:00.000Z", updatedAt: "2026-08-03T00:00:00.000Z" }
      ];
      for (const row of rows) await KCN.db.putCompany({ ...base, ...row });
      await KCN.app.reloadData();
      KCN.app.switchScreen("list");
    });
    await page.locator('#list-sort').selectOption("name");
    assert.deepEqual(await listNames(page), ["株式会社1", "株式会社2", "株式会社10"]);
    await page.locator('#list-sort').selectOption("favorite");
    assert.equal((await listNames(page))[0], "株式会社2");
    await page.locator('#list-sort').selectOption("temperature");
    assert.equal((await listNames(page))[0], "株式会社1");
    await page.locator('#list-sort').selectOption("updated");
    assert.equal((await listNames(page))[0], "株式会社10");
    await page.locator('#list-sort').selectOption("created");
    assert.equal((await listNames(page))[0], "株式会社2");
  });

  await check("JSON保存とCSV出力", async () => {
    await page.locator('[data-nav="other"]').click();
    const dataDetails = page.locator(".settings-card").filter({ hasText: "データのバックアップ" });
    await dataDetails.locator("summary").click();
    const [jsonDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.locator("#export-json").click()
    ]);
    const jsonPath = await jsonDownload.path();
    const backup = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    assert.equal(backup.format, "kaitori-company-note-backup");
    assert.equal(backup.companies.length, 3);
    assert.ok(backup.settings);

    const [csvDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.locator("#export-csv").click()
    ]);
    const csvPath = await csvDownload.path();
    const csv = fs.readFileSync(csvPath);
    assert.deepEqual([...csv.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    const csvText = csv.toString("utf8");
    assert.ok(csvText.includes('"業者名","担当者名","電話番号"'));
    assert.ok(csvText.includes("\r\n"));
  });

  await check("不正JSONを拒否し既存データを保持", async () => {
    const before = await page.evaluate(() => JSON.stringify(KCN.app.state.companies));
    await page.locator("#restore-file-input").setInputFiles({ name: "invalid.json", mimeType: "application/json", buffer: Buffer.from('{"format":"wrong","companies":[]}') });
    await page.locator("#toast").waitFor({ state: "visible" });
    assert.match(await page.locator("#toast-message").innerText(), /復元できません/);
    const after = await page.evaluate(() => JSON.stringify(KCN.app.state.companies));
    assert.equal(after, before);
  });

  await check("JSON追加復元", async () => {
    const payload = await page.evaluate(() => ({
      format: KCN.APP.backupFormat,
      appName: KCN.APP.displayName,
      appVersion: KCN.APP.version,
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      companies: [KCN.normalizeCompany({ id: "restore-add", companyName: "追加復元業者", temperature: "通常" })],
      settings: KCN.app.state.settings
    }));
    await page.locator("#restore-file-input").setInputFiles({ name: "add.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(payload)) });
    await page.locator("#restore-dialog").waitFor({ state: "visible" });
    await page.locator('input[name="restoreMode"][value="add"]').check();
    await page.locator('#restore-form button[type="submit"]').click();
    await page.locator("#restore-dialog").waitFor({ state: "hidden" });
    assert.equal(await page.evaluate(() => KCN.app.state.companies.some((c) => c.id === "restore-add")), true);
    assert.equal(await page.evaluate(() => KCN.app.state.companies.some((c) => c.id === "sort-a")), true);
  });

  await check("JSON置換復元", async () => {
    const payload = await page.evaluate(() => ({
      format: KCN.APP.backupFormat,
      appName: KCN.APP.displayName,
      appVersion: KCN.APP.version,
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      companies: [KCN.normalizeCompany({ id: "restore-only", companyName: "置換業者", phone: "03-5555-0000", temperature: "通常" })],
      settings: KCN.app.state.settings
    }));
    await page.locator("#restore-file-input").setInputFiles({ name: "replace.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(payload)) });
    await page.locator("#restore-dialog").waitFor({ state: "visible" });
    await page.locator('input[name="restoreMode"][value="replace"]').check();
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator('#restore-form button[type="submit"]').click();
    await page.locator("#restore-dialog").waitFor({ state: "hidden" });
    assert.deepEqual(await page.evaluate(() => KCN.app.state.companies.map((c) => c.id)), ["restore-only"]);
  });

  await check("同じ業者名と電話番号で重複警告・続行", async () => {
    await page.locator('[data-nav="search"]').click();
    await openNew(page);
    await page.locator("#company-name").fill("　置換業者　");
    await saveForm(page);
    await page.locator("#duplicate-warning").waitFor({ state: "visible" });
    assert.match(await page.locator("#duplicate-list").innerText(), /業者名/);
    await page.locator("#continue-duplicate-save").click();
    await page.locator("#company-dialog").waitFor({ state: "hidden" });

    await openNew(page);
    await page.locator("#company-name").fill("別名の会社");
    await page.locator("#company-phone").fill("(03) 5555-0000");
    await saveForm(page);
    await page.locator("#duplicate-warning").waitFor({ state: "visible" });
    assert.match(await page.locator("#duplicate-list").innerText(), /電話番号/);
    await page.locator("#continue-duplicate-save").click();
    await page.locator("#company-dialog").waitFor({ state: "hidden" });
  });

  await check("HTTP起動・IndexedDB・Console未処理エラーなし", async () => {
    assert.equal(await page.evaluate(() => KCN.db.getStorageMode()), "indexeddb");
    assert.equal(await page.locator("#loading-overlay").evaluate((dialog) => dialog.open), false);
    assert.equal(errors.length, 0, errors.join("\n"));
  });

  await context.close();
}

async function runResponsive(browser) {
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const errors = attachRuntimeMonitor(page, "responsive");
  await page.goto(httpUrl, { waitUntil: "domcontentloaded" });
  await waitForApp(page);
  await clearDatabase(page);
  await page.evaluate(async () => {
    await KCN.db.putCompany(KCN.normalizeCompany({
      id: "long-name",
      companyName: "とても長い業者名でもレイアウトを壊さないことを確認するためのサンプル株式会社横浜不動産買取センター",
      areas: ["横浜"], propertyTypes: ["土地"], temperature: "積極的", isFavorite: true
    }));
    await KCN.app.reloadData();
  });

  await check("390×844で操作・横スクロールなし・44pxタップ領域", async () => {
    assert.equal(await page.evaluate(() => innerWidth), 390);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), true);
    const sizes = await page.locator(".bottom-nav button, #add-company-fab, #search-area-chips .chip").evaluateAll((elements) => elements.filter((el) => {
      const style = getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden";
    }).map((el) => ({ w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height })));
    assert.equal(sizes.every((size) => size.w >= 44 && size.h >= 44), true, JSON.stringify(sizes));
    const unlabeledButtons = await page.locator("button:not([aria-label])").count();
    assert.equal(unlabeledButtons, 0);
    const cardFits = await page.locator("#search-results .company-card").first().evaluate((card) => card.scrollWidth <= card.clientWidth + 1);
    assert.equal(cardFits, true);
    await page.locator('#search-results [data-favorite-id="long-name"]').click();
    await page.waitForFunction(() => document.activeElement?.dataset.favoriteId === "long-name");
    await page.screenshot({ path: path.join(artifacts, "390x844-search.png"), fullPage: true });
  });

  await check("390×500でダイアログ最下部・固定見出し・保存操作", async () => {
    await page.setViewportSize({ width: 390, height: 500 });
    await openNew(page);
    const body = page.locator("#company-dialog .dialog-body");
    await body.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    const geometry = await page.evaluate(() => {
      const dialog = document.querySelector("#company-dialog");
      const header = dialog.querySelector(".dialog-header").getBoundingClientRect();
      const footer = dialog.querySelector(".dialog-footer").getBoundingClientRect();
      const save = document.querySelector("#save-company").getBoundingClientRect();
      const hit = document.elementFromPoint(save.left + save.width / 2, save.top + save.height / 2);
      const body = dialog.querySelector(".dialog-body");
      return {
        headerTop: header.top,
        footerBottom: footer.bottom,
        viewportHeight: innerHeight,
        bodyScrollable: body.scrollHeight > body.clientHeight,
        saveHit: hit === document.querySelector("#save-company") || document.querySelector("#save-company").contains(hit),
        horizontalOk: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
      };
    });
    assert.ok(geometry.headerTop >= 0);
    assert.ok(geometry.footerBottom <= geometry.viewportHeight + 1);
    assert.equal(geometry.bodyScrollable, true);
    assert.equal(geometry.saveHit, true);
    assert.equal(geometry.horizontalOk, true);
    await page.screenshot({ path: path.join(artifacts, "390x500-dialog.png") });
    await page.locator('[data-close-dialog="company-dialog"]').first().click();
  });

  await check("1440pxでPCレイアウトが崩れない", async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    assert.equal(await page.evaluate(() => innerWidth), 1440);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), true);
    const gridColumns = await page.locator(".search-layout").evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").filter(Boolean).length);
    assert.equal(gridColumns, 2);
    await page.screenshot({ path: path.join(artifacts, "1440-search.png"), fullPage: true });
  });

  await check("レスポンシブConsole未処理エラーなし", async () => {
    assert.equal(errors.length, 0, errors.join("\n"));
  });
  await context.close();
}

async function runFile(browser) {
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = attachRuntimeMonitor(page, "file");
  await page.goto(fileUrl, { waitUntil: "domcontentloaded" });
  await waitForApp(page);

  await check("file://直接起動・登録・再読込・検索・編集", async () => {
    assert.equal(await page.evaluate(() => location.protocol), "file:");
    await clearDatabase(page);
    await openNew(page);
    await page.locator("#company-name").fill("file起動テスト");
    await page.locator("#contact-name").fill("直接起動担当");
    await saveForm(page);
    await page.locator("#company-dialog").waitFor({ state: "hidden" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForApp(page);
    assert.equal(await page.evaluate(() => KCN.app.state.companies.some((c) => c.companyName === "file起動テスト")), true);
    await page.locator("#search-query").fill("直接起動担当");
    assert.ok((await searchNames(page)).includes("file起動テスト"));
    const card = page.locator("#search-results .company-card").filter({ hasText: "file起動テスト" });
    await card.getByRole("button", { name: /詳細/ }).click();
    await page.locator('[data-detail-action="edit"]').click();
    await page.locator("#company-name").fill("file起動編集済み");
    await saveForm(page);
    await page.locator("#company-dialog").waitFor({ state: "hidden" });
    assert.equal(await page.evaluate(() => KCN.app.state.companies.some((c) => c.companyName === "file起動編集済み")), true);
  });

  await check("file://でJSON・CSV出力", async () => {
    await page.locator('[data-nav="other"]').click();
    await page.locator(".settings-card").filter({ hasText: "データのバックアップ" }).locator("summary").click();
    const [jsonDownload] = await Promise.all([page.waitForEvent("download"), page.locator("#export-json").click()]);
    assert.ok((await jsonDownload.path()).length > 0);
    const [csvDownload] = await Promise.all([page.waitForEvent("download"), page.locator("#export-csv").click()]);
    assert.ok((await csvDownload.path()).length > 0);
  });

  await check("file://でService Worker未登録・Console未処理エラーなし", async () => {
    const registrations = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return 0;
      try {
        return (await navigator.serviceWorker.getRegistrations()).length;
      } catch (error) {
        return error.name === "SecurityError" ? 0 : -1;
      }
    });
    assert.equal(registrations, 0);
    assert.equal(errors.length, 0, errors.join("\n"));
  });
  await context.close();
}

async function runPwa(browser) {
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 390, height: 844 }, serviceWorkers: "allow" });
  const page = await context.newPage();
  const errors = attachRuntimeMonitor(page, "pwa");
  await page.goto(httpUrl, { waitUntil: "networkidle" });
  await waitForApp(page);

  await check("PWA manifest・Service Worker起動", async () => {
    const manifest = await page.evaluate(async () => {
      const link = document.querySelector('link[rel="manifest"]');
      const response = await fetch(link.href);
      return { status: response.status, json: await response.json() };
    });
    assert.equal(manifest.status, 200);
    assert.equal(manifest.json.name, "買取業者ノート");
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload({ waitUntil: "networkidle" });
    await waitForApp(page);
    assert.equal(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)), true);
    assert.equal(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).active.state), "activated");
  });

  await check("オフライン再起動・IndexedDBデータ保持", async () => {
    await page.evaluate(async () => {
      await KCN.db.clearAllData();
      await KCN.db.putCompany(KCN.normalizeCompany({ id: "offline-company", companyName: "オフライン業者", areas: ["横浜"], propertyTypes: ["土地"], temperature: "積極的" }));
      await KCN.app.reloadData();
    });
    await page.reload({ waitUntil: "networkidle" });
    await waitForApp(page);
    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForApp(page);
    assert.equal(await page.evaluate(() => KCN.app.state.companies.some((c) => c.id === "offline-company")), true);
    assert.notEqual(await page.locator(".bottom-nav").evaluate((element) => getComputedStyle(element).backgroundColor), "rgba(0, 0, 0, 0)");
    await context.setOffline(false);
  });

  await check("旧アプリキャッシュだけ削除し無関係キャッシュを保持", async () => {
    await page.evaluate(async () => {
      await caches.open("kaitori-company-note-v0-test");
      await caches.open("unrelated-app-cache");
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    });
    await page.reload({ waitUntil: "networkidle" });
    await waitForApp(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(async () => {
      const names = await caches.keys();
      return names.includes("kaitori-company-note-v1-prototype1") && !names.includes("kaitori-company-note-v0-test");
    });
    const names = await page.evaluate(() => caches.keys());
    assert.ok(names.includes("kaitori-company-note-v1-prototype1"));
    assert.equal(names.includes("kaitori-company-note-v0-test"), false);
    assert.equal(names.includes("unrelated-app-cache"), true);
  });

  await check("PWA・オフラインConsole未処理エラーなし", async () => {
    assert.equal(errors.length, 0, errors.join("\n"));
  });
  await context.close();
}

(async () => {
  let server;
  let browser;
  try {
    server = await startServer();
    browser = await chromium.launch({
      executablePath: edgePath,
      headless: true,
      args: ["--disable-gpu", "--no-first-run"]
    });
    await runFunctional(browser);
    await runResponsive(browser);
    await runFile(browser);
    await runPwa(browser);
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise((resolve) => server.close(resolve));
  }

  const failures = results.filter((result) => result.status === "FAIL");
  const summary = {
    generatedAt: new Date().toISOString(),
    passed: results.length - failures.length,
    failed: failures.length,
    results
  };
  fs.writeFileSync(path.join(artifacts, "browser-results.json"), JSON.stringify(summary, null, 2));
  console.log(`BROWSER RESULT: ${summary.passed} passed, ${summary.failed} failed`);
  if (failures.length) process.exitCode = 1;
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
