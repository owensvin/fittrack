/* ===== FitTrack ===== */
"use strict";

/* ---------- helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
const r0 = (n) => Math.round(n);
const r1 = (n) => Math.round(n * 10) / 10;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const APP_VERSION = "2.8";

function toKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fromKey(k) { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); }
function addDays(k, n) { const d = fromKey(k); d.setDate(d.getDate() + n); return toKey(d); }
function todayKey() { return toKey(new Date()); }
function daysBetween(k1, k2) { return Math.round((fromKey(k2) - fromKey(k1)) / 86400000); }
function fmtShort(k) { return fromKey(k).toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
function isWeekend(k) { const d = fromKey(k).getDay(); return d === 0 || d === 6; }

// Subtle native haptics; silently no-ops in the browser / if the plugin is missing.
function haptic(style) {
  try {
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

/* ---------- icons ---------- */
const ICONS = {
  chevL: '<polyline points="15 5 8 12 15 19"/>',
  chevR: '<polyline points="9 5 16 12 9 19"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  x: '<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>',
  check: '<polyline points="4 12 9 17 20 6"/>',
  drop: '<path d="M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z"/>',
  timer: '<circle cx="12" cy="13" r="8"/><line x1="12" y1="13" x2="12" y2="9"/><line x1="9" y1="2" x2="15" y2="2"/>',
  walk: '<circle cx="13" cy="4" r="1.6"/><path d="M11 8l3 1 2 3"/><path d="M11 8l-1 5 2 3 1 4"/><path d="M10 13l-3 1-1 3"/>',
  pill: '<rect x="3" y="9" width="18" height="6" rx="3" transform="rotate(-45 12 12)"/><line x1="8.5" y1="8.5" x2="15.5" y2="15.5"/>',
  scale: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 9a3 3 0 0 1 6 0"/><line x1="12" y1="9" x2="12" y2="6"/>',
  ruler: '<rect x="3" y="7" width="18" height="10" rx="2"/><line x1="8" y1="7" x2="8" y2="11"/><line x1="12" y1="7" x2="12" y2="12"/><line x1="16" y1="7" x2="16" y2="11"/>',
  camera: '<path d="M4 8h3l2-2h6l2 2h3v11H4z"/><circle cx="12" cy="13" r="3.2"/>',
  home: '<path d="M4 11l8-7 8 7"/><path d="M6 10v9h12v-9"/>',
  chart: '<line x1="5" y1="20" x2="5" y2="11"/><line x1="12" y1="20" x2="12" y2="5"/><line x1="19" y1="20" x2="19" y2="14"/>',
  person: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c0-4 3-6 7-6s7 2 7 6"/>',
  sliders: '<line x1="4" y1="8" x2="20" y2="8"/><line x1="4" y1="16" x2="20" y2="16"/><circle cx="9" cy="8" r="2.4" fill="var(--bg)"/><circle cx="15" cy="16" r="2.4" fill="var(--bg)"/>',
  barcode: '<line x1="4" y1="6" x2="4" y2="18"/><line x1="7" y1="6" x2="7" y2="18"/><line x1="10" y1="6" x2="10" y2="18"/><line x1="14" y1="6" x2="14" y2="18"/><line x1="17" y1="6" x2="17" y2="18"/><line x1="20" y1="6" x2="20" y2="18"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  bolt: '<polygon points="13 3 5 13 11 13 10 21 18 10 12 10"/>',
  flame: '<path d="M12 2c1 3-3 4-3 8a3 3 0 0 0 6 0c1.4 1 2 2.8 2 4.5a5 5 0 0 1-10 0C7 10 10 8 12 2z"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="0.6" fill="currentColor"/>',
  sunrise: '<circle cx="12" cy="14" r="4"/><line x1="12" y1="3" x2="12" y2="6"/><line x1="4" y1="14" x2="2" y2="14"/><line x1="22" y1="14" x2="20" y2="14"/><line x1="6" y1="8" x2="4.5" y2="6.5"/><line x1="19.5" y1="6.5" x2="18" y2="8"/><line x1="3" y1="20" x2="21" y2="20"/>',
  sun: '<circle cx="12" cy="12" r="4.5"/><line x1="12" y1="2" x2="12" y2="4.5"/><line x1="12" y1="19.5" x2="12" y2="22"/><line x1="2" y1="12" x2="4.5" y2="12"/><line x1="19.5" y1="12" x2="22" y2="12"/><line x1="4.9" y1="4.9" x2="6.6" y2="6.6"/><line x1="17.4" y1="17.4" x2="19.1" y2="19.1"/><line x1="4.9" y1="19.1" x2="6.6" y2="17.4"/><line x1="17.4" y1="6.6" x2="19.1" y2="4.9"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/>',
  bowl: '<path d="M4 12h16a8 4 0 0 1-16 0z"/><line x1="9" y1="8" x2="9" y2="10"/><line x1="12" y1="7" x2="12" y2="10"/><line x1="15" y1="8" x2="15" y2="10"/>',
  run: '<circle cx="14.5" cy="4.5" r="1.7"/><path d="M9 8l4 1.5 1.5 3.5-1 5"/><path d="M13 9.5L9 12l-3 5"/><path d="M13.5 13l3.5 1 2.5 4"/>',
  bike: '<circle cx="6" cy="17" r="3.2"/><circle cx="18" cy="17" r="3.2"/><path d="M6 17l4-9h4l4 9"/><path d="M10 8h4"/><path d="M10 17h8"/>',
  dumbbell: '<rect x="3" y="9.5" width="3" height="5" rx="1"/><rect x="18" y="9.5" width="3" height="5" rx="1"/><line x1="6" y1="12" x2="18" y2="12"/><rect x="7" y="7.5" width="2.4" height="9" rx="0.8"/><rect x="14.6" y="7.5" width="2.4" height="9" rx="0.8"/>',
  wave: '<path d="M2 10c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M2 15c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>',
  lotus: '<path d="M12 21c-4-1.5-6-4.5-6-8 2 1 4 1 6 0 2 1 4 1 6 0 0 3.5-2 6.5-6 8z"/><path d="M12 13c-2-3-2-6 0-9 2 3 2 6 0 9z"/>',
  ball: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18M6 6l12 12M18 6L6 18"/>',
  ellipse: '<circle cx="12" cy="12" r="9"/><path d="M4 15c3 2 13 2 16 0"/><path d="M4 9c3-2 13-2 16 0"/>',
  bell: '<path d="M6 17h12l-1.5-2.5V10a4.5 4.5 0 0 0-9 0v4.5z"/><path d="M9.5 19a2.5 2.5 0 0 0 5 0"/>',
  expand: '<polyline points="9 4 4 4 4 9"/><polyline points="15 4 20 4 20 9"/><polyline points="4 15 4 20 9 20"/><polyline points="20 15 20 20 15 20"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0"/><line x1="12" y1="18" x2="12" y2="21"/>',
  pulse: '<polyline points="3 12 7.5 12 10 5.5 14 18.5 16.5 12 21 12"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  info: '<circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><circle cx="12" cy="7.5" r="0.9" fill="currentColor"/>',
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
/* ---------- state ---------- */
const LS_KEY = "fittrack";
let state = loadState();
let viewDate = todayKey();

function defaultState() {
  return {
    profile: null,
    logs: {},        // dateKey -> {meals, waterMl, walks:[], supps:{}}
    weights: [], waists: [],
    customFoods: [], favs: [], recents: [],
    goals: [],
    supplements: defaultSupplements(),
    settings: { theme: "dark", apiKey: "", reminder: { enabled: false, time: "19:00" }, waterEnabled: true, reduceMotion: false, timer: { mode: "emom", emomInt: 60, emomRounds: 10, amrapMins: 10 } },
  };
}
function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const s = Object.assign(defaultState(), JSON.parse(raw));
      if (!s.supplements || !s.supplements.length) s.supplements = defaultSupplements();
      if (!s.settings.reminder) s.settings.reminder = { enabled: false, time: "19:00" };
      if (s.settings.waterEnabled === undefined) s.settings.waterEnabled = true;
      if (s.settings.reduceMotion === undefined) s.settings.reduceMotion = false;
      if (!s.settings.timer) s.settings.timer = { mode: "emom", emomInt: 60, emomRounds: 10, amrapMins: 10 };
      if (!s.goals || !s.goals.length) {
        s.goals = [];
        const p = s.profile;
        if (p && p.sprintGoalKg) s.goals.push({ id: "g1", label: "Short-term", targetKg: p.sprintGoalKg, date: p.sprintDate });
        if (p && p.longGoalKg) s.goals.push({ id: "g2", label: "Long-term", targetKg: p.longGoalKg, date: p.longDate });
      }
      return s;
    }
  } catch (e) { console.error("load failed", e); }
  return defaultState();
}
function save() { localStorage.setItem(LS_KEY, JSON.stringify(state)); }

function dayLog(k) {
  if (!state.logs[k]) state.logs[k] = { meals: { breakfast: [], lunch: [], dinner: [], snacks: [] }, waterMl: 0, walks: [], supps: {} };
  const l = state.logs[k];
  if (!l.walks) l.walks = [];
  if (!l.supps) l.supps = {};
  return l;
}
function dayTotals(k) {
  const log = state.logs[k];
  const t = { kcal: 0, p: 0, c: 0, f: 0, items: 0, active: 0 };
  if (!log) return t;
  for (const m of MEALS) for (const it of (log.meals[m.id] || [])) {
    t.kcal += it.kcal; t.p += it.p || 0; t.c += it.c || 0; t.f += it.f || 0; t.items++;
  }
  for (const w of (log.walks || [])) t.active += w.kcal;
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
  streak: { title: "Streak & adherence", body: "Your streak counts consecutive days you logged food and stayed within your calorie budget. Adherence % is simply the days you logged divided by the days in that period — it doesn't require hitting your target, just showing up." },
};
function openInfo(key) {
  const g = GLOSSARY[key]; if (!g) return;
  $("#infoPopupTitle").textContent = g.title;
  $("#infoPopupBody").textContent = g.body;
  $("#infoPopup").classList.remove("hidden");
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-info]");
  if (b) openInfo(b.dataset.info);
});
$("#infoPopupClose").addEventListener("click", () => $("#infoPopup").classList.add("hidden"));
$("#infoPopup").addEventListener("click", (e) => { if (e.target.id === "infoPopup") $("#infoPopup").classList.add("hidden"); });
function renderGlossary() {
  $("#glossaryList").innerHTML = Object.keys(GLOSSARY).map((key) =>
    `<li data-info="${key}"><span class="row-label">${esc(GLOSSARY[key].title)}</span><span class="ic" data-ic="chevR"></span></li>`).join("");
  renderIcons($("#glossaryList"));
}
function budgetFor(k) {
  const p = state.profile;
  return p.kcalTarget + (p.eatBack ? dayTotals(k).active : 0);
}

function movingAvg(entries, w = 7) {
  return entries.map((e) => {
    const from = addDays(e.d, -(w - 1));
    const win = entries.filter((x) => x.d >= from && x.d <= e.d);
    return { d: e.d, v: win.reduce((s, x) => s + x.kg, 0) / win.length };
  });
}
function weightTrendPerDay() {
  const ma = movingAvg(state.weights);
  const cutoff = addDays(todayKey(), -14);
  const pts = ma.filter((e) => e.d >= cutoff);
  if (pts.length < 3) return null;
  const x0 = pts[0].d, xs = pts.map((p) => daysBetween(x0, p.d)), ys = pts.map((p) => p.v);
  const n = xs.length, sx = xs.reduce((a, b) => a + b), sy = ys.reduce((a, b) => a + b);
  const sxy = xs.reduce((s, x, i) => s + x * ys[i], 0), sxx = xs.reduce((s, x) => s + x * x, 0);
  const den = n * sxx - sx * sx;
  return den ? (n * sxy - sx * sy) / den : null;
}

/* ---------- onboarding ---------- */
const ob = { step: 0, sex: "male", activity: 1.2, deficit: 750, supplements: [] };
function showOnboarding() {
  $("#onboarding").classList.remove("hidden");
  const sprint = new Date(); sprint.setDate(sprint.getDate() + 14);
  const long = new Date(); long.setMonth(long.getMonth() + 6);
  $("#obSprintD").value = toKey(sprint);
  $("#obLongD").value = toKey(long);
  $("#obSex").addEventListener("click", (e) => segPick(e, "#obSex", (v) => (ob.sex = v)));
  $("#obActivity").addEventListener("click", (e) => segPick(e, "#obActivity", (v) => (ob.activity = parseFloat(v))));
  $("#obPace").addEventListener("click", (e) => segPick(e, "#obPace", (v) => { ob.deficit = parseInt(v, 10); obSummary(); }));
  $("#obNext").addEventListener("click", obNext);
  $("#obBack").addEventListener("click", () => obGo(ob.step - 1));
  $("#obSuppAdd").addEventListener("click", () => {
    const name = $("#obSuppName").value.trim();
    if (!name) return toast("Enter a name");
    ob.supplements.push({ id: "s" + Date.now(), name, note: $("#obSuppNote").value.trim() });
    $("#obSuppName").value = ""; $("#obSuppNote").value = "";
    renderObSupps();
  });
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
function obNext() {
  if (ob.step === 0 && !(parseInt($("#obAge").value, 10) >= 14)) return toast("Enter your age");
  if (ob.step === 1) {
    if (!parseFloat($("#obHeight").value) || !parseFloat($("#obWeight").value)) return toast("Enter height and weight");
  }
  if (ob.step === 2) {
    if (!parseFloat($("#obSprintW").value) || !parseFloat($("#obLongW").value)) return toast("Enter your goals");
  }
  if (ob.step === 4) return obFinish();
  obGo(ob.step + 1);
}
function obGo(n) {
  ob.step = clamp(n, 0, 4);
  $$(".ob-step").forEach((s) => s.classList.toggle("hidden", +s.dataset.step !== ob.step));
  $("#obBack").classList.toggle("hidden", ob.step === 0);
  $("#obNext").textContent = ob.step === 4 ? "Start" : "Continue";
  $("#obBar").style.width = (ob.step + 1) * 20 + "%";
  if (ob.step === 3) {
    const t = r0(bmr(ob.sex, parseFloat($("#obWeight").value), parseFloat($("#obHeight").value), parseInt($("#obAge").value, 10)) * ob.activity);
    $("#obTdee").textContent = t;
    obSummary();
  }
}
function obSummary() {
  const w = parseFloat($("#obWeight").value), h = parseFloat($("#obHeight").value), age = parseInt($("#obAge").value, 10);
  const t = r0(bmr(ob.sex, w, h, age) * ob.activity);
  let target = t - ob.deficit, floorNote = "";
  const floor = kcalFloor(ob.sex);
  if (target < floor) { target = floor; floorNote = `<br>⚠️ Capped at ${floor} kcal — safe minimum.`; }
  const protein = r0(w * 1.6);
  $("#obSummary").innerHTML =
    `Daily target: <strong>${target} kcal</strong> · Protein: <strong>${protein} g</strong>${floorNote}`;
}
function obFinish() {
  const w = parseFloat($("#obWeight").value), h = parseFloat($("#obHeight").value), age = parseInt($("#obAge").value, 10);
  const t = r0(bmr(ob.sex, w, h, age) * ob.activity);
  state.profile = {
    sex: ob.sex, age, heightCm: h, startWeightKg: w, startDate: todayKey(), activity: ob.activity,
    kcalTarget: Math.max(t - ob.deficit, kcalFloor(ob.sex)),
    proteinTarget: r0(w * 1.6), waterTargetMl: 2500, moveTarget: 200, eatBack: false,
  };
  state.goals = [
    { id: "g" + Date.now(), label: "Short-term", targetKg: parseFloat($("#obSprintW").value), date: $("#obSprintD").value },
    { id: "g" + (Date.now() + 1), label: "Long-term", targetKg: parseFloat($("#obLongW").value), date: $("#obLongD").value },
  ];
  state.weights.push({ d: todayKey(), kg: w });
  if (ob.supplements.length) state.supplements = ob.supplements;
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
(function setupTabSwipe() {
  const bar = $(".tabbar");
  let sx = 0, sy = 0, tracking = false;
  bar.addEventListener("touchstart", (e) => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; tracking = true; }, { passive: true });
  bar.addEventListener("touchend", (e) => {
    if (!tracking) return; tracking = false;
    const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const current = $(".tab.active").dataset.view;
    let idx = TAB_ORDER.indexOf(current);
    idx = dx < 0 ? Math.min(idx + 1, TAB_ORDER.length - 1) : Math.max(idx - 1, 0);
    if (TAB_ORDER[idx] !== current) switchView(TAB_ORDER[idx]);
  }, { passive: true });
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
function drawRings(m) {
  const cx = 95, cy = 95;
  const rings = [
    { r: 83, pct: m.cal, color: "var(--amber)" },
    { r: 65, pct: m.pro, color: "var(--accent)" },
    { r: 47, pct: m.mov, color: "var(--blue)" },
  ];
  let circles = "";
  rings.forEach((rg) => {
    const C = 2 * Math.PI * rg.r, pct = clamp(rg.pct, 0, 1);
    circles += `<circle cx="${cx}" cy="${cy}" r="${rg.r}" fill="none" stroke="var(--track)" stroke-width="12"/>`;
    circles += `<circle cx="${cx}" cy="${cy}" r="${rg.r}" fill="none" stroke="${rg.color}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}"/>`;
  });
  $("#ringsWrap").innerHTML =
    `<svg viewBox="0 0 190 190">${circles}</svg>
     <div class="rings-center">
       <span class="big ${m.remaining < 0 ? "over" : ""}">${r0(Math.abs(m.remaining))}</span>
       <label>${m.remaining < 0 ? "OVER" : "kcal left"}</label>
     </div>`;
}
function renderStats(k) {
  const m = ringMetrics(k), p = state.profile;
  drawRings(m);
  $("#ringLegend").innerHTML = [
    { lab: "Calories", val: `${r0(m.t.kcal)}/${r0(m.budget)}`, c: "var(--amber)" },
    { lab: "Protein", val: `${r0(m.t.p)}/${p.proteinTarget}g`, c: "var(--accent)" },
    { lab: "Active", val: `${r0(m.t.active)}/${p.moveTarget}`, c: "var(--blue)" },
  ].map((x) => `<div class="rl-item"><span class="rl-dot" style="background:${x.c}"></span><span class="rl-val">${x.val}</span><span class="rl-lab">${x.lab}</span></div>`).join("");
}

/* ---------- streak ---------- */
function dayComplete(k) { const t = dayTotals(k); return t.items > 0 && t.kcal <= budgetFor(k); }
function streak() {
  let s = 0, k = todayKey();
  if (!dayComplete(k)) k = addDays(k, -1);
  while (dayComplete(k)) { s++; k = addDays(k, -1); }
  return s;
}

/* ---------- Today ---------- */
function defaultMealForNow() {
  const h = new Date().getHours();
  if (h < 11) return "breakfast";
  if (h < 16) return "lunch";
  if (h < 21) return "dinner";
  return "snacks";
}
function renderToday() {
  const k = viewDate, isToday = k === todayKey();
  $("#dayLabel").textContent = isToday ? "Today" : k === addDays(todayKey(), -1) ? "Yesterday" : fromKey(k).toLocaleDateString(undefined, { weekday: "long" });
  $("#daySub").textContent = fromKey(k).toLocaleDateString(undefined, { month: "long", day: "numeric" });
  $("#dayNext").disabled = isToday;

  renderStats(k);

  const s = streak();
  $("#streakLine").textContent = s > 0 ? `${s}-day on-target streak` : "Log today to start a streak";

  const prev = state.logs[addDays(k, -1)];
  const prevHasMeals = !!prev && MEALS.some((m) => (prev.meals[m.id] || []).length);
  const todayHasMeals = MEALS.some((m) => (dayLog(k).meals[m.id] || []).length);
  $("#copyYesterdayBtn").classList.toggle("hidden", !prevHasMeals || todayHasMeals);

  renderQuickRow();
  renderMeals(k);
  renderExercises(k);
  renderWater(k);
  renderSupps(k);
  renderFasting();
}
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
  $("#quickMore").addEventListener("click", () => openFoodSheet(defaultMealForNow()));
}

function renderMeals(k) {
  const log = dayLog(k);
  $("#mealList").innerHTML = MEALS.map((mm) => {
    const items = log.meals[mm.id] || [];
    const kcal = items.reduce((s, i) => s + i.kcal, 0);
    return `<section class="card meal-card">
      <div class="meal-head">
        <h3><span class="ic meal-ic" data-ic="${mm.ic}"></span>${mm.label}</h3>
        <span class="meal-kcal">${items.length ? r0(kcal) + " kcal" : ""}</span>
        <button class="add-btn" data-meal="${mm.id}"><span class="ic" data-ic="plus"></span></button>
      </div>
      ${items.length ? `<ul class="meal-items">` + items.map((it, i) =>
        `<li data-meal="${mm.id}" data-i="${i}"><span class="fi-name">${esc(it.name)} <span class="fi-qty">${esc(it.qtyLabel || "")}</span></span>
         <span class="fi-kcal">${r0(it.kcal)}</span>
         <button class="fi-del" data-meal="${mm.id}" data-i="${i}"><span class="ic" data-ic="x"></span></button></li>`).join("") + `</ul>` : ""}
    </section>`;
  }).join("");
  renderIcons($("#mealList"));
  $$("#mealList .add-btn").forEach((b) => b.addEventListener("click", () => openFoodSheet(b.dataset.meal)));
  $$("#mealList .meal-items li").forEach((li) => li.addEventListener("click", () => openEditFood(li.dataset.meal, +li.dataset.i)));
  $$("#mealList .fi-del").forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation();
    log.meals[b.dataset.meal].splice(+b.dataset.i, 1); save(); renderToday();
  }));
}

function renderExercises(k) {
  const log = dayLog(k);
  const walks = log.walks || [];
  $("#exerciseList").innerHTML = walks.map((w, i) =>
    `<li><span class="ic" data-ic="${w.ic || "walk"}"></span><span class="fi-name">${esc(w.name)} <span class="fi-qty">${w.mins} min</span></span>
     <span class="fi-kcal">−${r0(w.kcal)}</span>
     <button class="fi-del" data-i="${i}"><span class="ic" data-ic="x"></span></button></li>`).join("");
  renderIcons($("#exerciseList"));
  const total = walks.reduce((s, w) => s + w.kcal, 0);
  $("#exerciseSummary").textContent = walks.length
    ? `${walks.length} ${walks.length === 1 ? "activity" : "activities"} · ${r0(total)} kcal burned${isWeekend(k) ? " · rest day" : ""}`
    : (isWeekend(k) ? "Weekend rest day — nice." : "No activity logged yet");
  $$("#exerciseList .fi-del").forEach((b) => b.addEventListener("click", () => {
    log.walks.splice(+b.dataset.i, 1); save(); renderToday();
  }));
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
      <div class="sc-main"><div class="sc-name">${esc(s.name)}</div>${sub ? `<div class="sc-sub">${esc(sub)}</div>` : ""}</div>
    </div>`;
  }).join("");
  renderIcons($("#suppList"));
  const done = state.supplements.filter((s) => log.supps[s.id]).length;
  $("#suppCount").textContent = `${done} / ${state.supplements.length}`;
  $$("#suppList .supp-chip").forEach((chip) => chip.addEventListener("click", () => {
    const id = chip.dataset.sid;
    log.supps[id] = !log.supps[id];
    if (log.supps[id]) haptic("light");
    save(); renderSupps(viewDate);
  }));
}

/* water / day nav */
$("#waterPlus").addEventListener("click", () => { const l = dayLog(viewDate); l.waterMl = (l.waterMl || 0) + 250; save(); renderToday(); });
$("#waterMinus").addEventListener("click", () => { const l = dayLog(viewDate); l.waterMl = Math.max(0, (l.waterMl || 0) - 250); save(); renderToday(); });
$("#dayPrev").addEventListener("click", () => { viewDate = addDays(viewDate, -1); renderToday(); });
$("#dayNext").addEventListener("click", () => { if (viewDate < todayKey()) { viewDate = addDays(viewDate, 1); renderToday(); } });

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
$("#exerciseAddBtn").addEventListener("click", () => {
  $("#exerciseListPicker").innerHTML = EXERCISES.map((e, i) =>
    `<button class="food-row" data-i="${i}"><span class="ic fr-ic" data-ic="${e.ic}"></span>
     <div class="fr-main"><div class="fr-name">${e.name}</div><div class="fr-sub">${r0(e.met * currentWeight() * 0.5)} kcal / 30 min</div></div></button>`).join("");
  renderIcons($("#exerciseListPicker"));
  $$("#exerciseListPicker .food-row").forEach((el) => el.addEventListener("click", () => openExDetail(EXERCISES[+el.dataset.i])));
  $("#exerciseSheet").classList.remove("hidden");
});
$("#exerciseClose").addEventListener("click", () => $("#exerciseSheet").classList.add("hidden"));
$("#exerciseSheet").addEventListener("click", (e) => { if (e.target.id === "exerciseSheet") $("#exerciseSheet").classList.add("hidden"); });
function exKcal(mins) { return exSel.met * currentWeight() * (mins / 60); }
function openExDetail(ex) {
  exSel = ex;
  $("#exDetailName").textContent = ex.name;
  $("#exMins").value = 30;
  $$("#exDurChips button").forEach((b) => b.classList.toggle("active", b.dataset.min === "30"));
  updateExPreview();
  $("#exDetailSheet").classList.remove("hidden");
}
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
$("#exDetailClose").addEventListener("click", () => $("#exDetailSheet").classList.add("hidden"));
$("#exDetailSheet").addEventListener("click", (e) => { if (e.target.id === "exDetailSheet") $("#exDetailSheet").classList.add("hidden"); });
$("#exAdd").addEventListener("click", () => {
  const mins = parseInt($("#exMins").value, 10) || 0;
  if (mins <= 0) return;
  haptic();
  dayLog(viewDate).walks.push({ name: exSel.name, ic: exSel.ic, mins, kcal: exKcal(mins) });
  save();
  $("#exDetailSheet").classList.add("hidden"); $("#exerciseSheet").classList.add("hidden");
  renderToday(); toast(`Logged ${exSel.name}`);
});

/* ---------- food sheet ---------- */
let sheetMeal = "breakfast", sheetTab = "all", offResults = [], offLoading = false;
function openFoodSheet(meal) {
  sheetMeal = meal; sheetTab = "all"; offResults = [];
  $("#sheetTitle").textContent = "Add to " + meal.charAt(0).toUpperCase() + meal.slice(1);
  $("#foodSearch").value = "";
  $$("#foodTabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === "all"));
  $("#foodSheet").classList.remove("hidden");
  renderFoodList();
}
$("#sheetClose").addEventListener("click", () => $("#foodSheet").classList.add("hidden"));
$("#foodSheet").addEventListener("click", (e) => { if (e.target.id === "foodSheet") $("#foodSheet").classList.add("hidden"); });
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

function allLocalFoods() { return [...state.customFoods, ...FOOD_DB]; }
function renderFoodList() {
  if (sheetTab === "online") return renderOFFList();
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
  $("#foodList").innerHTML = shown.map((f, i) => {
    const fav = state.favs.includes(f.id);
    return `<button class="food-row" data-i="${i}">
      <div class="fr-main"><div class="fr-name">${esc(f.name)}</div><div class="fr-sub">${esc(f.serving || "")}${f.p ? ` · P ${r1(f.p)}g` : ""}</div></div>
      <span class="fr-kcal">${r0(f.kcal)}</span>
      ${f.id ? `<span class="fav-btn ${fav ? "on" : ""}" data-fav="${f.id}">${fav ? "★" : "☆"}</span>` : ""}
      ${sheetTab === "custom" ? `<span class="fav-btn" data-editc="${f.id}">✎</span><span class="fav-btn" data-delc="${f.id}">✕</span>` : ""}</button>`;
  }).join("");
  $$("#foodList .food-row").forEach((el) => el.addEventListener("click", (e) => {
    const fav = e.target.dataset.fav, del = e.target.dataset.delc, editc = e.target.dataset.editc;
    if (editc) { openEditCustomFood(editc); return; }
    if (fav) { const ix = state.favs.indexOf(fav); ix >= 0 ? state.favs.splice(ix, 1) : state.favs.push(fav); save(); renderFoodList(); return; }
    if (del) { state.customFoods = state.customFoods.filter((c) => c.id !== del); save(); renderFoodList(); return; }
    openDetail(shown[+el.dataset.i], "serving");
  }));
}

/* Open Food Facts */
async function searchOFF() {
  const q = $("#foodSearch").value.trim();
  if (!q) { $("#foodList").innerHTML = `<div class="food-empty">Type a food name to search Open Food Facts.</div>`; return; }
  offLoading = true; $("#foodList").innerHTML = `<div class="food-empty">Searching…</div>`;
  try {
    const url = "https://world.openfoodfacts.org/cgi/search.pl?action=process&search_simple=1&json=1&page_size=25&fields=product_name,brands,nutriments&search_terms=" + encodeURIComponent(q);
    const data = await (await fetch(url)).json();
    offResults = (data.products || []).filter((p) => p.product_name && p.nutriments && p.nutriments["energy-kcal_100g"] != null)
      .map((p) => ({ name: p.product_name.slice(0, 60), brand: (p.brands || "").split(",")[0], kcal: +p.nutriments["energy-kcal_100g"] || 0, p: +p.nutriments["proteins_100g"] || 0, c: +p.nutriments["carbohydrates_100g"] || 0, f: +p.nutriments["fat_100g"] || 0 }));
  } catch (e) { offResults = []; $("#foodList").innerHTML = `<div class="food-empty">Search failed — are you online?</div>`; offLoading = false; return; }
  offLoading = false; renderOFFList();
}
function renderOFFList() {
  if (offLoading) return;
  if (!offResults.length) { $("#foodList").innerHTML = `<div class="food-empty">Search the Open Food Facts database<br>(needs internet — values per 100 g).</div>`; return; }
  $("#foodList").innerHTML = offResults.map((f, i) =>
    `<button class="food-row" data-i="${i}"><div class="fr-main"><div class="fr-name">${esc(f.name)}</div><div class="fr-sub">${esc(f.brand || "Open Food Facts")} · per 100 g · P ${r1(f.p)}g</div></div><span class="fr-kcal">${r0(f.kcal)}</span></button>`).join("");
  $$("#foodList .food-row").forEach((el) => el.addEventListener("click", () => openDetail(offResults[+el.dataset.i], "per100")));
}

/* ---------- detail / qty ---------- */
let detail = null;
// Pull a per-serving gram weight out of serving strings like "1 large (50 g)" or "40 g".
function servingGrams(food) {
  const m = /([\d.]+)\s*g\b/.exec(food.serving || "");
  return m ? parseFloat(m[1]) : null;
}
function openDetail(food, mode) {
  detail = { food, mode, unit: mode === "per100" ? "g" : "serv", grams: servingGrams(food) };
  $("#detailName").textContent = food.name;
  $("#detailServing").textContent = mode === "per100" ? `${r0(food.kcal)} kcal per 100 g${food.brand ? " · " + food.brand : ""}` : `${r0(food.kcal)} kcal per ${food.serving || "serving"}`;
  $("#detailUnitSeg").classList.toggle("hidden", !(mode === "serving" && detail.grams));
  $$("#detailUnitSeg button").forEach((b) => b.classList.toggle("active", b.dataset.val === "serv"));
  applyDetailUnit();
  $("#detailTime").value = nowTimeStr();
  $("#detailSheet").classList.remove("hidden");
}
function applyDetailUnit() {
  if (detail.mode === "per100") {
    $("#qtyInput").value = 100; $("#qtyInput").step = 10; $("#qtyUnit").textContent = "g";
  } else if (detail.unit === "g") {
    $("#qtyInput").value = detail.grams; $("#qtyInput").step = 5; $("#qtyUnit").textContent = "g";
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
function detailFactor() {
  const q = parseFloat($("#qtyInput").value) || 0;
  if (detail.mode === "per100") return q / 100;
  if (detail.unit === "g" && detail.grams) return q / detail.grams;
  return q;
}
function updateMacroPreview() {
  const f = detail.food, k = detailFactor();
  $("#macroPreview").innerHTML = `<div><span>${r0(f.kcal * k)}</span><label>kcal</label></div><div><span>${r1((f.p || 0) * k)}</span><label>protein</label></div><div><span>${r1((f.f || 0) * k)}</span><label>fat</label></div><div><span>${r1((f.c || 0) * k)}</span><label>carbs</label></div>`;
}
$("#qtyInput").addEventListener("input", updateMacroPreview);
function detailStep() { return detail.mode === "per100" ? 10 : detail.unit === "g" ? 5 : 0.5; }
$("#qtyMinus").addEventListener("click", () => { const i = $("#qtyInput"), st = detailStep(); i.value = Math.max(st, (parseFloat(i.value) || 0) - st); updateMacroPreview(); });
$("#qtyPlus").addEventListener("click", () => { const i = $("#qtyInput"), st = detailStep(); i.value = (parseFloat(i.value) || 0) + st; updateMacroPreview(); });
$("#detailClose").addEventListener("click", () => $("#detailSheet").classList.add("hidden"));
$("#detailSheet").addEventListener("click", (e) => { if (e.target.id === "detailSheet") $("#detailSheet").classList.add("hidden"); });
$("#detailAdd").addEventListener("click", () => {
  const f = detail.food, k = detailFactor(); if (k <= 0) return;
  const qtyLabel = detail.mode === "per100" ? `${r0(k * 100)} g`
    : detail.unit === "g" ? `${r0(parseFloat($("#qtyInput").value) || 0)} g`
    : (k === 1 ? (f.serving || "") : `${k} × ${f.serving || "serving"}`);
  const ts = timeToTs(viewDate, $("#detailTime").value);
  addFoodItem({ name: f.name, kcal: f.kcal * k, p: (f.p || 0) * k, c: (f.c || 0) * k, f: (f.f || 0) * k, qtyLabel, ts }, f);
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
const KJ_PER_KCAL = 4.184;
let qCustomMode = "simple", customIngredients = [], ingBasis = "100g", calUnit = "kcal";
let totalWTouched = false, servWTouched = false;
function openQuick(mode, prefill) {
  quickMode = mode;
  $("#quickTitle").textContent = mode === "custom" ? "New custom food" : mode === "ai" ? "AI estimate" : mode === "edit" ? "Edit food" : "Quick add";
  $("#qServingWrap").classList.toggle("hidden", mode !== "custom");
  $("#qNote").classList.toggle("hidden", mode !== "ai");
  $("#qCustomModeSeg").classList.toggle("hidden", mode !== "custom");
  $("#qTimeWrap").classList.toggle("hidden", mode === "custom");
  $("#qTime").value = (prefill && prefill.ts) ? tsToTimeStr(prefill.ts) : nowTimeStr();
  aiServingG = (mode === "ai" && prefill && prefill.serving_g) ? prefill.serving_g : 0;
  if (mode === "ai") $("#qNote").textContent = (aiServingG ? `≈ ${aiServingG} g portion. ` : "") + "AI's best guess — tweak anything, then add.";
  ["qName", "qKcal", "qProt", "qCarb", "qFat", "qServing", "mealTotalWeight", "mealServingWeight"].forEach((id) => ($("#" + id).value = ""));
  if (prefill) { $("#qName").value = prefill.name || ""; $("#qKcal").value = prefill.kcal || ""; $("#qProt").value = prefill.p || ""; $("#qCarb").value = prefill.c || ""; $("#qFat").value = prefill.f || ""; }
  $("#quickSave").textContent = mode === "custom" ? "Save food" : mode === "edit" ? "Save changes" : "Add";
  customIngredients = []; ingBasis = "100g"; totalWTouched = false; servWTouched = false; editingCustomFoodId = null;
  $$("#ingBasisChips button").forEach((b) => b.classList.toggle("active", b.dataset.basis === "100g"));
  $("#ingQtyLabelText").textContent = "Qty (g)"; $("#ingQty").placeholder = "100";
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
$("#ingBasisChips").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  ingBasis = b.dataset.basis;
  $$("#ingBasisChips button").forEach((x) => x.classList.toggle("active", x === b));
  $("#ingQtyLabelText").textContent = ingBasis === "100g" ? "Qty (g)" : "Servings";
  $("#ingQty").placeholder = ingBasis === "100g" ? "100" : "1";
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
  $$("#ingredientList .fi-del").forEach((b) => b.addEventListener("click", () => {
    customIngredients.splice(+b.dataset.i, 1); renderIngredientList();
  }));
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
  $("#ingTotals").innerHTML = `<div><span>${r0(per.kcal)}</span><label>kcal</label></div><div><span>${r1(per.p)}</span><label>protein</label></div><div><span>${r1(per.f)}</span><label>fat</label></div><div><span>${r1(per.c)}</span><label>carbs</label></div>`;
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
  renderIngredientList();
});
function openEditFood(mealId, i) {
  const item = dayLog(viewDate).meals[mealId][i];
  editTarget = { mealId, i };
  openQuick("edit", { name: item.name, kcal: item.kcal, p: item.p, c: item.c, f: item.f, ts: item.ts });
}
$("#quickAddBtn").addEventListener("click", () => openQuick("quick"));
$("#customFoodBtn").addEventListener("click", () => openQuick("custom"));
$("#quickClose").addEventListener("click", () => $("#quickSheet").classList.add("hidden"));
$("#quickSheet").addEventListener("click", (e) => { if (e.target.id === "quickSheet") $("#quickSheet").classList.add("hidden"); });
let editingCustomFoodId = null;
$("#quickSave").addEventListener("click", () => {
  const name = $("#qName").value.trim() || (quickMode === "custom" ? "" : "Quick add");
  if (quickMode === "custom" && !name) return toast("Give it a name");
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
    const ts = timeToTs(viewDate, $("#qTime").value);
    dayLog(viewDate).meals[editTarget.mealId][editTarget.i] = { ...food, qtyLabel: "", ts };
    save(); renderToday(); $("#quickSheet").classList.add("hidden"); toast("Updated");
  } else {
    const ts = timeToTs(viewDate, $("#qTime").value);
    addFoodItem({ ...food, qtyLabel: quickMode === "ai" && aiServingG ? `${aiServingG} g` : "", ts }, null);
    $("#quickSheet").classList.add("hidden"); $("#foodSheet").classList.add("hidden");
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
$("#describeBtn").addEventListener("click", () => {
  $("#describeText").value = "";
  $("#describeSheet").classList.remove("hidden");
  $("#describeText").focus();
});
$("#describeClose").addEventListener("click", () => $("#describeSheet").classList.add("hidden"));
$("#describeSheet").addEventListener("click", (e) => { if (e.target.id === "describeSheet") $("#describeSheet").classList.add("hidden"); });
$("#describeGo").addEventListener("click", async () => {
  const desc = $("#describeText").value.trim();
  if (!desc) return toast("Describe what you ate first");
  const btn = $("#describeGo");
  btn.disabled = true; btn.textContent = "Estimating…";
  try {
    const est = await estimateDescription(desc);
    $("#describeSheet").classList.add("hidden");
    openQuick("ai", est);
  } catch (err) { toast("AI failed: " + (err.message || "error")); }
  btn.disabled = false; btn.textContent = "Estimate";
});

/* ---------- barcode scan ---------- */
// Safari/WKWebView (the native app's runtime) doesn't implement the
// BarcodeDetector API, so scanning is done with html5-qrcode (pure JS/canvas
// decoding, no native API dependency) instead.
let html5Qr = null, scanBusy = false;
$("#scanBtn").addEventListener("click", openScanner);
$("#scanClose").addEventListener("click", closeScanner);
$("#scanSheet").addEventListener("click", (e) => { if (e.target.id === "scanSheet") closeScanner(); });
async function openScanner() {
  if (typeof Html5Qrcode === "undefined") { toast("Barcode scan unavailable here — try Online search"); return; }
  $("#scanSheet").classList.remove("hidden");
  $("#scanStatus").textContent = "Starting camera…";
  scanBusy = false;
  try {
    html5Qr = new Html5Qrcode("scanReader", {
      formatsToSupport: [
        Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A, Html5QrcodeSupportedFormats.UPC_E,
      ],
      // Let the browser's own native decoder handle frames when it exists
      // (faster than the JS/canvas fallback); WKWebView has none, so it
      // still falls back to the bundled zxing decoder there.
      experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      verbose: false,
    });
    await html5Qr.start(
      { facingMode: "environment" },
      {
        fps: 20,
        // Barcodes are wide and short — a wide/short capture box samples
        // more of the code per frame than a square one.
        qrbox: { width: 300, height: 110 },
        aspectRatio: 1.777,
        disableFlip: true,
        videoConstraints: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
      },
      (code) => { if (!scanBusy) lookupBarcode(code); },
      () => {},
    );
    $("#scanStatus").textContent = "Point the camera at a barcode";
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
    openDetail({ name: p.product_name || "Product", brand: (p.brands || "").split(",")[0], kcal: +n["energy-kcal_100g"] || 0, p: +n["proteins_100g"] || 0, c: +n["carbohydrates_100g"] || 0, f: +n["fat_100g"] || 0 }, "per100");
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
    emomRounds = state.settings.timer.emomRounds, amrapMins = state.settings.timer.amrapMins;
let tmr = null, tmrInt = null, audioCtx = null;
function saveTimerCfg() {
  state.settings.timer = { mode: timerMode, emomInt, emomRounds, amrapMins };
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
}
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
  tmr = { mode: timerMode, interval: emomInt, rounds: emomRounds, total, startTs: Date.now(), pausedAt: null, pausedTotal: 0, amrapCount: 0, lastRound: 1, lastBeep: null, finished: false };
  $("#toRoundBtn").classList.toggle("hidden", timerMode !== "amrap");
  $("#toRoundBtn").textContent = "+1 round (0)";
  $("#toLog").classList.add("hidden");
  $("#toPause").textContent = "Pause";
  $("#toPause").classList.remove("hidden");
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
  const name = tmr.mode === "emom" ? `EMOM ${tmr.interval}s × ${tmr.rounds}` : `AMRAP ${tmr.total / 60}min (${tmr.amrapCount} rounds)`;
  dayLog(todayKey()).walks.push({ name, ic: "dumbbell", mins, kcal });
  save(); haptic();
  closeTimer(); toast(`Logged ${name} · ${r0(kcal)} kcal`);
  renderTraining();
});
function closeTimer() {
  cancelTimerNotif();
  clearInterval(tmrInt); tmr = null;
  const o = $("#timerOverlay");
  o.classList.add("hidden"); o.classList.remove("work", "warn", "done");
}
function renderTraining() {
  syncTimerUI();
  const sessions = [];
  for (let i = 0; i < 14; i++) {
    const dk = addDays(todayKey(), -i), l = state.logs[dk];
    if (!l) continue;
    for (const w of (l.walks || [])) {
      if (/^(EMOM|AMRAP)/.test(w.name)) sessions.push({ d: dk, ...w });
    }
  }
  $("#sessionList").innerHTML = sessions.length
    ? sessions.slice(0, 8).map((s) =>
        `<li><span class="row-label"><span class="ic" data-ic="dumbbell"></span>${esc(s.name)}</span><span class="d">${fmtShort(s.d)} · ${r0(s.kcal)} kcal</span></li>`).join("")
    : `<li class="muted" style="border-top:none">Finished workouts you log will show up here.</li>`;
  renderIcons($("#sessionList"));
}

/* ---------- Progress ---------- */
function renderProgress() { renderGoalCards(); renderWeightChart(); renderWaistChart(); renderCalChart(); renderWeekCard(); }

function goalCard(g) {
  const p = state.profile, start = p.startWeightKg, cw = currentWeight(), tgt = g.targetKg, date = g.date;
  const lost = start - cw, need = start - tgt;
  const pct = need > 0 ? clamp(lost / need, 0, 1) : (cw <= tgt ? 1 : 0);
  const daysLeft = Math.max(0, daysBetween(todayKey(), date));
  const trend = weightTrendPerDay();
  let dot = "n", pace = `${daysLeft} days left`;
  if (cw <= tgt) { dot = "g"; pace = "Reached!"; }
  else if (trend !== null && daysLeft > 0) {
    const proj = cw + trend * daysLeft, diff = proj - tgt;
    if (trend >= 0) { dot = "r"; pace = "Not trending down"; }
    else if (diff <= 0.2) { dot = "g"; pace = "On track"; }
    else if (diff <= 1.2) { dot = "y"; pace = "Close — push a bit"; }
    else { dot = "r"; pace = `Behind (proj ${r1(proj)}kg)`; }
  }
  return `<div class="goal-card">
    <div class="goal-top"><span class="goal-name"><span class="ic ge" data-ic="target"></span>${esc(g.label)}</span><span class="goal-eta">by ${fmtShort(date)}</span></div>
    <div class="goal-nums"><span class="goal-cur">${r1(cw)}</span><span class="goal-arrow">→</span><span class="goal-tgt">${r1(tgt)} kg</span></div>
    <div class="goal-bar"><div class="goal-bar-fill" style="width:${pct * 100}%"></div></div>
    <div class="goal-foot"><span class="muted">${r1(Math.max(0, lost))} of ${r1(Math.max(0, need))} kg lost</span><span class="goal-pace"><span class="pace-dot ${dot}"></span>${pace}</span></div>
  </div>`;
}
function renderGoalCards() {
  $("#goalCards").innerHTML = state.goals.length
    ? state.goals.map((g) => goalCard(g)).join("")
    : `<div class="card"><p class="muted">Add a goal in Settings to track progress here.</p></div>`;
  renderIcons($("#goalCards"));
}

function lineChart({ entries, ma, goal, unit, projDays }) {
  const W = 340, H = 170, L = 34, R = 8, T = 12, B = 22;
  if (entries.length < 2) return `<div class="food-empty">Log at least 2 entries to see the chart.</div>`;
  const x0 = entries[0].d;
  let xMax = daysBetween(x0, entries[entries.length - 1].d), proj = null;
  const trend = projDays && ma.length >= 3 ? weightTrendPerDay() : null;
  if (trend != null && projDays > 0) {
    const last = ma[ma.length - 1];
    proj = { x1: daysBetween(x0, last.d), v1: last.v, x2: daysBetween(x0, last.d) + projDays, v2: last.v + trend * projDays };
    xMax = Math.max(xMax, proj.x2);
  }
  xMax = Math.max(xMax, 1);
  let vals = entries.map((e) => e.kg).concat(ma.map((m) => m.v));
  if (goal != null) vals.push(goal);
  if (proj) vals.push(proj.v2);
  let vMin = Math.min(...vals), vMax = Math.max(...vals);
  const pad = Math.max(0.5, (vMax - vMin) * 0.15); vMin -= pad; vMax += pad;
  const X = (d) => L + (daysBetween(x0, d) / xMax) * (W - L - R);
  const Xn = (n) => L + (n / xMax) * (W - L - R);
  const Y = (v) => T + (1 - (v - vMin) / (vMax - vMin)) * (H - T - B);
  const dots = entries.map((e) => `<circle cx="${X(e.d).toFixed(1)}" cy="${Y(e.kg).toFixed(1)}" r="2.5" fill="var(--muted2)"/>`).join("");
  const maPath = ma.map((m, i) => `${i ? "L" : "M"}${X(m.d).toFixed(1)},${Y(m.v).toFixed(1)}`).join("");
  const goalLine = goal != null ? `<line x1="${L}" y1="${Y(goal).toFixed(1)}" x2="${W - R}" y2="${Y(goal).toFixed(1)}" stroke="var(--amber)" stroke-width="1.5" stroke-dasharray="5 4" opacity=".8"/><text x="${W - R}" y="${(Y(goal) - 4).toFixed(1)}" text-anchor="end" font-size="9" fill="var(--amber)">${r1(goal)} ${unit}</text>` : "";
  const projLine = proj ? `<line x1="${Xn(proj.x1).toFixed(1)}" y1="${Y(proj.v1).toFixed(1)}" x2="${Xn(proj.x2).toFixed(1)}" y2="${Y(proj.v2).toFixed(1)}" stroke="var(--green)" stroke-width="1.5" stroke-dasharray="2 4" opacity=".7"/>` : "";
  const first = entries[0], last = entries[entries.length - 1];
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" stroke="var(--border)"/>
    <text x="${L}" y="${H - 7}" font-size="9" fill="var(--muted)">${fmtShort(first.d)}</text>
    <text x="${W - R}" y="${H - 7}" text-anchor="end" font-size="9" fill="var(--muted)">${proj ? fmtShort(addDays(x0, Math.round(xMax))) : fmtShort(last.d)}</text>
    <text x="${L - 4}" y="${(Y(vMax - pad) + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="var(--muted)">${r1(vMax - pad)}</text>
    <text x="${L - 4}" y="${(Y(vMin + pad) + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="var(--muted)">${r1(vMin + pad)}</text>
    ${goalLine}${dots}<path d="${maPath}" fill="none" stroke="var(--green)" stroke-width="2.5" stroke-linecap="round"/>${projLine}</svg>`;
}
function inRange(entries, days) {
  const from = addDays(todayKey(), -(days - 1));
  return entries.filter((e) => e.d >= from);
}
let weightRange = 30, calRange = 14;
function renderWeightChart() {
  const fullMa = movingAvg(state.weights);
  const entries = inRange(state.weights, weightRange), ma = inRange(fullMa, weightRange);
  const sortedGoals = [...state.goals].sort((a, b) => (a.date < b.date ? -1 : 1));
  const nearGoal = sortedGoals[0], farGoal = sortedGoals[sortedGoals.length - 1];
  const projDays = farGoal ? Math.max(0, daysBetween(todayKey(), farGoal.date)) : 0;
  $("#weightChart").innerHTML = lineChart({ entries, ma, goal: nearGoal ? nearGoal.targetKg : null, unit: "kg", projDays });
  $("#weightDelta").textContent = entries.length >= 2 ? `${(entries[entries.length - 1].kg - entries[0].kg) <= 0 ? "" : "+"}${r1(entries[entries.length - 1].kg - entries[0].kg)} kg over range` : "";
  $$("#weightRangeChips button").forEach((b) => b.classList.toggle("active", +b.dataset.d === weightRange));
}
$("#weightRangeChips").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  weightRange = +b.dataset.d; renderWeightChart(); renderWaistChart();
});
function renderWaistChart() {
  const allEntries = state.waists.map((w) => ({ d: w.d, kg: w.cm }));
  const entries = inRange(allEntries, weightRange), ma = entries.map((e) => ({ d: e.d, v: e.kg }));
  $("#waistChart").innerHTML = lineChart({ entries, ma, goal: null, unit: "cm", projDays: 0 });
  $("#waistDelta").textContent = state.waists.length >= 2 ? `${(state.waists[state.waists.length - 1].cm - state.waists[0].cm) <= 0 ? "" : "+"}${r1(state.waists[state.waists.length - 1].cm - state.waists[0].cm)} cm since start` : "measure weekly to track belly progress";
}
function renderCalChart() {
  const W = 340, H = 150, L = 34, R = 8, T = 12, B = 22, p = state.profile;
  const n = calRange;
  const days = []; for (let i = n - 1; i >= 0; i--) days.push(addDays(todayKey(), -i));
  const vals = days.map((d) => dayTotals(d).kcal);
  const max = Math.max(p.kcalTarget * 1.25, ...vals, 1), bw = (W - L - R) / n;
  const rx = Math.min(3, bw / 3.5);
  const Y = (v) => T + (1 - v / max) * (H - T - B);
  const gap = Math.min(4, bw * 0.15);
  const bars = days.map((d, i) => { const v = vals[i]; if (!v) return ""; const over = v > p.kcalTarget; return `<rect data-tip="${fmtShort(d)} · ${r0(v)} kcal" x="${(L + i * bw + gap / 2).toFixed(1)}" y="${Y(v).toFixed(1)}" width="${(bw - gap).toFixed(1)}" height="${(H - B - Y(v)).toFixed(1)}" rx="${rx.toFixed(1)}" fill="${over ? "var(--amber)" : "var(--accent)"}" opacity="${d === todayKey() ? 1 : 0.7}"/>`; }).join("");
  $("#calChart").innerHTML = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" stroke="var(--border)"/><line x1="${L}" y1="${Y(p.kcalTarget).toFixed(1)}" x2="${W - R}" y2="${Y(p.kcalTarget).toFixed(1)}" stroke="var(--text)" stroke-width="1" stroke-dasharray="5 4" opacity=".4"/><text x="${W - R}" y="${(Y(p.kcalTarget) - 4).toFixed(1)}" text-anchor="end" font-size="9" fill="var(--muted)">target ${p.kcalTarget}</text>${bars}<text x="${L}" y="${H - 7}" font-size="9" fill="var(--muted)">${fmtShort(days[0])}</text><text x="${W - R}" y="${H - 7}" text-anchor="end" font-size="9" fill="var(--muted)">today</text></svg>`;
  $$("#calRangeChips button").forEach((b) => b.classList.toggle("active", +b.dataset.d === calRange));
}
$("#calRangeChips").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  calRange = +b.dataset.d; renderCalChart();
});
let summaryPeriod = 7;
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
  $("#weekCard").innerHTML = `<div class="card-head"><h3>Summary <button class="info-btn" data-info="streak"><span class="ic" data-ic="info"></span></button></h3></div>
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
        <span class="compare-val">${kcalDays ? (estChange >= 0 ? "−" : "+") + Math.abs(estChange) + "kg" : "—"}</span>
      </div>
      <div class="compare-row">
        <span class="compare-lab">Actual<br><span class="muted">weight trend</span></span>
        <div class="mini-bar"><div class="mini-bar-fill" style="width:${actPct}%;background:var(--accent)"></div></div>
        <span class="compare-val">${actual != null ? (actual <= 0 ? "" : "+") + r1(actual) + "kg" : "—"}</span>
      </div>
    </div>
    <div class="stat-grid">
      <div class="stat-box"><div class="v">${avgK || "—"}</div><div class="k">avg kcal / day</div></div>
      <div class="stat-box"><div class="v">${kcalDays ? (avgDef >= 0 ? "−" : "+") + Math.abs(avgDef) : "—"}</div><div class="k">avg deficit</div></div>
      <div class="stat-box"><div class="v">${walkDays}</div><div class="k">active days</div></div>
      <div class="stat-box"><div class="v">${streak()}</div><div class="k">day streak</div></div>
    </div>`;
  renderIcons($("#weekCard"));
  $$("#summaryChips button").forEach((b) => b.addEventListener("click", () => { summaryPeriod = +b.dataset.d; renderWeekCard(); }));
}

/* ---------- chart tap tooltip ---------- */
const chartTip = document.createElement("div");
chartTip.className = "chart-tip hidden";
document.body.appendChild(chartTip);
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-tip]");
  if (el) {
    const r = el.getBoundingClientRect();
    chartTip.textContent = el.dataset.tip;
    chartTip.classList.remove("hidden");
    chartTip.style.left = clamp(r.left + r.width / 2, 60, innerWidth - 60) + "px";
    chartTip.style.top = Math.max(r.top - 8, 40) + "px";
    clearTimeout(chartTip._t);
    chartTip._t = setTimeout(() => chartTip.classList.add("hidden"), 2400);
  } else if (!chartTip.classList.contains("hidden")) {
    chartTip.classList.add("hidden");
  }
});

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
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <line x1="${L}" y1="${midY}" x2="${W - R}" y2="${midY}" stroke="var(--border)"/>
    <text x="${L - 4}" y="${T + 8}" text-anchor="end" font-size="9" fill="var(--muted)">+${r1(maxAbs)}${unit}</text>
    <text x="${L - 4}" y="${H - B}" text-anchor="end" font-size="9" fill="var(--muted)">−${r1(maxAbs)}${unit}</text>
    ${bars}
    <text x="${L}" y="${H - 6}" font-size="9" fill="var(--muted)">${fmtShort(points[0].d)}</text>
    <text x="${W - R}" y="${H - 6}" text-anchor="end" font-size="9" fill="var(--muted)">${fmtShort(points[points.length - 1].d)}</text>
  </svg>`;
}
let sumFullPeriod = 7;
function renderSummaryFull() {
  const days = sumFullPeriod, p = state.profile;
  const calPts = [], weightPts = [];
  let kcalSum = 0, kcalDays = 0;
  for (let i = days - 1; i >= 0; i--) {
    const dk = addDays(todayKey(), -i);
    const t = dayTotals(dk);
    if (t.items > 0) { calPts.push({ d: dk, v: t.kcal - p.kcalTarget }); kcalSum += t.kcal; kcalDays++; }
  }
  const inRangeW = state.weights.filter((w) => w.d >= addDays(todayKey(), -(days - 1)));
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
    <div class="stat-box"><div class="v">${kcalDays ? (avgDef >= 0 ? "−" : "+") + Math.abs(avgDef) : "—"}</div><div class="k">avg deficit</div></div>
    <div class="stat-box"><div class="v">${kcalDays}/${days}</div><div class="k">days logged</div></div>
    <div class="stat-box"><div class="v">${wLost != null ? (wLost <= 0 ? "" : "+") + wLost + " kg" : "—"}</div><div class="k">weight change</div></div>`;
  $$("#sumFullChips button").forEach((b) => b.classList.toggle("active", +b.dataset.d === sumFullPeriod));
}
$("#weekCard").addEventListener("click", (e) => {
  if (e.target.closest("#summaryChips") || e.target.closest(".info-btn")) return;
  sumFullPeriod = summaryPeriod;
  renderSummaryFull();
  $("#summarySheet").classList.remove("hidden");
});
$("#summaryFullClose").addEventListener("click", () => $("#summarySheet").classList.add("hidden"));
$("#summarySheet").addEventListener("click", (e) => { if (e.target.id === "summarySheet") $("#summarySheet").classList.add("hidden"); });
$("#sumFullChips").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  sumFullPeriod = +b.dataset.d; renderSummaryFull();
});
/* ---------- Body ---------- */
function renderBody() {
  const p = state.profile, w = state.weights, ws = state.waists;
  const cw = w.length ? w[w.length - 1].kg : null;
  const wDelta = cw != null ? r1(cw - p.startWeightKg) : null;
  const cwaist = ws.length ? ws[ws.length - 1].cm : null;
  const waistDelta = ws.length >= 2 ? r1(cwaist - ws[0].cm) : null;
  $("#bodySummary").innerHTML = `
    <div class="stat-box"><div class="v">${cw != null ? cw + " kg" : "—"}</div><div class="k">current weight</div></div>
    <div class="stat-box"><div class="v">${wDelta != null ? (wDelta <= 0 ? "" : "+") + wDelta + " kg" : "—"}</div><div class="k">since start (${r1(p.startWeightKg)} kg)</div></div>
    <div class="stat-box"><div class="v">${cwaist != null ? cwaist + " cm" : "—"}</div><div class="k">current waist</div></div>
    <div class="stat-box"><div class="v">${waistDelta != null ? (waistDelta <= 0 ? "" : "+") + waistDelta + " cm" : "—"}</div><div class="k">waist change</div></div>`;
  $("#weightList").innerHTML = [...state.weights].reverse().slice(0, 8).map((w) => `<li><span>${w.kg} kg</span><span class="d">${fmtShort(w.d)}</span></li>`).join("");
  $("#waistList").innerHTML = [...state.waists].reverse().slice(0, 8).map((w) => `<li><span>${w.cm} cm</span><span class="d">${fmtShort(w.d)}</span></li>`).join("");
  renderPhotos();
}
$("#weightSave").addEventListener("click", () => {
  const v = parseFloat($("#weightInput").value);
  if (!v || v < 25 || v > 350) return toast("Enter a valid weight");
  const k = todayKey();
  state.weights = state.weights.filter((w) => w.d !== k); state.weights.push({ d: k, kg: v });
  state.weights.sort((a, b) => (a.d < b.d ? -1 : 1)); $("#weightInput").value = "";
  save(); renderBody(); toast("Weight logged");
});
$("#waistSave").addEventListener("click", () => {
  const v = parseFloat($("#waistInput").value);
  if (!v || v < 40 || v > 250) return toast("Enter a valid measurement");
  const k = todayKey();
  state.waists = state.waists.filter((w) => w.d !== k); state.waists.push({ d: k, cm: v });
  state.waists.sort((a, b) => (a.d < b.d ? -1 : 1)); $("#waistInput").value = "";
  save(); renderBody(); toast("Waist logged");
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
  $("#setWaterEnabled").checked = state.settings.waterEnabled;
  $("#setReduceMotion").checked = !!state.settings.reduceMotion;
  $("#setApiKey").value = state.settings.apiKey || "";
  $("#settingsInfo").textContent = `BMR ≈ ${r0(bmr(p.sex, currentWeight(), p.heightCm, p.age))} · maintenance ≈ ${tdee()} kcal`;
  $$("#themeSeg button").forEach((b) => b.classList.toggle("active", b.dataset.val === state.settings.theme));
  $("#versionInfo").textContent = "FitTrack v" + APP_VERSION;
  $("#aboutVersion").textContent = "v" + APP_VERSION;
  $("#setReminder").checked = !!state.settings.reminder.enabled;
  $("#setReminderTime").value = state.settings.reminder.time || "19:00";
  $("#reminderInfo").textContent = !state.settings.reminder.enabled ? "" : isNativeApp()
    ? `Reminder set for ${state.settings.reminder.time} daily.`
    : "Reminders only fire in the installed app, not this preview.";
  renderPaceTiers();
  renderSuppSettings();
  renderGoalSettings();
  renderGlossary();
}
function renderPaceTiers() {
  const p = state.profile, t = tdee(), cw = currentWeight();
  $("#paceTiers").innerHTML = PACE_TIERS.map((tier) => {
    const kcal = Math.max(t - tier.deficit, kcalFloor(p.sex));
    const protein = r0(cw * tier.proteinPerKg);
    const active = p.paceTier === tier.id;
    return `<button data-tier="${tier.id}" class="${active ? "active" : ""}">
      <strong>${tier.name}</strong>
      <span>${kcal} kcal · ${protein}g protein</span>
    </button>`;
  }).join("");
  $$("#paceTiers button").forEach((b) => b.addEventListener("click", () => {
    const tier = PACE_TIERS.find((x) => x.id === b.dataset.tier);
    const kcal = Math.max(t - tier.deficit, kcalFloor(p.sex));
    $("#setKcal").value = kcal;
    $("#setProtein").value = r0(cw * tier.proteinPerKg);
    $("#paceNote").textContent = tier.note;
    $$("#paceTiers button").forEach((x) => x.classList.toggle("active", x === b));
    p.paceTier = tier.id;
  }));
  const current = PACE_TIERS.find((x) => x.id === p.paceTier);
  $("#paceNote").textContent = current ? current.note : "Pick a pace to auto-fill calorie and protein targets below, or set your own.";
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
$("#setReminderTime").addEventListener("change", () => {
  state.settings.reminder.time = $("#setReminderTime").value;
  save(); if (state.settings.reminder.enabled) applyReminder();
});
function renderSuppSettings() {
  $("#suppSettingsList").innerHTML = state.supplements.length
    ? state.supplements.map((s) =>
        `<li><span class="row-label">${esc(s.name)}${s.note ? " — " + esc(s.note) : ""}</span>
         <button class="fi-del" data-id="${s.id}"><span class="ic" data-ic="x"></span></button></li>`).join("")
    : `<li class="muted" style="border-top:none">No supplements yet — add one below.</li>`;
  renderIcons($("#suppSettingsList"));
  $$("#suppSettingsList .fi-del").forEach((b) => b.addEventListener("click", () => {
    state.supplements = state.supplements.filter((s) => s.id !== b.dataset.id);
    save(); renderSuppSettings();
  }));
}
$("#suppAddBtn").addEventListener("click", () => {
  const name = $("#suppName").value.trim();
  if (!name) return toast("Enter a name");
  state.supplements.push({ id: "s" + Date.now(), name, note: $("#suppNote").value.trim() });
  $("#suppName").value = ""; $("#suppNote").value = "";
  save(); renderSuppSettings(); toast("Supplement added");
});
$("#settingsSave").addEventListener("click", () => {
  const p = state.profile, kcal = parseInt($("#setKcal").value, 10), floor = kcalFloor(p.sex);
  if (kcal && kcal < floor) { toast(`Minimum safe target: ${floor} kcal`); $("#setKcal").value = floor; return; }
  if (kcal) p.kcalTarget = kcal;
  p.proteinTarget = parseInt($("#setProtein").value, 10) || p.proteinTarget;
  p.waterTargetMl = parseInt($("#setWater").value, 10) || p.waterTargetMl;
  p.moveTarget = parseInt($("#setMove").value, 10) || p.moveTarget;
  p.activity = parseFloat($("#setActivity").value); p.eatBack = $("#setEatBack").checked;
  state.settings.waterEnabled = $("#setWaterEnabled").checked;
  save(); renderSettings(); renderToday(); toast("Saved");
});
let editingGoalId = null;
function resetGoalForm() {
  editingGoalId = null;
  $("#goalLabel").value = ""; $("#goalTargetKg").value = ""; $("#goalDate").value = "";
  $("#goalAddBtn").textContent = "Add goal";
}
function renderGoalSettings() {
  $("#goalSettingsList").innerHTML = state.goals.length
    ? state.goals.map((g) =>
        `<li data-id="${g.id}"><span class="row-label"><span class="ic" data-ic="target"></span>${esc(g.label)} — ${r1(g.targetKg)}kg by ${fmtShort(g.date)}</span>
         <button class="fi-del" data-id="${g.id}"><span class="ic" data-ic="x"></span></button></li>`).join("")
    : `<li class="muted" style="border-top:none">No goals yet — add one below.</li>`;
  renderIcons($("#goalSettingsList"));
  $$("#goalSettingsList li").forEach((li) => li.addEventListener("click", (e) => {
    if (e.target.closest(".fi-del")) return;
    const g = state.goals.find((x) => x.id === li.dataset.id); if (!g) return;
    editingGoalId = g.id;
    $("#goalLabel").value = g.label; $("#goalTargetKg").value = g.targetKg; $("#goalDate").value = g.date;
    $("#goalAddBtn").textContent = "Save changes";
  }));
  $$("#goalSettingsList .fi-del").forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation();
    state.goals = state.goals.filter((g) => g.id !== b.dataset.id);
    if (editingGoalId === b.dataset.id) resetGoalForm();
    save(); renderGoalSettings();
  }));
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
    state.goals.push({ id: "g" + Date.now(), label, targetKg, date });
    toast("Goal added");
  }
  resetGoalForm(); save(); renderGoalSettings();
});
$("#apiKeySave").addEventListener("click", () => { state.settings.apiKey = $("#setApiKey").value.trim(); save(); toast(state.settings.apiKey ? "API key saved" : "API key cleared"); });
$("#themeSeg").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; state.settings.theme = b.dataset.val; applyTheme(); save(); renderSettings(); });
function applyTheme() { document.documentElement.dataset.theme = state.settings.theme; const meta = $('meta[name="theme-color"]'); if (meta) meta.content = state.settings.theme === "dark" ? "#0b0b0d" : "#fafafa"; }
$("#setReduceMotion").addEventListener("change", () => {
  state.settings.reduceMotion = $("#setReduceMotion").checked;
  save(); applyMotionPref();
});

$("#exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `fittrack-backup-${todayKey()}.json`; a.click(); URL.revokeObjectURL(a.href);
  toast("Backup exported (photos not included)");
});
$("#importInput").addEventListener("change", async (e) => {
  const file = e.target.files[0]; if (!file) return;
  try { const data = JSON.parse(await file.text()); if (!data.profile || !data.logs) throw new Error("not a FitTrack backup"); if (!confirm("Replace ALL current data with this backup?")) return; localStorage.setItem(LS_KEY, JSON.stringify(data)); location.reload(); }
  catch (err) { toast("Import failed: " + err.message); }
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
  $("#app").classList.remove("hidden"); applyTheme(); applyMotionPref(); renderIcons(); switchView("today");
  if (isNativeApp() && state.settings.reminder.enabled) applyReminder();
}

renderIcons();
if (state.profile) { applyTheme(); startApp(); } else { showOnboarding(); }

// Native app (Capacitor) bundles assets locally and works offline without a
// service worker. Unregister any leftover SW from an earlier PWA install.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations?.().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
}
