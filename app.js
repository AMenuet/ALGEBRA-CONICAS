const state = {
  g1: { u: { x: 4, y: 2 }, drag: null },
  g2: { u: { x: 3, y: 1 }, v: { x: 2, y: 3 }, drag: null },
  g3: { u: { x: 4, y: 2 }, c: 1.5, drag: null },
  g4: { u: { x: 4, y: 1 }, v: { x: 2, y: 3 }, drag: null },
  g5: { u: { x: 4, y: 1 }, v: { x: 2, y: 3 }, drag: null },
  g7: { u: { x: 4, y: 1 }, v: { x: 2, y: 3 }, drag: null },
  cross: { order: "uxv", plane: true },
  mixed: { base: true, height: true, volume: true },
  g9: { h: 2 }
};

const $ = (id) => document.getElementById(id);

const PROGRESS_STORAGE_KEY = "vectorlab_progress_v1";
const ACTIVE_WINDOW_MS = 60 * 1000;
const ACTIVITY_TICK_MS = 10 * 1000;
const progressCatalog = [];
let progressData = loadProgress();
let lastUserActivityAt = Date.now();
let lastActivityTickAt = Date.now();
let activityTicksSinceSave = 0;
let currentSession = null;

function emptyProgress() {
  return {
    version: 2,
    startedAt: new Date().toISOString(),
    updatedAt: null,
    items: {},
    engagement: {
      totalActiveSeconds: 0,
      sessions: [],
      activeDays: {}
    }
  };
}

function migrateProgress(stored) {
  const migrated = {
    ...emptyProgress(),
    ...stored,
    version: 2,
    items: stored?.items || {},
    engagement: {
      totalActiveSeconds: stored?.engagement?.totalActiveSeconds || 0,
      sessions: Array.isArray(stored?.engagement?.sessions) ? stored.engagement.sessions : [],
      activeDays: stored?.engagement?.activeDays || {}
    }
  };

  Object.values(migrated.items).forEach((item) => {
    item.correctAttempts = item.correctAttempts ?? (item.correct ? 1 : 0);
    item.hintsUsed = item.hintsUsed || 0;
    item.solutionsViewed = item.solutionsViewed || 0;
    item.firstAttemptCorrect = item.firstAttemptCorrect ?? (item.correct && item.attempts === 1);
  });
  return migrated;
}

function loadProgress() {
  try {
    const stored = JSON.parse(localStorage.getItem(PROGRESS_STORAGE_KEY));
    if (stored?.items) return migrateProgress(stored);
  } catch (error) {
    console.warn("No se pudo leer el progreso guardado.", error);
  }
  return emptyProgress();
}

function saveProgress() {
  progressData.updatedAt = new Date().toISOString();
  try {
    localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progressData));
    window.dispatchEvent(new CustomEvent("vectorlab:progress-changed"));
  } catch (error) {
    console.warn("No se pudo guardar el progreso.", error);
  }
}

function cleanLabel(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.round(totalSeconds || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours) return `${hours} h ${minutes} min`;
  if (minutes) return `${minutes} min`;
  return `${seconds} s`;
}

function beginStudySession() {
  const now = new Date();
  currentSession = {
    id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    startedAt: now.toISOString(),
    lastActiveAt: now.toISOString(),
    activeSeconds: 0
  };
  progressData.engagement.sessions.push(currentSession);
  progressData.engagement.sessions = progressData.engagement.sessions.slice(-100);
  saveProgress();
}

function accrueActiveTime() {
  const now = Date.now();
  const elapsedSeconds = Math.min(ACTIVITY_TICK_MS / 1000, Math.max(0, (now - lastActivityTickAt) / 1000));
  const isActive = document.visibilityState === "visible" && now - lastUserActivityAt <= ACTIVE_WINDOW_MS;
  lastActivityTickAt = now;
  if (!isActive || !currentSession || elapsedSeconds <= 0) return;

  const roundedSeconds = Math.round(elapsedSeconds);
  const dayKey = localDateKey();
  progressData.engagement.totalActiveSeconds += roundedSeconds;
  progressData.engagement.activeDays[dayKey] =
    (progressData.engagement.activeDays[dayKey] || 0) + roundedSeconds;
  currentSession.activeSeconds += roundedSeconds;
  currentSession.lastActiveAt = new Date(now).toISOString();
  activityTicksSinceSave += 1;

  if (activityTicksSinceSave >= 3) {
    activityTicksSinceSave = 0;
    saveProgress();
    renderProgressDashboard();
  }
}

function markUserActivity() {
  accrueActiveTime();
  lastUserActivityAt = Date.now();
  lastActivityTickAt = Date.now();
}

function setupEngagementTracking() {
  beginStudySession();
  ["pointerdown", "keydown", "scroll", "touchstart"].forEach((eventName) => {
    document.addEventListener(eventName, markUserActivity, { passive: true });
  });
  window.setInterval(accrueActiveTime, ACTIVITY_TICK_MS);
  document.addEventListener("visibilitychange", () => {
    accrueActiveTime();
    lastActivityTickAt = Date.now();
  });
  window.addEventListener("pagehide", () => {
    accrueActiveTime();
    saveProgress();
  });
}

function catalogItem(card, type) {
  const section = card.closest(".section");
  const modulePanel = card.closest(".module-panel");
  const contentPanel = card.closest(".panel");
  const scopeId = modulePanel?.id || section?.id || "general";
  const panelId = contentPanel?.id || scopeId;
  const itemSelector = type === "activity" ? ".activity-card" : ".quiz-card";
  const siblingItems = [...(contentPanel || modulePanel || section).querySelectorAll(itemSelector)];
  const localIndex = siblingItems.indexOf(card);
  const id = `${panelId}:${type}:${localIndex + 1}`;
  const moduleButton = modulePanel
    ? document.querySelector(`.module-subtab[data-module-panel="${modulePanel.id}"]`)
    : null;
  const sectionButton = section
    ? document.querySelector(`.section-tab[data-section="${section.id}"]`)
    : null;

  const item = {
    id,
    type,
    card,
    scopeId,
    moduleName: cleanLabel(moduleButton?.textContent || sectionButton?.textContent || "General"),
    sectionName: cleanLabel(sectionButton?.textContent || "VectorLab"),
    title: cleanLabel(card.querySelector("h4")?.textContent || `${type} ${localIndex + 1}`)
  };

  card.dataset.progressId = id;
  progressCatalog.push(item);
  return item;
}

function recordProgress(item, result) {
  const previous = progressData.items[item.id] || {
    type: item.type,
    attempts: 0,
    correct: false,
    correctAttempts: 0,
    hintsUsed: 0,
    solutionsViewed: 0
  };
  const isFirstAttempt = previous.attempts === 0;

  progressData.items[item.id] = {
    ...previous,
    type: item.type,
    attempts: previous.attempts + 1,
    correctAttempts: (previous.correctAttempts || 0) + (result.correct ? 1 : 0),
    correct: previous.correct || result.correct,
    firstAttemptCorrect: previous.firstAttemptCorrect || (isFirstAttempt && result.correct),
    solvedWithoutHelp: previous.solvedWithoutHelp || (
      result.correct &&
      !(previous.hintsUsed || 0) &&
      !(previous.solutionsViewed || 0)
    ),
    lastCorrect: result.correct,
    lastAnswer: result.answer,
    selectedIndex: result.selectedIndex,
    updatedAt: new Date().toISOString()
  };

  saveProgress();
  applyItemProgress(item);
  renderProgressDashboard();
}

function recordLearningSupport(item, kind) {
  const previous = progressData.items[item.id] || {
    type: item.type,
    attempts: 0,
    correct: false,
    correctAttempts: 0,
    hintsUsed: 0,
    solutionsViewed: 0
  };
  const field = kind === "hint" ? "hintsUsed" : "solutionsViewed";
  progressData.items[item.id] = {
    ...previous,
    [field]: (previous[field] || 0) + 1,
    updatedAt: new Date().toISOString()
  };
  saveProgress();
  renderProgressDashboard();
}

function applyItemProgress(item) {
  const saved = progressData.items[item.id];
  item.card.classList.toggle("progress-complete", Boolean(saved?.correct));

  let label = item.card.querySelector(".item-progress-label");
  if (saved?.correct && !label) {
    label = document.createElement("span");
    label.className = "item-progress-label";
    label.textContent = "Completado";
    item.card.insertBefore(label, item.card.firstChild);
  } else if (!saved?.correct && label) {
    label.remove();
  }
}

function progressStats(items = progressCatalog) {
  return items.reduce((stats, item) => {
    const saved = progressData.items[item.id];
    if (saved?.attempts > 0) stats.attempted += 1;
    if (saved?.correct) stats.completed += 1;
    if (saved?.firstAttemptCorrect) stats.firstAttemptCorrect += 1;
    if (saved?.solvedWithoutHelp) stats.solvedWithoutHelp += 1;
    if (saved?.hintsUsed > 0) stats.itemsWithHints += 1;
    if (saved?.solutionsViewed > 0) stats.itemsWithSolutions += 1;
    stats.attempts += saved?.attempts || 0;
    stats.correctAttempts += saved?.correctAttempts || 0;
    stats.hintsUsed += saved?.hintsUsed || 0;
    stats.solutionsViewed += saved?.solutionsViewed || 0;
    stats.total += 1;
    return stats;
  }, {
    attempted: 0,
    completed: 0,
    attempts: 0,
    correctAttempts: 0,
    firstAttemptCorrect: 0,
    solvedWithoutHelp: 0,
    itemsWithHints: 0,
    itemsWithSolutions: 0,
    hintsUsed: 0,
    solutionsViewed: 0,
    total: 0
  });
}

function renderProgressDashboard() {
  const container = $("progressModules");
  if (!container) return;

  const overall = progressStats();
  const percent = overall.total ? Math.round(overall.completed / overall.total * 100) : 0;
  const accuracy = overall.attempts ? Math.round(overall.correctAttempts / overall.attempts * 100) : 0;
  const firstAttemptRate = overall.attempted
    ? Math.round(overall.firstAttemptCorrect / overall.attempted * 100)
    : 0;
  const engagement = progressData.engagement;
  const activeSessions = engagement.sessions.filter((session) => session.activeSeconds > 0);
  const activeDays = Object.keys(engagement.activeDays).filter((day) => engagement.activeDays[day] > 0);
  $("progressPercent").textContent = `${percent}%`;
  $("progressCompleted").textContent = overall.completed;
  $("progressAttempted").textContent = overall.attempted;
  $("progressAttempts").textContent = overall.attempts;
  $("progressTotal").textContent = overall.total;
  $("progressRing").style.setProperty("--progress", percent);
  $("metricAccuracy").textContent = `${accuracy}%`;
  $("metricFirstAttempt").textContent = `${firstAttemptRate}%`;
  $("metricWithoutHelp").textContent = overall.solvedWithoutHelp;
  $("metricHints").textContent = overall.itemsWithHints;
  $("metricActiveTime").textContent = formatDuration(engagement.totalActiveSeconds);
  $("metricSessions").textContent = activeSessions.length;
  $("metricActiveDays").textContent = activeDays.length;
  $("metricLastAccess").textContent = activeSessions.length
    ? new Date(activeSessions[activeSessions.length - 1].lastActiveAt).toLocaleDateString("es-AR")
    : "—";

  const groups = new Map();
  progressCatalog.forEach((item) => {
    const key = `${item.sectionName} · ${item.moduleName}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });

  container.innerHTML = [...groups.entries()].map(([name, items]) => {
    const stats = progressStats(items);
    const modulePercent = stats.total ? Math.round(stats.completed / stats.total * 100) : 0;
    return `
      <article class="progress-module-card">
        <header>
          <h3>${name}</h3>
          <strong>${modulePercent}%</strong>
        </header>
        <p>${stats.completed} de ${stats.total} correctos · ${stats.attempted} intentados</p>
        <div class="progress-bar" aria-label="${modulePercent}% completado">
          <span style="width:${modulePercent}%"></span>
        </div>
      </article>
    `;
  }).join("");
}

function mergeProgressSnapshot(remote) {
  if (!remote) return;

  Object.entries(remote.items || {}).forEach(([itemId, remoteItem]) => {
    const localItem = progressData.items[itemId];
    if (!localItem) {
      progressData.items[itemId] = remoteItem;
      return;
    }
    const remoteIsNewer = String(remoteItem.updatedAt || "") > String(localItem.updatedAt || "");
    progressData.items[itemId] = {
      ...localItem,
      ...(remoteIsNewer ? {
        lastAnswer: remoteItem.lastAnswer,
        selectedIndex: remoteItem.selectedIndex,
        lastCorrect: remoteItem.lastCorrect,
        updatedAt: remoteItem.updatedAt
      } : {}),
      type: localItem.type || remoteItem.type,
      attempts: Math.max(localItem.attempts || 0, remoteItem.attempts || 0),
      correctAttempts: Math.max(localItem.correctAttempts || 0, remoteItem.correctAttempts || 0),
      correct: Boolean(localItem.correct || remoteItem.correct),
      firstAttemptCorrect: Boolean(localItem.firstAttemptCorrect || remoteItem.firstAttemptCorrect),
      solvedWithoutHelp: Boolean(localItem.solvedWithoutHelp || remoteItem.solvedWithoutHelp),
      hintsUsed: Math.max(localItem.hintsUsed || 0, remoteItem.hintsUsed || 0),
      solutionsViewed: Math.max(localItem.solutionsViewed || 0, remoteItem.solutionsViewed || 0)
    };
  });

  const sessionsById = new Map(
    progressData.engagement.sessions.map((session) => [session.id, session])
  );
  (remote.engagement?.sessions || []).forEach((remoteSession) => {
    const localSession = sessionsById.get(remoteSession.id);
    sessionsById.set(remoteSession.id, localSession ? {
      ...localSession,
      lastActiveAt: String(remoteSession.lastActiveAt) > String(localSession.lastActiveAt)
        ? remoteSession.lastActiveAt
        : localSession.lastActiveAt,
      activeSeconds: Math.max(localSession.activeSeconds || 0, remoteSession.activeSeconds || 0)
    } : remoteSession);
  });
  progressData.engagement.sessions = [...sessionsById.values()]
    .sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)))
    .slice(-100);

  Object.entries(remote.engagement?.activeDays || {}).forEach(([day, seconds]) => {
    progressData.engagement.activeDays[day] = Math.max(
      progressData.engagement.activeDays[day] || 0,
      seconds || 0
    );
  });
  progressData.engagement.totalActiveSeconds = Math.max(
    progressData.engagement.totalActiveSeconds || 0,
    remote.engagement?.totalActiveSeconds || 0,
    Object.values(progressData.engagement.activeDays).reduce((sum, seconds) => sum + seconds, 0)
  );

  saveProgress();
  progressCatalog.forEach(applyItemProgress);
  renderProgressDashboard();
}

function setupProgress() {
  const resetButton = $("resetProgressBtn");
  if (resetButton) {
    resetButton.addEventListener("click", () => {
      const accepted = window.confirm("¿Querés borrar todos los intentos y resultados guardados en este navegador?");
      if (!accepted) return;
      progressData = emptyProgress();
      currentSession = null;
      try {
        localStorage.removeItem(PROGRESS_STORAGE_KEY);
      } catch (error) {
        console.warn("No se pudo borrar el progreso guardado.", error);
      }
      progressCatalog.forEach((item) => {
        item.card.classList.remove("progress-complete");
        item.card.querySelector(".item-progress-label")?.remove();
        if (item.type === "activity") {
          const input = item.card.querySelector("input");
          const feedback = item.card.querySelector(".feedback");
          if (input) input.value = "";
          if (feedback) feedback.textContent = "";
          item.card.querySelector(".solution")?.classList.remove("visible");
        } else {
          item.card.querySelectorAll("button").forEach((button) => {
            button.disabled = false;
            button.classList.remove("correct", "wrong");
          });
          const feedback = item.card.querySelector(".quiz-feedback");
          if (feedback) feedback.textContent = "";
        }
      });
      beginStudySession();
      renderProgressDashboard();
    });
  }
}

function fmt(n) {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(2);
}

function norm(v) {
  return Math.hypot(v.x, v.y);
}

function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y };
}

function scale(a, c) {
  return { x: a.x * c, y: a.y * c };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y;
}

function cross2D(a, b) {
  return a.x * b.y - a.y * b.x;
}

function projection(v, u) {
  const den = dot(u, u);
  if (den === 0) return { x: 0, y: 0 };
  return scale(u, dot(u, v) / den);
}

function angleBetween(a, b) {
  const den = norm(a) * norm(b);
  if (den === 0) return 0;
  const c = Math.max(-1, Math.min(1, dot(a, b) / den));
  return Math.acos(c) * 180 / Math.PI;
}

const view = { xmin: -6, xmax: 6, ymin: -6, ymax: 6, pad: 42 };

function toCanvas(canvas, p) {
  const w = canvas.width - 2 * view.pad;
  const h = canvas.height - 2 * view.pad;
  return {
    x: view.pad + (p.x - view.xmin) / (view.xmax - view.xmin) * w,
    y: view.pad + (view.ymax - p.y) / (view.ymax - view.ymin) * h
  };
}

function fromCanvas(canvas, x, y) {
  const w = canvas.width - 2 * view.pad;
  const h = canvas.height - 2 * view.pad;
  return {
    x: view.xmin + (x - view.pad) / w * (view.xmax - view.xmin),
    y: view.ymax - (y - view.pad) / h * (view.ymax - view.ymin)
  };
}

function clampPoint(p) {
  return {
    x: Math.round(Math.max(view.xmin, Math.min(view.xmax, p.x)) * 4) / 4,
    y: Math.round(Math.max(view.ymin, Math.min(view.ymax, p.y)) * 4) / 4
  };
}

function drawGrid(ctx, canvas) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fbfdff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "#e7eef8";
  ctx.lineWidth = 1;

  for (let x = view.xmin; x <= view.xmax; x++) {
    const a = toCanvas(canvas, { x, y: view.ymin });
    const b = toCanvas(canvas, { x, y: view.ymax });
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  for (let y = view.ymin; y <= view.ymax; y++) {
    const a = toCanvas(canvas, { x: view.xmin, y });
    const b = toCanvas(canvas, { x: view.xmax, y });
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  const xA = toCanvas(canvas, { x: view.xmin, y: 0 });
  const xB = toCanvas(canvas, { x: view.xmax, y: 0 });
  const yA = toCanvas(canvas, { x: 0, y: view.ymin });
  const yB = toCanvas(canvas, { x: 0, y: view.ymax });

  ctx.strokeStyle = "#111";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(xA.x, xA.y);
  ctx.lineTo(xB.x, xB.y);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(yA.x, yA.y);
  ctx.lineTo(yB.x, yB.y);
  ctx.stroke();

  // flechas positivas
  const ah = 10;
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.moveTo(xB.x, xB.y);
  ctx.lineTo(xB.x - ah, xB.y - 4);
  ctx.lineTo(xB.x - ah, xB.y + 4);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(yB.x, yB.y);
  ctx.lineTo(yB.x - 4, yB.y + ah);
  ctx.lineTo(yB.x + 4, yB.y + ah);
  ctx.closePath();
  ctx.fill();

  ctx.font = "16px Georgia";
  ctx.fillText("x", xB.x + 8, xB.y - 8);
  ctx.fillText("y", yB.x + 8, yB.y - 10);
  const O = toCanvas(canvas, { x: 0, y: 0 });
  ctx.fillText("0", O.x + 6, O.y + 16);
}

function drawArrow(ctx, canvas, start, end, color = "#111", width = 3, label = "") {
  const a = toCanvas(canvas, start);
  const b = toCanvas(canvas, end);
  const ang = Math.atan2(b.y - a.y, b.x - a.x);

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();

  const head = 13;
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x - head * Math.cos(ang - Math.PI / 7), b.y - head * Math.sin(ang - Math.PI / 7));
  ctx.lineTo(b.x - head * Math.cos(ang + Math.PI / 7), b.y - head * Math.sin(ang + Math.PI / 7));
  ctx.closePath();
  ctx.fill();

  if (label) {
    ctx.font = "bold 18px Georgia";
    ctx.fillText(label, (a.x + b.x) / 2 + 8, (a.y + b.y) / 2 - 8);
  }
}

function drawHandle(ctx, canvas, p, color = "#111") {
  const c = toCanvas(canvas, p);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(c.x, c.y, 8, 0, Math.PI * 2);
  ctx.fill();
}

function drawSupportLine(ctx, canvas, u) {
  const m = norm(u);
  if (m === 0) return;
  const d = { x: u.x / m, y: u.y / m };
  const a = { x: -8 * d.x, y: -8 * d.y };
  const b = { x: 8 * d.x, y: 8 * d.y };
  const A = toCanvas(canvas, a);
  const B = toCanvas(canvas, b);
  ctx.strokeStyle = "#9ca3af";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(A.x, A.y);
  ctx.lineTo(B.x, B.y);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawAngleArc(ctx, canvas, u, v, radius = 58) {
  const O = toCanvas(canvas, { x: 0, y: 0 });
  const a1 = Math.atan2(u.y, u.x);
  const a2 = Math.atan2(v.y, v.x);
  let diff = a2 - a1;
  while (diff <= -Math.PI) diff += 2 * Math.PI;
  while (diff > Math.PI) diff -= 2 * Math.PI;

  const start = -a1;
  const end = -(a1 + diff);
  const anticlockwise = diff > 0;

  ctx.strokeStyle = "#b45309";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(O.x, O.y, radius, start, end, anticlockwise);
  ctx.stroke();

  const mid = a1 + diff / 2;
  ctx.fillStyle = "#b45309";
  ctx.font = "18px Georgia";
  ctx.fillText("θ", O.x + (radius + 16) * Math.cos(mid), O.y - (radius + 12) * Math.sin(mid));
}

function drawRightAngleMarker(ctx, canvas, foot, u, size = 12) {
  const m = norm(u);
  if (m === 0) return;
  const e1 = { x: u.x / m, y: u.y / m };
  const e2 = { x: -e1.y, y: e1.x };
  const s = size / 10;
  const a = { x: foot.x + e1.x * s, y: foot.y + e1.y * s };
  const b = { x: a.x + e2.x * s, y: a.y + e2.y * s };
  const c = { x: foot.x + e2.x * s, y: foot.y + e2.y * s };
  const A = toCanvas(canvas, a);
  const B = toCanvas(canvas, b);
  const C = toCanvas(canvas, c);
  ctx.strokeStyle = "#777";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(A.x, A.y);
  ctx.lineTo(B.x, B.y);
  ctx.lineTo(C.x, C.y);
  ctx.stroke();
}

function drawDashedComponents(ctx, canvas, p) {
  const P = toCanvas(canvas, p);
  const Px = toCanvas(canvas, { x: p.x, y: 0 });
  const Py = toCanvas(canvas, { x: 0, y: p.y });

  ctx.strokeStyle = "#777";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([7, 5]);

  ctx.beginPath();
  ctx.moveTo(P.x, P.y);
  ctx.lineTo(Px.x, Px.y);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(P.x, P.y);
  ctx.lineTo(Py.x, Py.y);
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.fillStyle = "#111";
  ctx.font = "15px Georgia";
  ctx.fillText("u₁", Px.x - 8, Px.y + 22);
  ctx.fillText("u₂", Py.x - 38, Py.y + 5);
}

function drawVectorGraph() {
  const canvas = $("graphVector");
  const ctx = canvas.getContext("2d");
  const u = state.g1.u;
  drawGrid(ctx, canvas);
  drawDashedComponents(ctx, canvas, u);
  drawArrow(ctx, canvas, { x: 0, y: 0 }, u, "#111", 4, "𝐮");
  drawHandle(ctx, canvas, u, "#111");

  $("g1u1").textContent = fmt(u.x);
  $("g1u2").textContent = fmt(u.y);
  $("g1norm").textContent = fmt(norm(u));
}

function drawSumGraph() {
  const canvas = $("graphSum");
  const ctx = canvas.getContext("2d");
  const u = state.g2.u;
  const v = state.g2.v;
  const w = add(u, v);

  drawGrid(ctx, canvas);

  const U = toCanvas(canvas, u);
  const V = toCanvas(canvas, v);
  const W = toCanvas(canvas, w);

  ctx.strokeStyle = "#94a3b8";
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 5]);
  ctx.beginPath();
  ctx.moveTo(U.x, U.y);
  ctx.lineTo(W.x, W.y);
  ctx.lineTo(V.x, V.y);
  ctx.stroke();
  ctx.setLineDash([]);

  drawArrow(ctx, canvas, { x: 0, y: 0 }, u, "#111", 3, "𝐮");
  drawArrow(ctx, canvas, { x: 0, y: 0 }, v, "#334155", 3, "𝐯");
  drawArrow(ctx, canvas, { x: 0, y: 0 }, w, "#0b5cad", 4, "𝐰 = 𝐮 + 𝐯");

  // vectores trasladados
  drawArrow(ctx, canvas, u, w, "#777", 2, "");
  drawArrow(ctx, canvas, v, w, "#777", 2, "");

  drawHandle(ctx, canvas, u, "#111");
  drawHandle(ctx, canvas, v, "#334155");

  $("g2u1").textContent = fmt(u.x);
  $("g2u2").textContent = fmt(u.y);
  $("g2v1").textContent = fmt(v.x);
  $("g2v2").textContent = fmt(v.y);
  $("g2w1").textContent = fmt(w.x);
  $("g2w2").textContent = fmt(w.y);
}

function drawScalarGraph() {
  const canvas = $("graphScalar");
  const ctx = canvas.getContext("2d");
  const u = state.g3.u;
  const cu = scale(u, state.g3.c);

  drawGrid(ctx, canvas);
  drawArrow(ctx, canvas, { x: 0, y: 0 }, u, "#111", 3, "𝐮");
  drawArrow(ctx, canvas, { x: 0, y: 0 }, cu, "#0f766e", 4, "c𝐮");
  drawHandle(ctx, canvas, u, "#111");

  $("scalarValue").textContent = fmt(state.g3.c);
  $("g3cu1").textContent = fmt(cu.x);
  $("g3cu2").textContent = fmt(cu.y);
}

function drawDotGraph() {
  const canvas = $("graphDot");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const u = state.g4.u;
  const v = state.g4.v;
  const d = dot(u, v);
  const theta = angleBetween(u, v);

  drawGrid(ctx, canvas);
  drawArrow(ctx, canvas, { x: 0, y: 0 }, u, "#111", 3, "𝐮");
  drawArrow(ctx, canvas, { x: 0, y: 0 }, v, "#334155", 3, "𝐯");
  drawAngleArc(ctx, canvas, u, v, 58);
  drawHandle(ctx, canvas, u, "#111");
  drawHandle(ctx, canvas, v, "#334155");

  $("g4u1").textContent = fmt(u.x);
  $("g4u2").textContent = fmt(u.y);
  $("g4v1").textContent = fmt(v.x);
  $("g4v2").textContent = fmt(v.y);
  $("g4dot").textContent = fmt(d);
  $("g4angle").textContent = fmt(theta) + "°";

  const sign = $("g4sign");
  if (Math.abs(d) < 0.05) {
    sign.textContent = "Producto nulo: vectores ortogonales";
    sign.style.color = "var(--orange)";
  } else if (d > 0) {
    sign.textContent = "Producto positivo";
    sign.style.color = "var(--green)";
  } else {
    sign.textContent = "Producto negativo";
    sign.style.color = "var(--red)";
  }
}

function drawProjectionGraph() {
  const canvas = $("graphProjection");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const u = state.g5.u;
  const v = state.g5.v;
  const p = projection(v, u);

  drawGrid(ctx, canvas);
  drawSupportLine(ctx, canvas, u);
  drawArrow(ctx, canvas, { x: 0, y: 0 }, u, "#111", 3, "𝐮");
  drawArrow(ctx, canvas, { x: 0, y: 0 }, v, "#334155", 3, "𝐯");
  drawArrow(ctx, canvas, { x: 0, y: 0 }, p, "#0b5cad", 5, "proy");

  const V = toCanvas(canvas, v);
  const P = toCanvas(canvas, p);
  ctx.strokeStyle = "#777";
  ctx.setLineDash([7, 5]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(V.x, V.y);
  ctx.lineTo(P.x, P.y);
  ctx.stroke();
  ctx.setLineDash([]);
  drawRightAngleMarker(ctx, canvas, p, u, 12);

  drawHandle(ctx, canvas, u, "#111");
  drawHandle(ctx, canvas, v, "#334155");

  $("g5p1").textContent = fmt(p.x);
  $("g5p2").textContent = fmt(p.y);
  $("g5comp").textContent = fmt(dot(u, v) / (norm(u) || 1));
}

function setupCrossSvg() {
  const btnUxV = $("btnUxV");
  const btnVxU = $("btnVxU");
  const btnPlane = $("btnTogglePlane");
  if (!btnUxV || !btnVxU || !btnPlane) return;

  const update = () => {
    const normal = $("crossNormal");
    const label = $("crossWLabel");
    const orderLabel = $("crossOrderLabel");
    const senseLabel = $("crossSenseLabel");
    const plane = $("crossPlane");

    if (state.cross.order === "uxv") {
      normal.setAttribute("x1", "220");
      normal.setAttribute("y1", "288");
      normal.setAttribute("x2", "220");
      normal.setAttribute("y2", "78");
      normal.setAttribute("stroke", "#0b5cad");
      normal.setAttribute("marker-end", "url(#arrBlueS3)");
      label.textContent = "𝐰 = 𝐮 × 𝐯";
      label.setAttribute("x", "245");
      label.setAttribute("y", "98");
      label.setAttribute("fill", "#0b5cad");
      orderLabel.textContent = "𝐮 × 𝐯";
      senseLabel.textContent = "positivo";
      senseLabel.style.color = "var(--green)";
      btnUxV.classList.add("active");
      btnVxU.classList.remove("active");
    } else {
      normal.setAttribute("x1", "220");
      normal.setAttribute("y1", "288");
      normal.setAttribute("x2", "220");
      normal.setAttribute("y2", "395");
      normal.setAttribute("stroke", "#b91c1c");
      normal.setAttribute("marker-end", "url(#arrRedS3)");
      label.textContent = "−𝐰 = 𝐯 × 𝐮";
      label.setAttribute("x", "245");
      label.setAttribute("y", "390");
      label.setAttribute("fill", "#b91c1c");
      orderLabel.textContent = "𝐯 × 𝐮";
      senseLabel.textContent = "opuesto";
      senseLabel.style.color = "var(--red)";
      btnVxU.classList.add("active");
      btnUxV.classList.remove("active");
    }

    plane.style.display = state.cross.plane ? "block" : "none";
  };

  btnUxV.addEventListener("click", () => {
    state.cross.order = "uxv";
    update();
  });

  btnVxU.addEventListener("click", () => {
    state.cross.order = "vxu";
    update();
  });

  btnPlane.addEventListener("click", () => {
    state.cross.plane = !state.cross.plane;
    update();
  });

  update();
}

function drawAreaGraph() {
  const canvas = $("graphArea");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const u = state.g7.u;
  const v = state.g7.v;
  const z = cross2D(u, v);
  const area = Math.abs(z);
  const w = add(u, v);

  drawGrid(ctx, canvas);

  const O = toCanvas(canvas, { x: 0, y: 0 });
  const U = toCanvas(canvas, u);
  const V = toCanvas(canvas, v);
  const W = toCanvas(canvas, w);

  ctx.fillStyle = "rgba(11, 92, 173, 0.12)";
  ctx.strokeStyle = "#0b5cad";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(O.x, O.y);
  ctx.lineTo(U.x, U.y);
  ctx.lineTo(W.x, W.y);
  ctx.lineTo(V.x, V.y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = "#94a3b8";
  ctx.setLineDash([8, 5]);
  ctx.beginPath();
  ctx.moveTo(U.x, U.y);
  ctx.lineTo(W.x, W.y);
  ctx.lineTo(V.x, V.y);
  ctx.stroke();
  ctx.setLineDash([]);

  drawArrow(ctx, canvas, { x: 0, y: 0 }, u, "#111", 3, "𝐮");
  drawArrow(ctx, canvas, { x: 0, y: 0 }, v, "#334155", 3, "𝐯");
  drawHandle(ctx, canvas, u, "#111");
  drawHandle(ctx, canvas, v, "#334155");

  $("g7u1").textContent = fmt(u.x);
  $("g7u2").textContent = fmt(u.y);
  $("g7v1").textContent = fmt(v.x);
  $("g7v2").textContent = fmt(v.y);
  $("g7cross").textContent = fmt(z);
  $("g7area").textContent = fmt(area);
}

function setupMixedSvg() {
  const btnBase = $("btnMixedBase");
  const btnHeight = $("btnMixedHeight");
  const btnVolume = $("btnMixedVolume");
  if (!btnBase || !btnHeight || !btnVolume) return;

  const update = () => {
    const base = $("mixedBaseGroup");
    const height = $("mixedHeightGroup");
    const volume = $("mixedVolumeGroup");

    base.style.opacity = state.mixed.base ? "1" : "0.12";
    height.style.opacity = state.mixed.height ? "1" : "0.08";
    volume.style.opacity = state.mixed.volume ? "1" : "0.10";

    $("mixedBaseState").textContent = state.mixed.base ? "visible" : "oculta";
    $("mixedHeightState").textContent = state.mixed.height ? "visible" : "oculta";
    $("mixedVolumeState").textContent = state.mixed.volume ? "visible" : "oculto";

    btnBase.classList.toggle("active", state.mixed.base);
    btnHeight.classList.toggle("active", state.mixed.height);
    btnVolume.classList.toggle("active", state.mixed.volume);
  };

  btnBase.addEventListener("click", () => {
    state.mixed.base = !state.mixed.base;
    update();
  });

  btnHeight.addEventListener("click", () => {
    state.mixed.height = !state.mixed.height;
    update();
  });

  btnVolume.addEventListener("click", () => {
    state.mixed.volume = !state.mixed.volume;
    update();
  });

  update();
}

function drawCoplanarityGraph() {
  const canvas = $("graphCoplanarity");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const h = state.g9.h;

  drawGrid(ctx, canvas);

  // Base simplificada generada por 𝐯 y 𝐰
  const O = { x: -3, y: -2 };
  const v = { x: 3, y: -2 };
  const w = { x: -1, y: 2 };
  const base4 = add(v, { x: w.x - O.x, y: w.y - O.y });

  const pO = toCanvas(canvas, O);
  const pV = toCanvas(canvas, v);
  const pW = toCanvas(canvas, w);
  const pB = toCanvas(canvas, base4);

  ctx.fillStyle = "rgba(11, 92, 173, 0.12)";
  ctx.strokeStyle = "#0b5cad";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pO.x, pO.y);
  ctx.lineTo(pV.x, pV.y);
  ctx.lineTo(pB.x, pB.y);
  ctx.lineTo(pW.x, pW.y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  drawArrow(ctx, canvas, O, v, "#111", 3, "𝐯");
  drawArrow(ctx, canvas, O, w, "#334155", 3, "𝐰");

  // Tercer vector 𝐮 con altura orientada h.
  // Lo representamos como una flecha vertical desde la base.
  const uEnd = { x: -3, y: -2 + h };
  drawArrow(ctx, canvas, O, uEnd, h >= 0 ? "#0f766e" : "#b91c1c", 4, "𝐮");

  ctx.strokeStyle = "#b45309";
  ctx.setLineDash([7, 5]);
  ctx.lineWidth = 2;
  const qO = toCanvas(canvas, O);
  const qU = toCanvas(canvas, uEnd);
  ctx.beginPath();
  ctx.moveTo(qU.x, qU.y);
  ctx.lineTo(qO.x, qO.y);
  ctx.stroke();
  ctx.setLineDash([]);

  const mixed = 6 * h;
  $("coplanarH").textContent = fmt(h);
  $("coplanarValue").textContent = fmt(mixed);

  const label = $("coplanarState");
  if (Math.abs(h) < 0.001) {
    label.textContent = "Coplanares";
    label.style.color = "var(--green)";
  } else {
    label.textContent = "No coplanares";
    label.style.color = "var(--red)";
  }
}

function redrawAll() {
  drawVectorGraph();
  drawSumGraph();
  drawScalarGraph();
  drawDotGraph();
  drawProjectionGraph();
  drawAreaGraph();
  drawCoplanarityGraph();
}

function pointerPosition(ev, canvas) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (ev.clientX - rect.left) * canvas.width / rect.width,
    y: (ev.clientY - rect.top) * canvas.height / rect.height
  };
}

function nearPoint(canvas, pointer, p) {
  const q = toCanvas(canvas, p);
  return Math.hypot(pointer.x - q.x, pointer.y - q.y) < 55;
}

function nearestEndpoint(canvas, pointer, candidates) {
  let best = null;
  let bestDistance = Infinity;

  candidates.forEach(item => {
    const q = toCanvas(canvas, item.point);
    const d = Math.hypot(pointer.x - q.x, pointer.y - q.y);
    if (d < bestDistance) {
      bestDistance = d;
      best = item.name;
    }
  });

  // radio amplio para que sea fácil tomar el vector, sin tener que hacer clic exacto
  return bestDistance < 95 ? best : null;
}

function startCanvasDrag(canvas, ev) {
  canvas.classList.add("dragging");
  if (canvas.setPointerCapture) {
    try { canvas.setPointerCapture(ev.pointerId); } catch (e) {}
  }
}

function stopCanvasDrag(canvas, ev) {
  if (!canvas) return;
  canvas.classList.remove("dragging");
  if (canvas.releasePointerCapture && ev) {
    try { canvas.releasePointerCapture(ev.pointerId); } catch (e) {}
  }
}

function setupDragging() {
  const graphVector = $("graphVector");
  graphVector.addEventListener("pointerdown", (ev) => {
    ev.preventDefault();
    const p = pointerPosition(ev, graphVector);
    const selected = nearestEndpoint(graphVector, p, [{ name: "u", point: state.g1.u }]);
    if (selected) { state.g1.drag = selected; startCanvasDrag(graphVector, ev); }
  });
  graphVector.addEventListener("pointermove", (ev) => {
    if (!state.g1.drag) return;
    ev.preventDefault();
    const p = pointerPosition(ev, graphVector);
    state.g1.u = clampPoint(fromCanvas(graphVector, p.x, p.y));
    drawVectorGraph();
  });

  const graphSum = $("graphSum");
  graphSum.addEventListener("pointerdown", (ev) => {
    ev.preventDefault();
    const p = pointerPosition(ev, graphSum);
    const selected = nearestEndpoint(graphSum, p, [
      { name: "u", point: state.g2.u },
      { name: "v", point: state.g2.v }
    ]);
    if (selected) { state.g2.drag = selected; startCanvasDrag(graphSum, ev); }
  });
  graphSum.addEventListener("pointermove", (ev) => {
    if (!state.g2.drag) return;
    ev.preventDefault();
    const p = pointerPosition(ev, graphSum);
    const val = clampPoint(fromCanvas(graphSum, p.x, p.y));
    if (state.g2.drag === "u") state.g2.u = val;
    if (state.g2.drag === "v") state.g2.v = val;
    drawSumGraph();
  });

  const graphScalar = $("graphScalar");
  graphScalar.addEventListener("pointerdown", (ev) => {
    ev.preventDefault();
    const p = pointerPosition(ev, graphScalar);
    const selected = nearestEndpoint(graphScalar, p, [{ name: "u", point: state.g3.u }]);
    if (selected) { state.g3.drag = selected; startCanvasDrag(graphScalar, ev); }
  });
  graphScalar.addEventListener("pointermove", (ev) => {
    if (!state.g3.drag) return;
    ev.preventDefault();
    const p = pointerPosition(ev, graphScalar);
    state.g3.u = clampPoint(fromCanvas(graphScalar, p.x, p.y));
    drawScalarGraph();
  });

  window.addEventListener("pointerup", (ev) => {
    document.querySelectorAll("canvas.dragging").forEach(c => stopCanvasDrag(c, ev));
    state.g1.drag = null;
    state.g2.drag = null;
    state.g3.drag = null;
    state.g4.drag = null;
    state.g5.drag = null;
    state.g7.drag = null;
  });

  window.addEventListener("pointercancel", (ev) => {
    document.querySelectorAll("canvas.dragging").forEach(c => stopCanvasDrag(c, ev));
    state.g1.drag = null;
    state.g2.drag = null;
    state.g3.drag = null;
    state.g4.drag = null;
    state.g5.drag = null;
    state.g7.drag = null;
  });

  $("scalarSlider").addEventListener("input", (ev) => {
    state.g3.c = Number(ev.target.value);
    drawScalarGraph();
  });

  const graphDot = $("graphDot");
  if (graphDot) {
    graphDot.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      const p = pointerPosition(ev, graphDot);
      const selected = nearestEndpoint(graphDot, p, [
        { name: "u", point: state.g4.u },
        { name: "v", point: state.g4.v }
      ]);
      if (selected) { state.g4.drag = selected; startCanvasDrag(graphDot, ev); }
    });
    graphDot.addEventListener("pointermove", (ev) => {
      if (!state.g4.drag) return;
      ev.preventDefault();
      const p = pointerPosition(ev, graphDot);
      const val = clampPoint(fromCanvas(graphDot, p.x, p.y));
      if (state.g4.drag === "u") state.g4.u = val;
      if (state.g4.drag === "v") state.g4.v = val;
      drawDotGraph();
    });
  }

  const graphProjection = $("graphProjection");
  if (graphProjection) {
    graphProjection.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      const p = pointerPosition(ev, graphProjection);
      const selected = nearestEndpoint(graphProjection, p, [
        { name: "u", point: state.g5.u },
        { name: "v", point: state.g5.v }
      ]);
      if (selected) { state.g5.drag = selected; startCanvasDrag(graphProjection, ev); }
    });
    graphProjection.addEventListener("pointermove", (ev) => {
      if (!state.g5.drag) return;
      ev.preventDefault();
      const p = pointerPosition(ev, graphProjection);
      const val = clampPoint(fromCanvas(graphProjection, p.x, p.y));
      if (state.g5.drag === "u") state.g5.u = val;
      if (state.g5.drag === "v") state.g5.v = val;
      drawProjectionGraph();
    });
  }
  const graphArea = $("graphArea");
  if (graphArea) {
    graphArea.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      const p = pointerPosition(ev, graphArea);
      const selected = nearestEndpoint(graphArea, p, [
        { name: "u", point: state.g7.u },
        { name: "v", point: state.g7.v }
      ]);
      if (selected) {
        state.g7.drag = selected;
        startCanvasDrag(graphArea, ev);
      }
    });
    graphArea.addEventListener("pointermove", (ev) => {
      if (!state.g7.drag) return;
      ev.preventDefault();
      const p = pointerPosition(ev, graphArea);
      const val = clampPoint(fromCanvas(graphArea, p.x, p.y));
      if (state.g7.drag === "u") state.g7.u = val;
      if (state.g7.drag === "v") state.g7.v = val;
      drawAreaGraph();
    });
  }

}


function setupModuleSubtabs() {
  document.querySelectorAll(".module-subtabs").forEach((nav) => {
    nav.addEventListener("click", (ev) => {
      const btn = ev.target.closest(".module-subtab");
      if (!btn) return;
      const section = btn.closest(".section");
      if (!section) return;
      const target = btn.dataset.modulePanel;
      section.querySelectorAll(".module-subtab").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      section.querySelectorAll(".module-panel").forEach((panel) => {
        panel.classList.toggle("active", panel.id === target);
      });
      setTimeout(redrawAll, 60);
    });
  });
}

function setupNavigation() {
  document.querySelectorAll(".section-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".section-tab").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
      btn.classList.add("active");
      $(btn.dataset.section).classList.add("active");
      const navigation = btn.closest(".section-tabs");
      if (navigation && navigation.getBoundingClientRect().top < 0) {
        const top = navigation.getBoundingClientRect().top + window.scrollY - 12;
        window.scrollTo({ top, behavior: "smooth" });
      }
      setTimeout(redrawAll, 60);
    });
  });

  document.querySelectorAll(".inner-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      const scope = btn.closest(".module-panel") || btn.closest(".section");
      scope.querySelectorAll(".inner-tab").forEach(b => b.classList.remove("active"));
      scope.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      const target = document.getElementById(btn.dataset.panel);
      if (target) target.classList.add("active");
      setTimeout(redrawAll, 60);
    });
  });
}

function normalizeAnswer(text) {
  return String(text)
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s/g, "")
    .replace(/;/g, ",")
    .replace(/\[/g, "(")
    .replace(/\]/g, ")")
    .replace(/−/g, "-")
    .replace(/𝐢/g, "i")
    .replace(/𝐣/g, "j")
    .replace(/𝐤/g, "k");
}

function setupActivities() {
  document.querySelectorAll(".activity-card").forEach((card) => {
    const item = catalogItem(card, "activity");
    const input = card.querySelector("input");
    const feedback = card.querySelector(".feedback");
    const solution = card.querySelector(".solution");
    const answers = card.dataset.answer.split("|").map(normalizeAnswer);
    const saved = progressData.items[item.id];

    if (saved?.lastAnswer) input.value = saved.lastAnswer;
    if (saved?.correct) {
      feedback.textContent = "Correcto. Progreso guardado.";
      feedback.style.color = "var(--green)";
    }
    applyItemProgress(item);

    card.querySelector(".check-btn").addEventListener("click", () => {
      const user = normalizeAnswer(input.value);
      const isCorrect = answers.includes(user);
      if (isCorrect) {
        feedback.textContent = "Correcto. Progreso guardado.";
        feedback.style.color = "var(--green)";
      } else {
        feedback.textContent = "Revisar. Pedí una pista o mirá la resolución si lo necesitás.";
        feedback.style.color = "var(--red)";
      }
      recordProgress(item, {
        correct: isCorrect,
        answer: input.value
      });
    });

    card.querySelector(".hint-btn").addEventListener("click", () => {
      feedback.textContent = card.dataset.hint ? "Pista: " + card.dataset.hint : "Pista: revisá la definición o aplicá la fórmula componente a componente.";
      feedback.style.color = "var(--orange)";
      recordLearningSupport(item, "hint");
    });

    card.querySelector(".solution-btn").addEventListener("click", () => {
      solution.classList.toggle("visible");
      if (solution.classList.contains("visible")) recordLearningSupport(item, "solution");
    });
  });
}

function setupQuiz() {
  document.querySelectorAll(".quiz-card").forEach((card) => {
    const item = catalogItem(card, "quiz");
    const correct = Number(card.dataset.correct);
    const buttons = [...card.querySelectorAll("button")];
    const feedback = card.querySelector(".quiz-feedback");
    const saved = progressData.items[item.id];

    if (Number.isInteger(saved?.selectedIndex)) {
      buttons.forEach((button, buttonIndex) => {
        button.disabled = saved.correct || buttonIndex === saved.selectedIndex;
        if (buttonIndex === correct) button.classList.add("correct");
        if (buttonIndex === saved.selectedIndex && buttonIndex !== correct) button.classList.add("wrong");
      });
      feedback.textContent = saved.correct ? "Correcto. Progreso guardado." : "Revisar el concepto.";
      feedback.style.color = saved.correct ? "var(--green)" : "var(--red)";
    }
    applyItemProgress(item);

    buttons.forEach((btn, index) => {
      btn.addEventListener("click", () => {
        buttons.forEach((b, i) => {
          b.disabled = index === correct || i === index;
          if (i === correct) b.classList.add("correct");
          if (i === index && i !== correct) b.classList.add("wrong");
        });

        if (index === correct) {
          feedback.textContent = "Correcto. Progreso guardado.";
          feedback.style.color = "var(--green)";
        } else {
          feedback.textContent = "Revisar el concepto.";
          feedback.style.color = "var(--red)";
        }
        recordProgress(item, {
          correct: index === correct,
          answer: btn.textContent,
          selectedIndex: index
        });
      });
    });
  });
}

function init() {
  setupEngagementTracking();
  setupNavigation();
  setupModuleSubtabs();
  setupDragging();
  setupActivities();
  setupQuiz();
  setupProgress();
  renderProgressDashboard();
  setupCrossSvg();
  setupMixedSvg();

  const coplanarSlider = $("coplanarSlider");
  if (coplanarSlider) {
    coplanarSlider.addEventListener("input", (ev) => {
      state.g9.h = Number(ev.target.value);
      drawCoplanarityGraph();
    });
  }

  redrawAll();

  window.vectorLabProgress = {
    getSnapshot() {
      return JSON.parse(JSON.stringify(progressData));
    },
    mergeSnapshot: mergeProgressSnapshot
  };
}

init();
