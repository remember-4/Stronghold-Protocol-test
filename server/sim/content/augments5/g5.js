// server/sim/content/augments5/g5.js — A6000 fork, 海克斯第六版 (海克斯本身、套装效果、幸运（A1–A12、7 个套装）): the effects of
// shared/augments5/g5.js and of the 套装 bonuses (the pseudo augments aug_set_<set> of shared/augmentSets.js SET_DEFS: the
// match keeps their EffectRef with params.n = 2 or 3 while a player holds 2 / 3+ members — server/match/match/augments.js
// syncAugmentSets). server/sim/content/augments.js calls `install` for every augment a battle player holds (true =
// handled here) and merges `META` (augment id → prep-side handler factory, as its own META).
//
// Battle side (install; number bonuses are the independent multipliers: augDealtMul 造成的伤害提升至, dmgTakenMul 受到的伤害
// 降低, intervalMul 攻击间隔缩短, spRecoveryMul 技力回复速度):
//   献祭之刃  aug_dagger       every operator ×(base + per × r) % — r the rarity of the augment its pick removed (EffectRef
//                              data.rarity, written by server/match/augments5/g5.js; 0 when it removed none)
//   收藏家    aug_collector    every operator ×(1 + pct %)^k — k the rarities among the player's augments (EffectRef
//                              data.kinds / counter, kept by the match side and the prep's META below)
//   幸运星    aug_lucky_star   nothing to install: shared/luck.js luckOfRefs reads its EffectRef (side 'both')
//   〔赌徒〕   aug_set_gamble   the same (its params.n: ×1.25 / ×1.5)
//   〔铁壁〕   aug_set_guard    every operator dmgTakenMul (1 − taken2 / taken3 %); its LP cap: the match side
//   〔疾风〕   aug_set_swift    every operator spRecoveryMul 1 + sp2 / sp3 %; at 3, intervalMul 1 − interval3 %
//   〔斩首〕   aug_set_behead   the Final Assault / Hidden Core: the player's hits on a leader (isBoss, or a part feeding its
//                              pool — as 斩首行动) augMul × boss2 / boss3 %
// Prep side (META):
//   收藏家    the rarity count at every round start and prep end (a revoke, a transfer by another batch)
//   〔生财〕   round start: +funds2 / +funds3; at 3 the round's first manual refresh is free — a free refresh granted
//              then (or when the third member comes mid-round: the match side), taken back at the prep end when the round
//              made no manual refresh (with 补给线 too: the two lapse together)
//   〔叠层〕   prep end: the active bond with the most layers +top2 / +top3, at 3 every other active bond +rest3
//              (调和, 协防, 独行, 绝技 never — NO_STACK)
// The set level is the EffectRef's params.n — never the definition's (its n is the text's default).

import { num, playerOps, passiveBuff } from '../support/index.js';
import { augmentDef } from '../../../../shared/augments.js';

const KEY = (id) => `augment:${id}`;
const pct = (v) => num(v) / 100;
const cut = (v) => Math.max(0, 1 - pct(v));

/** Bonds with no per-layer effect (调和, 协防, 独行, 绝技 — content/augments.js NO_STACK; its own copy: no import cycle). */
const NO_STACK = new Set(['maniShip', 'emptyShip', 'soloShip', 'suntShip']);

/** This batch's augment ids. */
export const IDS = Object.freeze({
  amplify: 'aug_amplify', advance: 'aug_advance', mystery1: 'aug_mystery1', mystery3: 'aug_mystery3', mystery5: 'aug_mystery5',
  mystery6: 'aug_mystery6', extra: 'aug_extra_card', voucher: 'aug_voucher', alchemy: 'aug_alchemy', dagger: 'aug_dagger',
  collector: 'aug_collector', luckyStar: 'aug_lucky_star',
});
/** The 盲盒 (never one of them out of another). */
export const BOXES = Object.freeze(new Set([IDS.mystery1, IDS.mystery3, IDS.mystery5, IDS.mystery6]));
/** The 套装 bonuses' pseudo augments (shared/augmentSets.js setAugmentId). */
export const SET = Object.freeze({
  wealth: 'aug_set_wealth', stack: 'aug_set_stack', gamble: 'aug_set_gamble', guard: 'aug_set_guard', swift: 'aug_set_swift',
  behead: 'aug_set_behead', villain: 'aug_set_villain',
});
/** 〔生财〕 3: the round its free refresh was granted (player counter). */
export const WEALTH_FREE_AT = 'aug:setWealth:r';

/** A set bonus's level from its EffectRef: params.n 2 or 3 (3 for 3+), 0 without one. */
export function setLevelOf(ref) {
  const n = Math.trunc(num(ref && ref.params ? ref.params.n : 0, 0));
  return n >= 3 ? 3 : n >= 2 ? 2 : 0;
}

/** 献祭之刃: the damage multiplier for a removed augment of `rarity` (0: none removed). */
export function daggerMul(p, rarity) {
  const r = Math.max(0, Math.min(6, Math.trunc(num(rarity, 0))));
  return pct(num(p && p.base, 110) + num(p && p.per, 4) * r);
}

/** 收藏家: the different rarities among a player's augment ids (a pseudo augment never counts; an unknown id neither). */
export function rarityKinds(ids) {
  const seen = new Set();
  for (const id of ids || []) {
    const d = augmentDef(id);
    if (d && !d.pseudo && Number.isInteger(d.rarity)) seen.add(d.rarity);
  }
  return seen.size;
}

/**
 * 收藏家: write the rarity count of `ids` on its EffectRef `ref` — counter (the effects column's number) and data.kinds (the
 * battle's). Returns whether anything changed (the caller marks the player dirty).
 */
export function noteKinds(ref, ids) {
  if (!ref) return false;
  const n = rarityKinds(ids);
  if (ref.counter === n && ref.data && ref.data.kinds === n) return false;
  ref.counter = n;
  ref.data = { kinds: n };
  return true;
}

function refOf(ps, id) { return (ps.playerEffects || []).find((r) => r && r.key === KEY(id)) || null; }

/** Every operator of `pid` (dead ones included: a redeploy keeps it) gets the match-long `mods` under `key`. */
function allOps(battle, pid, key, mods) {
  for (const u of playerOps(battle, pid)) passiveBuff(battle, u, key, mods);
}

// =====================================================================================================================
// battle side

const NOTHING = () => {};

/** Battle installs: (battle, ps, id, p = the definition's params). */
const BATTLE = Object.freeze({
  // A10 献祭之刃: the rarity its pick removed (none: base %)
  aug_dagger(battle, ps, id, p) {
    allOps(battle, ps.playerId, KEY(id), { augDealtMul: daggerMul(p, refOf(ps, id)?.data?.rarity) });
  },

  // A11 收藏家: the rarities the match counted (this one's own at least: 1)
  aug_collector(battle, ps, id, p) {
    const ref = refOf(ps, id);
    const k = Math.max(1, Math.trunc(num(ref?.data?.kinds, num(ref?.counter, 1))));
    allOps(battle, ps.playerId, KEY(id), { augDealtMul: Math.pow(1 + pct(p.pct), k) });
  },

  // A12 幸运星 and 〔赌徒〕: luck only (shared/luck.js luckOfRefs reads their EffectRefs)
  aug_lucky_star: NOTHING,
  aug_set_gamble: NOTHING,

  // 〔铁壁〕: damage taken −taken2 / −taken3 % (the LP cap at 3: server/match/augments5/g5.js lpCap)
  aug_set_guard(battle, ps, id, p) {
    const lvl = setLevelOf(refOf(ps, id));
    if (!lvl) return;
    allOps(battle, ps.playerId, KEY(id), { dmgTakenMul: cut(lvl >= 3 ? p.taken3 : p.taken2) });
  },

  // 〔疾风〕: SP recovery +sp2 / +sp3 %; at 3 the attack interval −interval3 % too
  aug_set_swift(battle, ps, id, p) {
    const lvl = setLevelOf(refOf(ps, id));
    if (!lvl) return;
    const mods = lvl >= 3
      ? { spRecoveryMul: 1 + pct(p.sp3), intervalMul: Math.max(0.1, 1 - pct(p.interval3)) }
      : { spRecoveryMul: 1 + pct(p.sp2) };
    allOps(battle, ps.playerId, KEY(id), mods);
  },

  // 〔斩首〕: the Final Assault / Hidden Core — the player's hits (summons too) on a leader ×boss2 / boss3 %
  aug_set_behead(battle, ps, id, p) {
    if (battle.kind !== 'boss' && battle.kind !== 'hidden') return;
    const lvl = setLevelOf(refOf(ps, id));
    if (!lvl) return;
    const pid = ps.playerId, mul = pct(lvl >= 3 ? p.boss3 : p.boss2);
    battle.on('hit', (c) => {
      const s = c.source, t = c.target;
      if (!c.dmg || !s || s.side !== 'ally' || s.ownerId !== pid || !t || t.side !== 'enemy' || !(t.isBoss || t.bossPool)) return;
      c.dmg.augMul *= mul;
    });
  },
});

/** This batch's ids without a battle part (side 'meta': never in a battle's playerEffects) — handled, nothing to do. */
const PREP_ONLY = new Set([
  IDS.amplify, IDS.advance, IDS.mystery1, IDS.mystery3, IDS.mystery5, IDS.mystery6, IDS.extra, IDS.voucher, IDS.alchemy,
  SET.wealth, SET.stack, SET.villain,
]);

/**
 * Battle side: install augment `id` (definition `def`) of player `ps` (the battle's player input) on `battle`.
 * @returns {boolean} whether this batch handles the id
 */
export function install(battle, ps, id, def) {
  const fn = BATTLE[id];
  if (!fn) return PREP_ONLY.has(id);
  fn(battle, ps, id, (def && def.params) || {});
  return true;
}

// =====================================================================================================================
// prep side

/** Active bonds of the player a 海克斯 may add layers to (NO_STACK left out), [id, state] in the data's order. */
function stackable(ctx) {
  return Object.entries(ctx.bonds()).filter(([b, st]) => st && st.active && !NO_STACK.has(b));
}

/** The set level of the player (its EffectRef's params.n). */
const levelOf = (ctx, setId) => setLevelOf(ctx.effect(KEY(setId)));

/** 〔生财〕 3: the round's free manual refresh, once a round. */
function wealthFree(ctx) {
  if (ctx.counter(WEALTH_FREE_AT) === ctx.round) return;
  ctx.grantFreeRefresh(1);
  ctx.setCounter(WEALTH_FREE_AT, ctx.round);
}

/** Prep side: augment id → (params) => handler object (onRoundStart, onBuy, onSpend, onPrepEnd, …). */
export const META = Object.freeze({
  // A11 收藏家: the rarity count, fresh for the effects column (round start) and the battle (prep end)
  [IDS.collector]: () => {
    const sync = (ctx) => {
      const ref = ctx.effect(KEY(IDS.collector));
      if (noteKinds(ref, ctx.augments())) ctx.setEffectCounter(KEY(IDS.collector), ref.counter);
    };
    return { onAugmentPick: sync, onRoundStart: sync, onPrepEnd: sync };
  },

  // 〔生财〕: funds at the round start; at 3 the round's first manual refresh free (it lapses unused, as 补给线's)
  [SET.wealth]: (p) => ({
    onRoundStart(ctx) {
      const lvl = levelOf(ctx, SET.wealth);
      if (!lvl) return;
      ctx.addFunds(Math.max(0, Math.trunc(num(lvl >= 3 ? p.funds3 : p.funds2, 0))), KEY(SET.wealth));
      if (lvl >= 3) wealthFree(ctx);
    },
    onPrepEnd(ctx) {
      if (ctx.counter(WEALTH_FREE_AT) !== ctx.round) return;
      // the free refreshes that lapse this round: this one, and 补给线's (which takes its own back when none was made)
      const lapsing = 1 + (ctx.augments().includes('aug_supply') ? 1 : 0);
      if ((ctx.roundStats().refreshes || 0) < lapsing) ctx.takeFreeRefresh(1);
    },
  }),

  // 〔叠层〕: at the prep end the active bond with the most layers (ties: the data's order) +top, at 3 the others +rest
  [SET.stack]: (p) => ({
    onPrepEnd(ctx) {
      const lvl = levelOf(ctx, SET.stack);
      const list = lvl ? stackable(ctx) : [];
      if (!list.length) return;
      const [top] = list.reduce((a, b) => ((b[1].layers ?? 0) > (a[1].layers ?? 0) ? b : a));
      const reason = KEY(SET.stack);
      const n = Math.max(0, Math.trunc(num(lvl >= 3 ? p.top3 : p.top2, 0)));
      if (n > 0) ctx.addLayers(top, n, { requireActive: true, reason });
      const rest = lvl >= 3 ? Math.max(0, Math.trunc(num(p.rest3, 0))) : 0;
      if (rest > 0) for (const [b] of list) if (b !== top) ctx.addLayers(b, rest, { requireActive: true, reason });
    },
  }),
});
