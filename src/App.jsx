import { useEffect, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { auth, googleProvider, db } from "./firebase";
import TripPlanner from "./TripPlanner.jsx";
import TripPicker from "./TripPicker.jsx";

const LAST_TRIP_KEY = "tripPlanner:lastTripId";

// Trips are linkable: <site>/#/trip/<tripId>. The link only works for members.
function tripIdFromHash() {
  const m = window.location.hash.match(/^#\/?trip\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = checking, null = signed out
  const [tripId, setTripId] = useState(() => tripIdFromHash() || localStorage.getItem(LAST_TRIP_KEY) || null);

  useEffect(() => {
    const onHash = () => setTripId(tripIdFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user || !tripId) { setData(null); return; }
    setData(null);
    setError(null);
    const unsub = onSnapshot(
      doc(db, "trips", tripId),
      (snap) => {
        if (!snap.exists()) { closeTrip(); return; } // trip deleted
        setData(snap.data());
      },
      () => closeTrip() // permission denied: removed from the trip, or a stale id
    );
    return () => unsub();
  }, [user, tripId]);

  function openTrip(id) {
    localStorage.setItem(LAST_TRIP_KEY, id);
    window.history.replaceState(null, "", `#/trip/${id}`);
    setTripId(id);
  }
  function closeTrip() {
    localStorage.removeItem(LAST_TRIP_KEY);
    window.history.replaceState(null, "", window.location.pathname);
    setTripId(null);
    setData(null);
  }

  function persist(next) {
    setData(next);
    setDoc(doc(db, "trips", tripId), next).catch(() => setError("שמירה נכשלה — בדקו את החיבור לרשת."));
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
            מתכנן הטיולים
          </h1>
          <p style={{ color: "#767676" }} className="text-sm mb-6">תקציב, יעדים ותכנון יומי — משותף עם מי שמטיילים איתכם</p>
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

  if (!tripId) {
    return <TripPicker userEmail={user.email} onOpen={openTrip} onSignOut={() => signOut(auth)} />;
  }

  return (
    <TripPlanner
      data={data}
      persist={persist}
      error={error}
      userEmail={user.email}
      tripId={tripId}
      onSignOut={() => signOut(auth)}
      onBack={closeTrip}
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
