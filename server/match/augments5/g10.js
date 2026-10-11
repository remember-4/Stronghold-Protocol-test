// server/match/augments5/g10.js — A6000 fork, 海克斯第六版 batch g10: the match-side hooks of its augments (the prep /
// battle effects: server/sim/content/augments5/g10.js). The hooks: see the list in server/match/augments5/g4.js.
//
// This batch:
//   风水宝地 (aug_feng_shui)  every round start (MATCH.roundStart: after the players' round start, the boss pairing known)
//                            and the pick (onPick: the round it is taken in), `n` distinct tiles drawn (m.rngMeta) from
//                            the tiles the holder may deploy on this round (PlayerState.deployMap: its own board, or its
//                            half of the boss field — board coordinates either way). The EffectRef's data { round, tiles }:
//                            the battles of that round read it, and PlayerState.effectsView hands this round's tiles to
//                            the client (`boardTiles`), which frames them in gold on the prep board.

import { augmentDef } from '../../../shared/augments.js';
import { parseKey } from '../board.js';

const FENG_SHUI = 'aug_feng_shui';
const KEY = (id) => `augment:${id}`;

/** 风水宝地: this round's tiles of `ps` (none when it may deploy nowhere). */
function fengShui(m, ps) {
  const ref = ps.effects.find((e) => e && e.key === KEY(FENG_SHUI));
  if (!ref || typeof ps.deployMap !== 'function') return;
  const n = Math.max(0, Math.trunc(Number(augmentDef(FENG_SHUI)?.params.n) || 0));
  // reading order (top row first, left to right): the draw depends on the seed alone
  const pool = [...ps.deployMap().keys()].map(parseKey).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  const tiles = [];
  while (tiles.length < n && pool.length) tiles.push(pool.splice(Math.floor(m.rngMeta() * pool.length), 1)[0]);
  ref.data = { round: m.round, tiles };
  ps.dirty();
}

export const MATCH = Object.freeze({
  onPick(m, ps, id) {
    if (id === FENG_SHUI) fengShui(m, ps);
  },

  roundStart(m) {
    for (const ps of m.alivePlayers()) if (ps.augments.includes(FENG_SHUI)) fengShui(m, ps);
  },
});
