import { useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { ChevronDown, ChevronUp, Plus, Pencil, Trash2, Download, X, Check } from "lucide-react";
import DestinationMap, { parseCoords } from "./DestinationMap.jsx";

const PALETTE = ["#FF6935", "#FEC418", "#10BAAE", "#CC427B", "#ED91FB", "#54C242"];
const DEFAULT_CATEGORIES = [
  { id: "cat_stay", name: "לינה", budget: 0 },
  { id: "cat_flights", name: "טיסות", budget: 0 },
  { id: "cat_car", name: "רכב", budget: 0 },
  { id: "cat_attractions", name: "טטרלנד ואטרקציות", budget: 0 },
  { id: "cat_food", name: "אוכל", budget: 0 },
];
const STATUS_LABELS = { planned: "מתוכנן", paid: "שולם" };
const DEST_CATEGORIES = ["מסלול", "טבע ונוף", "אטרקציה", "אוכל", "לינה", "עיירה", "קניות", "אחר"];
// main = map dot / accent; text+bg = soft readable label tint
const DEST_CATEGORY_TONES = {
  "מסלול": { main: "#10BAAE", text: "#0B7A72", bg: "#E3F6F4" },
  "טבע ונוף": { main: "#54C242", text: "#35802A", bg: "#E9F7E4" },
  "אטרקציה": { main: "#ED91FB", text: "#9A3DAC", bg: "#FBEDFE" },
  "אוכל": { main: "#FEC418", text: "#8A6D00", bg: "#FFF3D0" },
  "לינה": { main: "#FF6935", text: "#C2410C", bg: "#FFE9E0" },
  "עיירה": { main: "#FFAE92", text: "#B4502E", bg: "#FFF0EA" },
  "קניות": { main: "#CC427B", text: "#A32B60", bg: "#FBE7F0" },
  "אחר": { main: "#C8C8C8", text: "#5C5C5C", bg: "#F0F1F5" },
};
function destCategoryTone(cat) { return DEST_CATEGORY_TONES[cat] || DEST_CATEGORY_TONES["אחר"]; }
function destCategoryColor(cat) { return destCategoryTone(cat).main; }
const HE_DAYS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];
const REFUND_LABELS = { cancelable: "ניתן לביטול", non_refundable: "ללא החזר", na: "—" };

export function defaultData() {
  return {
    meta: { title: "תקציב הטיול לטטרה", start: "2026-08-24", end: "2026-09-02" },
    exchangeRate: 4.0,
    categories: DEFAULT_CATEGORIES,
    expenses: [],
    destinations: [],
    calendar: {},
  };
}

function genId(p) { return `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }
function fmt(n) { return (Math.round((n || 0) * 100) / 100).toLocaleString("he-IL", { maximumFractionDigits: 2 }); }
function toEUR(a, cur, rate) { return cur === "ILS" ? a / rate : a; }
function addDays(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dateLabel(iso) { const d = new Date(iso + "T00:00:00"); return `${d.getDate()}.${d.getMonth() + 1}`; }
function allDatesBetween(start, end) {
  const out = []; let d = start; let guard = 0;
  while (d <= end && guard < 400) { out.push(d); d = addDays(d, 1); guard++; }
  return out;
}
function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function Badge({ children, tone }) {
  const tones = {
    paid: { bg: "#E9F7E4", color: "#3B8F2E", border: "#54C242" },
    planned: { bg: "#FFF3D0", color: "#94740A", border: "#FEC418" },
    cancelable: { bg: "#E7F7F5", color: "#0E8F86", border: "#10BAAE" },
    non_refundable: { bg: "#FBEAF2", color: "#CC427B", border: "#CC427B" },
    na: { bg: "#F0F1F5", color: "#767676", border: "#C8C8C8" },
  };
  const t = tones[tone] || tones.na;
  return (
    <span style={{ background: t.bg, color: t.color, border: `1px solid ${t.border}`, borderRadius: "999px", padding: "2px 9px", fontSize: "11px", fontWeight: 600, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

function ConfirmDialog({ open, title, body, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,15,15,0.45)", zIndex: 60 }} className="flex items-center justify-center p-4" onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#FFFFFF", borderRadius: "18px", maxWidth: "360px" }} className="w-full p-5 shadow-xl">
        <h3 style={{ color: "#0F0F0F" }} className="font-bold text-base mb-2">{title}</h3>
        <p style={{ color: "#343434" }} className="text-sm mb-5">{body}</p>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} style={{ color: "#343434" }} className="px-4 py-2 rounded-xl text-sm font-medium">ביטול</button>
          <button onClick={onConfirm} style={{ background: "#EA1F33", color: "#fff" }} className="px-4 py-2 rounded-xl text-sm font-semibold">מחיקה</button>
        </div>
      </div>
    </div>
  );
}

function Modal({ open, title, onClose, children }) {
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,15,15,0.45)", zIndex: 50 }} className="flex items-end sm:items-center justify-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#FFFFFF", borderTopLeftRadius: "22px", borderTopRightRadius: "22px", maxHeight: "88vh" }} className="w-full sm:max-w-md sm:rounded-3xl overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 style={{ color: "#0F0F0F" }} className="font-bold text-lg">{title}</h3>
          <button onClick={onClose}><X size={20} color="#767676" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="mb-3">
      <label style={{ color: "#767676" }} className="text-xs font-semibold block mb-1">{label}</label>
      {children}
    </div>
  );
}
const inputStyle = { borderColor: "#E0E3EA", color: "#0F0F0F" };
const inputClass = "w-full border rounded-xl p-3 text-sm";

export default function TripPlanner({ data, persist, error, onSignOut, userEmail }) {
  const [expandedCat, setExpandedCat] = useState({});
  const [displayCurrency, setDisplayCurrency] = useState("EUR");
  const [editingRate, setEditingRate] = useState(false);
  const [rateInput, setRateInput] = useState("");
  const [expenseSheet, setExpenseSheet] = useState(null);
  const [categorySheet, setCategorySheet] = useState(null);
  const [destSheet, setDestSheet] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [destRegionFilter, setDestRegionFilter] = useState("all");
  const [destCatFilter, setDestCatFilter] = useState("all");

  if (!data) {
    return (
      <div style={{ background: "#F2F4F8", minHeight: "100vh" }} className="flex items-center justify-center">
        <p style={{ color: "#343434" }} className="text-sm">טוען…</p>
      </div>
    );
  }

  const { categories, expenses, exchangeRate, destinations, calendar, meta } = data;

  const spentByCategory = {};
  categories.forEach((c) => (spentByCategory[c.id] = 0));
  expenses.forEach((e) => {
    spentByCategory[e.categoryId] = (spentByCategory[e.categoryId] || 0) + toEUR(Number(e.amount) || 0, e.currency, exchangeRate);
  });
  const totalBudget = categories.reduce((s, c) => s + Number(c.budget || 0), 0);
  const totalSpent = Object.values(spentByCategory).reduce((s, v) => s + v, 0);
  const showAmount = (eur) => (displayCurrency === "EUR" ? `€${fmt(eur)}` : `₪${fmt(eur * exchangeRate)}`);

  const pieData = categories
    .filter((c) => spentByCategory[c.id] > 0)
    .map((c, i) => ({ name: c.name, value: spentByCategory[c.id], color: PALETTE[i % PALETTE.length] }));

  const start = new Date(meta.start + "T00:00:00");
  const end = new Date(meta.end + "T00:00:00");
  const daysToTrip = Math.ceil((start - new Date()) / 86400000);
  const nights = Math.round((end - start) / 86400000);
  const tripDates = allDatesBetween(meta.start, meta.end);

  const destPriceByCat = {};
  let destPriceTotal = 0;
  destinations.forEach((d) => {
    const p = Number(d.price) || 0;
    if (p <= 0) return;
    const key = d.category || "ללא קטגוריה";
    destPriceByCat[key] = (destPriceByCat[key] || 0) + p;
    destPriceTotal += p;
  });

  const regions = ["all", ...new Set(destinations.map((d) => d.region).filter(Boolean))];
  const destCats = ["all", ...DEST_CATEGORIES.filter((c) => destinations.some((d) => d.category === c))];
  const filteredDest = destinations.filter(
    (d) => (destRegionFilter === "all" || d.region === destRegionFilter) && (destCatFilter === "all" || d.category === destCatFilter)
  );

  function openNewExpense(categoryId) {
    setExpenseSheet({ id: null, categoryId: categoryId || categories[0]?.id || "", description: "", amount: "", currency: "EUR", date: todayISO(), status: "planned", refundable: "na", notes: "" });
  }
  function saveExpense(form) {
    const clean = { ...form, amount: Number(form.amount) };
    let next;
    if (clean.id) next = { ...data, expenses: expenses.map((e) => (e.id === clean.id ? clean : e)) };
    else { clean.id = genId("exp"); next = { ...data, expenses: [...expenses, clean] }; }
    persist(next); setExpenseSheet(null);
  }
  function deleteExpense(id) { persist({ ...data, expenses: expenses.filter((e) => e.id !== id) }); setConfirmDelete(null); }

  function saveCategory(form) {
    let next;
    if (form.id) next = { ...data, categories: categories.map((c) => (c.id === form.id ? { ...c, name: form.name, budget: Number(form.budget) || 0 } : c)) };
    else next = { ...data, categories: [...categories, { id: genId("cat"), name: form.name, budget: Number(form.budget) || 0 }] };
    persist(next); setCategorySheet(null);
  }
  function deleteCategory(id) {
    persist({ ...data, categories: categories.filter((c) => c.id !== id), expenses: expenses.filter((e) => e.categoryId !== id) });
    setConfirmDelete(null);
  }
  function setCategoryBudget(id, budget) {
    persist({ ...data, categories: categories.map((c) => (c.id === id ? { ...c, budget: Number(budget) || 0 } : c)) });
  }

  function saveDestination(form) {
    let next;
    if (form.id) next = { ...data, destinations: destinations.map((d) => (d.id === form.id ? { ...d, ...form, priority: Number(form.priority) } : d)) };
    else next = { ...data, destinations: [...destinations, { ...form, id: genId("dest"), priority: Number(form.priority) }] };
    persist(next); setDestSheet(null);
  }
  function deleteDestination(id) { persist({ ...data, destinations: destinations.filter((d) => d.id !== id) }); setConfirmDelete(null); }
  function setDestCoords(id, c) {
    persist({ ...data, destinations: destinations.map((d) => (d.id === id ? { ...d, lat: c.lat, lng: c.lng } : d)) });
  }
  function convertToExpense(d) {
    // prefill the expense form; match a budget category by name, else fall back to the first
    const match = (d.category && categories.find((c) => c.name.includes(d.category))) || categories[0];
    setExpenseSheet({ id: null, categoryId: match?.id || "", description: d.name, amount: d.price > 0 ? String(d.price) : "", currency: "EUR", date: todayISO(), status: "planned", refundable: "na", notes: d.region || "" });
  }

  function addToCalendar(destId, date) {
    const dest = destinations.find((d) => d.id === destId);
    const cal = { ...calendar };
    const entry = cal[date] || { locationTag: "", items: [] };
    cal[date] = { ...entry, items: [...entry.items, { id: genId("item"), text: dest.name, destId }] };
    persist({ ...data, calendar: cal });
    setSelectedDate(date);
  }
  function setDayTag(date, tag) {
    const cal = { ...calendar };
    const entry = cal[date] || { locationTag: "", items: [] };
    cal[date] = { ...entry, locationTag: tag };
    persist({ ...data, calendar: cal });
  }
  function addFreeItem(date, text) {
    if (!text.trim()) return;
    const cal = { ...calendar };
    const entry = cal[date] || { locationTag: "", items: [] };
    cal[date] = { ...entry, items: [...entry.items, { id: genId("item"), text: text.trim() }] };
    persist({ ...data, calendar: cal });
  }
  function deleteDayItem(date, itemId) {
    const cal = { ...calendar };
    const entry = cal[date];
    if (!entry) return;
    cal[date] = { ...entry, items: entry.items.filter((i) => i.id !== itemId) };
    persist({ ...data, calendar: cal });
  }

  function saveRate() {
    const r = Number(rateInput);
    if (r > 0) persist({ ...data, exchangeRate: r });
    setEditingRate(false);
  }

  function exportCSV() {
    const header = ["תאריך", "קטגוריה", "תיאור", "סכום", "מטבע", "סטטוס", "מדיניות ביטול", "הערות"];
    const rows = expenses.map((e) => {
      const catName = categories.find((c) => c.id === e.categoryId)?.name || "";
      return [e.date, catName, e.description, e.amount, e.currency, STATUS_LABELS[e.status], REFUND_LABELS[e.refundable], e.notes || ""];
    });
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    downloadBlob("\uFEFF" + csv, "trip-budget-expenses.csv", "text/csv;charset=utf-8;");
  }
  function exportJSON() { downloadBlob(JSON.stringify(data, null, 2), "trip-planner-backup.json", "application/json"); }

  const firstDow = new Date(tripDates[0] + "T00:00:00").getDay();
  const gridStart = addDays(tripDates[0], -firstDow);
  const lastDow = new Date(tripDates[tripDates.length - 1] + "T00:00:00").getDay();
  const gridEnd = addDays(tripDates[tripDates.length - 1], 6 - lastDow);
  const gridDates = allDatesBetween(gridStart, gridEnd);

  const selEntry = selectedDate ? calendar[selectedDate] || { locationTag: "", items: [] } : null;
  const destByRegion = {};
  destinations.forEach((d) => { const r = d.region || "ללא אזור"; (destByRegion[r] = destByRegion[r] || []).push(d); });
  const destDates = {};
  Object.entries(calendar || {}).forEach(([date, e]) =>
    (e.items || []).forEach((it) => { if (it.destId) (destDates[it.destId] = destDates[it.destId] || []).push(date); })
  );
  Object.values(destDates).forEach((a) => a.sort());

  return (
    <div dir="rtl" style={{ background: "#F2F4F8", minHeight: "100vh", fontFamily: "'Heebo', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Rubik:wght@500;600;700&family=Heebo:wght@400;500;600;700&display=swap');`}</style>

      <div style={{ background: "#1E4B3A" }} className="pt-6 pb-4 px-5">
        <h1 style={{ fontFamily: "'Rubik', sans-serif", color: "#FFFFFF" }} className="text-2xl font-bold mb-1">{meta.title}</h1>
        <p style={{ color: "#D6E8DE", unicodeBidi: "isolate", direction: "ltr", display: "inline-block" }} className="text-sm mb-4">{start.getDate()}.{start.getMonth() + 1} – {end.getDate()}.{end.getMonth() + 1}.{end.getFullYear()}</p>

        <div className="flex gap-2 mb-3">
          <div style={{ background: "#FEC418" }} className="flex-1 rounded-2xl p-3">
            <p style={{ color: "#6B5200" }} className="text-xs mb-1">ימים לטיסה</p>
            <p style={{ color: "#0F0F0F" }} className="text-xl font-bold">{daysToTrip > 0 ? daysToTrip : 0}</p>
          </div>
          <div style={{ background: "rgba(255,255,255,0.18)" }} className="flex-1 rounded-2xl p-3">
            <p style={{ color: "#D6E8DE" }} className="text-xs mb-1">משך הטיול</p>
            <p style={{ color: "#fff" }} className="text-xl font-bold">{nights} לילות</p>
          </div>
          <div style={{ background: "rgba(255,255,255,0.18)" }} className="flex-1 rounded-2xl p-3">
            <p style={{ color: "#D6E8DE" }} className="text-xs mb-1">יעדים</p>
            <p style={{ color: "#fff" }} className="text-xl font-bold">{destinations.length}</p>
          </div>
        </div>

        {editingRate ? (
          <div className="flex items-center gap-2">
            <span style={{ color: "#D6E8DE" }} className="text-xs">1€ =</span>
            <input autoFocus value={rateInput} onChange={(e) => setRateInput(e.target.value)} type="number" style={{ width: "70px", background: "rgba(255,255,255,0.28)", color: "#fff" }} className="rounded-lg px-2 py-1 text-xs" />
            <span style={{ color: "#D6E8DE" }} className="text-xs">₪</span>
            <button onClick={saveRate}><Check size={16} color="#FEC418" /></button>
            <button onClick={() => setEditingRate(false)}><X size={16} color="#D6E8DE" /></button>
          </div>
        ) : (
          <button onClick={() => { setRateInput(String(exchangeRate)); setEditingRate(true); }} style={{ color: "#D6E8DE" }} className="text-xs underline decoration-dotted">
            שער חליפין: 1€ = {fmt(exchangeRate)}₪ (לעדכון)
          </button>
        )}

        <div className="flex items-center justify-between mt-2">
          <span style={{ color: "#B9D4C5" }} className="text-[11px]">מחובר/ת כ-{userEmail}</span>
          <button onClick={onSignOut} style={{ color: "#D6E8DE" }} className="text-[11px] underline">התנתקות</button>
        </div>
      </div>

      <div className="px-4 pt-4 pb-28">
        {error && <div style={{ background: "#FBEAF2", color: "#CC427B" }} className="rounded-xl p-3 text-xs mb-4">{error}</div>}

        {/* BUDGET */}
        <div style={{ background: "#FFFFFF" }} className="rounded-2xl p-4 mb-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 style={{ fontFamily: "'Rubik', sans-serif", color: "#0F0F0F" }} className="text-lg font-bold">תקציב</h2>
            <div className="flex gap-1">
              {["EUR", "ILS"].map((cur) => (
                <button key={cur} onClick={() => setDisplayCurrency(cur)} style={{ background: displayCurrency === cur ? "#FF6935" : "#F2F4F8", color: displayCurrency === cur ? "#fff" : "#343434" }} className="px-3 py-1 rounded-full text-xs font-bold">
                  {cur === "EUR" ? "€" : "₪"}
                </button>
              ))}
            </div>
          </div>
          <p style={{ color: "#0F0F0F" }} className="text-2xl font-bold mb-3">
            {showAmount(totalSpent)} <span style={{ color: "#9A9A9A" }} className="text-base font-medium">/ {showAmount(totalBudget)}</span>
          </p>

          {pieData.length > 0 && (
            <div className="flex items-center gap-4 mb-3">
              <div style={{ height: "120px", width: "120px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={35} outerRadius={55} paddingAngle={2}>
                      {pieData.map((entry, i) => <Cell key={i} fill={entry.color} stroke="none" />)}
                    </Pie>
                    <Tooltip formatter={(v) => showAmount(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-col gap-1">
                {pieData.map((e, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs" style={{ color: "#343434" }}>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: e.color, display: "inline-block" }} />
                    {e.name} — {showAmount(e.value)}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {categories.map((c, i) => {
              const spent = spentByCategory[c.id] || 0;
              const budget = Number(c.budget || 0);
              const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : spent > 0 ? 100 : 0;
              const over = budget > 0 ? spent > budget : spent > 0;
              const barColor = over ? "#EA1F33" : PALETTE[i % PALETTE.length];
              const open = !!expandedCat[c.id];
              const catExpenses = expenses.filter((e) => e.categoryId === c.id).sort((a, b) => (a.date < b.date ? 1 : -1));
              return (
                <div key={c.id} style={{ border: "1px solid #E9ECF2" }} className="rounded-xl overflow-hidden">
                  <button onClick={() => setExpandedCat((s) => ({ ...s, [c.id]: !s[c.id] }))} className="w-full text-right p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span style={{ color: "#0F0F0F" }} className="text-sm font-bold">{c.name}</span>
                        <span onClick={(e) => { e.stopPropagation(); setCategorySheet({ id: c.id, name: c.name, budget: String(c.budget) }); }}>
                          <Pencil size={12} color="#9A9A9A" />
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span style={{ color: over ? "#EA1F33" : "#343434" }} className="text-xs font-semibold">{showAmount(spent)} / {showAmount(budget)}</span>
                        {open ? <ChevronUp size={15} color="#767676" /> : <ChevronDown size={15} color="#767676" />}
                      </div>
                    </div>
                    <div style={{ background: "#EEF0F5", height: "7px", borderRadius: "999px", overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: barColor, transition: "width .3s" }} />
                    </div>
                  </button>
                  {open && (
                    <div style={{ borderTop: "1px solid #F0F1F5" }} className="px-3 pb-3">
                      {catExpenses.length === 0 ? (
                        <p style={{ color: "#9A9A9A" }} className="text-xs py-3 text-center">עוד אין הוצאות.</p>
                      ) : (
                        <div className="flex flex-col divide-y" style={{ borderColor: "#F0F1F5" }}>
                          {catExpenses.map((e) => (
                            <div key={e.id} className="py-2.5 flex items-start justify-between gap-2">
                              <button className="text-right flex-1" onClick={() => setExpenseSheet({ ...e, amount: String(e.amount) })}>
                                <p style={{ color: "#0F0F0F" }} className="text-sm font-medium mb-1">{e.description}</p>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <Badge tone={e.status}>{STATUS_LABELS[e.status]}</Badge>
                                  {e.refundable !== "na" && <Badge tone={e.refundable}>{REFUND_LABELS[e.refundable]}</Badge>}
                                  <span style={{ color: "#9A9A9A" }} className="text-[11px]">{dateLabel(e.date)}</span>
                                </div>
                              </button>
                              <div className="flex flex-col items-end gap-1">
                                <span style={{ color: "#0F0F0F" }} className="text-sm font-bold whitespace-nowrap">{e.currency === "EUR" ? "€" : "₪"}{fmt(e.amount)}</span>
                                <button onClick={() => setConfirmDelete({ type: "expense", id: e.id, label: e.description })}><Trash2 size={13} color="#E3A8C4" /></button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => openNewExpense(c.id)} style={{ background: "#F2F4F8", color: "#FF6935" }} className="flex-1 rounded-xl py-2 text-xs font-semibold flex items-center justify-center gap-1">
                          <Plus size={13} /> הוצאה
                        </button>
                        <button onClick={() => setConfirmDelete({ type: "category", id: c.id, label: c.name })} style={{ background: "#FBEAF2", color: "#CC427B" }} className="rounded-xl px-3 py-2 text-xs font-semibold">
                          מחיקת קטגוריה
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <button onClick={() => setCategorySheet("new")} style={{ background: "#fff", border: "1px solid #E0E3EA", color: "#FF6935" }} className="w-full rounded-xl py-2 text-xs font-semibold mt-3">＋ קטגוריה חדשה</button>
          <div className="flex gap-2 mt-3">
            <button onClick={exportCSV} style={{ background: "#fff", border: "1px solid #E0E3EA", color: "#FF6935" }} className="flex-1 rounded-xl py-2 text-xs font-semibold flex items-center justify-center gap-1"><Download size={13} /> CSV</button>
            <button onClick={exportJSON} style={{ background: "#fff", border: "1px solid #E0E3EA", color: "#FF6935" }} className="flex-1 rounded-xl py-2 text-xs font-semibold flex items-center justify-center gap-1"><Download size={13} /> גיבוי JSON</button>
          </div>
        </div>

        {/* DESTINATIONS */}
        <div style={{ background: "#FFFFFF" }} className="rounded-2xl p-4 mb-4 shadow-sm">
          <h2 style={{ fontFamily: "'Rubik', sans-serif", color: "#0F0F0F" }} className="text-lg font-bold mb-3">מאגר יעדים <span style={{ color: "#9A9A9A" }} className="text-sm font-medium">({filteredDest.length})</span></h2>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {destCats.map((c) => {
              const sel = destCatFilter === c;
              const t = destCategoryTone(c);
              const st = c === "all"
                ? { background: sel ? "#0F0F0F" : "#F2F4F8", color: sel ? "#fff" : "#343434" }
                : { background: sel ? t.bg : "#F2F4F8", color: sel ? t.text : "#343434", border: sel ? `1.5px solid ${t.main}` : "1.5px solid transparent" };
              return (
                <button key={c} onClick={() => setDestCatFilter(c)} style={{ ...st, fontWeight: sel ? 700 : 500 }} className="px-3 py-1 rounded-full text-xs">
                  {c === "all" ? "כל הקטגוריות" : c}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {regions.map((r) => (
              <button key={r} onClick={() => setDestRegionFilter(r)} style={{ background: destRegionFilter === r ? "#FF6935" : "#F2F4F8", color: destRegionFilter === r ? "#fff" : "#343434" }} className="px-3 py-1 rounded-full text-xs font-semibold">
                {r === "all" ? "כל האזורים" : r}
              </button>
            ))}
          </div>
          {destinations.length === 0 ? (
            <p style={{ color: "#9A9A9A" }} className="text-xs py-3 text-center">עוד אין יעדים. שלחו לי צילומי מסך או קובץ מהמפה כדי שאייבא, או הוסיפו יעד ראשון.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {filteredDest.map((d) => (
                <div key={d.id} style={{ border: "1px solid #E9ECF2" }} className="rounded-xl p-3 flex items-center justify-between gap-2">
                  <div className="flex-1">
                    <p style={{ color: "#0F0F0F" }} className="text-sm font-bold">{d.name}</p>
                    <div className="flex items-center flex-wrap gap-1.5 mb-1">
                      {d.category && (
                        <span style={{ background: destCategoryTone(d.category).bg, color: destCategoryTone(d.category).text, border: `1px solid ${destCategoryTone(d.category).main}`, borderRadius: "999px", padding: "1px 8px", fontSize: "10px", fontWeight: 700 }}>{d.category}</span>
                      )}
                      <p style={{ color: "#9A9A9A" }} className="text-xs">
                        {[d.subtype, d.place || d.region].filter(Boolean).join(" · ")}{(d.subtype || d.place || d.region) && " · "}<span style={{ color: "#FEC418" }}>{"★".repeat(Math.max(0, Math.min(5, d.priority || 0)))}{"☆".repeat(5 - Math.max(0, Math.min(5, d.priority || 0)))}</span>
                        {Number(d.price) > 0 && <span style={{ color: "#343434", fontWeight: 600 }}> · {showAmount(Number(d.price))}</span>}
                      </p>
                    </div>
                    {(d.costNote || d.ticketsNote || d.hoursNote) && (
                      <div className="flex flex-col gap-0.5 mb-1">
                        {d.costNote && <p style={{ color: "#767676" }} className="text-[11px]">💶 {d.costNote}</p>}
                        {d.hoursNote && <p style={{ color: "#767676" }} className="text-[11px]">🕒 {d.hoursNote}</p>}
                        {d.ticketsNote && <p style={{ color: "#767676" }} className="text-[11px]">🎫 כרטיסים מראש: {d.ticketsNote}</p>}
                      </div>
                    )}
                    {d.notes && (
                      <p style={{ background: "#FFF3D0", color: "#94740A", borderRadius: "8px", padding: "2px 8px", display: "inline-block" }} className="text-[11px] font-semibold mb-1">📝 {d.notes}</p>
                    )}
                    {destDates[d.id]?.length > 0 && (
                      <p style={{ background: "#E3F6F4", color: "#0B7A72", borderRadius: "8px", padding: "2px 8px", display: "inline-block" }} className="text-[11px] font-semibold mb-1 mr-1">📅 ביומן: {destDates[d.id].map(dateLabel).join(", ")}</p>
                    )}
                    <div className="flex gap-3">
                      {d.mapsLink && <a href={d.mapsLink} target="_blank" rel="noreferrer" style={{ color: "#10BAAE" }} className="text-xs underline">מפות</a>}
                      {d.igLink && <a href={d.igLink} target="_blank" rel="noreferrer" style={{ color: "#10BAAE" }} className="text-xs underline">אינסטגרם</a>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <button onClick={() => setDestSheet({ mode: "assign", destId: d.id })} style={{ background: "#FFF3D0", color: "#94740A" }} className="text-[11px] font-semibold px-2.5 py-1 rounded-lg">ליומן</button>
                    <button onClick={() => convertToExpense(d)} style={{ background: "#E7F7F5", color: "#0E8F86" }} className="text-[11px] font-semibold px-2.5 py-1 rounded-lg">המר להוצאה</button>
                    <div className="flex gap-2">
                      <button onClick={() => setDestSheet({ ...d, mode: "edit" })}><Pencil size={13} color="#9A9A9A" /></button>
                      <button onClick={() => setConfirmDelete({ type: "destination", id: d.id, label: d.name })}><Trash2 size={13} color="#E3A8C4" /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {destPriceTotal > 0 && (
            <div style={{ background: "#F2F4F8" }} className="rounded-xl p-3 mt-3">
              <p style={{ color: "#0F0F0F" }} className="text-xs font-bold mb-2">מחירים משוערים לפי קטגוריה</p>
              <div className="flex flex-col gap-1">
                {Object.entries(destPriceByCat).map(([cat, sum]) => (
                  <div key={cat} className="flex items-center justify-between text-xs" style={{ color: "#343434" }}>
                    <span className="flex items-center gap-1.5">
                      <span style={{ width: 8, height: 8, borderRadius: 999, background: destCategoryColor(cat), display: "inline-block" }} />
                      {cat}
                    </span>
                    <span className="font-semibold">{showAmount(sum)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between text-xs font-bold pt-1.5 mt-1" style={{ color: "#0F0F0F", borderTop: "1px solid #E9ECF2" }}>
                  <span>סה"כ</span>
                  <span>{showAmount(destPriceTotal)}</span>
                </div>
              </div>
            </div>
          )}
          <button onClick={() => setDestSheet({ mode: "new", priority: "3" })} style={{ background: "#fff", border: "1px solid #E0E3EA", color: "#FF6935" }} className="w-full rounded-xl py-2 text-xs font-semibold mt-3">＋ יעד חדש</button>
        </div>

        {/* MAP */}
        <div style={{ background: "#FFFFFF" }} className="rounded-2xl p-4 mb-4 shadow-sm">
          <h2 style={{ fontFamily: "'Rubik', sans-serif", color: "#0F0F0F" }} className="text-lg font-bold mb-3">מפת היעדים</h2>
          <DestinationMap destinations={filteredDest} onCoords={setDestCoords} colorFor={destCategoryColor} />
          {(destCatFilter !== "all" || destRegionFilter !== "all") && (
            <p style={{ color: "#9A9A9A" }} className="text-[11px] mt-1.5">המפה מציגה רק את היעדים המסוננים ({filteredDest.length}).</p>
          )}
        </div>

        {/* CALENDAR */}
        <div style={{ background: "#FFFFFF" }} className="rounded-2xl p-4 mb-4 shadow-sm">
          <h2 style={{ fontFamily: "'Rubik', sans-serif", color: "#0F0F0F" }} className="text-lg font-bold mb-3">יומן · מה עושים כל יום</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "5px" }} className="mb-3">
            {HE_DAYS.map((l) => <div key={l} style={{ color: "#9A9A9A" }} className="text-center text-[11px] font-bold">{l}</div>)}
            {gridDates.map((iso) => {
              const inTrip = iso >= meta.start && iso <= meta.end;
              const entry = calendar[iso];
              const dnum = new Date(iso + "T00:00:00").getDate();
              const isSel = selectedDate === iso;
              return (
                <button
                  key={iso}
                  onClick={() => setSelectedDate(iso)}
                  style={{ border: isSel ? "2px solid #FF6935" : "1px solid #E9ECF2", opacity: inTrip ? 1 : 0.35, minHeight: "56px" }}
                  className="rounded-xl p-1.5 text-right text-[11px]"
                >
                  <div style={{ color: "#0F0F0F" }} className="font-extrabold text-sm">{dnum}</div>
                  {entry?.locationTag && <div style={{ background: "#FFF3D0", color: "#94740A", fontSize: "9px" }} className="rounded px-1 mt-0.5 font-bold truncate">{entry.locationTag}</div>}
                  {entry?.items?.length > 0 && (
                    <div className="flex gap-0.5 mt-0.5 flex-wrap items-center">
                      {entry.items.slice(0, 4).map((it) => {
                        const dd = destinations.find((x) => x.id === it.destId);
                        return <span key={it.id} style={{ width: 6, height: 6, borderRadius: 999, background: dd ? destCategoryColor(dd.category) : "#C8C8C8", display: "inline-block" }} />;
                      })}
                      {entry.items.length > 4 && <span style={{ fontSize: "8px", color: "#9A9A9A" }}>+{entry.items.length - 4}</span>}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {selectedDate && (
            <div style={{ background: "#FFF3D0" }} className="rounded-2xl p-4">
              <h3 style={{ color: "#0F0F0F" }} className="text-sm font-bold mb-2">{dateLabel(selectedDate)} · יום {HE_DAYS[new Date(selectedDate + "T00:00:00").getDay()]}</h3>
              <Field label="מיקום/עיר ללינה באותו יום">
                <input defaultValue={selEntry.locationTag} onBlur={(e) => setDayTag(selectedDate, e.target.value)} placeholder="לדוגמה: פופ קוק" style={inputStyle} className={inputClass + " bg-white"} />
              </Field>
              {selEntry.items.length === 0 ? (
                <p style={{ color: "#9A9A9A" }} className="text-xs mb-2">אין עדיין פעילויות ליום הזה.</p>
              ) : (
                <div className="flex flex-col gap-1.5 mb-2">
                  {selEntry.items.map((it) => {
                    const dd = destinations.find((x) => x.id === it.destId);
                    return (
                      <div key={it.id} style={{ background: "#fff" }} className="rounded-lg px-3 py-2 flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5">
                          <span style={{ width: 7, height: 7, borderRadius: 999, background: dd ? destCategoryColor(dd.category) : "#C8C8C8", display: "inline-block", flexShrink: 0 }} />
                          {it.text}
                          {dd?.mapsLink && <a href={dd.mapsLink} target="_blank" rel="noreferrer" style={{ color: "#10BAAE" }} className="underline">מפות</a>}
                        </span>
                        <button onClick={() => deleteDayItem(selectedDate, it.id)}><X size={13} color="#9A9A9A" /></button>
                      </div>
                    );
                  })}
                </div>
              )}
              {destinations.length > 0 && (
                <Field label="הוספת יעד מהמאגר">
                  <select value="" onChange={(e) => { if (e.target.value) { addToCalendar(e.target.value, selectedDate); e.target.value = ""; } }} style={inputStyle} className={inputClass + " bg-white"}>
                    <option value="">בחרו יעד…</option>
                    {Object.entries(destByRegion).map(([r, list]) => (
                      <optgroup key={r} label={r}>
                        {list.map((s) => <option key={s.id} value={s.id}>{s.name}{s.category ? ` (${s.category})` : ""}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </Field>
              )}
              <FreeItemInput onAdd={(text) => addFreeItem(selectedDate, text)} />
            </div>
          )}
        </div>

        <p style={{ color: "#9A9A9A" }} className="text-[11px] text-center">הנתונים משותפים ונשמרים אוטומטית — כל מי שפותח את הקישור הזה רואה ועורך אותם.</p>
      </div>

      <button onClick={() => openNewExpense(null)} style={{ background: "#FEC418", color: "#0F0F0F" }} className="fixed bottom-5 left-5 rounded-full w-14 h-14 shadow-lg flex items-center justify-center">
        <Plus size={26} />
      </button>

      <Modal open={!!expenseSheet} title={expenseSheet?.id ? "עריכת הוצאה" : "הוצאה חדשה"} onClose={() => setExpenseSheet(null)}>
        {expenseSheet && <ExpenseForm categories={categories} initial={expenseSheet} onSave={saveExpense} />}
      </Modal>

      <Modal open={!!categorySheet} title={categorySheet === "new" ? "קטגוריה חדשה" : "עריכת קטגוריה"} onClose={() => setCategorySheet(null)}>
        {categorySheet && <CategoryForm initial={categorySheet === "new" ? { name: "", budget: "" } : categorySheet} onSave={saveCategory} />}
      </Modal>

      <Modal
        open={!!destSheet && destSheet.mode !== "assign"}
        title={destSheet?.mode === "edit" ? "עריכת יעד" : "יעד חדש"}
        onClose={() => setDestSheet(null)}
      >
        {destSheet && destSheet.mode !== "assign" && <DestinationForm initial={destSheet} onSave={saveDestination} />}
      </Modal>

      <Modal open={!!destSheet && destSheet.mode === "assign"} title="הוספה ליומן" onClose={() => setDestSheet(null)}>
        {destSheet?.mode === "assign" && (
          <AssignForm dates={tripDates} onSave={(date) => { addToCalendar(destSheet.destId, date); setDestSheet(null); }} />
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        title={confirmDelete?.type === "expense" ? "מחיקת הוצאה" : confirmDelete?.type === "category" ? "מחיקת קטגוריה" : "מחיקת יעד"}
        body={`למחוק את "${confirmDelete?.label}"? לא ניתן לשחזר.`}
        onConfirm={() => {
          if (confirmDelete.type === "expense") deleteExpense(confirmDelete.id);
          else if (confirmDelete.type === "category") deleteCategory(confirmDelete.id);
          else deleteDestination(confirmDelete.id);
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

function FreeItemInput({ onAdd }) {
  const [val, setVal] = useState("");
  return (
    <div className="flex gap-2">
      <input value={val} onChange={(e) => setVal(e.target.value)} placeholder="הוספת פעילות חופשית…" style={inputStyle} className={inputClass + " bg-white"} />
      <button onClick={() => { onAdd(val); setVal(""); }} style={{ background: "#FF6935", color: "#fff" }} className="rounded-xl px-4 text-sm font-semibold">הוסף</button>
    </div>
  );
}

function ExpenseForm({ categories, initial, onSave }) {
  const [form, setForm] = useState(initial);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const valid = form.categoryId && form.description?.trim() && Number(form.amount) > 0 && form.date;
  return (
    <div>
      <Field label="קטגוריה">
        <select value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)} style={inputStyle} className={inputClass + " bg-white"}>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="תיאור">
        <input value={form.description} onChange={(e) => set("description", e.target.value)} style={inputStyle} className={inputClass} />
      </Field>
      <div className="flex gap-3">
        <div className="flex-1"><Field label="סכום"><input type="number" value={form.amount} onChange={(e) => set("amount", e.target.value)} style={inputStyle} className={inputClass} /></Field></div>
        <div style={{ width: "110px" }}><Field label="מטבע">
          <select value={form.currency} onChange={(e) => set("currency", e.target.value)} style={inputStyle} className={inputClass + " bg-white"}>
            <option value="EUR">EUR €</option><option value="ILS">ILS ₪</option>
          </select>
        </Field></div>
      </div>
      <Field label="תאריך"><input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} style={inputStyle} className={inputClass} /></Field>
      <Field label="סטטוס">
        <div className="flex gap-2">
          {["planned", "paid"].map((s) => (
            <button key={s} onClick={() => set("status", s)} style={{ background: form.status === s ? "#FF6935" : "#F2F4F8", color: form.status === s ? "#fff" : "#343434" }} className="flex-1 rounded-xl py-2 text-sm font-medium">
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </Field>
      <Field label="מדיניות ביטול">
        <div className="flex gap-2">
          {["cancelable", "non_refundable", "na"].map((r) => (
            <button key={r} onClick={() => set("refundable", r)} style={{ background: form.refundable === r ? "#10BAAE" : "#F2F4F8", color: form.refundable === r ? "#fff" : "#343434" }} className="flex-1 rounded-xl py-2 text-xs font-medium">
              {REFUND_LABELS[r]}
            </button>
          ))}
        </div>
      </Field>
      <Field label="הערות"><textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} style={inputStyle} className={inputClass + " resize-none"} /></Field>
      <button disabled={!valid} onClick={() => onSave(form)} style={{ background: valid ? "#FF6935" : "#C8C8C8", color: "#fff" }} className="w-full rounded-xl py-3 mt-1 font-semibold text-sm">שמירה</button>
    </div>
  );
}

function CategoryForm({ initial, onSave }) {
  const [form, setForm] = useState(initial);
  const valid = form.name?.trim().length > 0;
  return (
    <div>
      <Field label="שם הקטגוריה"><input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} style={inputStyle} className={inputClass} /></Field>
      <Field label="תקציב (€)"><input type="number" value={form.budget} onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))} style={inputStyle} className={inputClass} /></Field>
      <button disabled={!valid} onClick={() => onSave({ id: form.id, name: form.name, budget: form.budget })} style={{ background: valid ? "#FF6935" : "#C8C8C8", color: "#fff" }} className="w-full rounded-xl py-3 mt-1 font-semibold text-sm">שמירה</button>
    </div>
  );
}

function DestinationForm({ initial, onSave }) {
  const [form, setForm] = useState({ name: "", region: "", category: "", subtype: "", place: "", price: "", costNote: "", hoursNote: "", ticketsNote: "", mapsLink: "", igLink: "", priority: "3", notes: "", ...initial, coordsText: initial.lat != null ? `${initial.lat}, ${initial.lng}` : "" });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const valid = form.name?.trim().length > 0;
  return (
    <div>
      <Field label="שם היעד"><input value={form.name} onChange={(e) => set("name", e.target.value)} style={inputStyle} className={inputClass} /></Field>
      <Field label="אזור/עיר"><input value={form.region} onChange={(e) => set("region", e.target.value)} style={inputStyle} className={inputClass} /></Field>
      <Field label="קטגוריה">
        <div className="flex flex-wrap gap-1.5">
          {DEST_CATEGORIES.map((cat) => (
            <button key={cat} onClick={() => set("category", form.category === cat ? "" : cat)} style={{ background: form.category === cat ? destCategoryTone(cat).bg : "#F2F4F8", color: form.category === cat ? destCategoryTone(cat).text : "#343434", border: form.category === cat ? `1.5px solid ${destCategoryTone(cat).main}` : "1.5px solid transparent", fontWeight: form.category === cat ? 700 : 500 }} className="rounded-full px-3 py-1.5 text-xs">
              {cat}
            </button>
          ))}
        </div>
      </Field>
      <Field label="מיקום מדויק (עיר/כתובת)"><input value={form.place} onChange={(e) => set("place", e.target.value)} style={inputStyle} className={inputClass} /></Field>
      <Field label="מחיר משוער (€)"><input type="number" value={form.price} onChange={(e) => set("price", e.target.value)} style={inputStyle} className={inputClass} /></Field>
      <Field label="עלות כניסה (טקסט חופשי)"><input value={form.costNote} onChange={(e) => set("costNote", e.target.value)} style={inputStyle} className={inputClass} /></Field>
      <Field label="שעות פתיחה"><input value={form.hoursNote} onChange={(e) => set("hoursNote", e.target.value)} style={inputStyle} className={inputClass} /></Field>
      <Field label="כרטיסים מראש?"><input value={form.ticketsNote} onChange={(e) => set("ticketsNote", e.target.value)} style={inputStyle} className={inputClass} /></Field>
      <Field label="קישור למפות גוגל"><input value={form.mapsLink} onChange={(e) => set("mapsLink", e.target.value)} style={inputStyle} className={inputClass} /></Field>
      <Field label="קישור לאינסטגרם"><input value={form.igLink} onChange={(e) => set("igLink", e.target.value)} style={inputStyle} className={inputClass} /></Field>
      <Field label="קואורדינטות למפה (אופציונלי, למשל: 49.25, 20.0)"><input value={form.coordsText} onChange={(e) => set("coordsText", e.target.value)} style={inputStyle} className={inputClass} dir="ltr" /></Field>
      <Field label="עדיפות (1–5)">
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} onClick={() => set("priority", String(n))} style={{ background: Number(form.priority) === n ? "#FF6935" : "#F2F4F8", color: Number(form.priority) === n ? "#fff" : "#343434" }} className="flex-1 rounded-xl py-2 text-sm font-medium">
              {n}
            </button>
          ))}
        </div>
      </Field>
      <Field label="הערות"><textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} style={inputStyle} className={inputClass + " resize-none"} /></Field>
      <button
        disabled={!valid}
        onClick={() => {
          const { coordsText, ...rest } = form;
          const c = parseCoords(coordsText);
          onSave({ ...rest, price: Number(rest.price) || 0, lat: c ? c.lat : null, lng: c ? c.lng : null });
        }}
        style={{ background: valid ? "#FF6935" : "#C8C8C8", color: "#fff" }}
        className="w-full rounded-xl py-3 mt-1 font-semibold text-sm"
      >שמירה</button>
    </div>
  );
}

function AssignForm({ dates, onSave }) {
  const [date, setDate] = useState(dates[0]);
  return (
    <div>
      <Field label="בחרו יום">
        <select value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} className={inputClass + " bg-white"}>
          {dates.map((d) => <option key={d} value={d}>{dateLabel(d)} · יום {HE_DAYS[new Date(d + "T00:00:00").getDay()]}</option>)}
        </select>
      </Field>
      <button onClick={() => onSave(date)} style={{ background: "#FF6935", color: "#fff" }} className="w-full rounded-xl py-3 mt-1 font-semibold text-sm">הוספה</button>
    </div>
  );
}
