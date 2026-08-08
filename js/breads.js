// breads.js — 10 種向量麵包。每種是「以形心為中心、半徑函數調變」產生的簡單多邊形，
// 皆盡量近似凸形，確保自由劃線切割穩定（進出邊界各一次）。MUJI 無印風配色：溫潤大地色。

const TAU = Math.PI * 2;

// 依角度半徑函數 rFn(theta) 產生封閉多邊形（steps 個頂點），置於 (cx,cy)，基準尺度 R。
function radial(cx, cy, R, steps, rFn, squashY = 1) {
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * TAU;
    const r = R * rFn(t);
    pts.push({ x: cx + Math.cos(t) * r, y: cy + Math.sin(t) * r * squashY });
  }
  return pts;
}

// 10 種麵包定義。shape() 回傳多邊形；decor() 在已裁切(clip)的麵包內畫簡約裝飾。
export const BREADS = [
  {
    id: 'boule', name: '圓麵包',
    dough: '#ECD9B4', crust: '#C39A61',
    shape: (cx, cy, R) => radial(cx, cy, R, 60, (t) => 1 + 0.03 * Math.sin(t * 7)),
    decor: (ctx, R) => scoreCross(ctx, R * 0.5),
  },
  {
    id: 'shokupan', name: '山型吐司',
    dough: '#F1E6CE', crust: '#CBA877',
    shape: (cx, cy, R) => roundedRect(cx, cy, R * 1.7, R * 1.5, R * 0.45, true),
    decor: (ctx, R) => stripes(ctx, R, 3),
  },
  {
    id: 'batard', name: '橄欖麵包',
    dough: '#E7CFA1', crust: '#B7854B',
    shape: (cx, cy, R) => radial(cx, cy, R, 56, (t) => 1 + 0.02 * Math.sin(t * 5), 0.62),
    decor: (ctx, R) => diagScores(ctx, R, 4),
  },
  {
    id: 'diamond', name: '菱形餐包',
    dough: '#EAD6AE', crust: '#C0925C',
    shape: (cx, cy, R) => roundedPoly(cx, cy, R, [-Math.PI / 2, 0, Math.PI / 2, Math.PI], 0.22),
    decor: (ctx, R) => scoreCross(ctx, R * 0.4),
  },
  {
    id: 'triangle', name: '三角包',
    dough: '#EFDFC0', crust: '#C6A06A',
    shape: (cx, cy, R) => roundedPoly(cx, cy, R, [-Math.PI / 2, Math.PI / 6, Math.PI - Math.PI / 6], 0.28),
    decor: (ctx, R) => sesame(ctx, R, 7),
  },
  {
    id: 'hotdog', name: '熱狗麵包',
    dough: '#EBD5AA', crust: '#BC8C52',
    shape: (cx, cy, R) => stadium(cx, cy, R * 1.9, R * 0.9),
    decor: (ctx, R) => centerSlit(ctx, R),
  },
  {
    id: 'flower', name: '花形麵包',
    dough: '#F0DEB9', crust: '#C89A5F',
    shape: (cx, cy, R) => radial(cx, cy, R, 72, (t) => 0.97 + 0.06 * Math.cos(t * 5)),
    decor: (ctx, R) => sesame(ctx, R, 5),
  },
  {
    id: 'focaccia', name: '方形佛卡夏',
    dough: '#EAD9AF', crust: '#B98C55',
    shape: (cx, cy, R) => roundedRect(cx, cy, R * 1.6, R * 1.35, R * 0.3, false),
    decor: (ctx, R) => dots(ctx, R, 9),
  },
  {
    id: 'teardrop', name: '水滴麵包',
    dough: '#EED9B0', crust: '#C59760',
    shape: (cx, cy, R) => radial(cx, cy, R, 60, (t) => 1 + 0.35 * Math.max(0, Math.cos(t - Math.PI / 2))),
    decor: (ctx, R) => diagScores(ctx, R, 3),
  },
  {
    id: 'dome', name: '半圓饅頭',
    dough: '#F3E9D6', crust: '#D2B589',
    shape: (cx, cy, R) => dome(cx, cy, R),
    decor: (ctx, R) => stripes(ctx, R, 4),
  },
];

// ---- 形狀輔助 ----
function roundedRect(cx, cy, w, h, r, domedTop) {
  const pts = [];
  const hw = w / 2, hh = h / 2;
  const corners = [
    { x: cx + hw - r, y: cy + hh - r, a0: 0, a1: Math.PI / 2 },
    { x: cx - hw + r, y: cy + hh - r, a0: Math.PI / 2, a1: Math.PI },
    { x: cx - hw + r, y: cy - hh + r, a0: Math.PI, a1: Math.PI * 1.5 },
    { x: cx + hw - r, y: cy - hh + r, a0: Math.PI * 1.5, a1: Math.PI * 2 },
  ];
  for (const c of corners) {
    for (let i = 0; i <= 8; i++) {
      const a = c.a0 + (c.a1 - c.a0) * (i / 8);
      let ry = r;
      // 山型吐司：上緣做出圓拱
      if (domedTop && (c.a1 <= Math.PI * 0.5 + 0.01 || c.a0 >= Math.PI * 1.5 - 0.01)) ry = r * 1.35;
      pts.push({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * ry });
    }
  }
  return pts;
}

function stadium(cx, cy, w, h) {
  const pts = [];
  const r = h / 2;
  const hw = w / 2 - r;
  for (let i = 0; i <= 16; i++) { const a = -Math.PI / 2 + Math.PI * (i / 16); pts.push({ x: cx + hw + Math.cos(a) * r, y: cy + Math.sin(a) * r }); }
  for (let i = 0; i <= 16; i++) { const a = Math.PI / 2 + Math.PI * (i / 16); pts.push({ x: cx - hw + Math.cos(a) * r, y: cy + Math.sin(a) * r }); }
  return pts;
}

function roundedPoly(cx, cy, R, angles, round) {
  // 由頂點角度定義的多邊形，每個角以插值稍微收圓。
  const base = angles.map((a) => ({ x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R }));
  const pts = [];
  const n = base.length;
  for (let i = 0; i < n; i++) {
    const p = base[i], nx = base[(i + 1) % n];
    pts.push({ x: p.x + (nx.x - p.x) * round, y: p.y + (nx.y - p.y) * round });
    pts.push({ x: nx.x - (nx.x - p.x) * round, y: nx.y - (nx.y - p.y) * round });
  }
  return pts;
}

function dome(cx, cy, R) {
  const pts = [];
  for (let i = 0; i <= 24; i++) { const a = Math.PI + Math.PI * (i / 24); pts.push({ x: cx + Math.cos(a) * R * 1.15, y: cy + Math.sin(a) * R * 0.95 }); }
  pts.push({ x: cx - R * 1.15, y: cy + R * 0.35 });
  pts.push({ x: cx + R * 1.15, y: cy + R * 0.35 });
  return pts;
}

// ---- 裝飾（畫在 clip 後的麵包內；R 為基準尺度，座標以形心為原點）----
function scoreCross(ctx, len) {
  ctx.strokeStyle = 'rgba(120,86,46,0.35)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-len, 0); ctx.lineTo(len, 0); ctx.moveTo(0, -len); ctx.lineTo(0, len); ctx.stroke();
}
function stripes(ctx, R, n) {
  ctx.strokeStyle = 'rgba(120,86,46,0.22)'; ctx.lineWidth = 2;
  for (let i = 1; i < n; i++) { const x = -R + (2 * R * i) / n; ctx.beginPath(); ctx.moveTo(x, -R); ctx.lineTo(x, R); ctx.stroke(); }
}
function diagScores(ctx, R, n) {
  ctx.strokeStyle = 'rgba(120,86,46,0.3)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) { const x = -R * 0.7 + (1.4 * R * i) / (n - 1 || 1); ctx.beginPath(); ctx.moveTo(x - R * 0.18, -R * 0.28); ctx.lineTo(x + R * 0.18, R * 0.28); ctx.stroke(); }
}
function centerSlit(ctx, R) {
  ctx.strokeStyle = 'rgba(120,86,46,0.28)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-R * 1.2, 0); ctx.lineTo(R * 1.2, 0); ctx.stroke();
}
function sesame(ctx, R, n) {
  ctx.fillStyle = 'rgba(96,66,32,0.5)';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + 0.6, rr = R * 0.45 * (i % 2 ? 0.5 : 1);
    ctx.beginPath(); ctx.ellipse(Math.cos(a) * rr, Math.sin(a) * rr, 3.2, 1.8, a, 0, TAU); ctx.fill();
  }
}
function dots(ctx, R, n) {
  ctx.fillStyle = 'rgba(120,86,46,0.28)';
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU, rr = R * 0.55; ctx.beginPath(); ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr, 3, 0, TAU); ctx.fill(); }
}

export function randomBreadIndex() {
  return Math.floor(Math.random() * BREADS.length);
}
