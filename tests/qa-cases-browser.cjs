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
const port = 8766;
const url = `http://127.0.0.1:${port}/`;
fs.mkdirSync(artifacts, { recursive: true });

const mime = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml", ".md": "text/markdown" };

function server() {
  const instance = http.createServer((request, response) => {
    try {
      let pathname = decodeURIComponent(new URL(request.url, url).pathname);
      if (!pathname || pathname.endsWith("/")) pathname += "index.html";
      const file = path.resolve(root, pathname.replace(/^\/+/, ""));
      if ((!file.startsWith(root + path.sep) && file !== root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        response.writeHead(404); response.end("Not found"); return;
      }
      response.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
      fs.createReadStream(file).pipe(response);
    } catch (error) { response.writeHead(500); response.end(String(error)); }
  });
  return new Promise((resolve, reject) => { instance.once("error", reject); instance.listen(port, "127.0.0.1", () => resolve(instance)); });
}

const results = [];
async function check(name, fn) {
  try { await fn(); results.push({ name, status: "PASS" }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, status: "FAIL", error: error.stack || String(error) }); console.error(`FAIL ${name}: ${error.message}`); throw error; }
}

async function ready(page) {
  await page.waitForFunction(() => window.KCN && KCN.app && KCN.app.state.initialized && KCN.caseUI && KCN.caseUI.isInitialized(), null, { timeout: 20000 });
}

async function closeIfOpen(page, selector) {
  await page.evaluate((id) => { const dialog = document.querySelector(id); if (dialog && dialog.open) KCN.app.closeDialog(dialog, { force: true }); }, selector);
}

async function seedCompanies(page) {
  await page.evaluate(async () => {
    const rows = [
      { id: "company-a", companyName: "横浜積極買取", contactName: "山田", phone: "045-111-1111", email: "a@example.jp", areas: ["横浜"], propertyTypes: ["戸建", "土地"], temperature: "積極的", isFavorite: true },
      { id: "company-b", companyName: "神奈川通常買取", contactName: "佐藤", phone: "045-222-2222", email: "b@example.jp", areas: ["神奈川県全域"], propertyTypes: ["戸建"], temperature: "通常", isFavorite: false },
      { id: "company-c", companyName: "対象外サンプル", contactName: "鈴木", phone: "", email: "", areas: ["東京都"], propertyTypes: ["ビル"], temperature: "現在休止", isFavorite: false }
    ];
    for (const row of rows) await KCN.db.putCompany(KCN.normalizeCompany(row));
    await KCN.app.reloadData();
  });
}

async function openCaseCard(page, name) {
  const clicked = await page.locator("#case-list .case-card").evaluateAll((cards, exactName) => {
    const card = cards.find((element) => element.querySelector("h3")?.textContent.trim() === exactName);
    if (!card) return false;
    card.querySelector("[data-open-case-id]").click();
    return true;
  }, name);
  assert.equal(clicked, true, `案件カードが見つかりません: ${name}`);
  await page.locator("#case-detail-dialog").waitFor({ state: "visible" });
}

(async () => {
  let httpServer;
  let browser;
  const runtimeErrors = [];
  try {
    httpServer = await server();
    browser = await chromium.launch({ executablePath: edgePath, headless: true, args: ["--disable-gpu", "--no-first-run"] });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
    const page = await context.newPage();
    page.on("pageerror", (error) => runtimeErrors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => { if (message.type() === "error") runtimeErrors.push(`console.error: ${message.text()}`); });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await ready(page);
    await page.evaluate(async () => { await KCN.db.clearAllData(); await KCN.app.reloadData(); });
    await seedCompanies(page);

    await check("下部4ナビと案件FAB文脈", async () => {
      assert.deepEqual((await page.locator("[data-nav]").allTextContents()).map((text) => text.trim()), ["探す", "案件", "業者", "その他"]);
      await page.locator('[data-nav="cases"]').click();
      assert.equal(await page.locator("#add-company-fab").getAttribute("aria-label"), "新しい案件を登録");
      assert.equal(await page.locator("#add-company-fab").getAttribute("title"), "新しい案件を登録");
    });

    await check("案件名だけで保存", async () => {
      await page.locator("#add-company-fab").click();
      await page.locator("#case-name").fill("案件名だけテスト");
      await page.locator("#save-case").click();
      await page.locator("#case-dialog").waitFor({ state: "hidden" });
      const item = await page.evaluate(() => KCN.caseUI.getState().cases.find((entry) => entry.caseName === "案件名だけテスト"));
      assert.ok(item);
      assert.equal(item.caseType, "");
      assert.equal(item.askingPrice, null);
    });

    await check("案件全項目・単一種別・複数要因・0と未入力を保存", async () => {
      await page.locator("#add-company-fab").click();
      await page.locator("#case-name").fill("横浜市南区・古家付き土地");
      await page.locator("#case-location").fill("横浜市南区○○町");
      await page.locator("#case-area").selectOption({ label: "横浜" });
      await page.locator('#case-type [data-case-type-value="detached-single-lot"]').click();
      await page.locator("#case-status").selectOption("買取打診中");
      await page.locator(".case-more-fields > summary").click();
      await page.locator('[data-case-factor-value="development"]').click();
      await page.locator('[data-case-factor-value="rebuild-impossible"]').click();
      await page.locator("#asking-price").fill("3000");
      await page.locator("#land-area").fill("100.5");
      await page.locator("#building-area").fill("0");
      await page.locator("#case-memo").fill("造成と再建築不可を確認中");
      await page.locator("#save-case").click();
      await page.locator("#case-dialog").waitFor({ state: "hidden" });
      const item = await page.evaluate(() => KCN.caseUI.getState().cases.find((entry) => entry.caseName.includes("横浜市南区")));
      assert.equal(item.caseType, "detached-single-lot");
      assert.deepEqual(item.factors, ["development", "rebuild-impossible"]);
      assert.equal(item.askingPrice, 30000000);
      assert.equal(item.landArea, 100.5);
      assert.equal(item.buildingArea, 0);
    });

    await check("案件を編集・複製", async () => {
      await openCaseCard(page, "横浜市南区・古家付き土地");
      await page.locator("#case-detail-edit").click();
      await page.locator("#case-location").fill("横浜市南区更新町");
      await page.locator("#save-case").click();
      await page.locator("#case-dialog").waitFor({ state: "hidden" });
      assert.equal(await page.evaluate(() => KCN.caseUI.getState().cases.find((item) => item.caseName.includes("横浜市南区")).location), "横浜市南区更新町");
      await page.locator("#case-detail-duplicate").click();
      assert.match(await page.locator("#case-name").inputValue(), /（複製）$/);
      await page.locator("#save-case").click();
      await page.locator("#case-dialog").waitFor({ state: "hidden" });
      assert.equal(await page.evaluate(() => KCN.caseUI.getState().cases.filter((item) => item.caseName.startsWith("横浜市南区")).length), 2);
      await closeIfOpen(page, "#case-detail-dialog");
    });

    await check("おすすめ順と複数社一括追加・重複除外", async () => {
      await openCaseCard(page, "横浜市南区・古家付き土地");
      await page.locator("#case-add-companies").click();
      const names = await page.locator("#quick-company-list .selectable-company strong").allTextContents();
      assert.match(names[0], /横浜積極買取/);
      await page.locator('[data-select-company-id="company-a"]').check();
      await page.locator('[data-select-company-id="company-b"]').check();
      assert.match(await page.locator("#add-selected-companies").innerText(), /2社/);
      await page.locator("#add-selected-companies").click();
      await page.locator("#quick-company-dialog").waitFor({ state: "hidden" });
      assert.equal(await page.evaluate(() => KCN.caseUI.getState().responses.length), 2);
      assert.equal(await page.evaluate(() => KCN.caseUI.getState().responses.every((item) => item.responseStatus === "打診済み")), true);
      await page.locator("#case-add-companies").click();
      assert.equal(await page.locator('[data-select-company-id="company-a"]').count(), 0);
      await closeIfOpen(page, "#quick-company-dialog");
    });

    await check("回答状況・金額・理由・関連要因・次回確認・メモを保存", async () => {
      const card = page.locator("#case-response-list .response-card").filter({ hasText: "横浜積極買取" });
      await card.locator("[data-edit-response-id]").click();
      await page.locator("#response-status").selectOption("金額回答");
      await page.locator("#response-amount").fill("200");
      await page.locator("#response-more-fields > summary").click();
      await page.locator("#response-date").fill("2026-08-04");
      await page.locator("#response-reason").selectOption("条件付きなら検討可");
      await page.locator('[data-response-factor-value="development"]').click();
      await page.locator("#response-follow-up-date").fill("2026-08-05");
      await page.locator("#response-memo").fill("現況引渡し・概算回答");
      await page.locator("#save-response").click();
      await page.locator("#response-dialog").waitFor({ state: "hidden" });
      const response = await page.evaluate(() => KCN.caseUI.getState().responses.find((item) => item.companyId === "company-a"));
      assert.equal(response.responseAmount, 2000000);
      assert.equal(response.responseReason, "条件付きなら検討可");
      assert.deepEqual(response.responseFactors, ["development"]);
      assert.equal(response.followUpDate, "2026-08-05");
    });

    await check("回答待ち・金額順・未登録連絡ボタン", async () => {
      const waiting = page.locator("#case-response-list .response-card").filter({ hasText: "神奈川通常買取" });
      await waiting.locator("[data-edit-response-id]").click();
      await page.locator("#response-status").selectOption("回答待ち");
      await page.locator("#save-response").click();
      await page.locator("#response-dialog").waitFor({ state: "hidden" });
      assert.match(await page.locator("#case-response-list .response-card").first().innerText(), /横浜積極買取/);
      await page.locator("#response-sort").selectOption("amount");
      assert.match(await page.locator("#case-response-list .response-card").first().innerText(), /200万円/);
    });

    await check("業者詳細で回答履歴・案件リンク・集計", async () => {
      await page.locator("#case-response-list .response-card").filter({ hasText: "横浜積極買取" }).locator("[data-detail-id]").click();
      await page.locator("#detail-dialog").waitFor({ state: "visible" });
      const history = await page.locator(".company-history").innerText();
      assert.match(history, /過去回答/);
      assert.match(history, /戸建1宅地/);
      assert.match(history, /造成/);
      assert.equal(await page.locator(".company-history [data-open-case-id]").count(), 1);
      await closeIfOpen(page, "#detail-dialog");
    });

    await check("回答履歴のある業者はアーカイブし過去回答を保持", async () => {
      await page.evaluate(() => KCN.app.openDetail("company-a"));
      await page.locator("#detail-dialog").waitFor({ state: "visible" });
      page.once("dialog", (dialog) => dialog.accept());
      await page.locator('[data-detail-action="delete"]').click();
      await page.waitForFunction(() => KCN.app.state.companies.find((item) => item.id === "company-a")?.isArchived === true);
      assert.equal(await page.evaluate(() => KCN.caseUI.getState().responses.some((item) => item.companyId === "company-a")), true);
      await closeIfOpen(page, "#case-detail-dialog");
      await page.locator('[data-nav="list"]').click();
      assert.equal(await page.locator("#company-list").getByText("横浜積極買取").count(), 0);
      await page.locator('[data-nav="other"]').click();
      const settingsDetails = page.locator(".settings-card").filter({ hasText: "詳細設定" });
      if (!(await settingsDetails.getAttribute("open"))) await settingsDetails.locator("summary").click();
      await page.locator("#open-advanced-settings").click();
      assert.match(await page.locator("#archived-company-list").innerText(), /横浜積極買取/);
      await page.locator('[data-restore-company-id="company-a"]').click();
      await page.waitForFunction(() => KCN.app.state.companies.find((item) => item.id === "company-a")?.isArchived === false);
      await closeIfOpen(page, "#advanced-settings-dialog");
    });

    await check("案件検索・種別・要因・回答待ち絞り込み", async () => {
      await page.locator('[data-nav="cases"]').click();
      await page.locator("#case-query").fill("現況引渡し 横浜積極買取");
      assert.equal(await page.locator("#case-list .case-card").count(), 1);
      await page.locator("#case-filter-details > summary").click();
      await page.locator("#clear-case-filters").click();
      await page.locator("#case-type-filter").selectOption("detached-single-lot");
      assert.ok(await page.locator("#case-list .case-card").count() >= 2);
      await page.locator("#case-factor-filter").selectOption("development");
      assert.ok(await page.locator("#case-list .case-card").count() >= 2);
      await page.locator("#case-progress-filter").selectOption("回答待ち");
      assert.ok(await page.locator("#case-list .case-card").count() >= 1);
      await page.locator("#clear-case-filters").click();
    });

    await check("類似案件は自分を除外し種別・要因・エリアを表示", async () => {
      await page.evaluate(async () => {
        await KCN.db.putCase(KCN.normalizeCase({ id: "similar-case", caseName: "横浜類似案件", area: "横浜", caseType: "detached-single-lot", factors: ["development"], status: "相談中" }));
        await KCN.caseUI.reload();
      });
      await openCaseCard(page, "横浜市南区・古家付き土地");
      await page.locator("#case-find-similar").click();
      assert.match(await page.locator("#similar-cases-list").innerText(), /横浜類似案件/);
      const sourceId = await page.locator("#similar-source-case-id").inputValue();
      assert.equal(await page.locator(`#similar-cases-list [data-open-case-id="${sourceId}"]`).count(), 0);
      await closeIfOpen(page, "#similar-cases-dialog");
      await closeIfOpen(page, "#case-detail-dialog");
    });

    await check("次回確認区分と案件・回答CSV（回答0件含む）", async () => {
      await page.locator('[data-nav="other"]').click();
      assert.match(await page.locator("#follow-up-overview").innerText(), /期限超過|今日|7日以内/);
      const dataDetails = page.locator(".settings-card").filter({ hasText: "データのバックアップ" });
      if (!(await dataDetails.getAttribute("open"))) await dataDetails.locator("summary").click();
      const [download] = await Promise.all([page.waitForEvent("download"), page.locator("#export-cases-csv").click()]);
      const csv = fs.readFileSync(await download.path());
      assert.deepEqual([...csv.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
      const text = csv.toString("utf8");
      assert.ok(text.includes("案件名だけテスト"));
      assert.ok(text.includes("横浜積極買取"));
      assert.ok(text.includes("\r\n"));
    });

    await check("案件削除は回答も同一操作で削除", async () => {
      await page.locator('[data-nav="cases"]').click();
      await openCaseCard(page, "横浜市南区・古家付き土地");
      let message = "";
      page.once("dialog", async (dialog) => { message = dialog.message(); await dialog.accept(); });
      await page.locator("#case-detail-delete").click();
      await page.waitForFunction(() => !KCN.caseUI.getState().cases.some((item) => item.caseName === "横浜市南区・古家付き土地"));
      assert.match(message, /2社分の回答も削除/);
      assert.equal(await page.evaluate(() => KCN.caseUI.getState().responses.length), 0);
    });

    await check("390×844・390×500で横スクロールなし、ダイアログ最下部操作", async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('[data-nav="cases"]').click();
      await page.screenshot({ path: path.join(artifacts, "390x844-cases.png"), fullPage: true });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
      await page.setViewportSize({ width: 390, height: 500 });
      await page.locator("#add-company-fab").click();
      await page.locator("#case-name").fill("短画面テスト");
      await page.locator("#case-dialog .dialog-body").evaluate((element) => { element.scrollTop = element.scrollHeight; });
      assert.equal(await page.locator("#save-case").isVisible(), true);
      await page.screenshot({ path: path.join(artifacts, "390x500-case-dialog.png") });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
      await closeIfOpen(page, "#case-dialog");
    });

    await check("1440px案件表示とConsole未処理エラーなし", async () => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.screenshot({ path: path.join(artifacts, "1440-cases.png"), fullPage: true });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
      assert.equal(runtimeErrors.length, 0, runtimeErrors.join("\n"));
    });

    await context.close();

    const fileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const filePage = await fileContext.newPage();
    const fileErrors = [];
    filePage.on("pageerror", (error) => fileErrors.push(error.message));
    filePage.on("console", (message) => { if (message.type() === "error") fileErrors.push(message.text()); });
    await filePage.goto(pathToFileURL(path.join(root, "index.html")).href, { waitUntil: "domcontentloaded" });
    await ready(filePage);
    await check("file://で案件・回答ストアを利用", async () => {
      await filePage.evaluate(async () => {
        await KCN.db.clearAllData();
        await KCN.db.putCompany(KCN.normalizeCompany({ id: "file-company", companyName: "file業者" }));
        await KCN.db.putCase(KCN.normalizeCase({ id: "file-case", caseName: "file案件", caseType: "land" }));
        await KCN.db.putCaseResponse(KCN.normalizeCaseResponse({ id: "file-response", caseId: "file-case", companyId: "file-company", responseStatus: "回答待ち" }));
        await KCN.app.reloadData();
      });
      await filePage.reload({ waitUntil: "domcontentloaded" });
      await ready(filePage);
      assert.equal(await filePage.evaluate(() => KCN.caseUI.getState().cases.some((item) => item.id === "file-case")), true);
      assert.equal(await filePage.evaluate(() => KCN.caseUI.getState().responses.some((item) => item.id === "file-response")), true);
      assert.equal(await filePage.evaluate(() => navigator.serviceWorker ? Boolean(navigator.serviceWorker.controller) : false), false);
      assert.equal(fileErrors.length, 0, fileErrors.join("\n"));
    });
    await fileContext.close();
  } finally {
    if (browser) await browser.close();
    if (httpServer) await new Promise((resolve) => httpServer.close(resolve));
    fs.writeFileSync(path.join(artifacts, "cases-browser-results.json"), JSON.stringify(results, null, 2));
  }
  const failed = results.filter((item) => item.status === "FAIL");
  console.log(`CASES BROWSER RESULT: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exitCode = 1;
})().catch((error) => { console.error(error); process.exitCode = 1; });
