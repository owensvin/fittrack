/* ===== FitTrack ===== */
"use strict";

/* ---------- helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
const r0 = (n) => Math.round(n);
const r1 = (n) => Math.round(n * 10) / 10;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const APP_VERSION = "2.2";

function toKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fromKey(k) { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); }
function addDays(k, n) { const d = fromKey(k); d.setDate(d.getDate() + n); return toKey(d); }
function todayKey() { return toKey(new Date()); }
function daysBetween(k1, k2) { return Math.round((fromKey(k2) - fromKey(k1)) / 86400000); }
function fmtShort(k) { return fromKey(k).toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
function isWeekend(k) { const d = fromKey(k).getDay(); return d === 0 || d === 6; }

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
    fasting: { startTs: null, hours: 16 },
    supplements: defaultSupplements(),
    settings: { theme: "dark", apiKey: "", reminder: { enabled: false, time: "19:00" } },
  };
}
function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const s = Object.assign(defaultState(), JSON.parse(raw));
      if (!s.supplements || !s.supplements.length) s.supplements = defaultSupplements();
      if (!s.settings.reminder) s.settings.reminder = { enabled: false, time: "19:00" };
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
        `<li><span class="row-label"><span class="ic" data-ic="pill"></span>${esc(s.name)}${s.note ? " — " + esc(s.note) : ""}</span>
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
    sprintGoalKg: parseFloat($("#obSprintW").value), sprintDate: $("#obSprintD").value,
    longGoalKg: parseFloat($("#obLongW").value), longDate: $("#obLongD").value,
  };
  state.weights.push({ d: todayKey(), kg: w });
  if (ob.supplements.length) state.supplements = ob.supplements;
  save();
  $("#onboarding").classList.add("hidden");
  startApp();
}

/* ---------- tabs ---------- */
function switchView(name) {
  $$(".view").forEach((v) => v.classList.toggle("hidden", v.id !== "view-" + name));
  $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === name));
  if (name === "today") renderToday();
  if (name === "progress") renderProgress();
  if (name === "body") renderBody();
  if (name === "settings") renderSettings();
  window.scrollTo(0, 0);
}

/* ---------- daily metrics ---------- */
function ringMetrics(k) {
  const p = state.profile, t = dayTotals(k);
  const budget = budgetFor(k);
  const cal = budget ? t.kcal / budget : 0;
  const pro = p.proteinTarget ? t.p / p.proteinTarget : 0;
  const mov = p.moveTarget ? t.active / p.moveTarget : 0;
  return { t, budget, cal, pro, mov, remaining: budget - t.kcal };
}
function renderStats(k) {
  const m = ringMetrics(k), p = state.profile;
  const rows = [
    { lab: "Calories", val: r0(m.t.kcal), tgt: r0(m.budget), pct: m.cal },
    { lab: "Protein", val: r0(m.t.p), tgt: p.proteinTarget + "g", pct: m.pro },
    { lab: "Active", val: r0(m.t.active), tgt: p.moveTarget, pct: m.mov },
  ];
  $("#statsRow").innerHTML = rows.map((r) =>
    `<div class="stat-item">
      <div class="stat-top"><span class="stat-lab">${r.lab}</span><span class="stat-num">${r.val} <span class="stat-tgt">/ ${r.tgt}</span></span></div>
      <div class="bar slim"><div class="bar-fill" style="width:${clamp(r.pct, 0, 1) * 100}%"></div></div>
    </div>`).join("");
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

  renderQuickRow();
  renderMeals(k);
  renderExercises(k);
  renderWater(k);
  renderSupps(k);
  renderFasting();
}

function renderQuickRow() {
  const items = [...state.recents, ...state.customFoods].slice(0, 10);
  const seen = new Set();
  const uniq = items.filter((f) => !seen.has(f.name) && seen.add(f.name));
  let html = uniq.map((f, i) =>
    `<button class="quick-chip" data-qi="${i}"><div class="qc-name">${esc(f.name)}</div><div class="qc-kcal">${r0(f.kcal)} kcal</div></button>`).join("");
  if (!uniq.length) html = `<div class="quick-empty">Foods you log will appear here for one-tap re-adding.</div>`;
  html += `<button class="quick-chip add" id="quickMore">+</button>`;
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
    $("#suppList").innerHTML = `<li class="muted" style="border-top:none;cursor:default">Add supplements in Settings to track them here.</li>`;
    $("#suppCount").textContent = "";
    return;
  }
  $("#suppList").innerHTML = state.supplements.map((s) => {
    const done = !!log.supps[s.id];
    const sub = s.weekday ? (wknd ? s.weekend : s.weekday) : (s.note || "");
    return `<li class="${done ? "done" : ""}" data-sid="${s.id}">
      <span class="ic habit-ic" data-ic="pill"></span>
      <div class="habit-main"><div class="habit-name">${esc(s.name)}</div>${sub ? `<div class="habit-sub">${esc(sub)}</div>` : ""}</div>
      <span class="habit-check"><span class="ic" data-ic="check"></span></span></li>`;
  }).join("");
  renderIcons($("#suppList"));
  const done = state.supplements.filter((s) => log.supps[s.id]).length;
  $("#suppCount").textContent = `${done} / ${state.supplements.length}`;
  $$("#suppList li").forEach((li) => li.addEventListener("click", () => {
    const id = li.dataset.sid;
    log.supps[id] = !log.supps[id];
    save(); renderSupps(viewDate);
  }));
}

/* water / day nav */
$("#waterPlus").addEventListener("click", () => { const l = dayLog(viewDate); l.waterMl = (l.waterMl || 0) + 250; save(); renderToday(); });
$("#waterMinus").addEventListener("click", () => { const l = dayLog(viewDate); l.waterMl = Math.max(0, (l.waterMl || 0) - 250); save(); renderToday(); });
$("#dayPrev").addEventListener("click", () => { viewDate = addDays(viewDate, -1); renderToday(); });
$("#dayNext").addEventListener("click", () => { if (viewDate < todayKey()) { viewDate = addDays(viewDate, 1); renderToday(); } });

/* ---------- fasting ---------- */
let fastInterval = null;
function renderFasting() {
  const f = state.fasting, btn = $("#fastBtn");
  clearInterval(fastInterval);
  if (!f.startTs) {
    $("#fastTimer").textContent = "Not fasting";
    $("#fastStatus").textContent = f.lastHours ? `last: ${r1(f.lastHours)} h` : "";
    $("#fastBar").style.width = "0%"; btn.textContent = "Start fast"; return;
  }
  btn.textContent = "End fast";
  const tick = () => {
    const hrs = (Date.now() - f.startTs) / 3600000, rem = f.hours - hrs;
    $("#fastBar").style.width = clamp((hrs / f.hours) * 100, 0, 100) + "%";
    const h = Math.floor(Math.abs(hrs)), mn = Math.floor((Math.abs(hrs) * 60) % 60);
    if (rem > 0) {
      $("#fastTimer").textContent = `${h}h ${String(mn).padStart(2, "0")}m fasted`;
      $("#fastStatus").textContent = `${Math.floor(rem)}h ${String(Math.floor((rem * 60) % 60)).padStart(2, "0")}m to ${f.hours}h`;
    } else { $("#fastTimer").textContent = `${h}h ${String(mn).padStart(2, "0")}m — goal hit`; $("#fastStatus").textContent = "you can eat"; }
  };
  tick(); fastInterval = setInterval(tick, 30000);
}
$("#fastBtn").addEventListener("click", () => {
  const f = state.fasting;
  if (!f.startTs) { f.startTs = Date.now(); toast("Fast started"); }
  else { f.lastHours = (Date.now() - f.startTs) / 3600000; f.startTs = null; toast(`Fast ended: ${r1(f.lastHours)} h`); }
  save(); renderFasting();
});

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
      ${sheetTab === "custom" ? `<span class="fav-btn" data-delc="${f.id}">✕</span>` : ""}</button>`;
  }).join("");
  $$("#foodList .food-row").forEach((el) => el.addEventListener("click", (e) => {
    const fav = e.target.dataset.fav, del = e.target.dataset.delc;
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
function openDetail(food, mode) {
  detail = { food, mode };
  $("#detailName").textContent = food.name;
  $("#detailServing").textContent = mode === "per100" ? `${r0(food.kcal)} kcal per 100 g${food.brand ? " · " + food.brand : ""}` : `${r0(food.kcal)} kcal per ${food.serving || "serving"}`;
  $("#qtyInput").value = mode === "per100" ? 100 : 1;
  $("#qtyInput").step = mode === "per100" ? 10 : 0.5;
  $("#qtyUnit").textContent = mode === "per100" ? "g" : "× serving";
  updateMacroPreview();
  $("#detailSheet").classList.remove("hidden");
}
function detailFactor() { const q = parseFloat($("#qtyInput").value) || 0; return detail.mode === "per100" ? q / 100 : q; }
function updateMacroPreview() {
  const f = detail.food, k = detailFactor();
  $("#macroPreview").innerHTML = `<div><span>${r0(f.kcal * k)}</span><label>kcal</label></div><div><span>${r1((f.p || 0) * k)}</span><label>protein</label></div><div><span>${r1((f.f || 0) * k)}</span><label>fat</label></div><div><span>${r1((f.c || 0) * k)}</span><label>carbs</label></div>`;
}
$("#qtyInput").addEventListener("input", updateMacroPreview);
$("#qtyMinus").addEventListener("click", () => { const i = $("#qtyInput"), st = detail.mode === "per100" ? 10 : 0.5; i.value = Math.max(st, (parseFloat(i.value) || 0) - st); updateMacroPreview(); });
$("#qtyPlus").addEventListener("click", () => { const i = $("#qtyInput"), st = detail.mode === "per100" ? 10 : 0.5; i.value = (parseFloat(i.value) || 0) + st; updateMacroPreview(); });
$("#detailClose").addEventListener("click", () => $("#detailSheet").classList.add("hidden"));
$("#detailSheet").addEventListener("click", (e) => { if (e.target.id === "detailSheet") $("#detailSheet").classList.add("hidden"); });
$("#detailAdd").addEventListener("click", () => {
  const f = detail.food, k = detailFactor(); if (k <= 0) return;
  const qtyLabel = detail.mode === "per100" ? `${r0(k * 100)} g` : (k === 1 ? (f.serving || "") : `${k} × ${f.serving || "serving"}`);
  addFoodItem({ name: f.name, kcal: f.kcal * k, p: (f.p || 0) * k, c: (f.c || 0) * k, f: (f.f || 0) * k, qtyLabel }, f);
  $("#detailSheet").classList.add("hidden"); $("#foodSheet").classList.add("hidden");
});

function addFoodItem(item, src) {
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
const KJ_PER_KCAL = 4.184;
let qCustomMode = "simple", customIngredients = [], ingBasis = "100g", calUnit = "kcal";
let totalWTouched = false, servWTouched = false;
function openQuick(mode, prefill) {
  quickMode = mode;
  $("#quickTitle").textContent = mode === "custom" ? "New custom food" : mode === "ai" ? "AI estimate" : mode === "edit" ? "Edit food" : "Quick add";
  $("#qServingWrap").classList.toggle("hidden", mode !== "custom");
  $("#qNote").classList.toggle("hidden", mode !== "ai");
  $("#qCustomModeSeg").classList.toggle("hidden", mode !== "custom");
  if (mode === "ai") $("#qNote").textContent = "AI's best guess — tweak anything, then add.";
  ["qName", "qKcal", "qProt", "qCarb", "qFat", "qServing", "mealTotalWeight", "mealServingWeight"].forEach((id) => ($("#" + id).value = ""));
  if (prefill) { $("#qName").value = prefill.name || ""; $("#qKcal").value = prefill.kcal || ""; $("#qProt").value = prefill.p || ""; $("#qCarb").value = prefill.c || ""; $("#qFat").value = prefill.f || ""; }
  $("#quickSave").textContent = mode === "custom" ? "Save food" : mode === "edit" ? "Save changes" : "Add";
  customIngredients = []; ingBasis = "100g"; totalWTouched = false; servWTouched = false;
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
  openQuick("edit", { name: item.name, kcal: item.kcal, p: item.p, c: item.c, f: item.f });
}
$("#quickAddBtn").addEventListener("click", () => openQuick("quick"));
$("#customFoodBtn").addEventListener("click", () => openQuick("custom"));
$("#quickClose").addEventListener("click", () => $("#quickSheet").classList.add("hidden"));
$("#quickSheet").addEventListener("click", (e) => { if (e.target.id === "quickSheet") $("#quickSheet").classList.add("hidden"); });
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
    food.id = "c" + Date.now();
    food.serving = $("#qServing").value.trim() || (qCustomMode === "ingredients" && servingWeight ? `${servingWeight} g` : "1 serving");
    if (qCustomMode === "ingredients") food.ingredients = customIngredients;
    state.customFoods.unshift(food); save(); toast("Custom food saved");
    $("#quickSheet").classList.add("hidden"); renderFoodList();
  } else if (quickMode === "edit") {
    dayLog(viewDate).meals[editTarget.mealId][editTarget.i] = { ...food, qtyLabel: "" };
    save(); renderToday(); $("#quickSheet").classList.add("hidden"); toast("Updated");
  } else {
    addFoodItem({ ...food, qtyLabel: "" }, null);
    $("#quickSheet").classList.add("hidden"); $("#foodSheet").classList.add("hidden");
  }
});

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
async function aiEstimate(b64, mime) {
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
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: mime, data: b64 } },
        { type: "text", text: "Estimate the food in this photo as a single combined meal. Give your best numeric estimate of total calories and macros for the full portion shown. Respond with JSON only." },
      ] }],
      output_config: { format: { type: "json_schema", schema: {
        type: "object", additionalProperties: false,
        properties: { name: { type: "string" }, kcal: { type: "integer" }, protein_g: { type: "integer" }, carbs_g: { type: "integer" }, fat_g: { type: "integer" } },
        required: ["name", "kcal", "protein_g", "carbs_g", "fat_g"],
      } } },
    }),
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const data = await res.json();
  const txt = (data.content || []).find((b) => b.type === "text")?.text || "{}";
  const j = JSON.parse(txt);
  return { name: j.name, kcal: j.kcal, p: j.protein_g, c: j.carbs_g, f: j.fat_g };
}

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

/* ---------- Progress ---------- */
function renderProgress() { renderGoalCards(); renderWeightChart(); renderWaistChart(); renderCalChart(); renderWeekCard(); }

function goalCard(title, ic, tgt, date) {
  const p = state.profile, start = p.startWeightKg, cw = currentWeight();
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
    <div class="goal-top"><span class="goal-name"><span class="ic ge" data-ic="${ic}"></span>${title}</span><span class="goal-eta">by ${fmtShort(date)}</span></div>
    <div class="goal-nums"><span class="goal-cur">${r1(cw)}</span><span class="goal-arrow">→</span><span class="goal-tgt">${r1(tgt)} kg</span></div>
    <div class="goal-bar"><div class="goal-bar-fill" style="width:${pct * 100}%"></div></div>
    <div class="goal-foot"><span class="muted">${r1(Math.max(0, lost))} of ${r1(Math.max(0, need))} kg lost</span><span class="goal-pace"><span class="pace-dot ${dot}"></span>${pace}</span></div>
  </div>`;
}
function renderGoalCards() {
  const p = state.profile;
  $("#goalCards").innerHTML = goalCard("Sprint", "bolt", p.sprintGoalKg, p.sprintDate) + goalCard("Long-term", "target", p.longGoalKg, p.longDate);
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
  const p = state.profile;
  const fullMa = movingAvg(state.weights);
  const entries = inRange(state.weights, weightRange), ma = inRange(fullMa, weightRange);
  const projDays = Math.max(0, daysBetween(todayKey(), p.longDate));
  $("#weightChart").innerHTML = lineChart({ entries, ma, goal: p.sprintGoalKg, unit: "kg", projDays });
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
  const bars = days.map((d, i) => { const v = vals[i]; if (!v) return ""; const over = v > p.kcalTarget; return `<rect x="${(L + i * bw + gap / 2).toFixed(1)}" y="${Y(v).toFixed(1)}" width="${(bw - gap).toFixed(1)}" height="${(H - B - Y(v)).toFixed(1)}" rx="${rx.toFixed(1)}" fill="${over ? "var(--amber)" : "var(--accent)"}" opacity="${d === todayKey() ? 1 : 0.7}"/>`; }).join("");
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
  $("#weekCard").innerHTML = `<div class="card-head"><h3>Summary</h3></div>
    <div class="chips" id="summaryChips">
      <button data-d="7" class="${days === 7 ? "active" : ""}">Week</button>
      <button data-d="30" class="${days === 30 ? "active" : ""}">Month</button>
    </div>
    <p class="muted" style="margin:10px 0 12px">${kcalDays}/${days} days logged (${adherence}%) · ${walkDays} active days</p>
    <div class="stat-grid">
      <div class="stat-box"><div class="v">${avgK || "—"}</div><div class="k">avg kcal / day</div></div>
      <div class="stat-box"><div class="v">${kcalDays ? (avgDef >= 0 ? "−" : "+") + Math.abs(avgDef) : "—"}</div><div class="k">avg deficit</div></div>
      <div class="stat-box"><div class="v">${kcalDays ? (estChange >= 0 ? "−" : "+") + Math.abs(estChange) + " kg" : "—"}</div><div class="k">est. change (food)</div></div>
      <div class="stat-box"><div class="v">${actual != null ? (actual <= 0 ? "" : "+") + r1(actual) + " kg" : "—"}</div><div class="k">actual trend</div></div>
    </div>`;
  $$("#summaryChips button").forEach((b) => b.addEventListener("click", () => { summaryPeriod = +b.dataset.d; renderWeekCard(); }));
}
/* ---------- Body ---------- */
function renderBody() {
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
  $("#setSprintW").value = p.sprintGoalKg; $("#setSprintD").value = p.sprintDate; $("#setLongW").value = p.longGoalKg; $("#setLongD").value = p.longDate;
  $("#setApiKey").value = state.settings.apiKey || "";
  $("#settingsInfo").textContent = `BMR ≈ ${r0(bmr(p.sex, currentWeight(), p.heightCm, p.age))} · maintenance ≈ ${tdee()} kcal`;
  $$("#themeSeg button").forEach((b) => b.classList.toggle("active", b.dataset.val === state.settings.theme));
  $("#versionInfo").textContent = "FitTrack v" + APP_VERSION;
  $("#setReminder").checked = !!state.settings.reminder.enabled;
  $("#setReminderTime").value = state.settings.reminder.time || "19:00";
  $("#reminderInfo").textContent = !state.settings.reminder.enabled ? "" : isNativeApp()
    ? `Reminder set for ${state.settings.reminder.time} daily.`
    : "Reminders only fire in the installed app, not this preview.";
  renderSuppSettings();
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
        `<li><span class="row-label"><span class="ic" data-ic="pill"></span>${esc(s.name)}${s.note ? " — " + esc(s.note) : ""}</span>
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
  save(); renderSettings(); toast("Saved");
});
$("#goalsSave").addEventListener("click", () => {
  const p = state.profile;
  p.sprintGoalKg = parseFloat($("#setSprintW").value) || p.sprintGoalKg; p.sprintDate = $("#setSprintD").value || p.sprintDate;
  p.longGoalKg = parseFloat($("#setLongW").value) || p.longGoalKg; p.longDate = $("#setLongD").value || p.longDate;
  save(); toast("Goals updated");
});
$("#apiKeySave").addEventListener("click", () => { state.settings.apiKey = $("#setApiKey").value.trim(); save(); toast(state.settings.apiKey ? "API key saved" : "API key cleared"); });
$("#themeSeg").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; state.settings.theme = b.dataset.val; applyTheme(); save(); renderSettings(); });
function applyTheme() { document.documentElement.dataset.theme = state.settings.theme; const meta = $('meta[name="theme-color"]'); if (meta) meta.content = state.settings.theme === "dark" ? "#0a0a12" : "#f4f5fa"; }

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
  $("#app").classList.remove("hidden"); applyTheme(); renderIcons(); switchView("today");
  if (isNativeApp() && state.settings.reminder.enabled) applyReminder();
}

renderIcons();
if (state.profile) { applyTheme(); startApp(); } else { showOnboarding(); }

// Native app (Capacitor) bundles assets locally and works offline without a
// service worker. Unregister any leftover SW from an earlier PWA install.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations?.().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
}
