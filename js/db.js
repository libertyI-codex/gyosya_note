(function (global) {
  "use strict";

  const KCN = global.KCN;
  let databasePromise = null;
  let databaseConnection = null;
  let mode = "indexeddb";

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDBの処理に失敗しました。"));
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error || new Error("IndexedDBの処理が中断されました。"));
      transaction.onerror = () => reject(transaction.error || new Error("IndexedDBの処理に失敗しました。"));
    });
  }

  async function abortTransaction(transaction, done, error) {
    try {
      transaction.abort();
    } catch (abortError) {
      // The transaction may already have been aborted by a failed request.
    }
    await done.catch(() => undefined);
    throw error;
  }

  function ensureIndex(store, name, keyPath, options) {
    if (!store.indexNames.contains(name)) store.createIndex(name, keyPath, options || { unique: false });
  }

  function openIndexedDb() {
    if (!global.indexedDB) return Promise.reject(new Error("IndexedDBを利用できません。"));
    return new Promise((resolve, reject) => {
      let blocked = false;
      const request = global.indexedDB.open(KCN.APP.dbName, KCN.APP.dbVersion);
      request.onupgradeneeded = (event) => {
        const db = request.result;
        const upgradeTransaction = request.transaction;
        let companyStore;
        if (!db.objectStoreNames.contains(KCN.APP.companyStore)) {
          companyStore = db.createObjectStore(KCN.APP.companyStore, { keyPath: "id" });
        } else {
          companyStore = upgradeTransaction.objectStore(KCN.APP.companyStore);
        }
        ensureIndex(companyStore, "companyName", "companyName");
        ensureIndex(companyStore, "updatedAt", "updatedAt");
        ensureIndex(companyStore, "isFavorite", "isFavorite");
        ensureIndex(companyStore, "isArchived", "isArchived");
        ensureIndex(companyStore, "archivedAt", "archivedAt");

        let settingsStore;
        if (!db.objectStoreNames.contains(KCN.APP.settingsStore)) {
          settingsStore = db.createObjectStore(KCN.APP.settingsStore, { keyPath: "id" });
        } else {
          settingsStore = upgradeTransaction.objectStore(KCN.APP.settingsStore);
        }

        let caseStore;
        if (!db.objectStoreNames.contains(KCN.APP.caseStore)) {
          caseStore = db.createObjectStore(KCN.APP.caseStore, { keyPath: "id" });
        } else {
          caseStore = upgradeTransaction.objectStore(KCN.APP.caseStore);
        }
        ensureIndex(caseStore, "caseName", "caseName");
        ensureIndex(caseStore, "updatedAt", "updatedAt");
        ensureIndex(caseStore, "createdAt", "createdAt");
        ensureIndex(caseStore, "status", "status");
        ensureIndex(caseStore, "area", "area");
        ensureIndex(caseStore, "caseType", "caseType");

        let responseStore;
        if (!db.objectStoreNames.contains(KCN.APP.responseStore)) {
          responseStore = db.createObjectStore(KCN.APP.responseStore, { keyPath: "id" });
        } else {
          responseStore = upgradeTransaction.objectStore(KCN.APP.responseStore);
        }
        ensureIndex(responseStore, "caseId", "caseId");
        ensureIndex(responseStore, "companyId", "companyId");
        ensureIndex(responseStore, "responseStatus", "responseStatus");
        ensureIndex(responseStore, "responseDate", "responseDate");
        ensureIndex(responseStore, "followUpDate", "followUpDate");
        ensureIndex(responseStore, "updatedAt", "updatedAt");
        ensureIndex(responseStore, "caseCompany", ["caseId", "companyId"], { unique: true });
      };
      request.onsuccess = () => {
        const db = request.result;
        if (blocked) {
          db.close();
          return;
        }
        databaseConnection = db;
        db.onversionchange = () => {
          db.close();
          if (databaseConnection === db) databaseConnection = null;
          databasePromise = null;
        };
        db.onclose = () => {
          if (databaseConnection === db) databaseConnection = null;
          databasePromise = null;
        };
        resolve(db);
      };
      request.onerror = () => reject(request.error || new Error("データベースを開けませんでした。"));
      request.onblocked = () => {
        blocked = true;
        reject(new Error("別の画面がデータベース更新を妨げています。"));
      };
    });
  }

  function emptyFallback() {
    return { companies: [], cases: [], caseResponses: [], settings: null };
  }

  function readFallback() {
    try {
      const parsed = JSON.parse(global.localStorage.getItem(KCN.APP.localFallbackKey) || "null");
      if (parsed && Array.isArray(parsed.companies) && parsed.settings) {
        return {
          companies: parsed.companies,
          cases: Array.isArray(parsed.cases) ? parsed.cases : [],
          caseResponses: Array.isArray(parsed.caseResponses) ? parsed.caseResponses : [],
          settings: parsed.settings
        };
      }
    } catch (error) {
      console.warn("端末内フォールバックデータを読めませんでした。", error);
    }
    return emptyFallback();
  }

  function writeFallback(data) {
    global.localStorage.setItem(KCN.APP.localFallbackKey, JSON.stringify(data));
  }

  async function getDatabase() {
    if (!databasePromise) {
      databasePromise = openIndexedDb().catch((error) => {
        console.warn("IndexedDBを利用できないため端末内フォールバックを使用します。", error);
        mode = "localstorage";
        return null;
      });
    }
    return databasePromise;
  }

  async function initialize() {
    const db = await getDatabase();
    const now = KCN.isoNow();
    if (!db) {
      const data = readFallback();
      let settings = data.settings ? { ...KCN.DEFAULT_SETTINGS, ...data.settings } : clone(KCN.DEFAULT_SETTINGS);
      if (!settings.sampleInitialized) {
        const existingIds = new Set(data.companies.map((company) => company.id));
        KCN.SAMPLE_COMPANIES.forEach((sample) => {
          if (!existingIds.has(sample.id)) data.companies.push(KCN.normalizeCompany({ ...sample, createdAt: now, updatedAt: now }));
        });
        settings.sampleInitialized = true;
      }
      settings.schemaVersion = KCN.APP.schemaVersion;
      settings.updatedAt = now;
      data.settings = settings;
      writeFallback(data);
      return clone(settings);
    }

    const transaction = db.transaction([KCN.APP.companyStore, KCN.APP.settingsStore], "readwrite");
    const done = transactionDone(transaction);
    const companyStore = transaction.objectStore(KCN.APP.companyStore);
    const settingsStore = transaction.objectStore(KCN.APP.settingsStore);
    const requests = [settingsStore.get(KCN.APP.settingsId), ...KCN.SAMPLE_COMPANIES.map((sample) => companyStore.get(sample.id))];
    const values = await Promise.all(requests.map(requestResult));
    let settings = values[0] ? { ...KCN.DEFAULT_SETTINGS, ...values[0] } : clone(KCN.DEFAULT_SETTINGS);
    if (!settings.sampleInitialized) {
      KCN.SAMPLE_COMPANIES.forEach((sample, index) => {
        if (!values[index + 1]) companyStore.put(KCN.normalizeCompany({ ...sample, createdAt: now, updatedAt: now }));
      });
      settings.sampleInitialized = true;
    }
    settings.schemaVersion = KCN.APP.schemaVersion;
    settings.updatedAt = now;
    settingsStore.put(settings);
    await done;
    return clone(settings);
  }

  async function getAllCompanies(options) {
    const opts = options || {};
    const db = await getDatabase();
    let companies;
    if (!db) {
      companies = clone(readFallback().companies).map((company) => KCN.normalizeCompany(company));
    } else {
      const transaction = db.transaction(KCN.APP.companyStore, "readonly");
      const done = transactionDone(transaction);
      const values = await requestResult(transaction.objectStore(KCN.APP.companyStore).getAll());
      await done;
      companies = values.map((company) => KCN.normalizeCompany(company));
    }
    return opts.includeArchived === false ? companies.filter((company) => !company.isArchived) : companies;
  }

  async function getArchivedCompanies() {
    return (await getAllCompanies()).filter((company) => company.isArchived);
  }

  async function getCompany(id) {
    const normalizedId = KCN.cleanSingleLine(id);
    const db = await getDatabase();
    if (!db) {
      const value = readFallback().companies.find((company) => company.id === normalizedId);
      return value ? KCN.normalizeCompany(clone(value)) : null;
    }
    const transaction = db.transaction(KCN.APP.companyStore, "readonly");
    const done = transactionDone(transaction);
    const value = await requestResult(transaction.objectStore(KCN.APP.companyStore).get(normalizedId));
    await done;
    return value ? KCN.normalizeCompany(value) : null;
  }

  async function putCompany(rawCompany) {
    const company = KCN.normalizeCompany(rawCompany);
    if (!company.companyName) throw new Error("業者名を入力してください。");
    const db = await getDatabase();
    if (!db) {
      const data = readFallback();
      const index = data.companies.findIndex((item) => item.id === company.id);
      if (index >= 0) data.companies[index] = company;
      else data.companies.push(company);
      writeFallback(data);
      return clone(company);
    }
    const transaction = db.transaction(KCN.APP.companyStore, "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore(KCN.APP.companyStore).put(company);
    await done;
    return clone(company);
  }

  async function setCompanyArchived(id, archived) {
    const normalizedId = KCN.cleanSingleLine(id);
    const shouldArchive = archived === true;
    const db = await getDatabase();
    if (!db) {
      const data = readFallback();
      const index = data.companies.findIndex((company) => company.id === normalizedId);
      if (index < 0) throw new Error("業者情報が見つかりません。");
      const updated = KCN.normalizeCompany({
        ...data.companies[index],
        isArchived: shouldArchive,
        archivedAt: shouldArchive ? KCN.isoNow() : null,
        updatedAt: KCN.isoNow()
      });
      data.companies[index] = updated;
      writeFallback(data);
      return clone(updated);
    }
    const transaction = db.transaction(KCN.APP.companyStore, "readwrite");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(KCN.APP.companyStore);
    const existing = await requestResult(store.get(normalizedId));
    if (!existing) return abortTransaction(transaction, done, new Error("業者情報が見つかりません。"));
    const updated = KCN.normalizeCompany({
      ...existing,
      isArchived: shouldArchive,
      archivedAt: shouldArchive ? KCN.isoNow() : null,
      updatedAt: KCN.isoNow()
    });
    store.put(updated);
    await done;
    return clone(updated);
  }

  function archiveCompany(id) {
    return setCompanyArchived(id, true);
  }

  function restoreCompany(id) {
    return setCompanyArchived(id, false);
  }

  async function deleteCompany(id) {
    const normalizedId = KCN.cleanSingleLine(id);
    const db = await getDatabase();
    if (!db) {
      const data = readFallback();
      if (data.caseResponses.some((response) => response.companyId === normalizedId)) {
        throw new Error("回答履歴がある業者は完全削除を使用してください。");
      }
      data.companies = data.companies.filter((company) => company.id !== normalizedId);
      writeFallback(data);
      return;
    }
    const transaction = db.transaction([KCN.APP.companyStore, KCN.APP.responseStore], "readwrite");
    const done = transactionDone(transaction);
    const responseStore = transaction.objectStore(KCN.APP.responseStore);
    const linkedKey = await requestResult(responseStore.index("companyId").getKey(normalizedId));
    if (linkedKey !== undefined) return abortTransaction(transaction, done, new Error("回答履歴がある業者は完全削除を使用してください。"));
    transaction.objectStore(KCN.APP.companyStore).delete(normalizedId);
    await done;
  }

  async function deleteCompanyWithResponses(id) {
    const normalizedId = KCN.cleanSingleLine(id);
    const db = await getDatabase();
    if (!db) {
      const data = readFallback();
      const company = data.companies.find((item) => item.id === normalizedId) || null;
      const responses = data.caseResponses.filter((response) => response.companyId === normalizedId);
      data.companies = data.companies.filter((item) => item.id !== normalizedId);
      data.caseResponses = data.caseResponses.filter((response) => response.companyId !== normalizedId);
      writeFallback(data);
      return { company: company ? KCN.normalizeCompany(company) : null, responses: responses.map(KCN.normalizeCaseResponse), deletedResponses: responses.length };
    }
    const transaction = db.transaction([KCN.APP.companyStore, KCN.APP.responseStore], "readwrite");
    const done = transactionDone(transaction);
    const companyStore = transaction.objectStore(KCN.APP.companyStore);
    const responseStore = transaction.objectStore(KCN.APP.responseStore);
    const [company, responses] = await Promise.all([
      requestResult(companyStore.get(normalizedId)),
      requestResult(responseStore.index("companyId").getAll(normalizedId))
    ]);
    responses.forEach((response) => responseStore.delete(response.id));
    companyStore.delete(normalizedId);
    await done;
    return {
      company: company ? KCN.normalizeCompany(company) : null,
      responses: responses.map(KCN.normalizeCaseResponse),
      deletedResponses: responses.length
    };
  }

  async function getSettings() {
    const db = await getDatabase();
    if (!db) return clone({ ...KCN.DEFAULT_SETTINGS, ...(readFallback().settings || {}) });
    const transaction = db.transaction(KCN.APP.settingsStore, "readonly");
    const done = transactionDone(transaction);
    const settings = await requestResult(transaction.objectStore(KCN.APP.settingsStore).get(KCN.APP.settingsId));
    await done;
    return clone({ ...KCN.DEFAULT_SETTINGS, ...(settings || {}), schemaVersion: KCN.APP.schemaVersion });
  }

  async function putSettings(rawSettings) {
    const current = await getSettings();
    const settings = {
      ...current,
      ...(rawSettings || {}),
      id: KCN.APP.settingsId,
      areaOptions: KCN.uniqueStrings((rawSettings && rawSettings.areaOptions) || current.areaOptions),
      propertyTypeOptions: KCN.uniqueStrings((rawSettings && rawSettings.propertyTypeOptions) || current.propertyTypeOptions),
      schemaVersion: KCN.APP.schemaVersion,
      updatedAt: KCN.isoNow()
    };
    const db = await getDatabase();
    if (!db) {
      const data = readFallback();
      data.settings = settings;
      writeFallback(data);
      return clone(settings);
    }
    const transaction = db.transaction(KCN.APP.settingsStore, "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore(KCN.APP.settingsStore).put(settings);
    await done;
    return clone(settings);
  }

  async function getAllCases() {
    const db = await getDatabase();
    if (!db) return clone(readFallback().cases).map(KCN.normalizeCase);
    const transaction = db.transaction(KCN.APP.caseStore, "readonly");
    const done = transactionDone(transaction);
    const values = await requestResult(transaction.objectStore(KCN.APP.caseStore).getAll());
    await done;
    return values.map(KCN.normalizeCase);
  }

  async function getCase(id) {
    const normalizedId = KCN.cleanSingleLine(id);
    const db = await getDatabase();
    if (!db) {
      const value = readFallback().cases.find((caseRecord) => caseRecord.id === normalizedId);
      return value ? KCN.normalizeCase(clone(value)) : null;
    }
    const transaction = db.transaction(KCN.APP.caseStore, "readonly");
    const done = transactionDone(transaction);
    const value = await requestResult(transaction.objectStore(KCN.APP.caseStore).get(normalizedId));
    await done;
    return value ? KCN.normalizeCase(value) : null;
  }

  async function putCase(rawCase) {
    const caseRecord = KCN.normalizeCase(rawCase);
    if (!caseRecord.caseName) throw new Error("案件名を入力してください。");
    const db = await getDatabase();
    if (!db) {
      const data = readFallback();
      const index = data.cases.findIndex((item) => item.id === caseRecord.id);
      if (index >= 0) data.cases[index] = caseRecord;
      else data.cases.push(caseRecord);
      writeFallback(data);
      return clone(caseRecord);
    }
    const transaction = db.transaction(KCN.APP.caseStore, "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore(KCN.APP.caseStore).put(caseRecord);
    await done;
    return clone(caseRecord);
  }

  async function deleteCaseWithResponses(id) {
    const normalizedId = KCN.cleanSingleLine(id);
    const db = await getDatabase();
    if (!db) {
      const data = readFallback();
      const caseRecord = data.cases.find((item) => item.id === normalizedId) || null;
      const responses = data.caseResponses.filter((response) => response.caseId === normalizedId);
      data.cases = data.cases.filter((item) => item.id !== normalizedId);
      data.caseResponses = data.caseResponses.filter((response) => response.caseId !== normalizedId);
      writeFallback(data);
      return { case: caseRecord ? KCN.normalizeCase(caseRecord) : null, responses: responses.map(KCN.normalizeCaseResponse), deletedResponses: responses.length };
    }
    const transaction = db.transaction([KCN.APP.caseStore, KCN.APP.responseStore], "readwrite");
    const done = transactionDone(transaction);
    const caseStore = transaction.objectStore(KCN.APP.caseStore);
    const responseStore = transaction.objectStore(KCN.APP.responseStore);
    const [caseRecord, responses] = await Promise.all([
      requestResult(caseStore.get(normalizedId)),
      requestResult(responseStore.index("caseId").getAll(normalizedId))
    ]);
    responses.forEach((response) => responseStore.delete(response.id));
    caseStore.delete(normalizedId);
    await done;
    return {
      case: caseRecord ? KCN.normalizeCase(caseRecord) : null,
      responses: responses.map(KCN.normalizeCaseResponse),
      deletedResponses: responses.length
    };
  }

  function deleteCase(id) {
    return deleteCaseWithResponses(id);
  }

  async function getAllCaseResponses() {
    const db = await getDatabase();
    if (!db) return clone(readFallback().caseResponses).map(KCN.normalizeCaseResponse);
    const transaction = db.transaction(KCN.APP.responseStore, "readonly");
    const done = transactionDone(transaction);
    const values = await requestResult(transaction.objectStore(KCN.APP.responseStore).getAll());
    await done;
    return values.map(KCN.normalizeCaseResponse);
  }

  async function getCaseResponses(caseId) {
    const normalizedCaseId = KCN.cleanSingleLine(caseId);
    const db = await getDatabase();
    if (!db) return clone(readFallback().caseResponses.filter((response) => response.caseId === normalizedCaseId)).map(KCN.normalizeCaseResponse);
    const transaction = db.transaction(KCN.APP.responseStore, "readonly");
    const done = transactionDone(transaction);
    const values = await requestResult(transaction.objectStore(KCN.APP.responseStore).index("caseId").getAll(normalizedCaseId));
    await done;
    return values.map(KCN.normalizeCaseResponse);
  }

  async function getCompanyResponses(companyId) {
    const normalizedCompanyId = KCN.cleanSingleLine(companyId);
    const db = await getDatabase();
    if (!db) return clone(readFallback().caseResponses.filter((response) => response.companyId === normalizedCompanyId)).map(KCN.normalizeCaseResponse);
    const transaction = db.transaction(KCN.APP.responseStore, "readonly");
    const done = transactionDone(transaction);
    const values = await requestResult(transaction.objectStore(KCN.APP.responseStore).index("companyId").getAll(normalizedCompanyId));
    await done;
    return values.map(KCN.normalizeCaseResponse);
  }

  async function getCaseResponse(id) {
    const normalizedId = KCN.cleanSingleLine(id);
    const db = await getDatabase();
    if (!db) {
      const value = readFallback().caseResponses.find((response) => response.id === normalizedId);
      return value ? KCN.normalizeCaseResponse(clone(value)) : null;
    }
    const transaction = db.transaction(KCN.APP.responseStore, "readonly");
    const done = transactionDone(transaction);
    const value = await requestResult(transaction.objectStore(KCN.APP.responseStore).get(normalizedId));
    await done;
    return value ? KCN.normalizeCaseResponse(value) : null;
  }

  function validateResponseFactors(response, caseRecord, existingResponse) {
    const allowed = new Set([
      ...(caseRecord.factors || []),
      ...((existingResponse && existingResponse.responseFactors) || [])
    ]);
    if ((response.responseFactors || []).some((factor) => !allowed.has(factor))) {
      throw new Error("回答関連要因は案件の個別要因から選択してください。");
    }
  }

  function withCompanySnapshot(response, company) {
    return KCN.normalizeCaseResponse({
      ...response,
      companyNameSnapshot: response.companyNameSnapshot || company.companyName,
      contactNameSnapshot: response.contactNameSnapshot || company.contactName,
      phoneSnapshot: response.phoneSnapshot || company.phone,
      emailSnapshot: response.emailSnapshot || company.email
    });
  }

  async function putCaseResponse(rawResponse) {
    const response = KCN.normalizeCaseResponse(rawResponse);
    if (!response.caseId || !response.companyId) throw new Error("案件と業者を選択してください。");
    const db = await getDatabase();
    if (!db) {
      const data = readFallback();
      const caseRecord = data.cases.find((item) => item.id === response.caseId);
      const company = data.companies.find((item) => item.id === response.companyId);
      const existing = data.caseResponses.find((item) => item.id === response.id) || null;
      if (!caseRecord) throw new Error("案件が見つかりません。");
      if (!company) throw new Error("業者が見つかりません。");
      validateResponseFactors(response, caseRecord, existing);
      if (data.caseResponses.some((item) => item.id !== response.id && item.caseId === response.caseId && item.companyId === response.companyId)) {
        throw new Error("この案件には同じ業者の回答が既にあります。");
      }
      const saved = withCompanySnapshot(response, company);
      const index = data.caseResponses.findIndex((item) => item.id === saved.id);
      if (index >= 0) data.caseResponses[index] = saved;
      else data.caseResponses.push(saved);
      const caseIndex = data.cases.findIndex((item) => item.id === response.caseId);
      data.cases[caseIndex] = KCN.normalizeCase({ ...caseRecord, updatedAt: KCN.isoNow() });
      writeFallback(data);
      return clone(saved);
    }
    const transaction = db.transaction([KCN.APP.caseStore, KCN.APP.companyStore, KCN.APP.responseStore], "readwrite");
    const done = transactionDone(transaction);
    const caseStore = transaction.objectStore(KCN.APP.caseStore);
    const responseStore = transaction.objectStore(KCN.APP.responseStore);
    const [caseRecord, company, existing, pairMatch] = await Promise.all([
      requestResult(caseStore.get(response.caseId)),
      requestResult(transaction.objectStore(KCN.APP.companyStore).get(response.companyId)),
      requestResult(responseStore.get(response.id)),
      requestResult(responseStore.index("caseCompany").get([response.caseId, response.companyId]))
    ]);
    if (!caseRecord) return abortTransaction(transaction, done, new Error("案件が見つかりません。"));
    if (!company) return abortTransaction(transaction, done, new Error("業者が見つかりません。"));
    if (pairMatch && pairMatch.id !== response.id) return abortTransaction(transaction, done, new Error("この案件には同じ業者の回答が既にあります。"));
    try {
      validateResponseFactors(response, caseRecord, existing);
    } catch (error) {
      return abortTransaction(transaction, done, error);
    }
    const saved = withCompanySnapshot(response, company);
    responseStore.put(saved);
    caseStore.put(KCN.normalizeCase({ ...caseRecord, updatedAt: KCN.isoNow() }));
    await done;
    return clone(saved);
  }

  function prepareCaseResponsesForAdd(rawResponses, cases, companies, existingResponses) {
    if (!Array.isArray(rawResponses)) throw new Error("回答データが配列ではありません。");
    const caseMap = new Map(cases.map((item) => [item.id, item]));
    const companyMap = new Map(companies.map((item) => [item.id, item]));
    const usedIds = new Set(existingResponses.map((item) => item.id));
    const usedPairs = new Set(existingResponses.map((item) => JSON.stringify([item.caseId, item.companyId])));
    return rawResponses.map((rawResponse) => {
      const response = KCN.normalizeCaseResponse(rawResponse);
      if (!response.caseId || !response.companyId) throw new Error("案件と業者を選択してください。");
      if (usedIds.has(response.id)) throw new Error(`回答IDが重複しています: ${response.id}`);
      const pair = JSON.stringify([response.caseId, response.companyId]);
      if (usedPairs.has(pair)) throw new Error("同じ案件・業者の回答が重複しています。");
      const caseRecord = caseMap.get(response.caseId);
      const company = companyMap.get(response.companyId);
      if (!caseRecord) throw new Error("案件が見つかりません。");
      if (!company) throw new Error("業者が見つかりません。");
      validateResponseFactors(response, caseRecord, null);
      usedIds.add(response.id);
      usedPairs.add(pair);
      return withCompanySnapshot(response, company);
    });
  }

  async function addCaseResponses(rawResponses) {
    const db = await getDatabase();
    if (!db) {
      const data = readFallback();
      const prepared = prepareCaseResponsesForAdd(rawResponses, data.cases, data.companies, data.caseResponses);
      data.caseResponses.push(...prepared);
      const now = KCN.isoNow();
      const touchedCaseIds = new Set(prepared.map((response) => response.caseId));
      data.cases = data.cases.map((caseRecord) => touchedCaseIds.has(caseRecord.id)
        ? KCN.normalizeCase({ ...caseRecord, updatedAt: now })
        : caseRecord);
      writeFallback(data);
      return clone(prepared);
    }
    const transaction = db.transaction([KCN.APP.caseStore, KCN.APP.companyStore, KCN.APP.responseStore], "readwrite");
    const done = transactionDone(transaction);
    const caseStore = transaction.objectStore(KCN.APP.caseStore);
    const responseStore = transaction.objectStore(KCN.APP.responseStore);
    const [cases, companies, existingResponses] = await Promise.all([
      requestResult(caseStore.getAll()),
      requestResult(transaction.objectStore(KCN.APP.companyStore).getAll()),
      requestResult(responseStore.getAll())
    ]);
    let prepared;
    try {
      prepared = prepareCaseResponsesForAdd(rawResponses, cases, companies, existingResponses);
    } catch (error) {
      return abortTransaction(transaction, done, error);
    }
    prepared.forEach((response) => responseStore.add(response));
    const now = KCN.isoNow();
    const touchedCaseIds = new Set(prepared.map((response) => response.caseId));
    cases.forEach((caseRecord) => {
      if (touchedCaseIds.has(caseRecord.id)) caseStore.put(KCN.normalizeCase({ ...caseRecord, updatedAt: now }));
    });
    await done;
    return clone(prepared);
  }

  async function deleteCaseResponse(id) {
    const normalizedId = KCN.cleanSingleLine(id);
    const db = await getDatabase();
    if (!db) {
      const data = readFallback();
      const deleted = data.caseResponses.find((response) => response.id === normalizedId) || null;
      data.caseResponses = data.caseResponses.filter((response) => response.id !== normalizedId);
      if (deleted) {
        const caseIndex = data.cases.findIndex((caseRecord) => caseRecord.id === deleted.caseId);
        if (caseIndex >= 0) data.cases[caseIndex] = KCN.normalizeCase({ ...data.cases[caseIndex], updatedAt: KCN.isoNow() });
      }
      writeFallback(data);
      return deleted ? KCN.normalizeCaseResponse(deleted) : null;
    }
    const transaction = db.transaction([KCN.APP.responseStore, KCN.APP.caseStore], "readwrite");
    const done = transactionDone(transaction);
    const responseStore = transaction.objectStore(KCN.APP.responseStore);
    const caseStore = transaction.objectStore(KCN.APP.caseStore);
    const deleted = await requestResult(responseStore.get(normalizedId));
    responseStore.delete(normalizedId);
    if (deleted) {
      const caseRecord = await requestResult(caseStore.get(deleted.caseId));
      if (caseRecord) caseStore.put(KCN.normalizeCase({ ...caseRecord, updatedAt: KCN.isoNow() }));
    }
    await done;
    return deleted ? KCN.normalizeCaseResponse(deleted) : null;
  }

  async function deleteSamples() {
    const db = await getDatabase();
    if (!db) {
      const data = readFallback();
      const sampleIds = new Set(data.companies.filter((company) => company.isSample).map((company) => company.id));
      data.companies = data.companies.filter((company) => !sampleIds.has(company.id));
      data.caseResponses = data.caseResponses.filter((response) => !sampleIds.has(response.companyId));
      writeFallback(data);
      return sampleIds.size;
    }
    const transaction = db.transaction([KCN.APP.companyStore, KCN.APP.responseStore], "readwrite");
    const done = transactionDone(transaction);
    const companyStore = transaction.objectStore(KCN.APP.companyStore);
    const responseStore = transaction.objectStore(KCN.APP.responseStore);
    const [companies, responses] = await Promise.all([requestResult(companyStore.getAll()), requestResult(responseStore.getAll())]);
    const sampleIds = new Set(companies.filter((company) => company.isSample).map((company) => company.id));
    companies.forEach((company) => {
      if (sampleIds.has(company.id)) companyStore.delete(company.id);
    });
    responses.forEach((response) => {
      if (sampleIds.has(response.companyId)) responseStore.delete(response.id);
    });
    await done;
    return sampleIds.size;
  }

  async function clearAllData() {
    const resetSettings = {
      ...clone(KCN.DEFAULT_SETTINGS),
      sampleInitialized: true,
      schemaVersion: KCN.APP.schemaVersion,
      updatedAt: KCN.isoNow()
    };
    const db = await getDatabase();
    if (!db) {
      writeFallback({ companies: [], cases: [], caseResponses: [], settings: resetSettings });
      return;
    }
    const stores = [KCN.APP.companyStore, KCN.APP.settingsStore, KCN.APP.caseStore, KCN.APP.responseStore];
    const transaction = db.transaction(stores, "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore(KCN.APP.companyStore).clear();
    transaction.objectStore(KCN.APP.caseStore).clear();
    transaction.objectStore(KCN.APP.responseStore).clear();
    transaction.objectStore(KCN.APP.settingsStore).clear();
    transaction.objectStore(KCN.APP.settingsStore).put(resetSettings);
    await done;
  }

  function backupEnvelope(companies, settings, cases, caseResponses) {
    return {
      format: KCN.APP.backupFormat,
      appName: KCN.APP.displayName,
      appVersion: KCN.APP.version,
      schemaVersion: KCN.APP.schemaVersion,
      exportedAt: KCN.isoNow(),
      companies: companies.map(KCN.normalizeCompany),
      cases: cases.map(KCN.normalizeCase),
      caseResponses: caseResponses.map(KCN.normalizeCaseResponse),
      settings: { ...KCN.DEFAULT_SETTINGS, ...(settings || {}), schemaVersion: KCN.APP.schemaVersion }
    };
  }

  async function createBackup() {
    const db = await getDatabase();
    if (!db) {
      const data = readFallback();
      return backupEnvelope(data.companies, data.settings, data.cases, data.caseResponses);
    }
    const stores = [KCN.APP.companyStore, KCN.APP.settingsStore, KCN.APP.caseStore, KCN.APP.responseStore];
    const transaction = db.transaction(stores, "readonly");
    const done = transactionDone(transaction);
    const [companies, settings, cases, caseResponses] = await Promise.all([
      requestResult(transaction.objectStore(KCN.APP.companyStore).getAll()),
      requestResult(transaction.objectStore(KCN.APP.settingsStore).get(KCN.APP.settingsId)),
      requestResult(transaction.objectStore(KCN.APP.caseStore).getAll()),
      requestResult(transaction.objectStore(KCN.APP.responseStore).getAll())
    ]);
    await done;
    return backupEnvelope(companies, settings, cases, caseResponses);
  }

  function mergeSettings(current, imported) {
    if (!imported) return { ...current, schemaVersion: KCN.APP.schemaVersion };
    return {
      ...current,
      areaOptions: KCN.uniqueStrings([...(current.areaOptions || []), ...(imported.areaOptions || [])]),
      propertyTypeOptions: KCN.uniqueStrings([...(current.propertyTypeOptions || []), ...(imported.propertyTypeOptions || [])]),
      schemaVersion: KCN.APP.schemaVersion,
      sampleInitialized: true,
      updatedAt: KCN.isoNow()
    };
  }

  function replacementSettings(imported) {
    return imported
      ? { ...KCN.DEFAULT_SETTINGS, ...imported, id: KCN.APP.settingsId, schemaVersion: KCN.APP.schemaVersion, sampleInitialized: true, updatedAt: KCN.isoNow() }
      : { ...clone(KCN.DEFAULT_SETTINGS), sampleInitialized: true, schemaVersion: KCN.APP.schemaVersion, updatedAt: KCN.isoNow() };
  }

  function assertRestoreGraph(companies, cases, caseResponses) {
    const companyIds = new Set();
    companies.forEach((company) => {
      if (!company.id || companyIds.has(company.id)) throw new Error("復元する業者IDが不正または重複しています。");
      companyIds.add(company.id);
    });
    const caseMap = new Map();
    cases.forEach((caseRecord) => {
      if (!caseRecord.id || !caseRecord.caseName || caseMap.has(caseRecord.id)) throw new Error("復元する案件IDまたは案件名が不正です。");
      caseMap.set(caseRecord.id, caseRecord);
    });
    const responseIds = new Set();
    const pairs = new Set();
    caseResponses.forEach((response) => {
      if (!response.id || responseIds.has(response.id)) throw new Error("復元する回答IDが不正または重複しています。");
      if (!caseMap.has(response.caseId) || !companyIds.has(response.companyId)) throw new Error("復元する回答の参照先がありません。");
      const pair = JSON.stringify([response.caseId, response.companyId]);
      if (pairs.has(pair)) throw new Error("復元する回答に案件・業者の重複があります。");
      responseIds.add(response.id);
      pairs.add(pair);
    });
  }

  function generateUniqueId(usedIds) {
    let id = KCN.uuid();
    while (usedIds.has(id)) id = KCN.uuid();
    usedIds.add(id);
    return id;
  }

  function prepareAddRestore(current, imported) {
    const companyIds = new Set(current.companies.map((item) => item.id));
    const caseIds = new Set(current.cases.map((item) => item.id));
    const responseIds = new Set(current.caseResponses.map((item) => item.id));
    const companyIdMap = new Map();
    const caseIdMap = new Map();
    const responseIdMap = new Map();

    const companies = imported.companies.map((company) => {
      const id = companyIds.has(company.id) ? generateUniqueId(companyIds) : company.id;
      companyIds.add(id);
      companyIdMap.set(company.id, id);
      return KCN.normalizeCompany({ ...company, id });
    });
    const cases = imported.cases.map((caseRecord) => {
      const id = caseIds.has(caseRecord.id) ? generateUniqueId(caseIds) : caseRecord.id;
      caseIds.add(id);
      caseIdMap.set(caseRecord.id, id);
      return KCN.normalizeCase({ ...caseRecord, id });
    });
    const caseResponses = imported.caseResponses.map((response) => {
      const id = responseIds.has(response.id) ? generateUniqueId(responseIds) : response.id;
      responseIds.add(id);
      responseIdMap.set(response.id, id);
      return KCN.normalizeCaseResponse({
        ...response,
        id,
        caseId: caseIdMap.get(response.caseId) || response.caseId,
        companyId: companyIdMap.get(response.companyId) || response.companyId
      });
    });
    assertRestoreGraph(companies, cases, caseResponses);
    return {
      companies,
      cases,
      caseResponses,
      idMap: {
        companies: Object.fromEntries(companyIdMap),
        cases: Object.fromEntries(caseIdMap),
        caseResponses: Object.fromEntries(responseIdMap)
      }
    };
  }

  function normalizeRestorePayload(validated) {
    if (!validated || !Array.isArray(validated.companies)) throw new Error("検証済みバックアップが必要です。");
    const payload = {
      companies: validated.companies.map(KCN.normalizeCompany),
      cases: (Array.isArray(validated.cases) ? validated.cases : []).map(KCN.normalizeCase),
      caseResponses: (Array.isArray(validated.caseResponses) ? validated.caseResponses : []).map(KCN.normalizeCaseResponse),
      settings: validated.settings || null
    };
    assertRestoreGraph(payload.companies, payload.cases, payload.caseResponses);
    return payload;
  }

  function restoreResult(prepared, idMap) {
    return {
      imported: prepared.companies.length,
      skipped: 0,
      importedCompanies: prepared.companies.length,
      importedCases: prepared.cases.length,
      importedResponses: prepared.caseResponses.length,
      idMap: idMap || { companies: {}, cases: {}, caseResponses: {} }
    };
  }

  async function restoreBackup(validated, restoreMode) {
    if (restoreMode !== "add" && restoreMode !== "replace") throw new Error("復元方法が正しくありません。");
    const imported = normalizeRestorePayload(validated);
    const db = await getDatabase();

    if (!db) {
      const current = readFallback();
      const next = clone(current);
      if (restoreMode === "replace") {
        next.companies = imported.companies;
        next.cases = imported.cases;
        next.caseResponses = imported.caseResponses;
        next.settings = replacementSettings(imported.settings);
        writeFallback(next);
        return restoreResult(imported);
      }
      const prepared = prepareAddRestore(current, imported);
      next.companies.push(...prepared.companies);
      next.cases.push(...prepared.cases);
      next.caseResponses.push(...prepared.caseResponses);
      next.settings = mergeSettings({ ...KCN.DEFAULT_SETTINGS, ...(current.settings || {}) }, imported.settings);
      writeFallback(next);
      return restoreResult(prepared, prepared.idMap);
    }

    const stores = [KCN.APP.companyStore, KCN.APP.settingsStore, KCN.APP.caseStore, KCN.APP.responseStore];
    const transaction = db.transaction(stores, "readwrite");
    const done = transactionDone(transaction);
    const companyStore = transaction.objectStore(KCN.APP.companyStore);
    const settingsStore = transaction.objectStore(KCN.APP.settingsStore);
    const caseStore = transaction.objectStore(KCN.APP.caseStore);
    const responseStore = transaction.objectStore(KCN.APP.responseStore);

    if (restoreMode === "replace") {
      companyStore.clear();
      caseStore.clear();
      responseStore.clear();
      settingsStore.clear();
      imported.companies.forEach((company) => companyStore.add(company));
      imported.cases.forEach((caseRecord) => caseStore.add(caseRecord));
      imported.caseResponses.forEach((response) => responseStore.add(response));
      settingsStore.put(replacementSettings(imported.settings));
      await done;
      return restoreResult(imported);
    }

    const [currentCompanies, currentCases, currentResponses, currentSettings] = await Promise.all([
      requestResult(companyStore.getAll()),
      requestResult(caseStore.getAll()),
      requestResult(responseStore.getAll()),
      requestResult(settingsStore.get(KCN.APP.settingsId))
    ]);
    let prepared;
    try {
      prepared = prepareAddRestore({
        companies: currentCompanies,
        cases: currentCases,
        caseResponses: currentResponses
      }, imported);
    } catch (error) {
      return abortTransaction(transaction, done, error);
    }
    prepared.companies.forEach((company) => companyStore.add(company));
    prepared.cases.forEach((caseRecord) => caseStore.add(caseRecord));
    prepared.caseResponses.forEach((response) => responseStore.add(response));
    settingsStore.put(mergeSettings({ ...KCN.DEFAULT_SETTINGS, ...(currentSettings || {}) }, imported.settings));
    await done;
    return restoreResult(prepared, prepared.idMap);
  }

  KCN.db = {
    initialize,
    getAllCompanies,
    getArchivedCompanies,
    getCompany,
    putCompany,
    deleteCompany,
    deleteCompanyWithResponses,
    setCompanyArchived,
    archiveCompany,
    restoreCompany,
    getSettings,
    putSettings,
    getAllCases,
    getCase,
    putCase,
    deleteCase,
    deleteCaseWithResponses,
    getAllCaseResponses,
    getAllResponses: getAllCaseResponses,
    getCaseResponses,
    getCompanyResponses,
    getCaseResponse,
    getResponse: getCaseResponse,
    putCaseResponse,
    putResponse: putCaseResponse,
    addCaseResponses,
    deleteCaseResponse,
    deleteResponse: deleteCaseResponse,
    deleteSamples,
    clearAllData,
    createBackup,
    restoreBackup,
    getStorageMode: () => mode,
    _resetConnectionForTests: () => {
      if (databaseConnection) databaseConnection.close();
      databaseConnection = null;
      databasePromise = null;
      mode = "indexeddb";
    }
  };
})(window);
