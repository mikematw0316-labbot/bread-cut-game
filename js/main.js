// main.js — 啟動、輸入處理（自由劃線切割）、UI 階段切換與繪製迴圈。

import * as Game from './game.js';
import { BREADS } from './breads.js';
import { cutPolygonByPath, pointInPolygon, centroid } from './geometry.js';
import * as R from './render.js';

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const messageEl = document.getElementById('message');

let g = null;               // 遊戲狀態
let layout = null;          // { W, H, work:{cx,cy,R}, plate:{cx,cy,r} }
let cutPath = [];           // 目前劃線中的路徑
let cutting = false;

// 挑選階段
let pickView = null;        // [{ base:[pts], breadIdx, off:{x,y} }]
let pendingPick = null;     // 已點選待確認的索引

// 動畫（切開分離 + 閃光）
let anim = { active: false, start: 0, dur: 380, slash: null };

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
  const zoneW = Math.min(cssW * 0.32, 148);
  const zoneH = zoneW * 0.94;
  const zx = 8, zy = 8;
  layout = {
    W: cssW, H: cssH,
    // 中央大切割區（主焦點）
    work: { cx: cssW / 2, cy: cssH * 0.52, R: Math.min(cssW, cssH) * 0.30 },
    // 左上小盤「剩下麵包」獨立區
    plate: {
      x: zx, y: zy, w: zoneW, h: zoneH,
      cx: zx + zoneW / 2, cy: zy + zoneH * 0.58,
      r: Math.min(zoneW, zoneH) * 0.32,
    },
  };
  draw();
}
window.addEventListener('resize', resize);

function toLocal(e) {
  const rect = canvas.getBoundingClientRect();
  const p = e.touches ? e.touches[0] : e;
  return { x: p.clientX - rect.left, y: p.clientY - rect.top };
}

const easeOut = (t) => 1 - Math.pow(1 - t, 3);

// ---- 動畫迴圈 ----
function tick(ts) {
  if (!anim.active) return;
  if (!anim.start) anim.start = ts;
  const t = Math.min(1, (ts - anim.start) / anim.dur);
  anim.t = easeOut(t);
  anim.slashAlpha = Math.max(0, 1 - t * 1.4);
  draw();
  if (t < 1) requestAnimationFrame(tick);
  else { anim.active = false; anim.start = 0; anim.t = 1; draw(); }
}
function startAnim() {
  anim.active = true; anim.start = 0; anim.t = 0; anim.slashAlpha = 1;
  requestAnimationFrame(tick);
}
function pickT() { return anim.active ? anim.t : 1; }

function movedPoly(v, t) {
  return v.base.map((p) => ({ x: p.x + v.off.x * t, y: p.y + v.off.y * t }));
}

// ---- 繪製 ----
function draw() {
  if (!layout) return;
  R.clearCanvas(ctx, layout.W, layout.H);
  R.drawLeftoverZone(ctx, layout.plate);
  if (g) {
    // 左上「剩下麵包」= 尚未進場的主麵包池 pool（若有）+ 修下的碎塊 scraps
    const leftover = (g.pool ? [g.pool] : []).concat(g.scraps);
    R.drawPlatePieces(ctx, leftover, layout.plate);
  }
  if (!g) return;

  const phase = g.phase;
  if ((phase === 'starterCut' || phase === 'trimCut' || phase === 'decision') && g.contested) {
    R.drawPiece(ctx, g.contested.poly, g.contested.breadIdx, { showDecor: true });
    if (cutPath.length > 1) R.drawCutPath(ctx, cutPath);
  } else if ((phase === 'starterPick' || phase === 'trimPick') && pickView) {
    const t = pickT();
    pickView.forEach((v, i) => {
      const poly = movedPoly(v, t);
      R.drawPiece(ctx, poly, v.breadIdx, {
        showDecor: true,
        selected: pendingPick === i,
        dim: pendingPick !== null && pendingPick !== i,
      });
    });
    if (anim.slash && anim.slashAlpha > 0) R.drawSlash(ctx, anim.slash, anim.slashAlpha);
  }
}

// ---- 進入挑選：把兩塊沿「彼此形心連線」大幅推開，並播放分離動畫 ----
function enterPickView() {
  const pieces = g.workingPieces;
  const cA = centroid(pieces[0].poly);
  const cB = centroid(pieces[1].poly);
  let dx = cA.x - cB.x, dy = cA.y - cB.y;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len; dy /= len;
  const half = layout.work.R * 0.42; // 每塊往外推的距離（合計 ~0.84R 的明顯間隙）
  pickView = [
    { base: pieces[0].poly, breadIdx: pieces[0].breadIdx, off: { x: dx * half, y: dy * half } },
    { base: pieces[1].poly, breadIdx: pieces[1].breadIdx, off: { x: -dx * half, y: -dy * half } },
  ];
  pendingPick = null;
  startAnim();
}

// ---- 輸入 ----
function onDown(e) {
  if (!g) return;
  const phase = g.phase;
  if (phase === 'starterCut' || phase === 'trimCut') {
    cutting = true;
    cutPath = [toLocal(e)];
    e.preventDefault();
  } else if (phase === 'starterPick' || phase === 'trimPick') {
    if (anim.active) return;
    const pt = toLocal(e);
    const idx = pickView.findIndex((v) => pointInPolygon(pt, movedPoly(v, 1)));
    if (idx >= 0) {
      pendingPick = idx;
      const btn = document.getElementById('confirm-pick');
      btn.disabled = false;
      messageEl.textContent = '已選這塊 → 按下方按鈕交給下一位';
      draw();
    }
  }
}
function onMove(e) {
  if (!cutting) return;
  cutPath.push(toLocal(e));
  e.preventDefault();
  draw();
}
function onUp() {
  if (!cutting) return;
  cutting = false;
  const result = cutPolygonByPath(g.contested.poly, cutPath);
  if (result) {
    anim.slash = [...cutPath];       // 閃光沿玩家切線
    Game.applyCut(g, result);
    cutPath = [];
    enterPickView();
    afterStateChange();
  } else {
    cutPath = [];
    flashMessage('這一刀不乾淨：請從麵包一側劃到另一側（一刀切成兩塊），再試一次');
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
    case 'trimPick':
      showPanel('pick');
      document.getElementById('confirm-pick').disabled = true;
      break;
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
    // 用主繪製函式畫縮圖，確保和遊戲內一致的質感
    const poly = bread.shape(28, 28, 18);
    R.drawPiece(cx, poly, i, { showDecor: true });
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
let selectedCount = 0;
document.getElementById('start-btn').addEventListener('click', () => {
  g = Game.createGame(selectedCount);
  g.message = `${g.players[0].name}：選擇要分的麵包（全程只有這一塊）`;
  afterStateChange();
});
document.getElementById('random-bread').addEventListener('click', () => startBread(null));
document.getElementById('cut-undo').addEventListener('click', () => { cutPath = []; draw(); });
document.getElementById('confirm-pick').addEventListener('click', () => {
  if (pendingPick === null) return;
  Game.pickPiece(g, pendingPick);
  pickView = null; pendingPick = null; anim.slash = null;
  afterStateChange();
});
document.getElementById('pass-btn').addEventListener('click', () => { Game.decide(g, 'pass'); afterStateChange(); });
document.getElementById('cut-btn').addEventListener('click', () => { Game.decide(g, 'cut'); cutPath = []; afterStateChange(); });
document.getElementById('next-turn').addEventListener('click', () => { Game.lastCollect(g); afterStateChange(); });
document.getElementById('next-round').addEventListener('click', () => { Game.nextRound(g); afterStateChange(); });
document.getElementById('restart').addEventListener('click', () => {
  g = null; selectedCount = 0; pickView = null; pendingPick = null;
  document.querySelectorAll('.pc-btn').forEach((b) => b.classList.remove('selected'));
  document.getElementById('start-btn').disabled = true;
  syncUI(); draw();
});

// ---- 啟動 ----
buildBreadGrid();
resize();
syncUI();
