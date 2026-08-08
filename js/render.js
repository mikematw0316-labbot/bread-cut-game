// render.js — Canvas 繪製層。MUJI 無印風：溫潤大地色、留白、細線，但加入漸層與陰影提升質感。

import { BREADS } from './breads.js';
import { centroid, bbox } from './geometry.js';

const BG = '#F4EFE6';
const PLATE_FILL = '#EDE6D6';
const PLATE_EDGE = '#D8CDB6';
const SELECT = '#A6987C';

export function clearCanvas(ctx, w, h) {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 左上「剩下麵包」獨立區塊：虛線面板 + 標題 + 小盤子，和中央切割區明顯區隔。
export function drawLeftoverZone(ctx, z) {
  ctx.save();
  roundRect(ctx, z.x, z.y, z.w, z.h, 12);
  ctx.fillStyle = 'rgba(237,230,214,0.55)';
  ctx.fill();
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#D8CDB6';
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#8A7E6B';
  ctx.font = '600 12px "Helvetica Neue", "PingFang TC", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('剩下麵包', z.cx, z.y + 15);
  ctx.restore();
  drawPlate(ctx, z.cx, z.cy, z.r);
}

export function drawPlate(ctx, cx, cy, r) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  const g = ctx.createRadialGradient(cx, cy - r * 0.2, r * 0.2, cx, cy, r);
  g.addColorStop(0, '#F3ECDD');
  g.addColorStop(1, PLATE_FILL);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = PLATE_EDGE;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.82, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(180,165,135,0.45)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function tracePoly(ctx, poly) {
  ctx.beginPath();
  ctx.moveTo(poly[0].x, poly[0].y);
  for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
  ctx.closePath();
}

// hex → {r,g,b}
function hexToRgb(h) {
  h = h.replace('#', '');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}
function lighten(hex, amt) {
  const { r, g, b } = hexToRgb(hex);
  const f = (v) => Math.round(v + (255 - v) * amt);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
function darken(hex, amt) {
  const { r, g, b } = hexToRgb(hex);
  const f = (v) => Math.round(v * (1 - amt));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

// 畫一塊麵包。opts: { showDecor, selected, dim, label, labelColor }
export function drawPiece(ctx, poly, breadIdx, opts = {}) {
  const bread = BREADS[breadIdx] || BREADS[0];
  const c = centroid(poly);
  const box = bbox(poly);
  const R = Math.max(box.w, box.h) / 2 || 1;

  // 選取光暈
  if (opts.selected) {
    ctx.save();
    tracePoly(ctx, poly);
    ctx.lineWidth = 6;
    ctx.strokeStyle = SELECT;
    ctx.shadowColor = 'rgba(166,152,124,0.85)';
    ctx.shadowBlur = 22;
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  // 麵團：徑向漸層 + 柔和落影
  tracePoly(ctx, poly);
  ctx.save();
  ctx.shadowColor = 'rgba(120,95,60,0.24)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 6;
  const grad = ctx.createRadialGradient(c.x - R * 0.28, c.y - R * 0.32, R * 0.12, c.x, c.y, R * 1.2);
  grad.addColorStop(0, opts.dim ? '#ECE4D1' : lighten(bread.dough, 0.14));
  grad.addColorStop(0.7, opts.dim ? '#E3D8BE' : bread.dough);
  grad.addColorStop(1, opts.dim ? '#DACDB0' : darken(bread.dough, 0.06));
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();

  // crust 外描邊
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = opts.dim ? '#CBBFA3' : bread.crust;
  ctx.stroke();
  // 內側高光細線（讓邊緣有立體感）
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = 'rgba(255,251,242,0.45)';
  ctx.stroke();

  // 內部裝飾
  if (opts.showDecor && bread.decor) {
    ctx.save();
    tracePoly(ctx, poly);
    ctx.clip();
    ctx.translate(c.x, c.y);
    bread.decor(ctx, R);
    ctx.restore();
  }
  ctx.restore();

  if (opts.label) {
    ctx.save();
    ctx.font = '600 13px "Helvetica Neue", "PingFang TC", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (opts.labelColor) {
      ctx.beginPath();
      ctx.arc(c.x, c.y - 12, 5, 0, Math.PI * 2);
      ctx.fillStyle = opts.labelColor;
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(60,48,32,0.9)';
    ctx.fillText(opts.label, c.x, c.y + 4);
    ctx.restore();
  }
}

function strokePath(ctx, path) {
  ctx.beginPath();
  ctx.moveTo(path[0].x, path[0].y);
  for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
  ctx.stroke();
}

// 切痕預覽：刀刃拖曳般的實線 + 光暈 + 亮點刀尖。
export function drawCutPath(ctx, path) {
  if (!path || path.length < 2) return;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(90,70,45,0.22)';
  ctx.lineWidth = 9;
  strokePath(ctx, path);
  ctx.strokeStyle = 'rgba(66,48,30,0.92)';
  ctx.lineWidth = 2.5;
  strokePath(ctx, path);
  const tip = path[path.length - 1];
  ctx.beginPath();
  ctx.arc(tip.x, tip.y, 3.2, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,251,242,0.95)';
  ctx.fill();
  ctx.restore();
}

// 切開瞬間沿切線畫一道白色閃光（alpha 0→漸隱）。
export function drawSlash(ctx, chain, alpha) {
  if (!chain || chain.length < 2 || alpha <= 0) return;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = `rgba(255,252,245,${alpha})`;
  ctx.lineWidth = 5;
  ctx.shadowColor = `rgba(255,250,235,${alpha})`;
  ctx.shadowBlur = 14;
  strokePath(ctx, chain);
  ctx.restore();
}

// 把剩餘塊縮小塞進左上小盤子（散佈排列）。
export function drawPlatePieces(ctx, pieces, zone) {
  const { cx, cy, r } = zone;
  const n = pieces.length;
  pieces.forEach((pc, i) => {
    const a = (i / Math.max(1, n)) * Math.PI * 2 + 0.5;
    const rr = n === 1 ? 0 : r * 0.45;
    const c = centroid(pc.poly);
    const b = bbox(pc.poly);
    const maxD = Math.max(b.w, b.h) || 1;
    const s = Math.min(0.5, (r * 0.7) / maxD);
    const tx = cx + Math.cos(a) * rr;
    const ty = cy + Math.sin(a) * rr;
    const moved = pc.poly.map((p) => ({ x: tx + (p.x - c.x) * s, y: ty + (p.y - c.y) * s }));
    drawPiece(ctx, moved, pc.breadIdx, { showDecor: false });
  });
}

// 把一組麵包塊等比縮放塞進一個方框（保留彼此相對位置）。回傳每格中心供動畫定位。
function drawPiecesInBox(ctx, pieces, box, scaleBoost = 0) {
  if (!pieces.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const pc of pieces) for (const p of pc.poly) {
    if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
  }
  const w = maxX - minX || 1, h = maxY - minY || 1;
  let s = Math.min(box.w / w, box.h / h) * 0.9;
  s *= (1 + scaleBoost);
  const cx0 = (minX + maxX) / 2, cy0 = (minY + maxY) / 2;
  const bx = box.x + box.w / 2, by = box.y + box.h / 2;
  for (const pc of pieces) {
    const moved = pc.poly.map((p) => ({ x: bx + (p.x - cx0) * s, y: by + (p.y - cy0) * s }));
    drawPiece(ctx, moved, pc.breadIdx, { showDecor: false });
  }
  return { x: bx, y: by };
}

// 底部「戰績列」：每位玩家已獲得的麵包塊（記憶輔助）＋名次色條＋累計面積。
// opts: { activeSeat, pulseSeat, pulseAmt } → 高亮輪到者、獲得瞬間放大脈衝。
export function drawOwnedRoster(ctx, g, z, opts = {}) {
  if (!z || z.h <= 4) return;
  const N = g.N;
  const cw = z.w / N;
  ctx.save();
  ctx.fillStyle = 'rgba(214,205,182,0.18)';
  ctx.fillRect(z.x, z.y, z.w, z.h);
  ctx.strokeStyle = 'rgba(180,165,135,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(z.x, z.y + 0.5); ctx.lineTo(z.x + z.w, z.y + 0.5); ctx.stroke();

  for (let i = 0; i < N; i++) {
    const p = g.players[i];
    const x0 = z.x + cw * i;
    const isLast = i === N - 1;
    const isActive = opts.activeSeat === i;
    const pulse = opts.pulseSeat === i ? (opts.pulseAmt || 0) : 0;

    if (isActive) {
      ctx.fillStyle = 'rgba(166,152,124,0.20)';
      ctx.fillRect(x0, z.y, cw, z.h);
      ctx.strokeStyle = 'rgba(166,152,124,0.85)';
      ctx.lineWidth = 2;
      roundRect(ctx, x0 + 2, z.y + 2, cw - 4, z.h - 4, 8);
      ctx.stroke();
    }
    if (i > 0) {
      ctx.strokeStyle = 'rgba(180,165,135,0.28)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0 + 0.5, z.y + 3); ctx.lineTo(x0 + 0.5, z.y + z.h - 3); ctx.stroke();
    }

    // 頂部玩家色條
    ctx.fillStyle = p.color;
    roundRect(ctx, x0 + 4, z.y + 4, cw - 8, 3, 1.5); ctx.fill();

    // 名字（省空間：僅編號，最後一位加「末」）
    ctx.fillStyle = isActive ? '#4a4136' : '#6b6152';
    ctx.font = '600 10px "Helvetica Neue", "PingFang TC", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(isLast ? `P${i + 1}·末` : `P${i + 1}`, x0 + cw / 2, z.y + 9);

    // 已獲得麵包縮圖
    const pbox = { x: x0 + 3, y: z.y + 22, w: cw - 6, h: z.h - 38 };
    drawPiecesInBox(ctx, p.pieces, pbox, pulse * 0.25);

    // 累計面積
    const area = p.pieces.reduce((s, pc) => s + pc.area, 0);
    ctx.fillStyle = '#8A7E6B';
    ctx.font = '9px "Helvetica Neue", "PingFang TC", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(area > 0 ? Math.round(area) : '—', x0 + cw / 2, z.y + z.h - 3);
  }
  ctx.restore();
}

// 回傳某座位在戰績列的中心點（給「獲得麵包飛入」動畫定位）。
export function rosterCellCenter(g, z, seat) {
  const cw = z.w / g.N;
  return { x: z.x + cw * seat + cw / 2, y: z.y + z.h * 0.55 };
}
