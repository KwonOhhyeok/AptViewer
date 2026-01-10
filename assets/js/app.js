const {
  REGION_IDX,
  normalizeColumn,
  HIDDEN_COLUMNS,
  COLUMN_GROUPS,
  getGroupTitle,
  buildCsvUrl,
  parseNumber
} = window.AptViewerConfig;

Vue.createApp({
  data() {
    return {
      rawRows: [],
      statusMessage: "데이터를 불러오는 중입니다...",
      filters: {},
      openFilterKey: null,
      sortKey: null,
      sortDir: "asc",
      hideEmptyRows: false
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
      return this.headerRow
        .map((name, index) => ({
          name,
          index,
          group: getGroupTitle(name),
          normalized: normalizeColumn(name)
        }))
        .filter((col) => !HIDDEN_COLUMNS.has(col.normalized));
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
        for (const row of this.tableRows) {
          const cell = (row[col.index] ?? "").toString().trim();
          const label = cell || "(빈값)";
          if (!bucket.has(cell)) bucket.set(cell, label);
        }
        values[key] = Array.from(bucket.entries())
          .map(([value, label]) => ({ value, label }))
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
    }
  },
  methods: {
    filterKey(col) {
      return col.normalized;
    },
    columnValuesFor(col) {
      return this.columnValues[this.filterKey(col)] || [];
    },
    isFilterActive(col) {
      return Array.isArray(this.filters[this.filterKey(col)]);
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
    toggleAll(col, event) {
      const checked = event.target.checked;
      const key = this.filterKey(col);
      if (checked) {
        delete this.filters[key];
      } else {
        this.filters[key] = [];
      }
    },
    toggleValue(col, value) {
      const key = this.filterKey(col);
      const values = this.columnValuesFor(col).map((item) => item.value);
      const current = this.filters[key] ? [...this.filters[key]] : [...values];
      const idx = current.indexOf(value);
      if (idx >= 0) current.splice(idx, 1);
      else current.push(value);
      if (current.length === values.length) delete this.filters[key];
      else this.filters[key] = current;
    },
    toggleFilterMenu(col) {
      this.openFilterKey = this.openFilterKey === col.index ? null : col.index;
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
      if (!this.$el.contains(event.target)) this.openFilterKey = null;
    },
    sortIcon(col) {
      if (this.sortKey !== col.index) return "▲";
      return this.sortDir === "asc" ? "▲" : "▼";
    },
    columnStyle(col) {
      const normalized = col.normalized;
      if (normalized === normalizeColumn("단지명")) {
        return { width: "250px", minWidth: "250px" };
      }
      return {};
    },
    resetFilters() {
      this.filters = {};
      this.openFilterKey = null;
    },
    toggleHideEmptyRows() {
      this.hideEmptyRows = !this.hideEmptyRows;
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
    document.addEventListener("click", this.closeFilterMenu);
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

      this.rawRows = cleaned.map((row) => {
        const padded = row.slice(0, 18);
        while (padded.length < 18) padded.push("");
        return padded;
      });

      const headerRow = this.rawRows[1] || [];
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
              !HIDDEN_COLUMNS.has(col.normalized)
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
  }
}).mount("#app");
