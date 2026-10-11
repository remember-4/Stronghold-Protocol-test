// server/match/augments5/g2.js — A6000 fork, 海克斯第五版 batch g2: the match-side hooks of its augments (the prep / battle
// effects: server/sim/content/augments5/g2.js). server/match/match/augments.js calls each hook present, in batch order:
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
//   争分夺秒 (aug_race_clock)  overtimeDelay(m, hidden): the Final Assault's overtime drain starts `sec` REAL seconds later
//                             while any alive player holds it — the team's one drain, so holders do not add up; read by
//                             match/bossRounds.js (overtimeAt, _applyOvertime) and bot.js simulateBossField
//   背水决战 (aug_last_battle) roundStart of the boss round: the holder's EffectRef data { round, after, scale, drain } —
//                             the REAL second the drain starts (首领·倒计时 sooner, 争分夺秒 later), the game seconds of a
//                             real one, the LP a real second — for the battle's estimate of the team LP lost
//   开门红 (aug_good_start)    onPick marks the next round; that round's start fills every chess slot of the shop — but one
//                             kept frozen over the round start (the player's own pick) — with a member of the top core bond
//                             (同乡会's rule: the most distinct board members), ≤ the dispatch level, copy-weighted

import { augmentDef } from '../../../shared/augments.js';
import { msg, dn } from '../../../shared/i18n.js';
import { makeCtx } from '../effectsMeta.js';
import { topCoreOnBoard, isBondMember } from '../../sim/content/augments5/g2.js';

const KEY = (id) => `augment:${id}`;
const holds = (ps, id) => !!ps && Array.isArray(ps.augments) && ps.augments.includes(id);
const GOOD_START_AT = 'aug5:goodstart:at';

/**
 * 海克斯·争分夺秒: the REAL seconds the Final Assault's overtime drain starts later (0 in the Hidden Core, or when no alive
 * player holds it).
 */
export function overtimeDelay(m, hidden = false) {
  if (hidden || !m || typeof m.alivePlayers !== 'function') return 0;
  if (!m.alivePlayers().some((ps) => holds(ps, 'aug_race_clock'))) return 0;
  return Math.max(0, Number(augmentDef('aug_race_clock')?.params.sec) || 0);
}

/** The REAL second of the Final Assault the overtime drain starts at (bossRounds.js overtimeAt's number). */
function overtimeStart(m) {
  const lead = typeof m.enemyOvertimeLead === 'function' ? Number(m.enemyOvertimeLead()) || 0 : 0;
  return Math.max(0, m.gd.bossOvertimeAfterReal - lead + overtimeDelay(m));
}

/** 开门红: the shop's chess slots (but kept-frozen and sold ones) → members of the top core bond. */
function goodStart(m, ps) {
  const ctx = makeCtx(m, ps, { kind: 'augment', key: KEY('aug_good_start') }, 'onRoundStart');
  const bond = topCoreOnBoard(ctx);
  if (!bond) return;
  const slots = ps.shop.slots;
  const n = Math.min(slots.length, ps.shop.layout ? ps.shop.layout.chess : slots.length);
  let changed = 0;
  for (let i = 0; i < n; i++) {
    const s = slots[i];
    if (s && (s.kind !== 'chess' || s.sold || s.kept)) continue;
    const id = ctx.rollChess({ maxTier: Math.max(1, ctx.shopLevel()), filter: (x) => isBondMember(ctx, x, bond) });
    if (id && ctx.setShopSlot(i, { kind: 'chess', id })) changed++;
  }
  if (changed) ctx.toast(msg('开门红：商店的干员格换成了{bond}干员', { bond: dn(m.gd.bond(bond)?.name || bond) }));
}

export const MATCH = Object.freeze({
  onPick(m, ps, id) {
    if (id === 'aug_good_start') ps.counters[GOOD_START_AT] = m.round + 1;
  },

  roundStart(m) {
    for (const ps of m.alivePlayers()) {
      if (holds(ps, 'aug_good_start') && ps.counters[GOOD_START_AT] === m.round) {
        ps.counters[GOOD_START_AT] = 0;
        goodStart(m, ps);
      }
      if (holds(ps, 'aug_last_battle') && m.round === m.gd.bossRound) {
        const ref = ps.effects.find((e) => e && e.key === KEY('aug_last_battle'));
        if (ref) ref.data = { round: m.round, after: overtimeStart(m), scale: m.gd.combatTimeScale, drain: m.gd.bossOvertimeDrainReal };
      }
    }
  },
});
