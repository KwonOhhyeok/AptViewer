const CSV_URL = ""; // 전체 CSV URL을 알고 있다면 여기에 입력하세요.
const SHEET_ID = "14_LmYmNlC6pTaHo6nCr292XhSnImzN-G5yef8EUUGC4"; // 스프레드시트 ID
const SHEET_GID = "0"; // summary 시트 gid (기본 첫 번째 시트)

const REGION_IDX = 1;

const buildCsvUrl = () => {
  if (CSV_URL) return CSV_URL;
  if (!SHEET_ID) return "";
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`;
};

Vue.createApp({
  data() {
    return {
      rawRows: [],
      statusMessage: "데이터를 불러오는 중입니다..."
    };
  },
  computed: {
    headerRow() {
      return this.rawRows[1] || [];
    },
    tableRows() {
      return this.rawRows.slice(2);
    },
    sortedRows() {
      const rows = this.tableRows.slice();
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
        return aRegion.localeCompare(bRegion, "ko");
      });
    }
  },
  async mounted() {
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

      this.statusMessage = `총 ${Math.max(this.rawRows.length - 2, 0)}건 로드됨`;
    } catch (err) {
      console.error("Failed to load data:", err);
      this.statusMessage = "데이터 로드 실패. 스프레드시트 공개 설정을 확인해주세요.";
    }
  }
}).mount("#app");
