/* ===== FitTrack ===== */
"use strict";

/* ---------- helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
const r0 = (n) => Math.round(n);
const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const calcAvg = (arr, decimals) => arr.length ? (decimals ? r1 : r0)(arr.reduce((x, y) => x + y, 0) / arr.length) : null;
const APP_VERSION = "3.11.0";
// Shared food library backend (Cloudflare Worker + D1 — see worker/README.md).
// Empty string disables the feature: the Shared tab is hidden and the share
// button on custom foods falls back to the old file export.
const SHARED_FOODS_API = "https://fittrack-foods.owensvin.workers.dev";
// Raw package.json on main — its "version" runs ahead of APP_VERSION whenever
// a new build has been pushed that this install doesn't have yet.
const UPDATE_CHECK_URL = "https://raw.githubusercontent.com/owensvin/fittrack/main/package.json";

function toKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fromKey(k) { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); }
function addDays(k, n) { const d = fromKey(k); d.setDate(d.getDate() + n); return toKey(d); }
function todayKey() { return toKey(new Date()); }
function daysBetween(k1, k2) { return Math.round((fromKey(k2) - fromKey(k1)) / 86400000); }
function fmtShort(k) { return fromKey(k).toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
function fmtTime(ts) { return new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); }
function fmtDuration(days) {
  if (days <= 30) return `${days}d`;
  const mo = days / 30.44;
  return `${mo < 10 ? r1(mo) : r0(mo)} mo`;
}
function ageFromDob(dob) {
  if (!dob) return null;
  const b = fromKey(dob), n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--;
  return a;
}
// Colour-coded P/C/F chips for food rows (protein green, carbs yellow, fat purple).
function macroTags(o) {
  const parts = [];
  if (o.p) parts.push(`<span class="m-p">P${r1(o.p)}</span>`);
  if (o.c) parts.push(`<span class="m-c">C${r1(o.c)}</span>`);
  if (o.f) parts.push(`<span class="m-f">F${r1(o.f)}</span>`);
  return parts.length ? " · " + parts.join(" ") : "";
}
function isWeekend(k) { const d = fromKey(k).getDay(); return d === 0 || d === 6; }

// Subtle native haptics; silently no-ops in the browser / if the plugin is missing
// or if the user has turned haptics off in Settings.
function hapticsEnabled() { return !(state && state.settings) || state.settings.haptics !== false; }
function haptic(style) {
  try {
    if (!hapticsEnabled()) return;
    const H = window.capacitorHaptics;
    if (!H || !isNativeApp()) return;
    H.Haptics.impact({ style: style === "light" ? H.ImpactStyle.Light : H.ImpactStyle.Medium });
  } catch (_) {}
}

let toastTimer = null;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), 2000);
}

// Wires a sheet's close button + backdrop-click to the same close action
// (defaults to just hiding the sheet; pass onClose for sheets that need
// custom teardown, e.g. the barcode scanner stopping its camera stream).
function wireSheetClose(sheetId, closeBtnId, onClose) {
  const close = onClose || (() => $("#" + sheetId).classList.add("hidden"));
  const btn = $("#" + closeBtnId);
  if (btn) btn.addEventListener("click", close);
  $("#" + sheetId).addEventListener("click", (e) => { if (e.target.id === sheetId) close(); });
}

// Wires .fi-del buttons in a rendered list to splice-by-index out of an
// array (the common delete shape shared by meals/exercises/sessions/
// ingredients). getArr(btn) resolves which array a given row belongs to.
function wireIndexDelete(containerSel, getArr, after, opts = {}) {
  $$(containerSel + " .fi-del").forEach((b) => b.addEventListener("click", (e) => {
    if (opts.stopProp) e.stopPropagation();
    const arr = getArr(b);
    if (arr) arr.splice(+b.dataset.i, 1);
    if (opts.save !== false) save();
    after();
  }));
}

/* ---------- icons ---------- */
const ICONS = {
  chevL: '<polyline points="15 5 8 12 15 19"/>',
  chevR: '<polyline points="9 5 16 12 9 19"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  x: '<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>',
  check: '<polyline points="4 12 9 17 20 6"/>',
  drop: '<path d="M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z"/>',
  timer: '<circle cx="12" cy="13" r="8"/><line x1="12" y1="13" x2="12" y2="9"/><line x1="9" y1="2" x2="15" y2="2"/>',
  walk: '<circle cx="13" cy="4" r="1.7"/><path d="M7 21l3-4"/><path d="M16 21l-2-4-3-3 1-6"/><path d="M6 12l2-3 4-1 3 3 3 1"/>',
  pill: '<rect x="3" y="9" width="18" height="6" rx="3" transform="rotate(-45 12 12)"/><line x1="9.9" y1="9.9" x2="14.1" y2="14.1"/>',
  scale: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 10a4 4 0 0 1 8 0"/><line x1="12" y1="10" x2="14.2" y2="7.8"/>',
  ruler: '<rect x="3" y="7" width="18" height="10" rx="2"/><line x1="8" y1="7" x2="8" y2="11"/><line x1="12" y1="7" x2="12" y2="12"/><line x1="16" y1="7" x2="16" y2="11"/>',
  camera: '<path d="M4 8h3l2-2h6l2 2h3v11H4z"/><circle cx="12" cy="13" r="3.2"/>',
  home: '<path d="M4 11l8-7 8 7"/><path d="M6 10v9h12v-9"/>',
  chart: '<line x1="5" y1="20" x2="5" y2="11"/><line x1="12" y1="20" x2="12" y2="5"/><line x1="19" y1="20" x2="19" y2="14"/>',
  person: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c0-4 3-6 7-6s7 2 7 6"/>',
  sliders: '<line x1="4" y1="8" x2="20" y2="8"/><line x1="4" y1="16" x2="20" y2="16"/><circle cx="9" cy="8" r="2.4" fill="var(--bg)"/><circle cx="15" cy="16" r="2.4" fill="var(--bg)"/>',
  barcode: '<line x1="4" y1="6" x2="4" y2="18"/><line x1="7" y1="6" x2="7" y2="18"/><line x1="10" y1="6" x2="10" y2="18"/><line x1="14" y1="6" x2="14" y2="18"/><line x1="17" y1="6" x2="17" y2="18"/><line x1="20" y1="6" x2="20" y2="18"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  layers: '<polygon points="12 3 21 8 12 13 3 8"/><polyline points="3 12 12 17 21 12"/>',
  bolt: '<polygon points="13 3 5 13 11 13 10 21 18 10 12 10"/>',
  flame: '<path d="M12 2c1 3-3 4-3 8a3 3 0 0 0 6 0c1.4 1 2 2.8 2 4.5a5 5 0 0 1-10 0C7 10 10 8 12 2z"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="0.6" fill="currentColor"/>',
  sunrise: '<circle cx="12" cy="14" r="4"/><line x1="12" y1="3" x2="12" y2="6"/><line x1="4" y1="14" x2="2" y2="14"/><line x1="22" y1="14" x2="20" y2="14"/><line x1="6" y1="8" x2="4.5" y2="6.5"/><line x1="19.5" y1="6.5" x2="18" y2="8"/><line x1="3" y1="20" x2="21" y2="20"/>',
  sun: '<circle cx="12" cy="12" r="4.5"/><line x1="12" y1="2" x2="12" y2="4.5"/><line x1="12" y1="19.5" x2="12" y2="22"/><line x1="2" y1="12" x2="4.5" y2="12"/><line x1="19.5" y1="12" x2="22" y2="12"/><line x1="4.9" y1="4.9" x2="6.6" y2="6.6"/><line x1="17.4" y1="17.4" x2="19.1" y2="19.1"/><line x1="4.9" y1="19.1" x2="6.6" y2="17.4"/><line x1="17.4" y1="6.6" x2="19.1" y2="4.9"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/>',
  bowl: '<path d="M4 12h16a8 4 0 0 1-16 0z"/><line x1="9" y1="8" x2="9" y2="10"/><line x1="12" y1="7" x2="12" y2="10"/><line x1="15" y1="8" x2="15" y2="10"/>',
  run: '<circle cx="14" cy="4" r="1.7"/><path d="M4 17l5 1 .8-1.5"/><path d="M15 21v-4l-4-3 1-6"/><path d="M7 12v-3l5-1 3 3 3 1"/>',
  bike: '<circle cx="6" cy="17" r="3.2"/><circle cx="18" cy="17" r="3.2"/><path d="M6 17l4-9h4l4 9"/><path d="M10 8h4"/><path d="M10 17h8"/>',
  dumbbell: '<rect x="3" y="9.5" width="3" height="5" rx="1"/><rect x="18" y="9.5" width="3" height="5" rx="1"/><line x1="6" y1="12" x2="18" y2="12"/><rect x="7" y="7.5" width="2.4" height="9" rx="0.8"/><rect x="14.6" y="7.5" width="2.4" height="9" rx="0.8"/>',
  wave: '<path d="M2 10c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M2 15c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>',
  lotus: '<path d="M12 21c-4-1.5-6-4.5-6-8 2 1 4 1 6 0 2 1 4 1 6 0 0 3.5-2 6.5-6 8z"/><path d="M12 13c-2-3-2-6 0-9 2 3 2 6 0 9z"/>',
  ball: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18M6 6l12 12M18 6L6 18"/>',
  ellipse: '<circle cx="12" cy="12" r="9"/><path d="M4 15c3 2 13 2 16 0"/><path d="M4 9c3-2 13-2 16 0"/>',
  bell: '<path d="M6 17h12l-1.5-2.5V10a4.5 4.5 0 0 0-9 0v4.5z"/><path d="M9.5 19a2.5 2.5 0 0 0 5 0"/>',
  pulse: '<polyline points="2 12 6 12 9 3 15 21 18 12 22 12"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  info: '<circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><circle cx="12" cy="7.5" r="0.9" fill="currentColor"/>',
  grip: '<circle cx="9" cy="6" r="1.3"/><circle cx="15" cy="6" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="18" r="1.3"/><circle cx="15" cy="18" r="1.3"/>',
  pencil: '<path d="M4 20l1-4.5L15.5 5 19 8.5 8.5 19 4 20z"/><line x1="13.5" y1="6.5" x2="17" y2="10"/>',
  minus: '<line x1="5" y1="12" x2="19" y2="12"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/>',
  share: '<circle cx="18" cy="5" r="2.4"/><circle cx="6" cy="12" r="2.4"/><circle cx="18" cy="19" r="2.4"/><line x1="8.2" y1="10.8" x2="15.8" y2="6.2"/><line x1="8.2" y1="13.2" x2="15.8" y2="17.8"/>',
};
function renderIcons(root = document) {
  $$("[data-ic]", root).forEach((el) => {
    const name = el.dataset.ic;
    if (ICONS[name] && !el.dataset.done) {
      el.innerHTML = `<svg viewBox="0 0 24 24">${ICONS[name]}</svg>`;
      el.dataset.done = "1";
    }
  });
}

/* ---------- data tables ---------- */
const MEALS = [
  { id: "breakfast", label: "Breakfast", ic: "sunrise" },
  { id: "lunch", label: "Lunch", ic: "sun" },
  { id: "dinner", label: "Dinner", ic: "moon" },
  { id: "snacks", label: "Snacks", ic: "bowl" },
];
const EXERCISES = [
  { id: "walk", name: "Brisk walk", ic: "walk", met: 4.3 },
  { id: "powerwalk", name: "Power walk", ic: "walk", met: 5.0 },
  { id: "inclinewalk", name: "Incline walk", ic: "walk", met: 6.0 },
  { id: "dumbbellfull", name: "Dumbbell full-body", ic: "dumbbell", met: 6.0 },
  { id: "kbcircuit", name: "Kettlebell circuit", ic: "dumbbell", met: 8.0 },
  { id: "run", name: "Running", ic: "run", met: 9.8 },
  { id: "cycle", name: "Cycling", ic: "bike", met: 7.5 },
  { id: "weights", name: "Weight training", ic: "dumbbell", met: 5.0 },
  { id: "swim", name: "Swimming", ic: "wave", met: 7.0 },
  { id: "hiit", name: "HIIT", ic: "bolt", met: 8.0 },
  { id: "elliptical", name: "Elliptical", ic: "ellipse", met: 5.0 },
  { id: "yoga", name: "Yoga", ic: "lotus", met: 3.0 },
  { id: "sports", name: "Sports", ic: "ball", met: 7.0 },
];
function defaultSupplements() {
  return [];
}
/* ---------- training schedule ---------- */
const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_LABELS = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
// Each day holds a list of workout ids (not a single value) — a day can have
// several variations logged on it, and an empty list just means rest.
function defaultTrainingSchedule() {
  return { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
}
function allWorkouts() { return [...EXERCISES, ...state.workoutTemplates]; }
function workoutById(id) { return allWorkouts().find((w) => w.id === id); }
// Best-effort icon for a logged activity that didn't store one (older entries,
// timer sessions) — match the name against the known exercises, then keywords.
function exerciseIcon(name) {
  const n = (name || "").toLowerCase();
  if (/^(emom|amrap)/.test(n)) return "timer";
  const hit = allWorkouts().find((e) => n.includes(e.name.toLowerCase()));
  if (hit && hit.ic) return hit.ic;
  if (n.includes("walk") || n.includes("hik")) return "walk";
  if (n.includes("run") || n.includes("jog") || n.includes("sprint")) return "run";
  if (n.includes("cycl") || n.includes("bike") || n.includes("spin")) return "bike";
  if (n.includes("swim")) return "wave";
  if (n.includes("yoga") || n.includes("stretch") || n.includes("pilates")) return "lotus";
  return "dumbbell";
}
// JS getDay() is 0=Sun..6=Sat; DAY_KEYS is Mon-first, so shift by 6 (mod 7).
function dayKeyOf(date) { return DAY_KEYS[(date.getDay() + 6) % 7]; }
function orderedDayKeys() {
  const monStart = (state.settings.weekStart || "mon") === "mon";
  return monStart ? DAY_KEYS : ["sun", ...DAY_KEYS.slice(0, 6)];
}
// A break is a real date range (not a weekday pattern) that overrides the
// recurring schedule without touching it — it resumes exactly as it was
// once the break ends.
function isOnBreak(dateKey) {
  const b = state.trainingBreak;
  return !!(b && dateKey >= b.from && dateKey <= b.until);
}
function scheduleDayInfo(date) {
  const dateKey = toKey(date);
  if (isOnBreak(dateKey)) return { rest: true, ic: "moon", name: "Break", onBreak: true };
  const dk = dayKeyOf(date);
  const ids = state.trainingSchedule[dk] || [];
  const workouts = ids.map(workoutById).filter(Boolean);
  if (!workouts.length) return { rest: true, ic: "moon", name: "Rest", count: 0 };
  return { rest: false, ic: workouts[0].ic || "dumbbell", name: workouts.length > 1 ? `${workouts[0].name} +${workouts.length - 1}` : workouts[0].name, count: workouts.length };
}
function workoutNotif(id) { return state.workoutNotifs[id] || (state.workoutNotifs[id] = { enabled: false, time: "07:00" }); }
// Capacitor's schedule.on.weekday is 1=Sunday..7=Saturday (see the weekly-
// review notification below) — map our Mon-first DAY_KEYS onto that.
const CAP_WEEKDAY = { sun: 1, mon: 2, tue: 3, wed: 4, thu: 5, fri: 6, sat: 7 };
// One local-notification id per (workout, weekday) so a workout scheduled on
// several days can have several independent recurring alarms — derived from
// a simple string hash of the workout id so it's stable across reloads
// without needing to persist a counter.
function workoutNotifIds(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const base = 9000 + (Math.abs(h) % 9000) * 10;
  const ids = {};
  DAY_KEYS.forEach((dk, i) => { ids[dk] = base + i; });
  return ids;
}
async function cancelWorkoutNotif(id) {
  const LN = window.capacitorLocalNotifications && window.capacitorLocalNotifications.LocalNotifications;
  if (!isNativeApp() || !LN) return;
  const ids = workoutNotifIds(id);
  try { await LN.cancel({ notifications: DAY_KEYS.map((dk) => ({ id: ids[dk] })) }); } catch (_) {}
}
// Cancels then (if enabled) reschedules all of a workout's day-notifications —
// simplest way to keep them in sync with day-toggle/time/enabled changes
// without tracking a separate diff.
async function rescheduleWorkoutNotif(id) {
  const LN = window.capacitorLocalNotifications && window.capacitorLocalNotifications.LocalNotifications;
  if (!isNativeApp() || !LN) return;
  const ids = workoutNotifIds(id);
  try {
    await LN.cancel({ notifications: DAY_KEYS.map((dk) => ({ id: ids[dk] })) });
    const notif = state.workoutNotifs[id];
    if (!notif || !notif.enabled) return;
    const scheduledDays = DAY_KEYS.filter((dk) => (state.trainingSchedule[dk] || []).includes(id));
    if (!scheduledDays.length) return;
    const perm = await LN.requestPermissions();
    if (perm.display !== "granted") { toast("Notification permission denied"); notif.enabled = false; save(); return; }
    const w = workoutById(id);
    const [h, m] = notif.time.split(":").map(Number);
    await LN.schedule({ notifications: scheduledDays.map((dk) => ({
      id: ids[dk], title: "FitTrack", body: `Scheduled: ${w ? w.name : "workout"}`,
      schedule: { on: { weekday: CAP_WEEKDAY[dk], hour: h, minute: m }, repeats: true },
    })) });
  } catch (e) { toast("Couldn't schedule workout reminder"); }
}
// Shared markup + wiring for "which days does this workout happen on" rows —
// used by both the Settings/Training editor (all workouts) and onboarding
// (built-ins only, no custom-workout creation there).
function scheduleAssignRowsHTML(schedule, workouts) {
  const days = orderedDayKeys();
  return workouts.map((w) => `
    <div class="ws-row" data-id="${w.id}">
      <div class="ws-name"><span class="ic" data-ic="${w.ic || "dumbbell"}"></span>${esc(w.name)}</div>
      <div class="chips ws-days">
        ${days.map((dk) => `<button data-day="${dk}" class="${(schedule[dk] || []).includes(w.id) ? "active" : ""}">${DAY_LABELS[dk]}</button>`).join("")}
      </div>
    </div>`).join("");
}
function wireScheduleAssign(containerSel, schedule, onChange) {
  $$(containerSel + " .ws-row").forEach((row) => {
    const id = row.dataset.id;
    $$(".ws-days button", row).forEach((btn) => btn.addEventListener("click", () => {
      const dk = btn.dataset.day;
      const arr = schedule[dk] || (schedule[dk] = []);
      const idx = arr.indexOf(id);
      if (idx >= 0) arr.splice(idx, 1); else arr.push(id);
      btn.classList.toggle("active");
      if (onChange) onChange();
    }));
  });
}
function weekDatesFor(pivot) {
  const monStart = (state.settings.weekStart || "mon") === "mon";
  const dow = pivot.getDay();
  const diff = monStart ? (dow + 6) % 7 : dow;
  const start = new Date(pivot); start.setDate(start.getDate() - diff);
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
}
/* ---------- state ---------- */
const LS_KEY = "fittrack";
let state = loadState();
let viewDate = todayKey();
// Chart range/mode chips remember the last choice across app restarts.
const uiPrefs = (state.settings.uiPrefs = state.settings.uiPrefs || {});
function setPref(key, val) { uiPrefs[key] = val; save(); }

function defaultState() {
  return {
    profile: null,
    logs: {},        // dateKey -> {meals, waterMl, walks:[], supps:{}}
    weights: [], waists: [],
    customFoods: [], favs: [], recents: [],
    goals: [],
    challenge: null, // {weekKey, id} — this week's auto-picked challenge
    pendingCelebration: null, // goal id whose "reached" sheet hasn't been dismissed yet
    foodServingOverrides: {}, // foodId/name -> grams, so any food can toggle serv/g/ml
    supplements: defaultSupplements(),
    workoutTemplates: [],
    activeWorkoutIds: [],
    trainingSchedule: defaultTrainingSchedule(),
    trainingBreak: null, // {from, until} date-key range; overrides the weekly pattern without editing it
    workoutNotifs: {}, // workoutId -> {enabled, time}
    settings: { theme: "dark", apiKey: "", reminder: { enabled: false, time: "19:00" }, weeklyReview: { enabled: false }, waterEnabled: true, reduceMotion: false, haptics: true, weekStart: "mon", lastSeenVersion: null, tourDismissed: false, lastBackup: null, backupSnoozeUntil: null, shareName: null, libraryKey: "", deviceId: null, updateAvail: null, updateDismissed: null, lastUpdateCheck: null, timer: { mode: "emom", emomInt: 60, emomRounds: 10, amrapMins: 10, program: [] } },
  };
}
function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const s = Object.assign(defaultState(), JSON.parse(raw));
      if (!s.supplements || !s.supplements.length) s.supplements = defaultSupplements();
      if (!s.workoutTemplates) s.workoutTemplates = [];
      if (!s.activeWorkoutIds) s.activeWorkoutIds = [];
      if (!s.trainingSchedule) s.trainingSchedule = defaultTrainingSchedule();
      if (s.trainingBreak === undefined) s.trainingBreak = null;
      if (!s.workoutNotifs) s.workoutNotifs = {};
      if (!s.settings.reminder) s.settings.reminder = { enabled: false, time: "19:00" };
      if (s.settings.waterEnabled === undefined) s.settings.waterEnabled = true;
      if (s.settings.reduceMotion === undefined) s.settings.reduceMotion = false;
      if (!s.settings.timer) s.settings.timer = { mode: "emom", emomInt: 60, emomRounds: 10, amrapMins: 10, program: [] };
      if (!s.settings.timer.program) s.settings.timer.program = [];
      if (!s.settings.weeklyReview) s.settings.weeklyReview = { enabled: false };
      if (s.settings.lastSeenVersion === undefined) s.settings.lastSeenVersion = null;
      if (s.settings.tourDismissed === undefined) s.settings.tourDismissed = false;
      if (s.settings.lastBackup === undefined) s.settings.lastBackup = null;
      if (s.settings.backupSnoozeUntil === undefined) s.settings.backupSnoozeUntil = null;
      if (s.settings.shareName === undefined) s.settings.shareName = null;
      if (s.settings.libraryKey === undefined) s.settings.libraryKey = "";
      if (s.settings.deviceId === undefined) s.settings.deviceId = null;
      if (s.settings.updateAvail === undefined) s.settings.updateAvail = null;
      if (s.settings.updateDismissed === undefined) s.settings.updateDismissed = null;
      if (s.settings.lastUpdateCheck === undefined) s.settings.lastUpdateCheck = null;
      if (s.challenge === undefined) s.challenge = null;
      if (s.pendingCelebration === undefined) s.pendingCelebration = null;
      if (!s.foodServingOverrides) s.foodServingOverrides = {};
      if (s.profile && !s.profile.kcalTargetHistory) s.profile.kcalTargetHistory = [{ from: s.profile.startDate || todayKey(), kcal: s.profile.kcalTarget }];
      if (s.profile && s.profile.targetDeficit == null) {
        const pr = s.profile, wt = (s.weights && s.weights.length) ? s.weights[s.weights.length - 1].kg : pr.startWeightKg;
        s.profile.targetDeficit = Math.max(0, Math.round(bmr(pr.sex, wt, pr.heightCm, pr.age) * pr.activity) - pr.kcalTarget);
      }
      if (s.profile && s.profile.autoAdjust === undefined) s.profile.autoAdjust = false;
      if (s.profile && !s.profile.birthYear && s.profile.age) s.profile.birthYear = new Date().getFullYear() - s.profile.age;
      if (s.profile && !s.profile.birthDate) s.profile.birthDate = `${s.profile.birthYear || (new Date().getFullYear() - s.profile.age)}-01-01`;
      if (s.settings.haptics === undefined) s.settings.haptics = true;
      if (!s.settings.weekStart) s.settings.weekStart = "mon";
      if (s.goals) for (const g of s.goals) { if (!g.created) g.created = (s.profile && s.profile.startDate) || todayKey(); }
      if (!s.goals || !s.goals.length) {
        s.goals = [];
        const p = s.profile;
        if (p && p.sprintGoalKg) s.goals.push({ id: "g1", label: "Short-term", targetKg: p.sprintGoalKg, date: p.sprintDate });
        if (p && p.longGoalKg) s.goals.push({ id: "g2", label: "Long-term", targetKg: p.longGoalKg, date: p.longDate });
      }
      if (s.weights) for (const w of s.weights) { if (!w.ts) w.ts = fromKey(w.d).toISOString(); }
      return s;
    }
  } catch (e) { /* corrupt/unreadable localStorage — fall back to a fresh state */ }
  return defaultState();
}
// A full-storage device would otherwise throw out of every handler that saves
// (mid-render, with the change already applied in memory but never persisted).
// Catch it and say so instead — the user can export a backup and clear space.
function save() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); }
  catch (e) { toast("Couldn't save — device storage is full. Export a backup, then free up space."); }
}
// Ids only need to be unique and opaque; a counter keeps a loop that saves
// several foods inside one millisecond from handing out the same id twice.
let foodIdSeq = 0;
function newFoodId() { return "c" + Date.now() + "-" + foodIdSeq++; }
// Adds a food to the custom library, or refreshes the existing entry with the
// same (case-insensitive) name in place, so re-scanning or re-describing a
// food updates its numbers instead of piling up duplicates. The stored name
// keeps its original capitalization.
function upsertCustomFood(food) {
  const existing = state.customFoods.find((c) => c.name.toLowerCase() === food.name.toLowerCase());
  if (existing) { const { name, ...rest } = food; Object.assign(existing, rest); return existing; }
  const entry = { id: newFoodId(), ...food };
  state.customFoods.unshift(entry);
  return entry;
}
// Least-squares slope of a [{d: dateKey, v}] series, in units per day
// (negative = falling). Null when the points are all on one date.
function linRegSlope(pts) {
  const x0 = pts[0].d, xs = pts.map((p) => daysBetween(x0, p.d)), ys = pts.map((p) => p.v);
  const n = xs.length, sx = xs.reduce((a, b) => a + b), sy = ys.reduce((a, b) => a + b);
  const sxy = xs.reduce((s, x, i) => s + x * ys[i], 0), sxx = xs.reduce((s, x) => s + x * x, 0);
  const den = n * sxx - sx * sx;
  return den ? (n * sxy - sx * sy) / den : null;
}
// Shared-library requests get a hard timeout — without one a hung connection
// leaves the Shared tab stuck on "Loading…" with no way back.
function apiFetch(url, opts = {}, ms = 10000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  return fetch(url, { ...opts, signal: ctl.signal }).finally(() => clearTimeout(t));
}

function dayLog(k) {
  if (!state.logs[k]) state.logs[k] = { meals: { breakfast: [], lunch: [], dinner: [], snacks: [] }, waterMl: 0, walks: [], supps: {} };
  const l = state.logs[k];
  if (!l.walks) l.walks = [];
  if (!l.supps) l.supps = {};
  return l;
}
function dayTotals(k) {
  const log = state.logs[k];
  const t = { kcal: 0, p: 0, c: 0, f: 0, items: 0, active: 0, walkKcal: 0, stepKcal: 0 };
  if (!log) return t;
  for (const m of MEALS) for (const it of (log.meals[m.id] || [])) {
    t.kcal += it.kcal; t.p += it.p || 0; t.c += it.c || 0; t.f += it.f || 0; t.items++;
  }
  for (const w of (log.walks || [])) { t.active += w.kcal; t.walkKcal += w.kcal; }
  // Steps count as a "step credit" toward the day's calories burned.
  if (log.steps) { t.stepKcal = stepKcal(log.steps); t.active += t.stepKcal; }
  return t;
}

/* ---------- calorie math ---------- */
function bmr(sex, kg, cm, age) {
  return sex === "male" ? 10 * kg + 6.25 * cm - 5 * age + 5 : 10 * kg + 6.25 * cm - 5 * age - 161;
}
function currentWeight() {
  return state.weights.length ? state.weights[state.weights.length - 1].kg : (state.profile ? state.profile.startWeightKg : 70);
}
function tdee() { const p = state.profile; return r0(bmr(p.sex, currentWeight(), p.heightCm, p.age) * p.activity); }
function kcalFloor(sex) { return sex === "male" ? 1500 : 1200; }
// Adaptive expenditure (real TDEE) from energy balance: over a trailing window,
// TDEE = average intake − (weight-trend slope × 7700 kcal/kg). Needs enough
// logged intake and a stable weight trend, else null.
function adaptiveExpenditure(windowDays = 14) {
  let sum = 0, days = 0;
  for (let i = 0; i < windowDays; i++) {
    const t = dayTotals(addDays(todayKey(), -i));
    if (t.items > 0) { sum += t.kcal; days++; }
  }
  if (days < 7) return null;
  const avgIntake = sum / days;
  const ma = movingAvg(state.weights);
  const cutoff = addDays(todayKey(), -windowDays);
  const pts = ma.filter((e) => e.d >= cutoff);
  if (pts.length < 3) return null;
  const slope = linRegSlope(pts); // kg/day (negative = losing)
  if (slope === null) return null;
  return { expenditure: r0(avgIntake - slope * 7700), avgIntake: r0(avgIntake), weeklyChange: r1(slope * 7), days };
}
function recommendedTarget(exp) {
  const p = state.profile;
  return Math.max(kcalFloor(p.sex), r0(exp - (p.targetDeficit || 0)));
}
// Weekly auto-adjust: once enabled and ≥7 days since the last adjust, retune the
// calorie target to the fresh expenditure minus the user's chosen deficit.
function maybeAutoAdjust() {
  const p = state.profile;
  if (!p || !p.autoAdjust) return;
  const last = p.lastAutoAdjust || p.startDate || todayKey();
  if (daysBetween(last, todayKey()) < 7) return;
  const e = adaptiveExpenditure();
  if (!e) return;
  const rec = recommendedTarget(e.expenditure);
  p.lastAutoAdjust = todayKey();
  if (rec !== p.kcalTarget) { p.kcalTarget = rec; recordTargetChange(rec); toast(`Weekly check-in: target adjusted to ${rec} kcal`); }
  save();
}
const PACE_TIERS = [
  { id: "sustainable", name: "Sustainable", deficit: 600, proteinPerKg: 1.9, note: "No strength loss expected — easiest to maintain long-term." },
  { id: "moderate", name: "Moderate", deficit: 850, proteinPerKg: 1.9, note: "Noticeable hunger; high protein protects muscle well." },
  { id: "aggressive", name: "Aggressive", deficit: 950, proteinPerKg: 1.9, note: "Fast progress, but harder to sustain for long stretches." },
  { id: "verylow", name: "Very-low (not recommended)", deficit: 1200, proteinPerKg: 2.0, note: "Muscle loss, poor training recovery, high rebound risk." },
];
const GLOSSARY = {
  bmr: { title: "BMR", body: "Basal Metabolic Rate — the calories your body burns at rest just to stay alive (breathing, circulation, cell repair). Calculated with the Mifflin-St Jeor formula from your age, height, and weight." },
  tdee: { title: "TDEE / Maintenance", body: "Total Daily Energy Expenditure — your BMR multiplied by an activity factor (Sedentary, Lightly active, Active). This is roughly how many calories you burn in a day, and the number your calorie target is based off." },
  deficit: { title: "Deficit & pace", body: "Eating fewer calories than your TDEE (a \"deficit\") is what causes weight loss. A bigger deficit loses weight faster but is harder to sustain and risks losing muscle. The Pace presets trade this off for you — Sustainable is gentlest, Very-low is most aggressive and not generally recommended." },
  protein: { title: "Protein target", body: "Set as grams per kilogram of bodyweight (roughly 1.9–2.0 g/kg here). Eating enough protein while in a calorie deficit helps preserve muscle instead of losing it along with fat." },
  macros: { title: "Macros", body: "Protein builds/preserves muscle (4 kcal/g). Fat supports hormones and vitamin absorption (9 kcal/g). Carbs are your main energy source, especially for workouts (4 kcal/g). Calories are the total energy from all three combined." },
  program: { title: "EMOM program", body: "List one move per line (e.g. Swings / Goblet squats / Push press / Rest) and it cycles round to round — round 1 is line 1, round 2 is line 2, and it wraps back to line 1 after the list ends. A 4-move list on a 12-round EMOM repeats the circuit 3 times. Leave it blank to just see a plain round counter. This only drives EMOM, since AMRAP's rounds aren't tied to fixed minutes — there it's shown as a fixed circuit to repeat." },
  streak: { title: "Streak & adherence", body: "There are two streaks: the flame is your logging streak — consecutive days you logged anything at all. The target icon is your on-target streak — consecutive days you also stayed under your calorie budget. Missing your target doesn't break the logging streak, and vice versa. Adherence % (in the Summary) is just days logged ÷ days in that period — it only needs you to show up, not hit target." },
  bmi: { title: "BMI", body: "Body Mass Index — weight (kg) ÷ height (m)². A rough population-level screening number, not a precise measure of body composition (it can't tell fat from muscle). Standard bands: under 18.5 Underweight, 18.5–24.9 Normal, 25–29.9 Overweight, 30+ Obese. Updates automatically from your latest weigh-in." },
  expenditure: { title: "Adaptive expenditure (TDEE)", body: "Your real daily energy burn, worked out from energy balance rather than a formula: it takes the calories you've actually logged over the last couple of weeks and adds the energy behind your weight-trend change (about 7700 kcal per kg). If your weight is dropping faster than your intake alone explains, you're burning more than a BMR×activity estimate assumes — so this number is more accurate, and it re-tunes itself as you keep logging. The suggested target is simply this expenditure minus the deficit from your chosen Pace, so it always respects how aggressive you want to be. It needs about 2 weeks of food + weight logging before it can show." },
  insights: { title: "Insights & Focus", body: "Patterns are computed straight from your last 4 weeks of logs — no AI, no guesswork: which weekday runs hottest, weekends vs weekdays, how often you hit protein, your usual eating window, how consistent your intake is, and whether short sleep nudges you to eat more. \"Focus this week\" picks the single change with the most leverage, in strict priority order: logging gaps first (nothing else is trustworthy without data), then weekend overshoot, then a problem weekday, then protein, then late-night eating. Fix the top one and the next appears." },
  heatmap: { title: "Adherence calendar", body: "One cell per day: green means you logged and stayed under your calorie budget, amber means you logged but went over, dim means nothing was logged. It's the honest month view — a wall of green with a few ambers is winning; lots of dim days means the problem is logging, not eating. Tap any day to open it on Today." },
  challenge: { title: "Weekly challenge", body: "One concrete, countable goal per week, picked automatically from your own weak spot (same logic as Focus) — log daily, hold the weekend, hit protein 5 times, close the kitchen by 9:30, or stay on target 5 days. It's locked in when the week starts, so it won't change under you mid-week. The bar fills as days qualify." },
  records: { title: "Records", body: "All-time bests computed from your actual logs: longest streaks, best week, biggest 7-day trend drop, longest overnight fast, most active week. They only ever go up — a bad week can't take a record away, it just doesn't set one." },
  recap: { title: "Monthly recap", body: "Each month's story in six numbers: weight trend (from the smoothed 7-day average, not single weigh-ins), days logged, days on target, average deficit, workouts, and calories burned. Use ‹ › to browse past months, and \"Share as image\" to render it as a clean card you can send or save." },
};
// Shared BMI band → color mapping, used by both the gauge visual and the
// plain-text category label wherever it's shown, so they always agree.
function bmiCategoryColor(v) {
  return v < 18.5 ? "var(--blue)" : v < 25 ? "var(--accent)" : v < 30 ? "var(--amber)" : "var(--red)";
}
function bmiGauge(v) {
  const cx = 110, cy = 112, r = 84, sw = 13, MIN = 15, MAX = 40, gap = 0.55;
  const ang = (x) => Math.PI * (1 - (clamp(x, MIN, MAX) - MIN) / (MAX - MIN)); // MIN→π (left), MAX→0 (right)
  const pt = (x, rad = r) => [cx + rad * Math.cos(ang(x)), cy - rad * Math.sin(ang(x))];
  const arc = (a, b, color) => {
    const [x1, y1] = pt(a), [x2, y2] = pt(b);
    return `<path d="M${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 0 1 ${x2.toFixed(1)},${y2.toFixed(1)}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="butt"/>`;
  };
  const bands = [[15, 18.5, "var(--blue)"], [18.5, 25, "var(--accent)"], [25, 30, "var(--amber)"], [30, 40, "var(--red)"]];
  const cat = v < 18.5 ? "Underweight" : v < 25 ? "Normal" : v < 30 ? "Overweight" : "Obese";
  const catColor = bmiCategoryColor(v);
  const [mx, my] = pt(v); // marker sits on the arc centerline
  const tick = (x, label) => { const [tx, ty] = pt(x, r + 12); return `<text x="${tx.toFixed(1)}" y="${(ty + 3).toFixed(1)}" font-size="8.5" fill="var(--muted)" text-anchor="middle">${label}</text>`; };
  return `<svg viewBox="0 0 220 148" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:270px;display:block;margin:6px auto 0">
    ${bands.map((b, i) => arc(b[0] + (i ? gap : 0), b[1] - (i < bands.length - 1 ? gap : 0), b[2])).join("")}
    ${tick(18.5, "18.5")}${tick(25, "25")}${tick(30, "30")}
    <circle cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="7.5" fill="${catColor}" stroke="var(--bg)" stroke-width="3.5"/>
    <text x="${cx}" y="${cy - 6}" font-size="34" font-weight="800" letter-spacing="-1" fill="var(--text)" text-anchor="middle">${r1(v)}</text>
    <text x="${cx}" y="${cy + 12}" font-size="11.5" font-weight="700" fill="${catColor}" text-anchor="middle" style="text-transform:uppercase;letter-spacing:0.5px">${cat}</text>
  </svg>`;
}
function openInfo(key) {
  const g = GLOSSARY[key]; if (!g) return;
  $("#infoPopupTitle").textContent = g.title;
  $("#infoPopupBody").textContent = g.body;
  const vis = $("#infoPopupVisual");
  if (key === "bmi" && state.weights.length && state.profile) {
    vis.innerHTML = bmiGauge(bmi(currentWeight(), state.profile.heightCm).val);
  } else vis.innerHTML = "";
  $("#infoPopup").classList.remove("hidden");
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-info]");
  if (b) openInfo(b.dataset.info);
});
wireSheetClose("infoPopup", "infoPopupClose");

// Keyboard handling: rather than lifting the whole sheet (which shoves it
// off-screen), we expose the keyboard height as --kb (used as scroll-area
// padding) and simply scroll the focused field into view. The keyboard may
// cover the rest of the panel — only the active field needs to stay visible.
(function () {
  const vv = window.visualViewport;
  let kb = 0;
  const revealFocused = () => {
    const el = document.activeElement;
    if (!el || !el.closest || !el.closest(".sheet")) return;
    if (!/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  };
  if (vv) {
    const update = () => {
      kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty("--kb", kb + "px");
      if (kb > 120) setTimeout(revealFocused, 60);
    };
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    update();
  }
  // Fallback for runtimes without visualViewport resize on keyboard: scroll on focus.
  document.addEventListener("focusin", (e) => {
    if (e.target.closest && e.target.closest(".sheet")) setTimeout(() => e.target.scrollIntoView({ block: "center", behavior: "smooth" }), 260);
  });
})();
function renderGlossary() {
  $("#glossaryList").innerHTML = Object.keys(GLOSSARY).map((key) =>
    `<li data-info="${key}"><span class="row-label">${esc(GLOSSARY[key].title)}</span><span class="ic" data-ic="chevR"></span></li>`).join("");
  renderIcons($("#glossaryList"));
}
// The calorie target that applied on a given day — targets change over time
// (pace switches, goal achieved), and history/adherence should be judged
// against the target of that day, not today's.
function targetFor(k) {
  const h = (state.profile && state.profile.kcalTargetHistory) || [];
  let t = state.profile.kcalTarget;
  for (const e of h) { if (e.from <= k) t = e.kcal; else break; }
  return t;
}
function recordTargetChange(kcal) {
  const p = state.profile;
  if (!p.kcalTargetHistory) p.kcalTargetHistory = [];
  p.kcalTargetHistory = p.kcalTargetHistory.filter((e) => e.from !== todayKey());
  p.kcalTargetHistory.push({ from: todayKey(), kcal });
  p.kcalTargetHistory.sort((a, b) => (a.from < b.from ? -1 : 1));
}
function budgetFor(k) {
  const p = state.profile;
  return targetFor(k) + (p.eatBack ? dayTotals(k).active : 0);
}

function dailyWeights(entries) {
  const byDay = {};
  for (const e of entries) (byDay[e.d] = byDay[e.d] || []).push(e.kg);
  return Object.keys(byDay).sort().map((d) => ({ d, kg: byDay[d].reduce((a, b) => a + b, 0) / byDay[d].length }));
}
function movingAvg(entries, w = 7) {
  const daily = dailyWeights(entries);
  return daily.map((e) => {
    const from = addDays(e.d, -(w - 1));
    const win = daily.filter((x) => x.d >= from && x.d <= e.d);
    return { d: e.d, v: win.reduce((s, x) => s + x.kg, 0) / win.length };
  });
}
function weightTrendPerDay() {
  const ma = movingAvg(state.weights);
  const cutoff = addDays(todayKey(), -14);
  const pts = ma.filter((e) => e.d >= cutoff);
  if (pts.length < 3) return null;
  return linRegSlope(pts);
}

/* ---------- onboarding ---------- */
const OB_STEPS = 6;
const ob = { step: 0, sex: "male", activity: 1.2, deficit: 750, supplements: [], goals: [], schedule: defaultTrainingSchedule(), activeWorkoutIds: [] };
function showOnboarding() {
  $("#onboarding").classList.remove("hidden");
  $("#obSex").addEventListener("click", (e) => segPick(e, "#obSex", (v) => (ob.sex = v)));
  $("#obActivity").addEventListener("click", (e) => segPick(e, "#obActivity", (v) => (ob.activity = parseFloat(v))));
  $("#obPace").addEventListener("click", (e) => segPick(e, "#obPace", (v) => { ob.deficit = parseInt(v, 10); obSummary(); }));
  $("#obNext").addEventListener("click", obNext);
  $("#obBack").addEventListener("click", () => obGo(ob.step - 1));
  $("#obGoalAdd").addEventListener("click", () => {
    const label = $("#obGoalLabel").value.trim() || "Goal";
    const targetKg = parseFloat($("#obGoalTargetKg").value);
    const date = $("#obGoalDate").value;
    if (!targetKg || !date) return toast("Enter a target weight and date");
    ob.goals.push({ id: "g" + Date.now() + ob.goals.length, label, targetKg, date, created: todayKey() });
    $("#obGoalLabel").value = ""; $("#obGoalTargetKg").value = ""; $("#obGoalDate").value = "";
    renderObGoals();
  });
  $("#obSuppAdd").addEventListener("click", () => {
    const name = $("#obSuppName").value.trim();
    if (!name) return toast("Enter a name");
    ob.supplements.push({ id: "s" + Date.now(), name, note: $("#obSuppNote").value.trim() });
    $("#obSuppName").value = ""; $("#obSuppNote").value = "";
    renderObSupps();
  });
  renderObSchedule();
}
function renderObSchedule() {
  $("#obActiveWorkoutChips").innerHTML = EXERCISES.map((w) =>
    `<button data-id="${w.id}" class="${ob.activeWorkoutIds.includes(w.id) ? "active" : ""}">${esc(w.name)}</button>`).join("");
  $$("#obActiveWorkoutChips button").forEach((b) => b.addEventListener("click", () => {
    const id = b.dataset.id, idx = ob.activeWorkoutIds.indexOf(id);
    if (idx >= 0) {
      ob.activeWorkoutIds.splice(idx, 1);
      for (const dk of DAY_KEYS) { const arr = ob.schedule[dk], i2 = arr.indexOf(id); if (i2 >= 0) arr.splice(i2, 1); }
    } else ob.activeWorkoutIds.push(id);
    b.classList.toggle("active");
    renderObScheduleRows();
  }));
  renderObScheduleRows();
}
function renderObScheduleRows() {
  const active = ob.activeWorkoutIds.map((id) => EXERCISES.find((w) => w.id === id)).filter(Boolean);
  $("#obScheduleRows").innerHTML = active.length
    ? scheduleAssignRowsHTML(ob.schedule, active)
    : `<p class="muted">Pick at least one workout above to set which days it happens on.</p>`;
  renderIcons($("#obScheduleRows"));
  wireScheduleAssign("#obScheduleRows", ob.schedule, null);
}
function renderObGoals() {
  $("#obGoalList").innerHTML = ob.goals.length
    ? ob.goals.map((g) => `<li data-id="${g.id}"><span class="row-label"><span class="ic" data-ic="target"></span>${esc(g.label)} — ${r1(g.targetKg)}kg by ${fmtShort(g.date)}</span>
       <button class="fi-del" data-id="${g.id}"><span class="ic" data-ic="x"></span></button></li>`).join("")
    : `<li class="muted" style="border-top:none">Add at least one goal below.</li>`;
  renderIcons($("#obGoalList"));
  $$("#obGoalList .fi-del").forEach((b) => b.addEventListener("click", () => {
    ob.goals = ob.goals.filter((g) => g.id !== b.dataset.id);
    renderObGoals();
  }));
}
function renderObSupps() {
  $("#obSuppList").innerHTML = ob.supplements.length
    ? ob.supplements.map((s) =>
        `<li><span class="row-label">${esc(s.name)}${s.note ? " — " + esc(s.note) : ""}</span>
         <button class="fi-del" data-id="${s.id}"><span class="ic" data-ic="x"></span></button></li>`).join("")
    : `<li class="muted" style="border-top:none">Nothing added yet.</li>`;
  renderIcons($("#obSuppList"));
  $$("#obSuppList .fi-del").forEach((b) => b.addEventListener("click", () => {
    ob.supplements = ob.supplements.filter((s) => s.id !== b.dataset.id);
    renderObSupps();
  }));
}
function segPick(e, sel, cb) {
  const b = e.target.closest("button"); if (!b) return;
  $$(sel + " button").forEach((x) => x.classList.toggle("active", x === b));
  cb(b.dataset.val);
}
function obAge() { return ageFromDob($("#obDob").value); }
function obNext() {
  if (ob.step === 0 && !(obAge() >= 14)) return toast("Enter a valid date of birth");
  if (ob.step === 1) {
    if (!parseFloat($("#obHeight").value) || !parseFloat($("#obWeight").value)) return toast("Enter height and weight");
  }
  if (ob.step === 2 && !ob.goals.length) return toast("Add at least one goal");
  if (ob.step === OB_STEPS - 1) return obFinish();
  obGo(ob.step + 1);
}
function obGo(n) {
  const prevStep = ob.step;
  ob.step = clamp(n, 0, OB_STEPS - 1);
  $$(".ob-step").forEach((s) => s.classList.toggle("hidden", +s.dataset.step !== ob.step));
  $("#obBack").classList.toggle("hidden", ob.step === 0);
  $("#obNext").textContent = ob.step === OB_STEPS - 1 ? "Start" : "Continue";
  $("#obBar").style.width = ((ob.step + 1) / OB_STEPS) * 100 + "%";
  // Same fade/slide-up animation the tab views use, reused here for step
  // changes — void offsetWidth forces a reflow so re-adding the class
  // restarts the animation even when moving between steps rapidly.
  if (!prefersReducedMotion() && prevStep !== ob.step) {
    const el = $(`.ob-step[data-step="${ob.step}"]`);
    el.classList.remove("view-anim"); void el.offsetWidth; el.classList.add("view-anim");
  }
  if (ob.step === 3) {
    const t = r0(bmr(ob.sex, parseFloat($("#obWeight").value), parseFloat($("#obHeight").value), obAge()) * ob.activity);
    $("#obTdee").textContent = t;
    obSummary();
  }
}
function obSummary() {
  const w = parseFloat($("#obWeight").value), h = parseFloat($("#obHeight").value), age = obAge();
  const t = r0(bmr(ob.sex, w, h, age) * ob.activity);
  let target = t - ob.deficit, floorNote = "";
  const floor = kcalFloor(ob.sex);
  if (target < floor) { target = floor; floorNote = `<br>⚠️ Capped at ${floor} kcal — safe minimum.`; }
  const protein = r0(w * 1.6);
  $("#obSummary").innerHTML =
    `Daily target: <strong>${target} kcal</strong> · Protein: <strong>${protein} g</strong>${floorNote}`;
}
// Shown once per version bump to an existing user (never on first install —
// obFinish() stamps lastSeenVersion immediately so brand-new users skip it).
const WHATS_NEW = {
  "3.11.0": [
    "The shared food library is no longer open to the internet. Browsing works for everyone, but publishing, editing and deleting now need a library key — paste it once under Settings → Shared food library.",
    "Foods you publish now belong to you: only the device that added a food can edit or delete it, so nobody can overwrite or wipe someone else's entry. Edit and delete buttons only appear on your own foods.",
    "The library is snapshotted daily on the server, so an accidental delete can be recovered.",
  ],
  "3.10.1": [
    "Saving a food from Quick Add, Photo or a barcode scan now always lands you on the Custom tab, even when the food sheet wasn't already open.",
    "If your device ever runs out of storage, FitTrack now tells you instead of failing silently.",
    "Shared library and update checks time out cleanly instead of hanging when the connection drops.",
  ],
  "3.10.0": [
    "Display name — set yours under Settings → Profile; it's shown next to foods you publish so everyone can see who shared what.",
    "Shared tab: pull down to refresh the list.",
    "Shared tab: swipe a food left to edit or delete it — edits and deletes apply for everyone, and renaming is safe.",
  ],
  "3.9.0": [
    "Build custom foods from real ingredients — start typing an ingredient name and pick from your custom foods, the shared library, the built-in database, or an Open Food Facts search. Macros fill in automatically; you just enter the amount.",
  ],
  "3.8.0": [
    "Shared food library — a new Shared tab in the food sheet lists foods published by any FitTrack user. Tap to log one, or use its copy button to save it into your own custom foods.",
    "One-tap food sharing — the share button on a custom food now publishes it straight to the shared library (no more exporting/importing JSON files). Republishing the same name fixes its values.",
    "Update alerts — Today shows a banner when a newer FitTrack build is out, with a button that jumps straight to SideStore. No more manual checking.",
    "Fixed: reopening the app on a new day could still show yesterday as \"Today\" until a restart — it now rolls over the moment the app comes back to the foreground.",
  ],
  "3.0": [
    "Apple Health sync — pull weight, steps, and sleep in automatically (Settings → Apple Health), read-only.",
    "Breakfast, Lunch, Dinner, and Snacks are now one list on Today, grouped under subheaders with icons and a per-category total, auto-categorized by the time you log — snacks are a toggle instead, since they don't belong to a time window.",
    "Describe multiple foods at once — \"eggs, toast, and coffee\" splits into separate items you can review before saving, alongside the existing single-item Describe.",
    "\"Fits your remaining macros\" suggestions on Today — recent foods first, ranked toward whatever you're short on.",
    "Describe your workout — natural-language activity logging, the same \"Describe\" flow food already has.",
    "Plateau detection on Progress — flags a stall if your weight isn't moving despite a real logged deficit.",
    "AI weekly review — a short plain-English summary of your week, generated on-device.",
    "Detailed Trend now shows real dates on its axis (not just day-of-week) and a fuller Insights & Data section — 30-day change, current weekly pace, all-time highs/lows.",
    "The \"Weekly review ready\" badge now actually opens your week's summary.",
    "Onboarding: date of birth instead of a raw age field, add as many goals as you want instead of two fixed ones, and smoother animated steps.",
    "Supplements and Goals: swipe left for Edit/Delete, drag to reorder supplements, long names auto-scroll.",
    "Settings: Profile and Targets redesigned with icon stat cards (long-press either to edit); a \"What's New\" button so you can always come back to this list.",
    "New app icon.",
  ],
  "3.1": [
    "Fixed Apple Health not showing up at all in iOS Settings — the app now actually requests the HealthKit permission properly, so it can be granted.",
    "Fixed \"Export backup\" not producing a file you could find — it now hands off to the Share sheet so you can actually save it to Files, AirDrop it, etc.",
    "Fixed long-pressing Profile or Targets to edit sometimes selecting text and popping the keyboard open.",
    "Fixed the What's New list running off the bottom of the screen on longer updates — it scrolls now.",
  ],
  "3.2": [
    "Training schedule — set a recurring weekly pattern (or rest days) on the Training tab, see the current week at a glance, and tap through to a full month view. Set it up during onboarding or edit it anytime in Training or Settings.",
    "Custom workouts — save your own named workouts with an intensity level, usable in your training schedule.",
    "Share custom foods and workouts with anyone else running FitTrack — export one as a file via the Share sheet, they import it from Settings and it's added straight to their library.",
    "Goals: the progress bar and the time-remaining bar are now the same length, with days/months left shown directly on the bar, plus how many kg are left next to how many you've lost.",
  ],
  "3.3": [
    "Goal bars now show ahead/behind schedule at a glance — the green bar is your actual progress, the thin grey bar under it is where you'd be if perfectly on pace.",
    "Training: manage your schedule from a per-workout list instead of a wall of toggles — add a workout from a searchable picker, set its days and an optional reminder right on its row.",
    "Take a break — pause your training schedule for a set number of days/weeks/months; it resumes exactly as it was once the break ends.",
    "This week strip now shows a compact icon + count per day instead of a name that could run long, so it no longer overflows on any screen size — today is now outlined in yellow.",
    "Apple Health: \"Sync now\" always asks for permission, even if you haven't turned on a specific type yet.",
  ],
  "3.4": [
    "Custom foods: swipe left to Share, Edit, or Delete, same as everywhere else in the app — the favorite star stays put since that's a one-tap action.",
  ],
  "3.5": [
    "Insights on Progress — plain-English patterns from your last 4 weeks (weekday habits, weekends vs weekdays, protein hit-rate, eating window, sleep vs intake) plus a \"Focus this week\" card that picks the one highest-leverage thing to work on.",
    "Adherence heatmap — a month at a glance, green for on-target days, amber for over, with month navigation; tap any day to open it.",
    "Viewing a past day now looks different from today — amber header, a \"Return to today\" pill, and the rings read as a verdict (\"kcal under/over\") instead of a live budget.",
    "Sharper charts everywhere: value gridlines, mid-range date labels, a zero line on the +/− charts, and an emphasized \"you are here\" dot on trend lines.",
    "Recent sessions shows the latest five with real per-activity icons (runs look like runs, walks like walks, timer workouts get a timer) — tap the card for a full Activity History with weekly burn, 30-day totals, and per-activity breakdowns.",
    "Day notes — jot anything worth remembering on any day; notes show up in the weight chart's tooltips so spikes are explainable later.",
    "Export your whole history as a spreadsheet (CSV) from Settings, next to the JSON backup.",
    "Smoother feel: rings sweep in and the numbers count up on open/day change, cards cascade in on tab switch, charts draw in — all skipped when Reduce Motion is on.",
    "Redrawn icons for Activity, Supplements, Weight, and the walk/run figures.",
    "Fixed the water drops wrapping into a lopsided second row, Sleep & Steps misaligned double forms, the week strip cutting off Sunday, and \"avg deficit\" showing a confusing minus sign on what is already a deficit.",
  ],
  "3.5.1": [
    "Supplement history — tap the Supplements card for per-supplement 30-day adherence: taken/total, %, current streak, and a day-by-day strip.",
    "Meal Gaps got real insights: how many times a day you eat (items within 30 min count as one sitting), your average overnight fast, average first/last meal, and a \"when you eat\" hour-of-day chart with your busiest hour highlighted.",
    "Detailed Trend's y-axis now stays pinned while you scroll through history, and your goal selection on the weight page is remembered instead of resetting every open.",
    "Activity History's All Sessions is now one week at a time with ‹ › paging (like the Progress Summary) instead of one endless list.",
    "Every back-in-time control now stops at your first logged day — weekly/monthly summary paging and the training-schedule month view included.",
    "Weight and Waist logs collapse to 5 rows with Show all / Show less.",
    "Notes is now press-to-edit, so scrolling past it can't pop the keyboard open.",
    "Water drops all sit on the same line now.",
    "Apple Health: added an honest note in Settings — SideStore's free-account signing strips the HealthKit permission at install, so sync can't work under the current setup. Not a FitTrack bug; manual logging stays the reliable path.",
  ],
  "3.6": [
    "Weekly challenge on Today — one concrete, countable goal per week (log every day, hold the weekend, hit protein 5×, kitchen closed by 9:30, …), auto-picked from your own weak spot and locked in at the start of each week with a live progress bar.",
    "Records on Progress — all-time bests straight from your data: longest on-target and logging streaks, best week, biggest 7-day trend drop, longest overnight fast, most active week. No badges, no confetti — just receipts.",
    "Monthly recap on Progress — each month's weight trend, logging, on-target days, deficit, and workouts, browsable month by month, with a \"Share as image\" button that renders a clean recap card for sending or saving.",
    "Apple Health is gone. The honest version: SideStore's free-account signing strips the HealthKit permission at install time, so the sync could never actually run on your phone — the toggles were dead weight. Removed rather than left there looking broken. If SideStore adds HealthKit support upstream, it can come back.",
  ],
  "3.7": [
    "Servings / Grams / ml now works for every food, not just barcode scans. If a food doesn't carry a serving weight, a \"1 serving = __\" field appears when you switch to grams or ml — enter it once and it's remembered for that food from then on.",
    "Goal reached! Hitting a goal now gets a real moment — a full-screen celebration with how much you lost, how long it took, and your average pace, plus a \"Share as image\" card. It waits for you if a late weigh-in crosses the line while the app's closed.",
    "Backup reminders — your data lives only on this phone, so FitTrack now nudges you to export a copy when you've never backed up or it's been over 45 days. Settings shows when you last backed up. Dismissable, never naggy.",
    "New here after the recent updates? A one-time card on Today points out Insights, the weekly challenge, and where history lives — and every ⓘ now explains Insights, the adherence calendar, challenges, records, and the monthly recap.",
  ],
  "3.7.1": [
    "Fixed Detailed Trend: the pinned y-axis was rendering as a giant number spilling over the whole page, and the chart opened at the oldest week instead of the newest. Both sorted — the axis sits quietly on the right and the chart opens on your most recent weigh-ins.",
  ],
};
function showWhatsNewSheet(version) {
  const entry = WHATS_NEW[version];
  if (!entry) return toast("No changelog for this version");
  $("#whatsNewTitle").textContent = `What's new in v${version}`;
  $("#whatsNewList").innerHTML = entry.map((x) => `<li>${esc(x)}</li>`).join("");
  $("#whatsNewSheet").classList.remove("hidden");
}
function maybeShowWhatsNew() {
  if (state.settings.lastSeenVersion !== APP_VERSION) {
    state.settings.lastSeenVersion = APP_VERSION; save();
    showWhatsNewSheet(APP_VERSION);
  }
}
wireSheetClose("whatsNewSheet", "whatsNewClose");
// Manual reopen from Settings → About — the auto-popup only ever fires once
// per version bump, this lets the user revisit it anytime after that.
$("#whatsNewOpenBtn").addEventListener("click", () => showWhatsNewSheet(APP_VERSION));
$("#whatsNewGotIt").addEventListener("click", () => $("#whatsNewSheet").classList.add("hidden"));

function obFinish() {
  const w = parseFloat($("#obWeight").value), h = parseFloat($("#obHeight").value), dob = $("#obDob").value, age = ageFromDob(dob);
  const t = r0(bmr(ob.sex, w, h, age) * ob.activity);
  state.profile = {
    sex: ob.sex, age, birthDate: dob, heightCm: h, startWeightKg: w, startDate: todayKey(), activity: ob.activity,
    kcalTarget: Math.max(t - ob.deficit, kcalFloor(ob.sex)),
    proteinTarget: r0(w * 1.6), waterTargetMl: 2500, moveTarget: 200, eatBack: false,
    targetDeficit: ob.deficit, autoAdjust: false,
  };
  state.profile.kcalTargetHistory = [{ from: todayKey(), kcal: state.profile.kcalTarget }];
  state.goals = ob.goals;
  state.weights.push({ d: todayKey(), ts: new Date().toISOString(), kg: w });
  if (ob.supplements.length) state.supplements = ob.supplements;
  state.trainingSchedule = ob.schedule;
  state.activeWorkoutIds = ob.activeWorkoutIds;
  state.settings.lastSeenVersion = APP_VERSION; // brand-new install — skip the What's New popup
  save();
  $("#onboarding").classList.add("hidden");
  startApp();
}

/* ---------- tabs ---------- */
function prefersReducedMotion() {
  return !!(state.settings && state.settings.reduceMotion) || (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}
function applyMotionPref() { document.body.classList.toggle("no-motion", prefersReducedMotion()); }
const TAB_ORDER = ["today", "progress", "training", "body", "settings"];
let currentView = null;
function switchView(name) {
  if (currentView === name) { window.scrollTo(0, 0); return; }
  if (currentView !== null) haptic("light");
  currentView = name;
  $$(".view").forEach((v) => v.classList.toggle("hidden", v.id !== "view-" + name));
  $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === name));
  if (!prefersReducedMotion()) {
    const el = $("#view-" + name);
    el.classList.remove("view-anim"); void el.offsetWidth; el.classList.add("view-anim");
  }
  if (name === "today") renderToday();
  if (name === "progress") renderProgress();
  if (name === "training") renderTraining();
  if (name === "body") renderBody();
  if (name === "settings") renderSettings();
  window.scrollTo(0, 0);
}
// Finger-tracking nav: drag across the bar and the page lands on whichever tab
// your finger is over when you let go (taps still work via the click handlers).
(function setupNavSlider() {
  const bar = $(".tabbar");
  const tabs = [...bar.querySelectorAll(".tab")];
  let dragging = false, startX = 0, moved = false, hover = -1;
  const idxAt = (x) => { const r = bar.getBoundingClientRect(); return clamp(Math.floor((x - r.left) / r.width * tabs.length), 0, tabs.length - 1); };
  const setHover = (i) => { if (i === hover) return; hover = i; tabs.forEach((t, j) => t.classList.toggle("tab-hover", j === i)); };
  const clearHover = () => { hover = -1; tabs.forEach((t) => t.classList.remove("tab-hover")); };
  bar.addEventListener("pointerdown", (e) => { dragging = true; startX = e.clientX; moved = false; });
  bar.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    if (!moved && Math.abs(e.clientX - startX) > 8) { moved = true; try { bar.setPointerCapture(e.pointerId); } catch (_) {} }
    if (moved) setHover(idxAt(e.clientX));
  });
  const end = (e) => {
    if (!dragging) return; dragging = false;
    if (!moved) return;
    const v = tabs[idxAt(e.clientX)].dataset.view; clearHover();
    if (v && v !== $(".tab.active").dataset.view) { haptic("light"); switchView(v); }
    const block = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
    bar.addEventListener("click", block, { capture: true, once: true });
    setTimeout(() => bar.removeEventListener("click", block, true), 300);
  };
  bar.addEventListener("pointerup", end);
  bar.addEventListener("pointercancel", () => { dragging = false; clearHover(); });
})();

/* ---------- daily metrics ---------- */
function ringMetrics(k) {
  const p = state.profile, t = dayTotals(k);
  const budget = budgetFor(k);
  const cal = budget ? t.kcal / budget : 0;
  const pro = p.proteinTarget ? t.p / p.proteinTarget : 0;
  const mov = p.moveTarget ? t.active / p.moveTarget : 0;
  return { t, budget, cal, pro, mov, remaining: budget - t.kcal };
}
// Rings that have already played their completion pulse this session, keyed
// "date-ringKey" — in-memory only (resets on app restart, which is fine for
// a cosmetic one-time celebration; not worth persisting to dayLog for this).
const celebratedRings = new Set();
function drawRings(m, k, animate) {
  const cx = 95, cy = 95;
  const rings = [
    { key: "cal", r: 83, pct: m.cal, color: "var(--amber)", over: "var(--amber-over)" },
    { key: "pro", r: 65, pct: m.pro, color: "var(--accent)", over: "var(--accent-over)" },
    { key: "mov", r: 47, pct: m.mov, color: "var(--blue)", over: "var(--blue-over)" },
  ];
  let circles = "", justCompleted = false;
  rings.forEach((rg) => {
    // A tiny minimum sliver (like Apple's Activity rings) so each ring still
    // reads as "this ring is orange/green/blue" at exactly 0% instead of
    // looking like a plain dead grey circle before anything's logged.
    const C = 2 * Math.PI * rg.r, pct = rg.pct, first = Math.max(clamp(pct, 0, 1), 0.015);
    // Only today's rings can "just complete", and only protein/active — going
    // over on calories is the opposite of an achievement, so that ring never
    // celebrates. Flipping back to a past day that already hit 100% also
    // shouldn't replay the celebration.
    const celebKey = `${k}-${rg.key}`;
    const celebrates = rg.key !== "cal";
    const isNewCompletion = celebrates && k === todayKey() && pct >= 1 && !celebratedRings.has(celebKey);
    if (celebrates && k === todayKey() && pct >= 1) celebratedRings.add(celebKey);
    if (isNewCompletion) justCompleted = true;
    circles += `<g${isNewCompletion ? ' class="ring-pulse"' : ""}>`;
    circles += `<circle cx="${cx}" cy="${cy}" r="${rg.r}" fill="none" stroke="var(--track)" stroke-width="12"/>`;
    circles += `<circle class="ring-prog" cx="${cx}" cy="${cy}" r="${rg.r}" fill="none" stroke="${rg.color}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}" data-final="${C * (1 - first)}"/>`;
    // Over budget: a second lap wraps over the first in a darker shade of the
    // same colour (explicit colour, not a CSS filter, so it renders in WKWebView).
    if (pct > 1) {
      const over = Math.min(pct - 1, 1);
      circles += `<circle class="ring-prog" cx="${cx}" cy="${cy}" r="${rg.r}" fill="none" stroke="${rg.over}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}" data-final="${C * (1 - over)}"/>`;
    }
    circles += `</g>`;
  });
  // Past days read as a verdict ("under"/"over"), today as a live budget.
  const past = k !== todayKey();
  $("#ringsWrap").innerHTML =
    `<svg viewBox="0 0 190 190">${circles}</svg>
     <div class="rings-center">
       <span class="big ${m.remaining < 0 ? "over" : ""}">${r0(Math.abs(m.remaining))}</span>
       <label>${m.remaining < 0 ? (past ? "kcal over" : "OVER") : past ? "kcal under" : "kcal left"}</label>
     </div>`;
  // Sweep the arcs in from empty on load/day-change; jump straight to the
  // final value on ordinary re-renders (e.g. after logging a food).
  const progs = $$("#ringsWrap .ring-prog");
  if (animate) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      progs.forEach((c) => { c.style.transition = "stroke-dashoffset 0.5s var(--ease)"; c.style.strokeDashoffset = c.dataset.final; });
    }));
  } else progs.forEach((c) => { c.style.strokeDashoffset = c.dataset.final; });
  if (justCompleted) haptic();
}
// Counts a leading integer up from 0 in place, keeping any suffix ("/1900",
// "g", …) static. Used by the ring legend + center on load/day-change.
function countUpEls(els, dur = 450) {
  els.forEach((el) => {
    const final = el.textContent, mtc = final.match(/^(\d+)(.*)$/s);
    if (!mtc) return;
    const target = +mtc[1], rest = mtc[2], t0 = performance.now();
    const tick = (t) => {
      const f = Math.min(1, (t - t0) / dur), eased = 1 - Math.pow(1 - f, 3);
      el.textContent = r0(target * eased) + rest;
      if (f < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
let ringsAnimKey = null;
function renderStats(k) {
  const m = ringMetrics(k), p = state.profile;
  const animate = !prefersReducedMotion() && ringsAnimKey !== k;
  ringsAnimKey = k;
  drawRings(m, k, animate);
  $("#ringLegend").innerHTML = [
    { lab: "Calories", val: `${r0(m.t.kcal)}/${r0(m.budget)}`, c: "var(--amber)" },
    { lab: "Protein", val: `${r0(m.t.p)}/${p.proteinTarget}g`, c: "var(--accent)" },
    { lab: "Active", val: `${r0(m.t.active)}/${p.moveTarget}`, c: "var(--blue)" },
  ].map((x) => `<div class="rl-item"><span class="rl-dot" style="background:${x.c}"></span><span class="rl-val">${x.val}</span><span class="rl-lab">${x.lab}</span></div>`).join("");
  if (animate) countUpEls([...$$("#ringLegend .rl-val"), $("#ringsWrap .rings-center .big")].filter(Boolean));
}

/* ---------- Trends (tap the rings) ---------- */
let trendMetric = uiPrefs.trendMetric || "kcal", trendRange = uiPrefs.trendRange || 30;
const TREND_META = {
  kcal: { lab: "Calories", unit: "kcal", color: "var(--orange)", target: () => budgetFor(todayKey()) },
  p: { lab: "Protein", unit: "g", color: "var(--c-protein)", target: () => state.profile.proteinTarget },
  c: { lab: "Carbs", unit: "g", color: "var(--c-carbs)", target: () => null },
  f: { lab: "Fat", unit: "g", color: "var(--c-fat)", target: () => null },
};
function renderTrends() {
  const meta = TREND_META[trendMetric], unit = meta.unit;
  const entries = [];
  for (let i = trendRange - 1; i >= 0; i--) {
    const dk = addDays(todayKey(), -i), t = dayTotals(dk);
    if (t.items > 0) entries.push({ d: dk, kg: r0(t[trendMetric]) });
  }
  const ma = movingAvg(entries); // entries are one-per-day, so this is a 7-day smoothed line
  const tgt = meta.target();
  const goals = tgt != null ? [{ v: tgt, achieved: false }] : [];
  $("#trendChart").innerHTML = lineChart({ entries, ma, goals, unit, projDays: 0, rawLine: true, color: meta.color, goalColor: "var(--text)", goalLabel: trendMetric === "kcal" ? "target" : "" });
  $("#trendLegend").style.setProperty("--ma-color", meta.color);
  $$("#trendMetricChips button").forEach((b) => b.classList.toggle("active", b.dataset.m === trendMetric));
  $$("#trendRangeChips button").forEach((b) => b.classList.toggle("active", +b.dataset.d === trendRange));
  if (!entries.length) {
    $("#trendAvg").textContent = "—"; $("#trendDiff").textContent = "—";
    $("#trendStats").innerHTML = `<div class="stat-box"><div class="v">0</div><div class="k">days logged</div></div>`;
    return;
  }
  const vals = entries.map((e) => e.kg);
  const avg = r0(vals.reduce((a, b) => a + b, 0) / vals.length);
  const diff = ma.length >= 2 ? r0(ma[ma.length - 1].v - ma[0].v) : 0;
  $("#trendAvg").innerHTML = `${avg} <span class="th-lab" style="display:inline">${unit}</span>`;
  $("#trendDiff").innerHTML = ma.length >= 2
    ? `<span class="${diff <= 0 ? "t-green" : "t-amber"}">${diff > 0 ? "+" : ""}${diff} ${unit}</span>`
    : "—";
  const hi = Math.max(...vals), lo = Math.min(...vals);
  const vsT = tgt != null ? avg - tgt : null;
  $("#trendStats").innerHTML = `
    <div class="stat-box"><div class="v">${avg}</div><div class="k">avg / day (${unit})</div></div>
    ${vsT != null ? `<div class="stat-box"><div class="v">${vsT > 0 ? "+" : ""}${r0(vsT)}</div><div class="k">vs target</div></div>` : `<div class="stat-box"><div class="v">${entries.length}</div><div class="k">days logged</div></div>`}
    <div class="stat-box"><div class="v">${hi}</div><div class="k">highest day</div></div>
    <div class="stat-box"><div class="v">${lo}</div><div class="k">lowest day</div></div>`;
}
function renderExpenditureCard() {
  const el = $("#expenditureCard"); if (!el) return;
  const e = adaptiveExpenditure();
  if (!e) {
    el.innerHTML = `<p class="exp-need">Log food and weigh in for about 2 weeks and your real daily <b>expenditure</b> shows up here — worked out from how your weight actually moves against what you eat, so it beats any formula.</p>`;
    return;
  }
  const p = state.profile, rec = recommendedTarget(e.expenditure), cur = targetFor(todayKey());
  el.innerHTML = `
    <div class="exp-top">
      <div><span class="exp-lab">Your expenditure <button class="info-btn" data-info="expenditure"><span class="ic" data-ic="info"></span></button></span><div class="exp-val">${e.expenditure} <small>kcal/day</small></div></div>
      <div class="exp-trend ${e.weeklyChange <= 0 ? "t-green" : "t-amber"}">${e.weeklyChange > 0 ? "+" : ""}${e.weeklyChange}<small> kg/wk</small></div>
    </div>
    <p class="exp-sub">Your real TDEE from the last ${e.days} logged days — more accurate than the ${tdee()} formula estimate, and it retunes itself as you log. Suggested target keeps your chosen ${p.targetDeficit} kcal/day deficit.</p>
    <div class="exp-rec">
      <div><span class="exp-lab">Suggested target</span> <strong>${rec} kcal</strong>${rec === cur ? ` <span class="t-green">✓ current</span>` : ` <span class="muted">(now ${cur})</span>`}</div>
      ${rec !== cur ? `<button class="btn small" id="expApply">Use ${rec}</button>` : ""}
    </div>`;
  renderIcons(el);
  const b = $("#expApply");
  if (b) b.addEventListener("click", () => {
    p.kcalTarget = rec; recordTargetChange(rec); save();
    haptic(); toast(`Target set to ${rec} kcal`);
    renderExpenditureCard(); renderTrends(); renderToday();
  });
}
function openTrends() { renderExpenditureCard(); renderTrends(); $("#trendsSheet").classList.remove("hidden"); }
$("#ringsWrap").addEventListener("click", openTrends);
wireSheetClose("trendsSheet", "trendsClose");
$("#trendMetricChips").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; trendMetric = b.dataset.m; setPref("trendMetric", trendMetric); renderTrends(); });
$("#trendRangeChips").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; trendRange = +b.dataset.d; setPref("trendRange", trendRange); renderTrends(); });

/* ---------- streaks ----------
   Two different things people mean by "streak": did you show up and log
   (loggingStreak), and did you also land under your calorie target
   (targetStreak). They're tracked and shown separately. */
function loggedDay(k) { return dayTotals(k).items > 0; }
function dayComplete(k) { const t = dayTotals(k); return t.items > 0 && t.kcal <= budgetFor(k); }
function runStreak(testFn) {
  let s = 0, k = todayKey();
  if (!testFn(k)) k = addDays(k, -1);
  while (testFn(k)) { s++; k = addDays(k, -1); }
  return s;
}
function loggingStreak() { return runStreak(loggedDay); }
function targetStreak() { return runStreak(dayComplete); }
function streak() { return targetStreak(); } // kept for the Summary stat grid

/* ---------- Today ---------- */
// Auto-categorizes a logged item's meal from its time of day — the one
// merged list on Today no longer asks the user to pick Breakfast/Lunch/
// Dinner/Snacks manually; snacks are opted into explicitly instead (see the
// "This is a snack" toggle in the detail sheet) since they aren't tied to a
// time window the way the other three are.
function mealFromTime(timeStr) {
  const h = parseInt((timeStr || "").split(":")[0], 10);
  if (h < 11) return "breakfast";
  if (h < 16) return "lunch";
  if (h < 21) return "dinner";
  return "snacks";
}
function defaultMealForNow() { return mealFromTime(nowTimeStr()); }
function renderToday() {
  const k = viewDate, isToday = k === todayKey();
  $("#dayLabel").textContent = isToday ? "Today" : k === addDays(todayKey(), -1) ? "Yesterday" : fromKey(k).toLocaleDateString(undefined, { weekday: "long" });
  $("#daySub").textContent = fromKey(k).toLocaleDateString(undefined, { month: "long", day: "numeric" });
  $("#dayNext").disabled = isToday;
  // Past days get a visibly different treatment (amber header + a way back)
  // so you always know at a glance you're not looking at today.
  $("#view-today").classList.toggle("past-day", !isToday);
  $("#backTodayBtn").classList.toggle("hidden", isToday);

  renderStats(k);

  const ls = loggingStreak(), ts = targetStreak();
  $("#streakLine").textContent = ls > 0 ? `${ls}-day logging` : "No logging streak";
  $("#streakPill").classList.toggle("lit", ls > 0);
  $("#targetStreakLine").textContent = ts > 0 ? `${ts}-day on target` : "No target streak";
  $("#targetStreakPill").classList.toggle("lit", ts > 0);

  const prev = state.logs[addDays(k, -1)];
  const prevHasMeals = !!prev && MEALS.some((m) => (prev.meals[m.id] || []).length);
  const todayHasMeals = MEALS.some((m) => (dayLog(k).meals[m.id] || []).length);
  $("#copyYesterdayBtn").classList.toggle("hidden", !prevHasMeals || todayHasMeals);

  renderQuickRow();
  renderSuggestRow();
  renderMeals(k);
  renderExercises(k);
  renderWater(k);
  renderSupps(k);
  renderFasting();
  renderNote(k);
  renderChallenge();
  renderTour();
  renderBackupBanner();
  renderUpdateBanner();
}
// One-time orientation card — only on today, only until dismissed, and only
// once there's some history so it doesn't greet a brand-new user mid-onboarding.
function renderTour() {
  const show = viewDate === todayKey() && !state.settings.tourDismissed && state.weights.length >= 3;
  $("#tourCard").classList.toggle("hidden", !show);
}
$("#tourDismiss").addEventListener("click", () => {
  state.settings.tourDismissed = true; save(); haptic("light");
  $("#tourCard").classList.add("hidden");
});
// Data lives only in this device's localStorage on a sideloaded app — a lapsed
// re-sign or a delete wipes it. Nudge a backup when it's never happened or has
// gone stale, snoozable so it isn't nagging.
const BACKUP_STALE_DAYS = 45, BACKUP_SNOOZE_DAYS = 14;
function backupAgeDays() {
  const lb = state.settings.lastBackup;
  return lb ? Math.floor((Date.now() - new Date(lb).getTime()) / 86400000) : null;
}
function backupIsStale() {
  const age = backupAgeDays();
  return age === null || age >= BACKUP_STALE_DAYS;
}
function renderBackupBanner() {
  const snooze = state.settings.backupSnoozeUntil;
  const snoozed = snooze && todayKey() < snooze;
  const show = viewDate === todayKey() && state.weights.length >= 3 && backupIsStale() && !snoozed;
  $("#backupBanner").classList.toggle("hidden", !show);
  if (!show) return;
  const age = backupAgeDays();
  $("#backupBannerText").textContent = age === null
    ? "You've never backed up. Your data lives only on this phone — export a copy so a re-sign or reinstall can't wipe it."
    : `Last backup was ${age} days ago. Export a fresh copy to keep your history safe.`;
}
$("#backupNowBtn").addEventListener("click", () => $("#exportBtn").click());
$("#backupLaterBtn").addEventListener("click", () => {
  state.settings.backupSnoozeUntil = addDays(todayKey(), BACKUP_SNOOZE_DAYS);
  save(); haptic("light"); $("#backupBanner").classList.add("hidden");
});
// New-version nudge: the repo's package.json version leads APP_VERSION as soon
// as a release is pushed, so the app can tell you instead of you polling
// SideStore. Checked at most every few hours, silent when offline.
const UPDATE_CHECK_EVERY_H = 6;
function cmpVer(a, b) {
  const pa = String(a).split("."), pb = String(b).split(".");
  for (let i = 0; i < 3; i++) { const d = (+pa[i] || 0) - (+pb[i] || 0); if (d) return d; }
  return 0;
}
async function checkForUpdate() {
  const last = state.settings.lastUpdateCheck;
  if (last && Date.now() - new Date(last).getTime() < UPDATE_CHECK_EVERY_H * 3600e3) return;
  try {
    const pkg = await (await apiFetch(UPDATE_CHECK_URL, { cache: "no-store" })).json();
    if (!pkg || !pkg.version) return;
    state.settings.lastUpdateCheck = new Date().toISOString();
    state.settings.updateAvail = cmpVer(pkg.version, APP_VERSION) > 0 ? pkg.version : null;
    save(); renderUpdateBanner();
  } catch (_) { /* offline — try again next launch/resume */ }
}
function renderUpdateBanner() {
  const v = state.settings.updateAvail;
  // cmpVer guard also hides a stale banner right after the update installs.
  const show = viewDate === todayKey() && !!v && cmpVer(v, APP_VERSION) > 0 && state.settings.updateDismissed !== v;
  $("#updateBanner").classList.toggle("hidden", !show);
  if (show) $("#updateBannerText").textContent = `FitTrack v${v} is available (you're on v${APP_VERSION}). Open SideStore and tap Update.`;
}
$("#updateOpenBtn").addEventListener("click", () => { haptic("light"); location.href = "sidestore://"; });
$("#updateDismissBtn").addEventListener("click", () => {
  state.settings.updateDismissed = state.settings.updateAvail;
  save(); haptic("light"); $("#updateBanner").classList.add("hidden");
});
function backupStatusText() {
  const age = backupAgeDays();
  if (age === null) return "⚠️ No backup yet — export one to keep your data safe.";
  if (age >= BACKUP_STALE_DAYS) return `⚠️ Last backup ${age} days ago — worth refreshing.`;
  return `Last backup ${age === 0 ? "today" : age + " day" + (age === 1 ? "" : "s") + " ago"}.`;
}
// Notes render as plain text; a press swaps in the textarea. This keeps a
// stray scroll-tap from popping the keyboard open.
function renderNote(k) {
  const v = (state.logs[k] && state.logs[k].note) || "";
  $("#dayNote").value = v;
  $("#noteDisplay").innerHTML = v ? esc(v) : `<span class="muted">Press to add a note — mood, energy, context…</span>`;
  $("#noteDisplay").classList.remove("hidden");
  $("#dayNote").classList.add("hidden");
}
$("#noteDisplay").addEventListener("click", () => {
  $("#noteDisplay").classList.add("hidden");
  $("#dayNote").classList.remove("hidden");
  $("#dayNote").focus();
});
// Autosaves as you type — keyed to the day being viewed when typing started,
// so flipping days mid-debounce can't write to the wrong date.
let noteSaveTimer = null;
function saveNote(k) {
  const v = $("#dayNote").value.trim();
  const log = dayLog(k);
  if (v) log.note = v; else delete log.note;
  save();
}
$("#dayNote").addEventListener("input", () => {
  const k = viewDate;
  clearTimeout(noteSaveTimer);
  noteSaveTimer = setTimeout(() => saveNote(k), 400);
});
$("#dayNote").addEventListener("blur", () => {
  clearTimeout(noteSaveTimer);
  saveNote(viewDate);
  renderNote(viewDate);
});
$("#copyYesterdayBtn").addEventListener("click", () => {
  const prev = state.logs[addDays(viewDate, -1)];
  if (!prev) return;
  const log = dayLog(viewDate);
  let copied = 0;
  for (const m of MEALS) for (const it of (prev.meals[m.id] || [])) {
    const item = { ...it };
    // keep the same time of day, but on the viewed date
    item.ts = it.ts ? timeToTs(viewDate, tsToTimeStr(it.ts)) : timeToTs(viewDate, "12:00");
    log.meals[m.id].push(item);
    copied++;
  }
  if (!copied) return;
  haptic();
  save(); renderToday(); toast(`Copied ${copied} item${copied === 1 ? "" : "s"} from yesterday`);
});

function renderQuickRow() {
  const items = [...state.recents, ...state.customFoods].slice(0, 10);
  const seen = new Set();
  const uniq = items.filter((f) => !seen.has(f.name) && seen.add(f.name));
  let html = `<button class="quick-chip add" id="quickMore">+</button>`;
  html += uniq.map((f, i) =>
    `<button class="quick-chip" data-qi="${i}"><div class="qc-name">${esc(f.name)}</div><div class="qc-kcal">${r0(f.kcal)} kcal</div></button>`).join("");
  if (!uniq.length) html += `<div class="quick-empty">Foods you log will appear here for one-tap re-adding.</div>`;
  $("#quickRow").innerHTML = html;
  $$("#quickRow .quick-chip[data-qi]").forEach((el) =>
    el.addEventListener("click", () => {
      const f = uniq[+el.dataset.qi];
      sheetMeal = defaultMealForNow();
      addFoodItem({ name: f.name, kcal: f.kcal, p: f.p || 0, c: f.c || 0, f: f.f || 0, qtyLabel: f.serving || "" }, f);
    }));
  $("#quickMore").addEventListener("click", () => openFoodSheet());
}

// Deterministic (no AI) "what fits" suggestion: recents are checked first —
// already the most personally relevant and recency-ordered — falling through
// to the custom-food library and finally the full food DB only if recents
// don't turn up enough candidates. "Fits" means it wouldn't blow today's
// remaining calories; ranked toward closing the remaining protein gap once
// there's a shortlist, since that's usually the harder target to hit.
function suggestFoods(limit = 3) {
  const p = state.profile;
  if (!p) return [];
  const m = ringMetrics(viewDate);
  if (m.remaining <= 50) return []; // basically no budget left — nothing meaningfully "fits"
  const remainingProtein = Math.max(0, p.proteinTarget - m.t.p);
  const seen = new Set();
  const rank = (arr) => {
    const fits = arr.filter((f) => f.kcal > 0 && f.kcal <= m.remaining * 1.15 && !seen.has(f.name.toLowerCase()));
    fits.forEach((f) => seen.add(f.name.toLowerCase()));
    fits.sort((a, b) => remainingProtein > 0 ? (b.p || 0) - (a.p || 0) : Math.abs(m.remaining - a.kcal) - Math.abs(m.remaining - b.kcal));
    return fits;
  };
  let out = rank(state.recents);
  if (out.length < limit) out = out.concat(rank(state.customFoods));
  if (out.length < limit) out = out.concat(rank(FOOD_DB));
  return out.slice(0, limit);
}
function renderSuggestRow() {
  // "What still fits" only makes sense for the live day — hide it on past days.
  if (viewDate !== todayKey()) { $("#suggestWrap").classList.add("hidden"); return; }
  const items = suggestFoods();
  $("#suggestWrap").classList.toggle("hidden", !items.length);
  if (!items.length) return;
  $("#suggestRow").innerHTML = items.map((f, i) =>
    `<button class="quick-chip" data-si="${i}"><div class="qc-name">${esc(f.name)}</div><div class="qc-kcal">${r0(f.kcal)} kcal${f.p ? ` · ${r1(f.p)}g P` : ""}</div></button>`).join("");
  $$("#suggestRow .quick-chip").forEach((el) =>
    el.addEventListener("click", () => {
      const f = items[+el.dataset.si];
      sheetMeal = defaultMealForNow();
      addFoodItem({ name: f.name, kcal: f.kcal, p: f.p || 0, c: f.c || 0, f: f.f || 0, qtyLabel: f.serving || "" }, f);
    }));
}

function renderMeals(k) {
  const log = dayLog(k);
  // Grouped by meal type with a subheader per group (only groups that have
  // items render at all) — items still carry data-meal/data-i pointing at
  // their real bucket+index, so edit/delete (which key into
  // log.meals[mealId][i]) work unchanged underneath.
  const groups = MEALS.map((mm) => ({
    mm,
    items: (log.meals[mm.id] || []).map((it, i) => ({ i, it })).sort((a, b) => (a.it.ts || 0) - (b.it.ts || 0)),
  })).filter((g) => g.items.length);
  const totalKcal = groups.reduce((s, g) => s + g.items.reduce((s2, x) => s2 + x.it.kcal, 0), 0);
  $("#mealList").innerHTML = `<section class="card meal-card">
    <div class="meal-head">
      <h3><span class="ic meal-ic" data-ic="bowl"></span>Meals</h3>
      <span class="meal-kcal">${groups.length ? r0(totalKcal) + " kcal" : ""}</span>
      <button class="add-btn" id="mealAddBtn"><span class="ic" data-ic="plus"></span></button>
    </div>
    ${groups.length ? groups.map((g) => {
      const groupKcal = g.items.reduce((s, x) => s + x.it.kcal, 0);
      return `<h4 class="meal-subheader"><span class="ic" data-ic="${g.mm.ic}"></span>${g.mm.label}${g.items.length > 1 ? `<span class="meal-sub-kcal">${r0(groupKcal)} kcal</span>` : ""}</h4>
      <ul class="meal-items">${g.items.map(({ i, it }) =>
        `<li data-meal="${g.mm.id}" data-i="${i}"><span class="fi-name">${esc(it.name)} <span class="fi-qty">${it.qtyLabel ? esc(it.qtyLabel) + " · " : ""}${it.ts ? fmtTime(it.ts) : ""}</span></span>
         <span class="fi-kcal">${r0(it.kcal)}</span>
         <button class="fi-del" data-meal="${g.mm.id}" data-i="${i}"><span class="ic" data-ic="x"></span></button></li>`).join("")}</ul>`;
    }).join("")
      : `<p class="muted" style="margin-top:8px">Nothing logged yet — tap + to add.</p>`}
  </section>`;
  renderIcons($("#mealList"));
  $("#mealAddBtn").addEventListener("click", () => openFoodSheet());
  $$("#mealList .meal-items li").forEach((li) => li.addEventListener("click", () => openEditFood(li.dataset.meal, +li.dataset.i)));
  wireIndexDelete("#mealList", (b) => log.meals[b.dataset.meal], renderToday, { stopProp: true });
  makeSwipeable($("#mealList"));
}

function renderExercises(k) {
  const log = dayLog(k);
  const walks = log.walks || [];
  $("#exerciseList").innerHTML = walks.map((w, i) =>
    `<li><span class="ic" data-ic="${w.ic || exerciseIcon(w.name)}"></span><span class="fi-name">${esc(w.name)} <span class="fi-qty">${w.mins} min</span></span>
     <span class="fi-kcal">−${r0(w.kcal)}</span>
     <button class="fi-del" data-i="${i}"><span class="ic" data-ic="x"></span></button></li>`).join("");
  renderIcons($("#exerciseList"));
  const total = walks.reduce((s, w) => s + w.kcal, 0);
  $("#exerciseSummary").textContent = walks.length
    ? `${walks.length} ${walks.length === 1 ? "activity" : "activities"} · ${r0(total)} kcal burned${isWeekend(k) ? " · rest day" : ""}`
    : (isWeekend(k) ? "Weekend rest day — nice." : "No activity logged yet");
  wireIndexDelete("#exerciseList", () => log.walks, renderToday);
  makeSwipeable($("#exerciseList"));
}

function renderWater(k) {
  $("#waterCard").classList.toggle("hidden", !state.settings.waterEnabled);
  if (!state.settings.waterEnabled) return;
  const log = dayLog(k), p = state.profile;
  const glasses = Math.ceil(p.waterTargetMl / 250);
  const drunk = Math.round((log.waterMl || 0) / 250);
  $("#waterText").textContent = `${log.waterMl || 0} / ${p.waterTargetMl} ml`;
  const drop = `<svg viewBox="0 0 24 24"><path d="M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z"/></svg>`;
  $("#waterGlasses").innerHTML = Array.from({ length: glasses }, (_, i) => `<span class="glass ${i < drunk ? "full" : ""}">${drop}</span>`).join("");
}

function renderSupps(k) {
  const log = dayLog(k);
  const wknd = isWeekend(k);
  if (!state.supplements.length) {
    $("#suppList").innerHTML = `<div class="supp-empty">Add supplements in Settings to track them here.</div>`;
    $("#suppCount").textContent = "";
    return;
  }
  $("#suppList").innerHTML = state.supplements.map((s) => {
    const done = !!log.supps[s.id];
    const sub = s.weekday ? (wknd ? s.weekend : s.weekday) : (s.note || "");
    return `<div class="supp-chip ${done ? "done" : ""}" data-sid="${s.id}">
      <span class="sc-check"><span class="ic" data-ic="check"></span></span>
      <div class="sc-main"><div class="sc-name"><span class="marquee-text">${esc(s.name)}</span></div>${sub ? `<div class="sc-sub">${esc(sub)}</div>` : ""}</div>
    </div>`;
  }).join("");
  renderIcons($("#suppList"));
  $$("#suppList .sc-name .marquee-text").forEach(applyMarquee);
  const done = state.supplements.filter((s) => log.supps[s.id]).length;
  $("#suppCount").textContent = `${done} / ${state.supplements.length}`;
  $$("#suppList .supp-chip").forEach((chip) => chip.addEventListener("click", (e) => {
    e.stopPropagation(); // toggling a chip shouldn't also open the history sheet
    const id = chip.dataset.sid;
    log.supps[id] = !log.supps[id];
    if (log.supps[id]) haptic("light");
    save(); renderSupps(viewDate);
  }));
}
/* ---------- supplement history ---------- */
function renderSuppHistory() {
  const days = []; for (let i = 29; i >= 0; i--) days.push(addDays(todayKey(), -i));
  const taken = (dk, id) => { const l = state.logs[dk]; return !!(l && l.supps && l.supps[id]); };
  let dayAll = 0;
  if (state.supplements.length) days.forEach((dk) => { if (state.supplements.every((s) => taken(dk, s.id))) dayAll++; });
  $("#suppHistStats").innerHTML = state.supplements.length
    ? `<div class="stat-box"><div class="v">${dayAll}/30</div><div class="k">days all taken</div></div>
       <div class="stat-box"><div class="v">${r0((dayAll / 30) * 100)}%</div><div class="k">full-day adherence</div></div>`
    : "";
  $("#suppHistList").innerHTML = state.supplements.length
    ? state.supplements.map((s) => {
        const takenDays = days.filter((dk) => taken(dk, s.id)).length;
        let streak = 0, k = todayKey();
        if (!taken(k, s.id)) k = addDays(k, -1); // today not ticked yet doesn't break the run
        while (taken(k, s.id)) { streak++; k = addDays(k, -1); }
        const strip = days.map((dk) => `<span data-tip="${fmtShort(dk)} · ${taken(dk, s.id) ? "taken" : "not taken"}" class="supp-dot ${taken(dk, s.id) ? "on" : ""}${dk === todayKey() ? " today" : ""}"></span>`).join("");
        return `<div class="supp-hist">
          <div class="supp-hist-head"><strong>${esc(s.name)}</strong><span class="muted">${takenDays}/30 · ${r0((takenDays / 30) * 100)}%${streak > 1 ? ` · ${streak}-day streak` : ""}</span></div>
          <div class="supp-strip">${strip}</div></div>`;
      }).join("") + `<p class="muted" style="margin-top:4px">Last 30 days, oldest on the left.</p>`
    : `<p class="muted">Add supplements in Settings to track them here.</p>`;
}
makeCardExpandable("#suppCard", () => { renderSuppHistory(); $("#suppSheet").classList.remove("hidden"); });
wireSheetClose("suppSheet", "suppHistClose");

/* water / day nav */
$("#waterPlus").addEventListener("click", () => { const l = dayLog(viewDate); l.waterMl = (l.waterMl || 0) + 250; save(); renderToday(); });
$("#waterMinus").addEventListener("click", () => { const l = dayLog(viewDate); l.waterMl = Math.max(0, (l.waterMl || 0) - 250); save(); renderToday(); });
$("#dayPrev").addEventListener("click", () => { viewDate = addDays(viewDate, -1); renderToday(); });
$("#backTodayBtn").addEventListener("click", () => { viewDate = todayKey(); haptic("light"); renderToday(); });
$("#dayNext").addEventListener("click", () => { if (viewDate < todayKey()) { viewDate = addDays(viewDate, 1); renderToday(); } });

/* ---------- month calendar ---------- */
let calMonth = new Date();
function openCalendar() {
  calMonth = fromKey(viewDate);
  calMonth.setDate(1);
  renderCalendar();
  $("#calSheet").classList.remove("hidden");
}
$("#dayTitleBtn").addEventListener("click", openCalendar);
wireSheetClose("calSheet", "calClose");
$("#calPrev").addEventListener("click", () => {
  if ($("#calPrev").disabled) return;
  calMonth.setMonth(calMonth.getMonth() - 1); renderCalendar();
});
$("#calNext").addEventListener("click", () => { calMonth.setMonth(calMonth.getMonth() + 1); renderCalendar(); });
// No point browsing before the user's first logged date — there's nothing there.
// Earliest date with any data — the shared floor for every backwards
// navigation (calendar, summary periods, schedule month, session weeks…).
function firstDataKey() {
  const candidates = [
    state.profile && state.profile.startDate,
    Object.keys(state.logs).sort()[0],
    state.weights[0] && state.weights[0].d,
  ].filter(Boolean).sort();
  return candidates[0] || todayKey();
}
function firstLoggedMonthKey() { return firstDataKey().slice(0, 7); }
function renderCalendar() {
  $("#calMonthLabel").textContent = calMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const calMonthKey = `${calMonth.getFullYear()}-${String(calMonth.getMonth() + 1).padStart(2, "0")}`;
  $("#calPrev").disabled = calMonthKey <= firstLoggedMonthKey();
  const year = calMonth.getFullYear(), month = calMonth.getMonth();
  const monStart = (state.settings.weekStart || "mon") === "mon";
  const firstDow = new Date(year, month, 1).getDay();
  const offset = monStart ? (firstDow + 6) % 7 : firstDow; // leading blanks
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayK = todayKey();
  const dows = monStart ? ["M", "T", "W", "T", "F", "S", "S"] : ["S", "M", "T", "W", "T", "F", "S"];
  let html = dows.map((d) => `<div class="cal-dow">${d}</div>`).join("");
  for (let i = 0; i < offset; i++) html += `<div class="cal-cell empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const dk = toKey(new Date(year, month, d));
    const isLogged = loggedDay(dk);
    const onTarget = isLogged && dayComplete(dk);
    const dot = !isLogged ? "" : `<span class="cal-dot ${onTarget ? "on" : "over"}"></span>`;
    const isToday = dk === todayK, future = dk > todayK;
    html += `<button class="cal-cell${isToday ? " today" : ""}${future ? " future" : ""}" data-d="${dk}" ${future ? "disabled" : ""}>
      <span class="cal-daynum">${d}</span>${dot}
    </button>`;
  }
  $("#calGrid").innerHTML = html;
  $$("#calGrid .cal-cell[data-d]").forEach((el) => el.addEventListener("click", () => {
    viewDate = el.dataset.d;
    renderToday();
    $("#calSheet").classList.add("hidden");
  }));
}

/* ---------- since last meal (auto, from logged meal times) ---------- */
function lastMealTs() {
  let latest = null;
  for (let i = 0; i < 3; i++) {
    const dk = addDays(todayKey(), -i);
    const log = state.logs[dk];
    if (!log) continue;
    for (const m of MEALS) for (const it of (log.meals[m.id] || [])) {
      if (it.ts && (!latest || it.ts > latest)) latest = it.ts;
    }
  }
  return latest;
}
let fastInterval = null;
function renderFasting() {
  clearInterval(fastInterval);
  const tick = () => {
    const ts = lastMealTs();
    if (!ts || ts > Date.now()) { $("#fastTimer").textContent = "No meals logged yet"; return; }
    const mins = Math.floor((Date.now() - ts) / 60000);
    const h = Math.floor(mins / 60), m = mins % 60;
    $("#fastTimer").textContent = mins < 1 ? "Just now" : h < 1 ? `${m}m` : `${h}h ${String(m).padStart(2, "0")}m`;
  };
  tick(); fastInterval = setInterval(tick, 30000);
}
function dayMealTimes(dk) {
  const log = state.logs[dk]; if (!log) return [];
  const times = [];
  for (const m of MEALS) for (const it of (log.meals[m.id] || [])) if (it.ts) times.push(it.ts);
  return times.sort((a, b) => a - b);
}
function fmtHm(mins) { const h = Math.floor(mins / 60), m = mins % 60; return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`; }
let mealGapsRange = uiPrefs.mealGapsRange || 30;
function renderMealGapsChart() {
  const days = mealGapsRange;
  const W = 340, H = 260, L = 34, R = 8, T = 12, B = 22;
  const dayKeys = []; for (let i = days - 1; i >= 0; i--) dayKeys.push(addDays(todayKey(), -i));
  const dayIndex = {}; dayKeys.forEach((dk, i) => (dayIndex[dk] = i));
  const bw = (W - L - R) / days, gap = Math.min(4, bw * 0.15), rx = Math.min(2.5, bw / 4);
  // 0 at the bottom, 24 at the top — values increase upward, matching every
  // other chart in the app (rather than raw SVG top-to-bottom coordinates).
  const Y = (hourFrac) => T + (1 - hourFrac / 24) * (H - T - B);
  // Look one extra day back so the first shown day's overnight gap (carried
  // over from the previous day's last meal) still gets computed correctly.
  const fetchDays = []; for (let i = days; i >= 0; i--) fetchDays.push(addDays(todayKey(), -i));
  const allTimes = [];
  fetchDays.forEach((dk) => dayMealTimes(dk).forEach((ts) => allTimes.push(ts)));
  allTimes.sort((a, b) => a - b);
  let bars = "", gapCount = 0, gapSum = 0, longest = 0;
  const BUFFER_MIN = 30; // eating takes time — don't start the "gap" until this long after
  for (let j = 1; j < allTimes.length; j++) {
    const prev = allTimes[j - 1], next = allTimes[j];
    const rawMins = Math.round((next - prev) / 60000);
    if (rawMins <= BUFFER_MIN) continue; // nothing left once the buffer is applied
    const bufStart = prev + BUFFER_MIN * 60000;
    const mins = rawMins - BUFFER_MIN;
    gapCount++; gapSum += mins; longest = Math.max(longest, mins);
    // A gap spanning midnight is split into one bar per calendar day it touches.
    let segStart = bufStart, guard = 0;
    while (segStart < next && guard++ < 400) {
      const segDk = toKey(new Date(segStart));
      const nextMidnight = fromKey(segDk); nextMidnight.setDate(nextMidnight.getDate() + 1); nextMidnight.setHours(0, 0, 0, 0);
      const segEnd = Math.min(next, nextMidnight.getTime());
      const idx = dayIndex[segDk];
      if (idx !== undefined) {
        const midnight = fromKey(segDk).setHours(0, 0, 0, 0);
        const h1 = (segStart - midnight) / 3600000, h2 = (segEnd - midnight) / 3600000;
        const tip = `${fmtShort(segDk)} · ${fmtTime(segStart)}–${fmtTime(segEnd)} (part of a ${fmtHm(mins)} gap)`;
        bars += `<rect data-tip="${tip}" x="${(L + idx * bw + gap / 2).toFixed(1)}" y="${Y(h2).toFixed(1)}" width="${(bw - gap).toFixed(1)}" height="${(Y(h1) - Y(h2)).toFixed(1)}" rx="${rx.toFixed(1)}" fill="var(--blue)" opacity="${segDk === todayKey() ? 1 : 0.72}"/>`;
      }
      segStart = segEnd;
    }
  }
  const hourLines = [0, 6, 12, 18, 24].map((h) => `<line x1="${L}" y1="${Y(h).toFixed(1)}" x2="${W - R}" y2="${Y(h).toFixed(1)}" stroke="var(--border)" stroke-dasharray="2 3"/><text x="${L - 4}" y="${(Y(h) + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="var(--muted)">${h}:00</text>`).join("");
  $("#mealGapsChart").innerHTML = gapCount
    ? `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${hourLines}${bars}<text x="${L}" y="${H - 7}" font-size="9" fill="var(--muted)">${fmtShort(dayKeys[0])}</text><text x="${W - R}" y="${H - 7}" text-anchor="end" font-size="9" fill="var(--muted)">today</text></svg>`
    : `<div class="food-empty">Log at least 2 meals to see gaps.</div>`;
  // Eating-pattern insights over the same window. An "eating occasion" is a
  // cluster of items logged within 30 min of each other — logging yogurt and
  // a shake back-to-back is one sitting, not two.
  const occHours = new Array(24).fill(0);
  let occSum = 0, loggedDays = 0, firstSum = 0, lastSum = 0, nightSum = 0, nightCount = 0, prevLastTs = null;
  for (const dk of dayKeys) {
    const times = dayMealTimes(dk).sort((a, b) => a - b);
    if (!times.length) { prevLastTs = null; continue; }
    loggedDays++;
    let prev = null;
    for (const ts of times) {
      if (prev == null || ts - prev > 30 * 60000) { occSum++; occHours[new Date(ts).getHours()]++; }
      prev = ts;
    }
    const f = new Date(times[0]), l = new Date(times[times.length - 1]);
    firstSum += f.getHours() * 60 + f.getMinutes();
    lastSum += l.getHours() * 60 + l.getMinutes();
    if (prevLastTs != null) { nightSum += (times[0] - prevLastTs) / 60000; nightCount++; }
    prevLastTs = times[times.length - 1];
  }
  const peakHour = occHours.indexOf(Math.max(...occHours));
  $("#mealGapsStats").innerHTML = gapCount
    ? `<div class="stat-box"><div class="v">${fmtHm(Math.round(gapSum / gapCount))}</div><div class="k">avg gap</div></div>
       <div class="stat-box"><div class="v">${fmtHm(longest)}</div><div class="k">longest gap</div></div>
       <div class="stat-box"><div class="v">${r1(occSum / loggedDays)}</div><div class="k">times you eat / day</div></div>
       <div class="stat-box"><div class="v">${nightCount ? fmtHm(Math.round(nightSum / nightCount)) : "—"}</div><div class="k">avg overnight fast</div></div>
       <div class="stat-box"><div class="v">${fmtTimeOfDay(firstSum / loggedDays)}</div><div class="k">avg first meal</div></div>
       <div class="stat-box"><div class="v">${fmtTimeOfDay(lastSum / loggedDays)}</div><div class="k">avg last meal</div></div>`
    : "";
  // 24-bin histogram of occasions; the busiest hour is highlighted.
  const hasOcc = occSum > 0;
  $("#mealHourLabel").classList.toggle("hidden", !hasOcc);
  $("#mealHourHint").classList.toggle("hidden", !hasOcc);
  if (hasOcc) {
    const hW = 340, hH = 110, hL = 8, hR = 8, hT = 8, hB = 20;
    const hMax = Math.max(...occHours, 1);
    const bw = (hW - hL - hR) / 24, hg = Math.min(3, bw * 0.2);
    const hBars = occHours.map((n, h) => {
      if (!n) return "";
      const bh = (n / hMax) * (hH - hT - hB);
      return `<rect data-tip="${fmtTimeOfDay(h * 60)}–${fmtTimeOfDay(((h + 1) % 24) * 60)} · ${n} time${n === 1 ? "" : "s"}" x="${(hL + h * bw + hg / 2).toFixed(1)}" y="${(hH - hB - bh).toFixed(1)}" width="${(bw - hg).toFixed(1)}" height="${bh.toFixed(1)}" rx="2" fill="${h === peakHour ? "var(--accent)" : "var(--blue)"}" opacity="${h === peakHour ? 1 : 0.75}"/>`;
    }).join("");
    const hLabels = [0, 6, 12, 18].map((h) => `<text x="${(hL + h * bw).toFixed(1)}" y="${hH - 6}" font-size="9" fill="var(--muted)">${h === 0 ? "12am" : h === 12 ? "12pm" : h < 12 ? h + "am" : (h - 12) + "pm"}</text>`).join("");
    $("#mealHourChart").innerHTML = `<svg viewBox="0 0 ${hW} ${hH}" xmlns="http://www.w3.org/2000/svg"><line x1="${hL}" y1="${hH - hB}" x2="${hW - hR}" y2="${hH - hB}" stroke="var(--border)"/>${hBars}${hLabels}</svg>`;
  } else $("#mealHourChart").innerHTML = "";
  $$("#mealGapsRangeChips button").forEach((b) => b.classList.toggle("active", +b.dataset.d === mealGapsRange));
}
$("#mealGapsRangeChips").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  mealGapsRange = +b.dataset.d; setPref("mealGapsRange", mealGapsRange); renderMealGapsChart();
});
// Tap anywhere on an "expandable" card to open its full-screen view — except
// interactive controls (inputs, buttons, selects) which need their normal
// behaviour. Compact-card charts here have no tooltips, so tapping the chart
// itself is a valid way to expand too — it's not a dead zone.
function makeCardExpandable(sel, openFn) {
  const el = $(sel); if (!el) return;
  el.addEventListener("click", (e) => {
    if (e.target.closest("button, input, select, textarea, a")) return;
    openFn();
  });
}
makeCardExpandable("#mealGapsCard", () => { renderMealGapsChart(); $("#mealGapsSheet").classList.remove("hidden"); });
wireSheetClose("mealGapsSheet", "mealGapsClose");
function nowTimeStr() { const d = new Date(); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }
function tsToTimeStr(ts) { const d = new Date(ts); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }
function timeToTs(dateKey, timeStr) {
  const d = fromKey(dateKey);
  const [hh, mm] = (timeStr || "").split(":").map(Number);
  if (!isNaN(hh)) d.setHours(hh, mm || 0, 0, 0); else d.setHours(12, 0, 0, 0);
  return d.getTime();
}

/* ---------- exercise picker ---------- */
let exSel = null;
function openExercisePicker() {
  $("#exerciseListPicker").innerHTML = EXERCISES.map((e, i) =>
    `<button class="food-row" data-i="${i}"><span class="ic fr-ic" data-ic="${e.ic}"></span>
     <div class="fr-main"><div class="fr-name">${e.name}</div><div class="fr-sub">${r0(e.met * currentWeight() * 0.5)} kcal / 30 min</div></div></button>`).join("");
  renderIcons($("#exerciseListPicker"));
  $$("#exerciseListPicker .food-row").forEach((el) => el.addEventListener("click", () => openExDetail(EXERCISES[+el.dataset.i])));
  $("#exerciseSheet").classList.remove("hidden");
}
$("#exerciseAddBtn").addEventListener("click", openExercisePicker);
$("#trainExerciseAddBtn").addEventListener("click", openExercisePicker);
wireSheetClose("exerciseSheet", "exerciseClose");
function exKcal(mins) { return exSel.met * currentWeight() * (mins / 60); }
function openExDetail(ex, mins) {
  exSel = ex;
  $("#exDetailName").textContent = ex.name;
  $("#exMins").value = mins || 30;
  $$("#exDurChips button").forEach((b) => b.classList.toggle("active", b.dataset.min === String(mins || 30)));
  updateExPreview();
  $("#exDetailSheet").classList.remove("hidden");
}
// Natural-language activity entry, mirroring the food "Describe" flow: parses
// a free-text description into a name/MET/duration via the same on-device
// Foundation Models pipeline, then opens the normal duration/preview step
// pre-filled so the user can still adjust before logging.
const EXERCISE_DESCRIBE_PROMPT = 'The user is logging a workout or activity in their own words. Identify the activity, its MET (metabolic equivalent) value, and its duration in minutes (guess a typical duration like 30 if none is mentioned). Respond with ONLY a JSON object, no other text, exactly in this shape: {"name": string, "met": number, "minutes": integer}\n\nDescription: ';
async function estimateExercise(desc) {
  const text = await aiGenerateText(EXERCISE_DESCRIBE_PROMPT + desc);
  if (!text) return null;
  const m = text.match(/\{[\s\S]*?\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    if (j.name && isFinite(+j.met) && isFinite(+j.minutes)) return { name: j.name, met: +j.met, minutes: Math.max(1, Math.round(+j.minutes)) };
  } catch (e) { /* fall through to null */ }
  return null;
}
$("#exEstimate").addEventListener("click", async () => {
  const desc = $("#exDesc").value.trim();
  if (!desc) return toast("Describe your activity first");
  const btn = $("#exEstimate"); btn.disabled = true; btn.textContent = "Estimating…";
  const est = await estimateExercise(desc);
  btn.disabled = false; btn.innerHTML = '<span class="ic" data-ic="sparkle"></span>Estimate with AI'; renderIcons(btn);
  if (!est) return toast("On-device AI unavailable on this device — pick from the list below instead");
  $("#exDesc").value = "";
  openExDetail({ name: est.name, ic: "bolt", met: est.met }, est.minutes);
});
function updateExPreview() {
  const mins = parseInt($("#exMins").value, 10) || 0;
  $("#exPreview").innerHTML = `<div><span>${mins}</span><label>minutes</label></div><div><span>${r0(exKcal(mins))}</span><label>kcal burned</label></div>`;
}
$("#exMins").addEventListener("input", updateExPreview);
$("#exDurChips").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  $$("#exDurChips button").forEach((x) => x.classList.toggle("active", x === b));
  $("#exMins").value = b.dataset.min; updateExPreview();
});
wireSheetClose("exDetailSheet", "exDetailClose");
$("#exAdd").addEventListener("click", () => {
  const mins = parseInt($("#exMins").value, 10) || 0;
  if (mins <= 0) return;
  haptic();
  dayLog(viewDate).walks.push({ name: exSel.name, ic: exSel.ic, mins, kcal: exKcal(mins) });
  save();
  $("#exDetailSheet").classList.add("hidden"); $("#exerciseSheet").classList.add("hidden");
  renderToday(); renderTraining(); toast(`Logged ${exSel.name}`);
});

/* ---------- food sheet ---------- */
let sheetMeal = "breakfast", sheetTab = "all", offResults = [], offLoading = false;
// Shared food library (worker/ backend). Cached per app run; a publish clears
// the cache so the tab refetches. Tab is removed outright when no backend is
// configured, so nothing else needs to guard on SHARED_FOODS_API.
let sharedFoods = null, sharedLoading = false;
if (!SHARED_FOODS_API) { const b = $('#foodTabs button[data-tab="shared"]'); if (b) b.remove(); }
// sheetMeal is set right before addFoodItem() — auto-categorized from time
// (or the "This is a snack" toggle) at the actual log step, or from the
// current time for one-tap quick-row re-adds — never picked manually.
function openFoodSheet() {
  sheetTab = "all"; offResults = [];
  $("#sheetTitle").textContent = "Add food";
  $("#foodSearch").value = "";
  $$("#foodTabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === "all"));
  $("#foodSheet").classList.remove("hidden");
  renderFoodList();
}
// Tail of every "saved to your library" flow (quick add, photo, barcode,
// multi-item). Opening the sheet resets the tab to All, so select Custom
// after that — the old inline copies set it first and had it reset out from
// under them whenever the sheet wasn't already open.
function showCustomTab() {
  if ($("#foodSheet").classList.contains("hidden")) openFoodSheet();
  sheetTab = "custom";
  $$("#foodTabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === "custom"));
  renderFoodList();
}
wireSheetClose("foodSheet", "sheetClose");
$("#foodTabs").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  sheetTab = b.dataset.tab;
  $$("#foodTabs button").forEach((x) => x.classList.toggle("active", x === b));
  renderFoodList();
});
let searchTimer = null;
$("#foodSearch").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { sheetTab === "online" ? searchOFF() : renderFoodList(); }, sheetTab === "online" ? 600 : 120);
});
$("#foodSearch").addEventListener("keydown", (e) => { if (e.key === "Enter" && sheetTab === "online") { e.preventDefault(); searchOFF(); } });

// Pull-to-refresh on the Shared tab: drag the list down from the top and
// release to refetch. The list follows the finger (damped) as the affordance;
// #foodList is the scroll container so scrollTop===0 means "at the top".
(() => {
  const list = $("#foodList");
  let startY = 0, pulling = false;
  list.addEventListener("touchstart", (e) => {
    pulling = sheetTab === "shared" && list.scrollTop <= 0;
    if (pulling) startY = e.touches[0].clientY;
  }, { passive: true });
  list.addEventListener("touchmove", (e) => {
    if (!pulling) return;
    const dy = e.touches[0].clientY - startY;
    if (dy <= 0 || list.scrollTop > 0) { list.style.transform = ""; return; }
    list.style.transition = "none";
    list.style.transform = `translateY(${Math.min(dy / 2.5, 64)}px)`;
  }, { passive: true });
  list.addEventListener("touchend", (e) => {
    if (!pulling) return;
    pulling = false;
    const dy = e.changedTouches[0].clientY - startY;
    list.style.transition = "transform .2s var(--ease)";
    list.style.transform = "";
    if (dy > 110 && sheetTab === "shared") { haptic("light"); sharedFoods = null; renderSharedList(); }
  });
})();

function allLocalFoods() { return [...state.customFoods, ...FOOD_DB]; }
function renderFoodList() {
  if (sheetTab === "online") return renderOFFList();
  if (sheetTab === "shared") return renderSharedList();
  const q = $("#foodSearch").value.trim().toLowerCase();
  let rows = [];
  if (sheetTab === "all") rows = allLocalFoods();
  if (sheetTab === "custom") rows = state.customFoods;
  if (sheetTab === "fav") rows = allLocalFoods().filter((f) => state.favs.includes(f.id));
  if (sheetTab === "recent") rows = state.recents;
  if (q) rows = rows.filter((f) => f.name.toLowerCase().includes(q));
  if (!rows.length) {
    const msg = { all: "No match — try the Online tab.", recent: "Logged foods show up here for one-tap re-adding.", fav: "Tap ☆ on any food to pin it here.", custom: "Create your own foods with Custom below." };
    $("#foodList").innerHTML = `<div class="food-empty">${msg[sheetTab] || "Nothing here yet."}</div>`;
    return;
  }
  const shown = rows.slice(0, 80);
  // Custom foods get a swipeable row (edit/share/delete behind a swipe,
  // matching every other manage-your-own-stuff list in the app) instead of
  // always-visible tiny icon buttons — the favorite star stays visible since
  // that's a quick one-tap action, not a "manage this entry" action.
  if (sheetTab === "custom") {
    $("#foodList").innerHTML = shown.map((f, i) => {
      const fav = state.favs.includes(f.id);
      return `<li class="food-row" data-i="${i}">
        <div class="fr-main"><div class="fr-name">${esc(f.name)}</div><div class="fr-sub">${esc(f.serving || "")}${macroTags(f)}</div></div>
        <span class="fr-kcal">${r0(f.kcal)}</span>
        <span class="fav-btn ${fav ? "on" : ""}" data-fav="${f.id}">${fav ? "★" : "☆"}</span>
        <button class="fi-share" data-share="${f.id}"><span class="ic" data-ic="share"></span></button>
        <button class="fi-edit" data-editc="${f.id}"><span class="ic" data-ic="pencil"></span></button>
        <button class="fi-del" data-delc="${f.id}"><span class="ic" data-ic="x"></span></button>
      </li>`;
    }).join("");
    renderIcons($("#foodList"));
    $$("#foodList .food-row").forEach((li) => li.addEventListener("click", () => openDetail(shown[+li.dataset.i], "serving")));
    $$("#foodList .fav-btn").forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = b.dataset.fav, ix = state.favs.indexOf(id);
      ix >= 0 ? state.favs.splice(ix, 1) : state.favs.push(id);
      save(); renderFoodList();
    }));
    $$("#foodList .fi-share").forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation();
      const f = state.customFoods.find((x) => x.id === b.dataset.share);
      if (!f) return;
      // With a shared-library backend configured, sharing means publishing
      // there (one tap, everyone gets it); the JSON file export only remains
      // as the no-backend fallback.
      if (SHARED_FOODS_API) publishFood(f);
      else shareItem(`fittrack-food-${slugify(f.name)}.json`, { fittrackShare: "food", version: 1, food: { name: f.name, serving: f.serving, kcal: f.kcal, p: f.p, c: f.c, f: f.f } }, "FitTrack Food");
    }));
    $$("#foodList .fi-edit").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); openEditCustomFood(b.dataset.editc); }));
    $$("#foodList .fi-del").forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation();
      state.customFoods = state.customFoods.filter((c) => c.id !== b.dataset.delc);
      save(); renderFoodList();
    }));
    makeSwipeable($("#foodList"));
    return;
  }
  $("#foodList").innerHTML = shown.map((f, i) => {
    const fav = state.favs.includes(f.id);
    return `<button class="food-row" data-i="${i}">
      <div class="fr-main"><div class="fr-name">${esc(f.name)}</div><div class="fr-sub">${esc(f.serving || "")}${macroTags(f)}</div></div>
      <span class="fr-kcal">${r0(f.kcal)}</span>
      ${f.id ? `<span class="fav-btn ${fav ? "on" : ""}" data-fav="${f.id}">${fav ? "★" : "☆"}</span>` : ""}</button>`;
  }).join("");
  $$("#foodList .food-row").forEach((el) => el.addEventListener("click", (e) => {
    const fav = e.target.dataset.fav;
    if (fav) { const ix = state.favs.indexOf(fav); ix >= 0 ? state.favs.splice(ix, 1) : state.favs.push(fav); save(); renderFoodList(); return; }
    openDetail(shown[+el.dataset.i], "serving");
  }));
}

/* Shared food library */
// Opaque per-install id the server stamps on rows this device publishes, so
// only this device can later edit or delete them. Generated once, kept in
// settings, and carried by backups/exports (restoring a backup on a new phone
// keeps ownership of the foods you shared).
function deviceId() {
  if (!state.settings.deviceId) {
    const b = new Uint8Array(12);
    (crypto.getRandomValues ? crypto : window.crypto).getRandomValues(b);
    state.settings.deviceId = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
    save();
  }
  return state.settings.deviceId;
}
function libraryKey() { return (state.settings.libraryKey || "").trim(); }
// Rows with no owner predate ownership tracking (or came from a server that
// doesn't report it) — any key holder may adopt those.
function canEditShared(f) { return !!libraryKey() && (!f.owner || f.owner === deviceId()); }
function writeHeaders(extra) {
  return { ...(extra || {}), "X-FitTrack-Key": libraryKey(), "X-FitTrack-Owner": deviceId() };
}
// Turns a failed write into something the user can act on.
async function apiError(res) {
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) return "Library key missing or wrong — check Settings → Shared food library.";
  if (res.status === 403) return "That food was added by someone else, so only they can change it.";
  return body.error || "server error " + res.status;
}
async function fetchSharedFoods() {
  sharedLoading = true;
  try {
    const data = await (await apiFetch(SHARED_FOODS_API + "/foods")).json();
    sharedFoods = (data.foods || []).map((r) => ({ id: "sh" + r.id, rid: r.id, name: r.name, serving: r.serving || "100 g", kcal: +r.kcal || 0, p: +r.p || 0, c: +r.c || 0, f: +r.f || 0, by: r.by || "", owner: r.owner || "" }));
  } catch (e) { sharedFoods = null; }
  sharedLoading = false;
}
function renderSharedList() {
  if (sharedLoading) { $("#foodList").innerHTML = `<div class="food-empty">Loading shared foods…</div>`; return; }
  if (sharedFoods === null) {
    fetchSharedFoods().then(() => { if (sheetTab === "shared") sharedFoods === null ? ($("#foodList").innerHTML = `<div class="food-empty">Couldn't reach the shared library — are you online?</div>`) : renderSharedList(); });
    return renderSharedList(); // shows the loading state
  }
  const q = $("#foodSearch").value.trim().toLowerCase();
  const rows = q ? sharedFoods.filter((f) => f.name.toLowerCase().includes(q)) : sharedFoods;
  if (!rows.length) { $("#foodList").innerHTML = `<div class="food-empty">${q ? "No match in the shared library." : "Nothing shared yet — publish one of your custom foods with its share button.<br>Pull down to refresh."}</div>`; return; }
  const shown = rows.slice(0, 80);
  // Edit/delete only appear on rows this install may actually change — the
  // server enforces the same rule, this just avoids offering a doomed tap.
  $("#foodList").innerHTML = shown.map((f, i) => `<li class="food-row" data-i="${i}">
      <div class="fr-main"><div class="fr-name">${esc(f.name)}</div><div class="fr-sub">${esc(f.serving || "")}${f.by ? " · by " + esc(f.by) : ""}${macroTags(f)}</div></div>
      <span class="fr-kcal">${r0(f.kcal)}</span>
      <button class="fi-save" data-savesh="${i}" title="Save to my custom foods"><span class="ic" data-ic="copy"></span></button>
      ${canEditShared(f) ? `<button class="fi-edit" data-editsh="${i}"><span class="ic" data-ic="pencil"></span></button>
      <button class="fi-del" data-delsh="${i}"><span class="ic" data-ic="x"></span></button>` : ""}
    </li>`).join("");
  renderIcons($("#foodList"));
  $$("#foodList .food-row").forEach((li) => li.addEventListener("click", () => openDetail(shown[+li.dataset.i], "serving")));
  $$("#foodList [data-savesh]").forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation();
    const f = shown[+b.dataset.savesh];
    upsertCustomFood({ name: f.name, serving: f.serving, kcal: f.kcal, p: f.p, c: f.c, f: f.f });
    save(); haptic("light");
    toast(`Saved "${f.name}" to your custom foods`);
  }));
  $$("#foodList [data-editsh]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); openEditSharedFood(shown[+b.dataset.editsh]); }));
  $$("#foodList [data-delsh]").forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation();
    const f = shown[+b.dataset.delsh];
    if (confirm(`Remove "${f.name}" from the shared library for everyone?`)) deleteSharedFood(f);
  }));
  makeSwipeable($("#foodList"));
}
async function deleteSharedFood(f) {
  try {
    const res = await apiFetch(`${SHARED_FOODS_API}/foods/${f.rid}`, { method: "DELETE", headers: writeHeaders() });
    if (!res.ok && res.status !== 404) throw new Error(await apiError(res));
    sharedFoods = (sharedFoods || []).filter((x) => x.rid !== f.rid);
    if (sheetTab === "shared") renderFoodList();
    toast(`Removed "${f.name}" from the shared library`);
  } catch (e) { toast("Delete failed: " + (e.message || "are you online?")); }
}
// Editing a shared food reuses the custom-food form, but saving publishes the
// change back to the shared library (by row id, so renaming is safe) instead
// of touching the local custom list.
let editingSharedFood = null;
function openEditSharedFood(f) {
  openQuick("custom");
  editingSharedFood = f;
  $("#quickTitle").textContent = "Edit shared food";
  $("#qName").value = f.name; $("#qKcal").value = f.kcal; $("#qProt").value = f.p || ""; $("#qCarb").value = f.c || ""; $("#qFat").value = f.f || "";
  $("#qServing").value = f.serving || "";
  $("#quickSave").textContent = "Update shared food";
}
// Publishes a food to the shared library. With `rid`, updates that existing
// row in place (rename-safe); without, it's a new publish (same name upserts).
// Returns true on success so callers can keep their sheet open on failure.
async function publishFood(f, rid) {
  // Publishing is key-gated server-side; say so up front rather than letting
  // the request come back 401.
  if (!libraryKey()) { toast("Add the library key in Settings → Shared food library to publish."); return false; }
  // One-time (skippable) name prompt so friends can see who shared what —
  // editable later under Settings → Profile → Display name.
  if (state.settings.shareName == null) {
    state.settings.shareName = (prompt("Name to show next to foods you publish (optional):") || "").trim().slice(0, 20);
    save();
  }
  toast(rid ? "Updating…" : "Publishing…");
  try {
    const body = { name: f.name, serving: f.serving || "100 g", kcal: f.kcal || 0, p: f.p || 0, c: f.c || 0, f: f.f || 0, by: state.settings.shareName };
    if (rid) body.id = rid;
    const res = await apiFetch(SHARED_FOODS_API + "/foods", {
      method: "POST", headers: writeHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await apiError(res));
    sharedFoods = null; // refetch next time the Shared tab opens
    toast(rid ? `Updated "${f.name}" in the shared library` : `Published "${f.name}" to the shared library`);
    return true;
  } catch (e) { toast((rid ? "Update" : "Publish") + " failed: " + (e.message || "are you online?")); return false; }
}

/* Open Food Facts */
// Shared fetch+normalize for every OFF search surface (Online tab, ingredient
// type-ahead). Values are per 100 g; entries without calories are dropped.
async function offQuery(q, pageSize) {
  const url = "https://world.openfoodfacts.org/cgi/search.pl?action=process&search_simple=1&json=1&page_size=" + pageSize + "&fields=product_name,brands,nutriments&search_terms=" + encodeURIComponent(q);
  const data = await (await fetch(url)).json();
  return (data.products || []).filter((p) => p.product_name && p.nutriments && p.nutriments["energy-kcal_100g"] != null)
    .map((p) => ({ name: p.product_name.slice(0, 60), brand: (p.brands || "").split(",")[0], kcal: +p.nutriments["energy-kcal_100g"] || 0, p: +p.nutriments["proteins_100g"] || 0, c: +p.nutriments["carbohydrates_100g"] || 0, f: +p.nutriments["fat_100g"] || 0 }));
}
async function searchOFF() {
  const q = $("#foodSearch").value.trim();
  if (!q) { $("#foodList").innerHTML = `<div class="food-empty">Type a food name to search Open Food Facts.</div>`; return; }
  offLoading = true; $("#foodList").innerHTML = `<div class="food-empty">Searching…</div>`;
  try {
    offResults = await offQuery(q, 25);
  } catch (e) { offResults = []; $("#foodList").innerHTML = `<div class="food-empty">Search failed — are you online?</div>`; offLoading = false; return; }
  offLoading = false; renderOFFList();
}
function renderOFFList() {
  if (offLoading) return;
  if (!offResults.length) { $("#foodList").innerHTML = `<div class="food-empty">Search the Open Food Facts database<br>(needs internet — values per 100 g).</div>`; return; }
  $("#foodList").innerHTML = offResults.map((f, i) =>
    `<button class="food-row" data-i="${i}"><div class="fr-main"><div class="fr-name">${esc(f.name)}</div><div class="fr-sub">${esc(f.brand || "Open Food Facts")} · per 100 g${macroTags(f)}</div></div><span class="fr-kcal">${r0(f.kcal)}</span></button>`).join("");
  $$("#foodList .food-row").forEach((el) => el.addEventListener("click", () => openDetail(offResults[+el.dataset.i], "per100")));
}

/* ---------- detail / qty ---------- */
let detail = null;
// Stable key for remembering a per-serving weight a user supplied for a food
// that didn't carry one in its serving string.
function foodKey(food) { return food.id || ("nm:" + (food.name || "").trim().toLowerCase()); }
// Grams (or ml) per serving. Prefer a value parsed out of the serving string
// ("1 large (50 g)", "40 g", "250 ml"); fall back to a weight the user has
// supplied before for this food. This one source feeds every serving↔g/ml
// conversion so the toggle works for ANY food, not just barcode/per-100 ones.
function servingGrams(food) {
  const m = /([\d.]+)\s*(g|ml)\b/i.exec(food.serving || "");
  if (m) return parseFloat(m[1]);
  const ov = state.foodServingOverrides[foodKey(food)];
  return ov != null ? ov : null;
}
function openDetail(food, mode) {
  detail = { food, mode, unit: mode === "per100" ? "g" : "serv", grams: servingGrams(food) };
  $("#detailName").textContent = food.name;
  $("#detailServing").textContent = mode === "per100" ? `${r0(food.kcal)} kcal per 100 g${food.brand ? " · " + food.brand : ""}` : `${r0(food.kcal)} kcal per ${food.serving || "serving"}`;
  // The unit toggle is available for every serving-mode food now; per-100
  // foods (barcode/online) are already gram-based so they don't need it.
  $("#detailUnitSeg").classList.toggle("hidden", mode === "per100");
  $$("#detailUnitSeg button").forEach((b) => b.classList.toggle("active", b.dataset.val === "serv"));
  applyDetailUnit();
  $("#detailTime").value = nowTimeStr();
  $("#detailSnackToggle").checked = false;
  $("#detailSheet").classList.remove("hidden");
}
function applyDetailUnit() {
  const swRow = $("#detailServingWeightRow"), byWeight = detail.unit === "g" || detail.unit === "ml";
  // The "1 serving = __" field appears only when converting to g/ml, so any
  // food can be given a serving weight inline (persisted per food).
  swRow.classList.toggle("hidden", detail.mode === "per100" || !byWeight);
  if (byWeight) { $("#detailServingWeight").value = detail.grams != null ? detail.grams : ""; $("#detailServingWeightUnit").textContent = detail.unit; }
  if (detail.mode === "per100") {
    $("#qtyInput").value = 100; $("#qtyInput").step = 10; $("#qtyUnit").textContent = "g";
  } else if (byWeight) {
    $("#qtyInput").value = detail.grams != null ? detail.grams : ""; $("#qtyInput").step = 5; $("#qtyUnit").textContent = detail.unit;
  } else {
    $("#qtyInput").value = 1; $("#qtyInput").step = 0.5; $("#qtyUnit").textContent = "× serving";
  }
  updateMacroPreview();
}
$("#detailUnitSeg").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  detail.unit = b.dataset.val;
  $$("#detailUnitSeg button").forEach((x) => x.classList.toggle("active", x === b));
  applyDetailUnit();
});
// Supplying/adjusting the serving weight persists it for this food and drives
// the conversion live.
$("#detailServingWeight").addEventListener("input", () => {
  const gw = parseFloat($("#detailServingWeight").value);
  detail.grams = gw > 0 ? gw : null;
  if (gw > 0) {
    state.foodServingOverrides[foodKey(detail.food)] = gw; save();
    if (!(parseFloat($("#qtyInput").value) > 0)) $("#qtyInput").value = gw;
  }
  updateMacroPreview();
});
function detailFactor() {
  const q = parseFloat($("#qtyInput").value) || 0;
  if (detail.mode === "per100") return q / 100;
  if (detail.unit === "g" || detail.unit === "ml") return detail.grams ? q / detail.grams : 0;
  return q;
}
function updateMacroPreview() {
  const f = detail.food, k = detailFactor();
  $("#macroPreview").innerHTML = `<div><span>${r0(f.kcal * k)}</span><label>kcal</label></div><div class="mc-p"><span>${r1((f.p || 0) * k)}</span><label>protein</label></div><div class="mc-f"><span>${r1((f.f || 0) * k)}</span><label>fat</label></div><div class="mc-c"><span>${r1((f.c || 0) * k)}</span><label>carbs</label></div>`;
}
$("#qtyInput").addEventListener("input", updateMacroPreview);
function detailStep() { return detail.mode === "per100" ? 10 : (detail.unit === "g" || detail.unit === "ml") ? 5 : 0.5; }
$("#qtyMinus").addEventListener("click", () => { const i = $("#qtyInput"), st = detailStep(); i.value = Math.max(st, (parseFloat(i.value) || 0) - st); updateMacroPreview(); });
$("#qtyPlus").addEventListener("click", () => { const i = $("#qtyInput"), st = detailStep(); i.value = (parseFloat(i.value) || 0) + st; updateMacroPreview(); });
wireSheetClose("detailSheet", "detailClose");
$("#detailAdd").addEventListener("click", () => {
  const f = detail.food, k = detailFactor(); if (k <= 0) return;
  const qtyLabel = detail.mode === "per100" ? `${r0(k * 100)} g`
    : (detail.unit === "g" || detail.unit === "ml") ? `${r0(parseFloat($("#qtyInput").value) || 0)} ${detail.unit}`
    : (k === 1 ? (f.serving || "") : `${k} × ${f.serving || "serving"}`);
  const timeStr = $("#detailTime").value;
  const ts = timeToTs(viewDate, timeStr);
  // Auto-categorized from the time above, unless explicitly marked a snack.
  sheetMeal = $("#detailSnackToggle").checked ? "snacks" : mealFromTime(timeStr);
  // Barcode / online results (per-100g, not yet in the library) get saved so
  // they're reusable next time — the meal gets the scaled portion.
  if (detail.mode === "per100" && f.name && !f.id) {
    upsertCustomFood({ name: f.name, serving: "100 g", kcal: f.kcal, p: f.p || 0, c: f.c || 0, f: f.f || 0 });
  }
  addFoodItem({ name: f.name, kcal: r0(f.kcal * k), p: r2((f.p || 0) * k), c: r2((f.c || 0) * k), f: r2((f.f || 0) * k), qtyLabel, ts }, f);
  $("#detailSheet").classList.add("hidden"); $("#foodSheet").classList.add("hidden");
});

function addFoodItem(item, src) {
  haptic();
  if (!item.ts) item.ts = Date.now();
  dayLog(viewDate).meals[sheetMeal].push(item);
  if (src) {
    state.recents = [{ id: src.id || null, name: src.name, serving: src.serving || (detail && detail.mode === "per100" ? "100 g" : ""), kcal: src.kcal, p: src.p || 0, c: src.c || 0, f: src.f || 0 }, ...state.recents.filter((r) => r.name !== src.name)].slice(0, 25);
  }
  save(); renderToday();
  toast(`Added ${r0(item.kcal)} kcal`);
}

/* ---------- quick add / custom ---------- */
let quickMode = "quick";
let editTarget = null;
let aiServingG = 0;
let manualEstimated = false;
const KJ_PER_KCAL = 4.184;
let qCustomMode = "simple", customIngredients = [], ingBasis = "100g", calUnit = "kcal";
let totalWTouched = false, servWTouched = false;
let multiParsedItems = null;
// Leaves the multi-item review list (if it was showing) and restores the
// normal single-item form + Add/Save button.
function exitMultiReview() {
  multiParsedItems = null;
  $("#multiItemsSection").classList.add("hidden");
  $("#qSimpleFields").classList.remove("hidden");
  $("#quickSave").classList.remove("hidden");
}
function openQuick(mode, prefill) {
  quickMode = mode;
  manualEstimated = false;
  exitMultiReview();
  $("#quickTitle").textContent = mode === "custom" ? "New custom food" : mode === "ai" ? "AI estimate" : mode === "edit" ? "Edit food" : mode === "manual" ? "Quick Add" : "Quick add";
  $("#qDescribeWrap").classList.toggle("hidden", mode !== "manual");
  $("#qDesc").value = "";
  $("#qServingWrap").classList.toggle("hidden", mode !== "custom" && mode !== "manual");
  $("#qNote").classList.toggle("hidden", mode !== "ai");
  $("#qCustomModeSeg").classList.toggle("hidden", mode !== "custom");
  // Time/meal only matter for "edit" (an already-logged item) — Quick Add/
  // Photo/Custom all save to the library first with no meal/time attached
  // yet, so showing them there was a leftover from before that flow existed.
  $("#qTimeWrap").classList.toggle("hidden", mode !== "edit");
  $("#qTime").value = (prefill && prefill.ts) ? tsToTimeStr(prefill.ts) : nowTimeStr();
  $("#qSnackToggle").checked = mode === "edit" && editTarget && editTarget.mealId === "snacks";
  aiServingG = (mode === "ai" && prefill && prefill.serving_g) ? prefill.serving_g : 0;
  if (mode === "ai") $("#qNote").textContent = (aiServingG ? `≈ ${aiServingG} g portion. ` : "") + "AI's best guess — tweak anything, then add.";
  ["qName", "qKcal", "qProt", "qCarb", "qFat", "qServing", "mealTotalWeight", "mealServingWeight"].forEach((id) => ($("#" + id).value = ""));
  if (prefill) { $("#qName").value = prefill.name || ""; $("#qKcal").value = prefill.kcal || ""; $("#qProt").value = prefill.p || ""; $("#qCarb").value = prefill.c || ""; $("#qFat").value = prefill.f || ""; }
  $("#quickSave").textContent = mode === "edit" ? "Save changes" : "Save to library";
  customIngredients = []; totalWTouched = false; servWTouched = false; editingCustomFoodId = null; editingSharedFood = null;
  setIngBasis("100g");
  ["ingName", "ingQty", "ingKcal", "ingProt", "ingCarb", "ingFat"].forEach((id) => ($("#" + id).value = ""));
  hideIngSuggest();
  setCalUnit("kcal");
  setQCustomMode("simple");
  renderIngredientList();
  $("#quickSheet").classList.remove("hidden");
}
function setQCustomMode(m) {
  qCustomMode = m;
  $$("#qCustomModeSeg button").forEach((b) => b.classList.toggle("active", b.dataset.val === m));
  $("#qSimpleFields").classList.toggle("hidden", m !== "simple");
  $("#qIngredientsFields").classList.toggle("hidden", m !== "ingredients");
  // Warm the shared-library cache so its foods appear in the ingredient
  // type-ahead without a visible wait on first keystroke.
  if (m === "ingredients" && SHARED_FOODS_API && sharedFoods === null && !sharedLoading) fetchSharedFoods();
}
$("#qCustomModeSeg").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  setQCustomMode(b.dataset.val);
});
function setCalUnit(u) {
  calUnit = u;
  $$(".unit-toggle button").forEach((b) => b.classList.toggle("active", b.dataset.u === u));
}
document.addEventListener("click", (e) => {
  const b = e.target.closest(".unit-toggle button");
  if (b) setCalUnit(b.dataset.u);
});
function toKcal(raw) { return calUnit === "kj" ? raw / KJ_PER_KCAL : raw; }
function setIngBasis(basis) {
  ingBasis = basis;
  $$("#ingBasisChips button").forEach((x) => x.classList.toggle("active", x.dataset.basis === basis));
  $("#ingQtyLabelText").textContent = ingBasis === "100g" ? "Qty (g)" : "Servings";
  $("#ingQty").placeholder = ingBasis === "100g" ? "100" : "1";
}
$("#ingBasisChips").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  setIngBasis(b.dataset.basis);
});

/* Ingredient type-ahead: pick any known food (custom, shared library,
   built-in DB, or an on-demand Open Food Facts search) as an ingredient
   instead of typing its macros by hand. Picking fills the macro fields —
   per-100g when the food's gram weight is known, per-serving otherwise —
   leaving only the quantity to enter. */
let ingSuggestTimer = null;
function ingSuggestSources() {
  const seen = new Set(), out = [];
  const push = (f, src) => { const k = f.name.toLowerCase(); if (!f.name || seen.has(k)) return; seen.add(k); out.push({ f, src }); };
  state.customFoods.forEach((f) => push(f, "Custom"));
  (sharedFoods || []).forEach((f) => push(f, "Shared"));
  FOOD_DB.forEach((f) => push(f, "Library"));
  return out;
}
function hideIngSuggest() { $("#ingSuggest").classList.add("hidden"); $("#ingSuggest").innerHTML = ""; }
function renderIngSuggest() {
  const q = $("#ingName").value.trim().toLowerCase();
  if (q.length < 2) return hideIngSuggest();
  const rows = ingSuggestSources().filter((r) => r.f.name.toLowerCase().includes(q)).slice(0, 6);
  const el = $("#ingSuggest");
  el.innerHTML = rows.map((r, i) =>
    `<li data-pick="${i}"><span class="is-name">${esc(r.f.name)}</span><span class="is-sub">${esc(r.f.serving || "per 100 g")} · ${r0(r.f.kcal)} kcal</span><span class="is-src">${r.src}</span></li>`).join("")
    + `<li data-off="1"><span class="is-name muted">Search online for “${esc($("#ingName").value.trim())}”…</span><span class="is-src">Online</span></li>`;
  el.classList.remove("hidden");
  $$("#ingSuggest [data-pick]").forEach((li) => li.addEventListener("click", () => applyIngPick(rows[+li.dataset.pick].f, false)));
  const off = el.querySelector("[data-off]");
  if (off) off.addEventListener("click", () => ingSearchOFF($("#ingName").value.trim()));
}
async function ingSearchOFF(q) {
  const el = $("#ingSuggest");
  el.innerHTML = `<li><span class="is-name muted">Searching Open Food Facts…</span></li>`;
  let results;
  try {
    results = await offQuery(q, 8);
  } catch (e) { el.innerHTML = `<li><span class="is-name muted">Search failed — are you online?</span></li>`; return; }
  if (!results.length) { el.innerHTML = `<li><span class="is-name muted">No online match for “${esc(q)}”.</span></li>`; return; }
  el.innerHTML = results.map((f, i) =>
    `<li data-pick="${i}"><span class="is-name">${esc(f.name)}</span><span class="is-sub">${esc(f.brand || "per 100 g")} · ${r0(f.kcal)} kcal</span><span class="is-src">Online</span></li>`).join("");
  $$("#ingSuggest [data-pick]").forEach((li) => li.addEventListener("click", () => applyIngPick(results[+li.dataset.pick], true)));
}
function applyIngPick(f, per100) {
  const g = per100 ? 100 : servingGrams(f);
  // Values are filled as kcal, so make sure the unit toggle agrees.
  setCalUnit("kcal");
  $("#ingName").value = f.name;
  if (g) {
    // Known gram weight — normalize to per-100g so quantity is entered in grams.
    const k = 100 / g;
    setIngBasis("100g");
    $("#ingKcal").value = r1(f.kcal * k); $("#ingProt").value = r1((f.p || 0) * k); $("#ingCarb").value = r1((f.c || 0) * k); $("#ingFat").value = r1((f.f || 0) * k);
    $("#ingQty").value = "";
  } else {
    setIngBasis("serving");
    $("#ingKcal").value = r1(f.kcal); $("#ingProt").value = r1(f.p || 0); $("#ingCarb").value = r1(f.c || 0); $("#ingFat").value = r1(f.f || 0);
    $("#ingQty").value = 1;
  }
  hideIngSuggest();
  $("#ingQty").focus();
}
$("#ingName").addEventListener("input", () => {
  clearTimeout(ingSuggestTimer);
  ingSuggestTimer = setTimeout(renderIngSuggest, 150);
});
function ingredientTotals() {
  return customIngredients.reduce((s, ing) => ({ kcal: s.kcal + ing.kcal, p: s.p + ing.p, c: s.c + ing.c, f: s.f + ing.f }), { kcal: 0, p: 0, c: 0, f: 0 });
}
function defaultTotalWeight() {
  return customIngredients.filter((i) => i.basis === "100g").reduce((s, i) => s + i.qty, 0);
}
function renderIngredientList() {
  $("#ingredientList").innerHTML = customIngredients.length
    ? customIngredients.map((ing, i) => {
        const qtyLabel = ing.basis === "100g" ? `${ing.qty} g` : `${ing.qty} × serving`;
        return `<li><span class="row-label">${esc(ing.name)} <span class="muted">(${qtyLabel})</span></span>
          <span class="ing-right"><span class="fi-kcal">${r0(ing.kcal)}</span>
          <button class="fi-del" data-i="${i}"><span class="ic" data-ic="x"></span></button></span></li>`;
      }).join("")
    : `<li class="muted" style="border-top:none">No ingredients yet.</li>`;
  renderIcons($("#ingredientList"));
  wireIndexDelete("#ingredientList", () => customIngredients, renderIngredientList, { save: false });
  makeSwipeable($("#ingredientList"));
  if (!totalWTouched) $("#mealTotalWeight").value = defaultTotalWeight() || "";
  if (!servWTouched) $("#mealServingWeight").value = $("#mealTotalWeight").value;
  updateMealWeightPreview();
}
function servingFactor() {
  const totalW = parseFloat($("#mealTotalWeight").value) || 0;
  const servW = parseFloat($("#mealServingWeight").value) || 0;
  return totalW > 0 && servW > 0 ? servW / totalW : 1;
}
function updateMealWeightPreview() {
  const t = ingredientTotals(), factor = servingFactor();
  const per = { kcal: t.kcal * factor, p: t.p * factor, f: t.f * factor, c: t.c * factor };
  $("#ingTotals").innerHTML = `<div><span>${r0(per.kcal)}</span><label>kcal</label></div><div class="mc-p"><span>${r1(per.p)}</span><label>protein</label></div><div class="mc-f"><span>${r1(per.f)}</span><label>fat</label></div><div class="mc-c"><span>${r1(per.c)}</span><label>carbs</label></div>`;
  $("#ingBatchTotals").textContent = `Whole batch: ${r0(t.kcal)} kcal · P ${r1(t.p)}g · F ${r1(t.f)}g · C ${r1(t.c)}g`;
}
$("#mealTotalWeight").addEventListener("input", () => { totalWTouched = true; updateMealWeightPreview(); });
$("#mealServingWeight").addEventListener("input", () => { servWTouched = true; updateMealWeightPreview(); });
$("#ingAddBtn").addEventListener("click", () => {
  const name = $("#ingName").value.trim();
  const qty = parseFloat($("#ingQty").value);
  const kcal = toKcal(parseFloat($("#ingKcal").value));
  if (!name) return toast("Enter an ingredient name");
  if (!qty || qty <= 0) return toast("Enter a quantity");
  if (isNaN(kcal) || kcal < 0) return toast("Enter calories");
  const p = parseFloat($("#ingProt").value) || 0, c = parseFloat($("#ingCarb").value) || 0, f = parseFloat($("#ingFat").value) || 0;
  const factor = ingBasis === "100g" ? qty / 100 : qty;
  customIngredients.push({ name, basis: ingBasis, qty, kcal: kcal * factor, p: p * factor, c: c * factor, f: f * factor });
  ["ingName", "ingQty", "ingKcal", "ingProt", "ingCarb", "ingFat"].forEach((id) => ($("#" + id).value = ""));
  hideIngSuggest();
  renderIngredientList();
});
function openEditFood(mealId, i) {
  const item = dayLog(viewDate).meals[mealId][i];
  editTarget = { mealId, i };
  // Defensive rounding: older entries logged before macros were rounded at
  // save-time can still carry float noise (e.g. 29.999999999999999).
  openQuick("edit", { name: item.name, kcal: r0(item.kcal), p: r2(item.p || 0), c: r2(item.c || 0), f: r2(item.f || 0), ts: item.ts });
}
$("#addManualBtn").addEventListener("click", () => openQuick("manual"));
$("#customFoodBtn").addEventListener("click", () => openQuick("custom"));
$("#qEstimate").addEventListener("click", async () => {
  const desc = $("#qDesc").value.trim();
  if (!desc) return toast("Describe what you ate first");
  const btn = $("#qEstimate"), orig = btn.innerHTML;
  btn.disabled = true; btn.textContent = "Estimating…";
  try {
    const est = await estimateDescription(desc);
    $("#qName").value = est.name || "";
    $("#qKcal").value = est.kcal || "";
    $("#qProt").value = est.p || ""; $("#qCarb").value = est.c || ""; $("#qFat").value = est.f || "";
    aiServingG = est.serving_g || 0;
    if (aiServingG) $("#qServing").value = `${aiServingG} g`;
    manualEstimated = true;
    setCalUnit("kcal");
    toast("Filled from AI — tweak, then add");
  } catch (err) { toast("AI failed: " + (err.message || "error")); }
  btn.disabled = false; btn.innerHTML = orig;
});
function renderMultiItemsList() {
  $("#multiItemsList").innerHTML = multiParsedItems.length
    ? multiParsedItems.map((it, i) =>
        `<li><span class="row-label">${esc(it.name)} <span class="muted">${r0(it.kcal)} kcal</span></span>
         <button class="fi-del" data-i="${i}"><span class="ic" data-ic="x"></span></button></li>`).join("")
    : `<li class="muted" style="border-top:none">All items removed.</li>`;
  renderIcons($("#multiItemsList"));
  wireIndexDelete("#multiItemsList", () => multiParsedItems, renderMultiItemsList, { save: false });
  makeSwipeable($("#multiItemsList"));
  $("#multiItemsSaveBtn").textContent = multiParsedItems.length ? `Save ${multiParsedItems.length} item${multiParsedItems.length === 1 ? "" : "s"} to library` : "Save items";
  $("#multiItemsSaveBtn").disabled = !multiParsedItems.length;
}
$("#qEstimateMulti").addEventListener("click", async () => {
  const desc = $("#qDesc").value.trim();
  if (!desc) return toast("Describe what you ate first");
  const btn = $("#qEstimateMulti"), orig = btn.innerHTML;
  btn.disabled = true; btn.textContent = "Estimating…";
  const items = await estimateDescriptionMulti(desc);
  btn.disabled = false; btn.innerHTML = orig;
  if (!items) return toast("On-device AI unavailable — try single-item Estimate instead");
  multiParsedItems = items;
  $("#qSimpleFields").classList.add("hidden");
  $("#quickSave").classList.add("hidden");
  $("#multiItemsSection").classList.remove("hidden");
  renderMultiItemsList();
  toast(`Found ${items.length} item${items.length === 1 ? "" : "s"} — review, then save`);
});
$("#multiItemsSaveBtn").addEventListener("click", () => {
  if (!multiParsedItems || !multiParsedItems.length) return;
  let saved = 0;
  for (const it of multiParsedItems) {
    const serving = it.serving_g ? `${it.serving_g} g` : "1 serving";
    upsertCustomFood({ name: it.name, serving, kcal: it.kcal, p: it.p, c: it.c, f: it.f });
    saved++;
  }
  save();
  exitMultiReview();
  $("#quickSheet").classList.add("hidden");
  showCustomTab();
  toast(`Saved ${saved} item${saved === 1 ? "" : "s"} to your library`);
});
wireSheetClose("quickSheet", "quickClose");
let editingCustomFoodId = null;
$("#quickSave").addEventListener("click", () => {
  const name = $("#qName").value.trim();
  if (!name) return toast("Give it a name");
  let food, servingWeight = 0;
  if (quickMode === "custom" && qCustomMode === "ingredients") {
    if (!customIngredients.length) return toast("Add at least one ingredient");
    const t = ingredientTotals(), factor = servingFactor();
    servingWeight = parseFloat($("#mealServingWeight").value) || 0;
    food = { name, kcal: r0(t.kcal * factor), p: r1(t.p * factor), c: r1(t.c * factor), f: r1(t.f * factor) };
  } else {
    const kcal = toKcal(parseFloat($("#qKcal").value));
    if (isNaN(kcal) || kcal < 0) return toast("Enter calories");
    food = { name, kcal, p: parseFloat($("#qProt").value) || 0, c: parseFloat($("#qCarb").value) || 0, f: parseFloat($("#qFat").value) || 0 };
  }
  if (quickMode === "custom") {
    food.serving = $("#qServing").value.trim() || (qCustomMode === "ingredients" && servingWeight ? `${servingWeight} g` : "1 serving");
    if (qCustomMode === "ingredients") food.ingredients = customIngredients;
    if (editingSharedFood) {
      // Shared-library edit: push the change to the server, leave local
      // custom foods alone. Keep the sheet open if the update failed.
      const target = editingSharedFood;
      publishFood(food, target.rid).then((ok) => {
        if (!ok) return;
        editingSharedFood = null;
        $("#quickSheet").classList.add("hidden");
        if (sheetTab === "shared") renderFoodList();
      });
      return;
    }
    if (editingCustomFoodId) {
      food.id = editingCustomFoodId;
      const idx = state.customFoods.findIndex((x) => x.id === editingCustomFoodId);
      if (idx >= 0) state.customFoods[idx] = food; else state.customFoods.unshift(food);
      editingCustomFoodId = null;
      toast("Custom food updated");
    } else {
      food.id = "c" + Date.now();
      state.customFoods.unshift(food);
      toast("Custom food saved");
    }
    save();
    $("#quickSheet").classList.add("hidden"); renderFoodList();
  } else if (quickMode === "edit") {
    const timeStr = $("#qTime").value;
    const ts = timeToTs(viewDate, timeStr);
    const newMeal = $("#qSnackToggle").checked ? "snacks" : mealFromTime(timeStr);
    const log = dayLog(viewDate);
    log.meals[editTarget.mealId].splice(editTarget.i, 1); // remove from its old bucket first — index shifts otherwise
    log.meals[newMeal].push({ ...food, qtyLabel: "", ts });
    save(); renderToday(); $("#quickSheet").classList.add("hidden"); toast("Updated");
  } else {
    // Quick Add / Photo(ai): create-then-log is split like Custom food — save the
    // food to the library and show it there; the user taps it to add to a meal.
    const serving = $("#qServing").value.trim() || (aiServingG ? `${aiServingG} g` : "1 serving");
    upsertCustomFood({ name: food.name, serving, kcal: food.kcal, p: food.p, c: food.c, f: food.f });
    save();
    $("#quickSheet").classList.add("hidden");
    showCustomTab();
    toast("Saved to your library — tap it to add");
  }
});
function openEditCustomFood(id) {
  const f = state.customFoods.find((x) => x.id === id);
  if (!f) return;
  if (f.ingredients && f.ingredients.length) {
    openQuick("custom");
    setQCustomMode("ingredients");
    customIngredients = f.ingredients.map((i) => ({ ...i }));
    totalWTouched = true; servWTouched = true;
    const totalW = defaultTotalWeight();
    $("#mealTotalWeight").value = totalW || "";
    const m = /^(\d+(\.\d+)?)\s*g$/.exec(f.serving || "");
    $("#mealServingWeight").value = m ? m[1] : (totalW || "");
    renderIngredientList();
  } else {
    openQuick("custom");
    setQCustomMode("simple");
    $("#qKcal").value = f.kcal; $("#qProt").value = f.p; $("#qFat").value = f.f; $("#qCarb").value = f.c;
  }
  $("#qName").value = f.name;
  $("#qServing").value = f.serving || "";
  $("#quickTitle").textContent = "Edit custom food";
  $("#quickSave").textContent = "Save changes";
  editingCustomFoodId = id;
}

/* ---------- AI photo ---------- */
$("#aiBtn").addEventListener("click", () => {
  if (!state.settings.apiKey) { toast("Add an Anthropic API key in Settings first"); return; }
  $("#aiPhotoInput").click();
});
$("#aiPhotoInput").addEventListener("change", async (e) => {
  const file = e.target.files[0]; e.target.value = "";
  if (!file) return;
  toast("Analysing photo…");
  try {
    const { b64, mime } = await downscale(file, 1024);
    const est = await aiEstimate(b64, mime);
    openQuick("ai", est);
  } catch (err) { toast("AI failed: " + (err.message || "error")); }
});
function downscale(file, max) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const sc = Math.min(1, max / Math.max(img.width, img.height));
      const cv = document.createElement("canvas");
      cv.width = img.width * sc; cv.height = img.height * sc;
      cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
      res({ b64: cv.toDataURL("image/jpeg", 0.82).split(",")[1], mime: "image/jpeg" });
      URL.revokeObjectURL(img.src);
    };
    img.onerror = rej; img.src = URL.createObjectURL(file);
  });
}
async function aiEstimateCall(content) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": state.settings.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-opus-4-8",
      max_tokens: 500,
      messages: [{ role: "user", content }],
      output_config: { format: { type: "json_schema", schema: {
        type: "object", additionalProperties: false,
        properties: { name: { type: "string" }, kcal: { type: "integer" }, protein_g: { type: "integer" }, carbs_g: { type: "integer" }, fat_g: { type: "integer" }, serving_g: { type: "integer" } },
        required: ["name", "kcal", "protein_g", "carbs_g", "fat_g", "serving_g"],
      } } },
    }),
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const data = await res.json();
  const txt = (data.content || []).find((b) => b.type === "text")?.text || "{}";
  const j = JSON.parse(txt);
  return { name: j.name, kcal: j.kcal, p: j.protein_g, c: j.carbs_g, f: j.fat_g, serving_g: j.serving_g };
}
function aiEstimate(b64, mime) {
  return aiEstimateCall([
    { type: "image", source: { type: "base64", media_type: mime, data: b64 } },
    { type: "text", text: "Estimate the food in this photo as a single combined meal. Give your best numeric estimate of total calories, macros, and total weight in grams (serving_g) for the full portion shown. Respond with JSON only." },
  ]);
}
function aiEstimateText(desc) {
  return aiEstimateCall([
    { type: "text", text: "Estimate the calories and macros for this meal described by the user. Treat it as one combined meal, use a short title-cased name, and give your best numeric estimate for the full portion described. Description: " + desc },
  ]);
}

/* ---------- describe food ---------- */
// On-device Apple Foundation Models (iOS 26+) via the local FoundationLLM
// plugin; falls back to the Anthropic key if the device can't run it.
const FoundationLLM = (window.Capacitor && window.Capacitor.registerPlugin)
  ? window.Capacitor.registerPlugin("FoundationLLM") : null;
// Generic plain-text on-device generation (no JSON parsing) — used by
// anything that just wants a short sentence out of the model, e.g. the
// weekly-review narrative and natural-language exercise parsing. Returns
// null (never throws) when on-device AI isn't available, so callers can
// treat it as a "nice to have" and fall back to their non-AI behavior.
async function aiGenerateText(prompt) {
  if (!(isNativeApp() && FoundationLLM)) return null;
  try {
    const avail = await FoundationLLM.availability();
    if (avail.status !== "available") return null;
    const r = await FoundationLLM.generate({ prompt });
    return (r.text || "").trim() || null;
  } catch (e) { return null; }
}
const DESCRIBE_PROMPT = 'Estimate the calories and macros for the meal described below. Treat it as one combined meal, use a short title-cased name, and give your best numeric estimate for the full portion described, including its total weight in grams. Respond with ONLY a JSON object, no other text, exactly in this shape: {"name": string, "kcal": integer, "protein_g": integer, "carbs_g": integer, "fat_g": integer, "serving_g": integer}\n\nMeal: ';
async function estimateDescription(desc) {
  if (isNativeApp() && FoundationLLM) {
    try {
      const avail = await FoundationLLM.availability();
      if (avail.status === "available") {
        const r = await FoundationLLM.generate({ prompt: DESCRIBE_PROMPT + desc });
        const m = (r.text || "").match(/\{[\s\S]*?\}/);
        if (m) {
          const j = JSON.parse(m[0]);
          if (j.name && isFinite(+j.kcal)) return { name: j.name, kcal: +j.kcal, p: +j.protein_g || 0, c: +j.carbs_g || 0, f: +j.fat_g || 0, serving_g: +j.serving_g || 0 };
        }
        throw new Error("couldn't parse on-device response");
      }
    } catch (e) {
      if (!state.settings.apiKey) throw e;
      // otherwise fall through to Claude
    }
  }
  if (state.settings.apiKey) return aiEstimateText(desc);
  throw new Error("on-device AI unavailable on this device — add an API key in Settings as a fallback");
}
// Splits one free-text description into several distinct food items (e.g.
// "eggs, toast, and coffee" -> 3 items) — on-device only, no cloud fallback
// (same tradeoff as the exercise NL parsing), since this is a bonus mode on
// top of the single-item Describe rather than a core path.
const DESCRIBE_MULTI_PROMPT = 'The user is describing everything they ate in one message — it may be one food or several distinct foods. Split it into separate items only when they are genuinely different foods (do not split a single dish into its ingredients). For each item use a short title-cased name and your best numeric estimate for the described portion, including its total weight in grams. Respond with ONLY a JSON array, no other text, exactly in this shape: [{"name": string, "kcal": integer, "protein_g": integer, "carbs_g": integer, "fat_g": integer, "serving_g": integer}]\n\nDescription: ';
async function estimateDescriptionMulti(desc) {
  const text = await aiGenerateText(DESCRIBE_MULTI_PROMPT + desc);
  if (!text) return null;
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return null;
  try {
    const arr = JSON.parse(m[0]);
    if (!Array.isArray(arr) || !arr.length) return null;
    const items = arr.filter((j) => j.name && isFinite(+j.kcal))
      .map((j) => ({ name: j.name, kcal: r0(+j.kcal), p: r2(+j.protein_g || 0), c: r2(+j.carbs_g || 0), f: r2(+j.fat_g || 0), serving_g: +j.serving_g || 0 }));
    return items.length ? items : null;
  } catch (e) { return null; }
}
// (The standalone "Describe" sheet was folded into the merged "Add manually"
// flow — its Estimate button lives in #quickSheet now, see #qEstimate above.)

/* ---------- barcode scan ---------- */
// Safari/WKWebView (the native app's runtime) doesn't implement the
// BarcodeDetector API, so scanning is done with html5-qrcode (pure JS/canvas
// decoding, no native API dependency) instead.
let html5Qr = null, scanBusy = false;
function barcodeFormats() {
  return [
    Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.EAN_8,
    Html5QrcodeSupportedFormats.UPC_A, Html5QrcodeSupportedFormats.UPC_E,
  ];
}
$("#scanBtn").addEventListener("click", openScanner);
wireSheetClose("scanSheet", "scanClose", closeScanner);
$("#scanPhotoBtn").addEventListener("click", () => $("#scanPhotoInput").click());
$("#scanPhotoInput").addEventListener("change", async (e) => {
  const file = e.target.files[0]; e.target.value = "";
  if (!file || typeof Html5Qrcode === "undefined") return;
  scanBusy = true;
  $("#scanStatus").textContent = "Reading photo…";
  try { html5Qr && html5Qr.pause(true); } catch (_) {}
  const tmp = new Html5Qrcode("scanFileReader", { formatsToSupport: barcodeFormats(), verbose: false });
  try {
    const code = await tmp.scanFile(file, false);
    try { await tmp.clear(); } catch (_) {}
    lookupBarcode(code);
  } catch (err) {
    try { await tmp.clear(); } catch (_) {}
    $("#scanStatus").textContent = "No barcode found in that photo — fill the frame, hold steady, good light.";
    scanBusy = false;
    try { html5Qr && html5Qr.resume(); } catch (_) {}
  }
});
async function openScanner() {
  if (typeof Html5Qrcode === "undefined") { toast("Barcode scan unavailable here — try Online search"); return; }
  $("#scanSheet").classList.remove("hidden");
  $("#scanStatus").textContent = "Starting camera…";
  scanBusy = false;
  try {
    html5Qr = new Html5Qrcode("scanReader", {
      formatsToSupport: barcodeFormats(),
      // Let the browser's own native decoder handle frames when it exists
      // (faster than the JS/canvas fallback); WKWebView has none, so it
      // still falls back to the bundled zxing decoder there.
      experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      verbose: false,
    });
    await html5Qr.start(
      { facingMode: "environment" },
      {
        fps: 15,
        // No qrbox: scanning the full frame (a) removes html5-qrcode's own
        // shaded overlay so only our single guide frame shows, and (b) lets a
        // barcode be picked up anywhere in view rather than only a centre band.
        aspectRatio: 1.777,
        disableFlip: true,
        videoConstraints: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
      },
      (code) => { if (!scanBusy) lookupBarcode(code); },
      () => {},
    );
    $("#scanStatus").textContent = "Point the camera at a barcode — or take a photo below";
  } catch (err) {
    $("#scanStatus").textContent = "Camera blocked. Allow camera access or use Online search.";
  }
}
async function closeScanner() {
  $("#scanSheet").classList.add("hidden");
  if (html5Qr) {
    const instance = html5Qr; html5Qr = null;
    try { await instance.stop(); instance.clear(); } catch (_) {}
  }
}
async function lookupBarcode(code) {
  scanBusy = true;
  const instance = html5Qr;
  try { instance && instance.pause(true); } catch (_) {}
  $("#scanStatus").textContent = "Found " + code + " — looking up…";
  try {
    const data = await (await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,brands,nutriments`)).json();
    if (data.status !== 1 || !data.product) { $("#scanStatus").textContent = "Not in database. Try again or add manually."; setTimeout(() => resumeScan(instance), 1200); return; }
    const p = data.product, n = p.nutriments || {};
    if (n["energy-kcal_100g"] == null) { $("#scanStatus").textContent = "No calorie data for that product."; setTimeout(() => resumeScan(instance), 1200); return; }
    await closeScanner();
    // Save the scanned product to the library (per 100 g); the user logs it from
    // there like any other food — same create-then-log split as Custom.
    const name = p.product_name || "Product";
    const food = { name, serving: "100 g", kcal: +n["energy-kcal_100g"] || 0, p: +n["proteins_100g"] || 0, c: +n["carbohydrates_100g"] || 0, f: +n["fat_100g"] || 0 };
    upsertCustomFood(food);
    save();
    showCustomTab();
    toast(`${name} saved to your library — tap it to add`);
  } catch (e) { $("#scanStatus").textContent = "Lookup failed — check your connection."; setTimeout(() => resumeScan(instance), 1200); }
}
function resumeScan(instance) {
  if ($("#scanSheet").classList.contains("hidden") || !instance) return;
  scanBusy = false;
  try { instance.resume(); } catch (_) {}
  $("#scanStatus").textContent = "Point the camera at a barcode";
}

/* ---------- Training: EMOM / AMRAP timer ---------- */
let timerMode = state.settings.timer.mode, emomInt = state.settings.timer.emomInt,
    emomRounds = state.settings.timer.emomRounds, amrapMins = state.settings.timer.amrapMins,
    timerProgram = state.settings.timer.program || [];
let tmr = null, tmrInt = null, audioCtx = null;
function saveTimerCfg() {
  state.settings.timer = { mode: timerMode, emomInt, emomRounds, amrapMins, program: timerProgram };
  save();
}

function beep(freq, dur, vol) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = "sine"; o.frequency.value = freq || 880;
    g.gain.value = vol || 0.35;
    o.connect(g); g.connect(audioCtx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + (dur || 0.12));
    o.stop(audioCtx.currentTime + (dur || 0.12));
  } catch (_) {}
}
function fmtClock(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : String(s);
}
function chipPick(sel, attr, cb) {
  $(sel).addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    $$(sel + " button").forEach((x) => x.classList.toggle("active", x === b));
    cb(+b.dataset[attr]);
  });
}
chipPick("#emomIntChips", "s", (v) => { emomInt = v; saveTimerCfg(); });
chipPick("#emomRoundChips", "r", (v) => { emomRounds = v; saveTimerCfg(); });
chipPick("#amrapMinChips", "m", (v) => { amrapMins = v; saveTimerCfg(); });
function syncTimerUI() {
  $$("#timerModeSeg button").forEach((x) => x.classList.toggle("active", x.dataset.val === timerMode));
  $$("#emomIntChips button").forEach((x) => x.classList.toggle("active", +x.dataset.s === emomInt));
  $$("#emomRoundChips button").forEach((x) => x.classList.toggle("active", +x.dataset.r === emomRounds));
  $$("#amrapMinChips button").forEach((x) => x.classList.toggle("active", +x.dataset.m === amrapMins));
  $("#emomFields").classList.toggle("hidden", timerMode !== "emom");
  $("#amrapFields").classList.toggle("hidden", timerMode !== "amrap");
  $("#timerHint").textContent = timerMode === "emom"
    ? "EMOM: start a new set every interval — rest with whatever time is left."
    : "AMRAP: as many rounds as possible before time runs out. Tap +1 each time you finish a round.";
  $("#timerProgram").value = timerProgram.join("\n");
  renderProgramTemplates();
  renderProgramPreview();
}
const PROGRAM_TEMPLATES = [
  { name: "KB Strength", moves: ["Kettlebell swings", "Goblet squats", "Push press", "Rest"] },
  { name: "KB Conditioning", moves: ["Swings", "High pulls", "Snatches", "Rest"] },
  { name: "Full body", moves: ["Swings", "Clean & press", "Goblet squat", "Rest"] },
  { name: "Core & swings", moves: ["Russian twists", "Sit-ups", "Kettlebell swings", "Rest"] },
];
function renderProgramTemplates() {
  const cur = timerProgram.join("\n").toLowerCase();
  $("#programTemplates").innerHTML = PROGRAM_TEMPLATES.map((t, i) =>
    `<button data-tpl="${i}" class="${t.moves.join("\n").toLowerCase() === cur ? "active" : ""}">${t.name}</button>`).join("")
    + `<button data-tpl="clear" class="${cur ? "" : "active"}">Custom / clear</button>`;
}
$("#programTemplates").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.tpl === "clear") { timerProgram = []; $("#timerProgram").value = ""; $("#timerProgram").focus(); }
  else { timerProgram = PROGRAM_TEMPLATES[+b.dataset.tpl].moves.slice(); $("#timerProgram").value = timerProgram.join("\n"); }
  saveTimerCfg(); renderProgramPreview(); renderProgramTemplates();
});
function renderProgramPreview() {
  if (!timerProgram.length) { $("#programPreview").textContent = "No program set — just shows a round counter."; return; }
  $("#programPreview").textContent = timerMode === "emom"
    ? `Cycles every ${timerProgram.length} round${timerProgram.length === 1 ? "" : "s"}: ${timerProgram.join(" → ")}`
    : `Circuit to repeat each round: ${timerProgram.join(" → ")}`;
}
let programSaveTimer = null;
$("#timerProgram").addEventListener("input", () => {
  clearTimeout(programSaveTimer);
  programSaveTimer = setTimeout(() => {
    timerProgram = $("#timerProgram").value.split("\n").map((s) => s.trim()).filter(Boolean);
    saveTimerCfg(); renderProgramPreview(); renderProgramTemplates();
  }, 300);
});
$("#timerModeSeg").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  timerMode = b.dataset.val;
  saveTimerCfg();
  syncTimerUI();
});

function timerElapsed() {
  return ((tmr.pausedAt || Date.now()) - tmr.startTs - tmr.pausedTotal) / 1000;
}
// A "finished!" local notification fires even if the phone locks mid-workout.
// (A live Dynamic Island countdown needs a native ActivityKit widget extension —
// not feasible with this CI-regenerated project yet.)
function timerLN() { return window.capacitorLocalNotifications && window.capacitorLocalNotifications.LocalNotifications; }
async function scheduleTimerNotif() {
  const LN = timerLN();
  if (!isNativeApp() || !LN || !tmr || tmr.finished) return;
  try {
    const perm = await LN.requestPermissions();
    if (perm.display !== "granted") return;
    const remaining = tmr.total - timerElapsed();
    if (remaining <= 0) return;
    await LN.schedule({ notifications: [{
      id: 2, title: "FitTrack",
      body: (tmr.mode === "emom" ? `EMOM ${tmr.interval}s × ${tmr.rounds}` : `AMRAP ${tmr.total / 60} min`) + " finished — nice work!",
      schedule: { at: new Date(Date.now() + remaining * 1000) },
    }] });
  } catch (_) {}
}
async function cancelTimerNotif() {
  const LN = timerLN();
  if (!isNativeApp() || !LN) return;
  try { await LN.cancel({ notifications: [{ id: 2 }] }); } catch (_) {}
}
$("#timerStart").addEventListener("click", () => {
  const total = timerMode === "emom" ? emomInt * emomRounds : amrapMins * 60;
  tmr = { mode: timerMode, interval: emomInt, rounds: emomRounds, total, startTs: Date.now(), pausedAt: null, pausedTotal: 0, amrapCount: 0, lastRound: 1, lastBeep: null, finished: false, program: timerProgram.slice() };
  $("#toRoundBtn").classList.toggle("hidden", timerMode !== "amrap");
  $("#toRoundBtn").textContent = "+1 round (0)";
  $("#toLog").classList.add("hidden");
  $("#toPause").textContent = "Pause";
  $("#toPause").classList.remove("hidden");
  // EMOM: the program cycles round-to-round. AMRAP: it's a fixed circuit
  // (rounds aren't tied to a minute), shown once as a reference, not cycled.
  if (tmr.program.length && timerMode === "amrap") {
    $("#toExercise").textContent = tmr.program.join(" → ");
    $("#toExercise").classList.remove("hidden");
  } else {
    $("#toExercise").classList.toggle("hidden", !tmr.program.length);
  }
  $("#timerOverlay").classList.remove("hidden");
  beep(980, 0.2); haptic();
  scheduleTimerNotif();
  clearInterval(tmrInt); tmrInt = setInterval(timerTick, 200); timerTick();
});
function timerTick() {
  if (!tmr || tmr.finished || tmr.pausedAt) return;
  const el = timerElapsed();
  const overlay = $("#timerOverlay");
  if (el >= tmr.total) return finishTimer();
  let remaining, sub;
  if (tmr.mode === "emom") {
    const round = Math.min(Math.floor(el / tmr.interval) + 1, tmr.rounds);
    remaining = tmr.interval - (el % tmr.interval);
    if (round !== tmr.lastRound) { tmr.lastRound = round; beep(1180, 0.25); haptic(); }
    $("#toMode").textContent = `EMOM · ${tmr.interval}s`;
    sub = `Round ${round} of ${tmr.rounds}`;
    if (tmr.program.length) $("#toExercise").textContent = tmr.program[(round - 1) % tmr.program.length];
  } else {
    remaining = tmr.total - el;
    $("#toMode").textContent = `AMRAP · ${tmr.total / 60} min`;
    sub = `${tmr.amrapCount} round${tmr.amrapCount === 1 ? "" : "s"} done`;
  }
  const rc = Math.ceil(remaining);
  if (rc <= 3 && rc >= 1 && tmr.lastBeep !== rc + ":" + tmr.lastRound) { tmr.lastBeep = rc + ":" + tmr.lastRound; beep(760, 0.1); }
  $("#toTime").textContent = fmtClock(remaining);
  $("#toSub").textContent = sub;
  overlay.classList.toggle("warn", remaining <= 5 && remaining > 0);
  overlay.classList.toggle("work", remaining > 5);
  overlay.classList.remove("done");
}
function finishTimer() {
  tmr.finished = true;
  clearInterval(tmrInt);
  cancelTimerNotif();
  const o = $("#timerOverlay");
  o.classList.remove("work", "warn"); o.classList.add("done");
  $("#toTime").textContent = "Done";
  $("#toSub").textContent = tmr.mode === "emom"
    ? `${tmr.rounds} rounds · ${r0(tmr.total / 60)} min`
    : `${tmr.amrapCount} rounds in ${tmr.total / 60} min`;
  $("#toPause").classList.add("hidden");
  $("#toRoundBtn").classList.add("hidden");
  $("#toExercise").classList.add("hidden");
  $("#toName").value = "";
  $("#toName").placeholder = tmr.mode === "emom" ? `EMOM ${tmr.interval}s × ${tmr.rounds}` : `AMRAP ${tmr.total / 60}min (${tmr.amrapCount} rounds)`;
  $("#toName").classList.remove("hidden");
  $("#toLog").classList.remove("hidden");
  beep(980, 0.3); setTimeout(() => beep(1180, 0.4), 250); haptic();
}
$("#toRoundBtn").addEventListener("click", () => {
  if (!tmr || tmr.finished) return;
  tmr.amrapCount++;
  $("#toRoundBtn").textContent = `+1 round (${tmr.amrapCount})`;
  haptic("light"); beep(1050, 0.08, 0.2);
});
$("#toPause").addEventListener("click", () => {
  if (!tmr || tmr.finished) return;
  if (tmr.pausedAt) {
    tmr.pausedTotal += Date.now() - tmr.pausedAt; tmr.pausedAt = null;
    $("#toPause").textContent = "Pause";
    scheduleTimerNotif();
  } else {
    tmr.pausedAt = Date.now();
    $("#toPause").textContent = "Resume";
    cancelTimerNotif();
  }
});
$("#toEnd").addEventListener("click", () => {
  if (tmr && !tmr.finished) {
    if (!confirm("End this workout early?")) return;
    cancelTimerNotif();
    if (timerElapsed() > 30) return finishTimer();
  }
  closeTimer();
});
$("#toLog").addEventListener("click", () => {
  const mins = r0(tmr.total / 60);
  const kcal = 8 * currentWeight() * (tmr.total / 3600); // kettlebell circuit ≈ MET 8
  const defaultName = tmr.mode === "emom" ? `EMOM ${tmr.interval}s × ${tmr.rounds}` : `AMRAP ${tmr.total / 60}min (${tmr.amrapCount} rounds)`;
  const custom = $("#toName").value.trim();
  // keep the EMOM/AMRAP prefix so Recent sessions still recognizes it
  const name = custom ? `${tmr.mode === "emom" ? "EMOM" : "AMRAP"} · ${custom}` : defaultName;
  dayLog(todayKey()).walks.push({ name, ic: "timer", mins, kcal });
  save(); haptic();
  closeTimer(); toast(`Logged ${name} · ${r0(kcal)} kcal`);
  renderTraining();
});
function closeTimer() {
  cancelTimerNotif();
  clearInterval(tmrInt); tmr = null;
  const o = $("#timerOverlay");
  o.classList.add("hidden"); o.classList.remove("work", "warn", "done");
  $("#toName").classList.add("hidden");
  $("#toExercise").classList.add("hidden");
}
function renderTraining() {
  syncTimerUI();
  // Every logged activity (walks, weighted circuits, finished EMOM/AMRAP) rolls
  // up here, newest first — today's entries are removable. Only a handful show
  // inline; the full history lives in the Activity History sheet (tap the card).
  const sessions = [];
  for (let i = 0; i < 30; i++) {
    const dk = addDays(todayKey(), -i), l = state.logs[dk];
    if (!l || !l.walks) continue;
    l.walks.forEach((w, idx) => sessions.push({ d: dk, idx, today: dk === todayKey(), ...w }));
  }
  $("#sessionList").innerHTML = sessions.length
    ? sessions.slice(0, 5).map((s) =>
        `<li><span class="row-label"><span class="ic" data-ic="${s.ic || exerciseIcon(s.name)}"></span>${esc(s.name)}${s.mins ? ` <span class="fi-qty">${s.mins} min</span>` : ""}</span>
          <span class="ing-right"><span class="d">${s.today ? "Today" : fmtShort(s.d)} · ${r0(s.kcal)} kcal</span>${s.today ? `<button class="fi-del" data-dk="${s.d}" data-i="${s.idx}"><span class="ic" data-ic="x"></span></button>` : ""}</span></li>`).join("")
    : `<li class="muted" style="border-top:none">Activities and finished workouts you log will show up here.</li>`;
  renderIcons($("#sessionList"));
  const tLog = state.logs[todayKey()], tWalks = (tLog && tLog.walks) || [];
  const total = tWalks.reduce((s, w) => s + w.kcal, 0);
  $("#trainExerciseSummary").textContent = tWalks.length
    ? `Today: ${tWalks.length} ${tWalks.length === 1 ? "activity" : "activities"} · ${r0(total)} kcal burned`
    : "Nothing logged today yet — tap + to add an activity.";
  wireIndexDelete("#sessionList", (b) => { const l = state.logs[b.dataset.dk]; return l && l.walks; }, renderTraining);
  makeSwipeable($("#sessionList"));
  renderScheduleWeek();
}

/* ---------- activity history (full screen) ---------- */
function weekStartKey(dk) {
  const monFirst = (state.settings.weekStart || "mon") === "mon";
  const dow = fromKey(dk).getDay(); // 0=Sun
  return addDays(dk, -(monFirst ? (dow + 6) % 7 : dow));
}
function renderActivityFull() {
  const sessions = [];
  for (const dk of Object.keys(state.logs).sort().reverse()) {
    const l = state.logs[dk];
    if (!l || !l.walks || !l.walks.length) continue;
    l.walks.forEach((w, idx) => sessions.push({ d: dk, idx, ...w }));
  }
  // Weekly burn — last 8 weeks, current week last.
  const W = 340, H = 150, L = 34, R = 8, T = 12, B = 22;
  const thisWeek = weekStartKey(todayKey());
  const weeks = [];
  for (let i = 7; i >= 0; i--) {
    const ws = addDays(thisWeek, -7 * i), we = addDays(ws, 6);
    const inWk = sessions.filter((s) => s.d >= ws && s.d <= we);
    weeks.push({ ws, we, kcal: inWk.reduce((s, x) => s + (x.kcal || 0), 0), n: inWk.length });
  }
  const max = Math.max(...weeks.map((w) => w.kcal), 1);
  const bw = (W - L - R) / weeks.length, gap = Math.min(6, bw * 0.18), rx = Math.min(3, bw / 3.5);
  const Y = (v) => T + (1 - v / max) * (H - T - B);
  const bars = weeks.map((w, i) => w.kcal ? `<rect data-tip="${fmtShort(w.ws)} – ${fmtShort(w.we)} · ${r0(w.kcal)} kcal · ${w.n} session${w.n === 1 ? "" : "s"}" x="${(L + i * bw + gap / 2).toFixed(1)}" y="${Y(w.kcal).toFixed(1)}" width="${(bw - gap).toFixed(1)}" height="${(H - B - Y(w.kcal)).toFixed(1)}" rx="${rx.toFixed(1)}" fill="var(--blue)" opacity="${i === weeks.length - 1 ? 1 : 0.72}"/>` : "").join("");
  $("#activityWeekChart").innerHTML = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" stroke="var(--border)"/>${gridSVG(niceTicks(0, max, 4).filter((t) => t > 0), Y, L, W, R)}${bars}<text x="${L}" y="${H - 7}" font-size="9" fill="var(--muted)">${fmtShort(weeks[0].ws)}</text><text x="${W - R}" y="${H - 7}" text-anchor="end" font-size="9" fill="var(--muted)">this week</text></svg>`;
  // Last-30-day stats.
  const cutoff = addDays(todayKey(), -29);
  const recent = sessions.filter((s) => s.d >= cutoff);
  const kcal30 = recent.reduce((s, x) => s + (x.kcal || 0), 0);
  const mins30 = recent.reduce((s, x) => s + (x.mins || 0), 0);
  const activeDays = new Set(recent.map((s) => s.d)).size;
  $("#activityStats").innerHTML = `
    <div class="stat-box"><div class="v">${recent.length}</div><div class="k">sessions</div></div>
    <div class="stat-box"><div class="v">${r0(kcal30).toLocaleString()}</div><div class="k">kcal burned</div></div>
    <div class="stat-box"><div class="v">${mins30 >= 90 ? r1(mins30 / 60) + " h" : mins30 + " min"}</div><div class="k">total time</div></div>
    <div class="stat-box"><div class="v">${activeDays}</div><div class="k">active days</div></div>`;
  // Totals per activity, biggest burner first.
  const byType = {};
  recent.forEach((s) => {
    const key = s.name;
    (byType[key] = byType[key] || { name: s.name, ic: s.ic || exerciseIcon(s.name), n: 0, kcal: 0 });
    byType[key].n++; byType[key].kcal += s.kcal || 0;
  });
  const types = Object.values(byType).sort((a, b) => b.kcal - a.kcal);
  $("#activityTypeList").innerHTML = types.length
    ? types.map((t) => `<li><span class="row-label"><span class="ic" data-ic="${t.ic}"></span>${esc(t.name)} <span class="fi-qty">×${t.n}</span></span><span class="ing-right"><span class="d">${r0(t.kcal)} kcal</span></span></li>`).join("")
    : `<li class="muted" style="border-top:none">Nothing logged in the last 30 days.</li>`;
  // One week at a time with ‹ › paging (same pattern as the Summary sheet)
  // instead of the whole history as one endless list.
  const wkStart = addDays(thisWeek, -7 * actWeekOffset), wkEnd = addDays(wkStart, 6);
  const wkRows = sessions.filter((s) => s.d >= wkStart && s.d <= wkEnd);
  const wkLabel = actWeekOffset === 0 ? "This week" : actWeekOffset === 1 ? "Last week" : `${fmtShort(wkStart)} – ${fmtShort(wkEnd)}`;
  const wkKcal = wkRows.reduce((s, x) => s + (x.kcal || 0), 0);
  $("#activityFullList").innerHTML = `
    <div class="range-nav">
      <button class="day-nav" id="actWkPrev"><span class="ic" data-ic="chevL"></span></button>
      <span class="range-label">${wkLabel}</span>
      <button class="day-nav" id="actWkNext"><span class="ic" data-ic="chevR"></span></button>
    </div>
    <ul class="entry-list">${wkRows.length ? wkRows.map((s) =>
      `<li><span class="row-label"><span class="ic" data-ic="${s.ic || exerciseIcon(s.name)}"></span>${esc(s.name)}${s.mins ? ` <span class="fi-qty">${s.mins} min</span>` : ""}</span>
        <span class="ing-right"><span class="d">${s.d === todayKey() ? "Today" : fmtShort(s.d)} · ${r0(s.kcal)} kcal</span><button class="fi-del" data-dk="${s.d}" data-i="${s.idx}"><span class="ic" data-ic="x"></span></button></span></li>`).join("")
      : `<li class="muted" style="border-top:none">No sessions this week.</li>`}</ul>
    ${wkRows.length ? `<p class="muted" style="margin-top:8px">${r0(wkKcal)} kcal · ${wkRows.length} session${wkRows.length === 1 ? "" : "s"}</p>` : ""}`;
  $("#actWkNext").disabled = actWeekOffset === 0;
  $("#actWkPrev").disabled = wkStart <= weekStartKey(firstDataKey());
  $("#actWkPrev").addEventListener("click", () => { actWeekOffset++; haptic("light"); renderActivityFull(); });
  $("#actWkNext").addEventListener("click", () => { if (actWeekOffset > 0) { actWeekOffset--; haptic("light"); renderActivityFull(); } });
  renderIcons($("#activitySheet"));
  wireIndexDelete("#activityFullList", (b) => { const l = state.logs[b.dataset.dk]; return l && l.walks; }, () => { renderTraining(); renderToday(); renderActivityFull(); });
  $$("#activityFullList ul").forEach(makeSwipeable);
}
let actWeekOffset = 0;
makeCardExpandable("#recentSessionsCard", () => { actWeekOffset = 0; renderActivityFull(); $("#activitySheet").classList.remove("hidden"); });
wireSheetClose("activitySheet", "activityHistClose");

/* ---------- training schedule ---------- */
function renderScheduleWeek() {
  if (!state.activeWorkoutIds.length) {
    $("#weekSchedRow").innerHTML = `<p class="muted" style="grid-column:1/-1">Training schedule not configured yet.</p>`;
    return;
  }
  const dates = weekDatesFor(new Date());
  const todayK = todayKey();
  $("#weekSchedRow").innerHTML = dates.map((d) => {
    const dk = dayKeyOf(d), info = scheduleDayInfo(d), isToday = toKey(d) === todayK;
    // Icon + a "×N" count instead of the workout's name — a name (or the old
    // "Name +N" label) is unbounded length and was the actual cause of the
    // week strip bleeding; an icon and a 1-2 digit count never grow.
    const label = info.rest ? "Rest" : (info.count > 1 ? `×${info.count}` : "");
    return `<div class="sched-day${isToday ? " today" : ""}" data-dk="${dk}">
      <span class="sched-dow">${DAY_LABELS[dk]}</span>
      <span class="sched-date">${d.getDate()}</span>
      <span class="ic sched-ic${info.rest ? " rest" : ""}" data-ic="${info.ic}"></span>
      <span class="sched-label">${label}</span>
    </div>`;
  }).join("");
  renderIcons($("#weekSchedRow"));
  // stopPropagation so tapping a day doesn't also trigger the card's
  // makeCardExpandable click-through to the full month sheet.
  $$("#weekSchedRow .sched-day").forEach((el) => el.addEventListener("click", (e) => { e.stopPropagation(); openDayEdit(el.dataset.dk); }));
  renderBreakBanner();
}
function renderBreakBanner() {
  const b = state.trainingBreak, el = $("#breakBanner");
  if (!el) return;
  const active = b && b.until >= todayKey();
  el.classList.toggle("hidden", !active);
  if (active) el.innerHTML = `<span><span class="ic" data-ic="moon"></span>On a break until ${fmtShort(b.until)}</span><button class="btn ghost" id="breakEndBtn">End early</button>`;
  renderIcons(el);
  const endBtn = $("#breakEndBtn");
  if (endBtn) endBtn.addEventListener("click", () => { state.trainingBreak = null; save(); renderScheduleWeek(); toast("Break ended"); });
}
let schedMonth = new Date();
function renderScheduleMonth() {
  $("#schedMonthLabel").textContent = schedMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const year = schedMonth.getFullYear(), month = schedMonth.getMonth();
  // Backwards clamp matches the calendar; forward stays open — a schedule is
  // for planning ahead.
  $("#schedMonthPrev").disabled = `${year}-${String(month + 1).padStart(2, "0")}` <= firstLoggedMonthKey();
  const monStart = (state.settings.weekStart || "mon") === "mon";
  const firstDow = new Date(year, month, 1).getDay();
  const offset = monStart ? (firstDow + 6) % 7 : firstDow;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayK = todayKey();
  const dows = monStart ? ["M", "T", "W", "T", "F", "S", "S"] : ["S", "M", "T", "W", "T", "F", "S"];
  let html = dows.map((d) => `<div class="cal-dow">${d}</div>`).join("");
  for (let i = 0; i < offset; i++) html += `<div class="cal-cell empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d), dk = dayKeyOf(date), info = scheduleDayInfo(date);
    const isToday = toKey(date) === todayK;
    html += `<div class="cal-cell static${isToday ? " today" : ""}" data-dk="${dk}">
      <span class="cal-daynum">${d}</span>
      <span class="ic sched-cell-ic${info.rest ? " rest" : ""}" data-ic="${info.ic}"></span>
    </div>`;
  }
  $("#schedMonthGrid").innerHTML = html;
  renderIcons($("#schedMonthGrid"));
  $$("#schedMonthGrid .cal-cell.static").forEach((el) => el.addEventListener("click", () => openDayEdit(el.dataset.dk)));
}
$("#schedMonthPrev").addEventListener("click", () => { schedMonth.setMonth(schedMonth.getMonth() - 1); renderScheduleMonth(); });
$("#schedMonthNext").addEventListener("click", () => { schedMonth.setMonth(schedMonth.getMonth() + 1); renderScheduleMonth(); });
makeCardExpandable("#scheduleCard", () => { renderScheduleMonth(); $("#scheduleMonthSheet").classList.remove("hidden"); });
wireSheetClose("scheduleMonthSheet", "scheduleMonthClose");

// Day-first quick-edit: tap a day (in the week strip or the month grid) to
// toggle its workouts without opening the full Manage Workouts sheet. This
// is a shortcut on top of the same state.trainingSchedule data the
// Manage Workouts rows (renderScheduledWorkoutList) edit — either one keeps
// the other in sync since both just mutate the shared per-weekday arrays.
const DAY_FULL = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
let dayEditDk = null;
function openDayEdit(dk) {
  dayEditDk = dk;
  $("#dayEditTitle").textContent = DAY_FULL[dk];
  renderDayEditChips();
  $("#scheduleMonthSheet").classList.add("hidden");
  $("#dayEditSheet").classList.remove("hidden");
}
function renderDayEditChips() {
  const active = state.activeWorkoutIds.map(workoutById).filter(Boolean);
  const arr = state.trainingSchedule[dayEditDk] || (state.trainingSchedule[dayEditDk] = []);
  $("#dayEditChips").innerHTML = active.length
    ? active.map((w) => `<button data-id="${w.id}" class="${arr.includes(w.id) ? "active" : ""}"><span class="ic" data-ic="${w.ic || "dumbbell"}"></span>${esc(w.name)}</button>`).join("")
    : `<p class="muted">No workouts set up yet — add one in "Manage workouts" below.</p>`;
  renderIcons($("#dayEditChips"));
  $$("#dayEditChips button").forEach((b) => b.addEventListener("click", () => {
    const id = b.dataset.id, idx = arr.indexOf(id);
    if (idx >= 0) arr.splice(idx, 1); else arr.push(id);
    b.classList.toggle("active");
    save(); renderScheduleWeek(); rescheduleWorkoutNotif(id);
  }));
}
$("#dayEditRestBtn").addEventListener("click", () => {
  const cleared = state.trainingSchedule[dayEditDk] || [];
  state.trainingSchedule[dayEditDk] = [];
  save(); renderDayEditChips(); renderScheduleWeek(); toast(`${DAY_FULL[dayEditDk]} set to rest`);
  cleared.forEach(rescheduleWorkoutNotif);
});
$("#dayEditManageBtn").addEventListener("click", () => { $("#dayEditSheet").classList.add("hidden"); openScheduleEdit(); });
wireSheetClose("dayEditSheet", "dayEditClose", () => { $("#dayEditSheet").classList.add("hidden"); renderScheduleWeek(); });

// Training break: a real date range that overrides the recurring weekly
// pattern without editing it, so the schedule resumes exactly as it was.
const BREAK_UNIT_DAYS = { days: 1, weeks: 7, months: 30 };
let breakUnit = "days";
function renderBreakForm() {
  const b = state.trainingBreak, active = !!(b && b.until >= todayKey());
  $("#breakActiveInfo").classList.toggle("hidden", !active);
  $("#breakForm").classList.toggle("hidden", active);
  if (active) $("#breakActiveInfo").querySelector("span").textContent = `On a break until ${fmtShort(b.until)}.`;
}
$$("#breakUnitChips button").forEach((btn) => btn.addEventListener("click", () => {
  breakUnit = btn.dataset.unit;
  $$("#breakUnitChips button").forEach((x) => x.classList.toggle("active", x === btn));
}));
$("#breakStartBtn").addEventListener("click", () => {
  const n = Math.max(1, parseInt($("#breakAmount").value, 10) || 1);
  const days = n * BREAK_UNIT_DAYS[breakUnit];
  state.trainingBreak = { from: todayKey(), until: addDays(todayKey(), days - 1) };
  save(); renderBreakForm(); renderScheduleWeek(); toast("Break started");
});
$("#breakEndNowBtn").addEventListener("click", () => {
  state.trainingBreak = null;
  save(); renderBreakForm(); renderScheduleWeek(); toast("Break ended");
});

// Deactivating (or deleting) a workout also clears it out of every day's
// list — otherwise it'd linger as an invisible assignment with no way to see
// or remove it once it's no longer offered as a choice.
function unassignWorkout(id) {
  for (const dk of DAY_KEYS) {
    const arr = state.trainingSchedule[dk], idx = arr.indexOf(id);
    if (idx >= 0) arr.splice(idx, 1);
  }
}
// Which workouts exist in the schedule at all — added one at a time via a
// searchable picker (scheduleWorkoutPicker) rather than shown as an
// always-visible toggle-everything chip grid, per user feedback that the
// old all-workouts list was hard to scan. Each scheduled workout gets its
// own row: day chips (recurring weekly, same data model as before) plus an
// optional reminder notification.
function renderScheduledWorkoutList() {
  const active = state.activeWorkoutIds.map(workoutById).filter(Boolean);
  const days = orderedDayKeys();
  $("#scheduledWorkoutList").innerHTML = active.length
    ? active.map((w) => {
        const notif = workoutNotif(w.id);
        return `<li class="sched-row" data-id="${w.id}">
          <div class="sched-row-head">
            <span class="row-label"><span class="ic" data-ic="${w.ic || "dumbbell"}"></span>${esc(w.name)}</span>
            <button class="fi-del" data-id="${w.id}"><span class="ic" data-ic="x"></span></button>
          </div>
          <div class="chips ws-days" data-id="${w.id}">
            ${days.map((dk) => `<button data-day="${dk}" class="${(state.trainingSchedule[dk] || []).includes(w.id) ? "active" : ""}">${DAY_LABELS[dk]}</button>`).join("")}
          </div>
          <div class="sched-notif-row">
            <label class="switch"><input type="checkbox" data-notif-toggle="${w.id}" ${notif.enabled ? "checked" : ""}><span class="knob"></span></label>
            <span class="muted">Remind me</span>
            <input type="time" data-notif-time="${w.id}" value="${notif.time}" ${notif.enabled ? "" : "disabled"}>
          </div>
        </li>`;
      }).join("")
    : `<li class="muted" style="border-top:none">No workouts scheduled yet — tap "Add workout" below.</li>`;
  renderIcons($("#scheduledWorkoutList"));
  $$("#scheduledWorkoutList .ws-days button").forEach((btn) => btn.addEventListener("click", () => {
    const id = btn.closest(".ws-days").dataset.id, dk = btn.dataset.day;
    const arr = state.trainingSchedule[dk] || (state.trainingSchedule[dk] = []);
    const idx = arr.indexOf(id);
    if (idx >= 0) arr.splice(idx, 1); else arr.push(id);
    btn.classList.toggle("active");
    save(); renderScheduleWeek(); rescheduleWorkoutNotif(id);
  }));
  $$("#scheduledWorkoutList .fi-del").forEach((btn) => btn.addEventListener("click", () => {
    const id = btn.dataset.id;
    state.activeWorkoutIds = state.activeWorkoutIds.filter((x) => x !== id);
    unassignWorkout(id);
    delete state.workoutNotifs[id];
    cancelWorkoutNotif(id);
    save(); renderScheduledWorkoutList(); renderScheduleWeek();
  }));
  $$("#scheduledWorkoutList [data-notif-toggle]").forEach((cb) => cb.addEventListener("change", () => {
    const id = cb.dataset.notifToggle;
    workoutNotif(id).enabled = cb.checked;
    save(); renderScheduledWorkoutList(); rescheduleWorkoutNotif(id);
  }));
  $$("#scheduledWorkoutList [data-notif-time]").forEach((inp) => inp.addEventListener("change", () => {
    const id = inp.dataset.notifTime;
    workoutNotif(id).time = inp.value;
    save(); rescheduleWorkoutNotif(id);
  }));
}
function renderScheduleWorkoutPicker() {
  const avail = allWorkouts().filter((w) => !state.activeWorkoutIds.includes(w.id));
  $("#scheduleWorkoutPickerList").innerHTML = avail.length
    ? avail.map((w) => `<button class="food-row" data-id="${w.id}"><span class="ic fr-ic" data-ic="${w.ic || "dumbbell"}"></span><div class="fr-main"><div class="fr-name">${esc(w.name)}</div></div></button>`).join("")
    : `<p class="food-empty">All your workouts are already scheduled.</p>`;
  renderIcons($("#scheduleWorkoutPickerList"));
  $$("#scheduleWorkoutPickerList .food-row").forEach((btn) => btn.addEventListener("click", () => {
    state.activeWorkoutIds.push(btn.dataset.id);
    save();
    $("#scheduleWorkoutPicker").classList.add("hidden");
    renderScheduledWorkoutList(); renderScheduleWeek();
  }));
}
$("#addScheduledWorkoutBtn").addEventListener("click", () => { renderScheduleWorkoutPicker(); $("#scheduleWorkoutPicker").classList.remove("hidden"); });
wireSheetClose("scheduleWorkoutPicker", "scheduleWorkoutPickerClose");
function renderWorkoutTemplateList() {
  $("#workoutTemplateSection").classList.toggle("hidden", !state.workoutTemplates.length);
  $("#workoutTemplateList").innerHTML = state.workoutTemplates.map((w) =>
    `<li data-id="${w.id}"><span class="row-label"><span class="ic" data-ic="${w.ic}"></span>${esc(w.name)}</span>
      <span style="display:flex;align-items:center">
        <button class="fi-share" data-share="${w.id}"><span class="ic" data-ic="share"></span></button>
        <button class="fi-del" data-id="${w.id}"><span class="ic" data-ic="x"></span></button>
      </span></li>`).join("");
  renderIcons($("#workoutTemplateList"));
  $$("#workoutTemplateList .fi-del").forEach((b) => b.addEventListener("click", () => {
    const id = b.dataset.id;
    state.workoutTemplates = state.workoutTemplates.filter((w) => w.id !== id);
    const i = state.activeWorkoutIds.indexOf(id);
    if (i >= 0) state.activeWorkoutIds.splice(i, 1);
    unassignWorkout(id);
    save(); renderWorkoutTemplateList(); renderScheduledWorkoutList(); renderScheduleWeek();
  }));
  $$("#workoutTemplateList .fi-share").forEach((b) => b.addEventListener("click", () => {
    const w = state.workoutTemplates.find((x) => x.id === b.dataset.share);
    if (w) shareItem(`fittrack-workout-${slugify(w.name)}.json`, { fittrackShare: "workout", version: 1, workout: { name: w.name, ic: w.ic, met: w.met } });
  }));
}
function openScheduleEdit() {
  renderScheduledWorkoutList(); renderWorkoutTemplateList(); renderBreakForm();
  $("#scheduleMonthSheet").classList.add("hidden");
  $("#dayEditSheet").classList.add("hidden");
  $("#scheduleEditSheet").classList.remove("hidden");
}
$("#scheduleEditBtn").addEventListener("click", openScheduleEdit);
wireSheetClose("scheduleEditSheet", "scheduleEditClose", () => { $("#scheduleEditSheet").classList.add("hidden"); renderScheduleWeek(); });

/* ---------- Progress ---------- */
// Flags a stall: weight barely moved over the last 2 weeks despite the user
// actually logging a real deficit most days — the kind of thing worth
// surfacing (water retention / under-logging / adapted expenditure) rather
// than the app just staying quiet while the scale sits still.
function detectPlateau() {
  if (!state.profile) return null;
  const days = 14;
  const slope = weightTrendPerDay();
  if (slope == null) return null;
  const change = slope * days;
  let loggedDays = 0, deficitSum = 0;
  for (let i = 0; i < days; i++) {
    const dk = addDays(todayKey(), -i), t = dayTotals(dk);
    if (t.items > 0) { loggedDays++; deficitSum += targetFor(dk) - t.kcal; }
  }
  if (loggedDays < 10) return null; // not enough logging this window to trust the deficit
  const avgDeficit = deficitSum / loggedDays;
  if (Math.abs(change) < 0.3 && avgDeficit > 150) return { days, change: r1(change), avgDeficit: r0(avgDeficit) };
  return null;
}
/* ---------- insights ----------
   Deterministic observations computed from the last 4 weeks of logs — no AI.
   Each row is a plain-English pattern; the Focus card picks the single
   highest-leverage thing to work on this week via a priority ladder. */
function fmtTimeOfDay(mins) {
  const d = new Date(); d.setHours(Math.floor(mins / 60), Math.round(mins % 60), 0, 0);
  return fmtTime(d.getTime());
}
const DOW_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function renderInsights() {
  const p = state.profile;
  const perDay = [];
  for (let i = 27; i >= 0; i--) {
    const dk = addDays(todayKey(), -i);
    const t = dayTotals(dk);
    if (t.items > 0) perDay.push({ dk, dow: fromKey(dk).getDay(), t, target: targetFor(dk), log: state.logs[dk] || {} });
  }
  const rows = [];
  const focusCandidates = []; // {prio, txt, why}
  let logged14 = 0; for (let i = 0; i < 14; i++) if (dayTotals(addDays(todayKey(), -i)).items > 0) logged14++;
  if (logged14 / 14 < 0.8) focusCandidates.push({ prio: 1, txt: "Log every day this week.", why: `Only ${logged14} of the last 14 days have any food logged — consistent logging is what makes every other number here trustworthy.` });

  if (perDay.length >= 7) {
    // Weekday pattern — which day runs hottest vs your target.
    const byDow = {};
    perDay.forEach((d) => { (byDow[d.dow] = byDow[d.dow] || []).push(d.t.kcal - d.target); });
    const dowAvgs = Object.entries(byDow).filter(([, v]) => v.length >= 2)
      .map(([dow, v]) => ({ dow: +dow, avg: v.reduce((a, b) => a + b, 0) / v.length }));
    if (dowAvgs.length >= 3) {
      const worst = [...dowAvgs].sort((a, b) => b.avg - a.avg)[0];
      const others = dowAvgs.filter((o) => o.dow !== worst.dow);
      const delta = worst.avg - others.reduce((a, b) => a + b.avg, 0) / others.length;
      if (delta > 150) {
        rows.push({ ic: "calendar", cls: "t-amber", txt: `${DOW_NAMES[worst.dow]}s run ~${r0(delta)} kcal higher than your other days.` });
        if (worst.avg > 200) focusCandidates.push({ prio: 3, txt: `Plan ${DOW_NAMES[worst.dow]} in advance.`, why: `${DOW_NAMES[worst.dow]}s average ${r0(worst.avg)} kcal over target — deciding meals ahead of time beats willpower in the moment.` });
      }
    }
    // Weekend vs weekday.
    const wkend = perDay.filter((d) => d.dow === 0 || d.dow === 6), wkday = perDay.filter((d) => d.dow >= 1 && d.dow <= 5);
    if (wkend.length >= 2 && wkday.length >= 4) {
      const avgVs = (arr) => arr.reduce((s, d) => s + d.t.kcal - d.target, 0) / arr.length;
      const we = avgVs(wkend), wd = avgVs(wkday);
      if (we - wd > 150) {
        rows.push({ ic: "sun", cls: "t-amber", txt: `Weekends run ~${r0(we - wd)} kcal higher than weekdays.` });
        if (we > 100 && wd <= 50) focusCandidates.push({ prio: 2, txt: "Hold your weekday routine through the weekend.", why: `Weekdays average on target but weekends average ${r0(we)} kcal over — that alone can erase most of a week's deficit.` });
      }
    }
    // Protein hit-rate.
    const hit = perDay.filter((d) => d.t.p >= p.proteinTarget).length;
    const hitPct = r0((hit / perDay.length) * 100);
    rows.push({ ic: "target", cls: hitPct >= 70 ? "t-green" : "t-amber", txt: `Protein target hit on ${hit} of ${perDay.length} logged days (${hitPct}%).` });
    if (hit / perDay.length < 0.5) focusCandidates.push({ prio: 4, txt: "Get protein to target most days.", why: `You've hit ${p.proteinTarget} g on only ${hitPct}% of logged days — protein is what protects muscle while the scale drops.` });
    // Eating window.
    const firsts = [], lasts = [];
    perDay.forEach((d) => {
      const times = dayMealTimes(d.dk).map((ts) => { const t = new Date(ts); return t.getHours() * 60 + t.getMinutes(); });
      if (times.length) { firsts.push(times[0]); lasts.push(times[times.length - 1]); }
    });
    if (firsts.length >= 5) {
      const avgF = firsts.reduce((a, b) => a + b, 0) / firsts.length, avgL = lasts.reduce((a, b) => a + b, 0) / lasts.length;
      rows.push({ ic: "timer", cls: "t-blue", txt: `Average eating window: ${fmtTimeOfDay(avgF)} – ${fmtTimeOfDay(avgL)} (~${r1((avgL - avgF) / 60)} h).` });
      const lateDays = lasts.filter((mins) => mins >= 21.5 * 60).length;
      if (lateDays / lasts.length > 0.35) focusCandidates.push({ prio: 5, txt: "Close the kitchen by 9 pm.", why: `${lateDays} of ${lasts.length} logged days ended with food after 9:30 pm — late eating is where most quiet overshoot happens.` });
    }
    // Consistency.
    const kcals = perDay.map((d) => d.t.kcal);
    const avgK = kcals.reduce((a, b) => a + b, 0) / kcals.length;
    const sd = Math.sqrt(kcals.reduce((s, v) => s + (v - avgK) ** 2, 0) / kcals.length);
    rows.push({ ic: "chart", cls: sd / avgK < 0.15 ? "t-green" : sd / avgK > 0.25 ? "t-amber" : "t-blue", txt: `Daily intake varies ±${r0(sd)} kcal around your ${r0(avgK)} kcal average.` });
    // Short sleep → intake (sleepH on a day = last night's sleep).
    const short = perDay.filter((d) => d.log.sleepH != null && d.log.sleepH < 6.5);
    const rested = perDay.filter((d) => d.log.sleepH != null && d.log.sleepH >= 6.5);
    if (short.length >= 3 && rested.length >= 3) {
      const diff = short.reduce((s, d) => s + d.t.kcal, 0) / short.length - rested.reduce((s, d) => s + d.t.kcal, 0) / rested.length;
      if (Math.abs(diff) > 120) rows.push({ ic: "moon", cls: diff > 0 ? "t-amber" : "t-green", txt: `After nights under 6.5 h sleep you average ${diff > 0 ? "+" : ""}${r0(diff)} kcal.` });
    }
  }
  // Focus card: highest-priority candidate, or a well-earned pat on the back.
  if (!focusCandidates.length && perDay.length >= 7) {
    const ts = targetStreak();
    focusCandidates.push({ prio: 9, txt: "Keep doing exactly this.", why: ts > 2 ? `${ts} days on target and no weak spots in the data — the boring weeks are the ones that work.` : "No single weak spot stands out in the last month — consistency is the whole game now." });
  }
  const focus = focusCandidates.sort((a, b) => a.prio - b.prio)[0];
  $("#focusCard").classList.toggle("hidden", !focus);
  if (focus) {
    $("#focusCard").innerHTML = `<div class="card-head"><h3><span class="ic t-green" data-ic="target"></span>Focus this week <button class="info-btn" data-info="insights"><span class="ic" data-ic="info"></span></button></h3></div>
      <p class="focus-main">${esc(focus.txt)}</p>
      <p class="muted">${esc(focus.why)}</p>`;
  }
  $("#insightsCard").classList.toggle("hidden", !rows.length);
  if (rows.length) {
    $("#insightsCard").innerHTML = `<div class="card-head"><h3><span class="ic t-blue" data-ic="sparkle"></span>Patterns — last 4 weeks <button class="info-btn" data-info="insights"><span class="ic" data-ic="info"></span></button></h3></div>
      <ul class="insight-list">${rows.map((r) => `<li><span class="ic ${r.cls}" data-ic="${r.ic}"></span><span>${esc(r.txt)}</span></li>`).join("")}</ul>`;
  }
  $("#insightsLabel").classList.toggle("hidden", !focus && !rows.length);
  renderIcons($("#focusCard")); renderIcons($("#insightsCard"));
}
/* ---------- weekly challenge ----------
   One concrete, countable goal per week, auto-picked from the same signals
   as the Focus card — chosen once when the week starts (stored in
   state.challenge) so it doesn't flip-flop mid-week as data shifts. */
const CHALLENGES = {
  log: { label: "Log your food every day", target: 7, test: (dk) => loggedDay(dk) },
  weekend: { label: "Stay on target through the weekend", target: 2, test: (dk) => isWeekend(dk) && dayComplete(dk) },
  protein: { label: "Hit your protein target on 5 days", target: 5, test: (dk) => loggedDay(dk) && dayTotals(dk).p >= state.profile.proteinTarget },
  latenight: { label: "Kitchen closed by 9:30 pm on 5 days", target: 5, test: (dk) => { if (!loggedDay(dk)) return false; const t = dayMealTimes(dk); const last = new Date(t[t.length - 1]); return last.getHours() * 60 + last.getMinutes() < 21.5 * 60; } },
  target: { label: "Stay under your calorie target on 5 days", target: 5, test: (dk) => dayComplete(dk) },
};
function pickChallengeId() {
  let logged14 = 0; for (let i = 0; i < 14; i++) if (loggedDay(addDays(todayKey(), -i))) logged14++;
  if (logged14 / 14 < 0.8) return "log";
  const perDay = [];
  for (let i = 27; i >= 0; i--) {
    const dk = addDays(todayKey(), -i), t = dayTotals(dk);
    if (t.items > 0) perDay.push({ dk, dow: fromKey(dk).getDay(), t, target: targetFor(dk) });
  }
  if (perDay.length >= 7) {
    const wkend = perDay.filter((d) => d.dow === 0 || d.dow === 6), wkday = perDay.filter((d) => d.dow >= 1 && d.dow <= 5);
    if (wkend.length >= 2 && wkday.length >= 4) {
      const avgVs = (arr) => arr.reduce((s, d) => s + d.t.kcal - d.target, 0) / arr.length;
      if (avgVs(wkend) > 100 && avgVs(wkday) <= 50) return "weekend";
    }
    if (perDay.filter((d) => d.t.p >= state.profile.proteinTarget).length / perDay.length < 0.5) return "protein";
    const lates = perDay.filter((d) => { const t = dayMealTimes(d.dk); if (!t.length) return false; const last = new Date(t[t.length - 1]); return last.getHours() * 60 + last.getMinutes() >= 21.5 * 60; });
    if (lates.length / perDay.length > 0.35) return "latenight";
  }
  return "target";
}
function currentChallenge() {
  const wk = weekStartKey(todayKey());
  if (!state.challenge || state.challenge.weekKey !== wk || !CHALLENGES[state.challenge.id]) {
    state.challenge = { weekKey: wk, id: pickChallengeId() };
    save();
  }
  const c = CHALLENGES[state.challenge.id];
  let n = 0, guard = 0;
  for (let dk = wk; dk <= todayKey() && guard++ < 8; dk = addDays(dk, 1)) if (c.test(dk)) n++;
  return { ...c, id: state.challenge.id, progress: Math.min(n, c.target) };
}
function renderChallenge() {
  const el = $("#challengeCard"); if (!el || !state.profile) return;
  const c = currentChallenge();
  const done = c.progress >= c.target;
  el.innerHTML = `<div class="challenge-row">
      <span class="ic ${done ? "t-green" : "t-amber"}" data-ic="${done ? "check" : "target"}"></span>
      <div class="challenge-main">
        <div class="challenge-label">${esc(c.label)}${done ? " — done!" : ""}</div>
        <div class="mini-bar"><div class="mini-bar-fill" style="width:${(c.progress / c.target) * 100}%;background:var(--accent)"></div></div>
      </div>
      <span class="challenge-count">${c.progress}/${c.target}</span>
    </div>
    <p class="muted challenge-sub">this week's challenge <button class="info-btn" data-info="challenge"><span class="ic" data-ic="info"></span></button></p>`;
  renderIcons(el);
}

/* ---------- personal records ----------
   All-time bests computed from the raw logs — data-driven bragging rights,
   no badges or mascots. Only renders once there's something to brag about. */
function renderRecords() {
  const el = $("#recordsCard"); if (!el) return;
  const start = firstDataKey(), today = todayKey();
  let curOn = 0, maxOn = 0, curLog = 0, maxLog = 0, anyLogged = false;
  const weekOn = {}, weekBurn = {};
  let prevLastTs = null, maxFast = null;
  let guard = 0;
  for (let dk = start; dk <= today && guard++ < 3700; dk = addDays(dk, 1)) {
    const logged = loggedDay(dk), on = dayComplete(dk);
    anyLogged = anyLogged || logged;
    curLog = logged ? curLog + 1 : 0; if (curLog > maxLog) maxLog = curLog;
    curOn = on ? curOn + 1 : 0; if (curOn > maxOn) maxOn = curOn;
    const ws = weekStartKey(dk);
    if (on) weekOn[ws] = (weekOn[ws] || 0) + 1;
    const l = state.logs[dk];
    if (l && l.walks && l.walks.length) weekBurn[ws] = (weekBurn[ws] || 0) + l.walks.reduce((s, w) => s + (w.kcal || 0), 0);
    const times = dayMealTimes(dk);
    if (times.length) {
      if (prevLastTs != null) {
        const mins = (times[0] - prevLastTs) / 60000;
        if (mins > 0 && (!maxFast || mins > maxFast.mins)) maxFast = { mins, d: dk };
      }
      prevLastTs = times[times.length - 1];
    } else prevLastTs = null;
  }
  if (!anyLogged) { el.classList.add("hidden"); return; }
  const bestWeek = Object.entries(weekOn).sort((a, b) => b[1] - a[1])[0];
  const bestBurn = Object.entries(weekBurn).sort((a, b) => b[1] - a[1])[0];
  // Biggest 7-day trend drop — two-pointer walk over the moving average.
  const ma = movingAvg(state.weights);
  let bestDrop = null, j = 0;
  for (let i = 0; i < ma.length; i++) {
    const cutoff = addDays(ma[i].d, -7);
    while (j + 1 <= i && ma[j + 1].d <= cutoff) j++;
    if (ma[j].d <= cutoff) {
      const drop = ma[i].v - ma[j].v;
      if (bestDrop == null || drop < bestDrop.v) bestDrop = { v: drop, d: ma[i].d };
    }
  }
  const box = (v, k, sub) => `<div class="stat-box"><div class="v">${v}</div><div class="k">${k}${sub ? `<br><span class="rec-sub">${sub}</span>` : ""}</div></div>`;
  el.classList.remove("hidden");
  el.innerHTML = `<div class="card-head"><h3><span class="ic t-amber" data-ic="flame"></span>Records <button class="info-btn" data-info="records"><span class="ic" data-ic="info"></span></button></h3><span class="muted">all-time</span></div>
    <div class="stat-grid">
      ${box(maxOn, `day${maxOn === 1 ? "" : "s"} on target in a row`)}
      ${box(maxLog, `day${maxLog === 1 ? "" : "s"} logged in a row`)}
      ${bestWeek ? box(`${Math.min(bestWeek[1], 7)}/7`, "best week on target", `wk of ${fmtShort(bestWeek[0])}`) : ""}
      ${bestDrop && bestDrop.v < 0 ? box(`${r1(bestDrop.v)} kg`, "best 7-day trend drop", fmtShort(bestDrop.d)) : ""}
      ${maxFast ? box(fmtHm(Math.round(maxFast.mins)), "longest overnight fast", fmtShort(maxFast.d)) : ""}
      ${bestBurn ? box(r0(bestBurn[1]).toLocaleString(), "most active week (kcal)", `wk of ${fmtShort(bestBurn[0])}`) : ""}
    </div>`;
  renderIcons(el);
}

/* ---------- monthly recap ---------- */
let recapMonth = null; // "YYYY-MM"
function recapStats(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const start = `${monthKey}-01`;
  const endFull = `${monthKey}-${String(daysInMonth).padStart(2, "0")}`;
  const end = endFull > todayKey() ? todayKey() : endFull;
  let logged = 0, on = 0, kcalSum = 0, defSum = 0, sessions = 0, burn = 0, elapsed = 0;
  for (let dk = start, g = 0; dk <= end && g++ < 32; dk = addDays(dk, 1)) {
    elapsed++;
    const t = dayTotals(dk);
    if (t.items > 0) { logged++; kcalSum += t.kcal; defSum += targetFor(dk) - t.kcal; if (dayComplete(dk)) on++; }
    const l = state.logs[dk];
    if (l && l.walks && l.walks.length) { sessions += l.walks.length; burn += l.walks.reduce((s, w) => s + (w.kcal || 0), 0); }
  }
  const ma = movingAvg(state.weights).filter((p) => p.d >= start && p.d <= end);
  const wDelta = ma.length >= 2 ? r1(ma[ma.length - 1].v - ma[0].v) : null;
  return {
    monthKey, elapsed, logged, on, sessions, burn, wDelta,
    label: new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" }),
    avgDef: logged ? r0(defSum / logged) : null,
    partial: endFull > todayKey(),
  };
}
function renderRecap() {
  const el = $("#recapCard"); if (!el) return;
  const curMonth = todayKey().slice(0, 7);
  if (!recapMonth || recapMonth > curMonth) recapMonth = curMonth;
  const s = recapStats(recapMonth);
  el.innerHTML = `<div class="card-head">
      <h3><span class="ic t-purple" data-ic="calendar"></span>Monthly recap <button class="info-btn" data-info="recap"><span class="ic" data-ic="info"></span></button></h3>
      <span class="hm-nav"><button class="day-nav" id="recapPrev"><span class="ic" data-ic="chevL"></span></button><span class="hm-month">${s.label}</span><button class="day-nav" id="recapNext"><span class="ic" data-ic="chevR"></span></button></span>
    </div>
    ${s.partial ? `<p class="muted" style="margin-bottom:10px">Month in progress — ${s.elapsed} day${s.elapsed === 1 ? "" : "s"} so far.</p>` : ""}
    <div class="stat-grid">
      <div class="stat-box"><div class="v">${s.wDelta != null ? (s.wDelta > 0 ? "+" : "") + s.wDelta + " kg" : "—"}</div><div class="k">weight trend</div></div>
      <div class="stat-box"><div class="v">${s.logged}/${s.elapsed}</div><div class="k">days logged</div></div>
      <div class="stat-box"><div class="v">${s.on}</div><div class="k">days on target</div></div>
      <div class="stat-box"><div class="v">${s.avgDef != null ? Math.abs(s.avgDef) : "—"}</div><div class="k">avg ${s.avgDef != null && s.avgDef < 0 ? "surplus" : "deficit"}</div></div>
      <div class="stat-box"><div class="v">${s.sessions}</div><div class="k">workouts</div></div>
      <div class="stat-box"><div class="v">${r0(s.burn).toLocaleString()}</div><div class="k">kcal burned</div></div>
    </div>
    <button class="btn ghost full" id="recapShareBtn" style="margin-top:12px"><span class="ic" data-ic="share"></span> Share as image</button>`;
  renderIcons(el);
  $("#recapPrev").disabled = recapMonth <= firstLoggedMonthKey();
  $("#recapNext").disabled = recapMonth >= curMonth;
  const shift = (dir) => { const [y, m] = recapMonth.split("-").map(Number); const d = new Date(y, m - 1 + dir, 1); recapMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; renderRecap(); };
  $("#recapPrev").addEventListener("click", () => shift(-1));
  $("#recapNext").addEventListener("click", () => shift(1));
  $("#recapShareBtn").addEventListener("click", shareRecapImage);
}
// Renders the recap onto a canvas and hands the PNG to the share sheet —
// a clean dark card, not a screenshot.
async function shareRecapImage() {
  const s = recapStats(recapMonth || todayKey().slice(0, 7));
  const W = 680, H = 860, cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  const font = (w, px) => `${w} ${px}px Hanken, -apple-system, sans-serif`;
  ctx.fillStyle = "#08080a"; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "center";
  ctx.fillStyle = "#08C343"; ctx.font = font(800, 30);
  ctx.fillText("FitTrack", W / 2, 78);
  ctx.fillStyle = "#8a8f98"; ctx.font = font(600, 30);
  ctx.fillText(s.label + (s.partial ? " (so far)" : ""), W / 2, 130);
  const delta = s.wDelta != null ? (s.wDelta > 0 ? "+" : "") + s.wDelta + " kg" : "—";
  ctx.fillStyle = s.wDelta != null && s.wDelta > 0 ? "#CE5400" : "#08C343"; ctx.font = font(800, 92);
  ctx.fillText(delta, W / 2, 290);
  ctx.fillStyle = "#8a8f98"; ctx.font = font(600, 26);
  ctx.fillText("weight trend", W / 2, 336);
  const rows = [
    [`${s.logged}/${s.elapsed}`, "days logged", `${s.on}`, "days on target"],
    [s.avgDef != null ? String(Math.abs(s.avgDef)) : "—", `avg ${s.avgDef != null && s.avgDef < 0 ? "surplus" : "deficit"} (kcal)`, `${s.sessions}`, "workouts"],
  ];
  let y = 470;
  for (const [v1, k1, v2, k2] of rows) {
    ctx.fillStyle = "#f2f3f5"; ctx.font = font(800, 54);
    ctx.fillText(v1, W * 0.28, y); ctx.fillText(v2, W * 0.72, y);
    ctx.fillStyle = "#8a8f98"; ctx.font = font(600, 24);
    ctx.fillText(k1, W * 0.28, y + 40); ctx.fillText(k2, W * 0.72, y + 40);
    y += 150;
  }
  ctx.fillStyle = "#f2f3f5"; ctx.font = font(800, 54);
  ctx.fillText(r0(s.burn).toLocaleString(), W / 2, y);
  ctx.fillStyle = "#8a8f98"; ctx.font = font(600, 24);
  ctx.fillText("kcal burned in workouts", W / 2, y + 40);
  await sharePngFile(`fittrack-${s.monthKey}.png`, cv.toDataURL("image/png"), "FitTrack Monthly Recap");
}
async function sharePngFile(filename, dataUrl, label) {
  if (isNativeApp() && window.capacitorFilesystem && window.capacitorShare) {
    try {
      const { Filesystem, Directory } = window.capacitorFilesystem;
      const { Share } = window.capacitorShare;
      const { uri } = await Filesystem.writeFile({ path: filename, data: dataUrl.split(",")[1], directory: Directory.Cache });
      await Share.share({ title: label, url: uri });
    } catch (e) { toast("Share failed: " + (e.message || "error")); }
    return;
  }
  const a = document.createElement("a"); a.href = dataUrl; a.download = filename; a.click();
}

/* ---------- adherence heatmap ---------- */
let heatmapMonth = null; // "YYYY-MM", defaults to the current month
function renderHeatmap() {
  const nowK = todayKey(), curMonth = nowK.slice(0, 7);
  if (!heatmapMonth || heatmapMonth > curMonth) heatmapMonth = curMonth;
  const [y, m] = heatmapMonth.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const monStart = (state.settings.weekStart || "mon") === "mon";
  const lead = monStart ? (new Date(y, m - 1, 1).getDay() + 6) % 7 : new Date(y, m - 1, 1).getDay();
  const monthLabel = new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  let onCount = 0, loggedCount = 0, elapsed = 0;
  let cells = orderedDayKeys().map((k) => `<span class="hm-dow">${DAY_LABELS[k].slice(0, 1)}</span>`).join("");
  cells += `<span class="hm-cell empty"></span>`.repeat(lead);
  for (let d = 1; d <= daysInMonth; d++) {
    const dk = `${heatmapMonth}-${String(d).padStart(2, "0")}`;
    const future = dk > nowK;
    let cls = "off";
    if (!future) {
      elapsed++;
      if (dayComplete(dk)) { cls = "on"; onCount++; loggedCount++; }
      else if (loggedDay(dk)) { cls = "over"; loggedCount++; }
    } else cls = "future";
    cells += `<button class="hm-cell ${cls}${dk === nowK ? " today" : ""}" data-dk="${dk}"${future ? " disabled" : ""}>${d}</button>`;
  }
  $("#heatmapCard").innerHTML = `<div class="card-head">
      <h3><span class="ic t-green" data-ic="calendar"></span>Adherence <button class="info-btn" data-info="heatmap"><span class="ic" data-ic="info"></span></button></h3>
      <span class="hm-nav"><button class="day-nav" id="hmPrev"><span class="ic" data-ic="chevL"></span></button><span class="hm-month">${monthLabel}</span><button class="day-nav" id="hmNext"><span class="ic" data-ic="chevR"></span></button></span>
    </div>
    <div class="hm-grid">${cells}</div>
    <p class="legend" style="margin-top:10px"><span class="lg hm-lg-on">on target</span><span class="lg hm-lg-over">over</span><span class="lg hm-lg-off">not logged</span></p>
    <p class="muted" style="margin-top:6px">${loggedCount ? `${onCount} of ${elapsed} day${elapsed === 1 ? "" : "s"} on target · tap a day to open it` : "Days you log will light up here."}</p>`;
  renderIcons($("#heatmapCard"));
  $("#hmPrev").disabled = heatmapMonth <= firstLoggedMonthKey();
  $("#hmNext").disabled = heatmapMonth >= curMonth;
  const shiftMonth = (dir) => { const d = new Date(y, m - 1 + dir, 1); heatmapMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; renderHeatmap(); };
  $("#hmPrev").addEventListener("click", () => shiftMonth(-1));
  $("#hmNext").addEventListener("click", () => shiftMonth(1));
  $$("#heatmapCard .hm-cell[data-dk]:not([disabled])").forEach((b) => b.addEventListener("click", () => {
    viewDate = b.dataset.dk; haptic("light");
    if (currentView === "today") renderToday(); else switchView("today");
  }));
}
function renderPlateauCard() {
  const el = $("#plateauCard");
  const p = detectPlateau();
  if (!p) { el.classList.add("hidden"); return; }
  el.classList.remove("hidden");
  el.innerHTML = `<div class="card-head"><h3><span class="ic t-amber" data-ic="target"></span>Possible plateau</h3></div>
    <p class="muted">Weight has moved only ${Math.abs(p.change)} kg over the last ${p.days} days despite averaging a ${p.avgDeficit} kcal/day deficit. Common causes: water retention, under-logging, or your expenditure has adapted lower — worth double-checking logging accuracy, or a short maintenance break before continuing.</p>`;
  renderIcons(el);
}
function renderProgress() { renderGoalCards(); renderWeightChart(); renderWaistChart(); renderCalChart(); renderWeekCard(); renderPlateauCard(); renderInsights(); renderHeatmap(); renderRecords(); renderRecap(); }

// A goal reached at ANY point stays reached (stamped with achievedOn),
// even if the goal's end date hasn't arrived or weight later fluctuates up.
function checkGoals() {
  const cw = currentWeight();
  let hit = null;
  for (const g of state.goals) {
    if (!g.achievedOn && cw <= g.targetKg) { g.achievedOn = todayKey(); hit = g; }
  }
  if (hit) {
    // Queue the celebration so it survives an app restart and shows even if the
    // goal was crossed by a background/late weigh-in (only the newest hit wins).
    state.pendingCelebration = hit.id; save(); haptic();
    maybeShowCelebration();
  }
}
// Stats behind a reached goal, measured from the whole journey's start weight.
function goalAchievement(g) {
  const p = state.profile;
  const startKey = g.created || (p && p.startDate) || g.achievedOn;
  const days = Math.max(1, daysBetween(startKey, g.achievedOn));
  const lost = r1(p.startWeightKg - g.targetKg);
  const perWeek = r1((lost / days) * 7);
  return { days, lost, perWeek };
}
function maybeShowCelebration() {
  const id = state.pendingCelebration;
  if (!id) return;
  const g = state.goals.find((x) => x.id === id && x.achievedOn);
  if (!g) { state.pendingCelebration = null; save(); return; }
  const a = goalAchievement(g);
  $("#celebrateName").textContent = g.label;
  $("#celebrateTarget").textContent = `${r1(g.targetKg)} kg reached on ${fmtShort(g.achievedOn)}`;
  $("#celebrateStats").innerHTML = `
    <div class="stat-box"><div class="v">${a.lost > 0 ? "−" : ""}${Math.abs(a.lost)} kg</div><div class="k">lost since start</div></div>
    <div class="stat-box"><div class="v">${a.days}</div><div class="k">days to get here</div></div>
    <div class="stat-box"><div class="v">${a.perWeek > 0 ? "−" : ""}${Math.abs(a.perWeek)} kg</div><div class="k">avg per week</div></div>
    <div class="stat-box"><div class="v">${state.goals.filter((x) => x.achievedOn).length}</div><div class="k">goals reached</div></div>`;
  renderIcons($("#goalCelebrateSheet"));
  $("#goalCelebrateSheet").classList.remove("hidden");
}
function dismissCelebration() {
  state.pendingCelebration = null; save();
  $("#goalCelebrateSheet").classList.add("hidden");
}
wireSheetClose("goalCelebrateSheet", "goalCelebrateClose", dismissCelebration);
$("#celebrateKeepBtn").addEventListener("click", dismissCelebration);
$("#celebrateShareBtn").addEventListener("click", async () => {
  const g = state.goals.find((x) => x.id === state.pendingCelebration && x.achievedOn);
  if (!g) return;
  const a = goalAchievement(g);
  const W = 680, H = 820, cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  const font = (w, px) => `${w} ${px}px Hanken, -apple-system, sans-serif`;
  ctx.fillStyle = "#08080a"; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "center";
  ctx.fillStyle = "#08C343"; ctx.font = font(800, 30);
  ctx.fillText("FitTrack", W / 2, 76);
  ctx.font = font(800, 120); ctx.fillText("✓", W / 2, 230);
  ctx.fillStyle = "#f2f3f5"; ctx.font = font(800, 46);
  ctx.fillText("Goal reached", W / 2, 310);
  ctx.fillStyle = "#8a8f98"; ctx.font = font(600, 30);
  ctx.fillText(g.label + " · " + r1(g.targetKg) + " kg", W / 2, 360);
  const rows = [[`${a.lost > 0 ? "−" : ""}${Math.abs(a.lost)} kg`, "lost since start", `${a.days}`, "days"], [`${a.perWeek > 0 ? "−" : ""}${Math.abs(a.perWeek)} kg`, "per week", `${state.goals.filter((x) => x.achievedOn).length}`, "goals reached"]];
  let y = 470;
  for (const [v1, k1, v2, k2] of rows) {
    ctx.fillStyle = "#f2f3f5"; ctx.font = font(800, 54);
    ctx.fillText(v1, W * 0.28, y); ctx.fillText(v2, W * 0.72, y);
    ctx.fillStyle = "#8a8f98"; ctx.font = font(600, 24);
    ctx.fillText(k1, W * 0.28, y + 40); ctx.fillText(k2, W * 0.72, y + 40);
    y += 150;
  }
  await sharePngFile(`fittrack-goal-${g.id}.png`, cv.toDataURL("image/png"), "FitTrack — Goal reached");
});
function goalCard(g) {
  const p = state.profile, start = p.startWeightKg, cw = currentWeight(), tgt = g.targetKg, date = g.date;
  if (g.achievedOn) {
    return `<div class="goal-card">
      <div class="goal-top"><span class="goal-name"><span class="ic ge" data-ic="check"></span>${esc(g.label)}</span><span class="goal-eta">reached ${fmtShort(g.achievedOn)}</span></div>
      <div class="goal-nums"><span class="goal-cur">${r1(tgt)}</span><span class="goal-tgt">kg — done</span></div>
      <div class="goal-bar"><div class="goal-bar-fill" style="width:100%"></div></div>
      <div class="goal-foot"><span class="muted">target was ${fmtShort(date)}</span><span class="goal-pace"><span class="pace-dot g"></span>Achieved</span></div>
    </div>`;
  }
  const lost = start - cw, need = start - tgt;
  const pct = need > 0 ? clamp(lost / need, 0, 1) : (cw <= tgt ? 1 : 0);
  const daysLeft = Math.max(0, daysBetween(todayKey(), date));
  const trend = weightTrendPerDay();
  // At the current weight-trend rate, when would this goal be reached?
  const daysToHit = (trend !== null && trend < 0 && cw > tgt) ? Math.ceil((cw - tgt) / -trend) : null;
  const projDate = daysToHit != null ? addDays(todayKey(), Math.min(daysToHit, 3650)) : null;
  // Time bar: how much of the goal window has elapsed (fill = remaining
  // time, blue with 2+ weeks left, red inside the final 2 weeks) — same
  // elapsed/total-window fraction used just below to judge ahead/behind.
  const windowDays = Math.max(1, daysBetween(g.created || p.startDate, date));
  const elapsedFrac = clamp(daysBetween(g.created || p.startDate, todayKey()) / windowDays, 0, 1);
  const nearDeadline = daysLeft <= 14;
  // Dot indicator + projected weight/date, but no "Behind schedule"/"Ahead
  // of schedule"/"On track" wording. Red/green purely from the trend
  // projection: if you'd reach the target LATER than its date at your
  // current rate, red; otherwise (on time, ahead, or already there) green.
  // No dot at all until there's enough weight history to project a trend.
  let dot = "", pace = "";
  if (cw <= tgt) { dot = "g"; }
  else if (trend !== null) {
    if (trend >= 0) { dot = "r"; pace = "not trending down"; }
    else if (projDate) { dot = projDate > date ? "r" : "g"; pace = `proj ${r1(cw + trend * daysLeft)}kg · ~${fmtShort(projDate)}`; }
  }
  return `<div class="goal-card">
    <div class="goal-top"><span class="goal-name"><span class="ic ge" data-ic="target"></span>${esc(g.label)}</span><span class="goal-eta">by ${fmtShort(date)}</span></div>
    <div class="goal-nums"><span class="goal-cur">${r1(cw)}</span><span class="goal-arrow">→</span><span class="goal-tgt">${r1(tgt)} kg</span></div>
    <div class="goal-bar"><div class="goal-bar-fill" style="width:${pct * 100}%"></div><span class="goal-bar-pct">${r0(pct * 100)}%</span></div>
    <div class="goal-time-bar"><div class="goal-time-fill ${nearDeadline ? "near-deadline" : ""}" style="width:${(1 - elapsedFrac) * 100}%"><span class="goal-time-label ${nearDeadline ? "near-deadline" : ""}">${fmtDuration(daysLeft)} left</span></div></div>
    <div class="goal-foot"><span class="muted">${r1(Math.max(0, lost))} of ${r1(Math.max(0, need))} kg lost (${r1(Math.max(0, need - lost))} kg left)</span>${dot ? `<span class="goal-pace"><span class="pace-dot ${dot}"></span>${pace}</span>` : ""}</div>
  </div>`;
}
let goalsExpanded = false;
function renderGoalCards() {
  const active = state.goals.filter((g) => !g.achievedOn).sort((a, b) => (a.date < b.date ? -1 : 1));
  const achieved = state.goals.filter((g) => g.achievedOn).sort((a, b) => (b.achievedOn < a.achievedOn ? -1 : 1));
  const shown = goalsExpanded ? active : active.slice(0, 2);
  $("#goalCards").innerHTML = active.length
    ? shown.map((g) => goalCard(g)).join("") + (active.length > 2
        ? `<button class="btn ghost full" id="goalsExpandBtn">${goalsExpanded ? "Show less" : `Show all ${active.length} goals`}</button>`
        : "")
    : (achieved.length ? "" : `<div class="card"><p class="muted">Add a goal in Settings to track progress here.</p></div>`);
  renderIcons($("#goalCards"));
  const expandBtn = $("#goalsExpandBtn");
  if (expandBtn) expandBtn.addEventListener("click", () => { goalsExpanded = !goalsExpanded; renderGoalCards(); });

  $("#achievedLabel").classList.toggle("hidden", !achieved.length);
  $("#achievedGoalCards").innerHTML = achieved.map((g) => goalCard(g)).join("");
  renderIcons($("#achievedGoalCards"));
}

// "Nice" y-axis tick values (multiples of 1/2/2.5/5 × 10^n) strictly inside
// [min, max] — shared by every chart builder so gridlines read consistently.
function niceTicks(min, max, count = 4) {
  const span = max - min;
  if (!(span > 0)) return [];
  const step0 = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const ticks = [];
  for (let t = Math.ceil(min / step) * step; t <= max + 1e-9; t += step) ticks.push(Math.round(t * 100) / 100);
  return ticks;
}
const axisVal = (v) => { const r = r1(v); return r % 1 !== 0 ? r : Math.abs(r) >= 10000 ? r1(r / 1000) + "k" : r0(r); };
// Dashed horizontal gridlines + left-side value labels for a given Y scale.
function gridSVG(ticks, Y, L, W, R) {
  return ticks.map((t) => `<line x1="${L}" y1="${Y(t).toFixed(1)}" x2="${W - R}" y2="${Y(t).toFixed(1)}" stroke="var(--border)" stroke-dasharray="3 5" opacity=".6"/><text x="${L - 4}" y="${(Y(t) + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="var(--muted)">${axisVal(t)}</text>`).join("");
}
function lineChart({ entries, ma, goals, unit, projDays, rawLine, color, goalColor, goalLabel, tooltips = true, dateLabels = "ends" }) {
  const line = color || "var(--accent)";
  // Angled per-day labels ("all" mode) need a bit more room at the bottom.
  const W = 340, H = 170, L = 34, R = 8, T = 12, B = dateLabels === "all" ? 30 : 22;
  if (entries.length < 2) return `<div class="food-empty">Log at least 2 entries to see the chart.</div>`;
  const x0 = entries[0].d;
  // Fractional day position so several weigh-ins on the same day fan out by
  // time-of-day instead of stacking on one x — this is what surfaces AM/PM swing.
  const frac = (e) => e.ts ? (new Date(e.ts).getHours() * 60 + new Date(e.ts).getMinutes()) / 1440 : 0;
  const xNum = (e) => daysBetween(x0, e.d) + frac(e);
  let xMax = xNum(entries[entries.length - 1]), proj = null;
  const trend = projDays && ma.length >= 3 ? weightTrendPerDay() : null;
  if (trend != null && projDays > 0) {
    const last = ma[ma.length - 1];
    proj = { x1: daysBetween(x0, last.d), v1: last.v, x2: daysBetween(x0, last.d) + projDays, v2: last.v + trend * projDays };
    xMax = Math.max(xMax, proj.x2);
  }
  xMax = Math.max(xMax, 1);
  const gls = goals || [];
  let vals = entries.map((e) => e.kg).concat(ma.map((m) => m.v)).concat(gls.map((g) => g.v));
  if (proj) vals.push(proj.v2);
  let vMin = Math.min(...vals), vMax = Math.max(...vals);
  const pad = Math.max(0.5, (vMax - vMin) * 0.15); vMin -= pad; vMax += pad;
  const X = (d) => L + (daysBetween(x0, d) / xMax) * (W - L - R);
  const Xn = (n) => L + (n / xMax) * (W - L - R);
  const Y = (v) => T + (1 - (v - vMin) / (vMax - vMin)) * (H - T - B);
  const dots = entries.map((e) =>
    `<circle${tooltips ? ` data-tip="${fmtShort(e.d)}${e.ts ? " " + fmtTime(e.ts) : ""} · ${r1(e.kg)} ${unit}${e.note ? " · “" + esc(String(e.note).slice(0, 60)) + "”" : ""}"` : ""} cx="${Xn(xNum(e)).toFixed(1)}" cy="${Y(e.kg).toFixed(1)}" r="2.5" fill="var(--muted2)" stroke="transparent" stroke-width="${tooltips ? 14 : 0}"/>`).join("");
  // Light "scale weight" line joining every raw reading, under the smooth trend.
  const rawPath = rawLine ? `<path d="${entries.map((e, i) => `${i ? "L" : "M"}${Xn(xNum(e)).toFixed(1)},${Y(e.kg).toFixed(1)}`).join("")}" fill="none" stroke="var(--muted2)" stroke-width="1.2" opacity=".5" stroke-linejoin="round"/>` : "";
  const maPath = ma.map((m, i) => `${i ? "L" : "M"}${X(m.d).toFixed(1)},${Y(m.v).toFixed(1)}`).join("");
  const goalLines = gls.map((g) => {
    const color = g.achieved ? "var(--accent)" : (goalColor || "var(--amber)");
    return `<line x1="${L}" y1="${Y(g.v).toFixed(1)}" x2="${W - R}" y2="${Y(g.v).toFixed(1)}" stroke="${color}" stroke-width="1.5" stroke-dasharray="5 4" opacity="${g.achieved ? ".55" : ".8"}"/><text x="${W - R}" y="${(Y(g.v) - 4).toFixed(1)}" text-anchor="end" font-size="9" fill="${color}">${g.achieved ? "✓ " : (goalLabel ? goalLabel + " " : "")}${r1(g.v)} ${unit}</text>`;
  }).join("");
  const projLine = proj ? `<line x1="${Xn(proj.x1).toFixed(1)}" y1="${Y(proj.v1).toFixed(1)}" x2="${Xn(proj.x2).toFixed(1)}" y2="${Y(proj.v2).toFixed(1)}" stroke="${line}" stroke-width="1.5" stroke-dasharray="2 4" opacity=".7"/>` : "";
  const first = entries[0], last = entries[entries.length - 1];
  // "all" labels every date (only sensible for a short, few-day window like
  // the compact 7-day card); otherwise the two endpoints plus a couple of
  // evenly spaced interior dates so long ranges aren't a guessing game.
  let xLabels;
  if (dateLabels === "all") {
    xLabels = [...new Set(entries.map((e) => e.d))].map((dk) => {
      const lx = X(dk).toFixed(1), ly = (H - B + 10).toFixed(1);
      return `<text x="${lx}" y="${ly}" font-size="8" fill="var(--muted)" text-anchor="end" transform="rotate(-40 ${lx} ${ly})">${fmtShort(dk)}</text>`;
    }).join("");
  } else {
    xLabels = `<text x="${L}" y="${H - 7}" font-size="9" fill="var(--muted)">${fmtShort(first.d)}</text><text x="${W - R}" y="${H - 7}" text-anchor="end" font-size="9" fill="var(--muted)">${proj ? fmtShort(addDays(x0, Math.round(xMax))) : fmtShort(last.d)}</text>`;
    if (xMax >= 10) {
      for (const f of [1 / 3, 2 / 3]) {
        const dOff = Math.round(xMax * f);
        xLabels += `<line x1="${Xn(dOff).toFixed(1)}" y1="${H - B}" x2="${Xn(dOff).toFixed(1)}" y2="${H - B + 3}" stroke="var(--border)"/><text x="${Xn(dOff).toFixed(1)}" y="${H - 7}" text-anchor="middle" font-size="9" fill="var(--muted)">${fmtShort(addDays(x0, dOff))}</text>`;
      }
    }
  }
  // The most recent trend point gets an emphasized dot — "you are here".
  const lastMa = ma.length ? ma[ma.length - 1] : null;
  const lastDot = lastMa ? `<circle cx="${X(lastMa.d).toFixed(1)}" cy="${Y(lastMa.v).toFixed(1)}" r="4" fill="${line}" stroke="var(--bg)" stroke-width="1.5"/>` : "";
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" stroke="var(--border)"/>
    ${xLabels}
    ${gridSVG(niceTicks(vMin, vMax, 4), Y, L, W, R)}
    ${goalLines}${rawPath}<path d="${maPath}" fill="none" stroke="${line}" stroke-width="2.5" stroke-linecap="round"/>${projLine}${dots}${lastDot}</svg>`;
}
function inRange(entries, days) {
  const from = addDays(todayKey(), -(days - 1));
  return entries.filter((e) => e.d >= from);
}
const WEIGHT_CARD_DAYS = 7, WAIST_CARD_DAYS = 30;
let calRange = uiPrefs.calRange || 30;
// Compact card: fixed to the last 7 days, no filters or tooltips — the tap
// target for "more information" is the card itself (see makeCardExpandable),
// which opens the full-screen chart with every range/goal/detail option.
function renderWeightChart() {
  const fullMa = movingAvg(state.weights);
  const entries = inRange(state.weights, WEIGHT_CARD_DAYS), ma = inRange(fullMa, WEIGHT_CARD_DAYS);
  // Only show a goal line if its target already falls near the recent data —
  // otherwise a far-off goal would stretch this small chart's y-axis until the
  // actual week-to-week fluctuation flattens out to nothing.
  let goalLines = [];
  if (entries.length >= 2) {
    const vals = entries.map((e) => e.kg).concat(ma.map((m) => m.v));
    const vMin = Math.min(...vals), vMax = Math.max(...vals);
    const pad = Math.max(0.5, (vMax - vMin) * 0.15);
    const lo = vMin - pad, hi = vMax + pad;
    goalLines = state.goals
      .filter((g) => g.targetKg >= lo && g.targetKg <= hi)
      .map((g) => ({ v: g.targetKg, achieved: !!g.achievedOn }));
  }
  $("#weightChart").innerHTML = lineChart({ entries, ma, goals: goalLines, unit: "kg", projDays: 0, rawLine: true, color: "var(--purple)", tooltips: false, dateLabels: "all" });
  $("#weightLegendGoal").classList.toggle("hidden", !goalLines.length);
  if (entries.length >= 2) {
    const avg = entries.reduce((s, e) => s + e.kg, 0) / entries.length;
    const diff = ma[ma.length - 1].v - ma[0].v;
    $("#weightDelta").innerHTML = `<span class="trend-hd"><b>${r1(avg)}</b> avg · <b class="${diff <= 0 ? "t-green" : "t-amber"}">${diff <= 0 ? "" : "+"}${r1(diff)} kg</b> trend</span>`;
  } else $("#weightDelta").textContent = "";
}
let weightFullRange = uiPrefs.weightFullRange || 180, weightFullMode = uiPrefs.weightFullMode || "scale", weightFullGoalIds = null;
let weightDetailZoom = uiPrefs.weightDetailZoom || "week";
// A quick energy-balance-style delta: how much the trend line moved over the
// last N days, using the full (unrestricted) moving average so it's stable
// regardless of which range chip is selected.
function weightChangeOverDays(fullMa, days) {
  if (fullMa.length < 2) return null;
  const cutoff = addDays(todayKey(), -days);
  const past = [...fullMa].reverse().find((m) => m.d <= cutoff);
  if (!past) return null;
  return r1(fullMa[fullMa.length - 1].v - past.v);
}
// Catmull-Rom → cubic Bezier: turns a jagged connect-the-dots line into a
// proper smooth curve (the "silky" trend line MacroFactor's chart uses).
function smoothPathD(pts) {
  if (pts.length < 2) return "";
  if (pts.length === 2) return `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)} L${pts[1].x.toFixed(1)},${pts[1].y.toFixed(1)}`;
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)} `;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
    d += `C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)} `;
  }
  return d;
}
// "Detailed Trend": a fixed-zoom (7-days-visible) horizontally scrollable chart
// — raw dots + a smoothed trend curve, no goals, no tooltips — so daily texture
// that gets compressed away on a months-wide chart is visible again. Styled
// after MacroFactor's weight-trend chart: y-axis on the right, full x-axis.
function detailedTrendChart({ entries, ma, pxPerDay, zoom }) {
  const H = 170, L = 8, R = 40, T = 14, B = 24;
  const x0 = entries[0].d;
  const totalDays = Math.max(6, daysBetween(x0, entries[entries.length - 1].d));
  const W = Math.max(340, L + R + totalDays * pxPerDay);
  const X = (d) => L + daysBetween(x0, d) * pxPerDay;
  const vals = entries.map((e) => e.kg).concat(ma.map((m) => m.v));
  let vMin = Math.min(...vals), vMax = Math.max(...vals);
  const pad = Math.max(0.5, (vMax - vMin) * 0.15); vMin -= pad; vMax += pad;
  const Y = (v) => T + (1 - (v - vMin) / (vMax - vMin)) * (H - T - B);
  const dots = entries.map((e) => `<circle cx="${X(e.d).toFixed(1)}" cy="${Y(e.kg).toFixed(1)}" r="2.5" fill="var(--muted2)"/>`).join("");
  const rawPath = `<path d="${entries.map((e, i) => `${i ? "L" : "M"}${X(e.d).toFixed(1)},${Y(e.kg).toFixed(1)}`).join("")}" fill="none" stroke="var(--muted2)" stroke-width="1.2" opacity=".5"/>`;
  const maPath = `<path d="${smoothPathD(ma.map((m) => ({ x: X(m.d), y: Y(m.v) })))}" fill="none" stroke="var(--purple)" stroke-width="2.5" stroke-linecap="round"/>`;
  // Y-axis on the right with 3 evenly spaced dashed gridlines, like the
  // reference. The value labels live in a separate pinned overlay (see the
  // .detail-axis svg below) so the axis stays readable while the chart
  // scrolls; only the lines are drawn into the wide scrolling svg.
  const gridVals = [vMax - pad, (vMin + vMax) / 2, vMin + pad];
  const grid = gridVals.map((v) => `<line x1="${L}" y1="${Y(v).toFixed(1)}" x2="${W}" y2="${Y(v).toFixed(1)}" stroke="var(--border)" stroke-dasharray="2 3"/>`).join("");
  const axisTexts = gridVals.map((v) => `<text x="8" y="${(Y(v) + 3).toFixed(1)}" font-size="9" fill="var(--muted)">${r1(v)}</text>`).join("");
  // Full x-axis, always labelled by actual date (not just day-of-week, which
  // repeats every 7 days and stops meaning anything once you've scrolled a
  // few weeks back) — every day in Week zoom, every 5th day in Month zoom
  // since daily labels would overlap at that density.
  let dayLabels = "";
  const step = zoom === "month" ? 5 : 1;
  for (let i = 0; i <= totalDays; i += step) { const dk = addDays(x0, i); dayLabels += `<text x="${X(dk).toFixed(1)}" y="${H - 7}" font-size="8" fill="var(--muted)" text-anchor="middle">${fmtShort(dk)}</text>`; }
  return `<div class="detail-wrap"><div class="detail-scroll" id="weightDetailScroll"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" style="display:block">
    ${grid}${dayLabels}${rawPath}${maPath}${dots}</svg></div><svg class="detail-axis" viewBox="0 0 40 ${H}" width="40" height="${H}" xmlns="http://www.w3.org/2000/svg">${axisTexts}</svg></div>`;
}
function renderWeightFull() {
  const fullMa = movingAvg(state.weights);
  const sortedGoals = [...state.goals].sort((a, b) => (a.date < b.date ? -1 : 1));
  // Restore the last goal selection across app restarts; stale ids (deleted
  // goals) are dropped, and a selection that matched nothing falls back to
  // "show all". An intentionally-emptied selection stays empty.
  if (!weightFullGoalIds) {
    const saved = uiPrefs.weightFullGoalIds;
    weightFullGoalIds = new Set(Array.isArray(saved) ? saved.filter((id) => state.goals.some((g) => g.id === id)) : sortedGoals.map((g) => g.id));
    if (Array.isArray(saved) && saved.length && !weightFullGoalIds.size) weightFullGoalIds = new Set(sortedGoals.map((g) => g.id));
  }
  const shownGoals = sortedGoals.filter((g) => weightFullGoalIds.has(g.id));
  const isDetailed = weightFullMode === "trend";
  $("#weightFullGoalSection").classList.toggle("hidden", isDetailed);
  $("#weightFullLegend").classList.toggle("hidden", isDetailed);
  $("#weightFullScrollHint").classList.toggle("hidden", !isDetailed);
  $("#weightFullRangeChips").classList.toggle("hidden", isDetailed);
  $("#weightDetailZoomSeg").classList.toggle("hidden", !isDetailed);
  $("#weightFullInsightsSection").classList.toggle("hidden", !isDetailed);
  $("#weightFullStatsSection").classList.toggle("hidden", isDetailed);
  // Detailed Trend always scrolls the user's FULL history (not the Scale Weight
  // range chip) — Monthly zoom is disabled until there's enough of it to matter.
  const historySpanDays = state.weights.length >= 2 ? daysBetween(state.weights[0].d, state.weights[state.weights.length - 1].d) : 0;
  const monthlyEnabled = historySpanDays >= 30;
  if (weightDetailZoom === "month" && !monthlyEnabled) { weightDetailZoom = "week"; setPref("weightDetailZoom", "week"); }
  $$("#weightDetailZoomSeg button").forEach((b) => {
    b.classList.toggle("active", b.dataset.val === weightDetailZoom);
    b.disabled = b.dataset.val === "month" && !monthlyEnabled;
  });
  // Day notes ride along into the dot tooltips ("what happened that day").
  const withNotes = (arr) => arr.map((e) => ({ ...e, note: (state.logs[e.d] || {}).note }));
  const entries = withNotes(isDetailed ? state.weights : inRange(state.weights, weightFullRange));
  const ma = isDetailed ? fullMa : inRange(fullMa, weightFullRange);
  if (isDetailed) {
    $("#weightFullChart").innerHTML = entries.length >= 2
      ? detailedTrendChart({ entries, ma, pxPerDay: weightDetailZoom === "month" ? 340 / 30 : 340 / 7, zoom: weightDetailZoom })
      : `<div class="food-empty">Log at least 2 entries to see the chart.</div>`;
    const scroller = $("#weightDetailScroll");
    if (scroller) {
      // Land on the most recent period. On first open this render runs while
      // the sheet is still hidden (zero layout, scrollWidth 0, assignment
      // no-ops), so repeat it right after the current task — by then the
      // sheet has been unhidden by the caller. setTimeout, not rAF: rAF can
      // stall when nothing is compositing (backgrounded webview, sheet
      // mid-animation), a plain macrotask always runs.
      const toEnd = () => { scroller.scrollLeft = scroller.scrollWidth; };
      toEnd();
      setTimeout(toEnd, 0);
    }
  } else {
    const farGoal = shownGoals[shownGoals.length - 1];
    const projDays = farGoal ? Math.min(Math.max(0, daysBetween(todayKey(), farGoal.date)), Math.round(weightFullRange / 2)) : 0;
    const goalLines = shownGoals.map((g) => ({ v: g.targetKg, achieved: !!g.achievedOn }));
    $("#weightFullChart").innerHTML = entries.length >= 2
      ? lineChart({ entries, ma, goals: goalLines, unit: "kg", projDays, rawLine: true, color: "var(--purple)" })
      : `<div class="food-empty">Log at least 2 entries to see the chart.</div>`;
    $("#weightFullLegend").innerHTML = `<span class="lg dot-raw">daily</span><span class="lg dot-ma">7-day avg</span><span class="lg dot-goal">goal</span>`;
  }
  $$("#weightFullRangeChips button").forEach((b) => b.classList.toggle("active", +b.dataset.d === weightFullRange));
  $$("#weightModeSeg button").forEach((b) => b.classList.toggle("active", b.dataset.val === weightFullMode));
  $("#weightFullGoalChips").innerHTML = sortedGoals.length
    ? sortedGoals.map((g) => `<button data-id="${g.id}" class="${weightFullGoalIds.has(g.id) ? "active" : ""}">${esc(g.label)}</button>`).join("")
    : `<p class="muted">No goals set yet.</p>`;
  const d3 = weightChangeOverDays(fullMa, 3), d7 = weightChangeOverDays(fullMa, 7), d30 = weightChangeOverDays(fullMa, 30);
  const pace = weightTrendPerDay(), paceWk = pace != null ? r1(pace * 7) : null;
  const allVals = state.weights.map((w) => w.kg);
  $("#weightFullInsights").innerHTML = `
    <div class="stat-box"><div class="v ${d3 == null ? "" : d3 <= 0 ? "t-green" : "t-amber"}">${d3 == null ? "—" : (d3 <= 0 ? "" : "+") + d3 + " kg"}</div><div class="k">3-day change</div></div>
    <div class="stat-box"><div class="v ${d7 == null ? "" : d7 <= 0 ? "t-green" : "t-amber"}">${d7 == null ? "—" : (d7 <= 0 ? "" : "+") + d7 + " kg"}</div><div class="k">7-day change</div></div>
    <div class="stat-box"><div class="v ${d30 == null ? "" : d30 <= 0 ? "t-green" : "t-amber"}">${d30 == null ? "—" : (d30 <= 0 ? "" : "+") + d30 + " kg"}</div><div class="k">30-day change</div></div>
    <div class="stat-box"><div class="v ${paceWk == null ? "" : paceWk <= 0 ? "t-green" : "t-amber"}">${paceWk == null ? "—" : (paceWk <= 0 ? "" : "+") + paceWk + " kg"}</div><div class="k">current pace / wk</div></div>
    <div class="stat-box"><div class="v">${allVals.length ? r1(Math.max(...allVals)) + " kg" : "—"}</div><div class="k">highest ever</div></div>
    <div class="stat-box"><div class="v">${allVals.length ? r1(Math.min(...allVals)) + " kg" : "—"}</div><div class="k">lowest ever</div></div>
    <div class="stat-box"><div class="v">${state.weights.length}</div><div class="k">total weigh-ins</div></div>`;
  if (!isDetailed && entries.length >= 2) {
    const avg = entries.reduce((s, e) => s + e.kg, 0) / entries.length;
    const trendWk = ma.length >= 2 ? r1((ma[ma.length - 1].v - ma[0].v) / (daysBetween(ma[0].d, ma[ma.length - 1].d) / 7)) : null;
    const vals = entries.map((e) => e.kg);
    const sinceStart = r1(entries[entries.length - 1].kg - state.profile.startWeightKg);
    $("#weightFullStats").innerHTML = `
      <div class="stat-box"><div class="v">${r1(avg)} kg</div><div class="k">average</div></div>
      <div class="stat-box"><div class="v">${trendWk != null ? (trendWk <= 0 ? "" : "+") + trendWk + " kg" : "—"}</div><div class="k">trend / week</div></div>
      <div class="stat-box"><div class="v">${sinceStart <= 0 ? "" : "+"}${sinceStart} kg</div><div class="k">since start (${r1(state.profile.startWeightKg)} kg)</div></div>
      <div class="stat-box"><div class="v">${r1(Math.max(...vals))} kg</div><div class="k">highest</div></div>
      <div class="stat-box"><div class="v">${r1(Math.min(...vals))} kg</div><div class="k">lowest</div></div>
      <div class="stat-box"><div class="v">${entries.length}</div><div class="k">weigh-ins in range</div></div>`;
  } else {
    $("#weightFullStats").innerHTML = "";
  }
  const cw = currentWeight();
  $("#weightFullGoals").innerHTML = sortedGoals.length
    ? sortedGoals.map((g) => `<div class="targets-row"><span>${esc(g.label)} ${g.achievedOn ? "✓" : ""}</span><strong>${r1(g.targetKg)} kg${g.achievedOn ? "" : ` <span class="muted">(${r1(Math.abs(cw - g.targetKg))} kg to go)</span>`}</strong></div>`).join("")
    : `<p class="muted">No goals set yet.</p>`;
}
makeCardExpandable("#weightCard", () => { renderWeightFull(); $("#weightFullSheet").classList.remove("hidden"); });
wireSheetClose("weightFullSheet", "weightFullClose");
$("#weightFullRangeChips").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  weightFullRange = +b.dataset.d; setPref("weightFullRange", weightFullRange); renderWeightFull();
});
$("#weightModeSeg").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  weightFullMode = b.dataset.val; setPref("weightFullMode", weightFullMode); renderWeightFull();
});
$("#weightDetailZoomSeg").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b || b.disabled) return;
  weightDetailZoom = b.dataset.val; setPref("weightDetailZoom", weightDetailZoom); renderWeightFull();
});
$("#weightFullGoalChips").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b || !b.dataset.id) return;
  weightFullGoalIds.has(b.dataset.id) ? weightFullGoalIds.delete(b.dataset.id) : weightFullGoalIds.add(b.dataset.id);
  setPref("weightFullGoalIds", [...weightFullGoalIds]);
  renderWeightFull();
});
function renderWaistChart() {
  // dailyWeights() averages multiple same-day readings — same aggregation the
  // weight chart uses, applied here too in case of more than one waist
  // measurement on a day.
  const allEntries = dailyWeights(state.waists.map((w) => ({ d: w.d, kg: w.cm })));
  const entries = inRange(allEntries, WAIST_CARD_DAYS), ma = entries.map((e) => ({ d: e.d, v: e.kg }));
  $("#waistChart").innerHTML = lineChart({ entries, ma, goals: [], unit: "cm", projDays: 0, color: "var(--blue)" });
  $("#waistDelta").textContent = state.waists.length >= 2 ? `${(state.waists[state.waists.length - 1].cm - state.waists[0].cm) <= 0 ? "" : "+"}${r1(state.waists[state.waists.length - 1].cm - state.waists[0].cm)} cm since start` : "measure weekly to track belly progress";
}
function renderCalChart() {
  const W = 340, H = 150, L = 34, R = 8, T = 12, B = 22;
  const n = calRange;
  const allDays = []; for (let i = n - 1; i >= 0; i--) allDays.push(addDays(todayKey(), -i));
  // Longer ranges pack too many daily bars to read, so aggregate into weekly
  // averages (avg of the days actually logged) once past ~5 weeks.
  const bucketDays = n > 35 ? 7 : 1;
  const buckets = [];
  for (let i = 0; i < allDays.length; i += bucketDays) {
    const chunk = allDays.slice(i, i + bucketDays);
    const logged = chunk.filter((d) => dayTotals(d).items > 0);
    const kcal = logged.length ? logged.reduce((s, d) => s + dayTotals(d).kcal, 0) / logged.length : 0;
    const target = chunk.reduce((s, d) => s + targetFor(d), 0) / chunk.length;
    buckets.push({ from: chunk[0], to: chunk[chunk.length - 1], kcal, target });
  }
  const m = buckets.length;
  const max = Math.max(...buckets.map((b) => b.target * 1.25), ...buckets.map((b) => b.kcal), 1), bw = (W - L - R) / m;
  const rx = Math.min(3, bw / 3.5);
  const Y = (v) => T + (1 - v / max) * (H - T - B);
  const gap = Math.min(4, bw * 0.15);
  const bars = buckets.map((b, i) => {
    if (!b.kcal) return "";
    const over = b.kcal > b.target, isToday = b.to === todayKey() && bucketDays === 1;
    const tip = bucketDays === 1 ? `${fmtShort(b.from)} · ${r0(b.kcal)} / ${r0(b.target)} kcal` : `${fmtShort(b.from)}–${fmtShort(b.to)} · avg ${r0(b.kcal)} / ${r0(b.target)} kcal`;
    return `<rect data-tip="${tip}" x="${(L + i * bw + gap / 2).toFixed(1)}" y="${Y(b.kcal).toFixed(1)}" width="${(bw - gap).toFixed(1)}" height="${(H - B - Y(b.kcal)).toFixed(1)}" rx="${rx.toFixed(1)}" fill="${over ? "var(--amber)" : "var(--accent)"}" opacity="${isToday ? 1 : 0.7}"/>`;
  }).join("");
  let targetPath = "";
  for (let i = 0; i < m; i++) {
    const x0 = L + i * bw, x1 = L + (i + 1) * bw, y = Y(buckets[i].target).toFixed(1);
    targetPath += `${i === 0 ? `M${x0.toFixed(1)},${y}` : `L${x0.toFixed(1)},${y}`} L${x1.toFixed(1)},${y} `;
  }
  const lastT = r0(buckets[m - 1].target);
  const grid = gridSVG(niceTicks(0, max, 5).filter((t) => t > 0), Y, L, W, R);
  $("#calChart").innerHTML = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" stroke="var(--border)"/>${grid}${bars}<path d="${targetPath}" fill="none" stroke="var(--text)" stroke-width="1" stroke-dasharray="5 4" opacity=".45"/><text x="${W - R}" y="${(Y(buckets[m - 1].target) - 4).toFixed(1)}" text-anchor="end" font-size="9" fill="var(--muted)">target ${lastT}</text><text x="${L}" y="${H - 7}" font-size="9" fill="var(--muted)">${fmtShort(allDays[0])}</text><text x="${W - R}" y="${H - 7}" text-anchor="end" font-size="9" fill="var(--muted)">${bucketDays === 1 ? "today" : fmtShort(allDays[allDays.length - 1])}</text></svg>`;
  $$("#calRangeChips button").forEach((b) => b.classList.toggle("active", +b.dataset.d === calRange));
}
$("#calRangeChips").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  calRange = +b.dataset.d; setPref("calRange", calRange); renderCalChart();
});
let summaryPeriod = uiPrefs.summaryPeriod || 7;
function renderWeekCard() {
  const days = summaryPeriod;
  let kcalSum = 0, kcalDays = 0, walkDays = 0;
  for (let i = days - 1; i >= 0; i--) {
    const dk = addDays(todayKey(), -i);
    const t = dayTotals(dk);
    if (t.items > 0) { kcalSum += t.kcal; kcalDays++; }
    const l = state.logs[dk]; if (l && l.walks && l.walks.length) walkDays++;
  }
  const avgK = kcalDays ? r0(kcalSum / kcalDays) : 0, avgDef = kcalDays ? tdee() - avgK : 0, estChange = r1((avgDef * days) / 7700);
  const ma = movingAvg(state.weights); let actual = null;
  if (ma.length >= 2) { const past = [...ma].reverse().find((m) => m.d <= addDays(todayKey(), -days)); if (past) actual = ma[ma.length - 1].v - past.v; }
  const adherence = r0((kcalDays / days) * 100);
  const maxMag = Math.max(Math.abs(estChange), Math.abs(actual || 0), 0.2);
  const estPct = clamp(Math.abs(estChange) / maxMag, 0, 1) * 100;
  const actPct = actual != null ? clamp(Math.abs(actual) / maxMag, 0, 1) * 100 : 0;
  // The weekly-review local notification fires Sunday 6pm (Capacitor's
  // LocalNotifications weekday:1 = Sunday) — this mirrors that same day so the
  // in-app badge and the push notification always agree.
  const isReviewDay = new Date().getDay() === 0;
  $("#weekCard").innerHTML = `<div class="card-head"><h3>Summary <button class="info-btn" data-info="streak"><span class="ic" data-ic="info"></span></button></h3>${isReviewDay ? `<button class="review-badge" id="weeklyReviewBadge">Weekly review ready <span class="ic" data-ic="chevR"></span></button>` : ""}</div>
    <p id="weekNarrative" class="muted hidden" style="margin:-4px 0 12px"></p>
    <div class="chips" id="summaryChips">
      <button data-d="7" class="${days === 7 ? "active" : ""}">Week</button>
      <button data-d="30" class="${days === 30 ? "active" : ""}">Month</button>
    </div>
    <div class="adherence-row">
      <div class="mini-bar"><div class="mini-bar-fill" style="width:${adherence}%;background:var(--accent)"></div></div>
      <span class="adherence-label">${kcalDays}/${days} days logged (${adherence}%)</span>
    </div>
    <div class="compare-chart">
      <div class="compare-row">
        <span class="compare-lab">Estimated<br><span class="muted">from food</span></span>
        <div class="mini-bar"><div class="mini-bar-fill" style="width:${estPct}%;background:var(--amber)"></div></div>
        <span class="compare-val">${kcalDays ? (estChange > 0 ? "" : "+") + r1(-estChange) + "kg" : "—"}</span>
      </div>
      <div class="compare-row">
        <span class="compare-lab">Actual<br><span class="muted">weight trend</span></span>
        <div class="mini-bar"><div class="mini-bar-fill" style="width:${actPct}%;background:var(--accent)"></div></div>
        <span class="compare-val">${actual != null ? (actual <= 0 ? "" : "+") + r1(actual) + "kg" : "—"}</span>
      </div>
    </div>
    ${actual == null ? `<p class="muted" style="margin:-6px 0 14px">Log weight on a couple more days spread across the period to see an actual trend.</p>` : ""}
    <div class="stat-grid">
      <div class="stat-box"><div class="v">${avgK || "—"}</div><div class="k">avg kcal / day</div></div>
      <div class="stat-box"><div class="v">${kcalDays ? Math.abs(r0(avgDef)) : "—"}</div><div class="k">avg ${avgDef >= 0 ? "deficit" : "surplus"}</div></div>
      <div class="stat-box"><div class="v">${walkDays}</div><div class="k">active days</div></div>
      <div class="stat-box"><div class="v">${streak()}</div><div class="k">day streak</div></div>
    </div>`;
  renderIcons($("#weekCard"));
  $$("#summaryChips button").forEach((b) => b.addEventListener("click", () => { summaryPeriod = +b.dataset.d; setPref("summaryPeriod", summaryPeriod); renderWeekCard(); }));
  updateWeekNarrative(days, { kcalDays, avgK, avgDef, actual, streak: streak() });
}
// Turns the Summary card's stat grid into one short plain-English sentence via
// the on-device Foundation Models pipeline (same one food-description uses).
// Silently no-ops (hides the line) when on-device AI isn't available — the
// numeric stat grid above already carries the information either way.
let weekNarrativeToken = 0;
let weekNarrativeCache = { key: "", text: "" };
async function updateWeekNarrative(days, ctx) {
  const el = $("#weekNarrative");
  if (!el) return;
  if (!ctx.kcalDays) { el.classList.add("hidden"); return; }
  const key = JSON.stringify({ days, ...ctx });
  if (weekNarrativeCache.key === key) {
    el.textContent = weekNarrativeCache.text;
    el.classList.toggle("hidden", !weekNarrativeCache.text);
    return;
  }
  const myToken = ++weekNarrativeToken;
  // Avoid a flash-then-hide for the common "on-device AI unavailable" case
  // (which resolves near-instantly) — only show the shimmer once this is
  // still pending after a brief delay, meaning the model is actually working.
  const shimmerTimer = setTimeout(() => {
    if (myToken !== weekNarrativeToken) return;
    el.innerHTML = `<span class="shimmer-line"></span>`;
    el.classList.remove("hidden");
  }, 150);
  const prompt = `Write one short, plain-English sentence (max 30 words, no markdown, no quotes) summarizing this person's last ${days} days of weight-loss tracking. Be specific, honest, and encouraging.
Days logged: ${ctx.kcalDays}/${days}
Avg calories/day: ${ctx.avgK}
Avg deficit vs target/day: ${ctx.avgDef}
Weight trend: ${ctx.actual != null ? (ctx.actual <= 0 ? "down " : "up ") + Math.abs(r1(ctx.actual)) + "kg" : "not enough weigh-ins to tell"}
Logging streak: ${ctx.streak} days.`;
  const text = await aiGenerateText(prompt);
  clearTimeout(shimmerTimer);
  if (myToken !== weekNarrativeToken) return; // superseded by a newer render
  weekNarrativeCache = { key, text: text || "" };
  el.textContent = text || "";
  el.classList.toggle("hidden", !text);
}

/* ---------- swipe-left-to-delete (or edit/share+delete) ---------- */
// Post-processes a rendered list: wraps each row that has a `.fi-del` so it
// can be swiped left to reveal a red Delete button (guards against accidental
// taps). If the row also has a `.fi-edit` and/or `.fi-share`, extra buttons
// (blue Edit, purple Share) reveal alongside it — Delete innermost, then
// Edit, then Share, each 84px. The original hidden `.fi-del`/`.fi-edit`/
// `.fi-share` still carry the actual logic — the revealed buttons just
// forward a click to them, so every list keeps its existing handlers. A
// `[data-drag]` handle (if present, for drag-to-reorder lists) is
// deliberately left outside the swiped content so the vertical drag gesture
// never competes with this horizontal one.
let _openSwipe = null;
function closeSwipe(li) {
  if (!li) return;
  const c = li.querySelector(".swipe-content");
  if (c) { c.style.transition = "transform .2s var(--ease)"; c.style.transform = "translateX(0)"; }
  li._open = false;
  if (_openSwipe === li) _openSwipe = null;
}
function makeSwipeable(container) {
  if (!container) return;
  container.querySelectorAll("li").forEach((li) => {
    const del = li.querySelector(".fi-del");
    if (!del || li.dataset.swipe) return;
    li.dataset.swipe = "1";
    li.classList.add("swipe-row");
    const edit = li.querySelector(".fi-edit");
    const share = li.querySelector(".fi-share");
    const dragHandle = li.querySelector("[data-drag]");
    const cs = getComputedStyle(li);
    const content = document.createElement("div");
    content.className = "swipe-content";
    content.style.alignItems = cs.alignItems;
    content.style.justifyContent = cs.justifyContent;
    content.style.gap = cs.gap;
    content.style.paddingTop = cs.paddingTop;
    content.style.paddingBottom = cs.paddingBottom;
    li.style.paddingTop = "0"; li.style.paddingBottom = "0";
    [...li.childNodes].filter((n) => n !== dragHandle).forEach((n) => content.appendChild(n));
    li.appendChild(content);
    if (dragHandle) li.insertBefore(dragHandle, li.firstChild);
    const W = 84 * (1 + (edit ? 1 : 0) + (share ? 1 : 0));
    if (share) {
      const purple = document.createElement("button");
      purple.className = "swipe-share"; purple.type = "button"; purple.textContent = "Share";
      purple.style.right = `${84 * (1 + (edit ? 1 : 0))}px`;
      purple.addEventListener("click", (e) => { e.stopPropagation(); closeSwipe(li); share.click(); });
      li.appendChild(purple);
    }
    if (edit) {
      const blue = document.createElement("button");
      blue.className = "swipe-edit"; blue.type = "button"; blue.textContent = "Edit";
      blue.addEventListener("click", (e) => { e.stopPropagation(); closeSwipe(li); edit.click(); });
      li.appendChild(blue);
    }
    const red = document.createElement("button");
    red.className = "swipe-del"; red.type = "button"; red.textContent = "Delete";
    red.addEventListener("click", (e) => { e.stopPropagation(); del.click(); });
    li.appendChild(red);
    attachSwipe(li, content, W);
  });
}
function attachSwipe(li, content, W = 84) {
  let sx = 0, sy = 0, dx = 0, active = false, decided = false, horiz = false, wasOpen = false;
  content.addEventListener("pointerdown", (e) => {
    if (_openSwipe && _openSwipe !== li) closeSwipe(_openSwipe);
    sx = e.clientX; sy = e.clientY; active = true; decided = false; horiz = false; wasOpen = !!li._open;
    content.style.transition = "none";
  });
  content.addEventListener("pointermove", (e) => {
    if (!active) return;
    const mx = e.clientX - sx, my = e.clientY - sy;
    if (!decided) {
      if (Math.abs(mx) < 6 && Math.abs(my) < 6) return;
      decided = true; horiz = Math.abs(mx) > Math.abs(my);
      if (horiz) { try { content.setPointerCapture(e.pointerId); } catch (_) {} }
    }
    if (!horiz) return;
    let x = (wasOpen ? -W : 0) + mx;
    if (x > 0) x = 0; else if (x < -W) x = -W + (x + W) * 0.3;
    dx = x; content.style.transform = `translateX(${x}px)`;
  });
  const blockClick = () => {
    const b = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
    content.addEventListener("click", b, { capture: true, once: true });
    setTimeout(() => content.removeEventListener("click", b, true), 320);
  };
  const finish = () => {
    if (!active) return; active = false;
    if (!horiz) { if (wasOpen) { closeSwipe(li); blockClick(); } return; }
    content.style.transition = "transform .2s var(--ease)";
    const open = dx < -W / 2;
    content.style.transform = `translateX(${open ? -W : 0}px)`;
    li._open = open; _openSwipe = open ? li : (_openSwipe === li ? null : _openSwipe);
    if (open) haptic("light");
    blockClick();
  };
  content.addEventListener("pointerup", finish);
  content.addEventListener("pointercancel", finish);
}
document.addEventListener("pointerdown", (e) => {
  if (_openSwipe && !_openSwipe.contains(e.target)) closeSwipe(_openSwipe);
}, true);

// Auto-scrolls text that overflows its wrapper (bounces to reveal the end,
// then back) instead of just clipping it with an ellipsis.
function applyMarquee(el) {
  requestAnimationFrame(() => {
    const over = el.scrollWidth - el.parentElement.clientWidth;
    if (over > 4) {
      el.style.setProperty("--marquee-shift", `-${over}px`);
      el.style.setProperty("--marquee-dur", `${Math.max(3, over / 20)}s`);
      el.classList.add("marquee-active");
    } else {
      el.classList.remove("marquee-active");
    }
  });
}

// Drag-and-drop vertical reordering via a dedicated [data-drag] handle,
// deliberately kept separate from swipe-to-delete — both start from a
// pointerdown on the row and would otherwise fight over the same gesture,
// so a reorderable list should not also call makeSwipeable. Swaps the
// dragged row with whichever neighbor its pointer crosses the midpoint of,
// mutating `arr` in place to match, then calls onReorder() (typically
// save()+re-render) once the drag ends.
function makeReorderable(containerSel, arr, onReorder) {
  const container = $(containerSel);
  if (!container) return;
  let dragLi = null, startY = 0;
  container.querySelectorAll("li[data-id]").forEach((li) => {
    const handle = li.querySelector("[data-drag]");
    if (!handle) return;
    const idxOf = () => arr.findIndex((x) => x.id === li.dataset.id);
    handle.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      dragLi = li; startY = e.clientY;
      li.classList.add("dragging");
      try { handle.setPointerCapture(e.pointerId); } catch (_) {}
    });
    handle.addEventListener("pointermove", (e) => {
      if (dragLi !== li) return;
      li.style.transform = `translateY(${e.clientY - startY}px)`;
      const rect = li.getBoundingClientRect(), centerY = rect.top + rect.height / 2;
      const prev = li.previousElementSibling, next = li.nextElementSibling;
      if (prev && prev.dataset.id && centerY < prev.getBoundingClientRect().top + prev.getBoundingClientRect().height / 2) {
        container.insertBefore(li, prev);
        const i = idxOf();
        [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
        startY = e.clientY; li.style.transform = "translateY(0px)";
      } else if (next && next.dataset.id && centerY > next.getBoundingClientRect().top + next.getBoundingClientRect().height / 2) {
        container.insertBefore(next, li);
        const i = idxOf();
        [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
        startY = e.clientY; li.style.transform = "translateY(0px)";
      }
    });
    const end = () => {
      if (dragLi !== li) return;
      li.style.transform = ""; li.classList.remove("dragging");
      dragLi = null;
      onReorder();
    };
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  });
}

// Global light haptic tick on interactive taps — a subtle native feel (no-ops
// in the browser). Buttons cover chips, tabs, food rows, add/qty/swipe actions.
document.addEventListener("pointerdown", (e) => {
  if (hapticsEnabled() && e.target.closest && e.target.closest("button, .toggle, input[type=checkbox], input[type=range], input[type=time]")) haptic("light");
}, { passive: true });

// Lock the page behind an open sheet so it can't be scrolled by mistake.
(function () {
  const sync = () => {
    const open = [...document.querySelectorAll(".sheet")].some((s) => !s.classList.contains("hidden"));
    document.body.classList.toggle("sheet-open", open);
  };
  const obs = new MutationObserver(sync);
  document.querySelectorAll(".sheet").forEach((s) => obs.observe(s, { attributes: true, attributeFilter: ["class"] }));
})();

/* ---------- chart tap tooltip ---------- */
const chartTip = document.createElement("div");
chartTip.className = "chart-tip hidden";
document.body.appendChild(chartTip);
// Show the tooltip for the [data-tip] nearest the given x within a chart svg.
function showChartTip(target, clientX, autoHide) {
  let el = target.closest && target.closest("[data-tip]");
  if (!el) {
    const svg = target.closest && target.closest("svg");
    const tips = svg ? [...svg.querySelectorAll("[data-tip]")] : [];
    if (tips.length) {
      let best = null;
      for (const t of tips) {
        const r = t.getBoundingClientRect();
        const d = Math.abs(r.left + r.width / 2 - clientX);
        if (!best || d < best.d) best = { el: t, d };
      }
      el = best.el;
    }
  }
  if (!el) { if (!chartTip.classList.contains("hidden")) chartTip.classList.add("hidden"); return false; }
  const r = el.getBoundingClientRect();
  chartTip.textContent = el.dataset.tip;
  chartTip.classList.remove("hidden");
  chartTip.style.left = clamp(r.left + r.width / 2, 60, innerWidth - 60) + "px";
  chartTip.style.top = Math.max(r.top - 8, 40) + "px";
  clearTimeout(chartTip._t);
  if (autoHide) chartTip._t = setTimeout(() => chartTip.classList.add("hidden"), 2400);
  return true;
}
document.addEventListener("click", (e) => { showChartTip(e.target, e.clientX, true); });
// Drag along a chart to scrub the tooltip across points.
let _scrubSvg = null;
document.addEventListener("pointerdown", (e) => {
  const svg = e.target.closest && e.target.closest("svg");
  if (svg && svg.querySelector("[data-tip]")) { _scrubSvg = svg; showChartTip(e.target, e.clientX, false); }
}, { passive: true });
document.addEventListener("pointermove", (e) => {
  if (!_scrubSvg) return;
  showChartTip(_scrubSvg, e.clientX, false);
}, { passive: true });
document.addEventListener("pointerup", () => {
  if (!_scrubSvg) return;
  _scrubSvg = null;
  clearTimeout(chartTip._t);
  chartTip._t = setTimeout(() => chartTip.classList.add("hidden"), 2400);
}, { passive: true });

/* ---------- Summary detail (full screen) ---------- */
// Bars diverging from a centered zero line: negative = green (deficit / loss),
// positive = amber (over target / gain).
function diffBarChart(points, unit) {
  const W = 340, H = 150, L = 38, R = 8, T = 10, B = 20;
  if (!points.length) return `<div class="food-empty">Nothing logged in this period yet.</div>`;
  const maxAbs = Math.max(...points.map((p) => Math.abs(p.v)), 1e-6);
  const midY = T + (H - T - B) / 2;
  const scale = (H - T - B) / 2 / maxAbs;
  const bw = (W - L - R) / points.length;
  const gap = Math.min(4, bw * 0.2), rx = Math.min(3, bw / 4);
  const bars = points.map((p, i) => {
    const h = Math.abs(p.v) * scale;
    if (h < 0.5) return "";
    const y = p.v < 0 ? midY : midY - h;
    const color = p.v < 0 ? "var(--accent)" : "var(--amber)";
    const tip = `${fmtShort(p.d)} · ${p.v > 0 ? "+" : ""}${unit === "kg" ? r1(p.v) + " kg" : r0(p.v) + " kcal"}`;
    return `<rect data-tip="${tip}" x="${(L + i * bw + gap / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${(bw - gap).toFixed(1)}" height="${h.toFixed(1)}" rx="${rx.toFixed(1)}" fill="${color}" opacity="0.85"/>`;
  }).join("");
  const halfY = (sign) => midY - sign * (maxAbs / 2) * scale;
  const halfGrid = [1, -1].map((s) => `<line x1="${L}" y1="${halfY(s).toFixed(1)}" x2="${W - R}" y2="${halfY(s).toFixed(1)}" stroke="var(--border)" stroke-dasharray="3 5" opacity=".6"/><text x="${L - 4}" y="${(halfY(s) + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="var(--muted)">${s > 0 ? "+" : "−"}${axisVal(maxAbs / 2)}</text>`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <line x1="${L}" y1="${midY}" x2="${W - R}" y2="${midY}" stroke="var(--muted2)" opacity=".8"/>
    <text x="${L - 4}" y="${midY + 3}" text-anchor="end" font-size="9" fill="var(--muted)">0</text>
    <text x="${L - 4}" y="${T + 8}" text-anchor="end" font-size="9" fill="var(--muted)">+${r1(maxAbs)}${unit}</text>
    <text x="${L - 4}" y="${H - B}" text-anchor="end" font-size="9" fill="var(--muted)">−${r1(maxAbs)}${unit}</text>
    ${halfGrid}${bars}
    <text x="${L}" y="${H - 6}" font-size="9" fill="var(--muted)">${fmtShort(points[0].d)}</text>
    <text x="${W - R}" y="${H - 6}" text-anchor="end" font-size="9" fill="var(--muted)">${fmtShort(points[points.length - 1].d)}</text>
  </svg>`;
}
let sumFullPeriod = 7, sumFullOffset = 0; // offset = how many periods back from today
function renderSummaryFull() {
  const days = sumFullPeriod, p = state.profile;
  const endKey = addDays(todayKey(), -sumFullOffset * days);
  const startKey = addDays(endKey, -(days - 1));
  $("#sumRangeLabel").textContent = `${fmtShort(startKey)} – ${fmtShort(endKey)}`;
  $("#sumNext").disabled = sumFullOffset === 0;
  // Same floor as the calendar: no paging back past the first data.
  $("#sumPrev").disabled = startKey <= firstDataKey();
  const calPts = [], weightPts = [];
  let kcalSum = 0, kcalDays = 0;
  for (let i = days - 1; i >= 0; i--) {
    const dk = addDays(endKey, -i);
    const t = dayTotals(dk);
    if (t.items > 0) { calPts.push({ d: dk, v: t.kcal - p.kcalTarget }); kcalSum += t.kcal; kcalDays++; }
  }
  const inRangeW = dailyWeights(state.weights).filter((w) => w.d >= startKey && w.d <= endKey);
  for (let i = 1; i < inRangeW.length; i++) {
    weightPts.push({ d: inRangeW[i].d, v: r1(inRangeW[i].kg - inRangeW[i - 1].kg) });
  }
  $("#sumCalDiff").innerHTML = diffBarChart(calPts, "");
  $("#sumWeightDiff").innerHTML = weightPts.length
    ? diffBarChart(weightPts, "kg")
    : `<div class="food-empty">Log weight on consecutive days to see daily changes.</div>`;
  const avgK = kcalDays ? r0(kcalSum / kcalDays) : 0;
  const avgDef = kcalDays ? tdee() - avgK : 0;
  const wLost = inRangeW.length >= 2 ? r1(inRangeW[inRangeW.length - 1].kg - inRangeW[0].kg) : null;
  $("#sumFullStats").innerHTML = `
    <div class="stat-box"><div class="v">${avgK || "—"}</div><div class="k">avg kcal / day</div></div>
    <div class="stat-box"><div class="v">${kcalDays ? Math.abs(r0(avgDef)) : "—"}</div><div class="k">avg ${avgDef >= 0 ? "deficit" : "surplus"}</div></div>
    <div class="stat-box"><div class="v">${kcalDays}/${days}</div><div class="k">days logged</div></div>
    <div class="stat-box"><div class="v">${wLost != null ? (wLost <= 0 ? "" : "+") + wLost + " kg" : "—"}</div><div class="k">weight change</div></div>`;
  $$("#sumFullChips button").forEach((b) => b.classList.toggle("active", +b.dataset.d === sumFullPeriod));
}
$("#weekCard").addEventListener("click", (e) => {
  if (e.target.closest("#summaryChips") || e.target.closest(".info-btn") || e.target.closest("#weeklyReviewBadge")) return;
  sumFullPeriod = summaryPeriod;
  sumFullOffset = 0;
  renderSummaryFull();
  $("#summarySheet").classList.remove("hidden");
});
// The badge specifically means "this week" — always opens to the 7-day view
// regardless of whatever period the card itself is currently toggled to.
document.addEventListener("click", (e) => {
  if (!e.target.closest("#weeklyReviewBadge")) return;
  sumFullPeriod = 7;
  sumFullOffset = 0;
  renderSummaryFull();
  $("#summarySheet").classList.remove("hidden");
});
wireSheetClose("summarySheet", "summaryFullClose");
$("#sumFullChips").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  sumFullPeriod = +b.dataset.d; sumFullOffset = 0; renderSummaryFull();
});
$("#sumPrev").addEventListener("click", () => { sumFullOffset++; haptic("light"); renderSummaryFull(); });
$("#sumNext").addEventListener("click", () => { if (sumFullOffset > 0) { sumFullOffset--; haptic("light"); renderSummaryFull(); } });
// (Period is changed with the ‹ › arrows; swipe intentionally left off here.)
/* ---------- Body ---------- */
function bmi(kg, cm) {
  const m = cm / 100, val = kg / (m * m);
  const category = val < 18.5 ? "Underweight" : val < 25 ? "Normal" : val < 30 ? "Overweight" : "Obese";
  return { val: r1(val), category };
}
function renderBody() {
  const p = state.profile, w = state.weights, ws = state.waists;
  const cw = w.length ? w[w.length - 1].kg : null;
  const wDelta = cw != null ? r1(cw - p.startWeightKg) : null;
  const cwaist = ws.length ? ws[ws.length - 1].cm : null;
  const waistDelta = ws.length >= 2 ? r1(cwaist - ws[0].cm) : null;
  const b = cw != null ? bmi(cw, p.heightCm) : null;
  $("#bodySummary").innerHTML = `
    <div class="stat-box"><div class="v">${cw != null ? cw + " kg" : "—"}</div><div class="k">current weight</div></div>
    <div class="stat-box"><div class="v">${wDelta != null ? (wDelta <= 0 ? "" : "+") + wDelta + " kg" : "—"}</div><div class="k">since start (${r1(p.startWeightKg)} kg)</div></div>
    <div class="stat-box"><div class="v">${p.heightCm} cm</div><div class="k">height</div></div>
    <div class="stat-box"><div class="v">${b ? b.val : "—"}${b ? `<span class="stat-sub" style="color:${bmiCategoryColor(b.val)}">${b.category}</span>` : ""}</div><div class="k">BMI <button class="info-btn" data-info="bmi"><span class="ic" data-ic="info"></span></button></div></div>
    <div class="stat-box"><div class="v">${cwaist != null ? cwaist + " cm" : "—"}</div><div class="k">current waist</div></div>
    <div class="stat-box"><div class="v">${waistDelta != null ? (waistDelta <= 0 ? "" : "+") + waistDelta + " cm" : "—"}</div><div class="k">waist change</div></div>`;
  renderIcons($("#bodySummary"));
  const recentCutoff = addDays(todayKey(), -1);
  const recentW = state.weights.filter((w) => w.d >= recentCutoff).reverse();
  const wRows = recentW.map((w) =>
    `<li><span>${w.kg} kg</span><span class="ing-right"><span class="d">${w.d === todayKey() ? "Today" : fmtShort(w.d)}${w.ts ? " · " + fmtTime(w.ts) : ""}</span><button class="fi-del" data-wts="${w.ts || w.d}"><span class="ic" data-ic="x"></span></button></span></li>`);
  $("#weightList").innerHTML = wRows.length
    ? collapseRows(wRows, "weight")
    : `<li class="muted" style="border-top:none">No weigh-in in the last 2 days — full history is on Progress.</li>`;
  const cRows = [...state.waists].reverse().map((w) =>
    `<li><span>${w.cm} cm</span><span class="ing-right"><span class="d">${fmtShort(w.d)}</span><button class="fi-del" data-cd="${w.d}"><span class="ic" data-ic="x"></span></button></span></li>`);
  $("#waistList").innerHTML = collapseRows(cRows, "waist");
  renderIcons($("#weightList")); renderIcons($("#waistList"));
  $$("#weightList .list-toggle, #waistList .list-toggle").forEach((b) => b.addEventListener("click", () => {
    listExpand[b.dataset.lt] = !listExpand[b.dataset.lt]; renderBody();
  }));
  $$("#weightList .fi-del").forEach((b) => b.addEventListener("click", () => {
    state.weights = state.weights.filter((w) => (w.ts || w.d) !== b.dataset.wts);
    save(); renderBody(); toast("Weight entry removed");
  }));
  $$("#waistList .fi-del").forEach((b) => b.addEventListener("click", () => {
    state.waists = state.waists.filter((w) => w.d !== b.dataset.cd);
    save(); renderBody(); toast("Waist entry removed");
  }));
  makeSwipeable($("#weightList")); makeSwipeable($("#waistList"));
  renderSleepSteps();
  renderPhotos();
}
// Long entry lists collapse to 5 rows with a Show all / Show less toggle so
// the card stays a card instead of a scroll of history.
const listExpand = { weight: false, waist: false };
function collapseRows(rows, key) {
  if (rows.length <= 5) return rows.join("");
  const expanded = listExpand[key];
  const shown = expanded ? rows : rows.slice(0, 5);
  return shown.join("") + `<li class="list-toggle-row"><button class="list-toggle" data-lt="${key}">${expanded ? "Show less" : `Show all (${rows.length})`}</button></li>`;
}
// Rough energy from steps, scaled by bodyweight (~0.0005 kcal · step⁻¹ · kg⁻¹).
function stepKcal(steps) { return r0(steps * currentWeight() * 0.0005); }
function renderSleepSteps() {
  const l = state.logs[todayKey()] || {};
  const sleepH = l.sleepH, steps = l.steps;
  $("#sleepInput").value = sleepH != null ? sleepH : "";
  $("#stepsInput").value = steps != null ? steps : "";
  $("#sleepStepsSummary").innerHTML = `
    <div class="stat-box"><div class="v">${sleepH != null ? sleepH + " h" : "—"}</div><div class="k">sleep last night</div></div>
    <div class="stat-box"><div class="v">${steps != null ? steps.toLocaleString() : "—"}${steps != null ? `<span class="stat-sub">≈ ${stepKcal(steps)} kcal</span>` : ""}</div><div class="k">steps today</div></div>`;
  renderIcons($("#sleepStepsSummary"));
  $("#stepsNote").textContent = steps != null
    ? `Steps add ≈ ${stepKcal(steps)} kcal to today's Active total. Turn on "Eat back active calories" in Settings to add that to your eating budget. If you also log a walk, avoid double-counting — log only non-walking workouts alongside steps.`
    : "Log sleep and steps to keep an eye on recovery and daily movement.";
}
function simpleBars(days, vals, fmt, color, goal) {
  const W = 340, H = 140, L = 34, R = 8, T = 12, B = 22;
  const present = vals.filter((v) => v != null);
  if (!present.length) return `<div class="food-empty">Nothing logged yet.</div>`;
  const max = Math.max(...present, goal || 0, 1), n = days.length;
  const bw = (W - L - R) / n, gap = Math.min(4, bw * 0.15), rx = Math.min(3, bw / 3.5);
  const Y = (v) => T + (1 - v / max) * (H - T - B);
  const bars = days.map((dk, i) => {
    const v = vals[i]; if (v == null) return "";
    return `<rect data-tip="${fmtShort(dk)} · ${fmt(v)}" x="${(L + i * bw + gap / 2).toFixed(1)}" y="${Y(v).toFixed(1)}" width="${(bw - gap).toFixed(1)}" height="${(H - B - Y(v)).toFixed(1)}" rx="${rx.toFixed(1)}" fill="${color}" opacity="${dk === todayKey() ? 1 : 0.72}"/>`;
  }).join("");
  const goalLine = goal ? `<line x1="${L}" y1="${Y(goal).toFixed(1)}" x2="${W - R}" y2="${Y(goal).toFixed(1)}" stroke="var(--text)" stroke-width="1" stroke-dasharray="5 4" opacity=".4"/><text x="${W - R}" y="${(Y(goal) - 4).toFixed(1)}" text-anchor="end" font-size="9" fill="var(--muted)">${fmt(goal)}</text>` : "";
  const grid = gridSVG(niceTicks(0, max, 5).filter((t) => t > 0), Y, L, W, R);
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" stroke="var(--border)"/>${grid}${bars}${goalLine}<text x="${L}" y="${H - 7}" font-size="9" fill="var(--muted)">${fmtShort(days[0])}</text><text x="${W - R}" y="${H - 7}" text-anchor="end" font-size="9" fill="var(--muted)">today</text></svg>`;
}
function renderSleepStepsHistory() {
  const days = []; for (let i = 29; i >= 0; i--) days.push(addDays(todayKey(), -i));
  const stepsOf = (dk) => { const l = state.logs[dk]; return l && l.steps != null ? l.steps : null; };
  const sleepOf = (dk) => { const l = state.logs[dk]; return l && l.sleepH != null ? l.sleepH : null; };
  const stepVals = days.map(stepsOf), sleepVals = days.map(sleepOf);
  $("#stepsChart").innerHTML = simpleBars(days, stepVals, (v) => v.toLocaleString() + " steps", "var(--accent)", 8000);
  $("#sleepChart").innerHTML = simpleBars(days, sleepVals, (v) => v + " h", "var(--blue)", 8);
  const sv = stepVals.filter((v) => v != null), slv = sleepVals.filter((v) => v != null);
  $("#stepsStats").innerHTML = `<div class="stat-box"><div class="v">${sv.length ? calcAvg(sv).toLocaleString() : "—"}</div><div class="k">avg / day (${sv.length}d)</div></div><div class="stat-box"><div class="v">${sv.length ? Math.max(...sv).toLocaleString() : "—"}</div><div class="k">best day</div></div>`;
  $("#sleepStats").innerHTML = `<div class="stat-box"><div class="v">${slv.length ? calcAvg(slv, 1) + " h" : "—"}</div><div class="k">avg / night (${slv.length}d)</div></div><div class="stat-box"><div class="v">${slv.length ? Math.max(...slv) + " h" : "—"}</div><div class="k">longest</div></div>`;
  const rows = [];
  for (let i = 0; i < 90; i++) { const dk = addDays(todayKey(), -i), l = state.logs[dk]; if (l && (l.steps != null || l.sleepH != null)) rows.push({ dk, steps: l.steps, sleepH: l.sleepH }); }
  $("#sleepStepsList").innerHTML = rows.length
    ? rows.slice(0, 20).map((r) => `<li><span class="row-label">${r.dk === todayKey() ? "Today" : fmtShort(r.dk)}</span><span class="ing-right"><span class="d">${r.sleepH != null ? r.sleepH + " h sleep" : ""}${r.sleepH != null && r.steps != null ? " · " : ""}${r.steps != null ? r.steps.toLocaleString() + " steps" : ""}</span></span></li>`).join("")
    : `<li class="muted" style="border-top:none">Nothing logged yet.</li>`;
}
makeCardExpandable("#sleepStepsCard", () => { renderSleepStepsHistory(); $("#sleepStepsSheet").classList.remove("hidden"); });
wireSheetClose("sleepStepsSheet", "sleepStepsHistClose");
function renderCalcSheet() {
  const p = state.profile, cw = currentWeight(), sexWord = p.sex === "male" ? "male" : "female";
  const base = p.sex === "male" ? 5 : -161;
  const baseLine = p.sex === "male" ? "+ 5" : "− 161";
  const bmrExact = bmr(p.sex, cw, p.heightCm, p.age);
  const bmrVal = r0(bmrExact);
  const tdeeVal = tdee();
  const activityLabel = ACTIVITY_LABELS[String(p.activity)] || p.activity;
  const deficit = tdeeVal - p.kcalTarget;
  const floor = kcalFloor(p.sex);
  const flooredNote = p.kcalTarget === floor && tdeeVal - floor !== deficit
    ? `<p class="muted" style="margin-top:6px">Your target is capped at the ${floor} kcal safety floor for ${sexWord}s — the raw deficit math wanted to go lower.</p>` : "";
  $("#calcBody").innerHTML = `
    <p class="muted" style="margin-bottom:14px">Using your most recent numbers: ${p.age}yo ${sexWord}, ${p.heightCm} cm, ${r1(cw)} kg (from your latest weigh-in — this whole calculation updates automatically every time you log a new weight).</p>

    <p class="field-label" style="margin-top:0">Step 1 — BMR (Basal Metabolic Rate)</p>
    <p class="muted">Calories your body burns at rest, via the Mifflin-St Jeor formula:</p>
    <div class="calc-formula">10 × ${r1(cw)} + 6.25 × ${p.heightCm} − 5 × ${p.age} ${baseLine} = <strong>${bmrVal} kcal</strong></div>

    <p class="field-label">Step 2 — TDEE (maintenance calories)</p>
    <p class="muted">BMR × activity multiplier (${activityLabel} = ×${p.activity}):</p>
    <div class="calc-formula">${r1(bmrExact)} × ${p.activity} = <strong>${tdeeVal} kcal</strong></div>

    <p class="field-label">Step 3 — Calorie target</p>
    <p class="muted">Maintenance minus your deficit (from the Pace you picked in Settings):</p>
    <div class="calc-formula">${tdeeVal} − ${Math.max(0, deficit)} = <strong>${p.kcalTarget} kcal</strong></div>
    ${flooredNote}

    <p class="field-label">Step 4 — Protein target</p>
    <p class="muted">Grams per kg of bodyweight (protects muscle during a deficit):</p>
    <div class="calc-formula">${r1(cw)} kg × ${r1(p.proteinTarget / cw)} g/kg ≈ <strong>${p.proteinTarget} g</strong></div>

    <p class="muted" style="margin-top:16px">Because BMR and TDEE use your <em>current</em> weight, both numbers drift automatically as you lose weight — no need to recalculate anything yourself.</p>`;
}
$("#calcOpenBtn").addEventListener("click", () => { renderCalcSheet(); $("#calcSheet").classList.remove("hidden"); });
wireSheetClose("calcSheet", "calcClose");
$("#weightSave").addEventListener("click", () => {
  const v = parseFloat($("#weightInput").value);
  if (!v || v < 25 || v > 350) return toast("Enter a valid weight");
  const now = new Date();
  state.weights.push({ d: toKey(now), ts: now.toISOString(), kg: v });
  state.weights.sort((a, b) => (a.ts < b.ts ? -1 : 1)); $("#weightInput").value = "";
  save(); renderBody(); toast("Weight logged");
  checkGoals();
});
$("#waistSave").addEventListener("click", () => {
  const v = parseFloat($("#waistInput").value);
  if (!v || v < 40 || v > 250) return toast("Enter a valid measurement");
  const k = todayKey();
  state.waists = state.waists.filter((w) => w.d !== k); state.waists.push({ d: k, cm: v });
  state.waists.sort((a, b) => (a.d < b.d ? -1 : 1)); $("#waistInput").value = "";
  save(); renderBody(); toast("Waist logged");
});
$("#sleepSave").addEventListener("click", () => {
  const v = parseFloat($("#sleepInput").value);
  if (!(v >= 0) || v > 24) return toast("Enter valid sleep hours");
  const l = dayLog(todayKey()); l.sleepH = v; save(); renderSleepSteps(); toast("Sleep logged");
});
$("#stepsSave").addEventListener("click", () => {
  const v = parseInt($("#stepsInput").value, 10);
  if (!(v >= 0) || v > 200000) return toast("Enter a valid step count");
  const l = dayLog(todayKey()); l.steps = v; save(); renderSleepSteps(); toast("Steps logged");
});

/* photos via IndexedDB */
let idb = null;
function openIDB() {
  return new Promise((res, rej) => {
    if (idb) return res(idb);
    const r = indexedDB.open("fittrack-photos", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("photos", { keyPath: "ts" });
    r.onsuccess = () => { idb = r.result; res(idb); }; r.onerror = () => rej(r.error);
  });
}
async function idbAll() {
  const db = await openIDB();
  return new Promise((res) => { const out = []; const tx = db.transaction("photos").objectStore("photos").openCursor(null, "prev"); tx.onsuccess = () => { const c = tx.result; if (c) { out.push(c.value); c.continue(); } else res(out); }; tx.onerror = () => res(out); });
}
async function idbPut(rec) { const db = await openIDB(); return new Promise((res, rej) => { const tx = db.transaction("photos", "readwrite"); tx.objectStore("photos").put(rec); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); }
async function idbDel(ts) { const db = await openIDB(); return new Promise((res) => { const tx = db.transaction("photos", "readwrite"); tx.objectStore("photos").delete(ts); tx.oncomplete = res; tx.onerror = res; }); }
async function renderPhotos() {
  const photos = await idbAll();
  $("#photoGrid").innerHTML = photos.map((p) => { const url = URL.createObjectURL(p.blob); return `<div class="photo-cell"><img src="${url}" alt=""><span class="pdate">${fmtShort(toKey(new Date(p.ts)))}</span><button class="photo-del" data-ts="${p.ts}">✕</button></div>`; }).join("");
  $$("#photoGrid .photo-del").forEach((b) => b.addEventListener("click", async () => { if (!confirm("Delete this photo?")) return; await idbDel(+b.dataset.ts); renderPhotos(); }));
}
$("#photoInput").addEventListener("change", async (e) => {
  const file = e.target.files[0]; e.target.value = ""; if (!file) return;
  const { b64 } = await downscale(file, 1000);
  const blob = await (await fetch("data:image/jpeg;base64," + b64)).blob();
  await idbPut({ ts: Date.now(), blob }); renderPhotos(); toast("Photo saved");
});

/* ---------- Settings ---------- */
function renderSettings() {
  const p = state.profile;
  $("#setKcal").value = p.kcalTarget; $("#setProtein").value = p.proteinTarget; $("#setWater").value = p.waterTargetMl;
  $("#setMove").value = p.moveTarget; $("#setActivity").value = String(p.activity); $("#setEatBack").checked = !!p.eatBack;
  $("#setAutoAdjust").checked = !!p.autoAdjust;
  $("#setHaptics").checked = state.settings.haptics !== false;
  // Profile section
  $("#setDob").value = p.birthDate || "";
  $("#setSex").value = p.sex;
  $("#setStartWeight").value = r1(p.startWeightKg);
  $("#setShareName").value = state.settings.shareName || "";
  $("#setLibraryKey").value = state.settings.libraryKey || "";
  $("#libraryKeyInfo").textContent = libraryKey()
    ? "Key saved — you can publish, and edit or delete the foods you added."
    : "No key yet — you can browse and save shared foods, but not publish.";
  $("#setWeekStart").value = state.settings.weekStart || "mon";
  $("#setWaterEnabled").checked = state.settings.waterEnabled;
  $("#setReduceMotion").checked = !!state.settings.reduceMotion;
  $("#setApiKey").value = state.settings.apiKey || "";
  $("#settingsInfo").textContent = `BMR ≈ ${r0(bmr(p.sex, currentWeight(), p.heightCm, p.age))} · maintenance ≈ ${tdee()} kcal`;
  $$("#themeSeg button").forEach((b) => b.classList.toggle("active", b.dataset.val === state.settings.theme));
  $("#versionInfo").textContent = "FitTrack v" + APP_VERSION;
  $("#backupInfo").textContent = backupStatusText();
  $("#aboutVersion").textContent = "v" + APP_VERSION;
  $("#setReminder").checked = !!state.settings.reminder.enabled;
  $("#setReminderTime").value = state.settings.reminder.time || "19:00";
  $("#reminderInfo").textContent = !state.settings.reminder.enabled ? "" : isNativeApp()
    ? `Reminder set for ${state.settings.reminder.time} daily.`
    : "Reminders only fire in the installed app, not this preview.";
  $("#setWeekly").checked = !!state.settings.weeklyReview.enabled;
  renderProfileSummary();
  renderTargetsSummary();
  renderPaceTiers();
  renderSuppSettings();
  renderGoalSettings();
  renderGlossary();
}
const ACTIVITY_LABELS = { "1.2": "Sedentary", "1.375": "Lightly active", "1.55": "Active", "1.725": "Very active" };
// Profile and Targets are separate cards again, but keep the icon-row stat
// grid look (matching the app's existing .stat-box style) instead of the
// old plain label/value lists. No Edit button — each card toggles its own
// edit form via long-press (see longPress() below), since a visible Edit
// button felt like one more thing cluttering the header once there were two
// of these cards side by side.
function renderProfileSummary() {
  const p = state.profile;
  const rows = [
    { ic: "person", c: "t-blue", v: `${p.age} · ${p.sex === "male" ? "Male" : "Female"}`, k: "Age & sex" },
    { ic: "scale", c: "t-purple", v: `${r1(p.startWeightKg)} kg`, k: "Initial weight" },
    { ic: "share", c: "t-green", v: state.settings.shareName ? esc(state.settings.shareName) : "Not set", k: "Display name" },
  ];
  $("#profileSummary").innerHTML = rows.map((r) => `<div class="stat-box"><span class="ic ${r.c}" data-ic="${r.ic}"></span><div class="v">${r.v}</div><div class="k">${r.k}</div></div>`).join("");
  renderIcons($("#profileSummary"));
}
function renderTargetsSummary() {
  const p = state.profile;
  const tier = PACE_TIERS.find((x) => x.id === p.paceTier);
  const rows = [
    { ic: "flame", c: "t-amber", v: `${p.kcalTarget} kcal`, k: "Calories" },
    { ic: "dumbbell", c: "t-green", v: `${p.proteinTarget} g`, k: "Protein" },
    { ic: "drop", c: "t-blue", v: state.settings.waterEnabled ? `${p.waterTargetMl} ml` : "Off", k: "Water" },
    { ic: "pulse", c: "t-green", v: `${p.moveTarget} kcal`, k: "Active-calorie goal" },
    { ic: "run", c: "t-purple", v: ACTIVITY_LABELS[String(p.activity)] || p.activity, k: "Activity" },
    { ic: "target", c: "t-amber", v: tier ? tier.name : "Custom", k: "Pace" },
  ];
  $("#targetsSummary").innerHTML = rows.map((r) => `<div class="stat-box"><span class="ic ${r.c}" data-ic="${r.ic}"></span><div class="v">${r.v}</div><div class="k">${r.k}</div></div>`).join("");
  renderIcons($("#targetsSummary"));
}
function toggleProfileForm(show) {
  $("#profileForm").classList.toggle("hidden", !show);
  $("#profileSummary").classList.toggle("hidden", show);
}
function toggleTargetsForm(show) {
  $("#targetsForm").classList.toggle("hidden", !show);
  $("#targetsSummary").classList.toggle("hidden", show);
}
// Cancel discards unsaved edits by re-populating every field from the actual
// profile (renderSettings() is idempotent) before closing, so reopening the
// form later never shows stale leftover input.
$("#profileCancelBtn").addEventListener("click", () => { renderSettings(); toggleProfileForm(false); });
$("#targetsCancelBtn").addEventListener("click", () => { renderSettings(); toggleTargetsForm(false); });
// Long-press a card's non-interactive area to toggle its edit form — doesn't
// fire on buttons/inputs/the pace slider so it can't hijack normal taps or
// dragging. Two iOS-specific gotchas this guards against: (1) the actual
// toggle only runs on pointerup, never inside the hold timer — swapping the
// summary for the form *while the finger is still down* meant whatever now
// sat under the finger (often a freshly-revealed input) ate the eventual
// release as a tap, popping the keyboard; (2) user-select/touch-callout are
// disabled on the card so iOS's native "select this text" long-press gesture
// doesn't fire alongside our own and highlight text instead.
function longPress(el, callback, ms = 550) {
  if (!el) return;
  el.style.webkitUserSelect = "none";
  el.style.userSelect = "none";
  el.style.webkitTouchCallout = "none";
  let timer = null, moved = false, sx = 0, sy = 0, fired = false;
  el.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button, input, select, textarea, a, .slider")) return;
    moved = false; fired = false; sx = e.clientX; sy = e.clientY;
    e.preventDefault();
    timer = setTimeout(() => { if (!moved) { fired = true; haptic(); } }, ms);
  });
  el.addEventListener("pointermove", (e) => {
    if (Math.abs(e.clientX - sx) > 10 || Math.abs(e.clientY - sy) > 10) { moved = true; clearTimeout(timer); }
  });
  el.addEventListener("pointerup", () => {
    clearTimeout(timer);
    if (fired) callback();
    fired = false;
  });
  el.addEventListener("pointercancel", () => { clearTimeout(timer); fired = false; });
}
longPress($("#profileCard"), () => toggleProfileForm($("#profileForm").classList.contains("hidden")));
longPress($("#targetsCard"), () => toggleTargetsForm($("#targetsForm").classList.contains("hidden")));
$("#profileSave").addEventListener("click", () => {
  const p = state.profile, dob = $("#setDob").value;
  if (dob) { const a = ageFromDob(dob); if (a == null || a < 13 || a > 100) return toast("Enter a valid date of birth"); p.birthDate = dob; p.age = a; p.birthYear = fromKey(dob).getFullYear(); }
  p.sex = $("#setSex").value;
  const sw = parseFloat($("#setStartWeight").value);
  if (sw > 0) p.startWeightKg = sw;
  state.settings.shareName = $("#setShareName").value.trim().slice(0, 20);
  save(); toggleProfileForm(false); renderSettings(); renderToday(); toast("Profile saved");
});
$("#setWeekStart").addEventListener("change", () => {
  state.settings.weekStart = $("#setWeekStart").value;
  save(); renderScheduleWeek();
});
$("#scheduleSettingsBtn").addEventListener("click", openScheduleEdit);
// A reusable finger-tracking segmented slider: drag the thumb (or tap a label);
// the value follows the finger and commits on release.
function renderSlider(container, labels, index, onChange) {
  const n = labels.length;
  // Labels sit at the exact same i/(n-1) fraction as the thumb/stops (not
  // flexbox-even centers) so each label lines up with its stop on the track.
  const fracOf = (i) => (n > 1 ? (i / (n - 1)) * 100 : 0);
  const labelStyle = (i) => {
    const pct = fracOf(i);
    const tx = i === 0 ? "0%" : i === n - 1 ? "-100%" : "-50%";
    return `left:${pct}%;transform:translateX(${tx})`;
  };
  container.innerHTML = `
    <div class="slider-track">
      <div class="slider-fill"></div>
      ${labels.map((_, i) => `<span class="slider-stop" style="left:${fracOf(i)}%"></span>`).join("")}
      <div class="slider-thumb"></div>
    </div>
    <div class="slider-labels">${labels.map((l, i) => `<span class="slider-lab${i === index ? " active" : ""}" data-i="${i}" style="${labelStyle(i)}">${l}</span>`).join("")}</div>`;
  const track = container.querySelector(".slider-track");
  const thumb = container.querySelector(".slider-thumb");
  const fill = container.querySelector(".slider-fill");
  const labs = [...container.querySelectorAll(".slider-lab")];
  let cur = index, dragging = false;
  const setPos = (i) => {
    const pct = n > 1 ? (i / (n - 1)) * 100 : 0;
    thumb.style.left = pct + "%"; fill.style.width = pct + "%";
    labs.forEach((el, j) => el.classList.toggle("active", j === i));
  };
  setPos(index);
  const idxAt = (x) => { const r = track.getBoundingClientRect(); return clamp(Math.round((x - r.left) / r.width * (n - 1)), 0, n - 1); };
  const move = (x) => { const i = idxAt(x); if (i !== cur) { cur = i; setPos(i); haptic("light"); } };
  track.addEventListener("pointerdown", (e) => { dragging = true; try { track.setPointerCapture(e.pointerId); } catch (_) {} move(e.clientX); });
  track.addEventListener("pointermove", (e) => { if (dragging) move(e.clientX); });
  const end = () => { if (!dragging) return; dragging = false; onChange(cur); };
  track.addEventListener("pointerup", end);
  track.addEventListener("pointercancel", end);
  labs.forEach((el) => el.addEventListener("click", () => { cur = +el.dataset.i; setPos(cur); onChange(cur); }));
}
const PACE_SHORT = { sustainable: "Steady", moderate: "Moderate", aggressive: "Aggressive", verylow: "Very low" };
function renderPaceTiers() {
  const p = state.profile, t = tdee(), cw = currentWeight();
  const labels = PACE_TIERS.map((x) => PACE_SHORT[x.id] || x.name);
  let idx = PACE_TIERS.findIndex((x) => x.id === p.paceTier); if (idx < 0) idx = 0;
  renderSlider($("#paceTiers"), labels, idx, (i) => {
    // Only on an explicit pick do we retune the calorie/protein inputs.
    const tier = PACE_TIERS[i], kcal = Math.max(t - tier.deficit, kcalFloor(p.sex)), prot = r0(cw * tier.proteinPerKg);
    $("#setKcal").value = kcal; $("#setProtein").value = prot;
    $("#paceNote").textContent = `${tier.name} → ${kcal} kcal · ${prot} g protein. ${tier.note}`;
    p.paceTier = tier.id;
  });
  const cur = PACE_TIERS[idx];
  $("#paceNote").textContent = cur ? `${cur.name} — ${cur.note}` : "Slide to pick a pace, or set your own targets below.";
}
function isNativeApp() { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); }

async function applyReminder() {
  const r = state.settings.reminder;
  const LN = window.capacitorLocalNotifications && window.capacitorLocalNotifications.LocalNotifications;
  if (!isNativeApp() || !LN) { renderSettings(); return; }
  try {
    await LN.cancel({ notifications: [{ id: 1 }] });
    if (r.enabled) {
      const perm = await LN.requestPermissions();
      if (perm.display !== "granted") {
        toast("Notification permission denied");
        r.enabled = false; save();
      } else {
        const [h, m] = r.time.split(":").map(Number);
        await LN.schedule({ notifications: [{
          id: 1, title: "FitTrack", body: "Don't forget to log today!",
          schedule: { on: { hour: h, minute: m }, repeats: true },
        }] });
      }
    }
  } catch (e) { toast("Couldn't schedule reminder"); }
  renderSettings();
}
$("#setReminder").addEventListener("change", () => {
  state.settings.reminder.enabled = $("#setReminder").checked;
  save(); applyReminder();
});
async function applyWeeklyReview() {
  const r = state.settings.weeklyReview;
  const LN = window.capacitorLocalNotifications && window.capacitorLocalNotifications.LocalNotifications;
  if (!isNativeApp() || !LN) { renderSettings(); return; }
  try {
    await LN.cancel({ notifications: [{ id: 3 }] });
    if (r.enabled) {
      const perm = await LN.requestPermissions();
      if (perm.display !== "granted") {
        toast("Notification permission denied");
        r.enabled = false; save();
      } else {
        // Body includes your latest adaptive expenditure + suggested target when
        // there's enough data (refreshed every time the app reschedules this).
        let body = "Your weekly review is ready — open to see how this week went.";
        const e = state.profile ? adaptiveExpenditure() : null;
        if (e) { const rec = recommendedTarget(e.expenditure); body = `Weekly review ready. Expenditure ≈ ${e.expenditure} kcal/day, suggested target ${rec} kcal — open for the full picture.`; }
        // Sunday = weekday 1 in Capacitor's schedule.on.weekday
        await LN.schedule({ notifications: [{
          id: 3, title: "FitTrack", body,
          schedule: { on: { weekday: 1, hour: 18, minute: 0 }, repeats: true },
        }] });
      }
    }
  } catch (e) { toast("Couldn't schedule weekly review"); }
  renderSettings();
}
$("#setWeekly").addEventListener("change", () => {
  state.settings.weeklyReview.enabled = $("#setWeekly").checked;
  save(); applyWeeklyReview();
});
$("#setReminderTime").addEventListener("change", () => {
  state.settings.reminder.time = $("#setReminderTime").value;
  save(); if (state.settings.reminder.enabled) applyReminder();
});
let editingSuppId = null;
function resetSuppForm() {
  editingSuppId = null;
  $("#suppName").value = ""; $("#suppNote").value = "";
  $("#suppAddBtn").textContent = "Save supplement";
}
// Rows swipe left to reveal Edit + Delete (the drag handle stays outside the
// swiped content so reordering and swiping don't compete for the same
// gesture), and have a drag handle for reordering; name+note marquee-scrolls
// if it overflows.
function renderSuppSettings() {
  $("#suppSettingsList").innerHTML = state.supplements.length
    ? state.supplements.map((s) =>
        `<li data-id="${s.id}">
          <span class="drag-handle" data-drag><span class="ic" data-ic="grip"></span></span>
          <span class="row-label marquee-wrap"><span class="marquee-text">${esc(s.name)}${s.note ? " — " + esc(s.note) : ""}</span></span>
          <button class="fi-edit" data-id="${s.id}"><span class="ic" data-ic="pencil"></span></button>
          <button class="fi-del" data-id="${s.id}"><span class="ic" data-ic="x"></span></button>
        </li>`).join("")
    : `<li class="muted" style="border-top:none">No supplements yet — add one below.</li>`;
  renderIcons($("#suppSettingsList"));
  $$("#suppSettingsList .fi-edit").forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation();
    const s = state.supplements.find((x) => x.id === b.dataset.id); if (!s) return;
    editingSuppId = s.id;
    $("#suppName").value = s.name; $("#suppNote").value = s.note || "";
    $("#suppAddBtn").textContent = "Save changes";
    toggleSuppForm(true);
  }));
  $$("#suppSettingsList .fi-del").forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation();
    state.supplements = state.supplements.filter((s) => s.id !== b.dataset.id);
    if (editingSuppId === b.dataset.id) resetSuppForm();
    save(); renderSuppSettings();
  }));
  makeReorderable("#suppSettingsList", state.supplements, () => { save(); renderSuppSettings(); });
  makeSwipeable($("#suppSettingsList"));
  $$("#suppSettingsList .marquee-text").forEach(applyMarquee);
}
function toggleSuppForm(show) { $("#suppForm").classList.toggle("hidden", !show); if (!show) resetSuppForm(); }
$("#suppNewBtn").addEventListener("click", () => { resetSuppForm(); toggleSuppForm(true); });
$("#suppCancelBtn").addEventListener("click", () => toggleSuppForm(false));
$("#suppAddBtn").addEventListener("click", () => {
  const name = $("#suppName").value.trim();
  if (!name) return toast("Enter a name");
  const note = $("#suppNote").value.trim();
  if (editingSuppId) {
    const s = state.supplements.find((x) => x.id === editingSuppId);
    if (s) { s.name = name; s.note = note; }
    save(); toggleSuppForm(false); renderSuppSettings(); toast("Supplement updated");
  } else {
    state.supplements.push({ id: "s" + Date.now(), name, note });
    save(); toggleSuppForm(false); renderSuppSettings(); toast("Supplement added");
  }
});
$("#settingsSave").addEventListener("click", () => {
  const p = state.profile;
  p.activity = parseFloat($("#setActivity").value);
  const kcal = parseInt($("#setKcal").value, 10), floor = kcalFloor(p.sex);
  if (kcal && kcal < floor) { toast(`Minimum safe target: ${floor} kcal`); $("#setKcal").value = floor; return; }
  if (kcal && kcal !== p.kcalTarget) { p.kcalTarget = kcal; p.targetDeficit = Math.max(0, tdee() - kcal); recordTargetChange(kcal); }
  p.proteinTarget = parseInt($("#setProtein").value, 10) || p.proteinTarget;
  p.waterTargetMl = parseInt($("#setWater").value, 10) || p.waterTargetMl;
  p.moveTarget = parseInt($("#setMove").value, 10) || p.moveTarget;
  p.eatBack = $("#setEatBack").checked;
  p.autoAdjust = $("#setAutoAdjust").checked;
  state.settings.waterEnabled = $("#setWaterEnabled").checked;
  save(); toggleTargetsForm(false); renderSettings(); renderToday(); toast("Saved");
});
let editingGoalId = null;
function resetGoalForm() {
  editingGoalId = null;
  $("#goalLabel").value = ""; $("#goalTargetKg").value = ""; $("#goalDate").value = "";
  $("#goalAddBtn").textContent = "Save goal";
}
function toggleGoalForm(show) { $("#goalForm").classList.toggle("hidden", !show); }
$("#goalNewBtn").addEventListener("click", () => { resetGoalForm(); toggleGoalForm(true); });
$("#goalCancelBtn").addEventListener("click", () => { resetGoalForm(); toggleGoalForm(false); });
function renderGoalSettings() {
  const active = [...state.goals].filter((g) => !g.achievedOn).sort((a, b) => (a.date < b.date ? -1 : 1));
  const achieved = [...state.goals].filter((g) => g.achievedOn).sort((a, b) => (b.achievedOn < a.achievedOn ? -1 : 1));
  const row = (g) => `<li data-id="${g.id}"><span class="row-label"><span class="ic" data-ic="${g.achievedOn ? "check" : "target"}"></span>${esc(g.label)} — ${r1(g.targetKg)}kg ${g.achievedOn ? `· achieved ${fmtShort(g.achievedOn)}` : `by ${fmtShort(g.date)}`}</span>
     <button class="fi-edit" data-id="${g.id}"><span class="ic" data-ic="pencil"></span></button>
     <button class="fi-del" data-id="${g.id}"><span class="ic" data-ic="x"></span></button></li>`;
  $("#goalSettingsList").innerHTML = state.goals.length
    ? active.map(row).join("") + achieved.map(row).join("")
    : `<li class="muted" style="border-top:none">No goals yet — add one below.</li>`;
  renderIcons($("#goalSettingsList"));
  $$("#goalSettingsList .fi-edit").forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation();
    const g = state.goals.find((x) => x.id === b.dataset.id); if (!g) return;
    editingGoalId = g.id;
    $("#goalLabel").value = g.label; $("#goalTargetKg").value = g.targetKg; $("#goalDate").value = g.date;
    $("#goalAddBtn").textContent = "Save changes";
    toggleGoalForm(true);
  }));
  $$("#goalSettingsList .fi-del").forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation();
    state.goals = state.goals.filter((g) => g.id !== b.dataset.id);
    if (editingGoalId === b.dataset.id) resetGoalForm();
    save(); renderGoalSettings();
  }));
  makeSwipeable($("#goalSettingsList"));
}
$("#goalAddBtn").addEventListener("click", () => {
  const label = $("#goalLabel").value.trim() || "Goal";
  const targetKg = parseFloat($("#goalTargetKg").value);
  const date = $("#goalDate").value;
  if (!targetKg || !date) return toast("Enter a target weight and date");
  if (editingGoalId) {
    const g = state.goals.find((x) => x.id === editingGoalId);
    if (g) { g.label = label; g.targetKg = targetKg; g.date = date; }
    toast("Goal updated");
  } else {
    state.goals.push({ id: "g" + Date.now(), label, targetKg, date, created: todayKey() });
    toast("Goal added");
  }
  resetGoalForm(); toggleGoalForm(false); save(); renderGoalSettings();
});
$("#libraryKeySave").addEventListener("click", () => {
  state.settings.libraryKey = $("#setLibraryKey").value.trim();
  save();
  sharedFoods = null; // ownership depends on the key, so re-render from scratch
  renderSettings();
  toast(state.settings.libraryKey ? "Library key saved" : "Library key cleared");
});
$("#apiKeySave").addEventListener("click", () => { state.settings.apiKey = $("#setApiKey").value.trim(); save(); toast(state.settings.apiKey ? "API key saved" : "API key cleared"); });
$("#themeSeg").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; state.settings.theme = b.dataset.val; applyTheme(); save(); renderSettings(); });
function applyTheme() { document.documentElement.dataset.theme = state.settings.theme; const meta = $('meta[name="theme-color"]'); if (meta) meta.content = state.settings.theme === "dark" ? "#0b0b0d" : "#fafafa"; }
$("#setReduceMotion").addEventListener("change", () => {
  state.settings.reduceMotion = $("#setReduceMotion").checked;
  save(); applyMotionPref();
});
$("#setHaptics").addEventListener("change", () => {
  state.settings.haptics = $("#setHaptics").checked;
  save(); haptic();
});

function slugify(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "item"; }
// A plain <a download> click is a no-op in the native WKWebView shell — there's
// no browser download manager for it to hand off to, so the toast fired but
// nothing ever reached the Files app. Native path writes the JSON to a temp
// file via Filesystem then hands it to the OS share sheet (Share.share),
// where "Save to Files" actually persists it; web/PWA keeps the old
// blob-download since that genuinely works in a real browser tab.
async function shareTextFile(filename, text, label, mime) {
  if (isNativeApp() && window.capacitorFilesystem && window.capacitorShare) {
    try {
      const { Filesystem, Directory, Encoding } = window.capacitorFilesystem;
      const { Share } = window.capacitorShare;
      const { uri } = await Filesystem.writeFile({ path: filename, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
      await Share.share({ title: label || "FitTrack", url: uri });
    } catch (e) {
      toast("Share failed: " + (e.message || "error"));
    }
    return;
  }
  const blob = new Blob([text], { type: mime || "application/octet-stream" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); URL.revokeObjectURL(a.href);
}
async function shareItem(filename, obj, label) {
  await shareTextFile(filename, JSON.stringify(obj, null, 2), label, "application/json");
}
$("#exportBtn").addEventListener("click", async () => {
  // The JSON backup is the restorable one, so it's what resets the nudge.
  state.settings.lastBackup = new Date().toISOString();
  state.settings.backupSnoozeUntil = null;
  save();
  await shareItem(`fittrack-backup-${todayKey()}.json`, state, "FitTrack Backup");
  $("#backupInfo").textContent = backupStatusText();
  renderBackupBanner();
  toast("Backup exported (photos not included)");
});
// Spreadsheet export: one row per day from first log/weigh-in to today —
// covers everything the charts read so any analysis is reproducible outside
// the app. Values are blank (not 0) on days with nothing logged.
$("#exportCsvBtn").addEventListener("click", async () => {
  const csvEsc = (v) => { const s = String(v == null ? "" : v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const dw = dailyWeights(state.weights);
  const weightOf = {}; dw.forEach((w) => (weightOf[w.d] = r1(w.kg)));
  const waistOf = {}; state.waists.forEach((w) => (waistOf[w.d] = w.cm));
  const firstKeys = [Object.keys(state.logs).sort()[0], dw[0] && dw[0].d, state.profile.startDate].filter(Boolean).sort();
  let dk = firstKeys[0] || todayKey();
  const rows = [["date", "kcal", "protein_g", "carbs_g", "fat_g", "kcal_target", "active_kcal", "weight_kg", "waist_cm", "steps", "sleep_h", "water_ml", "note"]];
  let guard = 0;
  while (dk <= todayKey() && guard++ < 3700) {
    const t = dayTotals(dk), l = state.logs[dk] || {};
    const logged = t.items > 0;
    rows.push([
      dk,
      logged ? r0(t.kcal) : "", logged ? r1(t.p) : "", logged ? r1(t.c) : "", logged ? r1(t.f) : "",
      targetFor(dk), t.active ? r0(t.active) : "",
      weightOf[dk] != null ? weightOf[dk] : "", waistOf[dk] != null ? waistOf[dk] : "",
      l.steps != null ? l.steps : "", l.sleepH != null ? l.sleepH : "",
      l.waterMl ? l.waterMl : "", l.note || "",
    ]);
    dk = addDays(dk, 1);
  }
  const csv = rows.map((r) => r.map(csvEsc).join(",")).join("\r\n");
  await shareTextFile(`fittrack-export-${todayKey()}.csv`, csv, "FitTrack Export", "text/csv");
  toast(`Exported ${rows.length - 1} days as CSV`);
});
$("#importInput").addEventListener("change", async (e) => {
  const file = e.target.files[0]; if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.profile && data.logs) {
      if (!confirm("Replace ALL current data with this backup?")) return;
      localStorage.setItem(LS_KEY, JSON.stringify(data)); location.reload();
    } else if (data.fittrackShare === "food" && data.food) {
      const f = data.food;
      state.customFoods.unshift({ id: "c" + Date.now(), name: f.name, serving: f.serving || "100 g", kcal: f.kcal || 0, p: f.p || 0, c: f.c || 0, f: f.f || 0 });
      save(); renderFoodList();
      toast(`Added "${f.name}" to your custom foods`);
    } else if (data.fittrackShare === "workout" && data.workout) {
      const w = data.workout;
      state.workoutTemplates.push({ id: "wt" + Date.now(), name: w.name, ic: w.ic || "dumbbell", met: w.met || 6 });
      save(); renderWorkoutTemplateList(); renderScheduledWorkoutList();
      toast(`Added "${w.name}" to your workouts`);
    } else {
      throw new Error("not a FitTrack backup or shared item");
    }
  } catch (err) { toast("Import failed: " + err.message); }
  e.target.value = "";
});
$("#resetBtn").addEventListener("click", () => {
  if (!confirm("Delete ALL data? This cannot be undone.")) return;
  if (!confirm("Really sure? Export a backup first if in doubt.")) return;
  localStorage.removeItem(LS_KEY); indexedDB.deleteDatabase("fittrack-photos"); location.reload();
});

/* ---------- init ---------- */
$$(".tab").forEach((t) => t.addEventListener("click", () => switchView(t.dataset.view)));
function startApp() {
  // Keep age current from date of birth so it increments on its own.
  if (state.profile && state.profile.birthDate) state.profile.age = ageFromDob(state.profile.birthDate);
  else if (state.profile && state.profile.birthYear) state.profile.age = new Date().getFullYear() - state.profile.birthYear;
  $("#app").classList.remove("hidden"); applyTheme(); applyMotionPref(); renderIcons();
  maybeAutoAdjust();
  switchView("today");
  checkGoals();
  if (isNativeApp() && state.settings.reminder.enabled) applyReminder();
  if (isNativeApp() && state.settings.weeklyReview.enabled) applyWeeklyReview();
  maybeShowWhatsNew();
  maybeShowCelebration(); // resurface an undismissed goal celebration from last session
  checkForUpdate();
}

// iOS keeps the webview alive in the background for days, so an app reopened
// the next morning still had yesterday as "Today" — viewDate and every
// today-anchored render are only computed at script load. On every return to
// the foreground, detect the day rollover and re-render.
let lastActiveDay = todayKey();
function handleAppResume() {
  checkForUpdate(); // self-throttled
  const now = todayKey();
  if (now === lastActiveDay || !state.profile) { lastActiveDay = now; return; }
  // Snap to the new today unless the user had deliberately navigated to an
  // older day — browsing history should survive a backgrounding.
  if (viewDate >= lastActiveDay) viewDate = now;
  lastActiveDay = now;
  maybeAutoAdjust(); checkGoals();
  if (currentView === "today") renderToday();
  else if (currentView === "progress") renderProgress();
  else if (currentView === "training") renderTraining();
  else if (currentView === "body") renderBody();
  else if (currentView === "settings") renderSettings();
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") handleAppResume(); });

renderIcons();
if (state.profile) { applyTheme(); startApp(); } else { showOnboarding(); }

// Native app (Capacitor) bundles assets locally and works offline without a
// service worker. Unregister any leftover SW from an earlier PWA install.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations?.().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
}
