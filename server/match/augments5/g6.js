// server/match/augments5/g6.js — A6000 fork, 海克斯第六版 batch g6 (运营：资金、商店、调度中心): the match-side hooks of its
// augments (the prep / battle effects: server/sim/content/augments5/g6.js). The hooks: see the list in
// server/match/augments5/g4.js.
//
// This batch:
//   跳级 (aug_skip_grade)  onPick: a free level-up of the 调度中心 (PlayerState.freeLevelUp: onLevelUp as a paid one's —
//                         升级补贴, 升级福利, a strategy's level-up gift); at the top level `funds` instead
//   大卖场 (aug_mall)      `n` more chess slots of the shop while it is held (shopChessBonus, read by PlayerState._shopLayout:
//                         every roll sizes the shop by it); onPick opens the new slot at once (drawn, as a level-up's)
//   闭关修炼 (aug_retreat) onPick marks the round (EffectRef data { from }); that round and the next `rounds` − 1 the
//                         shop refuses buying an operator and every refresh (shopLock, read by player/economy.js buy /
//                         refresh: ERR.WRONG_PHASE — the item slot, level-ups, the board, items and reward picks as
//                         usual); the round start after them (roundStart) levels the 调度中心 up `levels` times for free,
//                         `funds` for each level past the top
//   金猪 (aug_gold_pig)    the click (action): the pig's funds now (its EffectRef counter, grown by the prep side), once a
//                         match — the card stays held, broken (data { broken: round }): it still counts for 〔生财〕 and is
//                         never offered again, its counter shows 0, a click on it is refused
// Engine checks this module answers (the player's own augments; nothing changes for a player without them):
//   fundsVoided(ps, n, reason)  PlayerState.addFunds — 灵质 (aug_ectoplasm): a gain other than the round income ('income')
//                         or a sale ('sell') is void
//   incomeRule(ps, ev)    PlayerState.startRound after the onIncome handlers — 灵质: the round's income as the data gives
//                         it (a handler's cut kept, any raise void: 双倍或归零's doubling, a strategy's interest) + `income`,
//                         and every pending payout void (bounty coins, 储蓄 / 金库 / 理财, the team 海克斯' credits …) but
//                         the player's own funds 专属强化III·老鲤 held over (noted at that pick)
//   shopLock(ps, what)    PlayerState.buy (an operator) / refresh — 闭关修炼's rounds, 苦修 (no refresh at all)
//   luckyRefresh(ps)      PlayerState.refresh — 幸运刷新: a paid refresh costs nothing at pct % (幸运: a good outcome)
//   rollFilter(ps)        PlayerState._rollChessSlot — 精品店: no tier-1 operator once the 调度中心 is at `level`
//   shopChessBonus(ps)    PlayerState._shopLayout — 大卖场's chess slots

import { ERR } from '../../../shared/constants.js';
import { augmentDef } from '../../../shared/augments.js';
import { msg } from '../../../shared/i18n.js';
import { luckOf, goodChance } from '../../../shared/luck.js';
import { fail } from '../match/common.js';

const KEY = (id) => `augment:${id}`;
const P = (id) => augmentDef(id)?.params ?? {};
const int = (v, d = 0) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : d);
const holds = (ps, id) => !!ps && Array.isArray(ps.augments) && ps.augments.includes(id);
const refOf = (ps, id) => (ps && Array.isArray(ps.effects) ? ps.effects.find((e) => e && e.key === KEY(id)) || null : null);

const PIG = 'aug_gold_pig';
const MALL = 'aug_mall';
const RETREAT = 'aug_retreat';
const SKIP = 'aug_skip_grade';
const LUCKY = 'aug_lucky_roll';
const BOUTIQUE = 'aug_boutique';
const ECTO = 'aug_ectoplasm';
const ASCETIC = 'aug_ascetic';
/** 专属强化III·老鲤: the pick holds the player's funds over to the next round (server/match/match/augments.js). */
const LMLEE3 = 'aug_x_lmlee3';
/** 灵质: the player's own funds 老鲤 III held over, kept at the next round start (counter: { round: amount } as two keys). */
const OWN_HELD = 'aug6:ecto:held';
const OWN_HELD_AT = 'aug6:ecto:heldAt';

// ---------------------------------------------------------------------------------------------------------------------
// engine checks

/**
 * 灵质: is a gain of `n` funds for `reason` void? Only a gain (n > 0) of a holder, and neither the round income nor a sale
 * (shop sell price — the player's own operator turned back into funds). The player hears of it (a toast).
 */
export function fundsVoided(ps, n, reason) {
  if (!(n > 0) || !holds(ps, ECTO)) return false;
  const r = String(reason || '');
  if (r === 'income' || r === 'sell') return false;
  if (ps.m && typeof ps.m.toast === 'function') ps.m.toast(ps, 'info', msg('灵质：{n} 资金作废', { n }));
  return true;
}

/**
 * 灵质 at the round start (PlayerState.startRound, after the onIncome handlers, before the funds are credited): the
 * credited income is min(the handlers' income, the data's) + `income`; the pending payouts are void but the funds 老鲤 III
 * held over at its pick. `ev` ({ round, income, pending }) is edited in place.
 */
export function incomeRule(ps, ev) {
  if (!ev || !holds(ps, ECTO)) return;
  const nn = (v) => (Number.isFinite(v) && v > 0 ? Math.trunc(v) : 0);
  const base = nn(ps.gd.income(ev.round));
  ev.income = Math.min(nn(ev.income), base) + Math.max(0, int(P(ECTO).income, 4));
  const own = ps.counters[OWN_HELD_AT] === ev.round - 1 ? nn(ps.counters[OWN_HELD]) : 0;
  const keep = Math.min(nn(ev.pending), own);
  const lost = nn(ev.pending) - keep;
  ev.pending = keep;
  ps.counters[OWN_HELD] = 0;
  ps.counters[OWN_HELD_AT] = 0;
  if (lost > 0 && ps.m && typeof ps.m.toast === 'function') ps.m.toast(ps, 'info', msg('灵质：{n} 资金作废', { n: lost }));
}

/** 闭关修炼: the rounds of the lock (EffectRef data.from = the pick's round), or false. */
function retreatOn(ps) {
  if (!holds(ps, RETREAT)) return false;
  const from = refOf(ps, RETREAT)?.data?.from;
  const r = Number(ps.m && ps.m.round);
  return Number.isInteger(from) && r >= from && r < from + Math.max(1, int(P(RETREAT).rounds, 2));
}

/**
 * The shop's refusal of `what` ('buy': an operator, 'refresh') for `ps`, or null: 闭关修炼's rounds refuse both, 苦修
 * every refresh (a free one too). An existing error code (the client shows its text); no state is touched.
 */
export function shopLock(ps, what) {
  if (!ps || !Array.isArray(ps.augments) || !ps.augments.length) return null;
  if (what === 'refresh' && ps.augments.includes(ASCETIC)) return fail(ERR.WRONG_PHASE, 'aug_ascetic: no refresh');
  if (retreatOn(ps)) return fail(ERR.WRONG_PHASE, `aug_retreat: no ${what}`);
  return null;
}

/** 幸运刷新: does this paid refresh cost nothing? One draw of the match's meta stream, for a holder only. */
export function luckyRefresh(ps) {
  if (!holds(ps, LUCKY) || !ps.m || typeof ps.m.rngMeta !== 'function') return false;
  return ps.m.rngMeta() < goodChance(int(P(LUCKY).pct, 25) / 100, luckOf(ps.augments, ps.m.enemyBuffs));
}

const notTierOne = (id, e) => !(e && e.tier <= 1);

/** 精品店: the filter of the shop's operator draws (no tier 1 from the 调度中心's `level` on), or null. */
export function rollFilter(ps) {
  if (!holds(ps, BOUTIQUE) || !(ps.shop && ps.shop.level >= int(P(BOUTIQUE).level, 3))) return null;
  return notTierOne;
}

/** 大卖场: the shop's extra chess slots (0 for anyone not holding it). */
export function shopChessBonus(ps) {
  return holds(ps, MALL) ? Math.max(0, int(P(MALL).n, 1)) : 0;
}

// ---------------------------------------------------------------------------------------------------------------------
// match hooks

/** Free level-ups of the 调度中心: `times`, `funds` each past the top. Returns [levels gained, funds paid]. */
function freeLevels(ps, times, funds, reason) {
  let up = 0, paid = 0;
  for (let i = 0; i < times; i++) {
    if (ps.freeLevelUp()) { up++; continue; }
    paid += ps.addFunds(funds, { reason });
  }
  return [up, paid];
}

export const MATCH = Object.freeze({
  onPick(m, ps, id) {
    if (id === SKIP) {
      const [up, paid] = freeLevels(ps, 1, Math.max(0, int(P(SKIP).funds, 8)), `augment:${SKIP}`);
      if (up) m.toast(ps, 'info', msg('跳级：调度中心升到 {n} 级', { n: ps.shop.level }));
      else if (paid) m.toast(ps, 'info', msg('跳级：调度中心已满级，获得 {n} 资金', { n: paid }));
    } else if (id === MALL) {
      // the slot shopChessBonus adds, drawn now (as a level-up's new slots)
      ps._openLevelSlots();
      ps.dirty();
    } else if (id === RETREAT) {
      const ref = refOf(ps, RETREAT);
      if (ref) ref.data = { from: m.round };
      m.tickerText(msg('{name} 开始闭关修炼', { name: ps.name }), 1);
    } else if (id === LMLEE3 && holds(ps, ECTO)) {
      // the funds 老鲤 III holds over right after this hook are the player's own: 灵质 keeps them (incomeRule)
      ps.counters[OWN_HELD] = Math.max(0, int(ps.funds));
      ps.counters[OWN_HELD_AT] = m.round;
    }
  },

  roundStart(m) {
    for (const ps of m.alivePlayers()) {
      if (!holds(ps, RETREAT)) continue;
      const ref = refOf(ps, RETREAT);
      const d = ref && ref.data;
      if (!d || !Number.isInteger(d.from) || d.done || m.round !== d.from + Math.max(1, int(P(RETREAT).rounds, 2))) continue;
      ref.data = { ...d, done: m.round };
      const p = P(RETREAT);
      const [, paid] = freeLevels(ps, Math.max(0, int(p.levels, 2)), Math.max(0, int(p.funds, 6)), `augment:${RETREAT}`);
      ps.dirty();
      m.tickerText(paid > 0
        ? msg('{name} 出关了：调度中心升到 {n} 级，另得 {funds} 资金', { name: ps.name, n: ps.shop.level, funds: paid })
        : msg('{name} 出关了：调度中心升到 {n} 级', { name: ps.name, n: ps.shop.level }), 1);
    }
  },

  action: Object.freeze({
    // 金猪: break it — its funds now, once a match
    [PIG](m, ps) {
      const ref = refOf(ps, PIG);
      if (!ref) return fail(ERR.BAD_TARGET);
      if (ref.data && ref.data.broken) return fail(ERR.ALREADY, 'broken');
      const n = Math.max(0, int(ref.counter));
      ref.data = { broken: m.round };
      ref.counter = 0;
      ps.dirty();
      const got = n > 0 ? ps.addFunds(n, { reason: `augment:${PIG}` }) : 0;
      m.tickerText(msg('{name} 砸开了金猪：{n} 资金', { name: ps.name, n: got }), 1);
      return null;
    },
  }),
});
