// game.js — 遊戲狀態機，實作「最後裁切者 Last Diminisher」公平分割流程。
//
// 解讀（若與你想的不同可調）：
//  - 共有 N 位玩家。進行 N-1 個「回合」，起始切割者依序為 玩家1..玩家(N-1)。
//  - 每個回合由當前起始者選一種（或隨機）麵包 → 切一刀 → 挑一塊當「爭議塊」傳出，
//    另一塊放回餐盤。其餘玩家依序選「合格(Pass)」或「裁切(Cut)」；裁切者再切一刀、
//    挑一塊續傳、餘塊放回餐盤。最後一位裁切者獲得爭議塊；若無人裁切則歸起始者。
//  - 跑完 N-1 回合後，最後一位玩家（玩家N）獲得餐盤上所有剩餘塊。
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
    plate: [],            // 累積的剩餘塊
    starterIdx: 0,        // 當前回合的起始切割者
    phase: 'selectBread', // selectBread | starterCut | starterPick | decision | trimCut | trimPick | turnEnd | lastCollect | scoring
    round: 1,             // 第幾大回合（可多回合遊戲）
    // 當前回合暫存
    bread: null,          // { idx, cx, cy, R }
    workingPieces: null,  // 剛切完待挑選的兩塊 [pieceA, pieceB]
    contested: null,      // 正在傳遞的爭議塊
    passOrder: [],        // 本回合待決策的玩家序列
    passPos: 0,
    lastCutter: 0,        // 最後裁切者（預設起始者）
    currentActor: 0,      // 當前操作玩家 index
    message: '',
  };
}

function makePiece(poly, breadIdx, cx, cy, R) {
  return { poly, area: polygonArea(poly), breadIdx, cx, cy, R };
}

// 起始者選定麵包（idx 為 null 表隨機）。放置於指定 (cx,cy,R)。
export function chooseBread(g, idx, cx, cy, R) {
  const breadIdx = idx == null ? randomBreadIndex() : idx;
  const poly = BREADS[breadIdx].shape(cx, cy, R);
  g.bread = { idx: breadIdx, cx, cy, R };
  g.contested = makePiece(poly, breadIdx, cx, cy, R);
  g.workingPieces = null;
  g.currentActor = g.starterIdx;
  g.lastCutter = g.starterIdx;
  g.phase = 'starterCut';
  g.message = `${g.players[g.starterIdx].name}：在麵包上切一刀`;
  return breadIdx;
}

// 套用一刀切割，回傳是否成功。cutFn 由 main 提供（呼叫 geometry.cutPolygonByPath）。
export function applyCut(g, twoPieces) {
  if (!twoPieces) return false;
  const b = g.contested;
  g.workingPieces = twoPieces.map((poly) => makePiece(poly, b.breadIdx, b.cx, b.cy, b.R));
  if (g.phase === 'starterCut') {
    g.phase = 'starterPick';
    g.message = `${g.players[g.starterIdx].name}：選一塊你覺得公平的（另一塊放回餐盤）`;
  } else if (g.phase === 'trimCut') {
    g.phase = 'trimPick';
    g.message = `${g.players[g.currentActor].name}：選一塊續傳（另一塊放回餐盤）`;
  }
  return true;
}

// 挑選一塊（pickIdx 0/1）。起始者挑選 → 進入決策；裁切者挑選 → 續傳並換下一位。
export function pickPiece(g, pickIdx) {
  const kept = g.workingPieces[pickIdx];
  const discarded = g.workingPieces[1 - pickIdx];
  g.plate.push(discarded);
  g.contested = kept;
  g.workingPieces = null;

  if (g.phase === 'starterPick') {
    // 建立決策序列：起始者之後的所有其他玩家（環狀），最後一位為起始者前一位。
    g.passOrder = [];
    for (let k = 1; k < g.N; k++) g.passOrder.push((g.starterIdx + k) % g.N);
    g.passPos = 0;
    beginDecision(g);
  } else if (g.phase === 'trimPick') {
    g.passPos++;
    advanceDecision(g);
  }
}

function beginDecision(g) {
  if (g.passPos >= g.passOrder.length) { endTurn(g); return; }
  g.currentActor = g.passOrder[g.passPos];
  g.phase = 'decision';
  g.message = `${g.players[g.currentActor].name}：合格 或 裁切？`;
}

function advanceDecision(g) {
  beginDecision(g);
}

// 玩家決策：'pass' 合格 / 'cut' 裁切。
export function decide(g, choice) {
  if (choice === 'pass') {
    g.passPos++;
    advanceDecision(g);
  } else {
    g.phase = 'trimCut';
    g.lastCutter = g.currentActor;
    g.message = `${g.players[g.currentActor].name}：在爭議塊上切一刀`;
  }
}

function endTurn(g) {
  // 最後裁切者獲得爭議塊。
  g.players[g.lastCutter].pieces.push(g.contested);
  g.contested = null;
  g.starterIdx++;
  if (g.starterIdx >= g.N - 1) {
    // 進入最後一位收尾。
    g.phase = 'lastCollect';
    g.message = `${g.players[g.N - 1].name}（最後一位）獲得餐盤所有剩餘麵包`;
  } else {
    g.phase = 'selectBread';
    g.message = `${g.players[g.starterIdx].name}：選擇這回合的麵包`;
  }
}

// 最後一位玩家收下整個餐盤。
export function lastCollect(g) {
  const last = g.players[g.N - 1];
  for (const p of g.plate) last.pieces.push(p);
  g.plate = [];
  g.phase = 'scoring';
  score(g);
}

function score(g) {
  const totals = g.players.map((p) => p.pieces.reduce((s, pc) => s + pc.area, 0));
  const grand = totals.reduce((a, b) => a + b, 0);
  const target = grand / g.N;
  // 依 |面積-目標| 由小到大排名。
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
  g.plate = [];
  g.starterIdx = 0;
  g.round++;
  g.bread = null; g.contested = null; g.workingPieces = null;
  g.phase = 'selectBread';
  g.message = `第 ${g.round} 回合：${g.players[0].name} 選擇麵包`;
}

export { BREADS };
