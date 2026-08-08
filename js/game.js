// game.js — 遊戲狀態機，實作用戶定義的「整塊重切」公平分割流程。
//
// 模型（依用戶 2026-08-08 多次澄清）：**全程只有一塊麵包，起始者依座位輪替，且每一刀都切「整塊」。**
//  - 開場：玩家1 選 1 種麵包（僅此一次）。這塊＝餐盤剩下麵包（pool）。
//  - 每一輪由「起始者」開場，起始者依座位輪替：玩家1 → 玩家2 → … → 玩家(N-1)（無人淘汰）。
//  - 一輪流程：
//    1. 起始者把「餐盤剩下的整塊麵包(roundBread)」切一刀，挑一塊當自己主張的公平份(claim)，
//       另一塊(remainder)留在餐盤。
//    2. 起始者「之後座位」的玩家依序（起始者+1 … 最後一位）選「合格(Pass)」或「裁切(Cut)」。
//       ★裁切＝把「整塊 roundBread（含被放回餐盤的那塊）」重新切一刀★，挑一塊當自己的 claim，
//       另一塊留回餐盤。（不是只修剪爭議塊，避免「從另一邊切」的怪畫面。）
//    3. 一輪結束：目前 claim 的主張者（最後裁切者；若無人裁切則起始者）贏得 claim 放進自己的份(不離場)。
//       claim 的補集(remainder)成為新的餐盤剩下麵包，完整繼承給下一位起始者。
//  - 共 N-1 輪。最後一位玩家(座位 N-1)不當起始者，直接獲得「餐盤上剩下的所有麵包」。
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
    starterSeat: 0,        // 本輪起始者座位（0-based）；每輪 +1，達 N-1 即最後一位收尾
    pool: null,            // 輪間：餐盤上剩下的整塊麵包
    roundBread: null,      // 本輪要分的整塊麵包（每一刀都切這整塊）
    claim: null,           // 目前被主張的一塊（爭議塊）
    remainder: null,       // 目前另一塊（留在餐盤）
    claimant: 0,           // 目前 claim 的主張者座位（本輪最後贏家）
    lastWin: null,         // { seat, piece } 給 UI 播「獲得」動畫用；main 消費後清空
    phase: 'selectBread',  // selectBread | starterCut | starterPick | decision | trimCut | trimPick | lastCollect | scoring
    round: 1,
    bread: null,           // { idx, cx, cy, R }
    workingPieces: null,   // 剛切完待挑選的兩塊
    passOrder: [],
    passPos: 0,
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

// 開始新一輪：由 starterSeat 座位當起始者，把「餐盤剩下的整塊麵包」拿到中央待切。
function beginTurn(g) {
  g.starter = g.starterSeat;
  g.currentActor = g.starter;
  g.claimant = g.starter;
  g.roundBread = g.pool;   // 本輪整塊 = 餐盤上剩下的（完整繼承）
  g.pool = null;
  g.claim = null;
  g.remainder = null;
  g.workingPieces = null;
  g.phase = 'starterCut';
  g.message = `${g.players[g.starter].name}：把餐盤剩下的整塊麵包切一刀`;
}

// 套用一刀切割。twoPieces 由 main 提供（geometry.cutPolygonByPath 的結果）。永遠是切 roundBread。
export function applyCut(g, twoPieces) {
  if (!twoPieces) return false;
  const b = g.roundBread;
  g.workingPieces = twoPieces.map((poly) => makePiece(poly, b.breadIdx, b.cx, b.cy, b.R));
  if (g.phase === 'starterCut') {
    g.phase = 'starterPick';
    g.message = `${g.players[g.starter].name}：選一塊當你的公平份（另一塊留在餐盤）`;
  } else if (g.phase === 'trimCut') {
    g.phase = 'trimPick';
    g.message = `${g.players[g.currentActor].name}：選一塊當你的公平份（另一塊留在餐盤）`;
  }
  return true;
}

// 挑選一塊（pickIdx 0/1）當 claim，另一塊為 remainder（留餐盤）。
export function pickPiece(g, pickIdx) {
  const kept = g.workingPieces[pickIdx];
  const other = g.workingPieces[1 - pickIdx];
  g.workingPieces = null;
  g.claim = kept;
  g.remainder = other;
  g.claimant = g.currentActor;
  if (g.phase === 'starterPick') {
    // 依序輪到起始者「之後座位」的玩家決策（起始者+1 … 最後一位）。
    g.passOrder = [];
    for (let s = g.starter + 1; s < g.N; s++) g.passOrder.push(s);
    g.passPos = 0;
    beginDecision(g);
  } else if (g.phase === 'trimPick') {
    g.passPos++;
    beginDecision(g);
  }
}

function beginDecision(g) {
  if (g.passPos >= g.passOrder.length) { endTurn(g); return; }
  g.currentActor = g.passOrder[g.passPos];
  g.phase = 'decision';
  g.message = `${g.players[g.currentActor].name}：這塊公平嗎？合格 或 裁切`;
}

// 玩家決策：'pass' 合格 / 'cut' 裁切。裁切＝重新切「整塊 roundBread」。
export function decide(g, choice) {
  if (choice === 'pass') {
    g.passPos++;
    beginDecision(g);
  } else {
    g.phase = 'trimCut';
    g.message = `${g.players[g.currentActor].name}：把整塊麵包重新切一刀（含放回餐盤的那塊）`;
  }
}

function endTurn(g) {
  // 目前 claim 的主張者（最後裁切者，或無人裁切則起始者）贏得 claim，放進自己的份（不離場）。
  const winner = g.claimant;
  g.players[winner].pieces.push(g.claim);
  g.lastWin = { seat: winner, piece: g.claim };  // UI 動畫用
  g.pool = g.remainder;   // 餐盤剩下 = claim 的補集，完整繼承給下一輪
  g.claim = null;
  g.remainder = null;
  g.roundBread = null;
  g.starterSeat++;
  if (g.starterSeat >= g.N - 1) {
    // 起始者已輪完玩家1…玩家(N-1)；最後一位玩家(座位 N-1)收尾。
    g.phase = 'lastCollect';
    g.message = `${g.players[g.N - 1].name}（最後一位）獲得餐盤上剩下的所有麵包`;
  } else {
    beginTurn(g);
  }
}

// 最後一位玩家收下餐盤上剩下的整塊麵包。
export function lastCollect(g) {
  const last = g.players[g.N - 1];
  if (g.pool) {
    last.pieces.push(g.pool);
    g.lastWin = { seat: g.N - 1, piece: g.pool };
  }
  g.pool = null;
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
  g.starterSeat = 0;
  g.pool = null;
  g.roundBread = null;
  g.claim = null;
  g.remainder = null;
  g.lastWin = null;
  g.round++;
  g.bread = null;
  g.workingPieces = null;
  g.phase = 'selectBread';
  g.message = `第 ${g.round} 回合：${g.players[0].name} 選擇麵包`;
}

export { BREADS };
