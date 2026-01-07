window.AptViewerConfig = (() => {
  const CSV_URL = ""; // 전체 CSV URL을 알고 있다면 여기에 입력하세요.
  const SHEET_ID = "14_LmYmNlC6pTaHo6nCr292XhSnImzN-G5yef8EUUGC4"; // 스프레드시트 ID
  const SHEET_GID = "0"; // summary 시트 gid (기본 첫 번째 시트)

  const REGION_IDX = 1;

  const normalizeColumn = (value) => (value || "").toString().replace(/\s+/g, "");

  const HIDDEN_COLUMNS = new Set(
    [
      "최근수정일",
      "단지접근키",
      "구조",
      "전고점",
      "전고점시기",
      "고점대비하락률"
    ].map(normalizeColumn)
  );

  const COLUMN_GROUPS = [
    {
      title: "단지정보",
      columns: [
        "최근수정일",
        "지역구",
        "생활권(동)",
        "단지명",
        "준공년월",
        "세대수",
        "단지접근키",
        "공급평형",
        "공급 평형",
        "전용면적",
        "전용 면적",
        "구조"
      ]
    },
    { title: "전고점 정보", columns: ["전고점", "전고점 시기", "전고점시기"] },
    {
      title: "시세",
      columns: [
        "매매가",
        "전세가",
        "전세가율",
        "투자금",
        "전세갯수",
        "고점대비하락률"
      ]
    }
  ];

  const getGroupTitle = (name) => {
    const normalized = normalizeColumn(name);
    for (const group of COLUMN_GROUPS) {
      if (group.columns.map(normalizeColumn).includes(normalized)) return group.title;
    }
    return "기타";
  };

  const buildCsvUrl = () => {
    if (CSV_URL) return CSV_URL;
    if (!SHEET_ID) return "";
    return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`;
  };

  const parseNumber = (value) => {
    const cleaned = (value || "").toString().replace(/[^\d.-]/g, "");
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isNaN(parsed) ? null : parsed;
  };

  return {
    CSV_URL,
    SHEET_ID,
    SHEET_GID,
    REGION_IDX,
    normalizeColumn,
    HIDDEN_COLUMNS,
    COLUMN_GROUPS,
    getGroupTitle,
    buildCsvUrl,
    parseNumber
  };
})();
