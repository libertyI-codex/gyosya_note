"use strict";

const assert = require("assert");
const fs = require("fs");
const http = require("http");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DB_NAME = "kaitori-company-note";

function loadChromium() {
  const candidates = [
    "playwright",
    path.resolve(path.dirname(process.execPath), "..", "node_modules", "playwright")
  ];
  let lastError;
  for (const candidate of candidates) {
    try {
      return require(candidate).chromium;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Playwright is not available.");
}

function findBrowserExecutable(chromium) {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    chromium.executablePath(),
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function startServer(html) {
  const server = http.createServer((request, response) => {
    const requestPath = decodeURIComponent((request.url || "/").split("?")[0]);
    if (requestPath === "/") {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end(html);
      return;
    }
    const relativePath = path.normalize(requestPath).replace(/^(\\|\/)+/, "");
    const filePath = path.resolve(ROOT, relativePath);
    if (!filePath.startsWith(`${ROOT}${path.sep}`) || !fs.existsSync(filePath)) {
      response.statusCode = 404;
      response.end("Not found");
      return;
    }
    response.setHeader("Content-Type", "application/javascript; charset=utf-8");
    response.end(fs.readFileSync(filePath));
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function main() {
  const rawCompany = {
    id: "legacy-company",
    companyName: " Legacy Co ",
    contactName: "Old Contact",
    phone: "(045) 000-0000",
    email: "OLD@example.test",
    areas: ["Legacy Area"],
    customArea: "Legacy Custom Area",
    propertyTypes: ["Legacy Property Type"],
    temperature: "legacy-temperature",
    isFavorite: true,
    memo: "Keep this byte-for-byte equivalent after upgrade.",
    isSample: false,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-02-02T00:00:00.000Z",
    legacyOnly: { nested: true, count: 7 }
  };
  const rawSettings = {
    id: "app-settings",
    areaOptions: ["Legacy Area"],
    propertyTypeOptions: ["Legacy Property Type"],
    defaultSort: "companyName",
    schemaVersion: 1,
    sampleInitialized: true,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-02-02T00:00:00.000Z",
    legacyOnly: { nested: "yes", count: 9 }
  };
  const html = `<!doctype html>
<meta charset="utf-8">
<script>
window.rawV1Company = ${JSON.stringify(rawCompany)};
window.rawV1Settings = ${JSON.stringify(rawSettings)};
window.v1Ready = new Promise((resolve, reject) => {
  const deletion = indexedDB.deleteDatabase(${JSON.stringify(DB_NAME)});
  deletion.onerror = () => reject(deletion.error);
  deletion.onblocked = () => reject(new Error("Database deletion was blocked."));
  deletion.onsuccess = () => {
    const request = indexedDB.open(${JSON.stringify(DB_NAME)}, 1);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const database = request.result;
      const companies = database.createObjectStore("companies", { keyPath: "id" });
      companies.createIndex("companyName", "companyName");
      companies.createIndex("updatedAt", "updatedAt");
      companies.createIndex("isFavorite", "isFavorite");
      database.createObjectStore("settings", { keyPath: "id" });
    };
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction(["companies", "settings"], "readwrite");
      transaction.objectStore("companies").add(window.rawV1Company);
      transaction.objectStore("settings").add(window.rawV1Settings);
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    };
  };
});
</script>
<script src="/js/constants.js"></script>
<script src="/js/utils.js"></script>
<script src="/js/db.js"></script>`;

  const chromium = loadChromium();
  const executablePath = findBrowserExecutable(chromium);
  assert.ok(executablePath, "A Chromium or Edge executable is required.");
  const server = await startServer(html);
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath });
    const page = await browser.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "load" });
    const result = await page.evaluate(async () => {
      await window.v1Ready;
      // These read APIs open the v2 database without initialize() changing settings.
      await window.KCN.db.getAllCompanies();
      await window.KCN.db.getSettings();
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(window.KCN.APP.dbName, window.KCN.APP.dbVersion);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const stores = Array.from(database.objectStoreNames);
          const transaction = database.transaction(
            ["companies", "settings", "cases", "caseResponses"],
            "readonly"
          );
          const companyRequest = transaction.objectStore("companies").get("legacy-company");
          const settingsRequest = transaction.objectStore("settings").get("app-settings");
          const caseIndexes = Array.from(transaction.objectStore("cases").indexNames);
          const responseStore = transaction.objectStore("caseResponses");
          const responseIndexes = Array.from(responseStore.indexNames);
          const caseCompanyIndex = responseStore.index("caseCompany");
          transaction.onerror = () => reject(transaction.error);
          transaction.oncomplete = () => {
            database.close();
            resolve({
              version: database.version,
              stores,
              rawCompany: companyRequest.result,
              rawSettings: settingsRequest.result,
              caseIndexes,
              responseIndexes,
              caseCompanyKeyPath: Array.from(caseCompanyIndex.keyPath),
              caseCompanyUnique: caseCompanyIndex.unique
            });
          };
        };
      });
    });

    assert.deepStrictEqual(result.rawCompany, rawCompany, "v1 companies raw record must remain unchanged");
    assert.deepStrictEqual(result.rawSettings, rawSettings, "v1 settings raw record must remain unchanged");
    assert.strictEqual(result.version, 2);
    ["companies", "settings", "cases", "caseResponses"].forEach((store) => {
      assert.ok(result.stores.includes(store), `Missing object store: ${store}`);
    });
    ["caseName", "updatedAt", "createdAt", "status", "area", "caseType"].forEach((index) => {
      assert.ok(result.caseIndexes.includes(index), `Missing cases index: ${index}`);
    });
    ["caseId", "companyId", "responseStatus", "responseDate", "followUpDate", "updatedAt", "caseCompany"].forEach((index) => {
      assert.ok(result.responseIndexes.includes(index), `Missing caseResponses index: ${index}`);
    });
    assert.deepStrictEqual(result.caseCompanyKeyPath, ["caseId", "companyId"]);
    assert.strictEqual(result.caseCompanyUnique, true);
    assert.deepStrictEqual(pageErrors, [], "No unhandled page errors are allowed");
    console.log("PASS v1 raw companies/settings are unchanged after v2 upgrade");
    console.log("PASS v2 cases/caseResponses stores and indexes");
    console.log("DB MIGRATION V2 RESULT: 2 tests passed");
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
