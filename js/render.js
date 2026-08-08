// render.js — Canvas 繪製層。MUJI 無印風：溫潤大地色、留白、細線、無多餘裝飾。
// 職責：畫背景/餐盤、畫麵包（clip 後填麵團色 + 描邊 crust + 內部裝飾）、
//       畫爭議塊、畫切痕預覽、畫已分配塊（帶玩家色）。

import { BREADS } from './breads.js';
import { centroid, bbox } from './geometry.js';

// MUJI 色票
const BG = '#F4EFE6';
const PLATE_FILL = '#EDE6D6';
const PLATE_EDGE = '#D8CDB6';
const CUT_LINE = 'rgba(90,70,45,0.85)';

export function clearCanvas(ctx, w, h) {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);
}

// 畫一個柔和的圓形餐盤在指定位置。
export function drawPlate(ctx, cx, cy, r) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = PLATE_FILL;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = PLATE_EDGE;
  ctx.stroke();
  // 內圈細線
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.82, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(180,165,135,0.5)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

// 用一個多邊形頂點陣列描邊路徑。
function tracePoly(ctx, poly) {
  ctx.beginPath();
  ctx.moveTo(poly[0].x, poly[0].y);
  for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
  ctx.closePath();
}

// 畫一塊麵包（poly = 頂點；breadIdx 決定配色/裝飾）。
// opts: { showDecor, label, labelColor, dim }
export function drawPiece(ctx, poly, breadIdx, opts = {}) {
  const bread = BREADS[breadIdx] || BREADS[0];
  ctx.save();
  tracePoly(ctx, poly);
  // 陰影讓麵包浮起來一點
  ctx.save();
  ctx.shadowColor = 'rgba(120,95,60,0.18)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = opts.dim ? '#E7DEC9' : bread.dough;
  ctx.fill();
  ctx.restore();

  // crust 描邊
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = opts.dim ? '#CBBFA3' : bread.crust;
  ctx.stroke();

  // 內部裝飾：clip 在麵包內，座標平移到形心。
  if (opts.showDecor && bread.decor) {
    const c = centroid(poly);
    const box = bbox(poly);
    const R = Math.max(box.w, box.h) / 2;
    ctx.save();
    tracePoly(ctx, poly);
    ctx.clip();
    ctx.translate(c.x, c.y);
    bread.decor(ctx, R);
    ctx.restore();
  }
  ctx.restore();

  // 標籤（玩家名 / 面積）
  if (opts.label) {
    const c = centroid(poly);
    ctx.save();
    ctx.font = '600 13px "Helvetica Neue", "PingFang TC", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(60,48,32,0.9)';
    if (opts.labelColor) {
      // 小色點
      ctx.beginPath();
      ctx.arc(c.x, c.y - 12, 5, 0, Math.PI * 2);
      ctx.fillStyle = opts.labelColor;
      ctx.fill();
      ctx.fillStyle = 'rgba(60,48,32,0.9)';
    }
    ctx.fillText(opts.label, c.x, c.y + 4);
    ctx.restore();
  }
}

// 畫使用者正在拖曳的切痕折線（預覽）。
export function drawCutPath(ctx, path) {
  if (!path || path.length < 2) return;
  ctx.save();
  ctx.setLineDash([8, 6]);
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.strokeStyle = CUT_LINE;
  ctx.beginPath();
  ctx.moveTo(path[0].x, path[0].y);
  for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
  ctx.stroke();
  ctx.restore();
}

// 畫餐盤上累積的剩餘塊，散佈排列。
export function drawPlatePieces(ctx, pieces, area) {
  const { cx, cy, r } = area;
  const n = pieces.length;
  pieces.forEach((pc, i) => {
    const a = (i / Math.max(1, n)) * Math.PI * 2;
    const rr = n === 1 ? 0 : r * 0.42;
    const ox = cx + Math.cos(a) * rr - centroidX(pc.poly);
    const oy = cy + Math.sin(a) * rr - centroidY(pc.poly);
    const moved = pc.poly.map((p) => ({ x: p.x + ox, y: p.y + oy }));
    drawPiece(ctx, moved, pc.breadIdx, { showDecor: true });
  });
}

function centroidX(poly) { return centroid(poly).x; }
function centroidY(poly) { return centroid(poly).y; }
