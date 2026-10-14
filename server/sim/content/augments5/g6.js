// server/sim/content/augments5/g6.js — A6000 fork, 海克斯第六版 (运营：资金、商店、调度中心（B1–B19）): the effects of
// shared/augments5/g6.js. server/sim/content/augments.js calls `install` for every augment a battle player holds (true =
// handled here) and merges `META` (augment id → prep-side handler factory, as its own META).
//
// Battle side (install):
//   aug_ascetic      苦修: every operator of the player augDealtMul pct % (a match-long passive buff, as 玻璃大炮); its
//                    no-refresh rule is the shop's (server/match/augments5/g6.js shopLock)
//   aug_reserve_dp   预备费: the battles of the round the prep end priced (EffectRef data { round, dp }) start with dp more
//                    DP (Battle.addDp at the build: the start's deployment is free, the redeploys pay from it)
//   aug_budget       充足预算: dp more DP at the build; DP recovery +pct % (each tick pct % of the battle's dpPerSec more —
//                    Battle.addDp, so the DP cap holds)
// Prep side (META), on the player's own EffectRef — the state an augment keeps rides on it (counter, data), so 借来用用
// (transferAugment) takes it along:
//   金猪       onAugmentPick: counter = start; onRoundStart: + grow until it is broken (the click: server/match/augments5/g6.js)
//   理财       onPrepEnd: min(max, the leftover) into the account (data { principal, saved }, counter = principal); the
//              round start after `rounds` prep ends pays ⌊principal × mul⌋ and the account starts again. A strategy that
//              keeps its leftover anyway (坎诺特) moves the deposit out of its funds
//   金库       onPrepEnd: min(max, the leftover) as pending funds (never for a strategy that keeps its leftover anyway)
//              理财 and 金库 share one leftover: what one keeps the other does not (pick order); the leftover-readers
//              (储蓄, 守财奴, 预备费) still read the whole of it
//   时间胶囊   onAugmentPick: min(funds, the player's funds) sealed (taken), the opening round min(round, the Final Assault's
//              round) — never before the next round — in data { sealed, at }, counter = rounds left; that round start pays
//              sealed × mul
//   骰子大师   onRoundStart: a die (幸运: luckyDraw keeps the better of two) → low / mid / high funds, counter = the roll
//   店长推荐   onRefresh: after the round's first manual refresh the right-most chess slot shows an operator of the tier
//              above the 调度中心's level (≤ 6), from the pool, at its own price (none of that tier left: unchanged)
//   精品店     onAugmentPick: + funds (the shop's tier-1 filter: server/match/augments5/g6.js rollFilter)
//   升级福利   onLevelUp: the new level's count of free refreshes (they keep, PlayerState.shop.freeRefreshes)
//   幸运刷新   onRefresh: the toast of a refresh that cost nothing (the draw: server/match/augments5/g6.js luckyRefresh)
//   刷新券     onAugmentPick: n free refreshes
//   打折季     onPrice: an operator's price − n (not below min) while fewer than max discounted operators were bought this
//              round; onBuy counts a purchase it discounted; onIncome: − income
//   预备费     onPrepEnd: ⌊leftover / per⌋ (≤ max) for this round's battles (data { round, dp }, counter = dp)
//   赏金猎人   onBattleStart of a normal battle (not a preview): one more spawn — a copy of the round's most numerous plain
//              NORMAL enemy (its route, time and round mods; HP = mul × the plain NORMAL enemies' average HP), tag
//              'bounty', `funds` coins to its killer (the bounty path: the result's coins → next round). In the spec, so a
//              client's result is checked against it like any spawn (server/match/fields.js specBounds).
// 跳级, 大卖场, 闭关修炼, 灵质 have no prep handler: server/match/augments5/g6.js and the engine checks it answers.

import { num, playerOps, passiveBuff } from '../support/index.js';
import { msg } from '../../../../shared/i18n.js';
import { luckOf, luckyDraw } from '../../../../shared/luck.js';
import { DEFS } from '../../../../shared/augments5/g6.js';

const KEY = (id) => `augment:${id}`;
const pct = (v) => num(v) / 100;
const int = (v, d = 0) => Math.trunc(num(v, d));

/** The data of one of the player's augment EffectRefs (battle side), or null. */
function dataOf(ps, id) {
  const ref = (ps.playerEffects || []).find((r) => r && r.key === KEY(id));
  return ref && ref.data && typeof ref.data === 'object' ? ref.data : null;
}

// ---------------------------------------------------------------------------------------------------------------------
// battle side

const BATTLE = Object.freeze({
  aug_ascetic(battle, ps, p, key) {
    const mul = pct(num(p.pct, 130));
    for (const u of playerOps(battle, ps.playerId)) passiveBuff(battle, u, key, { augDealtMul: mul });
  },

  aug_reserve_dp(battle, ps, p, key, id) {
    const d = dataOf(ps, id);
    if (!d || d.round !== battle.round) return;
    const n = Math.min(Math.max(0, int(p.max, 10)), Math.max(0, int(d.dp)));
    if (n > 0) battle.addDp(ps.playerId, n);
  },

  aug_budget(battle, ps, p) {
    const pid = ps.playerId;
    const dp = Math.max(0, num(p.dp, 6));
    if (dp > 0) battle.addDp(pid, dp);
    const more = pct(num(p.pct, 10));
    if (more > 0) battle.on('tick', ({ dt }) => { battle.addDp(pid, more * battle.flags.dpPerSec * (dt ?? battle.dt)); });
  },
});
/** This batch's augments without a battle part (side 'meta': never in a battle's playerEffects). */
const PREP_ONLY = new Set(DEFS.filter((d) => d.side === 'meta').map((d) => d.id));

/**
 * Battle side: install augment `id` (definition `def`) of player `ps` (the battle's player input) on `battle`.
 * @returns {boolean} whether this batch handles the id
 */
export function install(battle, ps, id, def) {
  const fn = BATTLE[id];
  if (!fn) return PREP_ONLY.has(id);
  fn(battle, ps, (def && def.params) || {}, KEY(id), id);
  return true;
}

// ---------------------------------------------------------------------------------------------------------------------
// prep side

/** Per-round counter key of a player (reset lazily when the round changes). */
function roundKey(ctx, key) {
  if (ctx.counter(`${key}:r`) !== ctx.round) { ctx.setCounter(`${key}:r`, ctx.round); ctx.setCounter(key, 0); }
  return key;
}

/** Does the player's strategy keep its leftover funds anyway (坎诺特: gd.leftoverKeptBands)? */
const keepsLeftover = (ctx) => ctx.gd.leftoverKeptBands.includes(ctx.bandId());

/**
 * 理财 / 金库: up to `max` of this prep end's leftover funds that the other of them has not kept yet (counter
 * 'aug6:kept', per round). A strategy that keeps its leftover anyway moves them out of its funds (they would stay);
 * for everyone else they are lost at the prep end in any case, so the funds stay as they are for the other readers.
 */
function keepLeftover(ctx, max, id) {
  const k = roundKey(ctx, 'aug6:kept');
  const n = Math.min(Math.max(0, max), Math.max(0, ctx.funds() - ctx.counter(k)));
  if (!(n > 0)) return 0;
  if (keepsLeftover(ctx)) ctx.addFunds(-n, `augment:${id}`);
  else ctx.incCounter(k, n);
  return n;
}

/** An enemy whose HP is a count of hits (the 14 器物, 刺胄之弹 …: "需要N次伤害击倒") — no HP to average or copy. */
const HIT_COUNT = /需要.{0,4}次(?:伤害|攻击)击倒/; // i18n-ignore: matches the data's ability text
const hitCounted = (rec) => (Array.isArray(rec && rec.abilities) ? rec.abilities : []).some((a) => HIT_COUNT.test(String((a && a.text) || '')));

/**
 * 赏金猎人: the bounty spawn of one normal field (`spawns`: its list in onBattleStart), or null. The plain NORMAL enemies
 * of the round (no tag, counted, not a token, not a hit-count one): HP = mul × their average (data max HP × the spawn's
 * hpMul, by count); the enemy, route, round mods and time window of the most numerous of them (ties: the first), at the
 * middle of its window.
 */
export function hunterSpawn(gd, spawns, playerId, p) {
  const plain = [];
  let n = 0, hp = 0;
  for (const s of Array.isArray(spawns) ? spawns : []) {
    if (!s || typeof s.enemyKey !== 'string' || s.tag || s.countInTotal === false) continue;
    const rec = gd.enemy(s.enemyKey);
    const max = num(rec && rec.stats && rec.stats.maxHp, 0);
    if (!rec || String(rec.rank || 'NORMAL').toUpperCase() !== 'NORMAL' || rec.notCountInTotal || rec.tokenOnly || !(max > 0) || hitCounted(rec)) continue;
    const c = Math.max(1, int(s.count, 1));
    const mul = num(s.mods && s.mods.hpMul, 1);
    plain.push({ s, c, max });
    n += c;
    hp += c * max * (mul > 0 ? mul : 1);
  }
  if (!plain.length || !(n > 0)) return null;
  let host = plain[0];
  for (const x of plain) if (x.c > host.c) host = x;
  const s = host.s;
  const coins = Math.max(0, int(p.funds, 2));
  const spec = {
    time: Math.max(0, num(s.time, 0)) + Math.floor((host.c - 1) / 2) * Math.max(0, num(s.interval, 0)),
    enemyKey: s.enemyKey,
    routeIndex: s.routeIndex ?? 0,
    count: 1,
    interval: 0,
    mods: { ...(s.mods || {}), hpMul: (Math.max(0, num(p.mul, 4)) * hp) / n / host.max },
    tag: 'bounty',
    ownerPlayerId: playerId,
    bounty: { coins, ownerPlayerId: playerId },
  };
  if (s.route) spec.route = s.route;
  if (s.preview && typeof s.preview === 'object') spec.preview = { ...s.preview };
  return spec;
}

/** 打折季: the shop slots its discount applied to at their last pricing (onBuy counts the operators it made cheaper). */
const SALE_SLOTS = new WeakSet();

/** Prep side: augment id → (params) => handler object (onRoundStart, onBuy, onSpend, onPrepEnd, …). */
export const META = Object.freeze({
  // B1 金猪: the funds inside (counter); the click breaks it (server/match/augments5/g6.js)
  aug_gold_pig: (p) => ({
    onAugmentPick(ctx) { ctx.setEffectCounter(KEY('aug_gold_pig'), Math.max(0, int(p.start, 3))); },
    onRoundStart(ctx) {
      const ref = ctx.effect(KEY('aug_gold_pig'));
      if (!ref || (ref.data && ref.data.broken)) return;
      ctx.setEffectCounter(ref.id, Math.max(0, int(ref.counter)) + Math.max(0, int(p.grow, 2)));
    },
  }),

  // B2 理财: deposits at the prep end, the payout at the round start after `rounds` of them
  aug_wealth: (p) => {
    const account = (ref) => ({ principal: Math.max(0, int(ref.data && ref.data.principal)), saved: Math.max(0, int(ref.data && ref.data.saved)) });
    return {
      onPrepEnd(ctx) {
        const ref = ctx.effect(KEY('aug_wealth'));
        if (!ref) return;
        const a = account(ref);
        const n = keepLeftover(ctx, int(p.max, 6), 'aug_wealth');
        ref.data = { principal: a.principal + n, saved: a.saved + 1 };
        ctx.setEffectCounter(ref.id, a.principal + n);
      },
      onRoundStart(ctx) {
        const ref = ctx.effect(KEY('aug_wealth'));
        if (!ref) return;
        const a = account(ref);
        if (a.saved < Math.max(1, int(p.rounds, 4))) return;
        ref.data = { principal: 0, saved: 0 };
        ctx.setEffectCounter(ref.id, 0);
        const pay = Math.floor(a.principal * Math.max(0, num(p.mul, 1.5)) + 1e-9);
        const got = pay > 0 ? ctx.addFunds(pay, 'augment:aug_wealth') : 0;
        ctx.toast(msg('理财到期：本金 {a}，取出 {n} 资金', { a: a.principal, n: got }));
      },
    };
  },

  // B3 金库: the leftover (≤ max) at the next round start
  aug_vault: (p) => ({
    onPrepEnd(ctx) {
      if (keepsLeftover(ctx)) return;
      const n = keepLeftover(ctx, int(p.max, 8), 'aug_vault');
      if (n > 0) ctx.addPendingFunds(n);
    },
  }),

  // B4 时间胶囊: sealed at the pick, opened (× mul) at its round's start
  aug_capsule: (p) => ({
    onAugmentPick(ctx) {
      const ref = ctx.effect(KEY('aug_capsule'));
      if (!ref) return;
      const sealed = Math.min(Math.max(0, int(p.funds, 5)), Math.max(0, ctx.funds()));
      if (sealed > 0) ctx.addFunds(-sealed, 'augment:aug_capsule');
      const at = Math.max(ctx.round + 1, Math.min(int(p.round, 12), int(ctx.gd.bossRound, 14)));
      ref.data = { sealed, at };
      ctx.setEffectCounter(ref.id, at - ctx.round);
    },
    onRoundStart(ctx) {
      const ref = ctx.effect(KEY('aug_capsule'));
      const d = ref && ref.data;
      if (!d || d.opened || !Number.isInteger(d.at)) return;
      if (ctx.round < d.at) { ctx.setEffectCounter(ref.id, d.at - ctx.round); return; }
      ref.data = { ...d, opened: ctx.round };
      ctx.setEffectCounter(ref.id, 0);
      const n = Math.max(0, int(d.sealed)) * Math.max(0, int(p.mul, 3));
      const got = n > 0 ? ctx.addFunds(n, 'augment:aug_capsule') : 0;
      ctx.ticker(msg('{name} 打开了时间胶囊：{n} 资金', { name: ctx.name, n: got }));
    },
  }),

  // B5 骰子大师: a die a round start (幸运: the better of two)
  aug_dice_master: (p) => ({
    onRoundStart(ctx) {
      const roll = luckyDraw(ctx.rng, () => 1 + Math.min(5, Math.floor(ctx.rng() * 6)), luckOf(ctx.augments(), ctx.enemyBuffs?.()));
      const n = Math.max(0, roll <= 2 ? int(p.low, 1) : roll >= 6 ? int(p.high, 3) : int(p.mid, 2));
      ctx.setEffectCounter(KEY('aug_dice_master'), roll);
      const got = n > 0 ? ctx.addFunds(n, 'augment:aug_dice_master') : 0;
      ctx.toast(msg('骰子大师：掷出 {roll} 点，获得 {n} 资金', { roll, n: got }));
    },
  }),

  // B6 店长推荐: the round's first manual refresh — the right-most chess slot one tier above the 调度中心's level
  aug_innkeeper: () => ({
    onRefresh(ctx, ev) {
      if ((ev && ev.trigger) || ctx.roundStats().refreshes !== 1) return;
      const slots = ctx.shopSlots();
      let i = -1;
      for (let k = slots.length - 1; k >= 0; k--) if (slots[k] && slots[k].kind === 'chess') { i = k; break; }
      if (i < 0) return;
      const tier = Math.min(6, Math.max(1, int(ctx.shopLevel(), 1)) + 1);
      const id = ctx.rollChess({ tier, filter: (x) => !ctx.gd.isGolden(x) });
      if (id) ctx.setShopSlot(i, { kind: 'chess', id, frozen: slots[i].frozen });
    },
  }),

  // B7 精品店: the funds at the pick (the shop's filter: server/match/augments5/g6.js rollFilter)
  aug_boutique: (p) => ({ onAugmentPick(ctx) { ctx.addFunds(Math.max(0, int(p.funds, 2)), 'augment:aug_boutique'); } }),

  // B11 升级福利: every level-up (a free one too) — the new level's count of free refreshes
  aug_level_gift: () => ({
    onLevelUp(ctx, ev) {
      const n = Math.max(0, int(ev && ev.level)-1);
      if (!(n > 0)) return;
      ctx.grantFreeRefresh(n);
      ctx.toast(msg('升级福利：获得 {n} 次免费刷新', { n }));
    },
  }),

  // B12 幸运刷新: the refresh the shop let go for nothing (PlayerState.refresh: ev.lucky)
  aug_lucky_roll: () => ({ onRefresh(ctx, ev) { if (ev && ev.lucky) ctx.toast(msg('幸运刷新：这次刷新不花资金')); } }),

  // B13 刷新券
  aug_roll_tickets: (p) => ({ onAugmentPick(ctx) { ctx.grantFreeRefresh(Math.max(0, int(p.n, 8))); } }),

  // B14 打折季
  aug_sale: (p) => {
    const n = Math.max(0, int(p.n, 1)), min = Math.max(0, int(p.min, 1)), max = Math.max(0, int(p.max, 4));
    return {
      onPrice(ctx, ev) {
        if (!ev || !ev.slot || ev.slot.kind !== 'chess') return;
        const price = num(ev.price, 0);
        if (!(n > 0) || !(price > min) || ctx.counter(roundKey(ctx, 'aug6:sale')) >= max) { SALE_SLOTS.delete(ev.slot); return; }
        ev.price = Math.max(min, price - n);
        SALE_SLOTS.add(ev.slot);
      },
      onBuy(ctx, ev) {
        if (!ev || ev.kind !== 'chess' || !ev.slot || !SALE_SLOTS.has(ev.slot)) return;
        SALE_SLOTS.delete(ev.slot);
        ctx.incCounter(roundKey(ctx, 'aug6:sale'), 1);
      },
      onIncome(ctx, ev) { if (ev && Number.isFinite(ev.income)) ev.income = Math.max(0, ev.income - Math.max(0, int(p.income, 1))); },
    };
  },

  // B17 预备费: the leftover priced in DP for this round's battles
  aug_reserve_dp: (p) => ({
    onPrepEnd(ctx) {
      const ref = ctx.effect(KEY('aug_reserve_dp'));
      if (!ref) return;
      const dp = Math.min(Math.max(0, int(p.max, 10)), Math.floor(Math.max(0, ctx.funds()) / Math.max(1, int(p.per, 2))));
      ref.data = { round: ctx.round, dp };
      ctx.setEffectCounter(ref.id, dp);
    },
  }),

  // B19 赏金猎人: the bounty joins the normal field's spawn list
  aug_bounty_hunter: (p) => ({
    onBattleStart(ctx, ev) {
      if (!ev || ev.kind !== 'normal' || ev.preview || !Array.isArray(ev.spawns)) return;
      const spec = hunterSpawn(ctx.gd, ev.spawns, ctx.playerId, p);
      if (spec) ev.spawns.push(spec);
    },
  }),
});
