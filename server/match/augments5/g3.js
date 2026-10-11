// server/match/augments5/g3.js — A6000 fork, 海克斯第五版 batch g3: the match-side hooks of its augments (the prep / battle
// effects: server/sim/content/augments5/g3.js). server/match/match/augments.js calls each hook present, in batch order:
//   lpCap(m, ps, cap) → cap           the most LP a round's leaks may cost ps (after 止损 and the enemy upgrades)
//   onPick(m, ps, id)                 ps just took augment id (after its EffectRef and onAugmentPick)
//   roundStart(m)                     the round start, after every player's onRoundStart and the older team 海克斯
//   charges(m, charges)               settlement, before the LP is charged: playerId → LP charge (rewrite in place)
//   afterCharges(m, perfect)          settlement, after the LP is charged, before the eliminations: playerId → perfect
//   action: { [augmentId]: (m, ps, def, target) → null | { error } }   a click in the prep (g.augAction, once a round;
//                                     `target`: a teammate's playerId when the client sent one, else null)
// m.teamFx(kind, data) broadcasts a team effect for the client's team panel (server/match/match/augments.js).
//
// This batch:
//   双倍或归零 (aug_double_or_nothing)  the click bets this round (counter 'aug:double:bet' = the round); the settlement
//                        (afterCharges) turns a bet of this round into the next round's income: counters 'aug:double:round'
//                        (that round) and 'aug:double:win' (1: ×mul, 0: nothing) — the prep side's onIncome applies it.
//                        No bet in the Final Assault / Hidden Core rounds: no settlement and no round after them to pay
//   回光返照 (aug_last_light)  the settlement (afterCharges, before the eliminations): a holder below `below` LP — 0 or less
//                        included — is back at `to`, once a match (counter 'aug:lastlight:round' = the round it happened:
//                        server/match/audit.js leaves that player's settle rule out for it), and its battles of the next
//                        `rounds` rounds take the bonus (EffectRef data { from, to }: the battle side); m.teamFx 'lastLight'

import { ERR } from '../../../shared/constants.js';
import { msg } from '../../../shared/i18n.js';
import { DEFS } from '../../../shared/augments5/g3.js';
import { fail } from '../match/common.js';

const DOUBLE = 'aug_double_or_nothing';
const LAST_LIGHT = 'aug_last_light';
const params = (id) => DEFS.find((d) => d.id === id)?.params ?? {};
const int = (v, d) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : d);

/** 双倍或归零: this round's bets settle into the next round's income. */
function settleBets(m, perfect) {
  for (const ps of m.alivePlayers()) {
    if (!ps.augments.includes(DOUBLE) || ps.counters['aug:double:bet'] !== m.round) continue;
    const win = !!(perfect && perfect.get(ps.playerId));
    ps.counters['aug:double:bet'] = 0;
    ps.counters['aug:double:round'] = m.round + 1;
    ps.counters['aug:double:win'] = win ? 1 : 0;
    ps.dirty();
    m.tickerText(win
      ? msg('双倍或归零：{name} 完美作战，下回合收入翻倍', { name: ps.name })
      : msg('双倍或归零：{name} 赌输了，下回合收入为 0', { name: ps.name }), 1);
  }
}

/** 回光返照: a holder below `below` LP is back at `to` (once a match), before the eliminations. */
function lastLight(m) {
  const p = params(LAST_LIGHT);
  const below = int(p.below, 5), to = int(p.to, 8), rounds = Math.max(1, int(p.rounds, 2));
  for (const ps of m.alivePlayers()) {
    if (!ps.augments.includes(LAST_LIGHT) || ps.counters['aug:lastlight:round'] > 0 || !(ps.lp < below)) continue;
    ps.counters['aug:lastlight:round'] = m.round;
    ps.lp = Math.max(ps.lp, to);
    const ref = ps.effects.find((e) => e && e.key === `augment:${LAST_LIGHT}`);
    if (ref) ref.data = { from: m.round + 1, to: m.round + rounds };
    ps.dirty();
    m.tickerText(msg('{name} 回光返照：目标生命回到 {n} 点', { name: ps.name, n: ps.lp }), 1);
    // the team panel's moment (analysis §3.6: the LP tower flashes gold)
    m.teamFx('lastLight', { from: ps.playerId, to: ps.playerId, amount: ps.lp, augment: LAST_LIGHT });
  }
}

export const MATCH = Object.freeze({
  afterCharges(m, perfect) {
    settleBets(m, perfect);
    lastLight(m);
  },
  action: Object.freeze({
    // 双倍或归零: the bet of this round (the settlement decides it)
    [DOUBLE](m, ps) {
      if (m.round === m.gd.bossRound || m.round === m.gd.hiddenRound) return fail(ERR.BAD_TARGET, 'no income after this round');
      ps.counters['aug:double:bet'] = m.round;
      m.tickerText(msg('{name} 押注了双倍或归零', { name: ps.name }), 1);
      return null;
    },
  }),
});
