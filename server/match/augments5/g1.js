// server/match/augments5/g1.js — A6000 fork, 海克斯第五版 batch g1: the match-side hooks of its augments (the prep / battle
// effects: server/sim/content/augments5/g1.js). server/match/match/augments.js calls each hook present, in batch order:
//   lpCap(m, ps, cap) → cap           the most LP a round's leaks may cost ps (after 止损 and the enemy upgrades)
//   onPick(m, ps, id)                 ps just took augment id (after its EffectRef and onAugmentPick)
//   roundStart(m)                     the round start, after every player's onRoundStart and the older team 海克斯
//   charges(m, charges)               settlement, before the LP is charged: playerId → LP charge (rewrite in place)
//   afterCharges(m, perfect)          settlement, after the LP is charged, before the eliminations: playerId → perfect
//   action: { [augmentId]: (m, ps, def, target) → null | { error } }   a click in the prep (g.augAction, once a round;
//                                     `target`: a teammate's playerId when the client sent one, else null)
// m.teamFx(kind, data) broadcasts a team effect for the client's team panel (server/match/match/augments.js).
//
// This batch: 韬光养晦 (aug_low_profile) caps a round's LP loss at `cap` from round `from` to round `to` (with 止损 / the
// enemy upgrades the lower cap holds; the LP preview and the settlement read the same lpCapFor).

import { augmentDef } from '../../../shared/augments.js';

export const MATCH = Object.freeze({
  lpCap(m, ps, cap) {
    if (!ps || !Array.isArray(ps.augments) || !ps.augments.includes('aug_low_profile')) return cap;
    const p = augmentDef('aug_low_profile').params;
    const r = Number(m.round) || 0;
    if (r < Number(p.from) || r > Number(p.to)) return cap;
    return Math.min(cap, Math.max(1, Math.trunc(Number(p.cap) || 0)));
  },
});
