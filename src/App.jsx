import { useEffect, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import { auth, googleProvider, db } from "./firebase";
import TripPlanner, { defaultData } from "./TripPlanner.jsx";

const TRIP_DOC = doc(db, "trips", "tatra-2026");

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = checking, null = signed out
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  // Access is decided by the user's own entry in the Firestore `allowlist`
  // collection (readable only by that user; see firestore.rules).
  const [allowed, setAllowed] = useState(undefined); // undefined = checking
  useEffect(() => {
    if (!user) { setAllowed(undefined); return; }
    getDoc(doc(db, "allowlist", user.email))
      .then((s) => setAllowed(s.exists()))
      .catch(() => setAllowed(false));
  }, [user]);

  useEffect(() => {
    if (!allowed) return;
    const unsub = onSnapshot(
      TRIP_DOC,
      (snap) => {
        if (snap.exists()) {
          const d = snap.data();
          let next = d, changed = false;
          // Trip dates are defined in code (defaultData). The doc was seeded once,
          // so reconcile it whenever the code's dates change.
          const { start, end } = defaultData().meta;
          if (d.meta?.start !== start || d.meta?.end !== end) {
            next = { ...next, meta: { ...next.meta, start, end } };
            changed = true;
          }
          if (changed) setDoc(TRIP_DOC, next).catch(() => setError("עדכון נתוני הטיול נכשל."));
          setData(next);
        } else {
          // First time ever — seed the document.
          const d = defaultData();
          setDoc(TRIP_DOC, d).catch(() => setError("לא הצלחנו ליצור את מסמך הטיול הראשוני."));
          setData(d);
        }
      },
      (err) => {
        console.error(err);
        setError("החיבור למסד הנתונים נכשל. בדקו את חוקי ה-Firestore וההרשאות.");
      }
    );
    return () => unsub();
  }, [allowed]);

  function persist(next) {
    setData(next);
    setDoc(TRIP_DOC, next).catch(() => setError("שמירה נכשלה — בדקו את החיבור לרשת."));
  }

  async function handleSignIn() {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      setAuthError("ההתחברות נכשלה. נסו שוב.");
    }
  }

  if (user === undefined) {
    return (
      <Centered>
        <p style={{ color: "#343434" }} className="text-sm">בודק התחברות…</p>
      </Centered>
    );
  }

  if (!user) {
    return (
      <Centered>
        <div style={{ background: "#fff", borderRadius: "20px" }} className="p-8 max-w-sm w-full text-center shadow-sm">
          <h1 style={{ fontFamily: "'Rubik', sans-serif", color: "#0F0F0F" }} className="text-2xl font-bold mb-2">
            תקציב הטיול לטטרה
          </h1>
          <p style={{ color: "#767676" }} className="text-sm mb-6">כניסה עם חשבון גוגל מורשה בלבד</p>
          <button
            onClick={handleSignIn}
            style={{ background: "#FF6935", color: "#fff" }}
            className="w-full rounded-xl py-3 font-semibold text-sm"
          >
            התחברות עם גוגל
          </button>
          {authError && <p style={{ color: "#EA1F33" }} className="text-xs mt-3">{authError}</p>}
        </div>
      </Centered>
    );
  }

  if (allowed === undefined) {
    return (
      <Centered>
        <p style={{ color: "#343434" }} className="text-sm">בודק הרשאות…</p>
      </Centered>
    );
  }

  if (!allowed) {
    return (
      <Centered>
        <div style={{ background: "#fff", borderRadius: "20px" }} className="p-8 max-w-sm w-full text-center shadow-sm">
          <h1 style={{ color: "#EA1F33" }} className="text-lg font-bold mb-2">אין לך גישה</h1>
          <p style={{ color: "#767676" }} className="text-sm mb-6">
            החשבון {user.email} אינו ברשימת המורשים לכלי הזה.
          </p>
          <button onClick={() => signOut(auth)} style={{ background: "#F2F4F8", color: "#343434" }} className="w-full rounded-xl py-3 font-semibold text-sm">
            התנתקות ונסיון עם חשבון אחר
          </button>
        </div>
      </Centered>
    );
  }

  return (
    <TripPlanner
      data={data}
      persist={persist}
      error={error}
      userEmail={user.email}
      onSignOut={() => signOut(auth)}
    />
  );
}

function Centered({ children }) {
  return (
    <div dir="rtl" style={{ background: "#F2F4F8", minHeight: "100vh", fontFamily: "'Heebo', sans-serif" }} className="flex items-center justify-center p-4">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Rubik:wght@500;600;700&family=Heebo:wght@400;500;600;700&display=swap');`}</style>
      {children}
    </div>
  );
}
