// server/match/augments5/g7.js — A6000 fork, 海克斯第六版 batch g7: the match-side hooks of its augments (the prep /
// battle effects: server/sim/content/augments5/g7.js). The hooks: see the list in server/match/augments5/g4.js.
//
// This batch:
//   双子合成 (aug_twin_merge)  the merge count itself is the engine's (server/match/player/acquire.js mergeNeed: every gain
//                    merges at 2 for tiers 1–3). onPick merges the pairs the player holds when it takes the augment, and
//                    every round start the holder's pairs a merge-less move left (a team 海克斯's swap — augments5/g4.js
//                    settleMerges counts 3) — merges are immediate (PlayerState._mergeChess: the elite on a consumed
//                    deployed copy's tile, else the hand; the promotion reward; onMerge)
//   克隆大作战 (aug_clone)     onPick notes the round (counter 'aug6:aug_clone:from'); at the round start of pick + k·every
//                    (k ≥ 1) the holder gains one more normal copy of its board's highest-tier normal operator of tier ≤
//                    maxTier (ties: the highest ATK as fielded — the 补位 stand-in's —, then the board's reading order),
//                    taken from the pool (the player's 自选 stock for a 自选 piece) — none when no copy is left. The
//                    EffectRef's counter shows the rounds left to the next copy
//   回收站 (aug_recycle)       the click (once a round, augmentAction): the 整备区's leftmost equipment (hand order) becomes
//                    another random one of its tier from the shop's items (no special item; an advanced one becomes the
//                    advanced version of another) — a destroy, then a gain (熔炉's way: merges, onGain). Refused (the
//                    round's use kept) when the 整备区 holds no equipment or its tier has no other item

import { ERR } from '../../../shared/constants.js';
import { augmentDef } from '../../../shared/augments.js';
import { msg, dn, tn } from '../../../shared/i18n.js';
import { boardOrder } from '../board.js';
import { fail } from '../match/common.js';

const KEY = (id) => `augment:${id}`;
const P = (id) => augmentDef(id)?.params ?? {};
const int = (v, d) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : d);
const holds = (ps, id) => !!ps && ps.alive && Array.isArray(ps.augments) && ps.augments.includes(id);

const TWIN = 'aug_twin_merge';
const CLONE = 'aug_clone';
const RECYCLE = 'aug_recycle';
const CLONE_FROM = `aug6:${CLONE}:from`;

/** The number on the holder's EffectRef of `id` (the effects column; null hides it). */
function showCounter(ps, id, v) {
  const ref = ps.effects.find((e) => e && e.key === KEY(id));
  if (ref && ref.counter !== v) { ref.counter = v; ps.dirty(); }
}

/** 双子合成: every merge the holder's owned normal copies allow now (PlayerState.mergeNeed). Returns the merges made. */
export function twinMerges(ps) {
  const gd = ps.gd;
  let merged = 0;
  for (let guard = 0; guard < 16; guard++) {
    const copies = new Map();
    for (const l of ps._chessLocations()) {
      if (gd.isGolden(l.piece.id)) continue;
      const b = gd.baseIdOf(l.piece.id);
      copies.set(b, (copies.get(b) || 0) + 1);
    }
    const ready = [...copies].find(([b, n]) => { const need = ps.mergeNeed(b); return need > 1 && !!gd.goldenIdOf(b) && n >= need; });
    if (!ready || !ps._mergeChess(ready[0], null)) break;
    merged++;
  }
  if (merged) ps.recompute();
  return merged;
}

/**
 * 克隆大作战: the holder's board operator it copies — the highest-tier normal one of tier ≤ maxTier (ties: the highest ATK
 * as fielded, then the board's reading order), or null.
 */
export function cloneTarget(ps, maxTier) {
  const gd = ps.gd;
  let best = null;
  for (const { piece } of boardOrder(ps.board)) {
    if (!piece || piece.kind !== 'chess') continue;
    const rec = gd.chess(piece.id);
    if (!rec || rec.isGolden) continue;
    const tier = gd.tierOf(piece.id);
    if (tier > maxTier) continue;
    const field = typeof ps.fieldRecord === 'function' ? ps.fieldRecord(rec) || rec : rec;
    const atk = Number(field && field.stats && field.stats.atk) || 0;
    if (!best || tier > best.tier || (tier === best.tier && atk > best.atk)) best = { piece, tier, atk };
  }
  return best ? best.piece : null;
}

/** 克隆大作战: one more normal copy of the target from the pool (none left / not a pool chess: nothing). */
function cloneTop(m, ps) {
  const piece = cloneTarget(ps, int(P(CLONE).maxTier, 5));
  if (!piece) return null;
  const base = ps.gd.baseIdOf(piece.id);
  const pool = typeof ps.poolOf === 'function' ? ps.poolOf(base) : m.pool;
  if (!pool.has(base) || pool.left(base) < 1) return null;
  const got = ps.acquireChess(base, { source: KEY(CLONE) });
  if (got) m.toast(ps, 'info', msg('{who}：获得{name}', { who: tn(augmentDef(CLONE).name), name: dn(ps.gd.chess(base)?.name || '') }));
  return got;
}

/** 回收站: the item of the 整备区 it recycles — the leftmost equipment (hand order) — or null. */
export function recycleTarget(ps) {
  return ps.hand.find((x) => x && x.kind === 'item' && ps.gd.item(x.id)?.itemType === 'EQUIP') || null;
}

/** 回收站: the item ids `itemId` may become — the shop's other items of its tier (advanced: their advanced versions). */
export function recycleChoices(gd, itemId) {
  const rec = gd.item(itemId);
  if (!rec || !Number.isInteger(rec.tier)) return [];
  const golden = !!rec.isGolden;
  const normal = golden ? rec.baseId || String(itemId).replace(/_b$/, '_a') : itemId;
  const out = [];
  for (const id of gd.shopItemsByTier[rec.tier] || []) {
    if (id === normal) continue;
    const r = gd.item(id);
    const to = golden ? r && (r.upgradeChessId || r.goldenId) : id;
    if (to && to !== itemId && gd.item(to)) out.push(to);
  }
  return out;
}

export const MATCH = Object.freeze({
  onPick(m, ps, id) {
    if (id === TWIN) twinMerges(ps);
    else if (id === CLONE) {
      ps.counters[CLONE_FROM] = m.round;
      showCounter(ps, CLONE, Math.max(1, int(P(CLONE).every, 2)));
    }
  },

  roundStart(m) {
    for (const ps of m.alivePlayers()) {
      if (holds(ps, TWIN)) twinMerges(ps);
      if (holds(ps, CLONE)) {
        const every = Math.max(1, int(P(CLONE).every, 2));
        const from = ps.counters[CLONE_FROM];
        if (!(from > 0) || m.round <= from) continue;
        const k = (m.round - from) % every;
        if (k === 0) cloneTop(m, ps);
        showCounter(ps, CLONE, every - k);
      }
    }
  },

  action: Object.freeze({
    // 回收站: the 整备区's leftmost equipment → another random one of its tier
    [RECYCLE](m, ps) {
      const piece = recycleTarget(ps);
      if (!piece) return fail(ERR.BAD_TARGET, 'no equipment in the hand');
      const list = recycleChoices(ps.gd, piece.id);
      if (!list.length) return fail(ERR.BAD_TARGET, 'no other equipment of the tier');
      const next = list[Math.floor(m.rngMeta() * list.length)];
      const from = ps.gd.item(piece.id)?.name || '';
      const l = ps.find(piece.uid);
      if (l) ps._detach(l);
      ps.acquireItem(next, { source: KEY(RECYCLE) });
      m.toast(ps, 'info', msg('回收站：{a} 换成了 {b}', { a: dn(from), b: dn(ps.gd.item(next)?.name || '') }));
      return null;
    },
  }),
});
