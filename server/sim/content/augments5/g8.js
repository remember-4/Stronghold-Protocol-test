// server/sim/content/augments5/g8.js — A6000 fork, 海克斯第六版 (任务、成长与延迟回报（D1–D11、E1–E12）): the effects of
// shared/augments5/g8.js. server/sim/content/augments.js calls `install` for every augment a battle player holds (true =
// handled here) and merges `META` (augment id → prep-side handler factory, as its own META).
//
// Every holding keeps its state in its own EffectRef (data: what the battles read and what moves with a holding a 借来用用
// lends; counter: the number on its icon in the effects column) — never in closures (the handlers are shared by every
// player of every match).
//
// Battle side (install; number bonuses are the independent multipliers: augDealtMul 造成的伤害提升至, dmgTakenMul 受到的伤害,
// intervalMul 攻击间隔, hpMul 最大生命). "Rounds since the pick" = the battle's round − data.from: a 联防 and the Final
// Assault / Hidden Core count as their round.
//   aug_q_summit       done (data.bond): the bond's members (isMember: 调和 counts for a core bond) ×dealt
//   aug_popcorn        dealt − n × drop (n rounds since the pick), not below 100 %
//   aug_grit           1 + n × pct, at most max
//   aug_reaper         1 + ⌊kills / per⌋ × pct, at most max (data.kills: the kills of the settlements so far)
//   aug_tank_engine    the same as hpMul
//   aug_win_streak     1 + streak × pct, at most max (data.streak: perfect settlements in a row)
//   aug_chaos_power    n < rounds: dmgTakenMul 1 + taken; later augDealtMul dealt
//   aug_chaos_speed    n < rounds: intervalMul 1 + slow; later 1 − fast
// The rest act in the prep and at the settlements only (side 'meta').
//
// Prep side (META):
//   任务 (the analysis 1.2) — counted from the pick (data.started); the icon shows what is left; the goal reached: data.done
//   = the round, the icon 0, the ticker 「{name} 完成了{aug}」, then the reward (funds now while the player can still spend
//   them this prep, else at the next round start — `pay`):
//     百炼 chess merges (onMerge) · 登峰 the most layers of a bond (data.bond for the battles) · 完美主义 perfect settlements
//     · 挥金如土 funds spent (onSpend; then funds every round start) · 刷新狂人 manual refreshes (onRefresh but a 特质's
//     trigger; then the round's first `free` manual refreshes are free — granted at the round start, the ones it did not
//     use lapse at the prep end) · 苦尽甘来 LP lost (stats.lpLost since the pick: the settlements and every other LP cost)
//     · 一夫当关 one operator's knock-outs in one battle (the result's unitStats: the own battle / boss field and the 联防
//     each on its own; the operator is promoted at the settlement, an elite one gives a 博士投影) · 广纳贤才 distinct base
//     operators gained (onGain) · 百花齐放 active bonds at once but 调和 / 协防 (the pick, round starts, prep ends; then
//     every prep end +layer on each active bond) · 武装到牙齿 items on the board's operators at once (the same moments) ·
//     速通 the 调度中心's level until the end of round `round` (then the icon goes blank)
//   金蛋     data.left: −1 every round start and every perfect settlement; 0 at a round start hatches it (a random elite
//            of `tier` and funds; a ticker line)
//   未来规划  the LP at the pick: server/match/augments5/g8.js; at the round start `rounds` after it, the operators and a
//            博士投影
//   远征     every round start after the pick: the hand's rightmost operator leaves (destroyPiece: its copies back to the
//            pool, its equipment to the hand, no funds); none in the hand: the round does not count; the `n`th brings
//            the reward back (a ticker line)
//   爆米花 / 越战越勇 / 混沌契约·力量 / 混沌契约·迅捷  the pick's round (data.from); the icon shows the bonus left / reached, or
//            the rounds of the curse left
//   灵魂收割 / 坦克引擎  data.kills += every knock-out of the player's units in the settled battles (own / boss field, 联防)
//   长胜将军  data.streak: +1 a perfect settlement, 0 otherwise
//   混沌契约·财富  onIncome: the incomes of the `rounds` rounds after the pick −loss (not below 0), every later one +gain
//   负重前行  the hand slots: server/match/augments5/g8.js

import { num, playerOps, passiveBuff, isMember } from '../support/index.js';
import { msg, dn, tn } from '../../../../shared/i18n.js';
import { PHASE } from '../../../../shared/constants.js';
import { DEFS } from '../../../../shared/augments5/g8.js';

const KEY = (id) => `augment:${id}`;
const pct = (v) => num(v) / 100;
const NAMES = new Map(DEFS.map((d) => [d.id, d.name]));

/** Bonds with no per-layer effect (调和, 协防, 独行, 绝技 — content/augments.js NO_STACK; its own copy: no import cycle). */
const NO_STACK = new Set(['maniShip', 'emptyShip', 'soloShip', 'suntShip']);
/** 任务·百花齐放 does not count these (the analysis: 调和、协防不算). */
const BLOOM_SKIP = new Set(['maniShip', 'emptyShip']);

// =====================================================================================================================
// the numbers (the battles apply them; the prep shows them on the icon)

/** 爆米花 n rounds after the pick. */
export const popcornMul = (p, n) => Math.max(1, pct(num(p.dealt, 140)) - Math.max(0, n) * pct(num(p.drop, 5)));
/** 越战越勇 n rounds after the pick. */
export const gritMul = (p, n) => Math.min(pct(num(p.max, 124)), 1 + Math.max(0, n) * pct(num(p.pct, 2)));
/** 灵魂收割 / 坦克引擎 after `kills` knock-outs. */
export const killsMul = (p, kills) => Math.min(pct(num(p.max, 130)), 1 + Math.floor(Math.max(0, kills) / Math.max(1, num(p.per, 25))) * pct(num(p.pct, 1)));
/** 长胜将军 after `streak` perfect rounds in a row. */
export const streakMul = (p, streak) => Math.min(pct(num(p.max, 130)), 1 + Math.max(0, streak) * pct(num(p.pct, 5)));
/** A multiplier's bonus in whole percent (the icon's number). */
const bonusPct = (mul) => Math.max(0, Math.round((mul - 1) * 100));

// =====================================================================================================================
// battle side

/** The data of one of the player's augment EffectRefs (what the prep side keeps), or null. */
function dataOf(ps, id) {
  const ref = (ps.playerEffects || []).find((r) => r && r.key === KEY(id));
  return ref && ref.data && typeof ref.data === 'object' ? ref.data : null;
}

/** Rounds since the pick at this battle's round (a 联防 / the Final Assault count as their round), or null. */
function roundsIn(battle, ps, id) {
  const d = dataOf(ps, id);
  const from = d ? num(d.from, NaN) : NaN;
  return Number.isFinite(from) ? Math.max(0, num(battle.round) - from) : null;
}

/** Every operator of the player: a match-long buff of `mods` under the augment's key. */
function allOps(battle, pid, id, mods) {
  for (const u of playerOps(battle, pid)) passiveBuff(battle, u, KEY(id), mods);
}

const BATTLE = Object.freeze({
  // D2 任务·登峰: once done, the members of the bond it noted
  aug_q_summit(battle, ps, id, p) {
    const d = dataOf(ps, id);
    const bond = d && typeof d.bond === 'string' ? d.bond : null;
    if (!bond) return;
    const mods = { augDealtMul: pct(num(p.dealt, 125)) };
    for (const u of playerOps(battle, ps.playerId)) if (isMember(battle, u, bond)) passiveBuff(battle, u, KEY(id), mods);
  },

  // E5 爆米花
  aug_popcorn(battle, ps, id, p) {
    const n = roundsIn(battle, ps, id);
    const mul = n == null ? 1 : popcornMul(p, n);
    if (mul > 1 + 1e-9) allOps(battle, ps.playerId, id, { augDealtMul: mul });
  },

  // E6 越战越勇
  aug_grit(battle, ps, id, p) {
    const n = roundsIn(battle, ps, id);
    const mul = n == null ? 1 : gritMul(p, n);
    if (mul > 1 + 1e-9) allOps(battle, ps.playerId, id, { augDealtMul: mul });
  },

  // E7 灵魂收割
  aug_reaper(battle, ps, id, p) {
    const mul = killsMul(p, num(dataOf(ps, id)?.kills, 0));
    if (mul > 1 + 1e-9) allOps(battle, ps.playerId, id, { augDealtMul: mul });
  },

  // E8 坦克引擎
  aug_tank_engine(battle, ps, id, p) {
    const mul = killsMul(p, num(dataOf(ps, id)?.kills, 0));
    if (mul > 1 + 1e-9) allOps(battle, ps.playerId, id, { hpMul: mul });
  },

  // E9 长胜将军
  aug_win_streak(battle, ps, id, p) {
    const mul = streakMul(p, num(dataOf(ps, id)?.streak, 0));
    if (mul > 1 + 1e-9) allOps(battle, ps.playerId, id, { augDealtMul: mul });
  },

  // E10 混沌契约·力量: the curse's rounds (the pick's included), then the blessing for the rest of the match
  aug_chaos_power(battle, ps, id, p) {
    const n = roundsIn(battle, ps, id);
    if (n == null) return;
    if (n < Math.max(0, num(p.rounds, 3))) allOps(battle, ps.playerId, id, { dmgTakenMul: 1 + pct(num(p.taken, 30)) });
    else allOps(battle, ps.playerId, id, { augDealtMul: pct(num(p.dealt, 130)) });
  },

  // E12 混沌契约·迅捷
  aug_chaos_speed(battle, ps, id, p) {
    const n = roundsIn(battle, ps, id);
    if (n == null) return;
    if (n < Math.max(0, num(p.rounds, 3))) allOps(battle, ps.playerId, id, { intervalMul: 1 + pct(num(p.slow, 20)) });
    else allOps(battle, ps.playerId, id, { intervalMul: Math.max(0.1, 1 - pct(num(p.fast, 25))) });
  },
});

/**
 * Battle side: install augment `id` (definition `def`) of player `ps` (the battle's player input) on `battle`.
 * @returns {boolean} whether this batch handles the id
 */
export function install(battle, ps, id, def) {
  const fn = BATTLE[id];
  if (!fn) return NAMES.has(id);
  fn(battle, ps, id, (def && def.params) || {});
  return true;
}

// =====================================================================================================================
// prep side

/** The phases whose funds a player can still spend this prep (a payout at the prep end or a settlement waits). */
const SPEND_PHASES = new Set([PHASE.ROUND_START, PHASE.AUGMENT, PHASE.SP_DRAFT, PHASE.PREP]);

/** `n` funds of augment `id`: now while the player can still spend them this prep, else at the next round start. */
function pay(ctx, id, n) {
  const v = Math.max(0, Math.trunc(num(n)));
  if (!v) return 0;
  if (SPEND_PHASES.has(ctx.phase) && ctx.hook !== 'onPrepEnd') ctx.addFunds(v, KEY(id));
  else ctx.addPendingFunds(v);
  return v;
}

/** The player's EffectRef of augment `id`, or null. */
const refOf = (ctx, id) => ctx.effect(KEY(id));
/** Its state (the EffectRef's data; {} when none yet). */
function dataIn(ctx, id) {
  const ref = refOf(ctx, id);
  return ref && ref.data && typeof ref.data === 'object' ? ref.data : {};
}
/** Merge `patch` into its state — a new object, so a battle input taken earlier keeps the one it had. */
function setData(ctx, id, patch) {
  const ref = refOf(ctx, id);
  if (!ref) return null;
  ref.data = { ...(ref.data && typeof ref.data === 'object' ? ref.data : {}), ...patch };
  return ref.data;
}
/** The number on its icon in the effects column (null: none). */
const show = (ctx, id, n) => ctx.setEffectCounter(KEY(id), n == null ? null : Math.max(0, Math.round(n)));

/** A 任务's goal (params.n, at least 1). */
const goalOf = (p, key = 'n') => Math.max(1, Math.round(num(p[key], 1)));

/** A 任务 already done (data.done: the round)? */
const questDone = (ctx, id) => Number.isFinite(dataIn(ctx, id).done);

/** A 任务 starts counting (the pick; a holding without one: its first hook) — what is left on its icon. */
function questStart(ctx, id, goal, extra = {}) {
  if (!refOf(ctx, id) || Number.isFinite(dataIn(ctx, id).started)) return;
  setData(ctx, id, { started: ctx.round, n: 0, ...extra });
  show(ctx, id, goal);
}

/**
 * A 任务's progress is `n` now: under the goal, what is left on its icon; reached, it is done — its icon 0, the ticker
 * line, then `reward()`. Returns whether it got done now.
 */
function questAt(ctx, id, n, goal, reward) {
  if (!refOf(ctx, id) || questDone(ctx, id)) return false;
  setData(ctx, id, { n });
  if (n < goal) { show(ctx, id, goal - n); return false; }
  setData(ctx, id, { done: ctx.round });
  show(ctx, id, 0);
  ctx.ticker(msg('{name} 完成了{aug}', { name: ctx.name, aug: tn(NAMES.get(id) || id) }));
  reward();
  return true;
}

/** A counted 任务 one step on (`add`). */
function questAdd(ctx, id, goal, add, reward) {
  if (!refOf(ctx, id) || questDone(ctx, id) || !(add > 0)) return false;
  questStart(ctx, id, goal);
  return questAt(ctx, id, num(dataIn(ctx, id).n) + add, goal, reward);
}

/**
 * One random operator of `tier` from the pool — a lower tier when the pool has none of it left — gained (`golden`: its
 * elite); its view, or null.
 */
function grantChessOf(ctx, id, tier, { golden = false, toast = true } = {}) {
  for (let t = Math.max(1, Math.min(6, Math.round(tier))); t >= 1; t--) {
    const cid = ctx.rollChess({ tier: t });
    if (!cid) continue;
    const got = ctx.grantChess(cid, { source: KEY(id), golden, toast });
    if (got) return got;
  }
  return null;
}

/** `n` random items of `tier`, gained. */
function grantItemsOf(ctx, id, n, tier) {
  let got = 0;
  for (let i = 0; i < n; i++) {
    const itemId = ctx.rollItem({ tier: Math.max(1, Math.min(6, Math.round(tier))) });
    if (itemId && ctx.grantItem(itemId, { source: KEY(id) })) got++;
  }
  return got;
}

/** The chess name of a view (a game-data name param). */
const chessName = (ctx, v) => dn((v && ctx.chessRecord(v.id)?.name) || '');

/** The battles of a settlement the player fought (onBattleResult): its own (or its boss field) and its 联防, each on its own. */
function settledBattles(ctx, ev) {
  const out = [];
  if (ev && ev.result && typeof ev.result === 'object') out.push(ev.result);
  const up = ev && ev.unite && ev.unite.perPlayer ? ev.unite.perPlayer[ctx.playerId] : null;
  if (up && typeof up === 'object') out.push(up);
  return out;
}

/** The knock-outs of the player's units (operators and their summons) in the settled battles. */
function killsIn(ctx, ev) {
  let n = 0;
  for (const r of settledBattles(ctx, ev)) for (const u of Array.isArray(r.unitStats) ? r.unitStats : []) n += Math.max(0, Math.trunc(num(u && u.kills)));
  return n;
}

/** 任务·一夫当关: the reward — the operator promoted in place (no 获得时: a promotion is no gain), else a 博士投影. */
function promoteHero(ctx, id, uid, p) {
  const v = ctx.piece(uid);
  if (v && v.kind === 'chess' && !ctx.gd.isGolden(v.id) && ctx.gd.goldenIdOf(v.id) && ctx.promote(uid)) {
    ctx.toast(msg('任务·一夫当关：{chess}晋升为精锐', { chess: chessName(ctx, v) }));
    return;
  }
  ctx.grantItem(p.item, { source: KEY(id) });
}

/** The pick's round of a growing / decaying 海克斯 (data.from; a holding without a pick: the round it is first seen). */
function pickRound(ctx, id) {
  if (!refOf(ctx, id)) return null;
  const from = dataIn(ctx, id).from;
  if (Number.isFinite(from)) return from;
  setData(ctx, id, { from: ctx.round });
  return ctx.round;
}

/** The icon of a curse-then-blessing 混沌契约: the curse's rounds left, then blank. */
function curseLeft(ctx, id, p, n) {
  const left = Math.max(0, Math.round(num(p.rounds, 3)) - n);
  show(ctx, id, left > 0 ? left : null);
}

/** Prep side: augment id → (params) => handler object (onRoundStart, onBuy, onSpend, onPrepEnd, …). */
export const META = Object.freeze({
  // ---- D. 任务

  // D1 任务·百炼: chess merges after the pick
  aug_q_forge: (p) => {
    const id = 'aug_q_forge', goal = goalOf(p);
    return {
      onAugmentPick: (ctx) => questStart(ctx, id, goal),
      onMerge(ctx, ev) {
        if (!ev || ev.kind !== 'chess') return;
        questAdd(ctx, id, goal, 1, () => {
          ctx.grantItem(p.item, { source: KEY(id) });
          pay(ctx, id, p.funds);
        });
      },
    };
  },

  // D2 任务·登峰: a bond at `layers` (the most of them when several are) — its members' damage from then on (data.bond)
  aug_q_summit: (p) => {
    const id = 'aug_q_summit', goal = goalOf(p, 'layers');
    const check = (ctx) => {
      if (!refOf(ctx, id) || questDone(ctx, id)) return;
      questStart(ctx, id, goal);
      let best = null, top = 0;
      for (const [b, st] of Object.entries(ctx.bonds())) {
        const l = num(st && st.layers, 0);
        if (l > top) { top = l; best = b; }
      }
      questAt(ctx, id, top, goal, () => {
        setData(ctx, id, { bond: best });
        ctx.toast(msg('任务·登峰：{bond}的成员造成的伤害提升至 {dealt}%', { bond: dn(ctx.gd.bond(best)?.name || best), dealt: num(p.dealt, 125) }));
      });
    };
    return { onAugmentPick: check, onLayers: check, onRoundStart: check, onPrepEnd: check, onBattleResult: check };
  },

  // D3 任务·完美主义: perfect settlements after the pick
  aug_q_perfect: (p) => {
    const id = 'aug_q_perfect', goal = goalOf(p);
    return {
      onAugmentPick: (ctx) => questStart(ctx, id, goal),
      onBattleResult(ctx, ev) {
        if (!ev || !ev.perfect) return;
        questAdd(ctx, id, goal, 1, () => {
          grantChessOf(ctx, id, num(p.tier, 6));
          pay(ctx, id, p.funds);
        });
      },
    };
  },

  // D4 任务·挥金如土: funds spent after the pick (every payment: buy, refresh, level-up, reward, an effect's); then funds
  // every round start
  aug_q_spender: (p) => {
    const id = 'aug_q_spender', goal = goalOf(p);
    return {
      onAugmentPick: (ctx) => questStart(ctx, id, goal),
      onSpend(ctx, ev) { questAdd(ctx, id, goal, Math.max(0, Math.trunc(num(ev && ev.amount))), () => {}); },
      onRoundStart(ctx) { if (questDone(ctx, id)) ctx.addFunds(Math.max(0, Math.trunc(num(p.funds, 2))), KEY(id)); },
    };
  },

  // D5 任务·刷新狂人: manual refreshes after the pick; then a round's first `free` manual refreshes are free (data { round,
  // granted, base }: the free refreshes it gave this round and the round's refreshes then — the unused ones lapse at
  // the prep end, never piling up)
  aug_q_roller: (p) => {
    const id = 'aug_q_roller', goal = goalOf(p), free = Math.max(0, Math.trunc(num(p.free, 2)));
    const grant = (ctx, n) => {
      if (!(n > 0)) return;
      ctx.grantFreeRefresh(n);
      setData(ctx, id, { round: ctx.round, granted: n, base: ctx.roundStats().refreshes });
    };
    return {
      onAugmentPick: (ctx) => questStart(ctx, id, goal),
      onRefresh(ctx, ev) {
        if (!ev || ev.trigger) return;
        // done on a refresh of a prep: what is left of this round's first `free`
        questAdd(ctx, id, goal, 1, () => grant(ctx, free - ctx.roundStats().refreshes));
      },
      onRoundStart(ctx) { if (questDone(ctx, id)) grant(ctx, free); },
      onPrepEnd(ctx) {
        const d = dataIn(ctx, id);
        if (!questDone(ctx, id) || d.round !== ctx.round) return;
        const used = Math.max(0, ctx.roundStats().refreshes - num(d.base));
        const unused = Math.max(0, num(d.granted) - used);
        if (unused > 0) ctx.takeFreeRefresh(unused);
        setData(ctx, id, { granted: 0 });
      },
    };
  },

  // D6 任务·苦尽甘来: LP lost since the pick (stats.lpLost: the settlements and every other LP cost)
  aug_q_comeback: (p) => {
    const id = 'aug_q_comeback', goal = goalOf(p);
    const lost = (ctx) => num(ctx.stats().lpLost, 0);
    const check = (ctx) => {
      if (!refOf(ctx, id) || questDone(ctx, id)) return;
      questStart(ctx, id, goal, { base: lost(ctx) });
      questAt(ctx, id, Math.max(0, lost(ctx) - num(dataIn(ctx, id).base)), goal, () => {
        grantChessOf(ctx, id, num(p.tier, 6));
        pay(ctx, id, p.funds);
      });
    };
    return { onAugmentPick: check, onBattleResult: check, onRoundStart: check, onPrepEnd: check };
  },

  // D7 任务·一夫当关: one board operator's knock-outs in one battle (data.best: the most so far)
  aug_q_hero: (p) => {
    const id = 'aug_q_hero', goal = goalOf(p);
    return {
      onAugmentPick: (ctx) => questStart(ctx, id, goal, { best: 0 }),
      onBattleResult(ctx, ev) {
        if (!refOf(ctx, id) || questDone(ctx, id)) return;
        questStart(ctx, id, goal, { best: 0 });
        let hero = null;
        for (const r of settledBattles(ctx, ev)) {
          for (const u of Array.isArray(r.unitStats) ? r.unitStats : []) {
            if (!u || u.kind !== 'op' || !Number.isInteger(u.uid)) continue;
            const v = ctx.piece(u.uid);
            if (!v || v.kind !== 'chess') continue;
            const k = Math.max(0, Math.trunc(num(u.kills)));
            if (!hero || k > hero.kills) hero = { uid: u.uid, kills: k };
          }
        }
        if (!hero) return;
        const best = Math.max(num(dataIn(ctx, id).best), hero.kills);
        setData(ctx, id, { best });
        questAt(ctx, id, best, goal, () => promoteHero(ctx, id, hero.uid, p));
      },
    };
  },

  // D8 任务·广纳贤才: distinct operators (base ids) gained after the pick (data.seen)
  aug_q_recruiter: (p) => {
    const id = 'aug_q_recruiter', goal = goalOf(p);
    return {
      onAugmentPick: (ctx) => questStart(ctx, id, goal, { seen: [] }),
      onGain(ctx, ev) {
        if (!ev || ev.kind !== 'chess' || !ev.piece || !refOf(ctx, id) || questDone(ctx, id)) return;
        questStart(ctx, id, goal, { seen: [] });
        const base = ctx.gd.baseIdOf(ev.piece.id);
        const seen = Array.isArray(dataIn(ctx, id).seen) ? dataIn(ctx, id).seen : [];
        if (!base || seen.includes(base)) return;
        const next = [...seen, base];
        setData(ctx, id, { seen: next });
        questAt(ctx, id, next.length, goal, () => {
          setData(ctx, id, { seen: null });
          pay(ctx, id, p.funds);
        });
      },
    };
  },

  // D9 任务·百花齐放: active bonds at once (调和, 协防 not counted) at the pick, a round start or a prep end; then every
  // prep end each active bond with a per-layer effect +layer
  aug_q_bloom: (p) => {
    const id = 'aug_q_bloom', goal = goalOf(p);
    const check = (ctx) => {
      if (!refOf(ctx, id) || questDone(ctx, id)) return;
      questStart(ctx, id, goal);
      const n = Object.entries(ctx.bonds()).filter(([b, st]) => st && st.active && !BLOOM_SKIP.has(b)).length;
      questAt(ctx, id, n, goal, () => {});
    };
    return {
      onAugmentPick: check,
      onRoundStart: check,
      onPrepEnd(ctx) {
        check(ctx);
        if (!questDone(ctx, id)) return;
        const layer = Math.max(0, Math.trunc(num(p.layer, 2)));
        for (const [b, st] of Object.entries(ctx.bonds())) {
          if (st && st.active && !NO_STACK.has(b)) ctx.addLayers(b, layer, { requireActive: true, reason: KEY(id) });
        }
      },
    };
  },

  // D10 任务·武装到牙齿: items on the board's operators at once (the pick, a round start, a prep end)
  aug_q_armed: (p) => {
    const id = 'aug_q_armed', goal = goalOf(p);
    const check = (ctx) => {
      if (!refOf(ctx, id) || questDone(ctx, id)) return;
      questStart(ctx, id, goal);
      let n = 0;
      for (const v of ctx.board()) if (v && v.kind === 'chess') n += (v.items || []).length;
      questAt(ctx, id, n, goal, () => grantItemsOf(ctx, id, Math.max(0, Math.trunc(num(p.items, 2))), num(p.tier, 6)));
    };
    return { onAugmentPick: check, onRoundStart: check, onPrepEnd: check };
  },

  // D11 任务·速通: the 调度中心 at `level` by the end of round `round` (the icon: levels left); later the icon goes blank
  aug_q_speedrun: (p) => {
    const id = 'aug_q_speedrun', goal = goalOf(p, 'level'), last = Math.round(num(p.round, 8));
    const check = (ctx) => {
      if (!refOf(ctx, id) || questDone(ctx, id) || Number.isFinite(dataIn(ctx, id).failed)) return;
      questStart(ctx, id, goal);
      if (ctx.round > last) { setData(ctx, id, { failed: ctx.round }); show(ctx, id, null); return; }
      questAt(ctx, id, num(ctx.shopLevel(), 1), goal, () => {
        for (let i = 0; i < Math.max(0, Math.trunc(num(p.chess, 2))); i++) grantChessOf(ctx, id, num(p.tier, 6));
      });
    };
    return { onAugmentPick: check, onLevelUp: check, onRoundStart: check, onPrepEnd: check };
  },

  // ---- E. 成长、衰减与延迟回报

  // E1 金蛋: data.left — rounds to hatching
  aug_golden_egg: (p) => {
    const id = 'aug_golden_egg', rounds = Math.max(0, Math.round(num(p.rounds, 8)));
    const start = (ctx) => {
      if (!refOf(ctx, id) || Number.isFinite(dataIn(ctx, id).left)) return;
      setData(ctx, id, { left: rounds });
      show(ctx, id, rounds);
    };
    const closer = (ctx) => {
      start(ctx);
      const d = dataIn(ctx, id);
      if (!refOf(ctx, id) || Number.isFinite(d.hatched)) return;
      const left = Math.max(0, num(d.left) - 1);
      setData(ctx, id, { left });
      show(ctx, id, left);
    };
    return {
      onAugmentPick: start,
      onBattleResult(ctx, ev) { if (ev && ev.perfect) closer(ctx); },
      onRoundStart(ctx) {
        closer(ctx);
        const d = dataIn(ctx, id);
        if (!refOf(ctx, id) || Number.isFinite(d.hatched) || num(d.left) > 0) return;
        setData(ctx, id, { hatched: ctx.round });
        show(ctx, id, 0);
        const got = grantChessOf(ctx, id, num(p.tier, 6), { golden: true, toast: false });
        pay(ctx, id, p.funds);
        ctx.ticker(got
          ? msg('{name} 的金蛋孵化了：{chess}', { name: ctx.name, chess: chessName(ctx, got) })
          : msg('{name} 的金蛋孵化了', { name: ctx.name }));
      },
    };
  },

  // E2 未来规划: the payout `rounds` after the pick (data.at — the LP at the pick: server/match/augments5/g8.js)
  aug_future: (p) => ({
    onRoundStart(ctx) {
      const id = 'aug_future';
      const d = dataIn(ctx, id);
      if (!refOf(ctx, id) || Number.isFinite(d.done)) return;
      const at = Number.isFinite(d.at) ? d.at : ctx.round + Math.max(0, Math.round(num(p.rounds, 3)));
      if (!Number.isFinite(d.at)) setData(ctx, id, { at });
      if (ctx.round < at) { show(ctx, id, at - ctx.round); return; }
      setData(ctx, id, { done: ctx.round });
      show(ctx, id, 0);
      for (let i = 0; i < Math.max(0, Math.trunc(num(p.chess, 3))); i++) grantChessOf(ctx, id, num(p.tier, 5));
      ctx.grantItem(p.item, { source: KEY(id) });
      ctx.ticker(msg('{name} 的未来规划兑现了', { name: ctx.name }));
    },
  }),

  // E3 远征: every round start after the pick, the hand's rightmost operator leaves (data.sent); the `n`th brings the
  // reward back
  aug_expedition: (p) => {
    const id = 'aug_expedition', total = Math.max(1, Math.round(num(p.n, 5)));
    return {
      onAugmentPick(ctx) {
        if (!refOf(ctx, id) || Number.isFinite(dataIn(ctx, id).sent)) return;
        setData(ctx, id, { sent: 0, from: ctx.round });
        show(ctx, id, total);
      },
      onRoundStart(ctx) {
        if (!refOf(ctx, id) || Number.isFinite(dataIn(ctx, id).done)) return;
        const d = dataIn(ctx, id);
        // (a holding without a pick starts here: its first departure at the next round start)
        if (!Number.isFinite(d.sent) || !(ctx.round > num(d.from, ctx.round))) {
          if (!Number.isFinite(d.sent)) { setData(ctx, id, { sent: 0, from: ctx.round }); show(ctx, id, total); }
          return;
        }
        const hand = ctx.hand();
        let v = null;
        for (let i = hand.length - 1; i >= 0 && !v; i--) if (hand[i] && hand[i].kind === 'chess') v = hand[i];
        if (!v) return; // no operator in the hand: this round does not count
        const name = chessName(ctx, v);
        if (!ctx.destroyPiece(v.uid)) return;
        const sent = num(d.sent) + 1;
        setData(ctx, id, { sent });
        show(ctx, id, total - sent);
        ctx.toast(msg('远征：{chess}离队去远征了（{n}/{total}）', { chess: name, n: sent, total }));
        if (sent < total) return;
        setData(ctx, id, { done: ctx.round });
        grantChessOf(ctx, id, num(p.tier, 6));
        ctx.grantItem(p.item, { source: KEY(id) });
        ctx.ticker(msg('{name} 的远征队归来了', { name: ctx.name }));
      },
    };
  },

  // E5 爆米花: the icon — the bonus left (%)
  aug_popcorn: (p) => {
    const id = 'aug_popcorn';
    const update = (ctx) => { const from = pickRound(ctx, id); if (from != null) show(ctx, id, bonusPct(popcornMul(p, ctx.round - from))); };
    return { onAugmentPick: update, onRoundStart: update };
  },

  // E6 越战越勇: the icon — the bonus reached (%)
  aug_grit: (p) => {
    const id = 'aug_grit';
    const update = (ctx) => { const from = pickRound(ctx, id); if (from != null) show(ctx, id, bonusPct(gritMul(p, ctx.round - from))); };
    return { onAugmentPick: update, onRoundStart: update };
  },

  // E7 灵魂收割 / E8 坦克引擎: the knock-outs of the settled battles (data.kills); the icon — the bonus (%)
  aug_reaper: (p) => killCounter('aug_reaper', p),
  aug_tank_engine: (p) => killCounter('aug_tank_engine', p),

  // E9 长胜将军: perfect settlements in a row (data.streak); the icon — the bonus (%)
  aug_win_streak: (p) => {
    const id = 'aug_win_streak';
    return {
      onAugmentPick(ctx) { if (refOf(ctx, id) && !Number.isFinite(dataIn(ctx, id).streak)) { setData(ctx, id, { streak: 0 }); show(ctx, id, 0); } },
      onBattleResult(ctx, ev) {
        if (!refOf(ctx, id)) return;
        const streak = ev && ev.perfect ? num(dataIn(ctx, id).streak, 0) + 1 : 0;
        setData(ctx, id, { streak });
        show(ctx, id, bonusPct(streakMul(p, streak)));
      },
    };
  },

  // E10 混沌契约·力量 / E12 混沌契约·迅捷: the pick's round; the icon — the curse's rounds left
  aug_chaos_power: (p) => chaosRounds('aug_chaos_power', p),
  aug_chaos_speed: (p) => chaosRounds('aug_chaos_speed', p),

  // E11 混沌契约·财富: the incomes of the `rounds` rounds after the pick's −loss (not below 0), every later one +gain
  aug_chaos_wealth: (p) => {
    const id = 'aug_chaos_wealth', rounds = Math.max(0, Math.round(num(p.rounds, 3)));
    return {
      onAugmentPick(ctx) { if (pickRound(ctx, id) != null) curseLeft(ctx, id, p, 0); },
      onIncome(ctx, ev) {
        if (!ev || !Number.isFinite(ev.income) || !refOf(ctx, id)) return;
        const from = Number.isFinite(dataIn(ctx, id).from) ? dataIn(ctx, id).from : pickRound(ctx, id);
        const n = num(ev.round, ctx.round) - from;
        if (n < 1) return;
        if (n <= rounds) ev.income = Math.max(0, ev.income - Math.max(0, Math.trunc(num(p.loss, 3))));
        else ev.income += Math.max(0, Math.trunc(num(p.gain, 3)));
        curseLeft(ctx, id, p, n);
      },
    };
  },
});

/** 灵魂收割 / 坦克引擎 (prep): the kills of every settlement add up in data.kills. */
function killCounter(id, p) {
  return {
    onAugmentPick(ctx) { if (refOf(ctx, id) && !Number.isFinite(dataIn(ctx, id).kills)) { setData(ctx, id, { kills: 0 }); show(ctx, id, 0); } },
    onBattleResult(ctx, ev) {
      if (!refOf(ctx, id)) return;
      const kills = num(dataIn(ctx, id).kills, 0) + killsIn(ctx, ev);
      setData(ctx, id, { kills });
      show(ctx, id, bonusPct(killsMul(p, kills)));
    },
  };
}

/** 混沌契约·力量 / 混沌契约·迅捷 (prep): the pick's round; the curse's rounds left on the icon. */
function chaosRounds(id, p) {
  const update = (ctx) => { const from = pickRound(ctx, id); if (from != null) curseLeft(ctx, id, p, ctx.round - from); };
  return { onAugmentPick: update, onRoundStart: update };
}
