// game.js — 遊戲狀態機，實作「最後裁切者 Last Diminisher」公平分割流程。
//
// 正確模型（依用戶 2026-08-08 澄清）：**全程只有一塊麵包**。
//  - 遊戲開始時，玩家1 選 1 種麵包（僅此一次）。這塊就是「剩下麵包（pool）」。
//  - 每一輪：目前仍在場的第一位玩家（起始者）把「剩下麵包」切一刀，挑一塊當自己主張的
//    公平份（爭議塊往下傳），另一塊留作新的「剩下麵包」。
//  - 其餘在場玩家依序選「合格(Pass)」或「裁切(Cut)」；裁切者把爭議塊再切一刀、挑一塊續傳，
//    修下的邊落入碎塊盤（scraps，最後一位收）。
//  - 一輪結束：最後裁切者（若無人裁切則起始者）贏得爭議塊並「離開遊戲」。
//  - 重複到只剩一位玩家 → 他獲得「剩下麵包 + 所有碎塊」。
//  - 計分：目標 = 總面積 / N，各玩家總面積最接近目標者名次最前，20/18/16… 遞減給分。

import { polygonArea } from './geometry.js';
import { BREADS, randomBreadIndex } from './breads.js';

export const PLAYER_COLORS = [
  '#8FA98C', '#C98A6B', '#7C9BB0', '#C7A15B', '#A88BB0',
  '#6FA6A0', '#CE9AA3', '#9C8F7A', '#B5895E', '#8896A6',
];

export function createGame(playerCount) {
  const players = [];
  for (let i = 0; i < playerCount; i++) {
    players.push({ id: i, name: `玩家 ${i + 1}`, color: PLAYER_COLORS[i], pieces: [], roundScore: 0, totalScore: 0 });
  }
  return {
    players,
    N: playerCount,
    active: players.map((_, i) => i), // 仍在遊戲中的玩家索引（依座位順序）
    pool: null,            // 剩下的主麵包（單一多邊形塊）
    scraps: [],            // 修邊落下的碎塊（最後一位玩家收）
    phase: 'selectBread',  // selectBread(僅開場) | starterCut | starterPick | decision | trimCut | trimPick | lastCollect | scoring
    round: 1,
    bread: null,           // { idx, cx, cy, R }
    workingPieces: null,   // 剛切完待挑選的兩塊
    contested: null,       // 正在傳遞的爭議塊（或起始者待切的剩下麵包）
    passOrder: [],
    passPos: 0,
    lastCutter: 0,
    starter: 0,
    currentActor: 0,
    message: '',
  };
}

function makePiece(poly, breadIdx, cx, cy, R) {
  return { poly, area: polygonArea(poly), breadIdx, cx, cy, R };
}

// 開場選定麵包（idx 為 null 表隨機）。僅在遊戲最開始呼叫一次。
export function chooseBread(g, idx, cx, cy, R) {
  const breadIdx = idx == null ? randomBreadIndex() : idx;
  const poly = BREADS[breadIdx].shape(cx, cy, R);
  g.bread = { idx: breadIdx, cx, cy, R };
  g.pool = makePiece(poly, breadIdx, cx, cy, R);
  beginTurn(g);
  return breadIdx;
}

// 開始新一輪：在場第一位當起始者，把「剩下麵包」拿到中央待切。
function beginTurn(g) {
  g.starter = g.active[0];
  g.currentActor = g.starter;
  g.lastCutter = g.starter;
  g.contested = g.pool;  // 這一輪要切的就是剩下的主麵包
  g.pool = null;         // 已取到中央待切（挑選後剩餘的那塊會成為新的 pool）
  g.workingPieces = null;
  g.phase = 'starterCut';
  g.message = `${g.players[g.starter].name}：把剩下的麵包切一刀`;
}

// 套用一刀切割。twoPieces 由 main 提供（geometry.cutPolygonByPath 的結果）。
export function applyCut(g, twoPieces) {
  if (!twoPieces) return false;
  const b = g.contested;
  g.workingPieces = twoPieces.map((poly) => makePiece(poly, b.breadIdx, b.cx, b.cy, b.R));
  if (g.phase === 'starterCut') {
    g.phase = 'starterPick';
    g.message = `${g.players[g.starter].name}：選一塊當你的公平份（另一塊留作剩下麵包）`;
  } else if (g.phase === 'trimCut') {
    g.phase = 'trimPick';
    g.message = `${g.players[g.currentActor].name}：選一塊續傳（修下的邊落入碎塊盤）`;
  }
  return true;
}

// 挑選一塊（pickIdx 0/1）。
export function pickPiece(g, pickIdx) {
  const kept = g.workingPieces[pickIdx];
  const other = g.workingPieces[1 - pickIdx];
  g.workingPieces = null;

  if (g.phase === 'starterPick') {
    g.contested = kept;    // 起始者的主張塊 → 往下傳
    g.pool = other;        // 剩餘 → 新的剩下麵包
    g.passOrder = g.active.filter((i) => i !== g.starter);
    g.passPos = 0;
    beginDecision(g);
  } else if (g.phase === 'trimPick') {
    g.contested = kept;    // 修剪者的新主張塊 → 續傳
    g.scraps.push(other);  // 修下的邊 → 碎塊盤
    g.passPos++;
    beginDecision(g);
  }
}

function beginDecision(g) {
  if (g.passPos >= g.passOrder.length) { endTurn(g); return; }
  g.currentActor = g.passOrder[g.passPos];
  g.phase = 'decision';
  g.message = `${g.players[g.currentActor].name}：合格 或 裁切？`;
}

// 玩家決策：'pass' 合格 / 'cut' 裁切。
export function decide(g, choice) {
  if (choice === 'pass') {
    g.passPos++;
    beginDecision(g);
  } else {
    g.phase = 'trimCut';
    g.lastCutter = g.currentActor;
    g.message = `${g.players[g.currentActor].name}：在爭議塊上切一刀`;
  }
}

function endTurn(g) {
  // 最後裁切者（或起始者）贏得爭議塊，並離開遊戲。
  const winner = g.lastCutter;
  g.players[winner].pieces.push(g.contested);
  g.contested = null;
  g.active = g.active.filter((i) => i !== winner);
  if (g.active.length === 1) {
    g.phase = 'lastCollect';
    g.message = `${g.players[g.active[0]].name}（最後一位）獲得剩下的所有麵包`;
  } else {
    beginTurn(g);
  }
}

// 最後一位玩家收下剩下麵包 + 所有碎塊。
export function lastCollect(g) {
  const last = g.players[g.active[0]];
  if (g.pool) last.pieces.push(g.pool);
  for (const s of g.scraps) last.pieces.push(s);
  g.pool = null;
  g.scraps = [];
  g.phase = 'scoring';
  score(g);
}

function score(g) {
  const totals = g.players.map((p) => p.pieces.reduce((s, pc) => s + pc.area, 0));
  const grand = totals.reduce((a, b) => a + b, 0);
  const target = grand / g.N;
  const order = g.players.map((p, i) => ({ i, err: Math.abs(totals[i] - target), area: totals[i] }))
    .sort((a, b) => a.err - b.err);
  order.forEach((o, rank) => {
    const pts = Math.max(0, 20 - rank * 2);
    g.players[o.i].roundScore = pts;
    g.players[o.i].roundArea = o.area;
    g.players[o.i].roundRank = rank + 1;
    g.players[o.i].totalScore += pts;
  });
  g.target = target;
  g.grandTotal = grand;
}

// 開始下一大回合（保留累計總分，重置本回合狀態）。
export function nextRound(g) {
  for (const p of g.players) { p.pieces = []; p.roundScore = 0; }
  g.active = g.players.map((_, i) => i);
  g.pool = null;
  g.scraps = [];
  g.round++;
  g.bread = null; g.contested = null; g.workingPieces = null;
  g.phase = 'selectBread';
  g.message = `第 ${g.round} 回合：${g.players[0].name} 選擇麵包`;
}

export { BREADS };
