const {
  REGION_IDX,
  normalizeColumn,
  HIDDEN_COLUMNS,
  NUMERIC_FILTER_COLUMNS,
  COLUMN_GROUPS,
  getGroupTitle,
  buildCsvUrl,
  parseNumber
} = window.AptViewerConfig;

const NUMERIC_FILTER_OPTIONS = [
  { label: "기본값: 항목 선택", value: "" },
  { label: "보다 큼", value: "gt" },
  { label: "보다 작음", value: "lt" },
  { label: "크거나 같음", value: "gte" },
  { label: "작거나 같음", value: "lte" }
];

Vue.createApp({
  data() {
    return {
      rawRows: [],
      statusMessage: "데이터를 불러오는 중입니다...",
      filters: {},
      numericFilters: {},
      numericFilterOptions: NUMERIC_FILTER_OPTIONS,
      viewportWidth: typeof window !== "undefined" ? window.innerWidth : 1024,
      openFilterKey: null,
      filterMenuStyle: {},
      tableWrapEl: null,
      sortKey: null,
      sortDir: "asc",
      hideEmptyRows: false,
      mobileViewMode: "card"
    };
  },
  computed: {
    headerRow() {
      return this.rawRows[1] || [];
    },
    tableRows() {
      return this.rawRows.slice(2);
    },
    visibleColumns() {
      const columns = this.headerRow
        .map((name, index) => ({
          name,
          index,
          group: getGroupTitle(name),
          normalized: normalizeColumn(name)
        }))
        .filter((col) => !HIDDEN_COLUMNS.has(col.normalized))
        .map((col) => ({
          ...col,
          numeric: NUMERIC_FILTER_COLUMNS.has(col.normalized)
        }));

      const recentKey = normalizeColumn("최근수정일");
      const recentIndex = columns.findIndex((col) => col.normalized === recentKey);
      if (recentIndex > 0) {
        const [recentCol] = columns.splice(recentIndex, 1);
        columns.unshift(recentCol);
      }
      return columns;
    },
    visibleHeaderRow() {
      return this.visibleColumns.map((col) => col.name);
    },
    visibleGroups() {
      const counts = new Map();
      for (const col of this.visibleColumns) {
        counts.set(col.group, (counts.get(col.group) || 0) + 1);
      }
      return COLUMN_GROUPS.map((group) => ({
        title: group.title,
        colspan: counts.get(group.title) || 0
      })).filter((group) => group.colspan > 0);
    },
    sortedRows() {
      const rows = this.tableRows.slice();
      const getCell = (row, name) => {
        const idx = this.visibleColumns.find((col) => col.normalized === normalizeColumn(name))
          ?.index;
        if (idx === undefined) return "";
        return (row[idx] ?? "").toString().trim();
      };
      const rank = (region) => {
        if (!region) return 3;
        const trimmed = region.trim();
        if (trimmed.startsWith("서울")) return 0;
        if (trimmed.startsWith("경기")) return 1;
        return 2;
      };
      return rows.sort((a, b) => {
        const aRegion = (a[REGION_IDX] || "").trim();
        const bRegion = (b[REGION_IDX] || "").trim();
        const rankDiff = rank(aRegion) - rank(bRegion);
        if (rankDiff !== 0) return rankDiff;
        const regionCompare = aRegion.localeCompare(bRegion, "ko");
        if (regionCompare !== 0) return regionCompare;
        const areaCompare = getCell(a, "생활권(동)").localeCompare(getCell(b, "생활권(동)"), "ko");
        if (areaCompare !== 0) return areaCompare;
        const complexCompare = getCell(a, "단지명").localeCompare(getCell(b, "단지명"), "ko");
        if (complexCompare !== 0) return complexCompare;
        const exclusiveCompare = getCell(a, "전용 면적").localeCompare(
          getCell(b, "전용 면적"),
          "ko"
        );
        if (exclusiveCompare !== 0) return exclusiveCompare;
        return getCell(a, "공급 평형").localeCompare(getCell(b, "공급 평형"), "ko");
      });
    },
    columnValues() {
      const values = {};
      for (const col of this.visibleColumns) {
        const key = col.normalized;
        const bucket = new Map();
        const counts = new Map();
        for (const row of this.sortedRows) {
          const cell = (row[col.index] ?? "").toString().trim();
          const label = cell || "(빈값)";
          if (!bucket.has(cell)) bucket.set(cell, label);
          if (this.rowMatchesFiltersForOptions(row, key)) {
            counts.set(cell, (counts.get(cell) || 0) + 1);
          }
        }
        values[key] = Array.from(bucket.entries())
          .map(([value, label]) => {
            const count = counts.get(value) || 0;
            return {
              value,
              label,
              count,
              available: count > 0
            };
          })
          .sort((a, b) => a.label.localeCompare(b.label, "ko"));
      }
      return values;
    },
    filteredRows() {
      return this.sortedRows.filter((row) => {
        if (this.hideEmptyRows) {
          const hasEmpty = this.visibleColumns.some((col) => {
            const cell = (row[col.index] ?? "").toString().trim();
            return cell.length === 0 && col.normalized !== normalizeColumn("전세갯수");
          });
          if (hasEmpty) return false;
        }
        for (const col of this.visibleColumns) {
          const key = col.normalized;
          const selected = this.filters[key];
          if (!selected) continue;
          const cell = (row[col.index] ?? "").toString().trim();
          if (!selected.includes(cell)) return false;
        }

        for (const col of this.visibleColumns) {
          if (!col.numeric) continue;
          const activeFilters = this.activeNumericFilters(col);
          if (!activeFilters.length) continue;
          const cellValue = parseNumber(row[col.index]);
          if (cellValue === null) return false;
          for (const filter of activeFilters) {
            const target = parseNumber(filter.value);
            if (target === null) continue;
            if (!this.compareNumeric(cellValue, target, filter.op)) return false;
          }
        }

        return true;
      });
    },
    finalRows() {
      const rows = this.filteredRows.slice();
      if (this.sortKey === null) return rows;
      const dir = this.sortDir === "asc" ? 1 : -1;
      return rows.sort((a, b) => {
        const left = (a[this.sortKey] ?? "").toString().trim();
        const right = (b[this.sortKey] ?? "").toString().trim();
        const leftNum = parseNumber(left);
        const rightNum = parseNumber(right);
        if (leftNum !== null && rightNum !== null) {
          return (leftNum - rightNum) * dir;
        }
        return left.localeCompare(right, "ko") * dir;
      });
    },
    visibleRows() {
      return this.finalRows.map((row) =>
        this.visibleColumns.map((col) => row[col.index] ?? "")
      );
    },
    topRegion() {
      const pos = this.visibleColumns.findIndex(c => c.normalized === normalizeColumn("지역구"));
      if (pos < 0 || !this.visibleRows.length) return "—";
      const counts = {};
      for (const row of this.visibleRows) {
        const val = (row[pos] || "").trim();
        if (val) counts[val] = (counts[val] || 0) + 1;
      }
      let top = "—", topCount = 0;
      for (const [k, v] of Object.entries(counts)) {
        if (v > topCount) { topCount = v; top = k; }
      }
      return top;
    },
    avgJeonseRate() {
      const pos = this.visibleColumns.findIndex(c => c.normalized === normalizeColumn("전세가율"));
      if (pos < 0 || !this.visibleRows.length) return "—";
      const nums = this.visibleRows.map(r => parseNumber(r[pos])).filter(v => v !== null);
      if (!nums.length) return "—";
      const avg = nums.reduce((s, v) => s + v, 0) / nums.length;
      return avg.toFixed(1) + "%";
    },
    avgGap() {
      const pos = this.visibleColumns.findIndex(c => c.normalized === normalizeColumn("투자금(매-전)"));
      if (pos < 0 || !this.visibleRows.length) return "—";
      const nums = this.visibleRows.map(r => parseNumber(r[pos])).filter(v => v !== null);
      if (!nums.length) return "—";
      const avg = nums.reduce((s, v) => s + v, 0) / nums.length;
      return avg.toFixed(1) + "억";
    },
    avgSalePrice() {
      const pos = this.visibleColumns.findIndex(c => c.normalized === normalizeColumn("매매가"));
      if (pos < 0 || !this.visibleRows.length) return "—";
      const nums = this.visibleRows.map(r => parseNumber(r[pos])).filter(v => v !== null);
      if (!nums.length) return "—";
      const avg = nums.reduce((s, v) => s + v, 0) / nums.length;
      return avg.toFixed(1) + "억";
    },
    hasAnyFilter() {
      if (this.hideEmptyRows) return true;
      if (Object.keys(this.filters).length > 0) return true;
      return Object.values(this.numericFilters).some(rows =>
        rows.some(r => r.op && (r.value || "").toString().trim())
      );
    },
    filterChips() {
      const chipDefs = [
        { label: "평형", colName: "공급평형" },
        { label: "전세가율", colName: "전세가율" },
        { label: "지역구", colName: "지역구" }
      ];
      return chipDefs.map(({ label, colName }) => {
        const col = this.visibleColumns.find(c => c.normalized === normalizeColumn(colName));
        return { name: label, col: col || null };
      }).filter(c => c.col);
    },
    mobileCards() {
      const p = name => this.visibleColumns.findIndex(c => c.normalized === normalizeColumn(name));
      const namePos    = p("단지명");
      const regionPos  = p("지역구");
      const dongPos    = p("생활권(동)");
      const unitsPos   = p("세대수");
      const salePos    = p("매매가");
      const gapPos     = p("투자금(매-전)");
      const ratePos    = p("전세가율");
      const sizePos    = p("공급평형");
      const builtPos   = p("준공년월");
      const updatedPos = p("최근수정일");
      return this.visibleRows.map(row => ({
        name:       namePos    >= 0 ? row[namePos]    : "",
        region:     regionPos  >= 0 ? row[regionPos]  : "",
        dong:       dongPos    >= 0 ? row[dongPos]    : "",
        units:      unitsPos   >= 0 ? row[unitsPos]   : "",
        salePrice:  salePos    >= 0 ? row[salePos]    : "",
        gap:        gapPos     >= 0 ? row[gapPos]     : "",
        jeonseRate: ratePos    >= 0 ? row[ratePos]    : "",
        size:       sizePos    >= 0 ? row[sizePos]    : "",
        builtYear:  builtPos   >= 0 ? row[builtPos]   : "",
        updatedAt:  updatedPos >= 0 ? row[updatedPos] : "",
      }));
    }
  },
  methods: {
    rowMatchesFiltersForOptions(row, excludeKey) {
      if (this.hideEmptyRows) {
        const hasEmpty = this.visibleColumns.some((col) => {
          const cell = (row[col.index] ?? "").toString().trim();
          return cell.length === 0 && col.normalized !== normalizeColumn("전세갯수");
        });
        if (hasEmpty) return false;
      }

      for (const col of this.visibleColumns) {
        const key = col.normalized;
        if (key === excludeKey) continue;
        const selected = this.filters[key];
        if (!selected) continue;
        const cell = (row[col.index] ?? "").toString().trim();
        if (!selected.includes(cell)) return false;
      }

      for (const col of this.visibleColumns) {
        if (!col.numeric) continue;
        const key = col.normalized;
        if (key === excludeKey) continue;
        const activeFilters = this.activeNumericFilters(col);
        if (!activeFilters.length) continue;
        const cellValue = parseNumber(row[col.index]);
        if (cellValue === null) return false;
        for (const filter of activeFilters) {
          const target = parseNumber(filter.value);
          if (target === null) continue;
          if (!this.compareNumeric(cellValue, target, filter.op)) return false;
        }
      }

      return true;
    },
    syncFiltersToAvailableOptions() {
      // Preserve user-selected filters even when another filter temporarily
      // makes their values unavailable. Option availability is represented by
      // columnValues().available/count instead of mutating filter state.
    },
    filterKey(col) {
      return col.normalized;
    },
    columnValuesFor(col) {
      return this.columnValues[this.filterKey(col)] || [];
    },
    filterOptionsFor(col) {
      const options = this.columnValuesFor(col);
      if (col.normalized !== normalizeColumn("생활권(동)")) return options;
      const selected = this.filters[this.filterKey(col)];
      return options.filter(
        (item) => item.available || (Array.isArray(selected) && selected.includes(item.value))
      );
    },
    isFilterActive(col) {
      const key = this.filterKey(col);
      return Array.isArray(this.filters[key]) || (col.numeric && this.hasActiveNumericFilters(col));
    },
    ensureNumericFilterState(col) {
      const key = this.filterKey(col);
      if (!this.numericFilters[key]) {
        this.numericFilters[key] = [
          { op: "", value: "" },
          { op: "", value: "" }
        ];
      }
      return this.numericFilters[key];
    },
    numericFilterState(col) {
      return this.numericFilters[this.filterKey(col)] || [
        { op: "", value: "" },
        { op: "", value: "" }
      ];
    },
    activeNumericFilters(col) {
      const state = this.numericFilters[this.filterKey(col)];
      if (!state) return [];
      return state.filter((row) => this.isNumericRowActive(row));
    },
    hasActiveNumericFilters(col) {
      return this.activeNumericFilters(col).length > 0;
    },
    isNumericRowActive(row) {
      if (!row || !row.op) return false;
      const value = (row.value ?? "").toString().trim();
      if (!value) return false;
      return parseNumber(value) !== null;
    },
    showSecondNumericRow(col) {
      const [first, second] = this.numericFilterState(col);
      return this.isNumericRowActive(first) || !!second?.op || !!second?.value;
    },
    handleNumericOpChange(col, index, event) {
      const state = this.ensureNumericFilterState(col);
      const op = event.target.value;
      state[index].op = op;
      if (!op) {
        state[index].value = "";
        if (index === 0) {
          state[1] = { op: "", value: "" };
        }
      }
      if (op) {
        this.$nextTick(() => {
          const row = event.target.closest(".numeric-row");
          const input = row ? row.querySelector("input") : null;
          if (input) input.focus();
          this.repositionOpenFilterMenu();
        });
      }
      this.syncFiltersToAvailableOptions();
    },
    handleNumericValueInput(col, index, event) {
      const state = this.ensureNumericFilterState(col);
      state[index].value = event.target.value;
      if (index === 0 && !state[index].value.toString().trim()) {
        state[1] = { op: "", value: "" };
      }
      this.syncFiltersToAvailableOptions();
    },
    clearNumericFilters(col) {
      const key = this.filterKey(col);
      this.numericFilters[key] = [
        { op: "", value: "" },
        { op: "", value: "" }
      ];
      this.syncFiltersToAvailableOptions();
    },
    compareNumeric(left, right, op) {
      switch (op) {
        case "gt":
          return left > right;
        case "lt":
          return left < right;
        case "gte":
          return left >= right;
        case "lte":
          return left <= right;
        default:
          return true;
      }
    },
    isAllSelected(col) {
      const key = this.filterKey(col);
      const values = this.columnValuesFor(col).map((item) => item.value);
      const selected = this.filters[key];
      return !selected || selected.length === values.length;
    },
    isValueChecked(col, value) {
      const selected = this.filters[this.filterKey(col)];
      if (!selected) return true;
      return selected.includes(value);
    },
    isOptionDisabled(col, item) {
      return !item.available && !this.isValueChecked(col, item.value);
    },
    toggleAll(col, event) {
      const checked = event.target.checked;
      const key = this.filterKey(col);
      if (checked) {
        delete this.filters[key];
      } else {
        this.filters[key] = [];
      }
      this.syncFiltersToAvailableOptions();
    },
    toggleValue(col, value) {
      const key = this.filterKey(col);
      const values = this.filterOptionsFor(col).map((item) => item.value);
      const valueSet = new Set(values);
      const current = this.filters[key]
        ? this.filters[key].filter((item) => valueSet.has(item))
        : [...values];
      const idx = current.indexOf(value);
      if (idx >= 0) current.splice(idx, 1);
      else current.push(value);
      if (current.length === values.length) delete this.filters[key];
      else this.filters[key] = current;
      this.syncFiltersToAvailableOptions();
    },
    toggleFilterMenu(col, event) {
      this.syncFiltersToAvailableOptions();
      const nextKey = this.openFilterKey === col.index ? null : col.index;
      this.openFilterKey = nextKey;
      if (nextKey === null) {
        this.filterMenuStyle = {};
        return;
      }
      if (col.numeric) {
        this.ensureNumericFilterState(col);
      }
      this.adjustFilterMenuPosition(col, event);
    },
    repositionOpenFilterMenu() {
      if (this.openFilterKey === null) return;
      const col = this.visibleColumns.find((item) => item.index === this.openFilterKey);
      if (!col) return;
      this.adjustFilterMenuPosition(col);
    },
    adjustFilterMenuPosition(col, event) {
      this.$nextTick(() => {
        const root =
          this.$el && typeof this.$el.querySelector === "function" ? this.$el : document;
        const menu = root.querySelector(".filter-menu.is-open");
        if (!menu) return;
        const anchor =
          event?.currentTarget ||
          root.querySelector(`th[data-col-index="${col.index}"] .col-title`);
        if (!anchor) return;

        const anchorRect = anchor.getBoundingClientRect();
        const padding = 8;
        let left = anchorRect.left;
        let top = anchorRect.bottom + 6;
        this.filterMenuStyle = {
          left: `${left}px`,
          top: `${top}px`
        };

        requestAnimationFrame(() => {
          const rect = menu.getBoundingClientRect();
          if (rect.right > window.innerWidth - padding) {
            left -= rect.right - (window.innerWidth - padding);
          }
          if (left < padding) {
            left = padding;
          }

          if (rect.height >= window.innerHeight - padding * 2) {
            top = padding;
          } else if (top + rect.height > window.innerHeight - padding) {
            top = window.innerHeight - padding - rect.height;
          }
          if (top < padding) {
            top = padding;
          }

          this.filterMenuStyle = {
            left: `${left}px`,
            top: `${top}px`
          };
        });
      });
    },
    toggleSort(col) {
      if (this.sortKey === col.index) {
        this.sortDir = this.sortDir === "asc" ? "desc" : "asc";
      } else {
        this.sortKey = col.index;
        this.sortDir = "desc";
      }
    },
    closeFilterMenu(event) {
      if (!this.$el.contains(event.target)) {
        this.openFilterKey = null;
        this.filterMenuStyle = {};
      }
    },
    sortIcon(col) {
      if (this.sortKey !== col.index) return "▲";
      return this.sortDir === "asc" ? "▲" : "▼";
    },
    columnStyle(col) {
      const normalized = col.normalized;
      const isCompact = this.viewportWidth <= 720;
      const isTiny = this.viewportWidth <= 480;
      if (normalized === normalizeColumn("단지명")) {
        const width = isCompact ? (isTiny ? "170px" : "190px") : "250px";
        return { width, minWidth: width };
      }
      if (normalized === normalizeColumn("최근수정일")) {
        const width = isCompact ? (isTiny ? "120px" : "140px") : "180px";
        return { width, minWidth: width };
      }
      if (
        normalized === normalizeColumn("지역구") ||
        normalized === normalizeColumn("생활권(동)")
      ) {
        const width = isCompact ? (isTiny ? "110px" : "120px") : "150px";
        return { width, minWidth: width };
      }
      if (normalized === normalizeColumn("준공년월")) {
        const width = isCompact ? (isTiny ? "95px" : "105px") : "125px";
        return { width, minWidth: width };
      }
      if (
        normalized === normalizeColumn("세대수") ||
        normalized === normalizeColumn("공급평형") ||
        normalized === normalizeColumn("전용면적") ||
        normalized === normalizeColumn("전세갯수")
      ) {
        const width = isCompact ? (isTiny ? "90px" : "100px") : "115px";
        return { width, minWidth: width };
      }
      if (
        normalized === normalizeColumn("매매가") ||
        normalized === normalizeColumn("전세가") ||
        normalized === normalizeColumn("전세가율")
      ) {
        const width = isCompact ? (isTiny ? "90px" : "100px") : "120px";
        return { width, minWidth: width };
      }
      if (
        normalized === normalizeColumn("투자금") ||
        normalized === normalizeColumn("투자금(매-전)") ||
        normalized === normalizeColumn("투자금(대출60%)") ||
        normalized === normalizeColumn("투자금(대출40%)")
      ) {
        const width = isCompact ? (isTiny ? "95px" : "105px") : "125px";
        return { width, minWidth: width };
      }
      if (isCompact) {
        const width = isTiny ? "96px" : "110px";
        return { width, minWidth: width };
      }
      return {};
    },
    updateViewportWidth() {
      this.viewportWidth = window.innerWidth;
      this.repositionOpenFilterMenu();
    },
    resetFilters() {
      this.filters = {};
      this.numericFilters = {};
      this.openFilterKey = null;
      this.filterMenuStyle = {};
    },
    resetAll() {
      this.resetFilters();
      this.hideEmptyRows = false;
    },
    openChipFilter(chip, event) {
      if (chip && chip.col) this.toggleFilterMenu(chip.col, event);
    },
    toggleHideEmptyRows() {
      this.hideEmptyRows = !this.hideEmptyRows;
    },
    setMobileViewMode(mode) {
      if (mode !== "table" && mode !== "card") {
        this.mobileViewMode = "card";
        return;
      }
      this.mobileViewMode = mode;
      this.openFilterKey = null;
      this.filterMenuStyle = {};
    },
    tdClass(col) {
      if (!col) return "";
      const n = col.normalized;
      if (n === "최근수정일") return "cell-date";
      if (n === "지역구") return "cell-region";
      if (n === "단지명") return "cell-name";
      if (n === "준공년월" || n === "공급평형" || n === "공급평형" ) return "cell-center";
      if (n === "전용면적") return "cell-center";
      if (n === "세대수") return "cell-right";
      if (n === "전세갯수") return "cell-count";
      if (n === "매매가") return "cell-sale cell-right";
      if (n === "전세가") return "cell-jeonse cell-right";
      if (n === "전세가율") return "cell-rate";
      if (n === "투자금(매-전)") return "cell-gap cell-right";
      if (n === "투자금(대출60%)" || n === "투자금(대출40%)") return "cell-invest cell-right";
      return "";
    },
    exportXlsx() {
      if (!window.XLSX) {
        alert("xlsx 라이브러리를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
        return;
      }
      if (!this.visibleRows.length) {
        alert("내보낼 데이터가 없습니다.");
        return;
      }
      const sheetRows = [this.visibleHeaderRow, ...this.visibleRows];
      const sheet = window.XLSX.utils.aoa_to_sheet(sheetRows);
      const workbook = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(workbook, sheet, "AptViewer");
      const now = new Date();
      const stamp = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
        "-",
        String(now.getHours()).padStart(2, "0"),
        String(now.getMinutes()).padStart(2, "0")
      ].join("");
      window.XLSX.writeFile(workbook, `aptviewer-export-${stamp}.xlsx`);
    }
  },
  async mounted() {
    if (this.mobileViewMode !== "table" && this.mobileViewMode !== "card") {
      this.mobileViewMode = "card";
    }
    document.addEventListener("click", this.closeFilterMenu);
    window.addEventListener("resize", this.updateViewportWidth);
    window.addEventListener("scroll", this.repositionOpenFilterMenu, true);
    this.tableWrapEl = this.$el?.querySelector?.(".table-wrap") || null;
    if (this.tableWrapEl) {
      this.tableWrapEl.addEventListener("scroll", this.repositionOpenFilterMenu);
    }
    const url = buildCsvUrl();
    if (!url) {
      this.statusMessage = "CSV URL 또는 SHEET_ID를 설정해주세요.";
      return;
    }

    try {
      const csv = await fetch(url).then((r) => r.text());
      const parsed = Papa.parse(csv, { skipEmptyLines: true });
      const cleaned = (parsed.data || [])
        .map((row) => row.map((cell) => (cell ?? "").toString().trim()))
        .filter((row) => row.some((cell) => cell.length > 0));

      const baseLength = Math.max(
        18,
        ...cleaned.map((row) => row.length)
      );
      this.rawRows = cleaned.map((row) => {
        const padded = row.slice();
        while (padded.length < baseLength) padded.push("");
        return padded;
      });

      const computedNames = [
        "투자금(대출60%)",
        "투자금(대출40%)"
      ];
      const computedNormalized = computedNames.map(normalizeColumn);
      const headerRow = this.rawRows[1] || [];
      const saleIndex = headerRow.findIndex(
        (name) => normalizeColumn(name) === normalizeColumn("매매가")
      );
      const investIndex = headerRow.findIndex(
        (name) => normalizeColumn(name) === normalizeColumn("투자금")
      );
      if (investIndex >= 0) {
        headerRow[investIndex] = "투자금(매-전)";
        const insertAt = investIndex + 1;
        headerRow.splice(insertAt, 0, ...computedNames);
        if (this.rawRows[0]) {
          this.rawRows[0].splice(insertAt, 0, "", "");
        }
        for (const row of this.rawRows.slice(2)) {
          const saleValue = saleIndex >= 0 ? parseNumber(row[saleIndex]) : null;
          const loan60 = saleValue === null ? "" : Math.round(saleValue * 0.4);
          const loan40 = saleValue === null ? "" : Math.round(saleValue * 0.6);
          row.splice(insertAt, 0, loan60, loan40);
        }
      }

      const keyIndex = headerRow.findIndex(
        (name) => normalizeColumn(name) === normalizeColumn("단지접근키")
      );
      if (keyIndex >= 0) {
        const infoIndexes = headerRow
          .map((name, index) => ({
            index,
            group: getGroupTitle(name),
            normalized: normalizeColumn(name)
          }))
          .filter(
            (col) =>
              (col.group === "단지정보" || col.group === "시세") &&
              !HIDDEN_COLUMNS.has(col.normalized) &&
              !computedNormalized.includes(col.normalized)
          )
          .map((col) => col.index);

        const deduped = new Map();
        for (const row of this.rawRows.slice(2)) {
          const key = (row[keyIndex] ?? "").toString().trim();
          if (!key) continue;
          const filledCount = infoIndexes.reduce((count, idx) => {
            const cell = (row[idx] ?? "").toString().trim();
            return cell.length > 0 ? count + 1 : count;
          }, 0);
          const existing = deduped.get(key);
          if (!existing || filledCount > existing.filledCount) {
            deduped.set(key, { row, filledCount });
          }
        }
        this.rawRows = [this.rawRows[0], this.rawRows[1], ...Array.from(deduped.values()).map((v) => v.row)];
      }

      this.statusMessage = `총 ${Math.max(this.rawRows.length - 2, 0)}건 로드됨`;
    } catch (err) {
      console.error("Failed to load data:", err);
      this.statusMessage = "데이터 로드 실패. 스프레드시트 공개 설정을 확인해주세요.";
    }
  },
  beforeUnmount() {
    document.removeEventListener("click", this.closeFilterMenu);
    window.removeEventListener("resize", this.updateViewportWidth);
    window.removeEventListener("scroll", this.repositionOpenFilterMenu, true);
    if (this.tableWrapEl) {
      this.tableWrapEl.removeEventListener("scroll", this.repositionOpenFilterMenu);
    }
  }
}).mount("#app");
