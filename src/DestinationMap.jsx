import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const TATRA_CENTER = [49.25, 19.95];

// Trip area (Poland/Slovakia + nearby capitals). Geocoding is restricted to this box —
// otherwise Hebrew place names match locations in Israel and wreck the map view.
// Stored coords outside the box are treated as bad and re-resolved.
const AREA = { minLat: 46.5, maxLat: 52.5, minLng: 15.5, maxLng: 24.5 };
function inArea(c) { return c.lat >= AREA.minLat && c.lat <= AREA.maxLat && c.lng >= AREA.minLng && c.lng <= AREA.maxLng; }

// Accepts "49.25, 20.01" or a full Google Maps URL (@lat,lng / !3d..!4d.. / q=lat,lng).
// Short maps.app.goo.gl links contain no coordinates and can't be resolved from the browser.
export function parseCoords(str) {
  if (!str) return null;
  const patterns = [
    /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/,
    /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/,
    /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/,
    /[?&](?:q|query|ll|center)=(-?\d{1,2}\.\d+)(?:,|%2C)(-?\d{1,3}\.\d+)/,
  ];
  for (const p of patterns) {
    const m = str.match(p);
    if (m) {
      const lat = Number(m[1]), lng = Number(m[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
    }
  }
  return null;
}

export function destCoords(d) {
  if (typeof d.lat === "number" && typeof d.lng === "number" && inArea(d)) return { lat: d.lat, lng: d.lng };
  return parseCoords(d.mapsLink);
}

// Mini-map for one day's plan: numbered stops connected in list order.
// stops: [{ num, name, coords: {lat,lng} }]
export function DayRouteMap({ stops }) {
  const ref = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } }, []);

  useEffect(() => {
    if (!mapRef.current) {
      const map = L.map(ref.current, { scrollWheelZoom: false });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      map.setView(TATRA_CENTER, 9);
      map._routeLayer = L.layerGroup().addTo(map);
      mapRef.current = map;
    }
    const map = mapRef.current, layer = map._routeLayer;
    layer.clearLayers();
    const pts = stops.map((s) => [s.coords.lat, s.coords.lng]);
    if (pts.length > 1) {
      L.polyline(pts, { color: "#1E4B3A", weight: 3, opacity: 0.65, dashArray: "6 8" }).addTo(layer);
    }
    stops.forEach((s) => {
      L.marker([s.coords.lat, s.coords.lng], {
        icon: L.divIcon({
          className: "",
          html: `<div style="width:24px;height:24px;border-radius:999px;background:#1E4B3A;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.35);color:#fff;font-weight:700;font-size:12px;display:flex;align-items:center;justify-content:center">${s.num}</div>`,
          iconSize: [24, 24], iconAnchor: [12, 12],
        }),
      }).bindPopup(`<div dir="rtl" style="font-family:'Heebo',sans-serif"><b>${s.num}. ${esc(s.name)}</b></div>`).addTo(layer);
    });
    if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.3), { maxZoom: 13 });
  }, [stops]);

  return <div ref={ref} style={{ height: "260px", borderRadius: "12px", position: "relative", zIndex: 0 }} className="overflow-hidden" />;
}

async function geocode(q) {
  try {
    const viewbox = `${AREA.minLng},${AREA.maxLat},${AREA.maxLng},${AREA.minLat}`;
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&bounded=1&viewbox=${viewbox}&q=${encodeURIComponent(q)}`);
    if (!res.ok) return null;
    const js = await res.json();
    if (!js[0]) return null;
    const c = { lat: Number(js[0].lat), lng: Number(js[0].lon) };
    return inArea(c) ? c : null;
  } catch {
    return null;
  }
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

export default function DestinationMap({ destinations, onCoords, colorFor }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(null);
  const busyRef = useRef(false);
  const failedRef = useRef(new Set());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (mapRef.current) return;
    const map = L.map(containerRef.current, { scrollWheelZoom: false });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    map.setView(TATRA_CENTER, 9);
    markersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  const located = destinations.map((d) => ({ d, c: destCoords(d) }));
  const unlocated = located.filter(({ c }) => !c);

  // Draw markers whenever destinations change.
  useEffect(() => {
    const map = mapRef.current, layer = markersRef.current;
    if (!map) return;
    layer.clearLayers();
    const pts = [];
    const seen = new Map(); // nudge markers that share the exact same spot so none hide each other
    located.forEach(({ d, c }) => {
      if (!c) return;
      const key = `${c.lat.toFixed(4)},${c.lng.toFixed(4)}`;
      const n = seen.get(key) || 0;
      seen.set(key, n + 1);
      c = { lat: c.lat + n * 0.0015, lng: c.lng + n * 0.0015 };
      pts.push([c.lat, c.lng]);
      L.circleMarker([c.lat, c.lng], {
        radius: 9, color: "#FFFFFF", weight: 2,
        fillColor: (colorFor && colorFor(d.category)) || "#FF6935", fillOpacity: 0.95,
      })
        .bindPopup(
          `<div dir="rtl" style="font-family:'Heebo',sans-serif;min-width:130px">
            <b style="color:#0F0F0F">${esc(d.name)}</b>
            ${d.subtype || d.category || d.place || d.region ? `<br/><span style="color:#9A9A9A">${esc([d.subtype || d.category, d.place || d.region].filter(Boolean).join(" · "))}</span>` : ""}
            ${d.costNote ? `<br/><span style="color:#767676">💶 ${esc(d.costNote)}</span>` : ""}
            ${Number(d.price) > 0 ? `<br/><span style="color:#0F0F0F;font-weight:600">€${Number(d.price).toLocaleString()}</span>` : ""}
            ${d.mapsLink ? `<br/><a href="${esc(d.mapsLink)}" target="_blank" rel="noreferrer" style="color:#10BAAE">פתיחה במפות גוגל</a>` : ""}
          </div>`
        )
        .addTo(layer);
    });
    if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.25), { maxZoom: 13 });
  }, [destinations]);

  // Geocode one missing destination at a time; each persisted result re-triggers
  // this effect with fresh props, so we never write stale data.
  useEffect(() => {
    const next = located.find(({ d, c }) => !c && !failedRef.current.has(d.id));
    if (!next || busyRef.current) return;
    busyRef.current = true;
    let cancelled = false;
    (async () => {
      await delay(1000); // Nominatim usage policy: max ~1 request/sec
      let c = await geocode(next.d.region ? `${next.d.name}, ${next.d.region}` : next.d.name);
      if (!c && next.d.region) {
        await delay(1000);
        c = await geocode(next.d.name);
      }
      busyRef.current = false;
      // A run cancelled mid-flight (deps changed while busy) skipped its replacement
      // run — bump tick so the queue resumes instead of stalling.
      if (cancelled) { setTick((t) => t + 1); return; }
      if (c) onCoords(next.d.id, c);
      else { failedRef.current.add(next.d.id); setTick((t) => t + 1); }
    })();
    return () => { cancelled = true; };
  }, [destinations, tick]);

  const searching = unlocated.filter(({ d }) => !failedRef.current.has(d.id));
  const failed = unlocated.filter(({ d }) => failedRef.current.has(d.id));

  return (
    <div>
      {/* zIndex:0 creates a stacking context so Leaflet panes stay under the app's modals */}
      <div ref={containerRef} style={{ height: "640px", borderRadius: "14px", position: "relative", zIndex: 0 }} className="overflow-hidden" />
      {destinations.length === 0 && (
        <p style={{ color: "#9A9A9A" }} className="text-xs mt-2 text-center">הוסיפו יעדים כדי לראות אותם על המפה.</p>
      )}
      {searching.length > 0 && (
        <p style={{ color: "#9A9A9A" }} className="text-xs mt-2">מאתר מיקום עבור: {searching.map(({ d }) => d.name).join(", ")}…</p>
      )}
      {failed.length > 0 && (
        <p style={{ color: "#CC427B" }} className="text-xs mt-2">
          לא נמצא מיקום עבור: {failed.map(({ d }) => d.name).join(", ")}. אפשר להזין קואורדינטות ידנית בעריכת היעד, או להדביק קישור מלא ממפות גוגל (לא קישור מקוצר).
        </p>
      )}
    </div>
  );
}
