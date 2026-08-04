(function (global) {
  "use strict";

  const KCN = global.KCN;
  let databasePromise = null;
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

  function openIndexedDb() {
    if (!global.indexedDB) return Promise.reject(new Error("IndexedDBを利用できません。"));
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(KCN.APP.dbName, KCN.APP.dbVersion);
      request.onupgradeneeded = () => {
        const db = request.result;
        let companyStore;
        if (!db.objectStoreNames.contains(KCN.APP.companyStore)) {
          companyStore = db.createObjectStore(KCN.APP.companyStore, { keyPath: "id" });
        } else {
          companyStore = request.transaction.objectStore(KCN.APP.companyStore);
        }
        if (!companyStore.indexNames.contains("companyName")) companyStore.createIndex("companyName", "companyName", { unique: false });
        if (!companyStore.indexNames.contains("updatedAt")) companyStore.createIndex("updatedAt", "updatedAt", { unique: false });
        if (!companyStore.indexNames.contains("isFavorite")) companyStore.createIndex("isFavorite", "isFavorite", { unique: false });
        if (!db.objectStoreNames.contains(KCN.APP.settingsStore)) {
          db.createObjectStore(KCN.APP.settingsStore, { keyPath: "id" });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
      request.onerror = () => reject(request.error || new Error("データベースを開けませんでした。"));
      request.onblocked = () => reject(new Error("別の画面がデータベース更新を妨げています。"));
    });
  }

  function readFallback() {
    try {
      const parsed = JSON.parse(localStorage.getItem(KCN.APP.localFallbackKey) || "null");
      if (parsed && Array.isArray(parsed.companies) && parsed.settings) return parsed;
    } catch (error) {
      console.warn("端末内フォールバックデータを読めませんでした。", error);
    }
    return { companies: [], settings: null };
  }

  function writeFallback(data) {
    localStorage.setItem(KCN.APP.localFallbackKey, JSON.stringify(data));
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
        settings.updatedAt = now;
      }
      data.settings = settings;
      writeFallback(data);
      return clone(settings);
    }

    const transaction = db.transaction([KCN.APP.companyStore, KCN.APP.settingsStore], "readwrite");
    const companyStore = transaction.objectStore(KCN.APP.companyStore);
    const settingsStore = transaction.objectStore(KCN.APP.settingsStore);
    let settings = await requestResult(settingsStore.get(KCN.APP.settingsId));
    settings = settings ? { ...KCN.DEFAULT_SETTINGS, ...settings } : clone(KCN.DEFAULT_SETTINGS);
    if (!settings.sampleInitialized) {
      for (const sample of KCN.SAMPLE_COMPANIES) {
        const existing = await requestResult(companyStore.get(sample.id));
        if (!existing) companyStore.put(KCN.normalizeCompany({ ...sample, createdAt: now, updatedAt: now }));
      }
      settings.sampleInitialized = true;
      settings.updatedAt = now;
    }
    settingsStore.put(settings);
    await transactionDone(transaction);
    return clone(settings);
  }

  async function getAllCompanies() {
    const db = await getDatabase();
    if (!db) return clone(readFallback().companies).map((company) => KCN.normalizeCompany(company));
    const transaction = db.transaction(KCN.APP.companyStore, "readonly");
    const values = await requestResult(transaction.objectStore(KCN.APP.companyStore).getAll());
    await transactionDone(transaction);
    return values.map((company) => KCN.normalizeCompany(company));
  }

  async function getCompany(id) {
    const db = await getDatabase();
    if (!db) {
      const value = readFallback().companies.find((company) => company.id === id);
      return value ? KCN.normalizeCompany(clone(value)) : null;
    }
    const transaction = db.transaction(KCN.APP.companyStore, "readonly");
    const value = await requestResult(transaction.objectStore(KCN.APP.companyStore).get(id));
    await transactionDone(transaction);
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
    transaction.objectStore(KCN.APP.companyStore).put(company);
    await transactionDone(transaction);
    return clone(company);
  }

  async function deleteCompany(id) {
    const db = await getDatabase();
    if (!db) {
      const data = readFallback();
      data.companies = data.companies.filter((company) => company.id !== id);
      writeFallback(data);
      return;
    }
    const transaction = db.transaction(KCN.APP.companyStore, "readwrite");
    transaction.objectStore(KCN.APP.companyStore).delete(id);
    await transactionDone(transaction);
  }

  async function getSettings() {
    const db = await getDatabase();
    if (!db) return clone(readFallback().settings || KCN.DEFAULT_SETTINGS);
    const transaction = db.transaction(KCN.APP.settingsStore, "readonly");
    const settings = await requestResult(transaction.objectStore(KCN.APP.settingsStore).get(KCN.APP.settingsId));
    await transactionDone(transaction);
    return clone({ ...KCN.DEFAULT_SETTINGS, ...(settings || {}) });
  }

  async function putSettings(rawSettings) {
    const current = await getSettings();
    const settings = {
      ...current,
      ...rawSettings,
      id: KCN.APP.settingsId,
      areaOptions: KCN.uniqueStrings(rawSettings.areaOptions || current.areaOptions),
      propertyTypeOptions: KCN.uniqueStrings(rawSettings.propertyTypeOptions || current.propertyTypeOptions),
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
    transaction.objectStore(KCN.APP.settingsStore).put(settings);
    await transactionDone(transaction);
    return clone(settings);
  }

  async function deleteSamples() {
    const companies = await getAllCompanies();
    const sampleIds = companies.filter((company) => company.isSample).map((company) => company.id);
    const db = await getDatabase();
    if (!db) {
      const data = readFallback();
      data.companies = data.companies.filter((company) => !sampleIds.includes(company.id));
      writeFallback(data);
      return sampleIds.length;
    }
    const transaction = db.transaction(KCN.APP.companyStore, "readwrite");
    const store = transaction.objectStore(KCN.APP.companyStore);
    sampleIds.forEach((id) => store.delete(id));
    await transactionDone(transaction);
    return sampleIds.length;
  }

  async function clearAllData() {
    const resetSettings = {
      ...clone(KCN.DEFAULT_SETTINGS),
      sampleInitialized: true,
      updatedAt: KCN.isoNow()
    };
    const db = await getDatabase();
    if (!db) {
      writeFallback({ companies: [], settings: resetSettings });
      return;
    }
    const transaction = db.transaction([KCN.APP.companyStore, KCN.APP.settingsStore], "readwrite");
    transaction.objectStore(KCN.APP.companyStore).clear();
    transaction.objectStore(KCN.APP.settingsStore).clear();
    transaction.objectStore(KCN.APP.settingsStore).put(resetSettings);
    await transactionDone(transaction);
  }

  async function createBackup() {
    const [companies, settings] = await Promise.all([getAllCompanies(), getSettings()]);
    return {
      format: KCN.APP.backupFormat,
      appName: KCN.APP.displayName,
      appVersion: KCN.APP.version,
      schemaVersion: KCN.APP.schemaVersion,
      exportedAt: KCN.isoNow(),
      companies,
      settings
    };
  }

  function mergeSettings(current, imported) {
    if (!imported) return current;
    return {
      ...current,
      areaOptions: KCN.uniqueStrings([...(current.areaOptions || []), ...(imported.areaOptions || [])]),
      propertyTypeOptions: KCN.uniqueStrings([...(current.propertyTypeOptions || []), ...(imported.propertyTypeOptions || [])]),
      schemaVersion: KCN.APP.schemaVersion,
      sampleInitialized: true,
      updatedAt: KCN.isoNow()
    };
  }

  async function restoreBackup(validated, restoreMode) {
    if (!validated || !Array.isArray(validated.companies)) throw new Error("検証済みバックアップが必要です。");
    if (restoreMode !== "add" && restoreMode !== "replace") throw new Error("復元方法が正しくありません。");
    const importedCompanies = validated.companies.map((company) => KCN.normalizeCompany(company));
    const currentSettings = await getSettings();
    const db = await getDatabase();

    if (!db) {
      const original = readFallback();
      const next = clone(original);
      let skipped = 0;
      if (restoreMode === "replace") {
        next.companies = importedCompanies;
        next.settings = validated.settings
          ? { ...KCN.DEFAULT_SETTINGS, ...validated.settings, id: KCN.APP.settingsId, sampleInitialized: true, updatedAt: KCN.isoNow() }
          : { ...KCN.DEFAULT_SETTINGS, sampleInitialized: true, updatedAt: KCN.isoNow() };
      } else {
        const existingIds = new Set(next.companies.map((company) => company.id));
        importedCompanies.forEach((company) => {
          if (existingIds.has(company.id)) skipped += 1;
          else {
            existingIds.add(company.id);
            next.companies.push(company);
          }
        });
        next.settings = mergeSettings(currentSettings, validated.settings);
      }
      writeFallback(next);
      return { imported: restoreMode === "replace" ? importedCompanies.length : importedCompanies.length - skipped, skipped };
    }

    const transaction = db.transaction([KCN.APP.companyStore, KCN.APP.settingsStore], "readwrite");
    const companyStore = transaction.objectStore(KCN.APP.companyStore);
    const settingsStore = transaction.objectStore(KCN.APP.settingsStore);
    let skipped = 0;
    if (restoreMode === "replace") {
      companyStore.clear();
      settingsStore.clear();
      importedCompanies.forEach((company) => companyStore.add(company));
      settingsStore.put(validated.settings
        ? { ...KCN.DEFAULT_SETTINGS, ...validated.settings, id: KCN.APP.settingsId, sampleInitialized: true, updatedAt: KCN.isoNow() }
        : { ...KCN.DEFAULT_SETTINGS, sampleInitialized: true, updatedAt: KCN.isoNow() });
    } else {
      const existingKeys = new Set(await requestResult(companyStore.getAllKeys()));
      importedCompanies.forEach((company) => {
        if (existingKeys.has(company.id)) skipped += 1;
        else {
          existingKeys.add(company.id);
          companyStore.add(company);
        }
      });
      settingsStore.put(mergeSettings(currentSettings, validated.settings));
    }
    await transactionDone(transaction);
    return { imported: restoreMode === "replace" ? importedCompanies.length : importedCompanies.length - skipped, skipped };
  }

  KCN.db = {
    initialize,
    getAllCompanies,
    getCompany,
    putCompany,
    deleteCompany,
    getSettings,
    putSettings,
    deleteSamples,
    clearAllData,
    createBackup,
    restoreBackup,
    getStorageMode: () => mode,
    _resetConnectionForTests: () => {
      databasePromise = null;
      mode = "indexeddb";
    }
  };
})(window);
