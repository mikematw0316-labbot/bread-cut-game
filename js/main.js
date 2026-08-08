// main.js — 啟動、輸入處理（自由劃線切割）、UI 階段切換與繪製迴圈。

import * as Game from './game.js';
import { BREADS } from './breads.js';
import { cutPolygonByPath, pointInPolygon, centroid, polygonArea } from './geometry.js';
import * as R from './render.js';

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const messageEl = document.getElementById('message');

let g = null;               // 遊戲狀態
let layout = null;          // { W, H, work:{cx,cy,R}, plate:{cx,cy,r} }
let cutPath = [];           // 目前劃線中的路徑（CSS px 座標）
let cutting = false;
let pickView = null;        // 挑選階段：[{poly, breadIdx}] 已分離位移後的兩塊
let pickAnim = 0;           // 0→1 分離動畫

let selectedCount = 0;

// ---- 畫布尺寸（支援 Retina） ----
function resize() {
  const stage = canvas.parentElement;
  const cssW = stage.clientWidth;
  const cssH = stage.clientHeight;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  layout = {
    W: cssW, H: cssH,
    work: { cx: cssW / 2, cy: cssH * 0.40, R: Math.min(cssW, cssH) * 0.26 },
    plate: { cx: cssW / 2, cy: cssH * 0.84, r: Math.min(cssW, cssH) * 0.15 },
  };
  draw();
}
window.addEventListener('resize', resize);

// ---- 座標轉換 ----
function toLocal(e) {
  const rect = canvas.getBoundingClientRect();
  const p = e.touches ? e.touches[0] : e;
  return { x: p.clientX - rect.left, y: p.clientY - rect.top };
}

// ---- 繪製迴圈 ----
function draw() {
  if (!layout) return;
  R.clearCanvas(ctx, layout.W, layout.H);
  R.drawPlate(ctx, layout.plate.cx, layout.plate.cy, layout.plate.r);
  if (g) R.drawPlatePieces(ctx, g.plate, layout.plate);

  if (!g) return;
  const phase = g.phase;

  if ((phase === 'starterCut' || phase === 'trimCut' || phase === 'decision') && g.contested) {
    R.drawPiece(ctx, g.contested.poly, g.contested.breadIdx, { showDecor: true });
    if (cutPath.length > 1) R.drawCutPath(ctx, cutPath);
  } else if ((phase === 'starterPick' || phase === 'trimPick') && pickView) {
    for (const v of pickView) {
      R.drawPiece(ctx, v.poly, v.breadIdx, { showDecor: true });
    }
  }
}

// ---- 挑選階段：把兩塊沿法線分離，供點選 ----
function enterPickView() {
  const pieces = g.workingPieces;
  const mid = centroid([...pieces[0].poly, ...pieces[1].poly]);
  const gap = layout.work.R * 0.18;
  pickView = pieces.map((pc) => {
    const c = centroid(pc.poly);
    let dx = c.x - mid.x, dy = c.y - mid.y;
    const len = Math.hypot(dx, dy) || 1;
    dx = (dx / len) * gap; dy = (dy / len) * gap;
    return { poly: pc.poly.map((p) => ({ x: p.x + dx, y: p.y + dy })), breadIdx: pc.breadIdx, origin: pc };
  });
}

// ---- 輸入：切割 ----
function onDown(e) {
  if (!g) return;
  const phase = g.phase;
  if (phase === 'starterCut' || phase === 'trimCut') {
    cutting = true;
    cutPath = [toLocal(e)];
    e.preventDefault();
  } else if (phase === 'starterPick' || phase === 'trimPick') {
    const pt = toLocal(e);
    const idx = pickView.findIndex((v) => pointInPolygon(pt, v.poly));
    if (idx >= 0) {
      Game.pickPiece(g, idx);
      pickView = null;
      afterStateChange();
    }
  }
}
function onMove(e) {
  if (!cutting) return;
  cutPath.push(toLocal(e));
  e.preventDefault();
  draw();
}
function onUp(e) {
  if (!cutting) return;
  cutting = false;
  const result = cutPolygonByPath(g.contested.poly, cutPath);
  if (result) {
    Game.applyCut(g, result);
    cutPath = [];
    enterPickView();
    afterStateChange();
  } else {
    // 無效切割：清掉重來
    cutPath = [];
    flashMessage('這一刀沒切到兩邊，再試一次');
    draw();
  }
}
canvas.addEventListener('mousedown', onDown);
canvas.addEventListener('mousemove', onMove);
window.addEventListener('mouseup', onUp);
canvas.addEventListener('touchstart', onDown, { passive: false });
canvas.addEventListener('touchmove', onMove, { passive: false });
window.addEventListener('touchend', onUp);

// ---- 階段 → UI ----
const panels = {
  setup: document.getElementById('panel-setup'),
  bread: document.getElementById('panel-bread'),
  cut: document.getElementById('panel-cut'),
  pick: document.getElementById('panel-pick'),
  decision: document.getElementById('panel-decision'),
  turnend: document.getElementById('panel-turnend'),
  score: document.getElementById('panel-score'),
};
function showPanel(key) {
  for (const k in panels) panels[k].classList.toggle('active', k === key);
}

function syncUI() {
  if (!g) { showPanel('setup'); return; }
  messageEl.textContent = g.message;
  switch (g.phase) {
    case 'selectBread': showPanel('bread'); break;
    case 'starterCut':
    case 'trimCut': showPanel('cut'); break;
    case 'starterPick':
    case 'trimPick': showPanel('pick'); break;
    case 'decision': showPanel('decision'); break;
    case 'lastCollect': showPanel('turnend'); break;
    case 'scoring': showPanel('score'); renderScoreboard(); break;
    default: showPanel('bread');
  }
}

function afterStateChange() {
  syncUI();
  draw();
}

let flashTimer = null;
function flashMessage(text) {
  messageEl.textContent = text;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { if (g) messageEl.textContent = g.message; }, 1800);
}

// ---- 計分板 ----
function renderScoreboard() {
  const board = document.getElementById('scoreboard');
  const rows = g.players
    .map((p) => ({ p, rank: p.roundRank, area: p.roundArea || 0 }))
    .sort((a, b) => a.rank - b.rank);
  board.innerHTML = '';
  for (const { p, rank, area } of rows) {
    const row = document.createElement('div');
    row.className = 'score-row' + (rank === 1 ? ' first' : '');
    row.innerHTML =
      `<span class="rank">#${rank}</span>` +
      `<span><span class="dot" style="background:${p.color}"></span>${p.name}</span>` +
      `<span>${Math.round(area)}</span>` +
      `<span class="pts">+${p.roundScore}（總 ${p.totalScore}）</span>`;
    board.appendChild(row);
  }
  const t = document.createElement('div');
  t.className = 'hint';
  t.style.marginTop = '6px';
  t.textContent = `目標面積 ≈ ${Math.round(g.target)}（越接近越高分）`;
  board.appendChild(t);
}

// ---- 麵包縮圖網格 ----
function buildBreadGrid() {
  const grid = document.getElementById('bread-grid');
  grid.innerHTML = '';
  BREADS.forEach((bread, i) => {
    const cell = document.createElement('div');
    cell.className = 'bread-cell';
    const c = document.createElement('canvas');
    c.width = 56; c.height = 56;
    const cx = c.getContext('2d');
    const poly = bread.shape(28, 28, 20);
    cx.beginPath();
    cx.moveTo(poly[0].x, poly[0].y);
    for (let k = 1; k < poly.length; k++) cx.lineTo(poly[k].x, poly[k].y);
    cx.closePath();
    cx.fillStyle = bread.dough; cx.fill();
    cx.lineWidth = 2; cx.strokeStyle = bread.crust; cx.stroke();
    const label = document.createElement('span');
    label.textContent = bread.name;
    cell.appendChild(c); cell.appendChild(label);
    cell.addEventListener('click', () => startBread(i));
    grid.appendChild(cell);
  });
}

function startBread(idx) {
  Game.chooseBread(g, idx, layout.work.cx, layout.work.cy, layout.work.R);
  cutPath = [];
  afterStateChange();
}

// ---- 按鈕綁定 ----
document.querySelectorAll('.pc-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.pc-btn').forEach((b) => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedCount = parseInt(btn.dataset.n, 10);
    document.getElementById('start-btn').disabled = false;
  });
});
document.getElementById('start-btn').addEventListener('click', () => {
  g = Game.createGame(selectedCount);
  g.message = `${g.players[0].name}：選擇這回合的麵包`;
  afterStateChange();
});
document.getElementById('random-bread').addEventListener('click', () => startBread(null));
document.getElementById('cut-undo').addEventListener('click', () => { cutPath = []; draw(); });
document.getElementById('pass-btn').addEventListener('click', () => { Game.decide(g, 'pass'); afterStateChange(); });
document.getElementById('cut-btn').addEventListener('click', () => { Game.decide(g, 'cut'); cutPath = []; afterStateChange(); });
document.getElementById('next-turn').addEventListener('click', () => { Game.lastCollect(g); afterStateChange(); });
document.getElementById('next-round').addEventListener('click', () => { Game.nextRound(g); afterStateChange(); });
document.getElementById('restart').addEventListener('click', () => { g = null; selectedCount = 0;
  document.querySelectorAll('.pc-btn').forEach((b) => b.classList.remove('selected'));
  document.getElementById('start-btn').disabled = true; syncUI(); draw(); });

// ---- 啟動 ----
buildBreadGrid();
resize();
syncUI();
