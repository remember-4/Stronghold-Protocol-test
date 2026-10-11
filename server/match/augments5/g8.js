// server/match/augments5/g8.js — A6000 fork, 海克斯第六版 batch g8: the match-side hooks of its augments (the prep / battle
// effects: server/sim/content/augments5/g8.js). The hooks: see the list in server/match/augments5/g4.js.
//
// This batch:
//   未来规划 (aug_future)  onPick: the LP it costs at once — `lp`, never below 1 (stats.lpLost counts it, as every other
//                         LP cost) — and the round of the payout (EffectRef data.at; the payout itself is the prep side's
//                         onRoundStart). Outside the settlement: server/match/audit.js's settle rule never sees it
//   负重前行 (aug_burden)  onPick: PlayerState.handCap = `slots` — the rightmost hand slots stay open, a piece already in a
//                         closed one stays (player/pieces.js handSlotOpen) — for the pick's prep and the next `rounds` − 1
//                         (data.at = the round it ends); roundStart of that round: every slot open again, `items` random
//                         items of `tier`. A cap left without its running holding (炼金术 / 献祭之刃 took the 海克斯) is
//                         lifted at the next round start.

import { augmentDef } from '../../../shared/augments.js';
import { msg } from '../../../shared/i18n.js';
import { makeCtx } from '../effectsMeta.js';

const FUTURE = 'aug_future';
const BURDEN = 'aug_burden';
const KEY = (id) => `augment:${id}`;
const P = (id) => augmentDef(id)?.params ?? {};
const int = (v, d = 0) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : d);
const refOf = (ps, id) => ps.effects.find((e) => e && e.key === KEY(id)) ?? null;
const holds = (ps, id) => !!ps && Array.isArray(ps.augments) && ps.augments.includes(id);

/** 未来规划 at the pick: the LP (never below 1), the payout's round, the rounds left on the icon. */
function futurePick(m, ps) {
  const p = P(FUTURE);
  const n = Math.min(Math.max(0, int(p.lp, 3)), Math.max(0, ps.lp - 1));
  if (n > 0) {
    ps.lp -= n;
    ps.stats.lpLost += n;
  }
  const rounds = Math.max(0, int(p.rounds, 3));
  const ref = refOf(ps, FUTURE);
  if (ref) {
    ref.data = { ...(ref.data && typeof ref.data === 'object' ? ref.data : {}), at: m.round + rounds };
    ref.counter = rounds;
  }
  ps.dirty();
  if (n > 0) m.toast(ps, 'warn', msg('未来规划：目标生命 −{n}', { n }));
}

/** 负重前行 at the pick: only the rightmost `slots` hand slots take pieces until the round `rounds` later starts. */
function burdenPick(m, ps) {
  const p = P(BURDEN);
  const rounds = Math.max(1, int(p.rounds, 3));
  ps.handCap = Math.max(0, Math.min(ps.hand.length, int(p.slots, 5)));
  const ref = refOf(ps, BURDEN);
  if (ref) {
    ref.data = { ...(ref.data && typeof ref.data === 'object' ? ref.data : {}), at: m.round + rounds };
    ref.counter = rounds;
  }
  ps.recompute();
  ps.dirty();
}

/** 负重前行 at a round start: the rounds left on the icon; its last one over — every slot open, the items. */
function burdenRound(m, ps) {
  const ref = holds(ps, BURDEN) ? refOf(ps, BURDEN) : null;
  const d = ref && ref.data && typeof ref.data === 'object' ? ref.data : null;
  const running = !!d && Number.isFinite(d.at) && !Number.isFinite(d.done);
  if (!running) {
    if (ps.handCap != null) { ps.handCap = null; ps.recompute(); ps.dirty(); }
    return;
  }
  if (m.round < d.at) {
    ref.counter = d.at - m.round;
    ps.dirty();
    return;
  }
  ps.handCap = null;
  ref.data = { ...d, done: m.round };
  ref.counter = 0;
  ps.recompute();
  const p = P(BURDEN);
  const ctx = makeCtx(m, ps, { kind: 'augment', key: KEY(BURDEN) }, 'onRoundStart');
  let got = 0;
  for (let i = 0; i < Math.max(0, int(p.items, 2)); i++) {
    const itemId = ctx.rollItem({ tier: Math.max(1, Math.min(6, int(p.tier, 5))) });
    if (itemId && ctx.grantItem(itemId, { source: KEY(BURDEN) })) got++;
  }
  ctx.toast(msg('负重前行：整备区的格子都能用了，获得 {n} 件装备', { n: got }));
  ps.recompute();
  ps.dirty();
}

export const MATCH = Object.freeze({
  onPick(m, ps, id) {
    if (id === FUTURE) futurePick(m, ps);
    else if (id === BURDEN) burdenPick(m, ps);
  },

  roundStart(m) {
    for (const ps of m.alivePlayers()) burdenRound(m, ps);
  },
});
