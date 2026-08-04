(function (global) {
  "use strict";

  const KCN = global.KCN;
  const japaneseCollator = new Intl.Collator("ja-JP", {
    usage: "sort",
    sensitivity: "base",
    numeric: true,
    ignorePunctuation: true
  });

  function normalizeText(value) {
    return String(value == null ? "" : value)
      .normalize("NFKC")
      .replace(/[\s\u3000]+/g, " ")
      .trim()
      .toLocaleLowerCase("ja-JP");
  }

  function cleanSingleLine(value) {
    return String(value == null ? "" : value)
      .replace(/[\s\u3000]+/g, " ")
      .trim();
  }

  function cleanMultiline(value, maxLength) {
    const normalized = String(value == null ? "" : value)
      .normalize("NFKC")
      .replace(/\r\n?/g, "\n")
      .trim();
    return typeof maxLength === "number" ? normalized.slice(0, maxLength) : normalized;
  }

  function normalizeCompanyKey(value) {
    return normalizeText(value).replace(/\s+/g, "");
  }

  function normalizePhone(value) {
    return String(value == null ? "" : value).normalize("NFKC").replace(/\D/g, "");
  }

  function phoneHref(value) {
    const raw = String(value == null ? "" : value).normalize("NFKC").trim();
    if (!raw) return "";
    const prefix = raw.startsWith("+") ? "+" : "";
    const digits = normalizePhone(raw);
    return digits ? `tel:${prefix}${digits}` : "";
  }

  function normalizeEmail(value) {
    return String(value == null ? "" : value).normalize("NFKC").trim().toLowerCase();
  }

  function isPlausiblePhone(value) {
    if (!String(value || "").trim()) return true;
    return /^[0-9０-９+＋()（）\-ー−―\s]+$/.test(String(value)) && normalizePhone(value).length >= 7;
  }

  function isPlausibleEmail(value) {
    const email = normalizeEmail(value);
    if (!email) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function mailtoHref(value, subject) {
    const email = normalizeEmail(value);
    if (!email || !isPlausibleEmail(email)) return "";
    const atIndex = email.lastIndexOf("@");
    if (atIndex <= 0) return "";
    const localPart = encodeURIComponent(email.slice(0, atIndex));
    const domainPart = encodeURIComponent(email.slice(atIndex + 1));
    const safeSubject = encodeURIComponent(subject || "買取案件のご相談");
    return `mailto:${localPart}@${domainPart}?subject=${safeSubject}`;
  }

  function uniqueStrings(values) {
    const seen = new Set();
    const result = [];
    (Array.isArray(values) ? values : []).forEach((value) => {
      const cleaned = cleanSingleLine(value);
      const key = normalizeText(cleaned);
      if (cleaned && !seen.has(key)) {
        seen.add(key);
        result.push(cleaned);
      }
    });
    return result;
  }

  function uuid() {
    if (global.crypto && typeof global.crypto.randomUUID === "function") {
      return global.crypto.randomUUID();
    }
    const bytes = new Uint8Array(16);
    if (global.crypto && global.crypto.getRandomValues) {
      global.crypto.getRandomValues(bytes);
    } else {
      for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
  }

  function isoNow() {
    return new Date().toISOString();
  }

  function formatDate(value) {
    if (!value) return "未記録";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "未記録";
    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function temperatureRank(value) {
    if (value === KCN.TEMPERATURES.ACTIVE) return 0;
    if (value === KCN.TEMPERATURES.NORMAL) return 1;
    if (value === KCN.TEMPERATURES.PAUSED) return 2;
    return 3;
  }

  function normalizeCompany(raw, options) {
    const source = raw && typeof raw === "object" ? raw : {};
    const opts = options || {};
    const createdAt = typeof source.createdAt === "string" && !Number.isNaN(Date.parse(source.createdAt))
      ? source.createdAt
      : (opts.createdAt || isoNow());
    const updatedAt = typeof source.updatedAt === "string" && !Number.isNaN(Date.parse(source.updatedAt))
      ? source.updatedAt
      : (opts.updatedAt || createdAt);
    const temperatureValues = Object.values(KCN.TEMPERATURES);
    return {
      id: cleanSingleLine(source.id) || uuid(),
      companyName: cleanSingleLine(source.companyName),
      contactName: cleanSingleLine(source.contactName),
      phone: cleanSingleLine(source.phone),
      email: normalizeEmail(source.email),
      areas: uniqueStrings(source.areas),
      customArea: cleanSingleLine(source.customArea).slice(0, 120),
      propertyTypes: uniqueStrings(source.propertyTypes),
      temperature: temperatureValues.includes(source.temperature) ? source.temperature : KCN.TEMPERATURES.NORMAL,
      isFavorite: source.isFavorite === true,
      memo: cleanMultiline(source.memo, 500),
      createdAt,
      updatedAt,
      isSample: source.isSample === true,
      schemaVersion: Number.isInteger(source.schemaVersion) ? source.schemaVersion : KCN.APP.schemaVersion,
      extra: source.extra && typeof source.extra === "object" && !Array.isArray(source.extra) ? source.extra : {}
    };
  }

  function companySearchHaystack(company) {
    return normalizeText([
      company.companyName,
      company.contactName,
      company.phone,
      company.email,
      ...(company.areas || []),
      company.customArea,
      ...(company.propertyTypes || []),
      company.memo
    ].join(" "));
  }

  function areaMatches(companyAreas, selectedAreas) {
    if (!selectedAreas.length) return true;
    const companySet = new Set(companyAreas || []);
    const broadCoverage = {
      "横浜": ["神奈川県全域", "関東", "全国"],
      "川崎": ["神奈川県全域", "関東", "全国"],
      "湘南": ["神奈川県全域", "関東", "全国"],
      "県央": ["神奈川県全域", "関東", "全国"],
      "横須賀・三浦": ["神奈川県全域", "関東", "全国"],
      "県西": ["神奈川県全域", "関東", "全国"],
      "東京都": ["関東", "全国"],
      "神奈川県全域": ["関東", "全国"],
      "関東": ["全国"],
      "全国": [],
      "その他": ["全国"]
    };
    return selectedAreas.some((selected) => companySet.has(selected) || (broadCoverage[selected] || []).some((area) => companySet.has(area)));
  }

  function matchesCompany(company, filters) {
    const f = filters || {};
    const selectedAreas = Array.isArray(f.areas) ? f.areas : [];
    const selectedTypes = Array.isArray(f.propertyTypes) ? f.propertyTypes : [];
    if (!areaMatches(company.areas || [], selectedAreas)) return false;
    if (selectedTypes.length && !selectedTypes.some((type) => (company.propertyTypes || []).includes(type))) return false;
    if (f.temperature && f.temperature !== "すべて" && company.temperature !== f.temperature) return false;
    if (f.favoriteOnly && !company.isFavorite) return false;

    const query = normalizeText(f.query || "");
    if (query) {
      const haystack = companySearchHaystack(company);
      const phoneDigits = normalizePhone(company.phone);
      const tokens = query.split(" ").filter(Boolean);
      const allTokensMatch = tokens.every((token) => {
        const digits = normalizePhone(token);
        if (digits.length >= 3 && /^[-+()（）0-9０-９ー−―]+$/.test(token)) return phoneDigits.includes(digits);
        return haystack.includes(token);
      });
      if (!allTokensMatch) return false;
    }
    return true;
  }

  function compareCompanies(a, b, sortMode) {
    const nameCompare = japaneseCollator.compare(a.companyName || "", b.companyName || "");
    const idCompare = String(a.id || "").localeCompare(String(b.id || ""));
    if (sortMode === "favorite") return Number(b.isFavorite) - Number(a.isFavorite) || nameCompare || idCompare;
    if (sortMode === "temperature") return temperatureRank(a.temperature) - temperatureRank(b.temperature) || nameCompare || idCompare;
    if (sortMode === "updated") return String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")) || nameCompare || idCompare;
    if (sortMode === "created") return String(b.createdAt || "").localeCompare(String(a.createdAt || "")) || nameCompare || idCompare;
    if (sortMode === "search") {
      return Number(b.isFavorite) - Number(a.isFavorite)
        || temperatureRank(a.temperature) - temperatureRank(b.temperature)
        || nameCompare
        || idCompare;
    }
    return nameCompare || idCompare;
  }

  function findDuplicates(candidate, companies, excludeId) {
    const nameKey = normalizeCompanyKey(candidate.companyName);
    const phoneKey = normalizePhone(candidate.phone);
    const emailKey = normalizeEmail(candidate.email);
    return (companies || []).filter((existing) => {
      if (existing.id === excludeId) return false;
      return (nameKey && normalizeCompanyKey(existing.companyName) === nameKey)
        || (phoneKey && normalizePhone(existing.phone) === phoneKey)
        || (emailKey && normalizeEmail(existing.email) === emailKey);
    }).map((existing) => {
      const reasons = [];
      if (nameKey && normalizeCompanyKey(existing.companyName) === nameKey) reasons.push("業者名");
      if (phoneKey && normalizePhone(existing.phone) === phoneKey) reasons.push("電話番号");
      if (emailKey && normalizeEmail(existing.email) === emailKey) reasons.push("メール");
      return { company: existing, reasons };
    });
  }

  function csvEscape(value) {
    const text = String(value == null ? "" : value);
    const safeText = /^[=+\-@]/.test(text.replace(/^[\s\u3000]+/, "")) ? `'${text}` : text;
    return `"${safeText.replace(/"/g, '""')}"`;
  }

  function buildCsv(companies) {
    const headers = ["業者名", "担当者名", "電話番号", "メール", "買取エリア", "買取対象", "温度感", "お気に入り", "メモ", "登録日", "更新日"];
    const rows = (companies || []).map((company) => [
      company.companyName,
      company.contactName,
      company.phone,
      company.email,
      [...(company.areas || []), company.customArea].filter(Boolean).join(" / "),
      (company.propertyTypes || []).join(" / "),
      company.temperature,
      company.isFavorite ? "はい" : "いいえ",
      company.memo,
      company.createdAt,
      company.updatedAt
    ]);
    return "\uFEFF" + [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n");
  }

  function validateBackup(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("バックアップの形式が正しくありません。");
    if (input.format !== KCN.APP.backupFormat) throw new Error("このアプリのバックアップではありません。");
    if (input.schemaVersion != null && (!Number.isInteger(input.schemaVersion) || input.schemaVersion < 1)) throw new Error("schemaVersion が不正です。");
    if (input.schemaVersion > KCN.APP.schemaVersion) throw new Error("このアプリより新しい形式のバックアップです。");
    if (!Array.isArray(input.companies)) throw new Error("companies が配列ではありません。");
    if (input.companies.length > 10000) throw new Error("業者データが多すぎます（上限10,000件）。");
    const ids = new Set();
    const companies = input.companies.map((raw, index) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`${index + 1}件目の業者データが不正です。`);
      if (typeof raw.id !== "string" || !raw.id.trim()) throw new Error(`${index + 1}件目のIDがありません。`);
      const normalizedId = cleanSingleLine(raw.id);
      if (normalizedId.length > 200) throw new Error(`${index + 1}件目のIDが長すぎます。`);
      if (ids.has(normalizedId)) throw new Error(`重複IDがあります: ${normalizedId}`);
      ids.add(normalizedId);
      if (typeof raw.companyName !== "string" || !raw.companyName.trim()) throw new Error(`${index + 1}件目の業者名が不正です。`);
      if (raw.companyName.length > 120) throw new Error(`${index + 1}件目の業者名が長すぎます。`);
      const arrayFields = ["areas", "propertyTypes"];
      arrayFields.forEach((field) => {
        if (raw[field] != null && (!Array.isArray(raw[field]) || raw[field].some((value) => typeof value !== "string"))) {
          throw new Error(`${index + 1}件目の${field}が不正です。`);
        }
      });
      ["contactName", "phone", "email", "customArea", "temperature", "memo", "createdAt", "updatedAt"].forEach((field) => {
        if (raw[field] != null && typeof raw[field] !== "string") throw new Error(`${index + 1}件目の${field}が不正です。`);
      });
      if (raw.temperature != null && !Object.values(KCN.TEMPERATURES).includes(raw.temperature)) throw new Error(`${index + 1}件目の温度感が不正です。`);
      if (raw.isFavorite != null && typeof raw.isFavorite !== "boolean") throw new Error(`${index + 1}件目のお気に入りが不正です。`);
      if (raw.memo != null && raw.memo.length > 500) throw new Error(`${index + 1}件目のメモが長すぎます。`);
      ["createdAt", "updatedAt"].forEach((field) => {
        if (raw[field] && Number.isNaN(Date.parse(raw[field]))) throw new Error(`${index + 1}件目の${field}が不正です。`);
      });
      return normalizeCompany({ ...raw, id: normalizedId });
    });
    let settings = null;
    if (input.settings != null) {
      if (!input.settings || typeof input.settings !== "object" || Array.isArray(input.settings)) throw new Error("設定データが不正です。");
      ["areaOptions", "propertyTypeOptions"].forEach((field) => {
        if (input.settings[field] != null && (!Array.isArray(input.settings[field]) || input.settings[field].some((value) => typeof value !== "string"))) {
          throw new Error(`設定の${field}が不正です。`);
        }
      });
      if (input.settings.defaultSort != null && !["name", "favorite", "temperature", "updated", "created"].includes(input.settings.defaultSort)) {
        throw new Error("設定のdefaultSortが不正です。");
      }
      if (input.settings.sampleInitialized != null && typeof input.settings.sampleInitialized !== "boolean") {
        throw new Error("設定のsampleInitializedが不正です。");
      }
      const areaOptions = uniqueStrings(input.settings.areaOptions || KCN.AREA_OPTIONS);
      const propertyTypeOptions = uniqueStrings(input.settings.propertyTypeOptions || KCN.PROPERTY_TYPE_OPTIONS);
      if (!areaOptions.length || !propertyTypeOptions.length) throw new Error("設定候補が空です。");
      settings = {
        ...KCN.DEFAULT_SETTINGS,
        ...input.settings,
        id: KCN.APP.settingsId,
        areaOptions,
        propertyTypeOptions,
        schemaVersion: KCN.APP.schemaVersion
      };
    }
    return { companies, settings };
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function todayFileStamp() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  Object.assign(KCN, {
    japaneseCollator,
    normalizeText,
    cleanSingleLine,
    cleanMultiline,
    normalizeCompanyKey,
    normalizePhone,
    phoneHref,
    normalizeEmail,
    isPlausiblePhone,
    isPlausibleEmail,
    mailtoHref,
    uniqueStrings,
    uuid,
    isoNow,
    formatDate,
    escapeHtml,
    temperatureRank,
    normalizeCompany,
    companySearchHaystack,
    areaMatches,
    matchesCompany,
    compareCompanies,
    findDuplicates,
    buildCsv,
    validateBackup,
    downloadBlob,
    todayFileStamp
  });
})(window);
