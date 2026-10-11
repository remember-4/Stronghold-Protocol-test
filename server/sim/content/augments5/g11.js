// server/sim/content/augments5/g11.js — A6000 fork, 海克斯第六版 (规则级与同盟（H1–H7、I1–I14）): the effects of
// shared/augments5/g11.js. server/sim/content/augments.js calls `install` for every augment a battle player holds (true =
// handled here) and merges `META` (augment id → prep-side handler factory, as its own META).
//
// Battle side (install; number bonuses are the independent multipliers: augDealtMul 造成的伤害提升至, dmgTakenMul 受到的伤害
// 降低, intervalMul 攻击间隔缩短):
//   叠层狂魔  aug_stack_maniac  an in-battle 特质 gain of the player (layerGain reason 'garrison') +pct % (floored, at least
//                              1) — after the other gain handlers (魔王, 乘胜追击, 小盟约专精 ≥ −100, 专精深耕 −150)
//   卦象      aug_hexagram      the round's trigram (EffectRef data { round, gua }, the prep's draw): 乾 every operator
//                              ×dealt %; 坤 −taken %; 巽 interval −interval %; 震 the first moment the field has enemies,
//                              every enemy on it is stunned `stun` s (immunities and 抵抗 as usual; fx 'shockBlast'); 离 an
//                              attack of the player's units that lands on an enemy sets a burn on it (one per attacker,
//                              refreshed by its next attack): every second for burnSec s, burn % of that attacker's ATK as
//                              arts damage (a DoT, tag 'dot'). 坎 / 艮 / 兑 act outside the battle.
//   血契      aug_blood_pact    every operator ×dealt % (the LP: server/match/augments5/g11.js at the round start)
//   连环计    aug_scheme        every operator (1 + pct %)^n, at most max % — n = the takes counted on its EffectRef's
//                              counter (server/match/augments5/g11.js onTake)
// The batch's other augments have no battle part (side 'meta': their EffectRefs never reach a battle).
//
// Prep side (META): 诅咒王冠's deployments at the pick, 叠层狂魔's prep gains (onLayers of a 特质's gain, reason
// 'garrison:…'; the battle's own gains were raised in battle — settle's reason 'battle' is left alone), 卦象's draw (the
// pick and every round start; 坎's funds, 兑's free refreshes — the unused ones lapse at the prep end — and the trigram
// as the EffectRef's counter, the name on its icon), 混沌召唤's outcome at the pick. The team parts that need the match at
// a dispatcher hook — a teammate's merge (搭便车) or item purchase (吃回扣: every player carries a hidden watcher
// EffectRef while someone holds them), the holder's own purchase of the snatched slot and its prep end (抢购), its level-up
// (公摊) — forward to `SERVER.call(ctx, id, hook, ev)`, set by server/match/augments5/g11.js on the server; in a browser
// (which runs battles only) it stays null.

import { num, playerOps, passiveBuff } from '../support/index.js';
import { N_, msg } from '../../../../shared/i18n.js';

const KEY = (id) => `augment:${id}`;
const pct = (v) => num(v) / 100;
const cut = (v) => Math.max(0, 1 - pct(v));
const faster = (v) => Math.max(0.1, 1 - pct(v));

/** Bonds with no per-layer effect (调和, 协防, 独行, 绝技 — content/augments.js NO_STACK; its own copy: no import cycle). */
const NO_STACK = new Set(['maniShip', 'emptyShip', 'soloShip', 'suntShip']);

/**
 * 卦象: the eight trigrams in the draw's order (each 1/8 — a categorical draw, no 幸运) and the name the effects column
 * shows (the EffectRef's counter).
 */
export const TRIGRAMS = Object.freeze(['qian', 'kun', 'zhen', 'xun', 'kan', 'li', 'gen', 'dui']);
export const TRIGRAM_NAME = Object.freeze({
  qian: N_('乾'), kun: N_('坤'), zhen: N_('震'), xun: N_('巽'), kan: N_('坎'), li: N_('离'), gen: N_('艮'), dui: N_('兑'),
});

/**
 * The server's side of this batch's prep handlers: `call(ctx, augmentId, hook, ev)` (server/match/augments5/g11.js; null
 * where no match runs — a browser, a sim test).
 */
export const SERVER = { call: null };
const forward = (id, ...hooks) => () => Object.fromEntries(hooks.map((h) => [h, (ctx, ev) => { if (SERVER.call) SERVER.call(ctx, id, h, ev); }]));

/** The data of one of the player's augment EffectRefs (what the prep / match side decided), or null. */
function dataOf(ps, id) {
  const ref = (ps.playerEffects || []).find((r) => r && r.key === KEY(id));
  return ref && ref.data && typeof ref.data === 'object' ? ref.data : null;
}

/** The counter of one of the player's augment EffectRefs, or 0. */
function counterOf(ps, id) {
  const ref = (ps.playerEffects || []).find((r) => r && r.key === KEY(id));
  return Math.max(0, num(ref && ref.counter, 0));
}

/** Every operator of the player: a match-long buff of `mods` under the augment's key. */
function allOps(battle, pid, id, mods, extra = {}) {
  for (const u of playerOps(battle, pid)) passiveBuff(battle, u, KEY(id), mods, extra);
}

/** 卦象·震: the first moment the field has an enemy, every enemy on it is stunned `sec` s. */
function stunOnce(battle, key, sec) {
  if (!(sec > 0)) return;
  let done = false;
  battle.on('tick', () => {
    if (done) return;
    const list = battle.enemies.filter((e) => e.alive && !e.hidden);
    if (!list.length) return;
    done = true;
    for (const e of list) if (e.alive) battle.applyStatus(e, 'stun', { duration: sec, source: null });
    const R = battle.rect;
    battle.fx('shockBlast', { x: (R.c0 + R.c1) / 2, y: (R.r0 + R.r1) / 2, r: 20, src: key });
  });
}

/** 卦象·离: an attack of the player's units that lands on an enemy sets (or refreshes) that attacker's burn on it. */
function burnOnHit(battle, pid, key, share, sec) {
  if (!(share > 0) || !(sec > 0)) return;
  battle.on('damaged', (c) => {
    const s = c.source;
    const e = c.target;
    if (!s || s.side !== 'ally' || s.ownerId !== pid || !c.dmg || !c.dmg.isAttack || !(c.amount > 0)) return;
    if (!e || e.side !== 'enemy' || !e.alive) return;
    battle.addBuff(e, {
      key: `${key}:burn:${s.id}`, duration: sec, interval: 1, refresh: 'extend', source: s, tags: ['dot'],
      onTick: ({ battle: b, unit: t }) => { if (t.alive) b.dealDamage(s, t, { amount: num(s.s && s.s.atk) * share, type: 'arts', canDodge: false, tags: ['dot', key] }); },
    });
  });
}

const BATTLE = {
  // H3 叠层狂魔: an in-battle 特质 gain +pct % (floored, at least 1)
  aug_stack_maniac(battle, ps, id, p) {
    const pid = ps.playerId;
    const share = num(p.pct, 50);
    battle.on('layerGain', (c) => {
      if (c.playerId !== pid || c.reason !== 'garrison' || !(c.n > 0) || NO_STACK.has(c.bondId)) return;
      c.n += Math.max(1, Math.floor((c.n * share) / 100 + 1e-9));
    }, { priority: -160 });
  },

  // H4 卦象: the battle trigrams of this battle's round
  aug_hexagram(battle, ps, id, p) {
    const d = dataOf(ps, id);
    if (!d || d.round !== battle.round) return;
    const pid = ps.playerId;
    switch (d.gua) {
      case 'qian': allOps(battle, pid, id, { augDealtMul: pct(num(p.dealt, 125)) }, { visible: true }); break;
      case 'kun': allOps(battle, pid, id, { dmgTakenMul: cut(num(p.taken, 25)) }, { visible: true }); break;
      case 'xun': allOps(battle, pid, id, { intervalMul: faster(num(p.interval, 20)) }, { visible: true }); break;
      case 'zhen': stunOnce(battle, KEY(id), num(p.stun, 2)); break;
      case 'li': burnOnHit(battle, pid, KEY(id), pct(num(p.burn, 20)), num(p.burnSec, 3)); break;
      default: break;
    }
  },

  // H6 血契
  aug_blood_pact(battle, ps, id, p) { allOps(battle, ps.playerId, id, { augDealtMul: pct(num(p.dealt, 140)) }); },

  // I10 连环计: the takes so far (its EffectRef's counter)
  aug_scheme(battle, ps, id, p) {
    const n = counterOf(ps, id);
    if (!(n > 0)) return;
    const mul = Math.min(pct(num(p.max, 120)) || Infinity, Math.pow(1 + pct(num(p.pct, 1)), n));
    if (mul > 1) allOps(battle, ps.playerId, id, { augDealtMul: mul }, { visible: true });
  },
};

/** This batch's augments without a battle part (side 'meta': never in a battle's playerEffects — handled, nothing to do). */
const PREP_ONLY = new Set([
  'aug_cursed_crown', 'aug_open_door', 'aug_gacha', 'aug_call_chaos', 'aug_freeride', 'aug_copycat', 'aug_snatch', 'aug_borrow_knife',
  'aug_borrow', 'aug_double_agent', 'aug_cuckoo', 'aug_contrarian', 'aug_kickback', 'aug_tit_for_tat', 'aug_equalize', 'aug_split_bill',
  'aug_usurp',
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

// ---------------------------------------------------------------------------------------------------------------------
// prep side

/** Active bonds of the player a 海克斯 may add layers to (NO_STACK left out), in the data's order. */
const stackable = (ctx) => Object.entries(ctx.bonds()).filter(([b, st]) => st && st.active && !NO_STACK.has(b)).map(([b]) => b);

/** 卦象: the round's draw — its data for the battles and the match side, its ticker line, 坎's funds, 兑's refreshes. */
function drawTrigram(ctx, p) {
  const key = KEY('aug_hexagram');
  const ref = ctx.effect(key);
  if (!ref || (ref.data && ref.data.round === ctx.round)) return;
  const gua = TRIGRAMS[Math.min(TRIGRAMS.length - 1, Math.floor(ctx.rng() * TRIGRAMS.length))];
  ref.data = { round: ctx.round, gua };
  ctx.setEffectCounter(key, TRIGRAM_NAME[gua]);
  const name = ctx.name;
  // (one whole msgid per trigram: a message param cannot be a message — shared/i18n.js cleanParam)
  switch (gua) {
    case 'qian': ctx.ticker(msg('卦象：{name} 抽到了乾卦，本回合所有干员造成的伤害提升至 {pct}%', { name, pct: num(p.dealt, 125) })); break;
    case 'kun': ctx.ticker(msg('卦象：{name} 抽到了坤卦，本回合受到的伤害降低 {pct}%', { name, pct: num(p.taken, 25) })); break;
    case 'zhen': ctx.ticker(msg('卦象：{name} 抽到了震卦，开战时晕眩场上所有敌人 {sec} 秒', { name, sec: num(p.stun, 2) })); break;
    case 'xun': ctx.ticker(msg('卦象：{name} 抽到了巽卦，本回合攻击间隔缩短 {pct}%', { name, pct: num(p.interval, 20) })); break;
    case 'kan': {
      const n = Math.max(0, Math.trunc(num(p.funds, 3)));
      if (n > 0) ctx.addFunds(n, key);
      ctx.ticker(msg('卦象：{name} 抽到了坎卦，获得 {n} 资金', { name, n }));
      break;
    }
    case 'li': ctx.ticker(msg('卦象：{name} 抽到了离卦，本回合攻击附带灼燃', { name })); break;
    case 'gen': ctx.ticker(msg('卦象：{name} 抽到了艮卦，本回合最多扣除 {n} 点目标生命', { name, n: num(p.lp, 3) })); break;
    case 'dui': {
      const n = Math.max(0, Math.trunc(num(p.refresh, 3)));
      if (n > 0) ctx.grantFreeRefresh(n);
      ref.data.free = n;
      ctx.ticker(msg('卦象：{name} 抽到了兑卦，本回合前 {n} 次主动刷新免费', { name, n }));
      break;
    }
    default: break;
  }
}

/** 混沌召唤: one of six at the pick (a categorical draw: no 幸运), announced 「XX 开出了 YY」. */
function callChaos(ctx, p) {
  const key = KEY('aug_call_chaos');
  const name = ctx.name;
  const k = Math.min(5, Math.floor(ctx.rng() * 6));
  if (k === 0) {
    let n = 0;
    for (let i = 0; i < Math.max(0, Math.trunc(num(p.ops, 3))); i++) {
      const id = ctx.rollChess({ tier: 6 });
      if (id && ctx.grantChess(id, { source: key })) n++;
    }
    ctx.ticker(msg('混沌召唤：{name} 开出了 {n} 名 6 阶干员', { name, n }));
  } else if (k === 1) {
    const n = Math.max(0, Math.trunc(num(p.projectors, 2)));
    for (let i = 0; i < n; i++) ctx.grantItem(p.item, { source: key });
    ctx.ticker(msg('混沌召唤：{name} 开出了 {n} 个博士投影', { name, n }));
  } else if (k === 2) {
    const n = Math.max(0, Math.trunc(num(p.funds, 25)));
    ctx.addFunds(n, key);
    ctx.ticker(msg('混沌召唤：{name} 开出了 {n} 资金', { name, n }));
  } else if (k === 3) {
    let n = 0;
    for (let i = 0; i < Math.max(0, Math.trunc(num(p.items, 3))); i++) {
      const id = ctx.rollItem({ tier: 6 });
      if (id && ctx.grantItem(id, { source: key })) n++;
    }
    ctx.ticker(msg('混沌召唤：{name} 开出了 {n} 件 6 阶装备', { name, n }));
  } else if (k === 4) {
    const n = Math.max(0, Math.trunc(num(p.layer, 40)));
    for (const b of stackable(ctx)) ctx.addLayers(b, n, { requireActive: true, reason: key });
    ctx.ticker(msg('混沌召唤：{name} 开出了所有已激活盟约 +{n} 层', { name, n }));
  } else {
    const n = Math.max(0, Math.trunc(num(p.deploy, 1)));
    ctx.addDeployCap(n);
    ctx.ticker(msg('混沌召唤：{name} 开出了部署上限 +{n}', { name, n }));
  }
}

/** Prep side: augment id → (params) => handler object (onRoundStart, onBuy, onSpend, onPrepEnd, …). */
export const META = Object.freeze({
  // H1 诅咒王冠: the deployments (the LP cap and the leaks' extra LP: the match side)
  aug_cursed_crown: (p) => ({ onAugmentPick(ctx) { ctx.addDeployCap(num(p.deploy, 2)); } }),

  // H3 叠层狂魔: a prep gain of a 特质 (reason 'garrison:…') +pct %; its own extra (reason the augment's key) and the battle's
  // settled gains (reason 'battle', raised in battle already) are not raised again
  aug_stack_maniac: (p) => ({
    onLayers(ctx, ev) {
      if (!ev || !String(ev.reason).startsWith('garrison:') || NO_STACK.has(ev.bondId)) return;
      const n = num(ev.to) - num(ev.from);
      if (n > 0) ctx.addLayers(ev.bondId, Math.max(1, Math.floor((n * num(p.pct, 50)) / 100 + 1e-9)), { reason: KEY('aug_stack_maniac') });
    },
  }),

  // H4 卦象: the draw at the pick and every round start; 兑's free refreshes the round did not use lapse at its prep end
  aug_hexagram: (p) => ({
    onAugmentPick: (ctx) => drawTrigram(ctx, p),
    onRoundStart: (ctx) => drawTrigram(ctx, p),
    onPrepEnd(ctx) {
      const d = ctx.effect(KEY('aug_hexagram'))?.data;
      if (!d || d.round !== ctx.round || d.gua !== 'dui' || !(d.free > 0)) return;
      const unused = Math.max(0, d.free - (ctx.roundStats().refreshes || 0));
      if (unused > 0) ctx.takeFreeRefresh(unused);
      d.free = 0;
    },
  }),

  // H7 混沌召唤
  aug_call_chaos: (p) => ({ onAugmentPick: (ctx) => callChaos(ctx, p) }),

  // the team parts at a dispatcher hook (see the header)
  aug_freeride: forward('aug_freeride', 'onMerge'),
  aug_kickback: forward('aug_kickback', 'onBuy'),
  aug_snatch: forward('aug_snatch', 'onBuy', 'onPrepEnd'),
  aug_split_bill: forward('aug_split_bill', 'onLevelUp'),
});
