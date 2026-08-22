import { useEffect, useState } from "react";
import { addDoc, collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { defaultData } from "./TripPlanner.jsx";

function label(iso) { const d = new Date(iso + "T00:00:00"); return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`; }

const inputStyle = { borderColor: "#E0E3EA", color: "#0F0F0F" };
const inputClass = "w-full border rounded-xl p-3 text-sm";

export default function TripPicker({ userEmail, onOpen, onSignOut }) {
  const [trips, setTrips] = useState(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [err, setErr] = useState(null);

  useEffect(() => {
    const q = query(collection(db, "trips"), where("memberEmails", "array-contains", userEmail));
    const unsub = onSnapshot(q, (snap) => setTrips(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setErr("טעינת הטיולים נכשלה."));
    return () => unsub();
  }, [userEmail]);

  const valid = name.trim() && start && end && end >= start;
  async function createTrip() {
    if (!valid) return;
    try {
      const ref = await addDoc(collection(db, "trips"), { ...defaultData(name.trim(), start, end), memberEmails: [userEmail] });
      onOpen(ref.id);
    } catch {
      setErr("יצירת הטיול נכשלה. נסו שוב.");
    }
  }

  return (
    <div dir="rtl" style={{ background: "#F2F4F8", minHeight: "100vh", fontFamily: "'Heebo', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Rubik:wght@500;600;700&family=Heebo:wght@400;500;600;700&display=swap');`}</style>
      <div style={{ background: "#1E4B3A" }} className="pt-6 pb-5 px-5">
        <h1 style={{ fontFamily: "'Rubik', sans-serif", color: "#FFFFFF" }} className="text-2xl font-bold mb-1">הטיולים שלי</h1>
        <div className="flex items-center justify-between">
          <span style={{ color: "#B9D4C5" }} className="text-[11px]">מחובר/ת כ-{userEmail}</span>
          <button onClick={onSignOut} style={{ color: "#D6E8DE" }} className="text-[11px] underline">התנתקות</button>
        </div>
      </div>

      <div className="px-4 pt-4 pb-16 max-w-md mx-auto">
        {err && <div style={{ background: "#FBEAF2", color: "#CC427B" }} className="rounded-xl p-3 text-xs mb-4">{err}</div>}

        {trips === null ? (
          <p style={{ color: "#767676" }} className="text-sm text-center py-8">טוען טיולים…</p>
        ) : trips.length === 0 && !creating ? (
          <p style={{ color: "#767676" }} className="text-sm text-center py-8">עוד אין טיולים. צרו את הראשון!</p>
        ) : (
          <div className="flex flex-col gap-2 mb-4">
            {trips?.map((t) => (
              <button key={t.id} onClick={() => onOpen(t.id)} style={{ background: "#FFFFFF" }} className="rounded-2xl p-4 text-right shadow-sm">
                <p style={{ color: "#0F0F0F" }} className="text-base font-bold">{t.meta?.title || "טיול ללא שם"}</p>
                <p style={{ color: "#767676", direction: "ltr" }} className="text-xs inline-block">
                  {t.meta?.start ? `${label(t.meta.start)} – ${label(t.meta.end)}` : ""}
                </p>
                <p style={{ color: "#9A9A9A" }} className="text-[11px] mt-1">{(t.memberEmails || []).length} משתתפים · {(t.destinations || []).length} יעדים</p>
              </button>
            ))}
          </div>
        )}

        {creating ? (
          <div style={{ background: "#FFFFFF" }} className="rounded-2xl p-4 shadow-sm">
            <h2 style={{ color: "#0F0F0F" }} className="text-sm font-bold mb-3">טיול חדש</h2>
            <div className="mb-3">
              <label style={{ color: "#767676" }} className="text-xs font-semibold block mb-1">שם הטיול</label>
              <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} className={inputClass} />
            </div>
            <div className="flex gap-3 mb-3">
              <div className="flex-1">
                <label style={{ color: "#767676" }} className="text-xs font-semibold block mb-1">מתאריך</label>
                <input type="date" value={start} onChange={(e) => setStart(e.target.value)} style={inputStyle} className={inputClass} />
              </div>
              <div className="flex-1">
                <label style={{ color: "#767676" }} className="text-xs font-semibold block mb-1">עד תאריך</label>
                <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} style={inputStyle} className={inputClass} />
              </div>
            </div>
            <div className="flex gap-2">
              <button disabled={!valid} onClick={createTrip} style={{ background: valid ? "#FF6935" : "#C8C8C8", color: "#fff" }} className="flex-1 rounded-xl py-3 font-semibold text-sm">יצירה</button>
              <button onClick={() => setCreating(false)} style={{ color: "#343434" }} className="px-4 rounded-xl text-sm">ביטול</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setCreating(true)} style={{ background: "#fff", border: "1px solid #E0E3EA", color: "#FF6935" }} className="w-full rounded-xl py-3 text-sm font-semibold">＋ טיול חדש</button>
        )}
      </div>
    </div>
  );
}
