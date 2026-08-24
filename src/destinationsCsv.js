// CSV bulk import for the destinations pool (מאגר יעדים).
// Pure functions only — no React, no Firestore — so the parsing rules stay testable.

// Column schema. `keys` are the accepted header spellings (Hebrew first, then English
// aliases); `field` is the destination field it fills. Order defines the template order.
export const CSV_COLUMNS = [
  { field: "name", header: "שם היעד", keys: ["שם היעד", "שם", "name", "title"], required: true },
  { field: "region", header: "אזור/עיר", keys: ["אזור/עיר", "אזור", "region", "area"] },
  { field: "category", header: "קטגוריה", keys: ["קטגוריה", "category"] },
  { field: "subtype", header: "תת-קטגוריה", keys: ["תת-קטגוריה", "תת קטגוריה", "תת-סוג", "subtype", "type"] },
  { field: "place", header: "מיקום מדויק", keys: ["מיקום מדויק", "מיקום", "כתובת", "place", "address"] },
  { field: "price", header: "מחיר משוער (€)", keys: ["מחיר משוער (€)", "מחיר משוער", "מחיר", "price", "cost"], kind: "number" },
  { field: "costNote", header: "עלות כניסה", keys: ["עלות כניסה", "הערת עלות", "costnote"] },
  { field: "hoursNote", header: "שעות פתיחה", keys: ["שעות פתיחה", "שעות", "hoursnote", "hours"] },
  { field: "ticketsNote", header: "כרטיסים מראש", keys: ["כרטיסים מראש", "כרטיסים", "ticketsnote", "tickets"] },
  { field: "mapsLink", header: "קישור למפות גוגל", keys: ["קישור למפות גוגל", "קישור למפות", "מפות", "mapslink", "maps", "google maps"] },
  { field: "igLink", header: "קישור לאינסטגרם", keys: ["קישור לאינסטגרם", "אינסטגרם", "iglink", "instagram"] },
  { field: "coords", header: "קואורדינטות", keys: ["קואורדינטות", "coords", "coordinates", "lat,lng"] },
  { field: "priority", header: "עדיפות (1-5)", keys: ["עדיפות (1-5)", "עדיפות (1–5)", "עדיפות", "priority"], kind: "number" },
  { field: "notes", header: "הערות", keys: ["הערות", "הערה", "notes", "note"] },
];

const DELIMITERS = [",", ";", "\t"];

// The whole trip lives in a single Firestore document (1 MiB hard limit), so refuse
// absurd files instead of writing a document that can never be saved again.
export const MAX_IMPORT_ROWS = 500;

// Picks the delimiter that appears most often in the header record, ignoring
// occurrences inside quoted cells (a quoted header may itself contain a comma).
export function detectDelimiter(text) {
  const counts = headerDelimiterCounts(String(text || "").replace(/^\ufeff/, ""));
  let best = ",", bestCount = 0;
  for (const d of DELIMITERS) {
    if (counts[d] > bestCount) { best = d; bestCount = counts[d]; }
  }
  return best;
}

function headerDelimiterCounts(text) {
  const counts = { ",": 0, ";": 0, "\t": 0 };
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') { i++; continue; }
      quoted = !quoted;
      continue;
    }
    if (quoted) continue;
    if (ch === "\n" || ch === "\r") break;
    if (ch in counts) counts[ch]++;
  }
  return counts;
}

// RFC4180-ish reader: quoted fields, "" escapes, embedded newlines, CRLF or LF.
export function parseCsv(text, delimiter) {
  const src = String(text || "").replace(/^﻿/, "");
  const d = delimiter || detectDelimiter(src);
  const rows = [];
  let row = [], field = "", quoted = false, started = false;
  const endField = () => { row.push(field); field = ""; };
  const endRow = () => { endField(); rows.push(row); row = []; };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += ch;
      started = true;
      continue;
    }
    if (ch === '"') { quoted = true; started = true; continue; }
    if (ch === d) { endField(); started = true; continue; }
    if (ch === "\r") { if (src[i + 1] === "\n") i++; endRow(); started = false; continue; }
    if (ch === "\n") { endRow(); started = false; continue; }
    field += ch;
    started = true;
  }
  if (started || field !== "" || row.length) endRow();
  return rows.filter((r) => r.some((c) => String(c).trim() !== ""));
}

function normHeader(s) {
  return String(s || "").replace(/^﻿/, "").trim().toLowerCase().replace(/\s+/g, " ");
}

// header cell -> field name, or null when the column isn't recognised.
function fieldForHeader(cell) {
  const n = normHeader(cell);
  if (!n) return null;
  for (const col of CSV_COLUMNS) {
    if (col.keys.some((k) => normHeader(k) === n)) return col.field;
  }
  return null;
}

function clampPriority(raw) {
  const n = Number(String(raw).replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(n) || n === 0) return null;
  return Math.max(1, Math.min(5, Math.round(n)));
}

// "1.234,50 €" / "€12.5" / "12,5" -> number. Empty or unparsable -> 0.
function parsePrice(raw) {
  let s = String(raw || "").replace(/[^\d.,-]/g, "").trim();
  if (!s) return 0;
  const lastComma = s.lastIndexOf(","), lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    // the right-most separator is the decimal one
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma > -1) {
    s = s.split(",").length > 2 ? s.replace(/,/g, "") : s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

const normName = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

function matchCategory(raw, knownCategories) {
  const v = String(raw || "").trim();
  if (!v) return { value: "" };
  const hit = knownCategories.find((c) => normName(c) === normName(v));
  if (hit) return { value: hit };
  return { value: "", warning: `קטגוריה לא מזוהה: "${v}" — היעד ייובא בלי קטגוריה` };
}

/**
 * Parses a destinations CSV into preview rows.
 *
 * @param text            raw file contents
 * @param existingNames   names already in the pool (for duplicate flagging)
 * @param knownCategories the app's destination categories
 * @param parseCoords     coordinate parser (shared with the map)
 * @returns {{ ok, error, delimiter, unknownColumns, missingColumns, rows }}
 *          rows: { line, name, status: "new"|"duplicate"|"error", messages[], dest }
 */
export function parseDestinationsCsv(text, { existingNames = [], knownCategories = [], parseCoords = () => null } = {}) {
  const raw = String(text || "").trim();
  if (!raw) return { ok: false, error: "הקובץ ריק.", rows: [] };

  const delimiter = detectDelimiter(raw);
  const table = parseCsv(raw, delimiter);
  if (table.length === 0) return { ok: false, error: "הקובץ ריק.", rows: [] };

  const headerCells = table[0];
  const map = headerCells.map(fieldForHeader);
  const unknownColumns = headerCells.filter((c, i) => map[i] === null && String(c).trim() !== "");
  if (!map.includes("name")) {
    return {
      ok: false,
      error: 'לא נמצאה עמודת "שם היעד". הורידו את קובץ התבנית ושמרו על שורת הכותרות.',
      rows: [], delimiter, unknownColumns,
    };
  }
  if (table.length === 1) {
    return { ok: false, error: "הקובץ מכיל רק שורת כותרות, בלי יעדים.", rows: [], delimiter, unknownColumns };
  }
  if (table.length - 1 > MAX_IMPORT_ROWS) {
    return {
      ok: false,
      error: `בקובץ ${table.length - 1} שורות — אפשר לייבא עד ${MAX_IMPORT_ROWS} יעדים בפעם אחת. פצלו את הקובץ.`,
      rows: [], delimiter, unknownColumns,
    };
  }

  const present = new Set(map.filter(Boolean));
  const missingColumns = CSV_COLUMNS.filter((c) => !present.has(c.field)).map((c) => c.header);

  const seen = new Set(existingNames.map(normName));
  const rows = [];
  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    const values = {};
    map.forEach((field, i) => { if (field) values[field] = (cells[i] ?? "").trim(); });

    const line = r + 1; // 1-based line number as seen in a spreadsheet
    const name = values.name || "";
    const messages = [];

    if (!name) {
      rows.push({ line, name: "", status: "error", messages: ["חסר שם יעד — השורה תדולג"], dest: null });
      continue;
    }

    if (cells.length > map.length) {
      messages.push("בשורה יש יותר עמודות מהכותרת — אם יש פסיק בתוך שדה, עטפו אותו במרכאות");
    }

    const cat = matchCategory(values.category, knownCategories);
    if (cat.warning) messages.push(cat.warning);

    const priority = clampPriority(values.priority);
    if (values.priority && priority == null) messages.push(`עדיפות לא תקינה: "${values.priority}" — נקבע 3`);

    const coordsText = values.coords || "";
    let coords = coordsText ? parseCoords(coordsText) : null;
    if (coordsText && !coords) messages.push(`קואורדינטות לא תקינות: "${coordsText}" — יימצאו לפי שם`);
    if (!coords && values.mapsLink) coords = parseCoords(values.mapsLink);

    const dest = {
      name,
      region: values.region || "",
      category: cat.value,
      subtype: values.subtype || "",
      place: values.place || "",
      price: parsePrice(values.price),
      costNote: values.costNote || "",
      hoursNote: values.hoursNote || "",
      ticketsNote: values.ticketsNote || "",
      mapsLink: values.mapsLink || "",
      igLink: values.igLink || "",
      priority: priority == null ? 3 : priority,
      notes: values.notes || "",
      lat: coords ? coords.lat : null,
      lng: coords ? coords.lng : null,
    };

    const key = normName(name);
    const duplicate = seen.has(key);
    if (duplicate) messages.push("יעד בשם הזה כבר קיים — לא ייובא שוב");
    else seen.add(key);

    rows.push({ line, name, status: duplicate ? "duplicate" : "new", messages, dest });
  }

  return { ok: true, error: null, delimiter, unknownColumns, missingColumns, rows };
}

const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

// Template file: header row + two filled example rows + one blank row to type into.
export function destinationsCsvTemplate(knownCategories = []) {
  const header = CSV_COLUMNS.map((c) => c.header);
  const examples = [
    {
      name: "אגם מורסקיה אוקו", region: "זקופנה", category: knownCategories[1] || "", subtype: "אגם",
      place: "Morskie Oko, Tatra National Park", price: "5", costNote: "כניסה לפארק ~5€",
      hoursNote: "24/7", ticketsNote: "לא נדרש", mapsLink: "https://maps.google.com/?q=49.2011,20.0714",
      igLink: "", coords: "49.2011, 20.0714", priority: "5", notes: "לצאת מוקדם, חניה מתמלאת",
    },
    {
      name: "טטרלנד", region: "טטרנסקה לומניצה", category: knownCategories[2] || "", subtype: "פארק מים",
      place: "Tatralandia, Liptovský Mikuláš", price: "35", costNote: "כרטיס יום",
      hoursNote: "10:00-20:00", ticketsNote: "מומלץ מראש", mapsLink: "", igLink: "",
      coords: "", priority: "4", notes: "",
    },
  ];
  const rows = examples.map((ex) => CSV_COLUMNS.map((c) => csvCell(ex[c.field] ?? "")));
  const blank = CSV_COLUMNS.map(() => csvCell(""));
  return "﻿" + [header.map(csvCell), ...rows, blank].map((r) => r.join(",")).join("\r\n") + "\r\n";
}
