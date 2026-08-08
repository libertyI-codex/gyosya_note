(function (global) {
  "use strict";

  const KCN = global.KCN;
  const japaneseCollator = new Intl.Collator("ja-JP", {
    usage: "sort",
    sensitivity: "base",
    numeric: true,
    ignorePunctuation: true
  });

  function katakanaToHiragana(value) {
    return String(value == null ? "" : value)
      .normalize("NFKC")
      .replace(/[ァ-ヶ]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0x60))
      .replace(/ヽ/g, "ゝ")
      .replace(/ヾ/g, "ゞ");
  }

  function normalizeText(value) {
    return String(value == null ? "" : value)
      .normalize("NFKC")
      .replace(/[ァ-ヶ]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0x60))
      .replace(/ヽ/g, "ゝ")
      .replace(/ヾ/g, "ゞ")
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

  function normalizeKana(value) {
    return katakanaToHiragana(cleanSingleLine(value));
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

  function normalizeAreaId(value) {
    const cleaned = cleanSingleLine(value);
    if (!cleaned) return "";
    if (KCN.AREA_IDS.includes(cleaned)) return cleaned;
    return KCN.AREA_ID_BY_LABEL[cleaned] || cleaned;
  }

  function areaLabel(value) {
    const id = normalizeAreaId(value);
    return KCN.AREA_LABELS[id] || cleanSingleLine(value);
  }

  function normalizeAreaValues(values) {
    return uniqueStrings(values).map(normalizeAreaId).filter(Boolean);
  }

  function expandAreaSelection(values) {
    const selected = normalizeAreaValues(values);
    const expanded = [];
    const seen = new Set();
    selected.forEach((id) => {
      const valuesToAdd = KCN.AREA_INCLUSION_RULES[id] || [id];
      valuesToAdd.forEach((value) => {
        if (!seen.has(value)) {
          seen.add(value);
          expanded.push(value);
        }
      });
    });
    return expanded;
  }

  function normalizePurchaseTargetId(value) {
    const cleaned = cleanSingleLine(value);
    if (!cleaned) return "";
    if (KCN.PURCHASE_TARGET_IDS.includes(cleaned)) return cleaned;
    return KCN.PURCHASE_TARGET_IDS.find((id) => KCN.PURCHASE_TARGET_LABELS[id] === cleaned) || "";
  }

  function purchaseTargetLabel(value) {
    return KCN.PURCHASE_TARGET_LABELS[cleanSingleLine(value)] || cleanSingleLine(value);
  }

  function expandPurchaseTargetSelection(values) {
    const selected = uniqueStrings(values);
    if (!selected.includes("all")) {
      return selected.filter((value) => KCN.PURCHASE_TARGET_IDS.includes(value));
    }
    return uniqueStrings([
      "all",
      ...KCN.PURCHASE_TARGET_ALL_IDS,
      ...selected.filter((value) => value !== "all" && KCN.PURCHASE_TARGET_IDS.includes(value))
    ]);
  }

  function migrateLegacyPurchaseTargets(propertyTypes, existingIds, existingLegacy) {
    const purchaseTargetIds = [];
    const legacyPurchaseTargets = [];
    const targetSeen = new Set();
    const legacySeen = new Set();
    const addTarget = (id) => {
      if (KCN.PURCHASE_TARGET_IDS.includes(id) && !targetSeen.has(id)) {
        targetSeen.add(id);
        purchaseTargetIds.push(id);
      }
    };
    const addLegacy = (value) => {
      const cleaned = cleanSingleLine(value);
      const key = normalizeText(cleaned);
      if (cleaned && !legacySeen.has(key)) {
        legacySeen.add(key);
        legacyPurchaseTargets.push(cleaned);
      }
    };

    uniqueStrings(existingIds).forEach((value) => {
      if (value === "all") {
        KCN.PURCHASE_TARGET_ALL_IDS.forEach(addTarget);
        return;
      }
      const id = normalizePurchaseTargetId(value);
      if (id) addTarget(id);
      else addLegacy(value);
    });
    uniqueStrings(propertyTypes).forEach((value) => {
      const mapped = KCN.LEGACY_PURCHASE_TARGET_MAP[value];
      if (mapped) mapped.forEach(addTarget);
      else {
        const directId = normalizePurchaseTargetId(value);
        if (directId) addTarget(directId);
        else addLegacy(value);
      }
    });
    uniqueStrings(existingLegacy).forEach(addLegacy);
    return { purchaseTargetIds, legacyPurchaseTargets };
  }

  function isValidIsoDateTime(value) {
    return typeof value === "string" && Boolean(value) && !Number.isNaN(Date.parse(value));
  }

  function isValidDateOnly(value) {
    if (value === "") return true;
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function normalizeDateOnly(value) {
    const cleaned = cleanSingleLine(value);
    return isValidDateOnly(cleaned) ? cleaned : "";
  }

  function normalizeOptionalInteger(value) {
    if (value === "" || value == null) return null;
    const number = typeof value === "number" ? value : Number(String(value).normalize("NFKC").replace(/,/g, ""));
    return Number.isSafeInteger(number) && number >= 0 ? number : null;
  }

  function normalizeOptionalNumber(value) {
    if (value === "" || value == null) return null;
    const number = typeof value === "number" ? value : Number(String(value).normalize("NFKC").replace(/,/g, ""));
    return Number.isFinite(number) && number >= 0 ? number : null;
  }

  function caseTypeLabel(value, customValue) {
    if (!value) return cleanSingleLine(customValue) || "未選択";
    if (value === "other" && cleanSingleLine(customValue)) return cleanSingleLine(customValue);
    return KCN.CASE_TYPE_LABELS[value] || cleanSingleLine(customValue) || "その他";
  }

  function caseFactorLabel(value) {
    return KCN.CASE_FACTOR_LABELS[value] || cleanSingleLine(value);
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

  function normalizeCompany(raw, options) {
    const source = raw && typeof raw === "object" ? raw : {};
    const opts = options || {};
    const createdAt = typeof source.createdAt === "string" && !Number.isNaN(Date.parse(source.createdAt))
      ? source.createdAt
      : (opts.createdAt || isoNow());
    const updatedAt = typeof source.updatedAt === "string" && !Number.isNaN(Date.parse(source.updatedAt))
      ? source.updatedAt
      : (opts.updatedAt || createdAt);
    const isArchived = source.isArchived === true;
    const archivedAt = isArchived
      ? (isValidIsoDateTime(source.archivedAt) ? source.archivedAt : (opts.archivedAt || updatedAt))
      : null;
    const migratedTargets = migrateLegacyPurchaseTargets(
      source.propertyTypes,
      source.purchaseTargetIds,
      source.legacyPurchaseTargets
    );
    return {
      id: cleanSingleLine(source.id) || uuid(),
      companyName: cleanSingleLine(source.companyName),
      companyNameKana: normalizeKana(source.companyNameKana).slice(0, 120),
      contactName: cleanSingleLine(source.contactName),
      phone: cleanSingleLine(source.phone),
      email: normalizeEmail(source.email),
      areas: normalizeAreaValues(source.areas),
      customArea: cleanSingleLine(source.customArea).slice(0, 120),
      purchaseTargetIds: migratedTargets.purchaseTargetIds,
      customPurchaseTarget: cleanMultiline(source.customPurchaseTarget, 300),
      legacyPurchaseTargets: migratedTargets.legacyPurchaseTargets,
      isFavorite: source.isFavorite === true,
      memo: cleanMultiline(source.memo, 500),
      createdAt,
      updatedAt,
      isSample: source.isSample === true,
      isArchived,
      archivedAt,
      schemaVersion: KCN.APP.schemaVersion,
      extra: source.extra && typeof source.extra === "object" && !Array.isArray(source.extra) ? source.extra : {}
    };
  }

  // IndexedDB v2のストアを維持したまま、既存の生レコードへ試作3項目を補完する。
  // 元フィールドを先に展開するためtemperature/propertyTypes等は移行時に消さない。
  function migrateStoredCompany(raw) {
    const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    return { ...source, ...normalizeCompany(source), schemaVersion: KCN.APP.schemaVersion };
  }

  function serializeCompanyForBackup(raw) {
    const company = normalizeCompany(raw);
    return {
      id: company.id,
      companyName: company.companyName,
      companyNameKana: company.companyNameKana,
      contactName: company.contactName,
      phone: company.phone,
      email: company.email,
      areas: company.areas,
      customArea: company.customArea,
      purchaseTargetIds: company.purchaseTargetIds,
      customPurchaseTarget: company.customPurchaseTarget,
      legacyPurchaseTargets: company.legacyPurchaseTargets,
      isFavorite: company.isFavorite,
      memo: company.memo,
      isArchived: company.isArchived,
      archivedAt: company.archivedAt,
      isSample: company.isSample,
      createdAt: company.createdAt,
      updatedAt: company.updatedAt
    };
  }

  function normalizeCase(raw, options) {
    const source = raw && typeof raw === "object" ? raw : {};
    const opts = options || {};
    const createdAt = isValidIsoDateTime(source.createdAt) ? source.createdAt : (opts.createdAt || isoNow());
    const updatedAt = isValidIsoDateTime(source.updatedAt) ? source.updatedAt : (opts.updatedAt || createdAt);
    const caseType = source.caseType === "" || source.caseType == null
      ? ""
      : (KCN.CASE_TYPE_IDS.includes(source.caseType) ? source.caseType : "");
    const factors = uniqueStrings(source.factors).filter((factor) => KCN.CASE_FACTOR_IDS.includes(factor));
    return {
      id: cleanSingleLine(source.id) || uuid(),
      caseName: cleanSingleLine(source.caseName).slice(0, 120),
      location: cleanSingleLine(source.location).slice(0, 160),
      area: normalizeAreaId(source.area).slice(0, 80),
      customArea: cleanSingleLine(source.customArea).slice(0, 120),
      caseType,
      customCaseType: cleanSingleLine(source.customCaseType).slice(0, 80),
      factors,
      askingPrice: normalizeOptionalInteger(source.askingPrice),
      landArea: normalizeOptionalNumber(source.landArea),
      buildingArea: normalizeOptionalNumber(source.buildingArea),
      status: KCN.CASE_STATUSES.includes(source.status) ? source.status : KCN.CASE_STATUSES[0],
      memo: cleanMultiline(source.memo, 500),
      createdAt,
      updatedAt,
      schemaVersion: KCN.APP.schemaVersion,
      extra: source.extra && typeof source.extra === "object" && !Array.isArray(source.extra) ? source.extra : {}
    };
  }

  function normalizeCaseResponse(raw, options) {
    const source = raw && typeof raw === "object" ? raw : {};
    const opts = options || {};
    const createdAt = isValidIsoDateTime(source.createdAt) ? source.createdAt : (opts.createdAt || isoNow());
    const updatedAt = isValidIsoDateTime(source.updatedAt) ? source.updatedAt : (opts.updatedAt || createdAt);
    const responseFactors = uniqueStrings(source.responseFactors).filter((factor) => KCN.CASE_FACTOR_IDS.includes(factor));
    return {
      id: cleanSingleLine(source.id) || uuid(),
      caseId: cleanSingleLine(source.caseId),
      companyId: cleanSingleLine(source.companyId),
      responseStatus: KCN.RESPONSE_STATUSES.includes(source.responseStatus) ? source.responseStatus : KCN.RESPONSE_STATUSES[0],
      responseAmount: normalizeOptionalInteger(source.responseAmount),
      responseDate: normalizeDateOnly(source.responseDate),
      responseFactors,
      responseReason: KCN.RESPONSE_REASONS.includes(source.responseReason) ? source.responseReason : "",
      memo: cleanMultiline(source.memo, 500),
      followUpDate: normalizeDateOnly(source.followUpDate),
      companyNameSnapshot: cleanSingleLine(source.companyNameSnapshot).slice(0, 120),
      contactNameSnapshot: cleanSingleLine(source.contactNameSnapshot).slice(0, 80),
      phoneSnapshot: cleanSingleLine(source.phoneSnapshot).slice(0, 40),
      emailSnapshot: normalizeEmail(source.emailSnapshot).slice(0, 160),
      createdAt,
      updatedAt,
      schemaVersion: KCN.APP.schemaVersion,
      extra: source.extra && typeof source.extra === "object" && !Array.isArray(source.extra) ? source.extra : {}
    };
  }

  function caseSearchHaystack(caseRecord) {
    const item = caseRecord || {};
    return normalizeText([
      item.caseName,
      item.location,
      item.area,
      areaLabel(item.area),
      item.customArea,
      caseTypeLabel(item.caseType, item.customCaseType),
      ...(item.factors || []).map(caseFactorLabel),
      item.status,
      item.memo
    ].join(" "));
  }

  function matchesCase(caseRecord, filters) {
    const item = caseRecord || {};
    const f = filters || {};
    const selectedAreas = Array.isArray(f.areas) ? f.areas : (f.area ? [f.area] : []);
    const selectedTypes = Array.isArray(f.caseTypes) ? f.caseTypes : (f.caseType ? [f.caseType] : []);
    const selectedFactors = Array.isArray(f.factors) ? f.factors : (f.factor ? [f.factor] : []);
    const selectedStatuses = Array.isArray(f.statuses) ? f.statuses : (f.status ? [f.status] : []);
    if (selectedAreas.length && !areaMatches([item.area], selectedAreas) && !selectedAreas.some((area) => area === item.customArea)) return false;
    if (selectedTypes.length && !selectedTypes.includes(item.caseType)) return false;
    if (selectedFactors.length && !selectedFactors.some((factor) => (item.factors || []).includes(factor))) return false;
    if (selectedStatuses.length && !selectedStatuses.includes(item.status)) return false;
    if (["active", "open", "進行中"].includes(f.progress) && ["成約", "見送り"].includes(item.status)) return false;
    if (["closed", "complete", "完了"].includes(f.progress) && !["成約", "見送り"].includes(item.status)) return false;
    const query = normalizeText(f.query || "");
    if (query) {
      const haystack = caseSearchHaystack(item);
      if (!query.split(" ").filter(Boolean).every((token) => haystack.includes(token))) return false;
    }
    return true;
  }

  function compareCases(a, b, sortMode) {
    const nameCompare = japaneseCollator.compare(a.caseName || "", b.caseName || "");
    const idCompare = String(a.id || "").localeCompare(String(b.id || ""));
    if (sortMode === "created") return String(b.createdAt || "").localeCompare(String(a.createdAt || "")) || nameCompare || idCompare;
    if (sortMode === "name") return nameCompare || idCompare;
    if (sortMode === "status") return KCN.CASE_STATUSES.indexOf(a.status) - KCN.CASE_STATUSES.indexOf(b.status) || nameCompare || idCompare;
    return String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")) || nameCompare || idCompare;
  }

  function compareResponses(a, b, sortMode) {
    const idCompare = String(a.id || "").localeCompare(String(b.id || ""));
    if (sortMode === "status") {
      const statusOrder = ["成約", "金額回答", "条件付き", "回答待ち", "打診済み", "見送り"];
      const statusCompare = statusOrder.indexOf(a.responseStatus) - statusOrder.indexOf(b.responseStatus);
      if (statusCompare) return statusCompare;
      const aHasAmount = a.responseAmount != null;
      const bHasAmount = b.responseAmount != null;
      if (aHasAmount !== bHasAmount) return aHasAmount ? -1 : 1;
      if (aHasAmount && a.responseAmount !== b.responseAmount) return b.responseAmount - a.responseAmount;
      return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))
        || idCompare;
    }
    if (sortMode === "amount") return (b.responseAmount == null ? -1 : b.responseAmount) - (a.responseAmount == null ? -1 : a.responseAmount) || idCompare;
    return String(b.responseDate || b.updatedAt || "").localeCompare(String(a.responseDate || a.updatedAt || "")) || idCompare;
  }

  function findSimilarCases(target, cases, limitOrOptions) {
    const source = normalizeCase(target || {});
    const options = typeof limitOrOptions === "number" ? { limit: limitOrOptions } : (limitOrOptions || {});
    const limit = Number.isInteger(options.limit) && options.limit >= 0 ? options.limit : 5;
    const sourceFactors = new Set(source.factors || []);
    return (Array.isArray(cases) ? cases : [])
      .filter((candidate) => candidate && candidate.id !== source.id)
      .map((candidate) => {
        const item = normalizeCase(candidate);
        let similarityScore = 0;
        const similarityReasons = [];
        const similarityTypeMatch = Boolean(source.caseType) && source.caseType === item.caseType;
        if (similarityTypeMatch) {
          similarityScore += 5;
          similarityReasons.push("案件種別");
        }
        const similarityAreaMatch = Boolean(source.area) && source.area === item.area;
        if (similarityAreaMatch) {
          similarityScore += 4;
          similarityReasons.push("エリア");
        }
        const overlappingFactors = (item.factors || []).filter((factor) => sourceFactors.has(factor));
        if (overlappingFactors.length) {
          similarityScore += Math.min(5, overlappingFactors.length * 2);
          similarityReasons.push(`個別要因${overlappingFactors.length}件`);
        }
        if (source.askingPrice != null && item.askingPrice != null && Math.max(source.askingPrice, item.askingPrice) > 0) {
          const ratio = Math.min(source.askingPrice, item.askingPrice) / Math.max(source.askingPrice, item.askingPrice);
          if (ratio >= 0.8) {
            similarityScore += 2;
            similarityReasons.push("希望額帯");
          }
        }
        return {
          ...item,
          similarityScore,
          similarityReasons,
          similarityTypeMatch,
          similarityFactorCount: overlappingFactors.length,
          similarityAreaMatch
        };
      })
      .filter((item) => options.includeZero === true || item.similarityScore > 0)
      .sort((a, b) => Number(b.similarityTypeMatch) - Number(a.similarityTypeMatch)
        || b.similarityFactorCount - a.similarityFactorCount
        || Number(b.similarityAreaMatch) - Number(a.similarityAreaMatch)
        || compareCases(a, b, "updated"))
      .slice(0, limit);
  }

  function buildCompanyHistory(companyId, cases, responses) {
    const normalizedCompanyId = cleanSingleLine(companyId);
    const caseMap = new Map((Array.isArray(cases) ? cases : []).map((item) => [item.id, item]));
    const items = (Array.isArray(responses) ? responses : [])
      .filter((response) => response && response.companyId === normalizedCompanyId)
      .map((response) => {
        const caseRecord = caseMap.get(response.caseId) || null;
        return {
          ...response,
          case: caseRecord,
          caseName: caseRecord ? caseRecord.caseName : "",
          location: caseRecord ? caseRecord.location : "",
          caseStatus: caseRecord ? caseRecord.status : ""
        };
      })
      .sort((a, b) => compareResponses(a, b, "date"));
    const statusCounts = Object.fromEntries(KCN.RESPONSE_STATUSES.map((status) => [status, 0]));
    const reasonCounts = Object.fromEntries(KCN.RESPONSE_REASONS.map((reason) => [reason, 0]));
    items.forEach((item) => {
      if (Object.prototype.hasOwnProperty.call(statusCounts, item.responseStatus)) statusCounts[item.responseStatus] += 1;
      if (item.responseReason && Object.prototype.hasOwnProperty.call(reasonCounts, item.responseReason)) reasonCounts[item.responseReason] += 1;
    });
    return {
      companyId: normalizedCompanyId,
      items,
      total: items.length,
      statusCounts,
      reasonCounts,
      latestResponseAt: items.length ? (items[0].responseDate || items[0].updatedAt || "") : ""
    };
  }

  function companySearchHaystack(company) {
    return normalizeText([
      company.companyName,
      company.companyNameKana,
      company.contactName,
      company.phone,
      company.email,
      ...(company.areas || []),
      ...(company.areas || []).map(areaLabel),
      company.customArea,
      ...(company.purchaseTargetIds || []).map(purchaseTargetLabel),
      ...(company.legacyPurchaseTargets || []),
      company.customPurchaseTarget,
      company.memo
    ].join(" "));
  }

  function areaMatches(companyAreas, selectedAreas) {
    const requested = normalizeAreaValues(selectedAreas);
    if (!requested.length) return true;
    const coverage = new Set(expandAreaSelection(companyAreas));
    return requested.some((selected) => coverage.has(selected));
  }

  function matchesCompany(company, filters) {
    const f = filters || {};
    const selectedAreas = Array.isArray(f.areas) ? f.areas : [];
    const selectedTypes = Array.isArray(f.purchaseTargetIds)
      ? f.purchaseTargetIds
      : (Array.isArray(f.propertyTypes) ? f.propertyTypes : []);
    if (!areaMatches(company.areas || [], selectedAreas)) return false;
    if (selectedTypes.length) {
      const normalizedCompany = normalizeCompany(company);
      const companyIds = new Set(normalizedCompany.purchaseTargetIds);
      const companyLegacy = new Set(normalizedCompany.legacyPurchaseTargets.map(normalizeText));
      const matched = selectedTypes.some((value) => {
        const legacyMappedIds = KCN.LEGACY_PURCHASE_TARGET_MAP[cleanSingleLine(value)];
        if (legacyMappedIds) return legacyMappedIds.some((id) => companyIds.has(id));
        const id = normalizePurchaseTargetId(value);
        return id ? companyIds.has(id) : companyLegacy.has(normalizeText(value));
      });
      if (!matched) return false;
    }
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
    const nameCompare = japaneseCollator.compare(
      normalizeKana(a.companyNameKana) || a.companyName || "",
      normalizeKana(b.companyNameKana) || b.companyName || ""
    );
    const idCompare = String(a.id || "").localeCompare(String(b.id || ""));
    if (sortMode === "favorite") return Number(b.isFavorite) - Number(a.isFavorite) || nameCompare || idCompare;
    if (sortMode === "updated") return String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")) || nameCompare || idCompare;
    if (sortMode === "created") return String(b.createdAt || "").localeCompare(String(a.createdAt || "")) || nameCompare || idCompare;
    if (sortMode === "search") {
      return Number(b.isFavorite) - Number(a.isFavorite)
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
    const headers = [
      "業者名", "業者名よみがな", "担当者名", "電話番号", "メール", "買取エリア", "買取対象",
      "その他補足", "お気に入り", "メモ", "登録日", "更新日"
    ];
    const rows = (companies || []).map((rawCompany) => {
      const company = normalizeCompany(rawCompany);
      return [
        company.companyName,
        company.companyNameKana,
        company.contactName,
        company.phone,
        company.email,
        [...company.areas.map(areaLabel), company.customArea].filter(Boolean).join(" / "),
        [
          ...company.purchaseTargetIds.map(purchaseTargetLabel),
          ...company.legacyPurchaseTargets
        ].join(" / "),
        company.customPurchaseTarget,
        company.isFavorite ? "はい" : "いいえ",
        company.memo,
        company.createdAt,
        company.updatedAt
      ];
    });
    return "\uFEFF" + [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n");
  }

  function buildCaseResponsesCsv(cases, responses, companies) {
    const headers = [
      "案件名", "所在地", "エリア", "案件種別", "個別要因", "売主希望額", "土地面積㎡", "建物面積㎡", "案件状況",
      "業者名", "業者名よみがな", "担当者名", "回答状況", "回答金額", "回答日", "回答理由", "回答関連要因", "次回確認日", "回答メモ",
      "案件メモ", "案件登録日", "案件更新日", "回答登録日", "回答更新日"
    ];
    const companyMap = new Map((Array.isArray(companies) ? companies : []).map((rawCompany) => {
      const company = normalizeCompany(rawCompany);
      return [company.id, company];
    }));
    const responsesByCase = new Map();
    (Array.isArray(responses) ? responses : []).forEach((response) => {
      if (!response || !response.caseId) return;
      if (!responsesByCase.has(response.caseId)) responsesByCase.set(response.caseId, []);
      responsesByCase.get(response.caseId).push(response);
    });
    const rows = [];
    (Array.isArray(cases) ? cases : []).forEach((caseRecord) => {
      const linkedResponses = responsesByCase.get(caseRecord.id) || [null];
      linkedResponses.forEach((response) => {
        const company = response ? companyMap.get(response.companyId) : null;
        rows.push([
          caseRecord.caseName,
          caseRecord.location,
          [areaLabel(caseRecord.area), caseRecord.customArea].filter(Boolean).join(" / "),
          caseTypeLabel(caseRecord.caseType, caseRecord.customCaseType),
          (caseRecord.factors || []).map(caseFactorLabel).join(" / "),
          caseRecord.askingPrice == null ? "" : caseRecord.askingPrice,
          caseRecord.landArea == null ? "" : caseRecord.landArea,
          caseRecord.buildingArea == null ? "" : caseRecord.buildingArea,
          caseRecord.status,
          response ? (response.companyNameSnapshot || (company && company.companyName) || "") : "",
          response && company ? (company.companyNameKana || "") : "",
          response ? (response.contactNameSnapshot || (company && company.contactName) || "") : "",
          response ? response.responseStatus : "",
          response && response.responseAmount != null ? response.responseAmount : "",
          response ? response.responseDate : "",
          response ? response.responseReason : "",
          response ? (response.responseFactors || []).map(caseFactorLabel).join(" / ") : "",
          response ? response.followUpDate : "",
          response ? response.memo : "",
          caseRecord.memo,
          caseRecord.createdAt,
          caseRecord.updatedAt,
          response ? response.createdAt : "",
          response ? response.updatedAt : ""
        ]);
      });
    });
    return "\uFEFF" + [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n");
  }

  function buildCaseResponseCsv(cases, responses, companies) {
    return buildCaseResponsesCsv(cases, responses, companies);
  }

  function validateBackup(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("バックアップの形式が正しくありません。");
    if (input.format !== KCN.APP.backupFormat) throw new Error("このアプリのバックアップではありません。");
    const sourceSchemaVersion = input.schemaVersion == null ? 1 : input.schemaVersion;
    if (!Number.isInteger(sourceSchemaVersion) || sourceSchemaVersion < 1) throw new Error("schemaVersion が不正です。");
    if (sourceSchemaVersion > KCN.APP.schemaVersion) throw new Error("このアプリより新しい形式のバックアップです。");
    if (!Array.isArray(input.companies)) throw new Error("companies が配列ではありません。");
    if (input.companies.length > 10000) throw new Error("業者データが多すぎます（上限10,000件）。");

    function validatedId(rawId, index, label, ids) {
      if (typeof rawId !== "string" || !rawId.trim()) throw new Error(`${index + 1}件目の${label}IDがありません。`);
      const normalizedId = cleanSingleLine(rawId);
      if (normalizedId.length > 200) throw new Error(`${index + 1}件目の${label}IDが長すぎます。`);
      if (ids.has(normalizedId)) throw new Error(`${label}に重複IDがあります: ${normalizedId}`);
      ids.add(normalizedId);
      return normalizedId;
    }

    function validateStringFields(raw, fields, index, label) {
      fields.forEach((field) => {
        if (raw[field] != null && typeof raw[field] !== "string") throw new Error(`${index + 1}件目の${label}${field}が不正です。`);
      });
    }

    function validateTimestamps(raw, index, label) {
      ["createdAt", "updatedAt"].forEach((field) => {
        if (raw[field] && !isValidIsoDateTime(raw[field])) throw new Error(`${index + 1}件目の${label}${field}が不正です。`);
      });
    }

    const companyIds = new Set();
    const companies = input.companies.map((raw, index) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`${index + 1}件目の業者データが不正です。`);
      const normalizedId = validatedId(raw.id, index, "業者", companyIds);
      if (typeof raw.companyName !== "string" || !raw.companyName.trim()) throw new Error(`${index + 1}件目の業者名が不正です。`);
      if (raw.companyName.length > 120) throw new Error(`${index + 1}件目の業者名が長すぎます。`);
      const arrayFields = ["areas", "propertyTypes", "purchaseTargetIds", "legacyPurchaseTargets"];
      arrayFields.forEach((field) => {
        if (raw[field] != null && (!Array.isArray(raw[field]) || raw[field].some((value) => typeof value !== "string"))) {
          throw new Error(`${index + 1}件目の${field}が不正です。`);
        }
      });
      validateStringFields(raw, [
        "companyNameKana", "contactName", "phone", "email", "customArea", "customPurchaseTarget",
        "temperature", "memo", "createdAt", "updatedAt"
      ], index, "業者");
      if (sourceSchemaVersion >= 3 && raw.purchaseTargetIds != null
        && raw.purchaseTargetIds.some((value) => !KCN.PURCHASE_TARGET_IDS.includes(value))) {
        throw new Error(`${index + 1}件目の買取対象IDが不正です。`);
      }
      if (sourceSchemaVersion >= 3 && Array.isArray(raw.purchaseTargetIds)
        && new Set(raw.purchaseTargetIds).size !== raw.purchaseTargetIds.length) {
        throw new Error(`${index + 1}件目の買取対象IDが重複しています。`);
      }
      if (sourceSchemaVersion >= 3 && Array.isArray(raw.legacyPurchaseTargets)
        && new Set(raw.legacyPurchaseTargets.map(normalizeText)).size !== raw.legacyPurchaseTargets.length) {
        throw new Error(`${index + 1}件目の旧買取対象が重複しています。`);
      }
      if (raw.companyNameKana != null && raw.companyNameKana.length > 120) throw new Error(`${index + 1}件目の業者名よみがなが長すぎます。`);
      if (raw.customPurchaseTarget != null && raw.customPurchaseTarget.length > 300) throw new Error(`${index + 1}件目のその他補足が長すぎます。`);
      if (raw.isFavorite != null && typeof raw.isFavorite !== "boolean") throw new Error(`${index + 1}件目のお気に入りが不正です。`);
      if (raw.isArchived != null && typeof raw.isArchived !== "boolean") throw new Error(`${index + 1}件目のアーカイブ状態が不正です。`);
      if (raw.archivedAt != null && !isValidIsoDateTime(raw.archivedAt)) throw new Error(`${index + 1}件目のarchivedAtが不正です。`);
      if (raw.memo != null && raw.memo.length > 500) throw new Error(`${index + 1}件目のメモが長すぎます。`);
      validateTimestamps(raw, index, "業者");
      return normalizeCompany({ ...raw, id: normalizedId });
    });

    let cases = [];
    let caseResponses = [];
    if (sourceSchemaVersion >= 2) {
      if (!Array.isArray(input.cases)) throw new Error("cases が配列ではありません。");
      if (!Array.isArray(input.caseResponses)) throw new Error("caseResponses が配列ではありません。");
      if (input.cases.length > 10000) throw new Error("案件データが多すぎます（上限10,000件）。");
      if (input.caseResponses.length > 50000) throw new Error("回答データが多すぎます（上限50,000件）。");

      const caseIds = new Set();
      cases = input.cases.map((raw, index) => {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`${index + 1}件目の案件データが不正です。`);
        const normalizedId = validatedId(raw.id, index, "案件", caseIds);
        if (typeof raw.caseName !== "string" || !raw.caseName.trim()) throw new Error(`${index + 1}件目の案件名が不正です。`);
        if (raw.caseName.length > 120) throw new Error(`${index + 1}件目の案件名が長すぎます。`);
        validateStringFields(raw, ["location", "area", "customArea", "caseType", "customCaseType", "status", "memo", "createdAt", "updatedAt"], index, "案件");
        if (raw.caseType !== "" && !KCN.CASE_TYPE_IDS.includes(raw.caseType)) throw new Error(`${index + 1}件目の案件種別が不正です。`);
        if (!KCN.CASE_STATUSES.includes(raw.status)) throw new Error(`${index + 1}件目の案件状況が不正です。`);
        if (!Array.isArray(raw.factors) || raw.factors.some((factor) => typeof factor !== "string" || !KCN.CASE_FACTOR_IDS.includes(factor))) {
          throw new Error(`${index + 1}件目の案件要因が不正です。`);
        }
        if (new Set(raw.factors).size !== raw.factors.length) throw new Error(`${index + 1}件目の案件要因が重複しています。`);
        if (raw.askingPrice != null && (!Number.isSafeInteger(raw.askingPrice) || raw.askingPrice < 0)) throw new Error(`${index + 1}件目の売主希望額が不正です。`);
        ["landArea", "buildingArea"].forEach((field) => {
          if (raw[field] != null && (!Number.isFinite(raw[field]) || raw[field] < 0)) throw new Error(`${index + 1}件目の${field}が不正です。`);
        });
        if (raw.memo != null && raw.memo.length > 500) throw new Error(`${index + 1}件目の案件メモが長すぎます。`);
        validateTimestamps(raw, index, "案件");
        return normalizeCase({ ...raw, id: normalizedId });
      });

      const caseMap = new Map(cases.map((caseRecord) => [caseRecord.id, caseRecord]));
      const responseIds = new Set();
      const responsePairs = new Set();
      caseResponses = input.caseResponses.map((raw, index) => {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`${index + 1}件目の回答データが不正です。`);
        const normalizedId = validatedId(raw.id, index, "回答", responseIds);
        if (typeof raw.caseId !== "string" || !raw.caseId.trim()) throw new Error(`${index + 1}件目の回答caseIdがありません。`);
        if (typeof raw.companyId !== "string" || !raw.companyId.trim()) throw new Error(`${index + 1}件目の回答companyIdがありません。`);
        const caseId = cleanSingleLine(raw.caseId);
        const companyId = cleanSingleLine(raw.companyId);
        if (!caseMap.has(caseId)) throw new Error(`${index + 1}件目の回答が存在しない案件を参照しています。`);
        if (!companyIds.has(companyId)) throw new Error(`${index + 1}件目の回答が存在しない業者を参照しています。`);
        const pair = JSON.stringify([caseId, companyId]);
        if (responsePairs.has(pair)) throw new Error(`${index + 1}件目の回答に案件・業者の重複があります。`);
        responsePairs.add(pair);
        validateStringFields(raw, [
          "responseStatus", "responseDate", "responseReason", "memo", "followUpDate",
          "companyNameSnapshot", "contactNameSnapshot", "phoneSnapshot", "emailSnapshot", "createdAt", "updatedAt"
        ], index, "回答");
        if (!KCN.RESPONSE_STATUSES.includes(raw.responseStatus)) throw new Error(`${index + 1}件目の回答状況が不正です。`);
        if (raw.responseAmount != null && (!Number.isSafeInteger(raw.responseAmount) || raw.responseAmount < 0)) throw new Error(`${index + 1}件目の回答金額が不正です。`);
        if (!Array.isArray(raw.responseFactors) || raw.responseFactors.some((factor) => typeof factor !== "string" || !KCN.CASE_FACTOR_IDS.includes(factor))) {
          throw new Error(`${index + 1}件目の回答関連要因が不正です。`);
        }
        if (new Set(raw.responseFactors).size !== raw.responseFactors.length) throw new Error(`${index + 1}件目の回答関連要因が重複しています。`);
        if (raw.responseReason && !KCN.RESPONSE_REASONS.includes(raw.responseReason)) throw new Error(`${index + 1}件目の回答理由が不正です。`);
        if (!isValidDateOnly(raw.responseDate || "")) throw new Error(`${index + 1}件目の回答日が不正です。`);
        if (!isValidDateOnly(raw.followUpDate || "")) throw new Error(`${index + 1}件目の次回確認日が不正です。`);
        if (raw.memo != null && raw.memo.length > 500) throw new Error(`${index + 1}件目の回答メモが長すぎます。`);
        validateTimestamps(raw, index, "回答");
        return normalizeCaseResponse({ ...raw, id: normalizedId, caseId, companyId });
      });
    }

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
      const areaOptions = normalizeAreaValues(input.settings.areaOptions || KCN.AREA_IDS);
      const propertyTypeOptions = uniqueStrings(input.settings.propertyTypeOptions || KCN.PURCHASE_TARGET_IDS);
      if (!areaOptions.length || !propertyTypeOptions.length) throw new Error("設定候補が空です。");
      settings = {
        ...KCN.DEFAULT_SETTINGS,
        ...input.settings,
        id: KCN.APP.settingsId,
        areaOptions,
        propertyTypeOptions,
        defaultSort: input.settings.defaultSort === "temperature" ? "name" : (input.settings.defaultSort || "name"),
        schemaVersion: KCN.APP.schemaVersion
      };
    }
    return { sourceSchemaVersion, companies, cases, caseResponses, settings };
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
    katakanaToHiragana,
    normalizeText,
    normalizeSearchText: normalizeText,
    normalizeKana,
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
    normalizeAreaId,
    normalizeAreaValues,
    areaLabel,
    expandAreaSelection,
    normalizePurchaseTargetId,
    purchaseTargetLabel,
    expandPurchaseTargetSelection,
    migrateLegacyPurchaseTargets,
    isValidIsoDateTime,
    isValidDateOnly,
    normalizeDateOnly,
    normalizeOptionalInteger,
    normalizeOptionalNumber,
    caseTypeLabel,
    caseFactorLabel,
    uuid,
    isoNow,
    formatDate,
    escapeHtml,
    normalizeCompany,
    migrateStoredCompany,
    serializeCompanyForBackup,
    normalizeCase,
    normalizeCaseResponse,
    companySearchHaystack,
    caseSearchHaystack,
    areaMatches,
    matchesCompany,
    matchesCase,
    compareCompanies,
    compareCases,
    compareResponses,
    findDuplicates,
    findSimilarCases,
    buildCompanyHistory,
    buildCsv,
    buildCaseResponsesCsv,
    buildCaseResponseCsv,
    validateBackup,
    downloadBlob,
    todayFileStamp
  });
})(window);
