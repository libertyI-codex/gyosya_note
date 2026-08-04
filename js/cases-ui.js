(function (global) {
  "use strict";

  const KCN = global.KCN;
  const ui = {
    initialized: false,
    bound: false,
    cases: [],
    responses: [],
    selectedCaseId: null,
    responseSort: "status",
    filters: {
      progress: "進行中",
      query: "",
      area: "",
      caseType: "",
      factor: "",
      sort: "updated"
    },
    caseForm: { mode: "new", factors: new Set(), dirty: false, saving: false },
    responseForm: { factors: new Set(), dirty: false, saving: false },
    selectedCompanies: new Set(),
    lastFocus: new Map()
  };

  const dom = {};

  function app() {
    return KCN.app;
  }

  function baseState() {
    return app().getState();
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function cacheDom() {
    [
      "screen-cases", "case-list", "case-list-summary", "case-count-badge", "case-query",
      "case-progress-filter", "case-sort", "case-area-filter", "case-type-filter", "case-factor-filter",
      "case-active-filter-count", "clear-case-filters", "case-dialog", "case-form", "case-dialog-mode",
      "case-dialog-title", "case-id", "case-created-at", "case-name", "case-location", "case-area",
      "case-custom-area", "case-type-chips", "case-custom-type", "case-status", "case-factor-chips",
      "case-factor-count", "case-asking-price", "case-land-area", "case-building-area", "case-memo",
      "case-memo-count", "case-form-error", "case-detail-dialog", "case-detail-title", "case-detail-content",
      "case-detail-footer", "case-response-list", "case-response-count", "case-add-companies", "case-find-similar",
      "case-detail-edit", "case-detail-duplicate", "case-detail-delete", "response-sort", "response-dialog", "response-form", "response-dialog-title",
      "response-id", "response-case-id", "response-company-id", "response-company-display",
      "response-company-name", "response-company-contact", "response-status", "response-amount", "response-date", "response-reason", "response-factor-chips",
      "response-factor-warning", "response-follow-up-date", "response-memo", "response-memo-count",
      "response-form-error", "quick-company-dialog", "quick-company-list", "quick-company-summary",
      "quick-company-query", "add-selected-companies", "similar-cases-dialog", "similar-cases-list",
      "advanced-settings-dialog", "advanced-settings-content", "open-advanced-settings", "export-cases-csv",
      "stat-cases-active", "stat-response-waiting", "stat-followup", "follow-up-overview", "archived-company-count",
      "archived-company-query", "archived-company-list", "advanced-settings-fixed-options", "fixed-case-type-count",
      "fixed-case-factor-count", "fixed-case-status-count", "fixed-response-status-count", "open-option-settings-from-advanced",
      "fixed-option-review",
      "quick-company-form", "quick-company-case-id", "quick-company-error", "similar-source-case-id",
      "similar-source-case-name", "similar-source-case-conditions", "similar-cases-summary"
    ].forEach((id) => { dom[id] = byId(id); });
    const aliases = {
      "case-type-chips": "case-type",
      "case-factor-chips": "case-factor-groups",
      "case-asking-price": "asking-price",
      "case-land-area": "land-area",
      "case-building-area": "building-area",
      "case-detail-title": "case-detail-dialog-title",
      "response-company-display": "response-company-heading",
      "response-amount": "response-amount",
      "quick-company-summary": "quick-company-selected-count"
    };
    Object.entries(aliases).forEach(([key, id]) => { dom[key] = byId(id); });
  }

  function optionList(name) {
    return Array.isArray(KCN[name]) ? KCN[name] : [];
  }

  function caseTypes() {
    return optionList("CASE_TYPES");
  }

  function factorCategories() {
    return optionList("FACTOR_CATEGORIES").length ? optionList("FACTOR_CATEGORIES") : optionList("CASE_FACTOR_GROUPS");
  }

  function caseStatuses() {
    return optionList("CASE_STATUSES");
  }

  function responseStatuses() {
    return optionList("RESPONSE_STATUSES");
  }

  function responseReasons() {
    return optionList("RESPONSE_REASONS");
  }

  function optionId(option) {
    return typeof option === "string" ? option : option.id;
  }

  function optionLabel(option) {
    return typeof option === "string" ? option : option.label;
  }

  function findOption(options, id) {
    return (options || []).find((option) => optionId(option) === id);
  }

  function typeLabel(id, custom) {
    const option = findOption(caseTypes(), id);
    if (!option) return id || "未選択";
    const label = optionLabel(option);
    return id === "other" && custom ? `${label}（${custom}）` : label;
  }

  function factorOptions() {
    return factorCategories().flatMap((category) => Array.isArray(category.options) ? category.options : []);
  }

  function factorLabel(id) {
    const option = findOption(factorOptions(), id);
    return option ? optionLabel(option) : id;
  }

  function escape(value) {
    return KCN.escapeHtml(value == null ? "" : value);
  }

  function focusSoon(target) {
    if (target && typeof target.focus === "function") requestAnimationFrame(() => target.focus({ preventScroll: true }));
  }

  function formatMoney(value) {
    if (value === null || value === undefined || value === "") return "未登録";
    const number = Number(value);
    if (!Number.isFinite(number)) return "未登録";
    if (number >= 10000 && number % 10000 === 0) return `${new Intl.NumberFormat("ja-JP").format(number / 10000)}万円`;
    return `${new Intl.NumberFormat("ja-JP").format(number)}円`;
  }

  function formatArea(value) {
    if (value === null || value === undefined || value === "") return "未登録";
    const number = Number(value);
    if (!Number.isFinite(number)) return "未登録";
    const tsubo = number / 3.305785;
    return `${new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 2 }).format(number)}㎡（約${new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 1 }).format(tsubo)}坪）`;
  }

  function shortDate(value) {
    if (!value) return "未登録";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "未登録";
    return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  }

  function caseById(id) {
    return ui.cases.find((item) => item.id === id);
  }

  function responsesForCase(caseId) {
    return ui.responses.filter((item) => item.caseId === caseId);
  }

  function companyById(id) {
    return baseState().companies.find((item) => item.id === id);
  }

  function companyForResponse(response) {
    const company = companyById(response.companyId);
    if (company) return company;
    return {
      id: response.companyId,
      companyName: response.companyNameSnapshot || "削除済み業者",
      contactName: response.contactNameSnapshot || "",
      phone: response.phoneSnapshot || "",
      email: response.emailSnapshot || "",
      isArchived: true
    };
  }

  function maxResponseAmount(responses) {
    const amounts = responses
      .map((response) => response.responseAmount)
      .filter((amount) => amount !== null && amount !== undefined && Number.isFinite(Number(amount)))
      .map(Number);
    return amounts.length ? Math.max(...amounts) : null;
  }

  function caseStats(item) {
    const responses = responsesForCase(item.id);
    return {
      total: responses.length,
      waiting: responses.filter((response) => response.responseStatus === "回答待ち").length,
      maxAmount: maxResponseAmount(responses)
    };
  }

  function isProgressCase(item) {
    return !["成約", "見送り"].includes(item.status);
  }

  function responseHasAnswer(response) {
    return ["金額回答", "条件付き", "成約"].includes(response.responseStatus);
  }

  function caseMatchesProgress(item, progress) {
    if (!progress || progress === "すべて") return true;
    const responses = responsesForCase(item.id);
    if (progress === "進行中") return isProgressCase(item);
    if (progress === "回答待ち") return item.status === "回答待ち" || responses.some((response) => response.responseStatus === "回答待ち");
    if (progress === "回答済み") return item.status === "回答済み" || responses.some(responseHasAnswer);
    return item.status === progress;
  }

  function caseHaystack(item) {
    const responseText = responsesForCase(item.id).flatMap((response) => {
      const company = companyForResponse(response);
      return [response.memo, response.responseReason, company.companyName, company.contactName];
    });
    return KCN.normalizeText([
      item.caseName, item.location, item.area, item.customArea,
      typeLabel(item.caseType, item.customCaseType),
      ...(item.factors || []).map(factorLabel), item.memo, ...responseText
    ].join(" "));
  }

  function getFilteredCases() {
    const query = KCN.normalizeText(ui.filters.query);
    const results = ui.cases.filter((item) => {
      if (!caseMatchesProgress(item, ui.filters.progress)) return false;
      if (ui.filters.area && item.area !== ui.filters.area) return false;
      if (ui.filters.caseType && item.caseType !== ui.filters.caseType) return false;
      if (ui.filters.factor && !(item.factors || []).includes(ui.filters.factor)) return false;
      if (query) {
        const tokens = query.split(" ").filter(Boolean);
        const haystack = caseHaystack(item);
        if (!tokens.every((token) => haystack.includes(token))) return false;
      }
      return true;
    });
    return results.sort(compareCases);
  }

  function compareCases(a, b) {
    const name = KCN.japaneseCollator.compare(a.caseName || "", b.caseName || "") || String(a.id).localeCompare(String(b.id));
    if (ui.filters.sort === "created") return String(b.createdAt || "").localeCompare(String(a.createdAt || "")) || name;
    if (ui.filters.sort === "name") return name;
    if (ui.filters.sort === "amount") {
      const aa = maxResponseAmount(responsesForCase(a.id));
      const bb = maxResponseAmount(responsesForCase(b.id));
      if (aa === null && bb !== null) return 1;
      if (aa !== null && bb === null) return -1;
      return (Number(bb) - Number(aa)) || name;
    }
    if (ui.filters.sort === "waiting") {
      const aw = caseStats(a).waiting;
      const bw = caseStats(b).waiting;
      return bw - aw || String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")) || name;
    }
    return String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")) || name;
  }

  function caseCardHtml(item) {
    const stats = caseStats(item);
    const factors = (item.factors || []).map(factorLabel);
    const place = item.location || item.customArea || item.area || "所在地・エリア未登録";
    return `<article class="case-card" data-case-id="${escape(item.id)}">
      <button type="button" class="case-card__open" data-open-case-id="${escape(item.id)}" aria-label="${escape(item.caseName)}の詳細を開く">
        <div class="case-card__top"><div><h3>${escape(item.caseName)}</h3><p>${escape(place)}</p></div><span class="case-status case-status--${escape(item.status)}">${escape(item.status)}</span></div>
        <p class="case-card__type">${escape(typeLabel(item.caseType, item.customCaseType))}${factors.length ? `／${escape(factors.slice(0, 3).join("・"))}${factors.length > 3 ? `ほか${factors.length - 3}件` : ""}` : ""}</p>
        <div class="case-card__metrics"><span><strong>${stats.total}</strong>社 回答登録</span><span><strong>${stats.waiting}</strong>社 待ち</span><span>最高回答 <strong>${escape(formatMoney(stats.maxAmount))}</strong></span></div>
        <p class="case-card__updated">更新 ${escape(KCN.formatDate(item.updatedAt))}</p>
      </button>
    </article>`;
  }

  function renderCaseList() {
    if (!dom["case-list"]) return;
    const results = getFilteredCases();
    const activeFilterCount = Number(Boolean(ui.filters.query)) + Number(!["", "すべて", "進行中"].includes(ui.filters.progress))
      + Number(Boolean(ui.filters.area)) + Number(Boolean(ui.filters.caseType)) + Number(Boolean(ui.filters.factor));
    dom["case-active-filter-count"].textContent = activeFilterCount ? `（${activeFilterCount}件）` : "";
    dom["case-count-badge"].textContent = `${results.length}件`;
    dom["case-list-summary"].textContent = ui.cases.length === results.length
      ? `登録済み ${ui.cases.length}件を更新が新しい順で表示しています。`
      : `登録済み ${ui.cases.length}件のうち ${results.length}件を表示しています。`;
    dom["case-list"].setAttribute("aria-busy", "false");
    if (!results.length) {
      dom["case-list"].innerHTML = `<div class="empty-state"><div class="empty-state__icon" aria-hidden="true">▤</div><h4>表示できる案件がありません</h4><p>${ui.cases.length ? "絞り込み条件を解除して確認してください。" : "右下の＋ボタンから案件名だけでも登録できます。"}</p><button type="button" class="button button--secondary" data-case-empty-action="${ui.cases.length ? "clear" : "add"}">${ui.cases.length ? "条件を解除" : "案件を登録"}</button></div>`;
    } else {
      dom["case-list"].innerHTML = results.map(caseCardHtml).join("");
    }
    app().ensureButtonLabels(dom["case-list"]);
  }

  function populateSelect(select, options, firstLabel, selectedValue) {
    if (!select) return;
    const previous = selectedValue == null ? select.value : selectedValue;
    select.replaceChildren(new Option(firstLabel, ""));
    (options || []).forEach((option) => select.add(new Option(optionLabel(option), optionId(option))));
    select.value = Array.from(select.options).some((option) => option.value === previous) ? previous : "";
  }

  function renderCaseFilters() {
    if (!dom["case-area-filter"]) return;
    const settings = baseState().settings || KCN.DEFAULT_SETTINGS;
    populateSelect(dom["case-area-filter"], settings.areaOptions || [], "すべて", ui.filters.area);
    populateSelect(dom["case-type-filter"], caseTypes(), "すべて", ui.filters.caseType);
    populateSelect(dom["case-factor-filter"], factorOptions(), "すべて", ui.filters.factor);
    ui.filters.area = dom["case-area-filter"].value;
    ui.filters.caseType = dom["case-type-filter"].value;
    ui.filters.factor = dom["case-factor-filter"].value;
  }

  function localDateStamp(date) {
    const value = date || new Date();
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }

  function followUpBuckets() {
    const today = localDateStamp();
    const seven = new Date();
    seven.setDate(seven.getDate() + 7);
    const sevenStamp = localDateStamp(seven);
    const dated = ui.responses.filter((response) => response.followUpDate);
    return {
      overdue: dated.filter((response) => response.followUpDate < today),
      today: dated.filter((response) => response.followUpDate === today),
      soon: dated.filter((response) => response.followUpDate > today && response.followUpDate <= sevenStamp),
      later: dated.filter((response) => response.followUpDate > sevenStamp)
    };
  }

  function renderCaseStats() {
    const buckets = followUpBuckets();
    if (dom["stat-cases-active"]) dom["stat-cases-active"].textContent = ui.cases.filter(isProgressCase).length;
    if (dom["stat-response-waiting"]) dom["stat-response-waiting"].textContent = ui.responses.filter((response) => response.responseStatus === "回答待ち").length;
    if (dom["stat-followup"]) dom["stat-followup"].textContent = buckets.today.length + buckets.soon.length + buckets.later.length;
    if (dom["follow-up-overview"]) {
      const rows = [
        ["期限超過", buckets.overdue], ["今日", buckets.today], ["7日以内", buckets.soon], ["それ以降", buckets.later]
      ];
      dom["follow-up-overview"].innerHTML = rows.map(([label, responses]) => {
        const preview = responses.slice(0, 3).map((response) => {
          const item = caseById(response.caseId);
          const company = companyForResponse(response);
          return `<button type="button" data-open-case-id="${escape(response.caseId)}">${escape(response.followUpDate)}　${escape(item ? item.caseName : "削除済み案件")}／${escape(company.companyName)}</button>`;
        }).join("");
        return `<section class="follow-up-group"><div><strong>${label}</strong><span>${responses.length}件</span></div>${preview || '<p class="empty-value">該当なし</p>'}${responses.length > 3 ? `<small>ほか${responses.length - 3}件</small>` : ""}</section>`;
      }).join("");
    }
  }

  function renderAll() {
    if (!ui.initialized) return;
    renderCaseFilters();
    renderCaseList();
    renderCaseStats();
    if (dom["advanced-settings-dialog"] && dom["advanced-settings-dialog"].open) renderAdvancedSettings();
  }

  async function reload() {
    const [cases, responses] = await Promise.all([KCN.db.getAllCases(), KCN.db.getAllCaseResponses()]);
    ui.cases = cases;
    ui.responses = responses;
    renderAll();
  }

  function renderCaseTypeControl(selectedValue) {
    const control = dom["case-type-chips"];
    if (!control) return;
    if (control.tagName === "SELECT") {
      populateSelect(control, caseTypes(), "未選択", selectedValue || "");
      return;
    }
    control.innerHTML = caseTypes().map((option) => {
      const id = optionId(option);
      const selected = id === selectedValue;
      return `<button type="button" class="chip${selected ? " is-selected" : ""}" data-case-type-value="${escape(id)}" aria-pressed="${selected}">${escape(optionLabel(option))}</button>`;
    }).join("");
  }

  function renderCaseFactorControl() {
    const control = dom["case-factor-chips"];
    if (!control) return;
    control.innerHTML = factorCategories().map((category) => {
      const categoryId = category.categoryId || category.id || "factors";
      const categoryLabel = category.categoryLabel || category.label || categoryId;
      return `<fieldset class="factor-group"><legend>${escape(categoryLabel)}</legend><div class="chip-group">${(category.options || []).map((option) => {
        const id = optionId(option);
        const selected = ui.caseForm.factors.has(id);
        return `<button type="button" class="chip${selected ? " is-selected" : ""}" data-case-factor-value="${escape(id)}" aria-pressed="${selected}">${escape(optionLabel(option))}</button>`;
      }).join("")}</div></fieldset>`;
    }).join("");
    if (dom["case-factor-count"]) dom["case-factor-count"].textContent = `${ui.caseForm.factors.size}件選択`;
  }

  function setCaseCustomTypeVisibility() {
    if (!dom["case-custom-type"] || !dom["case-type-chips"]) return;
    const type = dom["case-type-chips"].tagName === "SELECT"
      ? dom["case-type-chips"].value
      : (dom["case-type-chips"].querySelector("[data-case-type-value].is-selected") || {}).dataset?.caseTypeValue;
    const label = dom["case-custom-type"].closest("label");
    if (label) label.hidden = type !== "other";
  }

  function renderCaseFormOptions(selectedType) {
    const settings = baseState().settings || KCN.DEFAULT_SETTINGS;
    populateSelect(dom["case-area"], settings.areaOptions || [], "未選択", dom["case-area"] ? dom["case-area"].value : "");
    populateSelect(dom["case-status"], caseStatuses(), "相談中", dom["case-status"] ? dom["case-status"].value : "相談中");
    if (dom["case-status"] && !dom["case-status"].value) dom["case-status"].value = "相談中";
    renderCaseTypeControl(selectedType);
    renderCaseFactorControl();
    setCaseCustomTypeVisibility();
  }

  function resetCaseForm() {
    dom["case-form"].reset();
    dom["case-id"].value = "";
    dom["case-created-at"].value = "";
    ui.caseForm.mode = "new";
    ui.caseForm.factors = new Set();
    ui.caseForm.dirty = false;
    ui.caseForm.saving = false;
    dom["case-form-error"].hidden = true;
    dom["case-form-error"].textContent = "";
    dom["case-name"].removeAttribute("aria-invalid");
    dom["case-memo-count"].textContent = "0";
    renderCaseFormOptions("");
  }

  function openNewCase() {
    resetCaseForm();
    dom["case-dialog-mode"].textContent = "NEW CASE";
    dom["case-dialog-title"].textContent = "案件を登録";
    app().openDialog(dom["case-dialog"], dom["case-name"]);
  }

  function fillCaseForm(item, mode) {
    resetCaseForm();
    const duplicate = mode === "duplicate";
    ui.caseForm.mode = mode;
    dom["case-id"].value = duplicate ? "" : item.id;
    dom["case-created-at"].value = duplicate ? "" : item.createdAt;
    dom["case-name"].value = duplicate ? `${item.caseName}（複製）` : item.caseName;
    dom["case-location"].value = item.location || "";
    dom["case-custom-area"].value = item.customArea || "";
    dom["case-custom-type"].value = item.customCaseType || "";
    dom["case-status"].value = item.status || "相談中";
    dom["case-asking-price"].value = item.askingPrice === null || item.askingPrice === undefined ? "" : String(Number(item.askingPrice) / 10000);
    dom["case-land-area"].value = item.landArea === null || item.landArea === undefined ? "" : String(item.landArea);
    dom["case-building-area"].value = item.buildingArea === null || item.buildingArea === undefined ? "" : String(item.buildingArea);
    dom["case-memo"].value = item.memo || "";
    dom["case-memo-count"].textContent = String((item.memo || "").length);
    ui.caseForm.factors = new Set(item.factors || []);
    renderCaseFormOptions(item.caseType || "");
    dom["case-area"].value = item.area || "";
    dom["case-custom-type"].value = item.customCaseType || "";
    setCaseCustomTypeVisibility();
    dom["case-dialog-mode"].textContent = duplicate ? "DUPLICATE CASE" : "EDIT CASE";
    dom["case-dialog-title"].textContent = duplicate ? "複製して案件登録" : "案件を編集";
    ui.caseForm.dirty = false;
    app().openDialog(dom["case-dialog"], dom["case-name"]);
    requestAnimationFrame(() => dom["case-name"].select());
  }

  function parseNumber(value, fieldLabel, integerOnly) {
    const raw = String(value == null ? "" : value).normalize("NFKC").replace(/[\s,，]/g, "").trim();
    if (!raw) return null;
    if (!/^(?:\d+\.?\d*|\.\d+)$/.test(raw)) throw new Error(`${fieldLabel}は0以上の数字で入力してください。`);
    const number = Number(raw);
    if (!Number.isFinite(number) || number < 0 || (integerOnly && !Number.isInteger(number))) throw new Error(`${fieldLabel}は0以上の${integerOnly ? "整数" : "数字"}で入力してください。`);
    return number;
  }

  function parseManYen(value, fieldLabel) {
    const raw = String(value == null ? "" : value).normalize("NFKC").trim();
    if (!raw) return null;
    const explicitlyYen = /円$/.test(raw) && !/万円$/.test(raw);
    const cleaned = raw.replace(/万円?|円/g, "");
    const number = parseNumber(cleaned, fieldLabel, false);
    const yen = explicitlyYen ? number : number * 10000;
    if (!Number.isSafeInteger(yen) || yen < 0) throw new Error(`${fieldLabel}は円単位で保存できる金額を入力してください。`);
    return yen;
  }

  function selectedCaseType() {
    const control = dom["case-type-chips"];
    if (!control) return "";
    if (control.tagName === "SELECT") return control.value;
    const selected = control.querySelector("[data-case-type-value].is-selected");
    return selected ? selected.dataset.caseTypeValue : "";
  }

  function readCaseForm() {
    const id = dom["case-id"].value || KCN.uuid();
    const now = KCN.isoNow();
    return KCN.normalizeCase({
      id,
      caseName: dom["case-name"].value,
      location: dom["case-location"].value,
      area: dom["case-area"].value,
      customArea: dom["case-custom-area"].value,
      caseType: selectedCaseType(),
      customCaseType: selectedCaseType() === "other" ? dom["case-custom-type"].value : "",
      factors: [...ui.caseForm.factors],
      askingPrice: parseManYen(dom["case-asking-price"].value, "売主希望額"),
      landArea: parseNumber(dom["case-land-area"].value, "土地面積", false),
      buildingArea: parseNumber(dom["case-building-area"].value, "建物面積", false),
      status: dom["case-status"].value || "相談中",
      memo: dom["case-memo"].value,
      createdAt: dom["case-created-at"].value || now,
      updatedAt: now
    });
  }

  async function saveCase(event) {
    event.preventDefault();
    if (ui.caseForm.saving) return;
    dom["case-form-error"].hidden = true;
    let item;
    try {
      item = readCaseForm();
    } catch (error) {
      dom["case-form-error"].textContent = error.message;
      dom["case-form-error"].hidden = false;
      dom["case-form-error"].scrollIntoView({ block: "nearest" });
      return;
    }
    if (!item.caseName) {
      dom["case-form-error"].textContent = "案件名を入力してください。";
      dom["case-form-error"].hidden = false;
      dom["case-name"].setAttribute("aria-invalid", "true");
      dom["case-name"].setAttribute("aria-describedby", "case-form-error");
      dom["case-name"].focus();
      return;
    }
    ui.caseForm.saving = true;
    app().setLoading(true, "案件を保存中");
    try {
      await KCN.db.putCase(item);
      ui.caseForm.dirty = false;
      app().closeDialog(dom["case-dialog"], { force: true });
      await reload();
      if (ui.caseForm.mode === "edit" && ui.selectedCaseId === item.id && dom["case-detail-dialog"].open) renderCaseDetail(item.id);
      if (dom["case-detail-dialog"].open) focusSoon(dom["case-detail-dialog"].querySelector(".dialog-header .icon-button"));
      else focusSoon(dom["case-list"].querySelector(`[data-open-case-id="${CSS.escape(item.id)}"]`) || dom["case-query"]);
      app().showToast(`「${item.caseName}」を保存しました。`);
    } catch (error) {
      dom["case-form-error"].textContent = error.message || "案件を保存できませんでした。";
      dom["case-form-error"].hidden = false;
    } finally {
      ui.caseForm.saving = false;
      app().setLoading(false);
    }
  }

  const RESPONSE_STATUS_RANK = Object.freeze({ "成約": 0, "金額回答": 1, "条件付き": 2, "回答待ち": 3, "打診済み": 4, "見送り": 5 });

  function compareResponses(a, b) {
    const companyA = companyForResponse(a);
    const companyB = companyForResponse(b);
    const name = KCN.japaneseCollator.compare(companyA.companyName || "", companyB.companyName || "") || String(a.id).localeCompare(String(b.id));
    const amountA = a.responseAmount === null || a.responseAmount === undefined ? null : Number(a.responseAmount);
    const amountB = b.responseAmount === null || b.responseAmount === undefined ? null : Number(b.responseAmount);
    const amountCompare = amountA === null && amountB !== null ? 1 : amountA !== null && amountB === null ? -1 : amountA === null ? 0 : amountB - amountA;
    if (ui.responseSort === "amount") return amountCompare || name;
    if (ui.responseSort === "date") return String(b.responseDate || "").localeCompare(String(a.responseDate || "")) || amountCompare || name;
    if (ui.responseSort === "company") return name;
    return (RESPONSE_STATUS_RANK[a.responseStatus] ?? 99) - (RESPONSE_STATUS_RANK[b.responseStatus] ?? 99) || amountCompare || name;
  }

  function responseCardHtml(response, item) {
    const company = companyForResponse(response);
    const phone = KCN.isPlausiblePhone(company.phone) ? KCN.phoneHref(company.phone) : "";
    const mail = KCN.mailtoHref(company.email, "買取案件のご相談");
    const selectedFactors = response.responseFactors || [];
    const currentFactors = new Set(item.factors || []);
    return `<article class="response-card" data-response-id="${escape(response.id)}">
      <div class="response-card__header"><div><button type="button" class="text-button response-company-name" data-detail-id="${escape(company.id)}">${escape(company.companyName)}</button><p>${company.contactName ? `担当：${escape(company.contactName)}` : "担当者 未登録"}${company.isArchived ? "／アーカイブ" : ""}</p></div><span class="response-status">${escape(response.responseStatus)}</span></div>
      <div class="response-card__amount"><span>回答金額</span><strong>${escape(formatMoney(response.responseAmount))}</strong></div>
      <dl class="response-card__details">
        <div><dt>回答日</dt><dd>${escape(response.responseDate || "未登録")}</dd></div>
        <div><dt>回答理由</dt><dd>${escape(response.responseReason || "未登録")}</dd></div>
        <div><dt>関連要因</dt><dd>${selectedFactors.length ? selectedFactors.map((id) => `<span class="tag${currentFactors.has(id) ? "" : " tag--warning"}">${escape(factorLabel(id))}${currentFactors.has(id) ? "" : "（案件から外れた要因）"}</span>`).join(" ") : "未登録"}</dd></div>
        <div><dt>次回確認日</dt><dd>${escape(response.followUpDate || "未登録")}</dd></div>
        <div class="response-card__memo"><dt>回答メモ</dt><dd>${response.memo ? escape(response.memo) : "未登録"}</dd></div>
      </dl>
      <div class="response-card__actions">
        ${phone ? `<a class="button button--quiet" href="${escape(phone)}" aria-label="${escape(company.companyName)}へ電話">電話</a>` : ""}
        ${mail ? `<a class="button button--quiet" href="${escape(mail)}" aria-label="${escape(company.companyName)}へメール">メール</a>` : ""}
        <button type="button" class="button button--secondary" data-edit-response-id="${escape(response.id)}">編集</button>
        <button type="button" class="button button--danger" data-delete-response-id="${escape(response.id)}">削除</button>
      </div>
    </article>`;
  }

  function renderResponseList(item) {
    const responses = responsesForCase(item.id).sort(compareResponses);
    dom["case-response-count"].textContent = `${responses.length}社`;
    let sort = byId("response-sort");
    if (!sort) {
      const wrap = document.createElement("label");
      wrap.className = "select-field response-sort-field";
      wrap.innerHTML = '<span>回答の並び順</span><select id="response-sort"><option value="status">回答状況順</option><option value="amount">回答金額が高い順</option><option value="date">回答日が新しい順</option><option value="company">業者名順</option></select>';
      dom["case-response-list"].before(wrap);
      sort = byId("response-sort");
      dom["response-sort"] = sort;
      sort.addEventListener("change", () => { ui.responseSort = sort.value; renderResponseList(item); });
    }
    sort.value = ui.responseSort;
    dom["case-response-list"].innerHTML = responses.length
      ? responses.map((response) => responseCardHtml(response, item)).join("")
      : '<div class="empty-state empty-state--compact"><h4>業者回答はまだありません</h4><p>「業者を追加」から打診先を選べます。</p></div>';
    app().ensureButtonLabels(dom["case-response-list"]);
  }

  function renderCaseDetail(caseId) {
    const item = caseById(caseId);
    if (!item) return;
    ui.selectedCaseId = caseId;
    dom["case-detail-title"].textContent = item.caseName;
    const factors = item.factors || [];
    dom["case-detail-content"].innerHTML = `<article class="case-overview">
      <div class="case-overview__hero"><div><h3>${escape(item.caseName)}</h3><p>${escape(item.location || item.customArea || item.area || "所在地・エリア未登録")}</p></div><span class="case-status">${escape(item.status)}</span></div>
      <dl class="detail-list">
        <div><dt>所在地</dt><dd>${escape(item.location || "未登録")}</dd></div>
        <div><dt>エリア</dt><dd>${escape([item.area, item.customArea].filter(Boolean).join("／") || "未登録")}</dd></div>
        <div><dt>案件種別</dt><dd>${escape(typeLabel(item.caseType, item.customCaseType))}</dd></div>
        <div><dt>個別要因</dt><dd><div class="tag-list">${factors.length ? factors.map((id) => `<span class="tag">${escape(factorLabel(id))}</span>`).join("") : "未登録"}</div></dd></div>
        <div><dt>売主希望額</dt><dd>${escape(formatMoney(item.askingPrice))}</dd></div>
        <div><dt>土地面積</dt><dd>${escape(formatArea(item.landArea))}</dd></div>
        <div><dt>建物面積</dt><dd>${escape(formatArea(item.buildingArea))}</dd></div>
        <div><dt>案件状況</dt><dd>${escape(item.status)}</dd></div>
        <div><dt>案件メモ</dt><dd class="preserve-lines">${item.memo ? escape(item.memo) : "未登録"}</dd></div>
        <div><dt>更新日</dt><dd>${escape(KCN.formatDate(item.updatedAt))}</dd></div>
      </dl>
    </article>`;
    dom["case-detail-edit"].dataset.caseId = item.id;
    dom["case-detail-duplicate"].dataset.caseId = item.id;
    dom["case-detail-delete"].dataset.caseId = item.id;
    dom["case-add-companies"].dataset.caseId = item.id;
    dom["case-find-similar"].dataset.caseId = item.id;
    renderResponseList(item);
  }

  function openCaseDetail(caseId) {
    const item = caseById(caseId);
    if (!item) {
      app().showToast("案件が見つかりませんでした。");
      return;
    }
    renderCaseDetail(caseId);
    app().openDialog(dom["case-detail-dialog"]);
  }

  async function deleteCase(caseId) {
    const item = caseById(caseId);
    if (!item) return;
    const responseCount = responsesForCase(caseId).length;
    const message = responseCount
      ? `「${item.caseName}」を削除しますか？\nこの案件に登録された${responseCount}社分の回答も削除されます。`
      : `「${item.caseName}」を削除しますか？`;
    if (!global.confirm(message)) return;
    app().setLoading(true, "案件と回答を削除中");
    try {
      await KCN.db.deleteCaseWithResponses(caseId);
      app().closeDialog(dom["case-detail-dialog"], { force: true });
      ui.selectedCaseId = null;
      await reload();
      focusSoon(baseState().currentScreen === "cases" ? dom["case-query"] : document.querySelector('[data-nav][aria-current="page"]'));
      app().showToast(`「${item.caseName}」を削除しました。`);
    } catch (error) {
      app().showToast("案件を削除できませんでした。案件と回答は変更していません。");
    } finally {
      app().setLoading(false);
    }
  }

  function renderResponseFactorControl(item) {
    const current = new Set(item.factors || []);
    const all = [...(item.factors || []), ...[...ui.responseForm.factors].filter((id) => !current.has(id))];
    dom["response-factor-chips"].innerHTML = all.length ? all.map((id) => {
      const selected = ui.responseForm.factors.has(id);
      const orphan = !current.has(id);
      return `<button type="button" class="chip${selected ? " is-selected" : ""}${orphan ? " chip--warning" : ""}" data-response-factor-value="${escape(id)}" aria-pressed="${selected}" ${orphan ? 'title="案件から外れた要因（選択を解除できます）"' : ""}>${escape(factorLabel(id))}${orphan ? " ※" : ""}</button>`;
    }).join("") : '<p class="empty-value">案件に個別要因が登録されていません。</p>';
  }

  function renderResponseOptions() {
    populateSelect(dom["response-status"], responseStatuses(), "未選択", dom["response-status"].value);
    populateSelect(dom["response-reason"], responseReasons(), "未選択", dom["response-reason"].value);
  }

  function openResponseEditor(responseId) {
    const response = ui.responses.find((item) => item.id === responseId);
    if (!response) return;
    const item = caseById(response.caseId);
    const company = companyForResponse(response);
    if (!item) return;
    dom["response-form"].reset();
    dom["response-id"].value = response.id;
    dom["response-case-id"].value = response.caseId;
    dom["response-company-id"].value = response.companyId;
    dom["response-company-name"].textContent = company.companyName;
    dom["response-company-contact"].textContent = company.contactName ? `担当：${company.contactName}` : "担当者 未登録";
    dom["response-status"].value = response.responseStatus || "打診済み";
    dom["response-amount"].value = response.responseAmount === null || response.responseAmount === undefined ? "" : String(Number(response.responseAmount) / 10000);
    dom["response-date"].value = response.responseDate || "";
    dom["response-reason"].value = response.responseReason || "";
    dom["response-follow-up-date"].value = response.followUpDate || "";
    dom["response-memo"].value = response.memo || "";
    dom["response-memo-count"].textContent = String((response.memo || "").length);
    ui.responseForm.factors = new Set(response.responseFactors || []);
    ui.responseForm.dirty = false;
    ui.responseForm.saving = false;
    dom["response-form-error"].hidden = true;
    renderResponseOptions();
    dom["response-status"].value = response.responseStatus || "打診済み";
    dom["response-reason"].value = response.responseReason || "";
    renderResponseFactorControl(item);
    dom["response-dialog-title"].textContent = `${company.companyName}の回答`;
    app().openDialog(dom["response-dialog"], dom["response-status"]);
  }

  function readResponseForm() {
    const existing = ui.responses.find((item) => item.id === dom["response-id"].value);
    const company = companyById(dom["response-company-id"].value) || companyForResponse(existing || {});
    const now = KCN.isoNow();
    return KCN.normalizeCaseResponse({
      id: dom["response-id"].value || KCN.uuid(),
      caseId: dom["response-case-id"].value,
      companyId: dom["response-company-id"].value,
      responseStatus: dom["response-status"].value,
      responseAmount: parseManYen(dom["response-amount"].value, "回答金額"),
      responseDate: dom["response-date"].value,
      responseFactors: [...ui.responseForm.factors],
      responseReason: dom["response-reason"].value,
      memo: dom["response-memo"].value,
      followUpDate: dom["response-follow-up-date"].value,
      companyNameSnapshot: company.companyName || "",
      contactNameSnapshot: company.contactName || "",
      phoneSnapshot: company.phone || "",
      emailSnapshot: company.email || "",
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now
    });
  }

  async function saveResponse(event) {
    event.preventDefault();
    if (ui.responseForm.saving) return;
    dom["response-form-error"].hidden = true;
    let response;
    try {
      response = readResponseForm();
      if (!response.companyId || !response.responseStatus) throw new Error("業者と回答状況を確認してください。");
    } catch (error) {
      dom["response-form-error"].textContent = error.message;
      dom["response-form-error"].hidden = false;
      return;
    }
    ui.responseForm.saving = true;
    app().setLoading(true, "回答を保存中");
    try {
      await KCN.db.putCaseResponse(response);
      ui.responseForm.dirty = false;
      app().closeDialog(dom["response-dialog"], { force: true });
      await reload();
      renderCaseDetail(response.caseId);
      focusSoon(dom["case-response-list"].querySelector(`[data-response-id="${CSS.escape(response.id)}"] [data-edit-response-id]`) || dom["case-add-companies"]);
      app().showToast("業者回答を保存しました。");
    } catch (error) {
      dom["response-form-error"].textContent = error.message || "回答を保存できませんでした。";
      dom["response-form-error"].hidden = false;
    } finally {
      ui.responseForm.saving = false;
      app().setLoading(false);
    }
  }

  async function deleteResponse(responseId) {
    const response = ui.responses.find((item) => item.id === responseId);
    if (!response) return;
    const company = companyForResponse(response);
    if (!global.confirm(`「${company.companyName}」の回答を削除しますか？`)) return;
    app().setLoading(true, "回答を削除中");
    try {
      await KCN.db.deleteCaseResponse(responseId);
      await reload();
      renderCaseDetail(response.caseId);
      focusSoon(dom["response-sort"] || dom["case-add-companies"]);
      app().showToast("業者回答を削除しました。");
    } catch (error) {
      app().showToast("回答を削除できませんでした。");
    } finally {
      app().setLoading(false);
    }
  }

  function mappedPropertyTypes(caseType) {
    const mapping = {
      "detached-single-lot": ["戸建"],
      "detached-subdivision": ["戸建"],
      "income-building": ["一棟収益", "一棟アパート", "一棟マンション"],
      "condo-vacant": ["区分マンション"],
      "condo-occupied": ["区分マンション"],
      "land": ["土地"],
      "business-land": ["土地", "店舗・事務所"],
      "shop-office": ["店舗・事務所"],
      "building": ["ビル"]
    };
    return mapping[caseType] || [];
  }

  function recommendationInfo(company, item) {
    const areaMatch = Boolean(item.area && KCN.areaMatches(company.areas || [], [item.area]));
    const mapped = mappedPropertyTypes(item.caseType);
    const typeMatch = mapped.length > 0 && mapped.some((type) => (company.propertyTypes || []).includes(type));
    const factors = new Set(item.factors || []);
    const similarHistory = new Set(ui.responses.filter((response) => response.companyId === company.id
      && (response.responseFactors || []).some((id) => factors.has(id))).map((response) => response.caseId)).size;
    let score = 0;
    if (areaMatch) score += 100;
    if (typeMatch) score += 80;
    if (company.isFavorite) score += 40;
    if (company.temperature === KCN.TEMPERATURES.ACTIVE) score += 30;
    else if (company.temperature === KCN.TEMPERATURES.NORMAL) score += 10;
    score += Math.min(similarHistory, 10) * 8;
    return { areaMatch, typeMatch, similarHistory, score };
  }

  function candidateCompanies(item) {
    const existing = new Set(responsesForCase(item.id).map((response) => response.companyId));
    const query = KCN.normalizeText(dom["quick-company-query"] ? dom["quick-company-query"].value : "");
    return baseState().companies.filter((company) => !company.isArchived && !existing.has(company.id)).filter((company) => {
      if (!query) return true;
      return KCN.normalizeText(`${company.companyName} ${company.contactName}`).includes(query);
    }).map((company) => ({ company, ...recommendationInfo(company, item) })).sort((a, b) => b.score - a.score
      || KCN.compareCompanies(a.company, b.company, "search"));
  }

  function renderCompanyCandidates() {
    const item = caseById(dom["quick-company-case-id"].value);
    if (!item) return;
    const candidates = candidateCompanies(item);
    dom["quick-company-summary"].textContent = `${ui.selectedCompanies.size}社選択`;
    dom["add-selected-companies"].textContent = ui.selectedCompanies.size
      ? `選択した${ui.selectedCompanies.size}社を案件へ追加`
      : "追加する業者を選択";
    dom["add-selected-companies"].disabled = ui.selectedCompanies.size === 0;
    dom["quick-company-list"].innerHTML = candidates.length ? candidates.map((entry) => {
      const company = entry.company;
      const selected = ui.selectedCompanies.has(company.id);
      return `<label class="selectable-company${selected ? " is-selected" : ""}">
        <input type="checkbox" data-select-company-id="${escape(company.id)}" ${selected ? "checked" : ""}>
        <span class="selectable-company__body"><strong>${escape(company.companyName)}${company.isFavorite ? " ★" : ""}</strong><small>${company.contactName ? `担当：${escape(company.contactName)}／` : ""}${escape(company.temperature)}</small><span class="match-badges"><i class="${entry.areaMatch ? "is-match" : ""}">${entry.areaMatch ? "エリア一致" : "エリア不一致"}</i><i class="${entry.typeMatch ? "is-match" : ""}">${entry.typeMatch ? "種別一致" : "種別不一致"}</i><i>類似回答 ${entry.similarHistory}件</i></span></span>
      </label>`;
    }).join("") : '<div class="empty-state empty-state--compact"><h4>追加できる業者がありません</h4><p>登録済みの全業者が追加済みか、検索条件に該当しません。</p></div>';
  }

  function openCompanyPicker(caseId) {
    const item = caseById(caseId);
    if (!item) return;
    ui.selectedCompanies.clear();
    dom["quick-company-case-id"].value = caseId;
    dom["quick-company-query"].value = "";
    dom["quick-company-error"].hidden = true;
    renderCompanyCandidates();
    app().openDialog(dom["quick-company-dialog"], dom["quick-company-query"]);
  }

  async function addSelectedCompanies(event) {
    event.preventDefault();
    const item = caseById(dom["quick-company-case-id"].value);
    if (!item || !ui.selectedCompanies.size) return;
    const now = KCN.isoNow();
    const responses = [...ui.selectedCompanies].map((companyId) => {
      const company = companyById(companyId);
      return KCN.normalizeCaseResponse({
        id: KCN.uuid(), caseId: item.id, companyId, responseStatus: "打診済み", responseAmount: null,
        responseDate: "", responseFactors: [], responseReason: "", memo: "", followUpDate: "",
        companyNameSnapshot: company ? company.companyName : "", contactNameSnapshot: company ? company.contactName : "",
        phoneSnapshot: company ? company.phone : "", emailSnapshot: company ? company.email : "",
        createdAt: now, updatedAt: now
      });
    });
    app().setLoading(true, `${responses.length}社を追加中`);
    try {
      await KCN.db.addCaseResponses(responses);
      app().closeDialog(dom["quick-company-dialog"], { force: true });
      ui.selectedCompanies.clear();
      await reload();
      renderCaseDetail(item.id);
      focusSoon(dom["case-add-companies"]);
      app().showToast(`${responses.length}社を案件へ追加しました。`);
    } catch (error) {
      dom["quick-company-error"].textContent = error.message || "業者を追加できませんでした。";
      dom["quick-company-error"].hidden = false;
    } finally {
      app().setLoading(false);
    }
  }

  function similarCases(source) {
    const sourceFactors = new Set(source.factors || []);
    return ui.cases.filter((item) => item.id !== source.id).map((item) => {
      const commonFactors = (item.factors || []).filter((id) => sourceFactors.has(id));
      const typeMatch = Boolean(source.caseType && item.caseType === source.caseType);
      const areaMatch = Boolean(source.area && item.area === source.area);
      return { item, commonFactors, typeMatch, areaMatch };
    }).filter((entry) => entry.typeMatch || entry.commonFactors.length || entry.areaMatch)
      .sort((a, b) => Number(b.typeMatch) - Number(a.typeMatch)
        || b.commonFactors.length - a.commonFactors.length
        || Number(b.areaMatch) - Number(a.areaMatch)
        || String(b.item.updatedAt || "").localeCompare(String(a.item.updatedAt || ""))
        || KCN.japaneseCollator.compare(a.item.caseName, b.item.caseName));
  }

  function openSimilarCases(caseId) {
    const source = caseById(caseId);
    if (!source) return;
    const results = similarCases(source);
    dom["similar-source-case-id"].value = source.id;
    dom["similar-source-case-name"].textContent = source.caseName;
    dom["similar-source-case-conditions"].textContent = `${typeLabel(source.caseType, source.customCaseType)}／${(source.factors || []).map(factorLabel).join("・") || "個別要因なし"}／${source.area || "エリア未選択"}`;
    dom["similar-cases-summary"].textContent = `${results.length}件。案件種別、共通要因数、エリア、更新日の順で判定しています。`;
    dom["similar-cases-list"].innerHTML = results.length ? results.map(({ item, commonFactors, typeMatch, areaMatch }) => {
      const responses = responsesForCase(item.id);
      const companies = responses.map((response) => companyForResponse(response).companyName);
      return `<article class="similar-case-card"><button type="button" data-open-case-id="${escape(item.id)}"><div><h3>${escape(item.caseName)}</h3><span class="case-status">${escape(item.status)}</span></div><p>${escape(typeLabel(item.caseType, item.customCaseType))}${typeMatch ? "（種別一致）" : ""}</p><p>共通要因：${escape(commonFactors.map(factorLabel).join("・") || "なし")} ${areaMatch ? "／エリア一致" : ""}</p><p>最高回答：${escape(formatMoney(maxResponseAmount(responses)))}</p><p>回答業者：${escape(companies.join("・") || "なし")}</p></button></article>`;
    }).join("") : '<div class="empty-state"><h4>類似案件がありません</h4><p>案件種別・個別要因・エリアのいずれかが一致する案件はありません。</p></div>';
    app().openDialog(dom["similar-cases-dialog"]);
  }

  function companyResponseCount(companyId) {
    return ui.responses.filter((response) => response.companyId === companyId).length;
  }

  function countLabels(values) {
    const counts = new Map();
    values.filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || KCN.japaneseCollator.compare(a[0], b[0]));
  }

  function companyHistoryHtml(companyId) {
    const responses = ui.responses.filter((response) => response.companyId === companyId)
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    const amountCount = responses.filter((response) => response.responseStatus === "金額回答").length;
    const declined = responses.filter((response) => response.responseStatus === "見送り").length;
    const contracted = responses.filter((response) => response.responseStatus === "成約").length;
    const typeCounts = countLabels(responses.map((response) => {
      const item = caseById(response.caseId);
      return item ? typeLabel(item.caseType, item.customCaseType) : "";
    }));
    const factorCounts = countLabels(responses.flatMap((response) => {
      if ((response.responseFactors || []).length) return response.responseFactors;
      const item = caseById(response.caseId);
      return item ? (item.factors || []) : [];
    }).map(factorLabel));
    const recent = responses.slice(0, 5).map((response) => {
      const item = caseById(response.caseId);
      return item ? `<button type="button" class="history-link" data-open-case-id="${escape(item.id)}"><span>${escape(item.caseName)}</span><small>${escape(response.responseStatus)}${response.responseAmount === null || response.responseAmount === undefined ? "" : `／${escape(formatMoney(response.responseAmount))}`}</small></button>` : "";
    }).join("");
    return `<section class="detail-section company-history"><h4>回答履歴</h4>
      <div class="history-stats"><div><strong>${responses.length}</strong><span>過去回答</span></div><div><strong>${amountCount}</strong><span>金額回答</span></div><div><strong>${declined}</strong><span>見送り</span></div><div><strong>${contracted}</strong><span>成約</span></div></div>
      <dl class="detail-list"><div><dt>対応した案件種別</dt><dd>${escape(typeCounts.slice(0, 5).map(([label]) => label).join("、") || "未登録")}</dd></div><div><dt>対応した個別要因</dt><dd>${escape(factorCounts.slice(0, 7).map(([label]) => label).join("、") || "未登録")}</dd></div></dl>
      <div class="history-list"><h5>最近の回答</h5>${recent || '<p class="empty-value">回答履歴はまだありません。</p>'}</div>
    </section>`;
  }

  function renderAdvancedSettings() {
    const query = KCN.normalizeText(dom["archived-company-query"] ? dom["archived-company-query"].value : "");
    const archived = baseState().companies.filter((company) => company.isArchived).filter((company) => !query
      || KCN.normalizeText(`${company.companyName} ${company.contactName}`).includes(query))
      .sort((a, b) => KCN.compareCompanies(a, b, "name"));
    if (dom["archived-company-count"]) dom["archived-company-count"].textContent = `${archived.length}社`;
    if (dom["archived-company-list"]) dom["archived-company-list"].innerHTML = archived.length ? archived.map((company) => {
      const count = companyResponseCount(company.id);
      return `<article class="archive-item"><div><strong>${escape(company.companyName)}</strong><small>${count}件の回答履歴／非表示 ${escape(KCN.formatDate(company.archivedAt))}</small></div><div><button type="button" class="button button--secondary" data-restore-company-id="${escape(company.id)}">復元</button><button type="button" class="button button--danger" data-purge-company-id="${escape(company.id)}">完全削除</button></div></article>`;
    }).join("") : '<p class="empty-value">アーカイブ済み業者はありません。</p>';
    if (dom["fixed-case-type-count"]) dom["fixed-case-type-count"].textContent = `${caseTypes().length}件`;
    if (dom["fixed-case-factor-count"]) dom["fixed-case-factor-count"].textContent = `${factorOptions().length}件`;
    if (dom["fixed-case-status-count"]) dom["fixed-case-status-count"].textContent = `${caseStatuses().length}件`;
    if (dom["fixed-response-status-count"]) dom["fixed-response-status-count"].textContent = `${responseStatuses().length}件`;
    if (dom["fixed-option-review"]) dom["fixed-option-review"].innerHTML = `<details><summary>案件種別を確認</summary><p>${escape(caseTypes().map(optionLabel).join("、"))}</p></details><details><summary>個別要因を確認</summary>${factorCategories().map((category) => `<p><strong>${escape(category.categoryLabel || category.label)}</strong><br>${escape((category.options || []).map(optionLabel).join("、"))}</p>`).join("")}</details><details><summary>回答理由を確認</summary><p>${escape(responseReasons().map(optionLabel).join("、"))}</p></details>`;
  }

  function openAdvancedSettings() {
    dom["archived-company-query"].value = "";
    renderAdvancedSettings();
    app().openDialog(dom["advanced-settings-dialog"], dom["archived-company-query"]);
  }

  async function restoreArchivedCompany(companyId) {
    const company = companyById(companyId);
    if (!company) return;
    app().setLoading(true, "業者を復元中");
    try {
      await KCN.db.putCompany(KCN.normalizeCompany({ ...company, isArchived: false, archivedAt: null, updatedAt: KCN.isoNow() }));
      await app().reloadData();
      renderAdvancedSettings();
      focusSoon(dom["archived-company-query"]);
      app().showToast(`「${company.companyName}」を業者一覧へ復元しました。`);
    } catch (error) {
      app().showToast("業者を復元できませんでした。");
    } finally {
      app().setLoading(false);
    }
  }

  async function purgeArchivedCompany(companyId) {
    const company = companyById(companyId);
    if (!company) return;
    const count = companyResponseCount(companyId);
    const message = count
      ? `「${company.companyName}」を完全削除しますか？\nこの業者の${count}件の回答履歴も同時に削除され、元に戻せません。`
      : `「${company.companyName}」を完全削除しますか？元に戻せません。`;
    if (!global.confirm(message)) return;
    app().setLoading(true, "業者を完全削除中");
    try {
      await KCN.db.deleteCompanyWithResponses(companyId);
      await app().reloadData();
      renderAdvancedSettings();
      focusSoon(dom["archived-company-query"]);
      app().showToast(`「${company.companyName}」を完全削除しました。`);
    } catch (error) {
      app().showToast("完全削除できませんでした。業者と回答は変更していません。");
    } finally {
      app().setLoading(false);
    }
  }

  function exportCasesCsv() {
    try {
      const csv = KCN.buildCaseResponsesCsv(ui.cases, ui.responses, baseState().companies);
      KCN.downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `kaitori-company-note-cases-${KCN.todayFileStamp()}.csv`);
      app().showToast("案件・回答一覧CSVを出力しました。");
    } catch (error) {
      app().showToast("案件・回答一覧CSVを出力できませんでした。");
    }
  }

  function clearCaseFilters() {
    ui.filters = { progress: "進行中", query: "", area: "", caseType: "", factor: "", sort: "updated" };
    dom["case-query"].value = "";
    dom["case-progress-filter"].value = "進行中";
    dom["case-sort"].value = "updated";
    renderAll();
  }

  function shouldConfirmClose(dialog) {
    if (dialog === dom["case-dialog"] && ui.caseForm.dirty) return "入力中の案件内容を破棄して閉じますか？";
    if (dialog === dom["response-dialog"] && ui.responseForm.dirty) return "入力中の回答内容を破棄して閉じますか？";
    if (dialog === dom["quick-company-dialog"] && ui.selectedCompanies.size) return "選択中の業者を解除して閉じますか？";
    return "";
  }

  function hasUnsavedChanges() {
    return Boolean((dom["case-dialog"] && dom["case-dialog"].open && ui.caseForm.dirty)
      || (dom["response-dialog"] && dom["response-dialog"].open && ui.responseForm.dirty)
      || (dom["quick-company-dialog"] && dom["quick-company-dialog"].open && ui.selectedCompanies.size));
  }

  function bindEvents() {
    if (ui.bound) return;
    ui.bound = true;
    dom["case-form"].addEventListener("submit", saveCase);
    dom["case-form"].addEventListener("input", (event) => {
      ui.caseForm.dirty = true;
      if (event.target === dom["case-memo"]) dom["case-memo-count"].textContent = String(dom["case-memo"].value.length);
      if (event.target === dom["case-name"] && KCN.cleanSingleLine(dom["case-name"].value)) {
        dom["case-name"].removeAttribute("aria-invalid");
        dom["case-form-error"].hidden = true;
      }
    });
    dom["case-form"].addEventListener("change", (event) => {
      ui.caseForm.dirty = true;
      if (event.target === dom["case-type-chips"]) setCaseCustomTypeVisibility();
    });
    dom["response-form"].addEventListener("submit", saveResponse);
    dom["response-form"].addEventListener("input", (event) => {
      ui.responseForm.dirty = true;
      if (event.target === dom["response-memo"]) dom["response-memo-count"].textContent = String(dom["response-memo"].value.length);
    });
    dom["response-form"].addEventListener("change", () => { ui.responseForm.dirty = true; });
    dom["quick-company-form"].addEventListener("submit", addSelectedCompanies);
    const advancedForm = byId("advanced-settings-form");
    if (advancedForm) advancedForm.addEventListener("submit", (event) => event.preventDefault());
    dom["quick-company-query"].addEventListener("input", renderCompanyCandidates);
    dom["case-query"].addEventListener("input", () => { ui.filters.query = dom["case-query"].value; renderCaseList(); });
    dom["case-progress-filter"].addEventListener("change", () => { ui.filters.progress = dom["case-progress-filter"].value; renderCaseList(); });
    dom["case-sort"].addEventListener("change", () => { ui.filters.sort = dom["case-sort"].value; renderCaseList(); });
    dom["case-area-filter"].addEventListener("change", () => { ui.filters.area = dom["case-area-filter"].value; renderCaseList(); });
    dom["case-type-filter"].addEventListener("change", () => { ui.filters.caseType = dom["case-type-filter"].value; renderCaseList(); });
    dom["case-factor-filter"].addEventListener("change", () => { ui.filters.factor = dom["case-factor-filter"].value; renderCaseList(); });
    if (dom["response-sort"]) dom["response-sort"].addEventListener("change", () => {
      ui.responseSort = dom["response-sort"].value;
      const item = caseById(ui.selectedCaseId);
      if (item) renderResponseList(item);
    });
    dom["clear-case-filters"].addEventListener("click", clearCaseFilters);
    dom["case-detail-edit"].addEventListener("click", () => { const item = caseById(ui.selectedCaseId); if (item) fillCaseForm(item, "edit"); });
    dom["case-detail-duplicate"].addEventListener("click", () => { const item = caseById(ui.selectedCaseId); if (item) fillCaseForm(item, "duplicate"); });
    dom["case-detail-delete"].addEventListener("click", () => deleteCase(ui.selectedCaseId));
    dom["case-add-companies"].addEventListener("click", () => openCompanyPicker(ui.selectedCaseId));
    dom["case-find-similar"].addEventListener("click", () => openSimilarCases(ui.selectedCaseId));
    if (dom["export-cases-csv"]) dom["export-cases-csv"].addEventListener("click", exportCasesCsv);
    if (dom["open-advanced-settings"]) dom["open-advanced-settings"].addEventListener("click", openAdvancedSettings);
    if (dom["archived-company-query"]) dom["archived-company-query"].addEventListener("input", renderAdvancedSettings);
    if (dom["open-option-settings-from-advanced"]) dom["open-option-settings-from-advanced"].addEventListener("click", () => {
      app().closeDialog(dom["advanced-settings-dialog"], { force: true });
      const optionButton = byId("open-option-settings");
      optionButton.focus({ preventScroll: true });
      optionButton.click();
    });

    document.addEventListener("click", async (event) => {
      const openCase = event.target.closest("[data-open-case-id]");
      if (openCase) {
        if (dom["similar-cases-dialog"].open) app().closeDialog(dom["similar-cases-dialog"], { force: true });
        const companyDialog = byId("detail-dialog");
        if (companyDialog && companyDialog.open) {
          app().closeDialog(companyDialog, { force: true });
          const activeNav = document.querySelector('[data-nav][aria-current="page"]');
          if (activeNav) activeNav.focus({ preventScroll: true });
        }
        openCaseDetail(openCase.dataset.openCaseId);
        return;
      }
      const empty = event.target.closest("[data-case-empty-action]");
      if (empty) { if (empty.dataset.caseEmptyAction === "add") openNewCase(); else clearCaseFilters(); return; }
      const typeButton = event.target.closest("[data-case-type-value]");
      if (typeButton) {
        const selected = typeButton.classList.contains("is-selected");
        dom["case-type-chips"].querySelectorAll("[data-case-type-value]").forEach((button) => {
          const active = button === typeButton && !selected;
          button.classList.toggle("is-selected", active);
          button.setAttribute("aria-pressed", String(active));
        });
        ui.caseForm.dirty = true;
        setCaseCustomTypeVisibility();
        typeButton.focus({ preventScroll: true });
        return;
      }
      const caseFactor = event.target.closest("[data-case-factor-value]");
      if (caseFactor) {
        const id = caseFactor.dataset.caseFactorValue;
        if (ui.caseForm.factors.has(id)) ui.caseForm.factors.delete(id); else ui.caseForm.factors.add(id);
        ui.caseForm.dirty = true;
        renderCaseFactorControl();
        const replacement = dom["case-factor-chips"].querySelector(`[data-case-factor-value="${CSS.escape(id)}"]`);
        if (replacement) replacement.focus({ preventScroll: true });
        return;
      }
      const responseFactor = event.target.closest("[data-response-factor-value]");
      if (responseFactor) {
        const id = responseFactor.dataset.responseFactorValue;
        if (ui.responseForm.factors.has(id)) ui.responseForm.factors.delete(id); else ui.responseForm.factors.add(id);
        ui.responseForm.dirty = true;
        const item = caseById(dom["response-case-id"].value);
        renderResponseFactorControl(item);
        const replacement = dom["response-factor-chips"].querySelector(`[data-response-factor-value="${CSS.escape(id)}"]`);
        if (replacement) replacement.focus({ preventScroll: true });
        return;
      }
      const editResponse = event.target.closest("[data-edit-response-id]");
      if (editResponse) { openResponseEditor(editResponse.dataset.editResponseId); return; }
      const deleteResponseButton = event.target.closest("[data-delete-response-id]");
      if (deleteResponseButton) { await deleteResponse(deleteResponseButton.dataset.deleteResponseId); return; }
      const selectCompany = event.target.closest("[data-select-company-id]");
      if (selectCompany) {
        const id = selectCompany.dataset.selectCompanyId;
        if (selectCompany.checked) ui.selectedCompanies.add(id); else ui.selectedCompanies.delete(id);
        renderCompanyCandidates();
        const replacement = dom["quick-company-list"].querySelector(`[data-select-company-id="${CSS.escape(id)}"]`);
        if (replacement) replacement.focus({ preventScroll: true });
        return;
      }
      const restore = event.target.closest("[data-restore-company-id]");
      if (restore) { await restoreArchivedCompany(restore.dataset.restoreCompanyId); return; }
      const purge = event.target.closest("[data-purge-company-id]");
      if (purge) { await purgeArchivedCompany(purge.dataset.purgeCompanyId); }
    });

    [dom["case-dialog"], dom["case-detail-dialog"], dom["response-dialog"], dom["quick-company-dialog"], dom["similar-cases-dialog"], dom["advanced-settings-dialog"]].forEach((dialog) => {
      dialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        const message = shouldConfirmClose(dialog);
        if (message && !global.confirm(message)) return;
        if (dialog === dom["case-dialog"]) ui.caseForm.dirty = false;
        if (dialog === dom["response-dialog"]) ui.responseForm.dirty = false;
        if (dialog === dom["quick-company-dialog"]) ui.selectedCompanies.clear();
        app().closeDialog(dialog, { force: true });
      });
      dialog.addEventListener("close", () => app().restoreDialogFocus(dialog));
    });
  }

  async function initialize() {
    if (ui.initialized) return;
    cacheDom();
    if (!dom["case-dialog"] || !dom["response-dialog"]) throw new Error("案件画面の構成を読み込めませんでした。");
    const progressOptions = ["進行中", "回答待ち", "回答済み", "成約", "見送り", "すべて"];
    dom["case-progress-filter"].replaceChildren(...progressOptions.map((label) => new Option(label, label)));
    dom["case-progress-filter"].value = ui.filters.progress;
    if (dom["case-show-archived"]) dom["case-show-archived"].closest("label").hidden = true;
    const archiveCaseButton = byId("case-detail-archive");
    if (archiveCaseButton) archiveCaseButton.hidden = true;
    ui.initialized = true;
    bindEvents();
    await reload();
  }

  Object.assign(KCN, {
    caseUI: {
      initialize,
      reload,
      renderAll,
      openNewCase,
      openCaseDetail,
      companyHistoryHtml,
      companyResponseCount,
      hasUnsavedChanges,
      shouldConfirmClose,
      isInitialized: () => ui.initialized,
      getState: () => ui,
      similarCases,
      recommendationInfo,
      exportCasesCsv
    }
  });
})(window);
