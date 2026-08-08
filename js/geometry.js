// geometry.js — 多邊形幾何運算：面積、點內判定、線段相交、以自由劃線切割多邊形。
// 麵包 = 一組頂點的簡單多邊形。切一刀 = 一條折線（pointer 路徑），把多邊形切成兩塊。

export function polygonArea(pts) {
  // Shoelace 公式，回傳絕對面積。
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

export function centroid(pts) {
  // 多邊形形心（面積加權）。退化時回傳頂點平均。
  let cx = 0, cy = 0, a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const cross = p.x * q.y - q.x * p.y;
    a += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  if (Math.abs(a) < 1e-9) {
    const m = pts.reduce((s, p) => ({ x: s.x + p.x, y: s.y + p.y }), { x: 0, y: 0 });
    return { x: m.x / pts.length, y: m.y / pts.length };
  }
  a *= 0.5;
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

export function pointInPolygon(pt, poly) {
  // Ray casting。
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect = (yi > pt.y) !== (yj > pt.y) &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function segIntersect(a, b, c, d) {
  // 線段 ab 與 cd 相交點。回傳 {point, t, u} 或 null。t = ab 上比例, u = cd 上比例。
  const r = { x: b.x - a.x, y: b.y - a.y };
  const s = { x: d.x - c.x, y: d.y - c.y };
  const denom = r.x * s.y - r.y * s.x;
  if (Math.abs(denom) < 1e-12) return null; // 平行
  const qp = { x: c.x - a.x, y: c.y - a.y };
  const t = (qp.x * s.y - qp.y * s.x) / denom;
  const u = (qp.x * r.y - qp.y * r.x) / denom;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return { point: { x: a.x + t * r.x, y: a.y + t * r.y }, t, u };
}

export function bbox(pts) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

// 以自由劃線 path（折線頂點陣列）切割簡單多邊形 poly。
// 回傳 [polyA, polyB]（兩塊多邊形頂點陣列），無法切則回傳 null。
export function cutPolygonByPath(poly, path) {
  const n = poly.length;
  const hits = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    for (let j = 0; j < n; j++) {
      const c = poly[j], d = poly[(j + 1) % n];
      const inter = segIntersect(a, b, c, d);
      if (inter) {
        hits.push({ point: inter.point, pathIdx: i, t: inter.t, edgeIdx: j, u: inter.u });
      }
    }
  }
  if (hits.length < 2) return null;
  hits.sort((h1, h2) => (h1.pathIdx - h2.pathIdx) || (h1.t - h2.t));
  const entry = hits[0];
  const exit = hits[hits.length - 1];

  // 內部折線點：path 中位於 entry 與 exit 之間的頂點。
  const interior = [];
  for (let k = entry.pathIdx + 1; k <= exit.pathIdx; k++) {
    interior.push(path[k]);
  }
  const cutChain = [entry.point, ...interior, exit.point];

  // 沿多邊形邊界，從某條邊往前走到另一條邊，收集中間頂點。
  function walkForward(fromEdge, toEdge) {
    const verts = [];
    let j = (fromEdge + 1) % n;
    let guard = 0;
    while (guard++ <= n) {
      verts.push(poly[j]);
      if (j === toEdge) break;
      j = (j + 1) % n;
    }
    return verts;
  }

  let polyA, polyB;
  if (entry.edgeIdx === exit.edgeIdx) {
    // 同一條邊進出 → 一塊是薄片（僅切線閉合），另一塊含全部頂點。
    polyA = [...cutChain];
    const arc = walkForward(exit.edgeIdx, entry.edgeIdx); // 繞一圈全部頂點
    polyB = [...cutChain].reverse().concat(arc);
  } else {
    const arcA = walkForward(exit.edgeIdx, entry.edgeIdx); // exit → entry 這段弧
    polyA = [...cutChain].concat(arcA);
    const arcB = walkForward(entry.edgeIdx, exit.edgeIdx); // entry → exit 另一段弧
    polyB = [...cutChain].reverse().concat(arcB);
  }

  if (polyA.length < 3 || polyB.length < 3) return null;
  const areaA = polygonArea(polyA);
  const areaB = polygonArea(polyB);
  const total = areaA + areaB;
  // 面積守恒檢查：只有「乾淨一刀」（進出邊界剛好一次）兩塊面積才會等於原塊。
  // 若切痕在凹形塊上多次進出邊界，first/last 交點會導致面積不守恒 → 視為模糊切割，拒絕。
  const orig = polygonArea(poly);
  if (Math.abs(total - orig) > orig * 0.01) return null;
  // 太小的碎屑視為無效切割（手滑）。
  if (areaA < orig * 0.005 || areaB < orig * 0.005) return null;
  return [polyA, polyB];
}

// 把 path 依「在麵包內的段落」裁到多邊形邊界內，供繪製切痕預覽用。
export function clampPathToPolygon(poly, path) {
  return path.filter((p) => pointInPolygon(p, poly));
}
