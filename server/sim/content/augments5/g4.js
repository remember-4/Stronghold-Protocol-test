// server/sim/content/augments5/g4.js — A6000 fork, 海克斯第五版 (同盟节目效果（P1–P20）): the effects of
// shared/augments5/g4.js. server/sim/content/augments.js calls `install` for every augment a battle player holds (true =
// handled here) and merges `META` (augment id → prep-side handler factory, as its own META).
//
// Battle side (install):
//   aug_cover_me     a 联防: the player's operators deal ×pct % (augDealtMul)
//   aug_kill_steal   the Final Assault: every `sec` s the player of the field with more damage to the leader so far (the
//                    battle's own per-player tally) has its operators deal ×pct % until the next count — the holder's
//                    partner included when it leads; a tie keeps the current leader, nobody leads before any damage
//   aug_mole         the Final Assault and the Hidden Core: the holder's operators deal ×dealt %, every other player's
//                    operators of the field take +taken %
//   aug_cheer        marked (server/match/augments5/g4.js puts a hidden EffectRef `aug5mark:<id>:<source>` with
//   aug_baton        data.round on the player cheered / holding the baton): every battle of that round, the player's
//                    operators deal ×pct % (one factor per mark — two cheerers, two factors)
// The others of the batch have no battle part (their EffectRefs never reach a battle: side 'meta').
//
// Prep side (META): the team parts live on the match (server/match/augments5/g4.js — its own hooks: the pick, the round
// start, the settlement, the clicks). A prep handler needs the match only where a hook of the dispatcher is the moment:
// a teammate's purchase (截胡: every teammate carries a hidden watcher EffectRef of aug_snipe), a 联防 / boss field being
// built (the team panel's markers: 抢人头, 内鬼, 我来兜底, and 战术同步 / 并肩作战 of the older list) and the older
// 资源互助's payout. Those handlers forward to `SERVER.call(ctx, id, hook, ev)`, set by server/match/augments5/g4.js on
// the server; in a browser (which runs battles only) it stays null.

import { num, isOp, playerOps, passiveBuff, battleStore } from '../support/index.js';

const KEY = (id) => `augment:${id}`;
const pct = (v) => num(v) / 100;
/** Id prefix of the hidden marks the match puts on a player for one round (server/match/augments5/g4.js mark). */
export const MARK = 'aug5mark:';

/**
 * The server's side of this batch's prep handlers: `call(ctx, augmentId, hook, ev)` (server/match/augments5/g4.js; null
 * where no match runs — a browser, a sim test).
 */
export const SERVER = { call: null };
const forward = (id, ...hooks) => () => Object.fromEntries(hooks.map((h) => [h, (ctx, ev) => { if (SERVER.call) SERVER.call(ctx, id, h, ev); }]));

/** The battle ids of this batch (install answers true for every one of them). */
const BATTLE = new Set(['aug_cover_me', 'aug_kill_steal', 'aug_mole', 'aug_cheer', 'aug_baton']);

/** The rounds' marks of `id` a battle player carries for this battle's round (server/match/augments5/g4.js mark). */
function marksOf(battle, ps, id) {
  return (ps.playerEffects || []).filter((r) => r && r.key === KEY(id) && typeof r.id === 'string' && r.id.startsWith(`${MARK}${id}:`)
    && r.data && r.data.round === battle.round).length;
}

/**
 * Battle side: install augment `id` (definition `def`) of player `ps` (the battle's player input) on `battle`.
 * @returns {boolean} whether this batch handles the id
 */
export function install(battle, ps, id, def) {
  if (!BATTLE.has(id)) return false;
  const pid = ps.playerId;
  const p = def.params || {};
  switch (id) {
    case 'aug_cover_me':
      if (battle.kind === 'unite') for (const u of playerOps(battle, pid)) passiveBuff(battle, u, KEY(id), { augDealtMul: pct(p.pct) }, { visible: true });
      break;
    case 'aug_mole': {
      if (battle.kind !== 'boss' && battle.kind !== 'hidden') break;
      for (const u of playerOps(battle, pid)) passiveBuff(battle, u, KEY(id), { augDealtMul: pct(p.dealt) }, { visible: true });
      // the teammates of the field (one buff per mole: two moles, two factors)
      for (const u of battle.allyUnits) if (isOp(u) && u.ownerId !== pid) passiveBuff(battle, u, `${KEY(id)}:${pid}`, { dmgTakenMul: 1 + pct(p.taken) });
      break;
    }
    case 'aug_kill_steal': installKillSteal(battle, p); break;
    // 加油 / 接力棒: the player's own EffectRef and a mark share the key — the marks are counted once per battle player
    default: {
      const once = battleStore(battle, `aug5g4:${id}:${pid}`, () => ({ done: false }));
      if (once.done) break;
      once.done = true;
      const n = marksOf(battle, ps, id);
      if (n > 0) for (const u of playerOps(battle, pid)) passiveBuff(battle, u, `${KEY(id)}:mark`, { augDealtMul: Math.pow(pct(p.pct), n) }, { visible: true });
      break;
    }
  }
  return true;
}

/**
 * 抢人头: one count per field (two holders on it — still one leader). The leader's operators carry the buff until a count
 * makes another player the leader.
 */
function installKillSteal(battle, p) {
  if (battle.kind !== 'boss') return;
  const st = battleStore(battle, 'aug5g4:kill_steal', () => ({ on: false, lead: null }));
  if (st.on) return;
  st.on = true;
  const ids = (battle.players || []).map((x) => x.playerId);
  if (ids.length < 2 || typeof battle._pp !== 'function') return;
  const key = KEY('aug_kill_steal');
  const mods = { augDealtMul: pct(p.pct) };
  battle.every(Math.max(1, num(p.sec, 10)), () => {
    let best = st.lead;
    let top = best != null ? num(battle._pp(best)?.bossDamage) : 0;
    for (const pid of ids) {
      const d = num(battle._pp(pid)?.bossDamage);
      if (d > top + 1e-9) { best = pid; top = d; }
    }
    if (best == null || best === st.lead) return;
    st.lead = best;
    for (const u of battle.allyUnits) {
      if (!isOp(u)) continue;
      if (u.ownerId === best) passiveBuff(battle, u, key, mods, { visible: true });
      else battle.removeBuff(u, key);
    }
  });
}

/**
 * Prep side: augment id → (params) => handler object. Forwarders to the match (see the header), and 资源互助 (the older
 * list's aug_mutual) told again here — the same payout as server/sim/content/augments.js GENERIC_META.aug_mutual (this
 * batch's META is merged over it) — so the team panel hears of it.
 */
export const META = Object.freeze({
  aug_snipe: forward('aug_snipe', 'onBuy'),
  aug_kill_steal: forward('aug_kill_steal', 'onBattleStart'),
  aug_mole: forward('aug_mole', 'onBattleStart'),
  aug_cover_me: forward('aug_cover_me', 'onBattleStart'),
  aug_sync: forward('aug_sync', 'onBattleStart'),
  aug_together: forward('aug_together', 'onBattleStart'),
  aug_mutual: (p) => ({
    onRoundStart(ctx) {
      const mates = ctx.teammates();
      if (!mates.length) return;
      const avg = mates.reduce((s, t) => s + t.funds(), 0) / mates.length;
      if (!(ctx.funds() < avg)) return;
      const n = num(p.funds, 1);
      ctx.addFunds(n, 'augment:aug_mutual');
      if (SERVER.call) SERVER.call(ctx, 'aug_mutual', 'paid', { amount: n });
    },
  }),
});
