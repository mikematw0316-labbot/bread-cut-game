// main.js — 啟動、輸入處理（自由劃線切割）、UI 階段切換、繪製迴圈與遊戲感特效。

import * as Game from './game.js';
import { BREADS } from './breads.js';
import { cutPolygonByPath, pointInPolygon, centroid } from './geometry.js';
import * as R from './render.js';

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const messageEl = document.getElementById('message');

let g = null;               // 遊戲狀態
let layout = null;          // { W, H, work:{cx,cy,R}, plate:{...}, roster:{x,y,w,h} }
let cutPath = [];           // 目前劃線中的路徑
let cutting = false;

// 挑選階段
let pickView = null;        // [{ base:[pts], breadIdx, off:{x,y} }]
let pendingPick = null;     // 已點選待確認的索引

// ---- 動畫狀態（統一 rAF 迴圈驅動） ----
let pickAnim = null;        // { start, dur, t }
let award = null;           // { poly, breadIdx, from, to, seat, start, dur, tt }
let pulse = null;           // { seat, start, dur, amt }
let slash = null;           // { chain, start, alpha }
let particles = [];         // 粒子（碎屑 / 彩帶）
let running = false;        // 迴圈是否運轉中

// ---- 緩動 ----
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeOutBack = (t) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

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
  // 底部「戰績列」固定保留一條帶狀區
  const rosterH = Math.max(74, Math.min(cssH * 0.24, 122));
  const workBottom = cssH - rosterH;

  layout = {
    W: cssW, H: cssH,
    // 中央大切割區（主焦點）— 位於頂部盤區與底部戰績列之間
    work: { cx: cssW / 2, cy: workBottom * 0.52, R: Math.min(cssW, workBottom) * 0.30 },
    // 左上小盤「剩下麵包」獨立區
    plate: {
      x: zx, y: zy, w: zoneW, h: zoneH,
      cx: zx + zoneW / 2, cy: zy + zoneH * 0.58,
      r: Math.min(zoneW, zoneH) * 0.32,
    },
    // 底部戰績列
    roster: { x: 6, y: workBottom + 4, w: cssW - 12, h: rosterH - 8 },
  };
  draw();
}
window.addEventListener('resize', resize);

function toLocal(e) {
  const rect = canvas.getBoundingClientRect();
  const p = e.touches ? e.touches[0] : e;
  return { x: p.clientX - rect.left, y: p.clientY - rect.top };
}

// ---- 統一動畫迴圈 ----
function frame(ts) {
  let alive = false;

  if (pickAnim) {
    if (!pickAnim.start) pickAnim.start = ts;
    pickAnim.t = Math.min(1, (ts - pickAnim.start) / pickAnim.dur);
    if (pickAnim.t < 1) alive = true;
  }
  if (award) {
    if (!award.start) award.start = ts;
    award.tt = Math.min(1, (ts - award.start) / award.dur);
    if (award.tt < 1) alive = true; else award = null;
  }
  if (pulse) {
    if (!pulse.start) pulse.start = ts;
    const pt = Math.min(1, (ts - pulse.start) / pulse.dur);
    pulse.amt = Math.sin(pt * Math.PI);   // 0 → 1 → 0
    if (pt < 1) alive = true; else pulse = null;
  }
  if (slash) {
    if (!slash.start) slash.start = ts;
    slash.alpha = Math.max(0, 1 - ((ts - slash.start) / 260) * 1.4);
    if (slash.alpha > 0) alive = true; else slash = null;
  }
  if (particles.length) { stepParticles(); alive = true; }

  draw();
  if (alive) requestAnimationFrame(frame);
  else running = false;
}
function ensureLoop() {
  if (!running) { running = true; requestAnimationFrame(frame); }
}

// ---- 粒子 ----
function stepParticles() {
  const next = [];
  for (const p of particles) {
    p.vy += p.g;
    p.vx *= 0.99;
    p.x += p.vx;
    p.y += p.vy;
    if (p.vr != null) p.rot += p.vr;
    p.life -= 1;
    if (p.life > 0 && p.y < layout.H + 20) next.push(p);
  }
  particles = next;
}
const CRUMB_COLORS = ['#E4C48C', '#D8A96A', '#C68B4E', '#B5793C', '#EAD8A6'];
function spawnCrumbs(x, y) {
  for (let i = 0; i < 22; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 1.5 + Math.random() * 4.5;
    particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2.2, g: 0.24,
      life: 28 + Math.random() * 22, maxLife: 50,
      size: 1.5 + Math.random() * 3, shape: 'crumb',
      color: CRUMB_COLORS[(Math.random() * CRUMB_COLORS.length) | 0],
    });
  }
}
function spawnConfetti() {
  const cols = Game.PLAYER_COLORS;
  for (let i = 0; i < 90; i++) {
    particles.push({
      x: Math.random() * layout.W, y: -10 - Math.random() * 40,
      vx: (Math.random() - 0.5) * 2.4, vy: 1 + Math.random() * 2.8, g: 0.06,
      life: 90 + Math.random() * 70, maxLife: 160,
      size: 3 + Math.random() * 4, shape: 'confetti',
      color: cols[(Math.random() * cols.length) | 0],
      rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
    });
  }
}
function drawParticles() {
  for (const p of particles) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.maxLife));
    ctx.fillStyle = p.color;
    if (p.shape === 'confetti') {
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
    } else {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}

// ---- WebAudio 合成音效（無素材，首次手勢解鎖） ----
let actx = null;
function audio() {
  if (!actx) {
    try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; }
  }
  return actx;
}
function unlockAudio() { const a = audio(); if (a && a.state === 'suspended') a.resume(); }
function beep(freq, dur, type = 'sine', gain = 0.08, slideTo = null) {
  const a = audio(); if (!a) return;
  const t0 = a.currentTime;
  const o = a.createOscillator(), gn = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  gn.gain.setValueAtTime(gain, t0);
  gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(gn); gn.connect(a.destination);
  o.start(t0); o.stop(t0 + dur);
}
function sound(kind) {
  if (kind === 'slice') beep(340, 0.18, 'sawtooth', 0.05, 130);
  else if (kind === 'pick') beep(540, 0.12, 'triangle', 0.07);
  else if (kind === 'win') { beep(523, 0.12, 'sine', 0.08); setTimeout(() => beep(784, 0.16, 'sine', 0.08), 90); }
  else if (kind === 'fanfare') [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.24, 'triangle', 0.08), i * 130));
}

// ---- 繪製 ----
function movedPoly(v, t) {
  return v.base.map((p) => ({ x: p.x + v.off.x * t, y: p.y + v.off.y * t }));
}
function activeSeat() {
  if (!g) return -1;
  switch (g.phase) {
    case 'starterCut': case 'starterPick': return g.starter;
    case 'decision': case 'trimCut': case 'trimPick': return g.currentActor;
    case 'lastCollect': return g.N - 1;
    default: return -1;
  }
}
function drawAward() {
  const t = easeInOut(award.tt);
  const dx = (award.to.x - award.from.x) * t;
  const dy = (award.to.y - award.from.y) * t;
  const s = 1 - 0.72 * t;
  const c = award.from;
  const poly = award.poly.map((p) => ({
    x: c.x + (p.x - c.x) * s + dx,
    y: c.y + (p.y - c.y) * s + dy,
  }));
  ctx.save();
  ctx.globalAlpha = 1 - 0.1 * t;
  R.drawPiece(ctx, poly, award.breadIdx, { showDecor: true, selected: true });
  ctx.restore();
}
function draw() {
  if (!layout) return;
  R.clearCanvas(ctx, layout.W, layout.H);
  R.drawLeftoverZone(ctx, layout.plate);

  if (g) {
    // 左上「剩下麵包」= 餐盤上剩下的整塊（輪間 pool，或決策中的 remainder）
    const plateBread = g.pool || (g.phase === 'decision' ? null : g.remainder);
    R.drawPlatePieces(ctx, plateBread ? [plateBread] : [], layout.plate);

    const phase = g.phase;
    if ((phase === 'starterCut' || phase === 'trimCut') && g.roundBread) {
      // 切割：永遠顯示「整塊」roundBread（含放回餐盤的那塊已重新合體）
      R.drawPiece(ctx, g.roundBread.poly, g.roundBread.breadIdx, { showDecor: true });
      if (cutPath.length > 1) R.drawCutPath(ctx, cutPath);
    } else if (phase === 'decision' && g.claim) {
      // 決策：整塊呈現 → claim（高亮）＋ remainder（暗淡），一眼看懂爭議塊
      if (g.remainder) R.drawPiece(ctx, g.remainder.poly, g.remainder.breadIdx, { showDecor: true, dim: true });
      R.drawPiece(ctx, g.claim.poly, g.claim.breadIdx, { showDecor: true, selected: true });
    } else if ((phase === 'starterPick' || phase === 'trimPick') && pickView) {
      const t = pickAnim ? easeOutBack(pickAnim.t) : 1;
      pickView.forEach((v, i) => {
        R.drawPiece(ctx, movedPoly(v, t), v.breadIdx, {
          showDecor: true,
          selected: pendingPick === i,
          dim: pendingPick !== null && pendingPick !== i,
        });
      });
    }

    // 底部戰績列（每位玩家已獲得的麵包，永久顯示）
    R.drawOwnedRoster(ctx, g, layout.roster, {
      activeSeat: activeSeat(),
      pulseSeat: pulse ? pulse.seat : -1,
      pulseAmt: pulse ? pulse.amt : 0,
    });
  }

  if (slash && slash.alpha > 0) R.drawSlash(ctx, slash.chain, slash.alpha);
  if (award) drawAward();
  if (particles.length) drawParticles();
}

// ---- 進入挑選：把兩塊沿「彼此形心連線」大幅推開，播放彈跳分離動畫 ----
function enterPickView() {
  const pieces = g.workingPieces;
  const cA = centroid(pieces[0].poly);
  const cB = centroid(pieces[1].poly);
  let dx = cA.x - cB.x, dy = cA.y - cB.y;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len; dy /= len;
  const half = layout.work.R * 0.42;
  pickView = [
    { base: pieces[0].poly, breadIdx: pieces[0].breadIdx, off: { x: dx * half, y: dy * half } },
    { base: pieces[1].poly, breadIdx: pieces[1].breadIdx, off: { x: -dx * half, y: -dy * half } },
  ];
  pendingPick = null;
  pickAnim = { start: 0, dur: 460, t: 0 };
  ensureLoop();
}

// ---- 獲得麵包：飛入戰績列 + 碎屑爆開 + 該格脈動 ----
function consumeWin() {
  if (!g || !g.lastWin) return;
  const { seat, piece } = g.lastWin;
  const from = centroid(piece.poly);
  const to = R.rosterCellCenter(g, layout.roster, seat);
  award = { poly: piece.poly, breadIdx: piece.breadIdx, from, to, seat, start: 0, dur: 720, tt: 0 };
  pulse = { seat, start: 0, dur: 640, amt: 0 };
  spawnCrumbs(from.x, from.y);
  sound('win');
  g.lastWin = null;
  ensureLoop();
}

// ---- 輸入 ----
function onDown(e) {
  unlockAudio();
  if (!g) return;
  const phase = g.phase;
  if (phase === 'starterCut' || phase === 'trimCut') {
    cutting = true;
    cutPath = [toLocal(e)];
    e.preventDefault();
  } else if (phase === 'starterPick' || phase === 'trimPick') {
    if (pickAnim && pickAnim.t < 1) return;
    const pt = toLocal(e);
    const idx = pickView.findIndex((v) => pointInPolygon(pt, movedPoly(v, 1)));
    if (idx >= 0) {
      pendingPick = idx;
      document.getElementById('confirm-pick').disabled = false;
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
  const result = cutPolygonByPath(g.roundBread.poly, cutPath);
  if (result) {
    slash = { chain: [...cutPath], start: 0, alpha: 1 };
    sound('slice');
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
  if (g && g.lastWin) consumeWin();
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
let selectedCount = 0;
document.querySelectorAll('.pc-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.pc-btn').forEach((b) => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedCount = parseInt(btn.dataset.n, 10);
    document.getElementById('start-btn').disabled = false;
  });
});
document.getElementById('start-btn').addEventListener('click', () => {
  unlockAudio();
  g = Game.createGame(selectedCount);
  g.message = `${g.players[0].name}：選擇要分的麵包（全程只有這一塊）`;
  afterStateChange();
});
document.getElementById('random-bread').addEventListener('click', () => startBread(null));
document.getElementById('cut-undo').addEventListener('click', () => { cutPath = []; draw(); });
document.getElementById('confirm-pick').addEventListener('click', () => {
  if (pendingPick === null) return;
  sound('pick');
  Game.pickPiece(g, pendingPick);
  pickView = null; pendingPick = null; pickAnim = null; slash = null;
  afterStateChange();
});
document.getElementById('pass-btn').addEventListener('click', () => { Game.decide(g, 'pass'); afterStateChange(); });
document.getElementById('cut-btn').addEventListener('click', () => { Game.decide(g, 'cut'); cutPath = []; afterStateChange(); });
document.getElementById('next-turn').addEventListener('click', () => {
  Game.lastCollect(g);
  afterStateChange();
  spawnConfetti();
  sound('fanfare');
  ensureLoop();
});
document.getElementById('next-round').addEventListener('click', () => { Game.nextRound(g); afterStateChange(); });
document.getElementById('restart').addEventListener('click', () => {
  g = null; selectedCount = 0;
  pickView = null; pendingPick = null;
  pickAnim = null; award = null; pulse = null; slash = null; particles = [];
  document.querySelectorAll('.pc-btn').forEach((b) => b.classList.remove('selected'));
  document.getElementById('start-btn').disabled = true;
  syncUI(); draw();
});

// ---- 啟動 ----
buildBreadGrid();
resize();
syncUI();
