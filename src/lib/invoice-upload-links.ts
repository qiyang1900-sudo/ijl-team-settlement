const INVOICE_UPLOAD_LINKS: Record<string, string> = {
  AXIZ: "https://drive.google.com/drive/folders/1jK37oew87tc1jMDVQuS-W5yEsR0u6q51?usp=sharing",
  AWG: "https://drive.google.com/drive/folders/1SjOAE4smTDOyvpXwo2KpguGGU4HZGApP?usp=drive_link",
  DFM: "https://drive.google.com/drive/folders/15tYxy2Wy1WnSUNawxifmx5-qBwNdAYfx?usp=drive_link",
  FL: "https://drive.google.com/drive/folders/1IZWJeP_8pyEXxLiGPJ00T-6rjZ-Fr9J0?usp=drive_link",
  QTD: "https://drive.google.com/drive/folders/1E8pYrnUX6ykLjJiE1E5plhlRvSPrMgtR?usp=drive_link",
  RC: "https://drive.google.com/drive/folders/1jwo4xLqSxeOodKwg9MEevCvHV8SVjxDK?usp=drive_link",
  SZ: "https://drive.google.com/drive/folders/1NHnv5GU_VseGDdH-B3V7brokVjc4Pkvq?usp=drive_link",
  ZETA: "https://drive.google.com/drive/folders/1rTZ25xTyZdSikYb6REkucNq1wi5Oy952?usp=drive_link",
};

export function getInvoiceUploadUrl(teamCode?: string | null) {
  const normalizedTeamCode = normalizeTeamCode(teamCode);

  return INVOICE_UPLOAD_LINKS[normalizedTeamCode] || "";
}

function normalizeTeamCode(teamCode?: string | null) {
  const compactCode = String(teamCode || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  if (INVOICE_UPLOAD_LINKS[compactCode]) {
    return compactCode;
  }

  if (compactCode.includes("ZETA")) {
    return "ZETA";
  }

  if (compactCode.includes("FENNEL")) {
    return "FL";
  }

  if (compactCode.includes("DETONATION") || compactCode.includes("FOCUSME")) {
    return "DFM";
  }

  if (compactCode.includes("REJECT")) {
    return "RC";
  }

  if (compactCode.includes("SCARZ")) {
    return "SZ";
  }

  return compactCode;
}
