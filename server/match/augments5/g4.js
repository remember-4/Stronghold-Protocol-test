// server/match/augments5/g4.js — A6000 fork, 海克斯第五版 batch g4: the match-side hooks of its augments (the prep / battle
// effects: server/sim/content/augments5/g4.js). server/match/match/augments.js calls each hook present, in batch order:
//   lpCap(m, ps, cap) → cap           the most LP a round's leaks may cost ps (after 止损 and the enemy upgrades)
//   onPick(m, ps, id)                 ps just took augment id (after its EffectRef and onAugmentPick)
//   roundStart(m)                     the round start, after every player's onRoundStart and the older team 海克斯
//   charges(m, charges)               settlement, before the LP is charged: playerId → LP charge (rewrite in place)
//   afterCharges(m, perfect)          settlement, after the LP is charged, before the eliminations: playerId → perfect
//   action: { [augmentId]: (m, ps, def, target) → null | { error } }   a click in the prep (g.augAction, once a round;
//                                     `target`: a teammate's playerId when the client sent one, else null)
//   onTake(m, victim, taker)          海克斯第六版: a 损人利己 海克斯 of taker just took something from victim (m.teamGrudge)
//   grudgeImmune(m, ps) → bool        海克斯第六版: true → m.teamPickVictim gives ps no grudge priority (〔坏人〕 3 件)
// m.teamFx(kind, data) broadcasts a team effect for the client's team panel (server/match/match/augments.js).
//
// The batch: 同盟 (table P of _ops/stronghold-a6000/analysis/海克斯第五版候选-联动与节目效果.md), every one co-op only.
//   on the pick     灵魂交换 (the hands swapped with a random teammate), 偷命 (the LPs swapped with the teammate with the
//                   most), 夺舍 (that teammate's best normal board operator taken, one of its tier in his hand instead),
//                   接力棒 (the baton starts with the holder), 截胡 (every teammate gets a hidden watcher EffectRef: its
//                   purchases reach the prep handler, server/sim/content/augments5/g4.js forwards them here)
//   round start     the dues of the last settlement (打赌's stake, 碰瓷's bill — taken from this round's funds, never below
//                   0), the batons' marks, 收保护费, 顺手牵羊, 吸星大法, 红包, 打赌's pairing (not on a boss round: no
//                   settlement), 抢功 of the Final Assault (at the Hidden Core's round start: its bounty coins are funds now)
//   settlement      连坐 (the charges), then 团队精神, 加油, 接力棒, 打赌, 碰瓷, and the 联防's 我来兜底 / 抢功 / 守望相助
//                   (augmentUniteSettle keeps the 联防 result as `m.augUnite`)
//   clicks          加油 (a hidden mark on the teammate: the battles of the round read it), 卖队友
//   battle start    (forwarded prep handlers) 抢人头's leader watch on the boss pool, 内鬼 / 我来兜底 / 战术同步 / 并肩作战
//                   markers on the team panel
// The floor of the 损人利己 ones (the analysis: 损人利己的底线): no teammate's LP below 6, no funds below 0, a cap on each, no
// eliminated player as a target; whatever moves is a transfer (pool copies with their pieces). 记仇: who loses something to
// one holds a grudge against its holder (m.teamGrudge; m.private grudges) and the random target of a holder's 损人利己 海克斯
// is the one it holds the most grudges against (m.teamPickVictim). Every moment is a teamFx — a ticker line too where the
// analysis lists a 播报 — and counts for its 节目称号 (m.teamShow, results.js SHOW_TITLES). Random draws: m.rngMeta.
//
// The team effects (m.teamFx kind: from → to, amount …; `augment` is always set; what moves goes from → to):
//   swap        holder → the teammate it swapped hands with (on the pick)
//   lifeswap    the teammate with the most LP → holder; amount = LP moved (on the pick)
//   possess     victim → holder; chess = the operator's id (on the pick)
//   baton       previous holder (null: the pick, or a holder gone out) → new holder; amount = the passer's funds (a pass
//               after a perfect round; from null and to the holder when nobody is left to pass to)
//   snipe       buyer → holder; chess = the bought id, amount = the price refunded
//   protection  payer → holder, amount (one per payer)
//   pickpocket  victim → holder; item = the item id, or amount = funds
//   absorb      victim → holder; amount = layers
//   redpacket   holder → recipient, amount (one per recipient)
//   bet         holder → opponent, amount null (the round's pairing); loser → winner, amount = stake (the settlement;
//               paid at the next round start); holder → opponent, amount 0 (a draw)
//   collective  the teammate charged the most → holder; amount = LP the holder pays too (+funds next round)
//   teamPerfect holder, to null, also = every alive player; amount = funds each (+layers)
//   cheer       cheerer → cheered; amount null (the click), amount = funds each (his perfect round)
//   extort      the perfect teammate → holder; amount = the bill (paid at the next round start)
//   cover       to = holder; also = the leakers; amount null (the 联防 starts) / funds (the settlement)
//   credit      teammate → holder; amount = bounty funds taken
//   sell        the sold teammate → seller; amount = the seller's funds (the teammate −lp LP)
//   lead        the field's new leader → the other player of the field (the Final Assault, a change of lead)
//   mole        holder → the field partner (null alone): the Final Assault / Hidden Core starts
//   older ones whose moment is a prep handler's: watch (to = holder, amount = funds), sync (to = holder, the 联防 starts),
//   together (holder → field partner, the boss field starts), mutual (to = holder, amount = funds)

import { PHASE, ERR, layerGainRoom } from '../../../shared/constants.js';
import { augmentDef } from '../../../shared/augments.js';
import { msg, dn } from '../../../shared/i18n.js';
import { freeSlot } from '../board.js';
import { pairPlayers } from '../finalAssault.js';
import { fail } from '../match/common.js';
import { NO_STACK } from '../../sim/content/augments.js';
import { SERVER, MARK } from '../../sim/content/augments5/g4.js';

const KEY = (id) => `augment:${id}`;
const P = (id) => augmentDef(id)?.params ?? {};
const int = (v, d = 0) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : d);
const pidOf = (x) => (x == null ? null : typeof x === 'string' ? x : x.playerId ?? null);
const holds = (ps, id) => !!ps && ps.alive && ps.augments.includes(id);
const matesOf = (m, ps) => m.alivePlayers().filter((p) => p !== ps);
/** Still in at the settlement's end (a player at ≤ 0 LP goes out right after it). */
const standing = (p) => !!p && p.alive && p.lp > 0;
const isBossRound = (m) => m.round === m.gd.bossRound || m.round === m.gd.hiddenRound;
const credit = (ps, n) => { ps.pendingFunds += n; ps.stats.fundsGained += n; ps.dirty(); };

/** The match a prep ctx belongs to — every ctx carries its match's meta rng (effectsMeta makeCtx `rng`). */
const LINKS = new WeakMap();
const link = (m) => { if (m && typeof m.rngMeta === 'function') LINKS.set(m.rngMeta, m); };

/** This batch's match state. */
const state = (m) => (m.aug5Team ??= { dues: [], bets: [], batons: [], lp0: null, lp0Round: null, lead: null });

/** One of `list` at random (no draw for a single one). */
const pickOne = (m, list) => (list.length <= 1 ? list[0] ?? null : list[Math.floor(m.rngMeta() * list.length)]);

/** The augment of each team effect kind of this module (m.teamFx `augment`: the panel's icon). */
const FX_AUGMENT = Object.freeze({
  swap: 'aug_soul_swap', teamPerfect: 'aug_team_spirit', bet: 'aug_bet', cover: 'aug_cover_me', lead: 'aug_kill_steal',
  collective: 'aug_collective', redpacket: 'aug_red_packet', cheer: 'aug_cheer', baton: 'aug_baton', sell: 'aug_sell_out',
  absorb: 'aug_absorb', pickpocket: 'aug_pickpocket', snipe: 'aug_snipe', extort: 'aug_extort', protection: 'aug_protection',
  lifeswap: 'aug_life_swap', possess: 'aug_possess', mole: 'aug_mole', credit: 'aug_steal_credit',
  watch: 'aug_watch', sync: 'aug_sync', together: 'aug_together', mutual: 'aug_mutual',
});

/** m.teamFx with player states or ids. */
function fx(m, kind, from, to, extra = {}) {
  const { also, ...rest } = extra;
  m.teamFx(kind, {
    from: pidOf(from), to: pidOf(to), augment: FX_AUGMENT[kind] ?? null,
    ...(Array.isArray(also) ? { also: also.map(pidOf).filter(Boolean) } : {}), ...rest,
  });
}

/** The holder's own EffectRef shows what is left of a capped 海克斯 (the effects column's number). */
function showLeft(ps, id, left) {
  const ref = ps.effects.find((e) => e && e.key === KEY(id) && !e.hidden);
  if (ref) { ref.counter = Math.max(0, left); ps.dirty(); }
}

/** Fires every `every` rounds after the pick (the pick's round set at onPick), as 打劫. */
function everyDue(m, ps, id, every) {
  const from = ps.counters[`aug5:${id}:from`];
  return Number.isFinite(from) && m.round > from && (m.round - from) % Math.max(1, every) === 0;
}

/**
 * A mark of `id` from `source` on `ps` for `round`: a hidden EffectRef with the augment's key, so the player's battles of
 * that round install it (server/sim/content/augments5/g4.js counts the marks). Never shown, never a pick.
 */
function mark(ps, id, source, round) {
  const mid = `${MARK}${id}:${source}`;
  let ref = ps.effects.find((e) => e && e.id === mid);
  if (!ref) {
    const def = augmentDef(id);
    ref = { id: mid, key: KEY(id), iconKind: 'augment', iconId: null, name: def.name, desc: '', params: { ...def.params, tier: def.tier }, battle: true, hidden: true, data: null };
    ps.effects.push(ref);
  }
  ref.data = { round };
  ps.dirty();
}
function unmark(ps, id, source) {
  const i = ps.effects.findIndex((e) => e && e.id === `${MARK}${id}:${source}`);
  if (i >= 0) { ps.effects.splice(i, 1); ps.dirty(); }
}

/** The next alive player after `fromPid` in seat order (cyclic), `ok` holding — never `fromPid` itself. */
function nextAfter(m, fromPid, ok = (p) => p.alive) {
  const order = m.order;
  const i = order.findIndex((p) => p.playerId === fromPid);
  for (let k = 1; k <= order.length; k++) {
    const p = order[(i + k + order.length) % order.length];
    if (p && p.playerId !== fromPid && ok(p)) return p;
  }
  return null;
}

/** A boss field's other player of `ps` (the pairing planned at the boss round's start), or null. */
function partnerOf(m, ps) {
  const g = typeof m.bossGroupOf === 'function' ? m.bossGroupOf(ps) : null;
  const other = g ? g.players.find((id) => id !== ps.playerId) : null;
  return other ? m.players.get(other) ?? null : null;
}

/** Counted leaks of the player's own battle this round (the settlement's rule). */
const leaksOf = (m, ps) => ((m.lastResults.get(ps.playerId) || {}).leaked || []).filter((l) => l && l.counted !== false).length;

/** The active bond with the most layers a 海克斯 may move layers of (NO_STACK left out; ties: the data's order), or null. */
function topBond(m, ps) {
  let best = null, top = -1;
  for (const b of m.gd.bondIds) {
    const st = ps.bonds[b];
    if (!st || !st.active || NO_STACK.has(b)) continue;
    const l = ps.layers[b] || 0;
    if (l > top) { top = l; best = b; }
  }
  return best;
}

// ---------------------------------------------------------------------------------------------------------------------
// pieces that change hands

/** A piece that may change hands: a chess (not a 自选 slot's — that is its owner's own stock) or an item; summons stay. */
function movable(m, p) {
  if (!p) return false;
  if (p.kind === 'item') return true;
  if (p.kind !== 'chess') return false;
  const rec = m.gd.chess(p.id);
  return !!rec && !rec.isDiy;
}

/** Every merge the owned copies allow now (3 normal copies → the elite, identical normal items), then the views. */
function settleMerges(ps) {
  const gd = ps.gd;
  for (let guard = 0; guard < 16; guard++) {
    const copies = new Map();
    for (const l of ps._chessLocations()) {
      if (gd.isGolden(l.piece.id)) continue;
      const b = gd.baseIdOf(l.piece.id);
      copies.set(b, (copies.get(b) || 0) + 1);
    }
    const ready = [...copies].find(([b, n]) => { const need = gd.mergeCount(b); return need > 1 && !!gd.goldenIdOf(b) && n >= need; });
    if (!ready || !ps._mergeChess(ready[0], null)) break;
  }
  ps.checkItemMerges();
  ps.recompute();
  ps.dirty();
}

/** Stow a piece that changed hands; with no room at all it is gone (its copies back to the pool) — logged. */
function stowOrLose(m, ps, piece) {
  if (ps.stow(piece, { allowTemp: true })) return true;
  if (piece.kind === 'chess') ps.returnCopies(piece);
  m.log.warn?.(`[match ${m.roomCode}] ${ps.playerId}: ${piece.kind} ${piece.id} lost by a team 海克斯 (no space)`);
  return false;
}

/** A chess piece (copies and all) joins `ps`: a merge it completes, else the hand / temp; null when it found no room. */
function giveChess(m, ps, piece) {
  const gd = ps.gd;
  if (!gd.isGolden(piece.id) && ps.completesChessMerge(piece.id)) {
    const elite = ps._mergeChess(gd.baseIdOf(piece.id), piece);
    ps.recompute();
    return elite;
  }
  const ok = stowOrLose(m, ps, piece);
  if (!ok) m.toast(ps, 'warn', '整备区已满，获得的干员已返还');
  ps.recompute();
  return ok ? piece : null;
}

/** 灵魂交换: the hands' operators and items swapped with a random teammate (summon stacks and 自选 pieces stay). */
function soulSwap(m, ps) {
  const mate = pickOne(m, matesOf(m, ps));
  if (!mate) return;
  const take = (p) => {
    const out = [];
    p.hand.forEach((x, i) => { if (movable(m, x)) { out.push(x); p.hand[i] = null; } });
    return out;
  };
  const mine = take(ps);
  const theirs = take(mate);
  const back = [];
  for (const x of theirs) if (!ps.stow(x, { allowTemp: true })) back.push([mate, x]);
  for (const x of mine) if (!mate.stow(x, { allowTemp: true })) back.push([ps, x]);
  for (const [owner, x] of back) stowOrLose(m, owner, x);
  settleMerges(ps);
  settleMerges(mate);
  m.teamShow(ps, 'swap');
  fx(m, 'swap', ps, mate);
  m.tickerText(msg('{a} 和 {b} 交换了人生', { a: ps.name, b: mate.name }), 1);
  m.markPrivate(mate);
}

/** 偷命: the LPs swapped with the teammate with the most, when it has more — never taking it below `floor`. */
function lifeSwap(m, ps) {
  const floor = int(P('aug_life_swap').floor, 6);
  const top = matesOf(m, ps).sort((a, b) => b.lp - a.lp || a.seat - b.seat)[0];
  if (!top || !(top.lp > ps.lp)) return;
  const moved = Math.min(top.lp - ps.lp, Math.max(0, top.lp - floor));
  if (!(moved > 0)) return;
  top.lp -= moved;
  top.stats.lpLost += moved;
  ps.lp += moved;
  top.dirty();
  ps.dirty();
  m.teamShow(ps, 'lifeswap');
  // 记仇: every 损人利己 take counts (the analysis; the batch report left 偷命 / 夺舍 out — added at the merge)
  m.teamGrudge(top, ps);
  fx(m, 'lifeswap', top, ps, { amount: moved });
  m.tickerText(msg('{a} 和 {b} 换了命', { a: ps.name, b: top.name }), 1);
  m.markPublic();
}

/** A player's highest-tier normal board operator (ties: the highest ATK as fielded, then board order), or null. */
function topOperator(m, v) {
  let best = null;
  for (const p of v.board.values()) {
    if (!p || p.kind !== 'chess' || !movable(m, p)) continue;
    const rec = v.gd.chess(p.id);
    if (!rec || rec.isGolden) continue;
    const field = typeof v.fieldRecord === 'function' ? v.fieldRecord(rec) || rec : rec;
    const tier = v.gd.tierOf(p.id);
    const atk = Number(field && field.stats && field.stats.atk) || 0;
    if (!best || tier > best.tier || (tier === best.tier && atk > best.atk)) best = { piece: p, tier, atk };
  }
  return best;
}

/**
 * 夺舍: the teammate with the most LP (the next one when that one fields no normal operator) loses its best normal board
 * operator to the holder — its equipment back to his 整备区 — and gains a random operator of that tier from the pool
 * (a lower tier when none is left).
 */
function possess(m, ps) {
  for (const v of matesOf(m, ps).sort((a, b) => b.lp - a.lp || a.seat - b.seat)) {
    const best = topOperator(m, v);
    if (!best) continue;
    const { piece, tier } = best;
    const loc = v.find(piece.uid);
    if (!loc) continue;
    v._detach(loc);
    v.removeTokensOf(piece.uid);
    const items = piece.items || [];
    piece.items = [];
    for (const it of items) stowOrLose(m, v, it);
    v.checkItemMerges();
    v.recompute();
    const name = dn(m.gd.chess(piece.id)?.name || '');
    giveChess(m, ps, piece);
    let comp = null;
    for (let t = tier; t >= 1 && !comp; t--) {
      const id = m.pool.roll(m.rngMeta, { tier: t });
      if (id) comp = v.acquireChess(id, { source: 'augment:aug_possess' });
    }
    v.recompute();
    v.dirty();
    ps.dirty();
    m.teamShow(ps, 'possess');
    m.teamGrudge(v, ps);
    fx(m, 'possess', v, ps, { chess: piece.id });
    m.tickerText(msg('{a} 夺舍了 {b} 的{chess}', { a: ps.name, b: v.name, chess: name }), 1);
    if (comp) m.toast(v, 'info', msg('你的{chess}被 {name} 夺舍了，补给你一名{other}', { chess: name, name: ps.name, other: dn(m.gd.chess(comp.id)?.name || '') }));
    m.markPublic();
    return;
  }
}

/** 截胡 (a teammate's purchase, forwarded from its onBuy): the copy goes to the holder it completes an elite for. */
function snipe(m, buyer, ev) {
  if (!ev || ev.kind !== 'chess' || !ev.piece || m.phase !== PHASE.PREP) return;
  const loc = buyer.find(ev.piece.uid);
  if (!loc || loc.piece !== ev.piece || (loc.area !== 'hand' && loc.area !== 'temp')) return;
  const piece = loc.piece;
  const rec = m.gd.chess(piece.id);
  if (!rec || rec.isGolden || rec.isDiy) return;
  const every = Math.max(1, int(P('aug_snipe').every, 2));
  const ready = (s) => { const at = s.counters['aug5:snipe:at']; return !Number.isFinite(at) || m.round - at >= every; };
  const sniper = matesOf(m, buyer).find((s) => s.augments.includes('aug_snipe') && ready(s) && s.completesChessMerge(piece.id));
  if (!sniper) return;
  // the purchase undone for the buyer: its copy back to the pool, the price back (funds, spent, this round's spend)
  buyer._detach(loc);
  buyer.removeTokensOf(piece.uid);
  buyer.returnCopies(piece);
  const price = Math.max(0, int(ev.price));
  if (price > 0) {
    buyer.funds += price;
    buyer.stats.gold = Math.max(0, buyer.stats.gold - price);
    buyer.round.spent = Math.max(0, buyer.round.spent - price);
  }
  buyer.recompute();
  buyer.dirty();
  sniper.counters['aug5:snipe:at'] = m.round;
  const got = sniper.acquireChess(piece.id, { source: 'augment:aug_snipe' });
  sniper.dirty();
  const name = dn(rec.name || '');
  m.teamGrudge(buyer, sniper);
  m.teamShow(sniper, 'snipe');
  fx(m, 'snipe', buyer, sniper, { chess: piece.id, amount: price });
  m.tickerText(msg('{a} 截胡了 {b} 的{chess}', { a: sniper.name, b: buyer.name, chess: name }), 1);
  m.toast(buyer, 'warn', msg('{chess}被 {name} 截胡了，资金已退回', { chess: name, name: sniper.name }));
  if (got) m.toast(sniper, 'info', msg('截胡：获得{chess}', { chess: name }));
  m.markPublic();
}

/** Watchers of 截胡: every other player's purchases reach aug_snipe's prep handler (a hidden EffectRef, no battle). */
function watchBuys(m) {
  const def = augmentDef('aug_snipe');
  for (const ps of m.order) {
    if (ps.effects.some((e) => e && e.key === KEY('aug_snipe'))) continue;
    ps.effects.push({ id: 'aug5watch:aug_snipe', key: KEY('aug_snipe'), iconKind: 'augment', iconId: null, name: def.name, desc: '', params: {}, battle: false, hidden: true });
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// round start

/** The dues of the last settlement (打赌, 碰瓷): from this round's funds, as much as there is. */
function payDues(m, st) {
  const dues = st.dues;
  st.dues = [];
  for (const d of dues) {
    const from = m.players.get(d.from);
    const to = m.players.get(d.to);
    if (!from || !to || !from.alive || !to.alive) continue;
    const n = Math.min(d.amount, from.funds);
    if (!(n > 0)) continue;
    from.addFunds(-n, { reason: `augment:${d.augment}` });
    to.addFunds(n, { reason: `augment:${d.augment}` });
  }
}

/** 收保护费: every `every` rounds, each teammate richer than the holder pays `funds`. */
function protection(m, ps) {
  const p = P('aug_protection');
  if (!everyDue(m, ps, 'aug_protection', int(p.every, 3))) return;
  const mine = ps.funds;
  let got = 0;
  for (const t of matesOf(m, ps)) {
    if (!(t.funds > mine)) continue;
    const n = -t.addFunds(-int(p.funds, 1), { reason: 'augment:aug_protection' });
    if (!(n > 0)) continue;
    got += n;
    m.teamGrudge(t, ps);
    fx(m, 'protection', t, ps, { amount: n });
  }
  if (!(got > 0)) return;
  ps.addFunds(got, { reason: 'augment:aug_protection' });
  m.teamShow(ps, 'protection', got);
  m.tickerText(msg('{name} 收了一圈保护费：+{n} 资金', { name: ps.name, n: got }), 1);
}

/** 顺手牵羊: every `every` rounds, an item from a random teammate's 整备区, else `funds` of its funds (none: nothing). */
function pickpocket(m, ps) {
  const p = P('aug_pickpocket');
  if (!everyDue(m, ps, 'aug_pickpocket', int(p.every, 2))) return;
  const v = m.teamPickVictim(ps, matesOf(m, ps));
  if (!v) return;
  const items = v.hand.filter((x) => x && x.kind === 'item');
  if (items.length && (freeSlot(ps.hand) >= 0 || freeSlot(ps.temp) >= 0)) {
    const it = pickOne(m, items);
    v._detach(v.find(it.uid));
    v.recompute();
    v.dirty();
    ps.stow(it, { allowTemp: true });
    ps.checkItemMerges();
    ps.recompute();
    ps.dirty();
    m.teamGrudge(v, ps);
    m.teamShow(ps, 'pickpocket');
    fx(m, 'pickpocket', v, ps, { item: it.id });
    m.tickerText(msg('{a} 顺走了 {b} 的{item}', { a: ps.name, b: v.name, item: dn(m.gd.item(it.id)?.name || '') }), 1);
    return;
  }
  const n = -v.addFunds(-int(p.funds, 1), { reason: 'augment:aug_pickpocket' });
  if (!(n > 0)) return;
  ps.addFunds(n, { reason: 'augment:aug_pickpocket' });
  m.teamGrudge(v, ps);
  m.teamShow(ps, 'pickpocket');
  fx(m, 'pickpocket', v, ps, { amount: n });
  m.tickerText(msg('{a} 顺走了 {b} {n} 资金', { a: ps.name, b: v.name, n }), 1);
}

/** 吸星大法: `layer` layers from a random teammate's top bond (≥ min layers) to the holder's (≤ max a match). */
function absorb(m, ps) {
  const p = P('aug_absorb');
  const max = int(p.max, 8);
  const used = int(ps.counters['aug5:absorb:n']);
  if (used >= max) return;
  const mine = topBond(m, ps);
  const room = mine ? layerGainRoom(ps.layers[mine] || 0, int(p.layer, 5)) : 0;
  if (!(room > 0)) return;
  const min = int(p.min, 30);
  const v = m.teamPickVictim(ps, matesOf(m, ps).filter((t) => { const b = topBond(m, t); return b && (t.layers[b] || 0) >= min; }));
  if (!v) return;
  const vb = topBond(m, v);
  const n = Math.min(room, v.layers[vb] || 0);
  v.layers[vb] = (v.layers[vb] || 0) - n;
  v.recompute();
  v.dirty();
  ps.addLayers(mine, n, { requireActive: true, reason: 'augment:aug_absorb' });
  ps.counters['aug5:absorb:n'] = used + 1;
  showLeft(ps, 'aug_absorb', max - used - 1);
  m.teamGrudge(v, ps);
  m.teamShow(ps, 'absorb');
  fx(m, 'absorb', v, ps, { amount: n });
  m.tickerText(msg('{a} 吸走了 {b} {n} 层{bond}', { a: ps.name, b: v.name, n, bond: dn(m.gd.bond(vb)?.name || vb) }), 1);
  m.markPublic();
}

/** 红包: every `every` rounds the holder pays `cost`; the alive teammates share `pot` at random (each at least 1). */
function redPacket(m, ps) {
  const p = P('aug_red_packet');
  if (!everyDue(m, ps, 'aug_red_packet', int(p.every, 2))) return;
  const mates = matesOf(m, ps);
  const cost = int(p.cost, 2);
  if (!mates.length || ps.funds < cost) return;
  ps.addFunds(-cost, { reason: 'augment:aug_red_packet' });
  const pot = Math.max(mates.length, int(p.pot, 4));
  const share = new Map(mates.map((t) => [t, 1]));
  for (let left = pot - mates.length; left > 0; left--) { const t = pickOne(m, mates); share.set(t, share.get(t) + 1); }
  let best = null;
  for (const [t, n] of share) {
    t.addFunds(n, { reason: 'augment:aug_red_packet' });
    fx(m, 'redpacket', ps, t, { amount: n });
    if (!best || n > share.get(best)) best = t;
  }
  m.teamShow(ps, 'redpacket');
  m.tickerText(msg('{a} 发了红包，{b} 手气最佳', { a: ps.name, b: best.name }), 1);
}

/** 打赌: the round's pairings (none on a boss round — no settlement there); the panel's VS, no ticker line (only the win). */
function bets(m, st) {
  st.bets = [];
  if (isBossRound(m)) return;
  for (const ps of m.alivePlayers()) {
    if (!ps.augments.includes('aug_bet')) continue;
    const other = pickOne(m, matesOf(m, ps));
    if (!other) continue;
    st.bets.push({ round: m.round, a: ps.playerId, b: other.playerId });
    fx(m, 'bet', ps, other);
  }
}

/** 接力棒 at the round start: gone with its owner (as 定时炸弹); an eliminated holder's goes on; the holder's mark. */
function batonsAtStart(m, st) {
  st.batons = st.batons.filter((b) => {
    const o = m.players.get(b.owner);
    if (o && o.alive) return true;
    const h = m.players.get(b.holder);
    if (h) unmark(h, 'aug_baton', b.owner);
    return false;
  });
  for (const b of st.batons) {
    let h = m.players.get(b.holder);
    if (!h || !h.alive) {
      const next = nextAfter(m, b.holder);
      if (!next) continue;
      if (h) unmark(h, 'aug_baton', b.owner);
      b.holder = next.playerId;
      h = next;
      fx(m, 'baton', null, h);
      m.tickerText(msg('接力棒传到了 {name} 手里', { name: h.name }), 1);
    }
    mark(h, 'aug_baton', b.owner, m.round);
  }
}

/**
 * 抢功 of the Final Assault, at the Hidden Core's round start: the field partner's bounty coins of that fight (paid into
 * its funds by this round's income) go to the holder, ≤ max.
 */
function finalCredit(m) {
  if (m.gd.hiddenRound == null || m.round !== m.gd.hiddenRound || m.gd.hiddenRound === m.gd.bossRound) return;
  for (const g of pairPlayers(m.alivePlayers())) {
    if (g.length < 2) continue;
    for (const h of g) {
      if (!h.augments.includes('aug_steal_credit')) continue;
      const t = g.find((x) => x !== h);
      takeCredit(m, h, [[t, Math.max(0, int(m.lastResults.get(t.playerId)?.coins))]], 'funds');
    }
  }
}

/** 抢功: up to `max` of the listed teammates' bounty coins to `h` — from their pending funds (联防) or funds (Final Assault). */
function takeCredit(m, h, list, where) {
  let left = int(P('aug_steal_credit').max, 2);
  for (const [t, coins] of list) {
    if (!(left > 0)) break;
    const n = Math.min(left, coins, where === 'pending' ? t.pendingFunds : t.funds);
    if (!(n > 0)) continue;
    if (where === 'pending') {
      t.pendingFunds -= n;
      t.stats.fundsGained = Math.max(0, t.stats.fundsGained - n);
      t.dirty();
      credit(h, n);
    } else {
      t.addFunds(-n, { reason: 'augment:aug_steal_credit' });
      h.addFunds(n, { reason: 'augment:aug_steal_credit' });
    }
    left -= n;
    m.teamGrudge(t, h);
    m.teamShow(h, 'credit', n);
    fx(m, 'credit', t, h, { amount: n });
    m.tickerText(msg('{a} 抢了 {b} 的功劳：{n} 资金', { a: h.name, b: t.name, n }), 1);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// settlement

/** 连坐: the teammate charged the most this round — the holder pays as much again (≥ floor left), +funds next round. */
function collective(m, charges) {
  const p = P('aug_collective');
  for (const h of m.alivePlayers()) {
    if (!h.augments.includes('aug_collective')) continue;
    let src = null, c = 0;
    for (const t of matesOf(m, h)) { const v = charges.get(t.playerId) || 0; if (v > c) { c = v; src = t; } }
    if (!src) continue;
    const own = charges.get(h.playerId) || 0;
    const extra = Math.min(c, Math.max(0, h.lp - own - int(p.floor, 6)));
    if (!(extra > 0)) continue;
    charges.set(h.playerId, own + extra);
    const n = int(p.funds, 3);
    credit(h, n);
    fx(m, 'collective', src, h, { amount: extra });
    m.tickerText(msg('{a} 被 {b} 连坐了：目标生命 −{n}，下回合 +{f} 资金', { a: h.name, b: src.name, n: extra, f: n }), 1);
  }
}

/** 团队精神: everybody perfect — each holder gives every alive player funds next round and its active bonds layers. */
function teamSpirit(m, perfect) {
  const alive = m.alivePlayers();
  if (alive.length < 2 || !alive.every((x) => perfect.get(x.playerId))) return;
  const p = P('aug_team_spirit');
  const n = int(p.funds, 1);
  const layer = int(p.layer, 2);
  for (const h of alive) {
    if (!h.augments.includes('aug_team_spirit')) continue;
    for (const x of alive) {
      credit(x, n);
      for (const [b, st] of Object.entries(x.bonds)) if (st && st.active && !NO_STACK.has(b)) x.addLayers(b, layer, { requireActive: true, reason: 'augment:aug_team_spirit' });
    }
    fx(m, 'teamPerfect', h, null, { also: alive, amount: n });
    m.tickerText(msg('完美配合：全队 +{n} 资金（下回合发放），已激活的盟约 +{layer} 层', { n, layer }), 1);
  }
}

/** 加油: a cheered player's perfect round pays it and its cheerer `funds` each (next round) — the panel's coins only. */
function cheers(m, perfect) {
  const n = int(P('aug_cheer').funds, 1);
  const pre = `${MARK}aug_cheer:`;
  for (const t of m.alivePlayers()) {
    for (const ref of t.effects.filter((e) => e && typeof e.id === 'string' && e.id.startsWith(pre) && e.data && e.data.round === m.round)) {
      if (!standing(t) || !perfect.get(t.playerId)) continue;
      const from = m.players.get(ref.id.slice(pre.length));
      credit(t, n);
      if (standing(from)) credit(from, n);
      fx(m, 'cheer', from, t, { amount: n });
    }
  }
}

/** 接力棒: a holder's perfect round pays it `funds` (next round) and passes the baton on (seat order). */
function batonsSettle(m, st, perfect) {
  const n = int(P('aug_baton').funds, 1);
  for (const b of st.batons) {
    const h = m.players.get(b.holder);
    if (!standing(h) || !perfect.get(h.playerId)) continue;
    credit(h, n);
    m.teamShow(h, 'baton');
    const next = nextAfter(m, h.playerId, standing);
    // (alone: the baton stays, the pay stands)
    if (!next) { fx(m, 'baton', null, h, { amount: n }); continue; }
    unmark(h, 'aug_baton', b.owner);
    b.holder = next.playerId;
    fx(m, 'baton', h, next, { amount: n });
    m.tickerText(msg('{a} 完美作战（+{n} 资金），接力棒传到了 {b} 手里', { a: h.name, b: next.name, n }), 1);
  }
}

/** 打赌: fewer counted leaks wins the stake, paid at the next round start (a draw: nothing). */
function betsSettle(m, st) {
  const n = int(P('aug_bet').funds, 1);
  for (const bet of st.bets) {
    if (bet.round !== m.round) continue;
    const a = m.players.get(bet.a);
    const b = m.players.get(bet.b);
    if (!standing(a) || !standing(b)) continue;
    const la = leaksOf(m, a), lb = leaksOf(m, b);
    // a draw: the panel's 「平」 only
    if (la === lb) { fx(m, 'bet', a, b, { amount: 0 }); continue; }
    const [win, lose] = la < lb ? [a, b] : [b, a];
    st.dues.push({ augment: 'aug_bet', from: lose.playerId, to: win.playerId, amount: n });
    m.teamShow(win, 'bet');
    fx(m, 'bet', lose, win, { amount: n });
    m.tickerText(msg('{a} 赢了 {b} {n} 资金（下回合开始时结算）', { a: win.name, b: lose.name, n }), 1);
  }
  st.bets = [];
}

/** 碰瓷: the holder lost LP this settlement — a random perfect teammate owes it `funds` (≤ max a match). */
function extortions(m, st, perfect) {
  if (st.lp0Round !== m.round || !st.lp0) return;
  const p = P('aug_extort');
  const max = int(p.max, 5);
  const n = int(p.funds, 2);
  for (const h of m.alivePlayers()) {
    if (!h.augments.includes('aug_extort') || !standing(h)) continue;
    const used = int(h.counters['aug5:extort:n']);
    if (used >= max || !((st.lp0.get(h.playerId) ?? h.lp) > h.lp)) continue;
    const t = m.teamPickVictim(h, matesOf(m, h).filter((x) => standing(x) && perfect.get(x.playerId)));
    if (!t) continue;
    h.counters['aug5:extort:n'] = used + 1;
    showLeft(h, 'aug_extort', max - used - 1);
    st.dues.push({ augment: 'aug_extort', from: t.playerId, to: h.playerId, amount: n });
    m.teamGrudge(t, h);
    m.teamShow(h, 'extort');
    fx(m, 'extort', t, h, { amount: n });
    m.tickerText(msg('{a} 讹了 {b} {n} 资金（下回合开始时结算）', { a: h.name, b: t.name, n }), 1);
  }
}

/** The 联防 of this settlement (m.augUnite): 我来兜底's funds, 守望相助's coins on the panel, 抢功 among the helpers. */
function uniteSettle(m) {
  const u = m.augUnite;
  if (!u || u.round !== m.round || !u.result || !u.result.perPlayer) return;
  const per = u.result.perPlayer;
  const helpers = Object.keys(per).map((id) => m.players.get(id)).filter(standing);
  const leakers = ((u.plan && u.plan.leakers) || []).map(pidOf);
  for (const h of helpers) {
    const kills = Math.max(0, int(per[h.playerId] && per[h.playerId].killed));
    if (h.augments.includes('aug_cover_me')) {
      const n = Math.min(int(P('aug_cover_me').max, 3), kills);
      if (n > 0) {
        credit(h, n);
        m.teamShow(h, 'cover', n);
        fx(m, 'cover', null, h, { amount: n, also: leakers });
        m.tickerText(msg('{name} 来兜底了：下回合 +{n} 资金', { name: h.name, n }), 1);
      }
    }
    // (the payout: server/sim/content/augments.js GENERIC_META.aug_watch, the same count)
    if (h.augments.includes('aug_watch')) {
      const n = Math.min(int(P('aug_watch').max, 3), kills);
      if (n > 0) fx(m, 'watch', null, h, { amount: n });
    }
    if (h.augments.includes('aug_steal_credit')) {
      takeCredit(m, h, helpers.filter((t) => t !== h).map((t) => [t, Math.max(0, int(per[t.playerId] && per[t.playerId].coins))]), 'pending');
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// battle starts (prep handlers forwarded by server/sim/content/augments5/g4.js)

/**
 * 抢人头 on the team panel: from the Final Assault's start, every `sec` game seconds, the field's player with more damage
 * to the leader so far (the shared pool's per-player tally — the battle counts its own the same way) takes the lead.
 */
function watchLead(m) {
  const st = state(m);
  if (st.lead && st.lead.round === m.round) return;
  const run = { round: m.round, last: new Map() };
  st.lead = run;
  const sec = Math.max(1, int(P('aug_kill_steal').sec, 10));
  const period = Math.max(1, m.scaled((sec * 1000) / (Number(m.gameSpeed) || 1)));
  const tick = () => {
    if (m.ended || state(m).lead !== run || m.round !== run.round || m.phase !== PHASE.FINAL_ASSAULT) return;
    const pool = m.bossPool;
    const dmg = (p) => Number(pool && pool.byPlayer && pool.byPlayer.get(p.playerId)) || 0;
    for (const f of m.fields) {
      if (!f || f.kind !== 'boss' || !Array.isArray(f.players) || f.players.length < 2) continue;
      const two = f.players.map((id) => m.players.get(id)).filter(Boolean);
      if (!two.some((p) => p.augments.includes('aug_kill_steal'))) continue;
      const cur = run.last.has(f.fieldId) ? m.players.get(run.last.get(f.fieldId)) : null;
      let best = cur, top = cur ? dmg(cur) : 0;
      for (const p of two) if (dmg(p) > top + 1e-9) { best = p; top = dmg(p); }
      if (!best || best === cur) continue;
      run.last.set(f.fieldId, best.playerId);
      fx(m, 'lead', best, two.find((p) => p !== best));
      m.tickerText(msg('{name} 在抢人头中领先', { name: best.name }), 1);
    }
    m.later(period, tick);
  };
  m.later(period, tick);
}

const bossStart = (ev) => !!ev && !ev.preview && (ev.kind === 'boss' || ev.kind === 'hidden');
const uniteStart = (ev) => !!ev && !ev.preview && ev.kind === 'unite';
const unitePlanLeakers = (m) => (m.unitePlan && m.unitePlan.leakers ? m.unitePlan.leakers.map(pidOf) : []);

/** The forwarded prep handlers: augment id → hook → (m, ps, ev). */
const FORWARDED = {
  aug_snipe: { onBuy: (m, ps, ev) => snipe(m, ps, ev) },
  aug_kill_steal: { onBattleStart: (m, ps, ev) => { if (ev && !ev.preview && ev.kind === 'boss' && partnerOf(m, ps)) watchLead(m); } },
  aug_mole: {
    onBattleStart: (m, ps, ev) => {
      if (!bossStart(ev)) return;
      m.teamShow(ps, 'mole');
      fx(m, 'mole', ps, partnerOf(m, ps));
      m.tickerText(msg('{name} 好像是内鬼', { name: ps.name }), 1);
    },
  },
  aug_cover_me: { onBattleStart: (m, ps, ev) => { if (uniteStart(ev)) fx(m, 'cover', null, ps, { also: unitePlanLeakers(m) }); } },
  aug_sync: { onBattleStart: (m, ps, ev) => { if (uniteStart(ev)) fx(m, 'sync', null, ps); } },
  aug_together: { onBattleStart: (m, ps, ev) => { if (bossStart(ev)) fx(m, 'together', ps, partnerOf(m, ps)); } },
  aug_mutual: { paid: (m, ps, ev) => fx(m, 'mutual', null, ps, { amount: int(ev && ev.amount) }) },
};

SERVER.call = (ctx, id, hook, ev) => {
  const m = ctx && LINKS.get(ctx.rng);
  const ps = m ? m.players.get(ctx.playerId) : null;
  const fn = FORWARDED[id] && FORWARDED[id][hook];
  if (!ps || !fn) return;
  try { fn(m, ps, ev); } catch (e) { m.reportError(`augments5 g4 ${id}.${hook}`, e); }
};

// ---------------------------------------------------------------------------------------------------------------------
// the clicks

/** The teammate a click names (alive, not the clicker), or an error. */
function targetOf(m, ps, target) {
  const t = typeof target === 'string' ? m.players.get(target) : null;
  return t && t !== ps && t.alive ? t : null;
}

export const MATCH = Object.freeze({
  onPick(m, ps, id) {
    link(m);
    switch (id) {
      case 'aug_soul_swap': soulSwap(m, ps); break;
      case 'aug_life_swap': lifeSwap(m, ps); break;
      case 'aug_possess': possess(m, ps); break;
      case 'aug_snipe': watchBuys(m); break;
      case 'aug_red_packet': case 'aug_pickpocket': case 'aug_protection': ps.counters[`aug5:${id}:from`] = m.round; break;
      case 'aug_sell_out': showLeft(ps, id, int(P(id).max, 4)); break;
      case 'aug_absorb': showLeft(ps, id, int(P(id).max, 8)); break;
      case 'aug_extort': showLeft(ps, id, int(P(id).max, 5)); break;
      case 'aug_baton': {
        state(m).batons.push({ owner: ps.playerId, holder: ps.playerId });
        mark(ps, 'aug_baton', ps.playerId, m.round);
        fx(m, 'baton', null, ps);
        m.tickerText(msg('{name} 拿到了接力棒', { name: ps.name }), 1);
        break;
      }
      default: break;
    }
  },

  roundStart(m) {
    link(m);
    const st = state(m);
    payDues(m, st);
    batonsAtStart(m, st);
    for (const ps of m.alivePlayers()) {
      if (holds(ps, 'aug_protection')) protection(m, ps);
      if (holds(ps, 'aug_pickpocket')) pickpocket(m, ps);
      if (holds(ps, 'aug_absorb')) absorb(m, ps);
      if (holds(ps, 'aug_red_packet')) redPacket(m, ps);
    }
    bets(m, st);
    finalCredit(m);
  },

  charges(m, charges) {
    link(m);
    const st = state(m);
    // (the LP before the settlement: 碰瓷 asks whether the holder lost any)
    st.lp0 = new Map(m.alivePlayers().map((p) => [p.playerId, p.lp]));
    st.lp0Round = m.round;
    collective(m, charges);
  },

  afterCharges(m, perfect) {
    link(m);
    const st = state(m);
    teamSpirit(m, perfect);
    cheers(m, perfect);
    batonsSettle(m, st, perfect);
    betsSettle(m, st);
    extortions(m, st, perfect);
    uniteSettle(m);
  },

  action: {
    /** 加油: the teammate's battles of this round deal ×pct %; its perfect round pays both (afterCharges). */
    aug_cheer(m, ps, def, target) {
      link(m);
      const t = targetOf(m, ps, target);
      if (!t) return fail(ERR.BAD_TARGET, 'a teammate');
      mark(t, 'aug_cheer', ps.playerId, m.round);
      m.teamShow(ps, 'cheer');
      fx(m, 'cheer', ps, t);
      m.tickerText(msg('{a} 给 {b} 加油', { a: ps.name, b: t.name }), 1);
      m.toast(t, 'info', msg('{name} 给你加油：本回合造成的伤害提升', { name: ps.name }));
      return null;
    },
    /** 卖队友: the teammate −lp LP (not at floor or below after it), the holder +funds now; ≤ max a match. */
    aug_sell_out(m, ps, def, target) {
      link(m);
      const p = def.params;
      const t = targetOf(m, ps, target);
      if (!t) return fail(ERR.BAD_TARGET, 'a teammate');
      const max = int(p.max, 4);
      const used = int(ps.counters['aug5:sell_out:n']);
      if (used >= max) return fail(ERR.BAD_TARGET, 'no sale left');
      const lp = int(p.lp, 1);
      if (t.lp - lp < int(p.floor, 6)) return fail(ERR.BAD_TARGET, 'teammate LP too low');
      t.lp -= lp;
      t.stats.lpLost += lp;
      t.dirty();
      const n = int(p.funds, 2);
      ps.addFunds(n, { reason: 'augment:aug_sell_out' });
      ps.counters['aug5:sell_out:n'] = used + 1;
      showLeft(ps, 'aug_sell_out', max - used - 1);
      m.teamGrudge(t, ps);
      m.teamShow(ps, 'sellout');
      fx(m, 'sell', t, ps, { amount: n });
      m.tickerText(msg('{a} 把 {b} 卖了 {n} 资金', { a: ps.name, b: t.name, n }), 1);
      m.toast(t, 'warn', msg('你被 {name} 卖了：目标生命 −{n}', { name: ps.name, n: lp }));
      return null;
    },
  },
});
