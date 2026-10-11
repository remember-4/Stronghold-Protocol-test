// shared/egirState.js — A6000 fork: the round-local 阿戈尔 state one operator carries from its own combat into the 联防
// of the same round (the user's rule of 2026-10-08: the 联防 continues that combat — no second devour, the devour gains
// and the spent 5-tier revives stay). Produced by the sim (BattleResult.unitsEnd[].egir, server/sim/battle/lifecycle.js),
// checked by the protocol (shared/protocol.js isUnitEnd) and the server (server/match/fields.js), carried by
// server/match/unite.js into carryState.egir and read by server/sim/content/bonds/core.js installEgir.
// Never carry arbitrary buffs or hooks: four numbers only.
//   atkFinal  the devour's 最终加算 ATK (the base ATK of everything this member marked)
//   blockCnt  the devour's block count
//   knocked   this member's first knock-out of the round has happened (no 5-tier revive left for it)
//   revives   the 5-tier revives its player spent this round (shared by the player's members)

export function isEgirState(s) {
  return !!s && typeof s === 'object' && !Array.isArray(s)
    && Number.isFinite(s.atkFinal) && s.atkFinal >= 0 && s.atkFinal <= 1e7
    && Number.isFinite(s.blockCnt) && s.blockCnt >= 0 && s.blockCnt <= 4096
    && typeof s.knocked === 'boolean'
    && Number.isInteger(s.revives) && s.revives >= 0 && s.revives <= 16;
}

/** A clean copy of a valid state, else null. */
export function copyEgirState(s) {
  return isEgirState(s) ? { atkFinal: s.atkFinal, blockCnt: s.blockCnt, knocked: s.knocked, revives: s.revives } : null;
}
