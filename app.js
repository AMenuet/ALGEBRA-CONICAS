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
      if (nearPoint(graphArea, p, state.g7.u)) { state.g7.drag = "u"; startCanvasDrag(graphArea, ev); }
      else if (nearPoint(graphArea, p, state.g7.v)) { state.g7.drag = "v"; startCanvasDrag(graphArea, ev); }
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
  document.querySelectorAll(".activity-card").forEach(card => {
    const input = card.querySelector("input");
    const feedback = card.querySelector(".feedback");
    const solution = card.querySelector(".solution");
    const answers = card.dataset.answer.split("|").map(normalizeAnswer);

    card.querySelector(".check-btn").addEventListener("click", () => {
      const user = normalizeAnswer(input.value);
      if (answers.includes(user)) {
        feedback.textContent = "Correcto.";
        feedback.style.color = "var(--green)";
      } else {
        feedback.textContent = "Revisar. Pedí una pista o mirá la resolución si lo necesitás.";
        feedback.style.color = "var(--red)";
      }
    });

    card.querySelector(".hint-btn").addEventListener("click", () => {
      feedback.textContent = card.dataset.hint ? "Pista: " + card.dataset.hint : "Pista: revisá la definición o aplicá la fórmula componente a componente.";
      feedback.style.color = "var(--orange)";
    });

    card.querySelector(".solution-btn").addEventListener("click", () => {
      solution.classList.toggle("visible");
    });
  });
}

function setupQuiz() {
  document.querySelectorAll(".quiz-card").forEach(card => {
    const correct = Number(card.dataset.correct);
    const buttons = [...card.querySelectorAll("button")];
    const feedback = card.querySelector(".quiz-feedback");

    buttons.forEach((btn, index) => {
      btn.addEventListener("click", () => {
        buttons.forEach((b, i) => {
          b.disabled = true;
          if (i === correct) b.classList.add("correct");
          if (i === index && i !== correct) b.classList.add("wrong");
        });

        if (index === correct) {
          feedback.textContent = "Correcto.";
          feedback.style.color = "var(--green)";
        } else {
          feedback.textContent = "Revisar el concepto.";
          feedback.style.color = "var(--red)";
        }
      });
    });
  });
}

function init() {
  setupNavigation();
  setupModuleSubtabs();
  setupDragging();
  setupActivities();
  setupQuiz();
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
}

init();
