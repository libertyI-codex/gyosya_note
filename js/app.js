(function (global) {
  "use strict";

  const KCN = global.KCN;
  const state = {
    companies: [],
    settings: null,
    currentScreen: "search",
    search: {
      areas: new Set(),
      propertyTypes: new Set(),
      temperature: "すべて",
      favoriteOnly: false,
      query: ""
    },
    list: {
      query: "",
      favoriteOnly: false,
      temperature: "すべて",
      area: "",
      propertyType: "",
      sort: "name"
    },
    form: {
      mode: "new",
      areas: new Set(),
      propertyTypes: new Set(),
      dirty: false,
      saving: false,
      formatBypassSignature: "",
      duplicateBypassSignature: "",
      duplicateMatches: []
    },
    detailId: null,
    restoreData: null,
    lastDeleted: null,
    toastTimer: null,
    reopenFormAfterDetail: false,
    lastFocus: new Map(),
    suppressFocusRestore: new Set(),
    initialized: false
  };

  const dom = {};

  function byId(id) {
    return document.getElementById(id);
  }

  function cacheDom() {
    [
      "fatal-error", "connection-status", "screen-search", "screen-list", "screen-other",
      "search-area-chips", "search-property-chips", "search-temperature", "search-favorite-only", "search-query",
      "clear-search", "search-results", "search-result-count", "company-list", "list-query", "list-sort",
      "list-favorite-only", "list-temperature", "list-area", "list-property-type", "clear-list-filters",
      "list-active-filter-count", "list-count-badge", "list-summary", "add-company-fab",
      "stat-total", "stat-favorite", "stat-active", "stat-paused", "storage-mode-label",
      "export-json", "choose-restore-file", "restore-file-input", "export-csv", "open-option-settings",
      "delete-samples", "delete-all-data", "company-dialog", "company-form", "company-dialog-mode",
      "company-dialog-title", "company-id", "company-created-at", "company-name", "contact-name", "company-phone",
      "company-email", "custom-area", "form-area-chips", "form-property-chips", "company-favorite", "company-memo",
      "memo-count", "form-error", "form-warning", "duplicate-warning", "duplicate-list", "continue-duplicate-save",
      "detail-dialog", "detail-dialog-title", "detail-content", "detail-footer", "restore-dialog", "restore-form",
      "restore-file-summary", "restore-error", "option-dialog", "option-form", "area-options-text",
      "property-options-text", "option-error", "reset-options", "loading-overlay", "loading-message",
      "toast", "toast-message", "toast-action", "toast-close"
    ].forEach((id) => {
      dom[id] = byId(id);
    });
  }

  function setLoading(visible, message) {
    dom["loading-message"].textContent = message || "処理中";
    if (visible && !dom["loading-overlay"].open) {
      dom["loading-overlay"].showModal();
      dom["loading-overlay"].focus({ preventScroll: true });
    }
    if (!visible && dom["loading-overlay"].open) dom["loading-overlay"].close();
  }

  function ensureButtonLabels(root) {
    const scope = root || document;
    scope.querySelectorAll("button:not([aria-label])").forEach((button) => {
      const label = KCN.cleanSingleLine(button.textContent);
      if (label) button.setAttribute("aria-label", label);
    });
  }

  function setFatal(message) {
    dom["fatal-error"].textContent = message;
    dom["fatal-error"].hidden = false;
  }

  function showToast(message, options) {
    const opts = options || {};
    if (state.toastTimer) clearTimeout(state.toastTimer);
    dom["toast-message"].textContent = message;
    dom["toast-action"].hidden = typeof opts.action !== "function";
    dom["toast-action"].textContent = opts.actionLabel || "元に戻す";
    dom["toast-action"].onclick = typeof opts.action === "function" ? opts.action : null;
    dom.toast.hidden = false;
    const duration = Number.isFinite(opts.duration) ? opts.duration : 5200;
    state.toastTimer = setTimeout(hideToast, duration);
  }

  function hideToast() {
    if (state.toastTimer) clearTimeout(state.toastTimer);
    state.toastTimer = null;
    dom.toast.hidden = true;
    dom["toast-action"].onclick = null;
  }

  function openDialog(dialog, focusTarget) {
    if (!dialog) return;
    if (!state.lastFocus.has(dialog.id)) state.lastFocus.set(dialog.id, document.activeElement);
    if (!dialog.open) dialog.showModal();
    requestAnimationFrame(() => {
      const target = focusTarget || dialog.querySelector("button, input, select, textarea, [href]");
      if (target) target.focus({ preventScroll: true });
    });
  }

  function closeDialog(dialog, options) {
    if (!dialog || !dialog.open) return true;
    const opts = options || {};
    if (dialog === dom["company-dialog"] && state.form.dirty && !opts.force) {
      const confirmed = global.confirm("入力中の内容を破棄して閉じますか？");
      if (!confirmed) return false;
    }
    if (opts.force && dialog === dom["company-dialog"]) state.form.dirty = false;
    dialog.close();
    return true;
  }

  function restoreDialogFocus(dialog) {
    if (state.suppressFocusRestore.has(dialog.id)) {
      state.suppressFocusRestore.delete(dialog.id);
      return;
    }
    if (state.reopenFormAfterDetail && dialog === dom["detail-dialog"]) {
      state.reopenFormAfterDetail = false;
      state.lastFocus.delete(dialog.id);
      openDialog(dom["company-dialog"], dom["company-name"]);
      return;
    }
    const previous = state.lastFocus.get(dialog.id);
    state.lastFocus.delete(dialog.id);
    if (previous && document.contains(previous) && typeof previous.focus === "function") {
      requestAnimationFrame(() => previous.focus({ preventScroll: true }));
    }
  }

  function switchScreen(name) {
    if (!['search', 'list', 'other'].includes(name)) return;
    state.currentScreen = name;
    document.querySelectorAll(".screen[data-screen]").forEach((section) => {
      const active = section.dataset.screen === name;
      section.hidden = !active;
      section.classList.toggle("is-active", active);
    });
    document.querySelectorAll("[data-nav]").forEach((button) => {
      const active = button.dataset.nav === name;
      button.classList.toggle("is-active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    dom["add-company-fab"].hidden = name === "other";
    if (name === "list") renderCompanyList();
    if (name === "other") renderStats();
    global.scrollTo({ top: 0, behavior: "auto" });
  }

  function renderChipButtons(container, options, selected, scope) {
    const fragment = document.createDocumentFragment();
    (options || []).forEach((option) => {
      const button = document.createElement("button");
      const isSelected = selected.has(option);
      button.type = "button";
      button.className = `chip${isSelected ? " is-selected" : ""}`;
      button.dataset.chipScope = scope;
      button.dataset.value = option;
      button.setAttribute("aria-pressed", String(isSelected));
      button.setAttribute("aria-label", option);
      button.textContent = option;
      fragment.appendChild(button);
    });
    container.replaceChildren(fragment);
  }

  function renderAllOptionControls() {
    const settings = state.settings || KCN.DEFAULT_SETTINGS;
    const allowedAreas = new Set(settings.areaOptions);
    const allowedPropertyTypes = new Set(settings.propertyTypeOptions);
    state.search.areas = new Set([...state.search.areas].filter((value) => allowedAreas.has(value)));
    state.search.propertyTypes = new Set([...state.search.propertyTypes].filter((value) => allowedPropertyTypes.has(value)));
    renderChipButtons(dom["search-area-chips"], settings.areaOptions, state.search.areas, "search-areas");
    renderChipButtons(dom["search-property-chips"], settings.propertyTypeOptions, state.search.propertyTypes, "search-property-types");

    const listAreaValue = state.list.area;
    dom["list-area"].replaceChildren(new Option("すべて", ""));
    settings.areaOptions.forEach((option) => dom["list-area"].add(new Option(option, option)));
    dom["list-area"].value = settings.areaOptions.includes(listAreaValue) ? listAreaValue : "";
    state.list.area = dom["list-area"].value;

    const listTypeValue = state.list.propertyType;
    dom["list-property-type"].replaceChildren(new Option("すべて", ""));
    settings.propertyTypeOptions.forEach((option) => dom["list-property-type"].add(new Option(option, option)));
    dom["list-property-type"].value = settings.propertyTypeOptions.includes(listTypeValue) ? listTypeValue : "";
    state.list.propertyType = dom["list-property-type"].value;
  }

  function selectedTemperatureClass(temperature) {
    if (temperature === KCN.TEMPERATURES.ACTIVE) return "active";
    if (temperature === KCN.TEMPERATURES.PAUSED) return "paused";
    return "normal";
  }

  function tagsHtml(values, limit) {
    const list = (values || []).filter(Boolean);
    if (!list.length) return '<span class="empty-value">未登録</span>';
    const visible = list.slice(0, limit);
    const remaining = list.length - visible.length;
    return visible.map((value) => `<span class="tag">${KCN.escapeHtml(value)}</span>`).join("")
      + (remaining > 0 ? `<span class="tag tag--more">ほか${remaining}件</span>` : "");
  }

  function actionIcon(type) {
    if (type === "phone") return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 3h3l1.5 4.2-2 1.5a15.2 15.2 0 0 0 6.2 6.2l1.5-2L21 14.4v3c0 2-1.6 3.6-3.6 3.6A14.4 14.4 0 0 1 3 6.6C3 4.6 4.6 3 6.6 3Z"/></svg>';
    if (type === "mail") return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18v14H3zM3 6l9 7 9-7"/></svg>';
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v.01M12 12v.01M12 19v.01"/></svg>';
  }

  function companyCardHtml(company, context) {
    const phoneLink = KCN.isPlausiblePhone(company.phone) ? KCN.phoneHref(company.phone) : "";
    const mailLink = KCN.mailtoHref(company.email, "買取案件のご相談");
    const areas = [...(company.areas || []), company.customArea].filter(Boolean);
    const favoriteLabel = company.isFavorite ? "お気に入りから外す" : "お気に入りに追加";
    let actions = "";
    if (context === "search") {
      const actionItems = [];
      if (phoneLink) actionItems.push(`<a class="card-action" href="${KCN.escapeHtml(phoneLink)}" aria-label="${KCN.escapeHtml(company.companyName)}へ電話">${actionIcon("phone")}<span>電話</span></a>`);
      if (mailLink) actionItems.push(`<a class="card-action" href="${KCN.escapeHtml(mailLink)}" aria-label="${KCN.escapeHtml(company.companyName)}へメール">${actionIcon("mail")}<span>メール</span></a>`);
      actionItems.push(`<button type="button" class="card-action card-action--detail" data-detail-id="${KCN.escapeHtml(company.id)}" aria-label="${KCN.escapeHtml(company.companyName)}の詳細">${actionIcon("detail")}<span>詳細</span></button>`);
      actions = `<div class="company-card__actions${actionItems.length === 1 ? " company-card__actions--one" : actionItems.length === 2 ? " company-card__actions--two" : ""}">${actionItems.join("")}</div>`;
    } else {
      const actionItems = [];
      if (phoneLink) actionItems.push(`<a class="card-action" href="${KCN.escapeHtml(phoneLink)}" aria-label="${KCN.escapeHtml(company.companyName)}へ電話">${actionIcon("phone")}<span>電話</span></a>`);
      actionItems.push(`<button type="button" class="card-action card-action--detail" data-detail-id="${KCN.escapeHtml(company.id)}" aria-label="${KCN.escapeHtml(company.companyName)}の詳細">${actionIcon("detail")}<span>詳細</span></button>`);
      actions = `<div class="company-card__actions${actionItems.length === 1 ? " company-card__actions--one" : actionItems.length === 2 ? " company-card__actions--two" : ""}">${actionItems.join("")}</div>`;
    }
    return `
      <article class="company-card" data-company-id="${KCN.escapeHtml(company.id)}" data-temperature="${KCN.escapeHtml(company.temperature)}">
        <div class="company-card__header">
          <div class="company-card__heading">
            <h4>${KCN.escapeHtml(company.companyName)}</h4>
            <p>${company.contactName ? `担当：${KCN.escapeHtml(company.contactName)}` : "担当者 未登録"}</p>
          </div>
          <button type="button" class="favorite-button" data-favorite-id="${KCN.escapeHtml(company.id)}" aria-label="${KCN.escapeHtml(favoriteLabel)}" aria-pressed="${company.isFavorite}" title="${KCN.escapeHtml(favoriteLabel)}">${company.isFavorite ? "★" : "☆"}</button>
        </div>
        <div class="card-status-row">
          <span class="temperature-badge temperature-badge--${selectedTemperatureClass(company.temperature)}">${KCN.escapeHtml(company.temperature)}</span>
          ${company.isSample ? '<span class="sample-badge">サンプル</span>' : ""}
        </div>
        <div class="card-meta">
          <div class="meta-row"><span class="meta-label">エリア</span><div class="tag-list">${tagsHtml(areas, 3)}</div></div>
          <div class="meta-row"><span class="meta-label">買取対象</span><div class="tag-list">${tagsHtml(company.propertyTypes, 3)}</div></div>
        </div>
        ${actions}
      </article>`;
  }

  function emptyStateHtml(title, message, action) {
    const button = action ? `<button type="button" class="button button--secondary" data-empty-action="${KCN.escapeHtml(action.id)}" aria-label="${KCN.escapeHtml(action.label)}">${KCN.escapeHtml(action.label)}</button>` : "";
    return `<div class="empty-state"><div class="empty-state__icon" aria-hidden="true">⌕</div><h4>${KCN.escapeHtml(title)}</h4><p>${KCN.escapeHtml(message)}</p>${button}</div>`;
  }

  function getSearchResults() {
    const filters = {
      areas: [...state.search.areas],
      propertyTypes: [...state.search.propertyTypes],
      temperature: state.search.temperature,
      favoriteOnly: state.search.favoriteOnly,
      query: state.search.query
    };
    return state.companies
      .filter((company) => KCN.matchesCompany(company, filters))
      .sort((a, b) => KCN.compareCompanies(a, b, "search"));
  }

  function renderSearchResults() {
    const results = getSearchResults();
    dom["search-results"].setAttribute("aria-busy", "false");
    dom["search-result-count"].textContent = `${results.length}社が該当`;
    if (!results.length) {
      dom["search-results"].innerHTML = emptyStateHtml("条件に合う買取業者がありません", "条件を減らすか、すべて解除して確認してください。", { id: "clear-search", label: "条件を解除" });
      return;
    }
    dom["search-results"].innerHTML = results.map((company) => companyCardHtml(company, "search")).join("");
  }

  function getListResults() {
    const query = KCN.normalizeText(state.list.query);
    return state.companies.filter((company) => {
      if (query && !KCN.normalizeText(company.companyName).includes(query)) return false;
      return KCN.matchesCompany(company, {
        areas: state.list.area ? [state.list.area] : [],
        propertyTypes: state.list.propertyType ? [state.list.propertyType] : [],
        temperature: state.list.temperature,
        favoriteOnly: state.list.favoriteOnly,
        query: ""
      });
    }).sort((a, b) => KCN.compareCompanies(a, b, state.list.sort));
  }

  function renderCompanyList() {
    const results = getListResults();
    const filterCount = Number(Boolean(state.list.query)) + Number(state.list.favoriteOnly)
      + Number(state.list.temperature !== "すべて") + Number(Boolean(state.list.area)) + Number(Boolean(state.list.propertyType));
    dom["list-active-filter-count"].textContent = filterCount ? `（${filterCount}件）` : "";
    dom["list-count-badge"].textContent = `${results.length}社`;
    dom["list-summary"].textContent = state.companies.length === results.length
      ? `登録済み ${state.companies.length}社を表示しています。`
      : `登録済み ${state.companies.length}社のうち ${results.length}社を表示しています。`;
    dom["company-list"].setAttribute("aria-busy", "false");
    if (!results.length) {
      dom["company-list"].innerHTML = emptyStateHtml("表示できる業者がありません", state.companies.length ? "絞り込み条件を解除して確認してください。" : "右下の＋ボタンから最初の業者を登録できます。", state.companies.length ? { id: "clear-list", label: "絞り込みを解除" } : { id: "add-company", label: "業者を登録" });
      return;
    }
    dom["company-list"].innerHTML = results.map((company) => companyCardHtml(company, "list")).join("");
  }

  function renderStats() {
    dom["stat-total"].textContent = state.companies.length;
    dom["stat-favorite"].textContent = state.companies.filter((company) => company.isFavorite).length;
    dom["stat-active"].textContent = state.companies.filter((company) => company.temperature === KCN.TEMPERATURES.ACTIVE).length;
    dom["stat-paused"].textContent = state.companies.filter((company) => company.temperature === KCN.TEMPERATURES.PAUSED).length;
    dom["storage-mode-label"].textContent = KCN.db.getStorageMode() === "indexeddb" ? "IndexedDB・端末内保存" : "端末内保存（互換モード）";
  }

  function renderEverything() {
    renderAllOptionControls();
    renderSearchResults();
    renderCompanyList();
    renderStats();
    ensureButtonLabels(document);
  }

  async function reloadData(options) {
    const opts = options || {};
    if (opts.showLoading) setLoading(true, opts.message || "データを読み込み中");
    try {
      const [companies, settings] = await Promise.all([KCN.db.getAllCompanies(), KCN.db.getSettings()]);
      state.companies = companies;
      state.settings = settings;
      renderEverything();
    } finally {
      if (opts.showLoading) setLoading(false);
    }
  }

  function clearSearchFilters() {
    state.search.areas.clear();
    state.search.propertyTypes.clear();
    state.search.temperature = "すべて";
    state.search.favoriteOnly = false;
    state.search.query = "";
    dom["search-favorite-only"].checked = false;
    dom["search-query"].value = "";
    document.querySelectorAll("#search-temperature [data-temperature]").forEach((button) => {
      const selected = button.dataset.temperature === "すべて";
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    renderAllOptionControls();
    renderSearchResults();
  }

  function clearListFilters() {
    state.list.query = "";
    state.list.favoriteOnly = false;
    state.list.temperature = "すべて";
    state.list.area = "";
    state.list.propertyType = "";
    dom["list-query"].value = "";
    dom["list-favorite-only"].checked = false;
    dom["list-temperature"].value = "すべて";
    dom["list-area"].value = "";
    dom["list-property-type"].value = "";
    renderCompanyList();
  }

  function hideFormMessages() {
    dom["form-error"].hidden = true;
    dom["form-warning"].hidden = true;
    dom["duplicate-warning"].hidden = true;
    dom["form-error"].textContent = "";
    dom["form-warning"].textContent = "";
    dom["duplicate-list"].replaceChildren();
    dom["company-name"].removeAttribute("aria-invalid");
    dom["company-name"].removeAttribute("aria-describedby");
    state.form.duplicateMatches = [];
  }

  function renderFormChips() {
    const areaOptions = KCN.uniqueStrings([...(state.settings.areaOptions || []), ...state.form.areas]);
    const typeOptions = KCN.uniqueStrings([...(state.settings.propertyTypeOptions || []), ...state.form.propertyTypes]);
    renderChipButtons(dom["form-area-chips"], areaOptions, state.form.areas, "form-areas");
    renderChipButtons(dom["form-property-chips"], typeOptions, state.form.propertyTypes, "form-property-types");
  }

  function resetCompanyForm() {
    dom["company-form"].reset();
    dom["company-id"].value = "";
    dom["company-created-at"].value = "";
    state.form.areas = new Set();
    state.form.propertyTypes = new Set();
    state.form.duplicateBypassSignature = "";
    state.form.formatBypassSignature = "";
    state.form.saving = false;
    state.form.dirty = false;
    dom["memo-count"].textContent = "0";
    hideFormMessages();
    renderFormChips();
  }

  function openNewCompany() {
    resetCompanyForm();
    state.form.mode = "new";
    dom["company-dialog-mode"].textContent = "NEW COMPANY";
    dom["company-dialog-title"].textContent = "業者を登録";
    openDialog(dom["company-dialog"], dom["company-name"]);
  }

  function fillCompanyForm(company, mode) {
    resetCompanyForm();
    state.form.mode = mode;
    const isDuplicate = mode === "duplicate";
    dom["company-id"].value = isDuplicate ? "" : company.id;
    dom["company-created-at"].value = isDuplicate ? "" : company.createdAt;
    dom["company-name"].value = isDuplicate ? `${company.companyName}（複製）` : company.companyName;
    dom["contact-name"].value = company.contactName;
    dom["company-phone"].value = company.phone;
    dom["company-email"].value = company.email;
    dom["custom-area"].value = company.customArea;
    dom["company-favorite"].checked = company.isFavorite;
    dom["company-memo"].value = company.memo;
    dom["memo-count"].textContent = String(company.memo.length);
    state.form.areas = new Set(company.areas || []);
    state.form.propertyTypes = new Set(company.propertyTypes || []);
    const temperature = Object.values(KCN.TEMPERATURES).includes(company.temperature) ? company.temperature : KCN.TEMPERATURES.NORMAL;
    const radio = dom["company-form"].querySelector(`input[name="temperature"][value="${temperature}"]`);
    if (radio) radio.checked = true;
    renderFormChips();
    dom["company-dialog-mode"].textContent = isDuplicate ? "DUPLICATE COMPANY" : "EDIT COMPANY";
    dom["company-dialog-title"].textContent = isDuplicate ? "複製して登録" : "業者を編集";
    state.form.dirty = false;
    openDialog(dom["company-dialog"], dom["company-name"]);
    requestAnimationFrame(() => dom["company-name"].select());
  }

  function readCompanyForm() {
    const id = dom["company-id"].value || KCN.uuid();
    const existing = state.companies.find((company) => company.id === id);
    const now = KCN.isoNow();
    const temperatureInput = dom["company-form"].querySelector('input[name="temperature"]:checked');
    return KCN.normalizeCompany({
      id,
      companyName: dom["company-name"].value,
      contactName: dom["contact-name"].value,
      phone: dom["company-phone"].value,
      email: dom["company-email"].value,
      areas: [...state.form.areas],
      customArea: dom["custom-area"].value,
      propertyTypes: [...state.form.propertyTypes],
      temperature: temperatureInput ? temperatureInput.value : KCN.TEMPERATURES.NORMAL,
      isFavorite: dom["company-favorite"].checked,
      memo: dom["company-memo"].value,
      createdAt: dom["company-created-at"].value || now,
      updatedAt: now,
      isSample: state.form.mode === "edit" && existing ? existing.isSample : false,
      schemaVersion: KCN.APP.schemaVersion,
      extra: state.form.mode === "edit" && existing ? existing.extra : {}
    });
  }

  function duplicateSignature(company) {
    return [KCN.normalizeCompanyKey(company.companyName), KCN.normalizePhone(company.phone), KCN.normalizeEmail(company.email)].join("|");
  }

  function formatWarningSignature(company) {
    return [company.phone, company.email].join("|");
  }

  function showFormatWarning(warnings) {
    const message = document.createElement("span");
    message.textContent = warnings.join(" ");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button button--warning";
    button.dataset.continueFormatSave = "true";
    button.textContent = "この内容で保存を続ける";
    dom["form-warning"].replaceChildren(message, button);
    dom["form-warning"].hidden = false;
    ensureButtonLabels(dom["form-warning"]);
    dom["form-warning"].scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function showDuplicateWarning(matches) {
    state.form.duplicateMatches = matches;
    const fragment = document.createDocumentFragment();
    matches.forEach((match) => {
      const row = document.createElement("div");
      row.className = "duplicate-item";
      const copy = document.createElement("span");
      const strong = document.createElement("strong");
      strong.textContent = match.company.companyName;
      const reason = document.createElement("small");
      reason.textContent = `一致：${match.reasons.join("・")}`;
      reason.style.display = "block";
      copy.append(strong, reason);
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "詳細を見る";
      button.dataset.duplicateDetailId = match.company.id;
      row.append(copy, button);
      fragment.appendChild(row);
    });
    dom["duplicate-list"].replaceChildren(fragment);
    dom["duplicate-warning"].hidden = false;
    ensureButtonLabels(dom["duplicate-warning"]);
    dom["duplicate-warning"].scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function saveCompany(event) {
    event.preventDefault();
    if (state.form.saving) return;
    hideFormMessages();
    const company = readCompanyForm();
    if (!company.companyName) {
      dom["form-error"].textContent = "業者名を入力してください。";
      dom["form-error"].hidden = false;
      dom["company-name"].setAttribute("aria-invalid", "true");
      dom["company-name"].setAttribute("aria-describedby", "form-error");
      dom["company-name"].focus();
      return;
    }
    const warnings = [];
    if (!KCN.isPlausiblePhone(company.phone)) warnings.push("電話番号の形式を確認してください（保存はできます）。");
    if (!KCN.isPlausibleEmail(company.email)) warnings.push("メールアドレスの形式を確認してください（保存はできます）。");
    const warningSignature = formatWarningSignature(company);
    if (warnings.length && state.form.formatBypassSignature !== warningSignature) {
      showFormatWarning(warnings);
      return;
    }

    if (state.form.mode !== "edit") {
      const signature = duplicateSignature(company);
      const matches = KCN.findDuplicates(company, state.companies, null);
      if (matches.length && state.form.duplicateBypassSignature !== signature) {
        showDuplicateWarning(matches);
        return;
      }
    }

    const label = state.form.mode === "edit" ? "更新" : "登録";
    state.form.saving = true;
    setLoading(true, `${label}しています`);
    try {
      await KCN.db.putCompany(company);
    } catch (error) {
      dom["form-error"].textContent = error.message || `${label}できませんでした。`;
      dom["form-error"].hidden = false;
      state.form.saving = false;
      setLoading(false);
      return;
    }

    state.form.dirty = false;
    closeDialog(dom["company-dialog"], { force: true });
    try {
      await reloadData();
      showToast(`「${company.companyName}」を${label}しました。`);
    } catch (error) {
      showToast(`${label}は完了しましたが、画面を更新できませんでした。ページを再読み込みしてください。`, { duration: 8000 });
    } finally {
      state.form.saving = false;
      setLoading(false);
    }
  }

  async function toggleFavorite(id) {
    const company = state.companies.find((item) => item.id === id);
    if (!company) return;
    const restoreFocus = document.activeElement && document.activeElement.dataset.favoriteId === id;
    const updated = KCN.normalizeCompany({ ...company, isFavorite: !company.isFavorite, updatedAt: KCN.isoNow() });
    try {
      await KCN.db.putCompany(updated);
    } catch (error) {
      showToast("お気に入りを変更できませんでした。");
      return;
    }
    try {
      await reloadData();
      if (state.detailId === id && dom["detail-dialog"].open) renderDetail(updated);
      if (restoreFocus) {
        const scope = dom["detail-dialog"].open ? dom["detail-dialog"] : byId(`screen-${state.currentScreen}`);
        const target = Array.from(scope.querySelectorAll("[data-favorite-id]")).find((button) => button.dataset.favoriteId === id);
        if (target) requestAnimationFrame(() => target.focus({ preventScroll: true }));
      }
      showToast(updated.isFavorite ? "お気に入りに追加しました。" : "お気に入りから外しました。", { duration: 2800 });
    } catch (error) {
      showToast("お気に入りは変更済みですが、画面を更新できませんでした。ページを再読み込みしてください。", { duration: 8000 });
    }
  }

  function renderDetail(company) {
    state.detailId = company.id;
    dom["detail-dialog-title"].textContent = company.companyName;
    const phoneLink = KCN.isPlausiblePhone(company.phone) ? KCN.phoneHref(company.phone) : "";
    const mailLink = KCN.mailtoHref(company.email, "買取案件のご相談");
    const favoriteLabel = company.isFavorite ? "お気に入りから外す" : "お気に入りに追加";
    const areas = [...(company.areas || []), company.customArea].filter(Boolean);
    dom["detail-content"].innerHTML = `
      <div class="detail-hero">
        <div>
          <h3>${KCN.escapeHtml(company.companyName)}</h3>
          <p>${company.contactName ? `担当：${KCN.escapeHtml(company.contactName)}` : "担当者 未登録"}</p>
          <div class="card-status-row">
            <span class="temperature-badge temperature-badge--${selectedTemperatureClass(company.temperature)}">${KCN.escapeHtml(company.temperature)}</span>
            ${company.isSample ? '<span class="sample-badge">サンプル</span>' : ""}
          </div>
        </div>
        <button type="button" class="favorite-button" data-favorite-id="${KCN.escapeHtml(company.id)}" aria-label="${KCN.escapeHtml(favoriteLabel)}" aria-pressed="${company.isFavorite}" title="${KCN.escapeHtml(favoriteLabel)}">${company.isFavorite ? "★" : "☆"}</button>
      </div>
      ${(phoneLink || mailLink) ? `<div class="detail-quick-actions">
        ${phoneLink ? `<a class="button button--primary" href="${KCN.escapeHtml(phoneLink)}">電話する</a>` : ""}
        ${mailLink ? `<a class="button button--secondary" href="${KCN.escapeHtml(mailLink)}">メールする</a>` : ""}
      </div>` : ""}
      <section class="detail-section">
        <h4>連絡先</h4>
        <dl class="detail-list">
          <div><dt>担当者</dt><dd>${company.contactName ? KCN.escapeHtml(company.contactName) : "未登録"}</dd></div>
          <div><dt>電話番号</dt><dd>${company.phone ? KCN.escapeHtml(company.phone) : "未登録"}</dd></div>
          <div><dt>メール</dt><dd>${company.email ? KCN.escapeHtml(company.email) : "未登録"}</dd></div>
        </dl>
      </section>
      <section class="detail-section">
        <h4>買取条件</h4>
        <dl class="detail-list">
          <div><dt>買取エリア</dt><dd><div class="tag-list">${tagsHtml(areas, 99)}</div></dd></div>
          <div><dt>買取対象</dt><dd><div class="tag-list">${tagsHtml(company.propertyTypes, 99)}</div></dd></div>
          <div><dt>温度感</dt><dd>${KCN.escapeHtml(company.temperature)}</dd></div>
          <div><dt>お気に入り</dt><dd>${company.isFavorite ? "登録済み" : "未登録"}</dd></div>
        </dl>
      </section>
      <section class="detail-section">
        <h4>一言メモ</h4>
        <div class="detail-list"><div><dt>メモ</dt><dd>${company.memo ? KCN.escapeHtml(company.memo) : "未登録"}</dd></div></div>
      </section>
      <section class="detail-section">
        <h4>更新情報</h4>
        <dl class="detail-list">
          <div><dt>登録日</dt><dd>${KCN.escapeHtml(KCN.formatDate(company.createdAt))}</dd></div>
          <div><dt>更新日</dt><dd>${KCN.escapeHtml(KCN.formatDate(company.updatedAt))}</dd></div>
        </dl>
      </section>`;
    dom["detail-footer"].classList.toggle("dialog-footer--single", state.reopenFormAfterDetail);
    dom["detail-footer"].innerHTML = state.reopenFormAfterDetail
      ? '<button type="button" class="button button--primary" data-detail-action="return-to-form">登録画面へ戻る</button>'
      : `
        <button type="button" class="button button--secondary" data-detail-action="edit" data-company-id="${KCN.escapeHtml(company.id)}">編集</button>
        <button type="button" class="button button--quiet" data-detail-action="duplicate" data-company-id="${KCN.escapeHtml(company.id)}">複製</button>
        <button type="button" class="button button--danger" data-detail-action="delete" data-company-id="${KCN.escapeHtml(company.id)}">削除</button>`;
    ensureButtonLabels(dom["detail-dialog"]);
  }

  function openDetail(id) {
    const company = state.companies.find((item) => item.id === id);
    if (!company) {
      showToast("業者情報が見つかりませんでした。");
      return;
    }
    renderDetail(company);
    openDialog(dom["detail-dialog"]);
  }

  async function deleteCompany(id) {
    const company = state.companies.find((item) => item.id === id);
    if (!company) return;
    if (!global.confirm(`「${company.companyName}」を削除しますか？`)) return;
    setLoading(true, "削除しています");
    try {
      await KCN.db.deleteCompany(company.id);
    } catch (error) {
      showToast("削除できませんでした。");
      setLoading(false);
      return;
    }

    state.lastDeleted = company;
    closeDialog(dom["detail-dialog"], { force: true });
    let refreshFailed = false;
    try {
      await reloadData();
    } catch (error) {
      refreshFailed = true;
    }
    showToast(refreshFailed
      ? `「${company.companyName}」は削除済みです。画面を再読み込みしてください。`
      : `「${company.companyName}」を削除しました。`, {
      actionLabel: "元に戻す",
      duration: 7000,
      action: async () => {
        const deleted = state.lastDeleted;
        if (!deleted) return;
        hideToast();
        try {
          await KCN.db.putCompany(deleted);
        } catch (error) {
          showToast("元に戻せませんでした。");
          return;
        }
        state.lastDeleted = null;
        try {
          await reloadData();
          showToast(`「${deleted.companyName}」を元に戻しました。`);
        } catch (error) {
          showToast("データは元に戻しました。画面を再読み込みしてください。", { duration: 8000 });
        }
      }
    });
    setLoading(false);
  }

  async function exportJson() {
    setLoading(true, "バックアップを作成中");
    try {
      const backup = await KCN.db.createBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json;charset=utf-8" });
      KCN.downloadBlob(blob, `kaitori-company-note-backup-${KCN.todayFileStamp()}.json`);
      showToast("JSONバックアップを保存しました。");
    } catch (error) {
      showToast("JSONバックアップを作成できませんでした。");
    } finally {
      setLoading(false);
    }
  }

  function exportCsv() {
    try {
      const sorted = [...state.companies].sort((a, b) => KCN.compareCompanies(a, b, "name"));
      const blob = new Blob([KCN.buildCsv(sorted)], { type: "text/csv;charset=utf-8" });
      KCN.downloadBlob(blob, `kaitori-company-note-${KCN.todayFileStamp()}.csv`);
      showToast("CSVを出力しました。");
    } catch (error) {
      showToast("CSVを出力できませんでした。");
    }
  }

  async function handleRestoreFile(file) {
    if (!file) return;
    state.restoreData = null;
    if (file.size > 10 * 1024 * 1024) {
      showToast("JSONファイルが大きすぎます（上限10MB）。");
      dom["restore-file-input"].value = "";
      return;
    }
    setLoading(true, "JSONを検証中");
    try {
      const text = await file.text();
      const parsed = JSON.parse(text.replace(/^\uFEFF/, ""));
      const validated = KCN.validateBackup(parsed);
      state.restoreData = validated;
      dom["restore-file-summary"].replaceChildren();
      const strong = document.createElement("strong");
      strong.textContent = file.name;
      const copy = document.createElement("span");
      copy.textContent = `${validated.companies.length}社の業者データを確認しました。`;
      dom["restore-file-summary"].append(strong, copy);
      dom["restore-error"].hidden = true;
      openDialog(dom["restore-dialog"]);
    } catch (error) {
      state.restoreData = null;
      showToast(`復元できません：${error.message || "不正なJSONです。"}`, { duration: 7200 });
      dom["restore-file-input"].value = "";
    } finally {
      setLoading(false);
    }
  }

  async function restoreBackup(event) {
    event.preventDefault();
    dom["restore-error"].hidden = true;
    if (!state.restoreData) {
      dom["restore-error"].textContent = "復元するデータがありません。";
      dom["restore-error"].hidden = false;
      return;
    }
    const modeInput = dom["restore-form"].querySelector('input[name="restoreMode"]:checked');
    const mode = modeInput ? modeInput.value : "add";
    if (mode === "replace" && !global.confirm("現在の業者情報と設定を、このバックアップで置換しますか？")) return;
    setLoading(true, "データを復元中");
    let result;
    try {
      result = await KCN.db.restoreBackup(state.restoreData, mode);
    } catch (error) {
      dom["restore-error"].textContent = `復元できませんでした。既存データは変更していません。${error.message ? ` ${error.message}` : ""}`;
      dom["restore-error"].hidden = false;
      setLoading(false);
      return;
    }

    state.restoreData = null;
    dom["restore-file-input"].value = "";
    closeDialog(dom["restore-dialog"], { force: true });
    try {
      await reloadData();
      const skipped = result.skipped ? `（同じID ${result.skipped}件はスキップ）` : "";
      showToast(`${result.imported}社を復元しました。${skipped}`, { duration: 6500 });
    } catch (error) {
      showToast("復元は完了しましたが、画面を更新できませんでした。ページを再読み込みしてください。", { duration: 8000 });
    } finally {
      setLoading(false);
    }
  }

  function openOptionSettings() {
    dom["area-options-text"].value = (state.settings.areaOptions || []).join("\n");
    dom["property-options-text"].value = (state.settings.propertyTypeOptions || []).join("\n");
    dom["option-error"].hidden = true;
    openDialog(dom["option-dialog"], dom["area-options-text"]);
  }

  function linesToOptions(value) {
    return KCN.uniqueStrings(String(value || "").split(/\r?\n/));
  }

  async function saveOptionSettings(event) {
    event.preventDefault();
    const areaOptions = linesToOptions(dom["area-options-text"].value);
    const propertyTypeOptions = linesToOptions(dom["property-options-text"].value);
    if (!areaOptions.length || !propertyTypeOptions.length) {
      dom["option-error"].textContent = "エリア候補と買取対象候補を、それぞれ1件以上入力してください。";
      dom["option-error"].hidden = false;
      return;
    }
    setLoading(true, "候補を保存中");
    try {
      state.settings = await KCN.db.putSettings({ areaOptions, propertyTypeOptions });
      closeDialog(dom["option-dialog"], { force: true });
      renderEverything();
      showToast("候補を保存しました。");
    } catch (error) {
      dom["option-error"].textContent = "候補を保存できませんでした。";
      dom["option-error"].hidden = false;
    } finally {
      setLoading(false);
    }
  }

  async function removeSamples() {
    const count = state.companies.filter((company) => company.isSample).length;
    if (!count) {
      showToast("削除できるサンプルデータはありません。");
      return;
    }
    if (!global.confirm(`サンプル業者 ${count}社をすべて削除しますか？`)) return;
    setLoading(true, "サンプルを削除中");
    try {
      const deleted = await KCN.db.deleteSamples();
      await reloadData();
      showToast(`サンプル業者 ${deleted}社を削除しました。`);
    } catch (error) {
      showToast("サンプルを削除できませんでした。");
    } finally {
      setLoading(false);
    }
  }

  async function removeAllData() {
    if (!global.confirm("全業者データと候補設定を削除しますか？この操作は取り消せません。")) return;
    if (!global.confirm("本当に全データを削除しますか？")) return;
    setLoading(true, "全データを削除中");
    try {
      await KCN.db.clearAllData();
      clearSearchFilters();
      clearListFilters();
      await reloadData();
      showToast("全データを削除しました。", { duration: 6500 });
    } catch (error) {
      showToast("全データを削除できませんでした。");
    } finally {
      setLoading(false);
    }
  }

  function updateConnectionStatus() {
    const offline = navigator.onLine === false;
    dom["connection-status"].hidden = !offline;
  }

  function registerServiceWorker() {
    if (!['http:', 'https:'].includes(location.protocol) || !("serviceWorker" in navigator)) return;
    global.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch((error) => {
        console.warn("Service Workerを登録できませんでした。", error);
      });
    }, { once: true });
  }

  function handleChipClick(button) {
    const scope = button.dataset.chipScope;
    const value = button.dataset.value;
    const container = button.parentElement;
    let set;
    if (scope === "search-areas") set = state.search.areas;
    if (scope === "search-property-types") set = state.search.propertyTypes;
    if (scope === "form-areas") set = state.form.areas;
    if (scope === "form-property-types") set = state.form.propertyTypes;
    if (!set) return;
    if (set.has(value)) set.delete(value);
    else set.add(value);
    if (scope.startsWith("form-")) {
      state.form.dirty = true;
      state.form.duplicateBypassSignature = "";
      state.form.formatBypassSignature = "";
      dom["duplicate-warning"].hidden = true;
      renderFormChips();
    } else {
      renderAllOptionControls();
      renderSearchResults();
    }
    const replacement = Array.from(container.querySelectorAll("[data-chip-scope]")).find((item) => item.dataset.value === value);
    if (replacement) requestAnimationFrame(() => replacement.focus({ preventScroll: true }));
  }

  function bindEvents() {
    document.querySelectorAll("[data-nav]").forEach((button) => button.addEventListener("click", () => switchScreen(button.dataset.nav)));
    dom["add-company-fab"].addEventListener("click", openNewCompany);
    dom["clear-search"].addEventListener("click", clearSearchFilters);
    dom["clear-list-filters"].addEventListener("click", clearListFilters);

    dom["search-temperature"].addEventListener("click", (event) => {
      const button = event.target.closest("[data-temperature]");
      if (!button) return;
      state.search.temperature = button.dataset.temperature;
      dom["search-temperature"].querySelectorAll("[data-temperature]").forEach((item) => {
        const selected = item === button;
        item.classList.toggle("is-selected", selected);
        item.setAttribute("aria-pressed", String(selected));
      });
      renderSearchResults();
    });
    dom["search-favorite-only"].addEventListener("change", () => {
      state.search.favoriteOnly = dom["search-favorite-only"].checked;
      renderSearchResults();
    });
    dom["search-query"].addEventListener("input", () => {
      state.search.query = dom["search-query"].value;
      renderSearchResults();
    });

    dom["list-query"].addEventListener("input", () => { state.list.query = dom["list-query"].value; renderCompanyList(); });
    dom["list-sort"].addEventListener("change", () => { state.list.sort = dom["list-sort"].value; renderCompanyList(); });
    dom["list-favorite-only"].addEventListener("change", () => { state.list.favoriteOnly = dom["list-favorite-only"].checked; renderCompanyList(); });
    dom["list-temperature"].addEventListener("change", () => { state.list.temperature = dom["list-temperature"].value; renderCompanyList(); });
    dom["list-area"].addEventListener("change", () => { state.list.area = dom["list-area"].value; renderCompanyList(); });
    dom["list-property-type"].addEventListener("change", () => { state.list.propertyType = dom["list-property-type"].value; renderCompanyList(); });

    dom["company-form"].addEventListener("submit", saveCompany);
    dom["company-form"].addEventListener("input", (event) => {
      if (event.target === dom["company-memo"]) dom["memo-count"].textContent = String(dom["company-memo"].value.length);
      if (event.target === dom["company-name"] && KCN.cleanSingleLine(dom["company-name"].value)) {
        dom["company-name"].removeAttribute("aria-invalid");
        dom["company-name"].removeAttribute("aria-describedby");
        dom["form-error"].hidden = true;
      }
      state.form.dirty = true;
      state.form.duplicateBypassSignature = "";
      state.form.formatBypassSignature = "";
      dom["duplicate-warning"].hidden = true;
    });
    dom["company-form"].addEventListener("change", () => {
      state.form.dirty = true;
      state.form.duplicateBypassSignature = "";
      state.form.formatBypassSignature = "";
      dom["duplicate-warning"].hidden = true;
    });
    dom["continue-duplicate-save"].addEventListener("click", () => {
      const company = readCompanyForm();
      state.form.duplicateBypassSignature = duplicateSignature(company);
      dom["duplicate-warning"].hidden = true;
      dom["company-form"].requestSubmit();
    });

    dom["export-json"].addEventListener("click", exportJson);
    dom["export-csv"].addEventListener("click", exportCsv);
    dom["choose-restore-file"].addEventListener("click", () => dom["restore-file-input"].click());
    dom["restore-file-input"].addEventListener("change", () => handleRestoreFile(dom["restore-file-input"].files[0]));
    dom["restore-form"].addEventListener("submit", restoreBackup);
    dom["open-option-settings"].addEventListener("click", openOptionSettings);
    dom["option-form"].addEventListener("submit", saveOptionSettings);
    dom["reset-options"].addEventListener("click", () => {
      dom["area-options-text"].value = KCN.AREA_OPTIONS.join("\n");
      dom["property-options-text"].value = KCN.PROPERTY_TYPE_OPTIONS.join("\n");
      dom["option-error"].hidden = true;
    });
    dom["delete-samples"].addEventListener("click", removeSamples);
    dom["delete-all-data"].addEventListener("click", removeAllData);
    dom["toast-close"].addEventListener("click", hideToast);

    document.addEventListener("click", async (event) => {
      const chip = event.target.closest("[data-chip-scope]");
      if (chip) {
        handleChipClick(chip);
        return;
      }
      const continueFormatSave = event.target.closest("[data-continue-format-save]");
      if (continueFormatSave) {
        const company = readCompanyForm();
        state.form.formatBypassSignature = formatWarningSignature(company);
        dom["form-warning"].hidden = true;
        dom["company-form"].requestSubmit();
        return;
      }
      const close = event.target.closest("[data-close-dialog]");
      if (close) {
        closeDialog(byId(close.dataset.closeDialog));
        return;
      }
      const favorite = event.target.closest("[data-favorite-id]");
      if (favorite) {
        await toggleFavorite(favorite.dataset.favoriteId);
        return;
      }
      const detail = event.target.closest("[data-detail-id]");
      if (detail) {
        openDetail(detail.dataset.detailId);
        return;
      }
      const duplicateDetail = event.target.closest("[data-duplicate-detail-id]");
      if (duplicateDetail) {
        state.reopenFormAfterDetail = true;
        state.suppressFocusRestore.add("company-dialog");
        dom["company-dialog"].close();
        openDetail(duplicateDetail.dataset.duplicateDetailId);
        return;
      }
      const detailAction = event.target.closest("[data-detail-action]");
      if (detailAction) {
        if (detailAction.dataset.detailAction === "return-to-form") {
          closeDialog(dom["detail-dialog"], { force: true });
          return;
        }
        const company = state.companies.find((item) => item.id === detailAction.dataset.companyId);
        if (!company) return;
        if (detailAction.dataset.detailAction === "edit") {
          const returnFocus = state.lastFocus.get("detail-dialog");
          if (returnFocus) state.lastFocus.set("company-dialog", returnFocus);
          state.lastFocus.delete("detail-dialog");
          state.suppressFocusRestore.add("detail-dialog");
          closeDialog(dom["detail-dialog"], { force: true });
          fillCompanyForm(company, "edit");
        }
        if (detailAction.dataset.detailAction === "duplicate") {
          const returnFocus = state.lastFocus.get("detail-dialog");
          if (returnFocus) state.lastFocus.set("company-dialog", returnFocus);
          state.lastFocus.delete("detail-dialog");
          state.suppressFocusRestore.add("detail-dialog");
          closeDialog(dom["detail-dialog"], { force: true });
          fillCompanyForm(company, "duplicate");
        }
        if (detailAction.dataset.detailAction === "delete") await deleteCompany(company.id);
        return;
      }
      const emptyAction = event.target.closest("[data-empty-action]");
      if (emptyAction) {
        if (emptyAction.dataset.emptyAction === "clear-search") clearSearchFilters();
        if (emptyAction.dataset.emptyAction === "clear-list") clearListFilters();
        if (emptyAction.dataset.emptyAction === "add-company") openNewCompany();
      }
    });

    [dom["company-dialog"], dom["detail-dialog"], dom["restore-dialog"], dom["option-dialog"]].forEach((dialog) => {
      dialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        closeDialog(dialog);
      });
      dialog.addEventListener("close", () => {
        if (dialog === dom["restore-dialog"]) {
          state.restoreData = null;
          dom["restore-file-input"].value = "";
          const addMode = dom["restore-form"].querySelector('input[name="restoreMode"][value="add"]');
          if (addMode) addMode.checked = true;
          dom["restore-error"].hidden = true;
        }
        restoreDialogFocus(dialog);
      });
    });

    global.addEventListener("online", updateConnectionStatus);
    global.addEventListener("offline", updateConnectionStatus);
    global.addEventListener("beforeunload", (event) => {
      if (!state.form.dirty || (!dom["company-dialog"].open && !state.reopenFormAfterDetail)) return;
      event.preventDefault();
      event.returnValue = "";
    });
  }

  async function initialize() {
    cacheDom();
    bindEvents();
    updateConnectionStatus();
    registerServiceWorker();
    setLoading(true, "アプリを準備中");
    try {
      state.settings = await KCN.db.initialize();
      state.companies = await KCN.db.getAllCompanies();
      state.list.sort = state.settings.defaultSort || "name";
      dom["list-sort"].value = state.list.sort;
      renderEverything();
      state.initialized = true;
    } catch (error) {
      console.error("アプリを初期化できませんでした。", error);
      setFatal("アプリを起動できませんでした。ページを再読み込みしてください。");
    } finally {
      setLoading(false);
    }
  }

  global.KCN.app = {
    state,
    initialize,
    reloadData,
    clearSearchFilters,
    clearListFilters,
    openNewCompany,
    openDetail,
    switchScreen,
    getSearchResults,
    getListResults
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})(window);
