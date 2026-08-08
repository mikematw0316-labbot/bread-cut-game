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

export function drawPlatePieces(ctx, pieces, area) {
  const { cx, cy, r } = area;
  const n = pieces.length;
  pieces.forEach((pc, i) => {
    const a = (i / Math.max(1, n)) * Math.PI * 2;
    const rr = n === 1 ? 0 : r * 0.42;
    const c = centroid(pc.poly);
    const ox = cx + Math.cos(a) * rr - c.x;
    const oy = cy + Math.sin(a) * rr - c.y;
    const moved = pc.poly.map((p) => ({ x: p.x + ox, y: p.y + oy }));
    drawPiece(ctx, moved, pc.breadIdx, { showDecor: true });
  });
}
