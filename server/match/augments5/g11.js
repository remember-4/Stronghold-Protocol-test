// server/match/augments5/g11.js — A6000 fork, 海克斯第六版 batch g11: the match-side hooks of its augments (the prep /
// battle effects: server/sim/content/augments5/g11.js). The hooks: see the list in server/match/augments5/g4.js; this
// batch adds two of its own, called by server/match/match/enemyVotes.js finishEnemyVote:
//   voteCaptain(m, vote) → playerId | null   篡位: the captain whose vote alone is counted (it voted), else null
//   voteSettled(m, vote, winner)             唱反调: the vote is decided
//
// The batch (_ops/stronghold-a6000/analysis/海克斯第六版-大扩充.md, H and I):
//   LP           诅咒王冠 (lpCap +cap; charges: every enemy that got through costs `leak` more, within that cap — a
//                联防 leaker's are its survivors), 卦象·艮 (lpCap ≤ lp for the round), 血契 (−lp at the round start while
//                above `floor`; not at the Hidden Core's: the team's LP is pooled then)
//   the clicks   限定寻访 (cost funds → one operator: the tier by the odds — 6 / 5 ×幸运, the rest scaled down —, a pity
//                after `miss` misses; the shared pool and the player's 自选 stock, any tier; a 6 is announced to everyone)
//   on the pick  搭便车 (a random teammate binds), 鸠占鹊巢 (the top active bonds' layers swapped with a random teammate whose
//                top bond holds more), 篡位 (the captain), 抢购 (this round's slot at once), the ones counted from the pick
//   round start  以牙还牙's dues, 血契, 借来用用 (the loans due go back, then a new one every `every` rounds), 抄作业,
//                抢购 (the holder's shop gets one slot more: the most expensive operator of a random teammate's shop —
//                appended after the item slots, the item section's count raised so the layout stays whole; a manual
//                refresh drops it, the prep end removes it), 篡位 (the captain kept up, the teammates' tribute), 均贫富,
//                双面间谍 (the round's target; none on a boss round: no settlement)
//   settlement   双面间谍 (its target's LP charge → funds next round, ≤ max), 借刀杀人 (the 联防's kills of the holder's
//                leaked enemies → funds next round, ≤ max)
//   prep hooks   (forwarded by the sim module) 搭便车's merge watch, 吃回扣's item purchase watch (every player carries a
//                hidden watcher EffectRef while someone holds them), 抢购's purchase / prep end, 公摊's level-up
//   takes        onTake: 连环计 counts the holder's takes (its EffectRef's counter; the battle reads it), 以牙还牙 takes
//                `funds` back from the taker (once a round; now while funds can be spent, else at the next round start)
//   votes        篡位 (only the captain's vote counts — 逆反 still turns it), 唱反调 (a holder whose vote lost: +funds now)
// The 损人利己 floor of the fifth version (no teammate's LP below 6, no funds below 0, a cap on each, never an eliminated
// player): whoever a 〔坏人〕 one of this batch profits from (the snatched shop, the lender, the swapped layers, the funds
// moved, the bill payers, the tribute) holds a grudge against its holder (m.teamGrudge — onTake, 〔坏人〕, 连环计, 以牙还牙
// hear it); 以牙还牙 itself takes nothing (no grudge: no loop). 吃回扣, 借刀杀人 and 双面间谍 take nothing either — the
// item buyer, the 联防 helper and the bet's target pay nothing, the funds are the game's —: m.teamGrudge with taken false
// (2026-10-14, 「记仇的惩罚太重了」: each +1 drew a 讨债), still a take of the holder's for 〔坏人〕 2 and 连环计, not one
// 以牙还牙 answers. Random draws: m.rngMeta (m.teamPickVictim for the 损人利己 targets).
//
// The team effects (m.teamFx kind: from → to, amount …; what moves goes from → to):
//   freeride     the bound teammate → holder: amount null (the bond, at the pick), amount = funds (his merge)
//   copycat      teammate → holder; chess = the copied operator
//   snatch       teammate → holder; chess = the operator bought from the extra slot (it left his shop)
//   borrowKnife  the 联防 helper with the most kills → holder (also = the other helpers); amount = funds next round
//   borrow       lender → borrower; augment = the 海克斯 lent (borrowBack: borrower → lender, its return)
//   doubleAgent  holder → target: amount null (the bet, at the round start); target → holder: amount = funds (the payout)
//   cuckoo       teammate → holder; amount = the layers the holder's top bond gained
//   contrarian   to = holder; amount = funds
//   kickback     buyer → holder; amount = funds, item = the item bought
//   titForTat    taker → holder; amount = funds
//   equalize     a teammate with more than the share → one with less (also = the holder); amount = funds moved
//   splitBill    payer → holder; amount = funds
//   usurp        the old captain (null: none) → the new one, amount null; payer → captain, amount = the tribute

import { PHASE, ERR } from '../../../shared/constants.js';
import { augmentDef } from '../../../shared/augments.js';
import { msg, dn, tn } from '../../../shared/i18n.js';
import { luckOf } from '../../../shared/luck.js';
import { freeSlot } from '../board.js';
import { uniteSurvivors } from '../unite.js';
import { fail } from '../match/common.js';
import { NO_STACK } from '../../sim/content/augments.js';
import { SERVER } from '../../sim/content/augments5/g11.js';

const KEY = (id) => `augment:${id}`;
const P = (id) => augmentDef(id)?.params ?? {};
const int = (v, d = 0) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : d);
const pidOf = (x) => (x == null ? null : typeof x === 'string' ? x : x.playerId ?? null);
const holds = (ps, id) => !!ps && ps.alive && ps.augments.includes(id);
const matesOf = (m, ps) => m.alivePlayers().filter((p) => p !== ps);
/** Still in at the settlement's end (a player at ≤ 0 LP goes out right after it). */
const standing = (p) => !!p && p.alive && p.lp > 0;
const isBossRound = (m) => m.round === m.gd.bossRound || m.round === m.gd.hiddenRound;
/** The Hidden Core's round (after the Final Assault the team's LP is one pool: m.teamLp). */
const isHiddenRound = (m) => m.gd.hiddenRound != null && m.round === m.gd.hiddenRound && m.gd.hiddenRound !== m.gd.bossRound;
const credit = (ps, n) => { ps.pendingFunds += n; ps.stats.fundsGained += n; ps.dirty(); };
/** The phases whose funds a player can still spend this prep (a transfer then is at once; elsewhere next round). */
const SPEND_PHASES = new Set([PHASE.ROUND_START, PHASE.AUGMENT, PHASE.SP_DRAFT, PHASE.PREP]);

/** The match a prep ctx belongs to — every ctx carries its match's meta rng (effectsMeta makeCtx `rng`). */
const LINKS = new WeakMap();
const link = (m) => { if (m && typeof m.rngMeta === 'function') LINKS.set(m.rngMeta, m); };

/** This batch's match state. */
const state = (m) => (m.aug6g11 ??= {
  rides: [], captain: null, usurpers: [], loans: [], agents: [], dues: [], charged: null, chargedRound: null,
});

/** One of `list` at random (no draw for a single one). */
const pickOne = (m, list) => (list.length <= 1 ? list[0] ?? null : list[Math.floor(m.rngMeta() * list.length)]);

/** The augment of each team effect kind of this module (m.teamFx `augment`: the panel's icon). */
const FX_AUGMENT = Object.freeze({
  freeride: 'aug_freeride', copycat: 'aug_copycat', snatch: 'aug_snatch', borrowKnife: 'aug_borrow_knife', borrow: 'aug_borrow',
  borrowBack: 'aug_borrow', doubleAgent: 'aug_double_agent', cuckoo: 'aug_cuckoo', contrarian: 'aug_contrarian', kickback: 'aug_kickback',
  titForTat: 'aug_tit_for_tat', equalize: 'aug_equalize', splitBill: 'aug_split_bill', usurp: 'aug_usurp',
});

/** m.teamFx with player states or ids (`augment` given: the 海克斯 that moves — 借来用用's). */
function fx(m, kind, from, to, extra = {}) {
  const { also, augment, ...rest } = extra;
  m.teamFx(kind, {
    from: pidOf(from), to: pidOf(to), augment: augment ?? FX_AUGMENT[kind] ?? null,
    ...(Array.isArray(also) ? { also: also.map(pidOf).filter(Boolean) } : {}), ...rest,
  });
}

/** The holder's own EffectRef shows a number (the effects column's). */
function showCounter(ps, id, n) {
  const ref = ps.effects.find((e) => e && e.key === KEY(id) && !e.hidden);
  if (ref) { ref.counter = n; ps.dirty(); }
}

/** Fires every `every` rounds after the pick (the pick's round set at onPick), as 打劫. */
function everyDue(m, ps, id, every) {
  const from = ps.counters[`aug6:${id}:from`];
  return Number.isFinite(from) && m.round > from && (m.round - from) % Math.max(1, every) === 0;
}

/** A per-round count of a player (reset lazily when the round changes): its value now. */
function roundCount(m, ps, key) {
  if (ps.counters[`${key}:r`] !== m.round) { ps.counters[`${key}:r`] = m.round; ps.counters[key] = 0; }
  return int(ps.counters[key]);
}

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
// watchers: a teammate's dispatcher hook reaches the holders' handlers

/** The augments whose handler must hear every player's hook (a hidden EffectRef with the augment's key, no battle). */
const WATCHED = Object.freeze(['aug_freeride', 'aug_kickback']);
const WATCH = (id) => `aug6watch:${id}`;

/** While an alive player holds a watched augment, every player without an EffectRef of its key gets a watcher. */
function ensureWatchers(m) {
  for (const id of WATCHED) {
    if (!m.alivePlayers().some((p) => p.augments.includes(id))) continue;
    const def = augmentDef(id);
    for (const ps of m.order) {
      if (ps.effects.some((e) => e && e.key === KEY(id))) continue;
      ps.effects.push({ id: WATCH(id), key: KEY(id), iconKind: 'augment', iconId: null, name: def.name, desc: '', params: {}, battle: false, hidden: true });
    }
  }
}

/** A player picking a watched augment: its own EffectRef hears its hooks now — its watcher goes (one dispatch a hook). */
function dropWatcher(ps, id) {
  const i = ps.effects.findIndex((e) => e && e.id === WATCH(id));
  if (i >= 0) ps.effects.splice(i, 1);
}

// ---------------------------------------------------------------------------------------------------------------------
// H. 规则级

/**
 * The enemies of `ps` that got through this round: a 联防 leaker's survivors (the 联防 field's result, as settle() charges
 * them), else the counted leaks of its own battle.
 */
function leaksThrough(m, ps) {
  const v = m.uniteResultView;
  if (v && Array.isArray(v.leakers) && v.leakers.includes(ps.playerId) && m.unitePlan) {
    const f = (m.fields || []).find((x) => x && x.kind === 'unite');
    let res = null;
    if (f && f.cc) res = f.done ? f.result : null;
    else if (f && f.battle && f.battle.finished) { try { res = f.battle.result(); } catch { res = null; } }
    if (res && !res.synthetic) return Math.max(0, uniteSurvivors(m.unitePlan, res).get(ps.playerId) || 0);
  }
  const r = m.lastResults.get(ps.playerId);
  return r && Array.isArray(r.leaked) ? r.leaked.filter((l) => l && l.counted !== false).length : 0;
}

/** 诅咒王冠 at the settlement: every enemy that got through costs `leak` more, within the holder's (raised) round cap. */
function crownCharges(m, charges) {
  const p = P('aug_cursed_crown');
  for (const ps of m.alivePlayers()) {
    if (!ps.augments.includes('aug_cursed_crown')) continue;
    const leaks = leaksThrough(m, ps);
    if (!(leaks > 0)) continue;
    const own = charges.get(ps.playerId) || 0;
    const extra = Math.min(leaks * Math.max(0, int(p.leak, 1)), Math.max(0, m.lpCapFor(ps) - own));
    if (!(extra > 0)) continue;
    charges.set(ps.playerId, own + extra);
    m.toast(ps, 'warn', msg('诅咒王冠：漏过 {n} 个敌人，多扣 {x} 点目标生命', { n: leaks, x: extra }));
  }
}

/** The holder's 卦象 of this round ({ round, gua }), or null. */
function trigramOf(m, ps) {
  const ref = ps.effects.find((e) => e && e.key === KEY('aug_hexagram') && !e.hidden);
  const d = ref && ref.data;
  return d && d.round === m.round ? d : null;
}

/** 血契 at the round start: −lp while above `floor` (not at the Hidden Core's round: the pooled team LP). */
function bloodPacts(m) {
  if (isHiddenRound(m)) return;
  const p = P('aug_blood_pact');
  const lp = Math.max(0, int(p.lp, 1)), floor = int(p.floor, 5);
  for (const ps of m.alivePlayers()) {
    if (!ps.augments.includes('aug_blood_pact') || !(ps.lp > floor)) continue;
    const n = Math.min(lp, ps.lp - floor);
    if (!(n > 0)) continue;
    ps.lp -= n;
    ps.stats.lpLost += n;
    ps.dirty();
    m.toast(ps, 'warn', msg('血契：目标生命 −{n}', { n }));
    m.markPublic();
  }
}

/** 限定寻访's tier: 6 / 5 ×luck, the rest scaled down to fill 100 % (luck 1: the definition's odds, one draw). */
function gachaTier(m, p, luck) {
  const L = luck > 0 ? luck : 1;
  let w6 = Math.max(0, Number(p.p6) || 0) * L, w5 = Math.max(0, Number(p.p5) || 0) * L;
  if (w6 + w5 > 100) { const k = 100 / (w6 + w5); w6 *= k; w5 *= k; }
  const rest = [[4, Math.max(0, Number(p.p4) || 0)], [3, Math.max(0, Number(p.p3) || 0)], [2, Math.max(0, Number(p.p12) || 0)]];
  const base = rest.reduce((s, [, w]) => s + w, 0);
  const scale = base > 0 ? Math.max(0, 100 - w6 - w5) / base : 0;
  let x = m.rngMeta() * (w6 + w5 + base * scale);
  for (const [t, w] of [[6, w6], [5, w5], ...rest.map(([t, w]) => [t, w * scale])]) { x -= w; if (x < 0) return t; }
  return 2;
}

/**
 * An operator of `tier` for 限定寻访 (2 = the 1–2 bucket) from the shared pool and the player's 自选 stock, whatever its
 * 调度中心 level: the tier, else the ones below, else above (copy-weighted). [id, tier] or null.
 */
function gachaDraw(m, ps, tier) {
  const extra = typeof ps.diyStockEntries === 'function' ? ps.diyStockEntries() : null;
  const order = [];
  for (let t = tier; t >= 1; t--) order.push(t);
  for (let t = tier + 1; t <= 6; t++) order.push(t);
  for (const t of order) {
    if (t === 1 && tier >= 2) continue; // (the 1–2 bucket draws tier 1 with tier 2)
    const id = m.pool.roll(m.rngMeta, t <= 2 ? { maxTier: 2, extra } : { tier: t, extra });
    if (id) return [id, ps.gd.tierOf(id)];
  }
  return null;
}

/** H5 限定寻访 (a click, once a round): see the header. */
function gacha(m, ps, def) {
  const p = def.params;
  const cost = Math.max(0, int(p.cost, 3));
  if (ps.funds < cost) return fail(ERR.NO_FUNDS);
  const reserve = ps.augments.includes('aug_reserve') && freeSlot(ps.temp) >= 0;
  if (freeSlot(ps.hand) < 0 && !reserve) return fail(ERR.HAND_FULL);
  const miss = int(ps.counters['aug6:gacha:miss']);
  const pity = Math.max(0, int(p.miss, 9));
  const want = miss >= pity ? 6 : gachaTier(m, p, luckOf(ps.augments, m.enemyBuffs));
  const got = gachaDraw(m, ps, want);
  if (!got) return fail(ERR.SOLD_OUT, 'the pool is empty');
  const [id, tier] = got;
  ps.spend(cost);
  const piece = ps.acquireChess(id, { source: KEY('aug_gacha'), toTemp: freeSlot(ps.hand) < 0 });
  if (!piece) { ps.funds += cost; ps.stats.gold = Math.max(0, ps.stats.gold - cost); ps.round.spent = Math.max(0, ps.round.spent - cost); ps.dirty(); return fail(ERR.HAND_FULL); }
  ps._afterSpend(cost, 'augment');
  // (the player's data view: a 自选 stock piece is named by its operator)
  const name = dn(ps.gd.chess(id)?.name || '');
  if (tier >= 6) {
    ps.counters['aug6:gacha:miss'] = 0;
    m.tickerText(msg('{name} 寻访出了 6 阶干员 {chess}！', { name: ps.name, chess: name }), 1);
  } else {
    ps.counters['aug6:gacha:miss'] = miss + 1;
    m.toast(ps, 'info', msg('限定寻访：获得{chess}', { chess: name }));
  }
  showCounter(ps, 'aug_gacha', pity + 1 - int(ps.counters['aug6:gacha:miss']));
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------
// I. 同盟: the pick

/** I1 搭便车: a random teammate binds the holder (the ride ends with either of them). */
function freerideBind(m, ps) {
  const mate = pickOne(m, matesOf(m, ps));
  if (!mate) return;
  state(m).rides.push({ rider: ps.playerId, driver: mate.playerId });
  fx(m, 'freeride', mate, ps);
  m.tickerText(msg('{a} 搭上了 {b} 的便车', { a: ps.name, b: mate.name }), 1);
  m.markPublic();
}

/** 搭便车 (a merge of `driver`, forwarded from its onMerge): each rider bound to it +funds now, ≤ max a round. */
function freerideMerge(m, driver, ev) {
  if (!ev || ev.kind !== 'chess') return;
  const p = P('aug_freeride');
  for (const r of state(m).rides) {
    if (r.driver !== driver.playerId) continue;
    const rider = m.players.get(r.rider);
    if (!holds(rider, 'aug_freeride') || !driver.alive) continue;
    const used = roundCount(m, rider, 'aug6:freeride');
    if (used >= int(p.max, 2)) continue;
    const n = Math.max(0, int(p.funds, 1));
    if (!(n > 0)) continue;
    rider.counters['aug6:freeride'] = used + 1;
    rider.addFunds(n, { reason: KEY('aug_freeride') });
    driver.addFunds(n, { reason: KEY('aug_freeride') });
    fx(m, 'freeride', driver, rider, { amount: n });
    m.toast(rider, 'info', msg('搭便车：{name} 合成了精锐，+{n} 资金', { name: driver.name, n }));
    m.markPublic();
  }
}

/**
 * I7 鸠占鹊巢 (once, at the pick): with a random teammate whose top active bond holds more layers than the holder's, the two
 * top bonds trade their layer counts (the holder's gain is a layer gain; nothing when nobody holds more).
 */
function cuckoo(m, ps) {
  const mine = topBond(m, ps);
  if (!mine) { m.toast(ps, 'info', msg('鸠占鹊巢：你没有已激活的盟约，什么也没发生')); return; }
  const hl = ps.layers[mine] || 0;
  const v = m.teamPickVictim(ps, matesOf(m, ps).filter((t) => { const b = topBond(m, t); return b && (t.layers[b] || 0) > hl; }));
  if (!v) { m.toast(ps, 'info', msg('鸠占鹊巢：没有队友的盟约层数比你高，什么也没发生')); return; }
  const vb = topBond(m, v);
  const vl = v.layers[vb] || 0;
  v.layers[vb] = hl;
  v.recompute();
  v.dirty();
  const gain = ps.addLayers(mine, vl - hl, { reason: KEY('aug_cuckoo') });
  ps.dirty();
  m.teamGrudge(v, ps);
  fx(m, 'cuckoo', v, ps, { amount: gain });
  m.tickerText(msg('{a} 鸠占鹊巢：和 {b} 交换了盟约层数（+{n} 层）', { a: ps.name, b: v.name, n: gain }), 1);
  m.toast(v, 'warn', msg('{name} 鸠占鹊巢：你的{bond}只剩 {n} 层', { name: ps.name, bond: dn(m.gd.bond(vb)?.name || vb), n: hl }));
  m.markPublic();
}

/** The captain (篡位): the latest alive holder to take it — kept up when the captain went out. */
function captainOf(m, st) {
  const cur = st.captain ? m.players.get(st.captain) : null;
  if (holds(cur, 'aug_usurp')) return cur;
  for (let i = st.usurpers.length - 1; i >= 0; i--) {
    const p = m.players.get(st.usurpers[i]);
    if (!holds(p, 'aug_usurp')) continue;
    st.captain = p.playerId;
    fx(m, 'usurp', null, p);
    m.tickerText(msg('{name} 成了队长', { name: p.name }), 1);
    return p;
  }
  st.captain = null;
  return null;
}

/** I14 篡位 at the pick: the holder is the captain now (the crown comes from the old one). */
function usurp(m, ps) {
  const st = state(m);
  const prev = st.captain && st.captain !== ps.playerId ? m.players.get(st.captain) : null;
  st.captain = ps.playerId;
  st.usurpers = [...st.usurpers.filter((x) => x !== ps.playerId), ps.playerId];
  fx(m, 'usurp', prev && prev.alive ? prev : null, ps);
  m.tickerText(msg('{name} 篡位成了队长', { name: ps.name }), 1);
  m.markPublic();
}

// ---------------------------------------------------------------------------------------------------------------------
// I. 同盟: the round start

/** 以牙还牙's dues of the last settlement: from this round's funds, as much as there is. */
function payDues(m, st) {
  const dues = st.dues;
  st.dues = [];
  for (const d of dues) {
    const from = m.players.get(d.from);
    const to = m.players.get(d.to);
    if (!from || !to || !from.alive || !to.alive) continue;
    const n = -from.addFunds(-Math.min(d.amount, from.funds), { reason: KEY('aug_tit_for_tat') });
    if (!(n > 0)) continue;
    to.addFunds(n, { reason: KEY('aug_tit_for_tat') });
    fx(m, 'titForTat', from, to, { amount: n });
    m.tickerText(msg('{a} 以牙还牙：从 {b} 那里拿回 {n} 资金', { a: to.name, b: from.name, n }), 1);
  }
}

/** The battle 海克斯 of `t` that 借来用用 may borrow: generic, side 'battle', 白～紫, not held by `ps`, not on loan itself. */
function borrowable(m, ps, t, st) {
  const max = int(P('aug_borrow').maxRarity, 4);
  return t.augments.filter((id) => {
    const d = augmentDef(id);
    if (!d || d.band || d.cls || d.pseudo || d.side !== 'battle' || !(d.rarity >= 1 && d.rarity <= max)) return false;
    if (ps.augments.includes(id)) return false;
    return !st.loans.some((l) => l.holder === t.playerId && l.id === id);
  });
}

/** 借来用用's return: the 海克斯 back to its lender (alive or not — it is his); fine whatever happened to it meanwhile. */
function giveBack(m, loan) {
  const holder = m.players.get(loan.holder);
  const lender = m.players.get(loan.lender);
  const id = loan.id;
  const had = !!holder && holder.augments.includes(id);
  if (had && lender && !lender.augments.includes(id)) m.transferAugment(holder, lender, id);
  else if (had) m.revokeAugment(holder, id);
  else if (lender && !lender.augments.includes(id)) m.grantAugment(lender, id, { silent: true });
  if (!lender || !lender.alive) return;
  fx(m, 'borrowBack', holder, lender, { augment: id });
  m.tickerText(msg('{a} 把{aug}还给了 {b}', { a: holder ? holder.name : '', b: lender.name, aug: tn(augmentDef(id)?.name || id) }), 1);
}

/** 借来用用 at the round start: the loans due go back (or the borrower is out), then a holder due borrows one. */
function loansAtStart(m, st) {
  st.loans = st.loans.filter((l) => {
    const holder = m.players.get(l.holder);
    if (m.round < l.until && holder && holder.alive) return true;
    giveBack(m, l);
    return false;
  });
  const p = P('aug_borrow');
  for (const ps of m.alivePlayers()) {
    if (!ps.augments.includes('aug_borrow') || !everyDue(m, ps, 'aug_borrow', int(p.every, 3))) continue;
    if (st.loans.some((l) => l.holder === ps.playerId)) continue;
    const v = m.teamPickVictim(ps, matesOf(m, ps).filter((t) => borrowable(m, ps, t, st).length));
    if (!v) continue;
    const id = pickOne(m, borrowable(m, ps, v, st));
    if (!id || !m.transferAugment(v, ps, id)) continue;
    st.loans.push({ holder: ps.playerId, lender: v.playerId, id, until: m.round + Math.max(1, int(p.rounds, 2)) });
    const aug = tn(augmentDef(id)?.name || id);
    m.teamGrudge(v, ps);
    fx(m, 'borrow', v, ps, { augment: id });
    m.tickerText(msg('{a} 借走了 {b} 的{aug}', { a: ps.name, b: v.name, aug }), 1);
    m.toast(v, 'warn', msg('你的{aug}被 {name} 借走了 {n} 回合', { aug, name: ps.name, n: Math.max(1, int(p.rounds, 2)) }));
  }
}

/** I2 抄作业: every `every` rounds, a copy of a random normal board operator of a random teammate (≤ its 调度中心 level). */
function copycat(m, ps) {
  if (!everyDue(m, ps, 'aug_copycat', int(P('aug_copycat').every, 2))) return;
  const lvl = Math.max(1, ps.shop.level);
  const ok = (id) => {
    const rec = m.gd.chess(id);
    if (!rec || rec.isGolden || rec.isDiy || m.gd.tierOf(id) > lvl) return false;
    const base = m.gd.baseIdOf(id);
    return m.pool.has(base) && m.pool.left(base) >= 1;
  };
  const ops = (t) => [...t.board.values()].filter((x) => x && x.kind === 'chess' && ok(x.id));
  const t = pickOne(m, matesOf(m, ps).filter((x) => ops(x).length));
  if (!t) return;
  const base = m.gd.baseIdOf(pickOne(m, ops(t)).id);
  const got = ps.acquireChess(base, { source: KEY('aug_copycat') });
  if (!got) return;
  const name = dn(m.gd.chess(base)?.name || '');
  fx(m, 'copycat', t, ps, { chess: base });
  m.tickerText(msg('{a} 抄了 {b} 的作业', { a: ps.name, b: t.name }), 1);
  m.toast(ps, 'info', msg('抄作业：获得{chess}', { chess: name }));
  m.markPublic();
}

/**
 * I3 抢购: this round's extra slot of the holder's shop — the most expensive operator (its data price; ties: the left one)
 * of a random teammate's shop, appended after the item slots (the item section's count raised: the layout stays whole).
 */
function snatchSlot(m, ps) {
  if (ps.shop.slots.some((s) => s && s.snatch)) return;
  const cands = new Map();
  for (const t of matesOf(m, ps)) {
    const n = Math.min(t.shop.slots.length, t.shop.layout ? t.shop.layout.chess : t.shop.slots.length);
    let best = null;
    for (let i = 0; i < n; i++) {
      const s = t.shop.slots[i];
      const rec = s && s.kind === 'chess' && !s.sold ? m.gd.chess(s.id) : null;
      if (!rec || rec.isDiy) continue;
      if (!best || s.basePrice > best.s.basePrice) best = { i, s };
    }
    if (best) cands.set(t, best);
  }
  const v = m.teamPickVictim(ps, [...cands.keys()]);
  if (!v) return;
  const { i, s } = cands.get(v);
  const layout = ps.shop.layout || { chess: ps.shop.slots.length, item: 0 };
  ps.shop.slots.push({ kind: 'chess', id: s.id, basePrice: m.gd.chessPrice(s.id), frozen: false, sold: false, snatch: { from: v.playerId, idx: i, round: m.round } });
  ps.shop.layout = { chess: layout.chess, item: layout.item + 1 };
  ps.dirty();
  m.toast(ps, 'info', msg('抢购：你的商店多了 {name} 看中的{chess}', { name: v.name, chess: dn(m.gd.chess(s.id)?.name || '') }));
}

/** 抢购: the holder bought its extra slot — the operator leaves the teammate's shop (when it is still there). */
function snatchBought(m, ps, ev) {
  const sn = ev && ev.slot && ev.slot.snatch;
  if (!sn || ev.kind !== 'chess') return;
  const v = m.players.get(sn.from);
  if (!v || !v.alive || v === ps) return;
  const n = Math.min(v.shop.slots.length, v.shop.layout ? v.shop.layout.chess : v.shop.slots.length);
  let at = sn.idx < n && v.shop.slots[sn.idx] && v.shop.slots[sn.idx].id === ev.slot.id && !v.shop.slots[sn.idx].sold ? sn.idx : -1;
  if (at < 0) for (let i = 0; i < n && at < 0; i++) { const s = v.shop.slots[i]; if (s && s.kind === 'chess' && !s.sold && s.id === ev.slot.id) at = i; }
  if (at < 0) return;
  v.shop.slots[at] = null;
  v.dirty();
  const name = dn(m.gd.chess(ev.slot.id)?.name || '');
  m.teamGrudge(v, ps);
  fx(m, 'snatch', v, ps, { chess: m.gd.baseIdOf(ev.slot.id) });
  m.tickerText(msg('{a} 抢走了 {b} 看中的{chess}', { a: ps.name, b: v.name, chess: name }), 1);
  m.toast(v, 'warn', msg('{chess}被 {name} 抢走了', { chess: name, name: ps.name }));
  m.markPublic();
}

/**
 * 抢购 at the holder's prep end: the extra slot goes (bought or not, frozen or not) — every operator slot of the item
 * section, the section's count back. A manual refresh already dropped it (rollShop rebuilds the layout).
 */
function snatchClear(m, ps) {
  const layout = ps.shop.layout;
  if (!layout) return;
  let removed = 0;
  for (let i = ps.shop.slots.length - 1; i >= layout.chess; i--) {
    const s = ps.shop.slots[i];
    if (s && s.kind === 'chess') { ps.shop.slots.splice(i, 1); removed++; }
  }
  if (removed) { ps.shop.layout = { chess: layout.chess, item: Math.max(0, layout.item - removed) }; ps.dirty(); }
}

/** 篡位 at the round start: the captain kept up; every teammate with `funds` hands them over. */
function tribute(m, st) {
  const cap = captainOf(m, st);
  if (!cap) return;
  const n = Math.max(0, int(P('aug_usurp').funds, 1));
  for (const t of matesOf(m, cap)) {
    if (!(t.funds >= n) || !(n > 0)) continue;
    const got = -t.addFunds(-Math.min(t.funds, n + m.teamRevengeBonus(cap, t)), { reason: KEY('aug_usurp') });
    if (!(got > 0)) continue;
    cap.addFunds(got, { reason: KEY('aug_usurp') });
    m.teamGrudge(t, cap);
    fx(m, 'usurp', t, cap, { amount: got });
  }
  m.markPublic();
}

/** I12 均贫富 at the round start: every alive player's funds → the floored share, the remainder to the holder. */
function equalize(m, ps) {
  const team = m.alivePlayers();
  if (team.length < 2) return;
  const total = team.reduce((s, p) => s + Math.max(0, p.funds), 0);
  const each = Math.floor(total / team.length);
  const want = (p) => each + (p === ps ? total - each * team.length : 0);
  const losers = team.filter((p) => p.funds > want(p)).map((p) => ({ p, n: p.funds - want(p) }));
  const gainers = team.filter((p) => p.funds < want(p)).map((p) => ({ p, n: want(p) - p.funds }));
  if (!losers.length) return;
  for (const l of losers) {
    for (const g of gainers) {
      const k = Math.min(l.n, g.n);
      if (!(k > 0)) continue;
      l.n -= k;
      g.n -= k;
      l.p.addFunds(-k, { reason: KEY('aug_equalize') });
      g.p.addFunds(k, { reason: KEY('aug_equalize') });
      fx(m, 'equalize', l.p, g.p, { amount: k, also: [ps] });
    }
    if (l.p !== ps) m.teamGrudge(l.p, ps);
  }
  m.tickerText(msg('{name} 均了一次贫富', { name: ps.name }), 1);
  m.markPublic();
}

/** I6 双面间谍 at the round start: the round's target (none on a boss round: it has no settlement). */
function agentsAtStart(m, st) {
  st.agents = [];
  if (isBossRound(m)) return;
  for (const ps of m.alivePlayers()) {
    if (!ps.augments.includes('aug_double_agent')) continue;
    const t = m.teamPickVictim(ps, matesOf(m, ps));
    if (!t) continue;
    st.agents.push({ round: m.round, holder: ps.playerId, target: t.playerId });
    fx(m, 'doubleAgent', ps, t);
    m.tickerText(msg('{a} 在 {b} 身上押了一注', { a: ps.name, b: t.name }), 1);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// I. 同盟: the settlement

/** 双面间谍: the target's LP charge of this round (the charges as billed) → the holder's funds next round, ≤ max. */
function agentsSettle(m, st) {
  if (st.chargedRound !== m.round || !st.charged) return;
  const max = Math.max(0, int(P('aug_double_agent').max, 3));
  for (const a of st.agents) {
    if (a.round !== m.round) continue;
    const h = m.players.get(a.holder);
    const t = m.players.get(a.target);
    if (!standing(h) || !t || !holds(h, 'aug_double_agent')) continue;
    const n = Math.min(max, Math.max(0, int(st.charged.get(t.playerId))));
    if (!(n > 0)) continue;
    credit(h, n);
    m.teamGrudge(t, h, { taken: false }); // (the payout is the game's: no grudge — 2026-10-14)
    fx(m, 'doubleAgent', t, h, { amount: n });
    m.toast(h, 'info', msg('双面间谍：{name} 扣了目标生命，下回合 +{n} 资金', { name: t.name, n }));
  }
  st.agents = [];
}

/** 借刀杀人: the 联防's helpers knocked out the holder's leaked enemies → funds next round (≤ max). */
function knifeSettle(m) {
  const u = m.augUnite;
  if (!u || u.round !== m.round || !u.plan || !u.result || !u.result.perPlayer) return;
  const p = P('aug_borrow_knife');
  const per = u.result.perPlayer;
  const helpers = u.plan.helpers.filter(Boolean);
  if (!helpers.length) return;
  const survivors = uniteSurvivors(u.plan, u.result);
  for (const h of u.plan.leakers) {
    if (!standing(h) || !h.augments.includes('aug_borrow_knife')) continue;
    const sent = u.plan.leaked.filter((l) => l && l.sourcePlayerId === h.playerId).length;
    const through = Math.max(0, (survivors.get(h.playerId) || 0) - (u.plan.notReentered.get(h.playerId) || 0));
    const n = Math.min(Math.max(0, int(p.max, 3)), Math.max(0, sent - through) * Math.max(0, int(p.funds, 1)));
    if (!(n > 0)) continue;
    credit(h, n);
    const kills = (x) => Math.max(0, int(per[x.playerId] && per[x.playerId].killed));
    const top = helpers.slice().sort((a, b) => kills(b) - kills(a) || a.seat - b.seat)[0];
    m.teamGrudge(top, h, { taken: false }); // (the payout is the game's: no grudge — 2026-10-14)
    fx(m, 'borrowKnife', top, h, { amount: n, also: helpers.filter((x) => x !== top) });
    m.tickerText(msg('{a} 借刀杀人：下回合 +{n} 资金', { a: h.name, n }), 1);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// the prep hooks forwarded by server/sim/content/augments5/g11.js

/** I9 吃回扣 (an item purchase of `buyer`, forwarded from its onBuy): every other holder +funds now, ≤ max a round. */
function kickback(m, buyer, ev) {
  if (!ev || ev.kind !== 'item' || m.phase !== PHASE.PREP) return;
  const p = P('aug_kickback');
  for (const h of matesOf(m, buyer)) {
    if (!h.augments.includes('aug_kickback')) continue;
    const used = roundCount(m, h, 'aug6:kickback');
    if (used >= int(p.max, 2)) continue;
    const n = Math.max(0, int(p.funds, 1));
    if (!(n > 0)) continue;
    h.counters['aug6:kickback'] = used + 1;
    h.addFunds(n, { reason: KEY('aug_kickback') });
    m.teamGrudge(buyer, h, { taken: false }); // (the buyer pays nothing: no grudge — 2026-10-14)
    fx(m, 'kickback', buyer, h, { amount: n, item: ev.slot && ev.slot.id ? ev.slot.id : null });
    m.tickerText(msg('{a} 吃了 {b} 的回扣', { a: h.name, b: buyer.name }), 1);
    m.markPublic();
  }
}

/** I13 公摊 (the holder's level-up): each teammate with funds pays `funds` of the price to the holder (≤ the price). */
function splitBill(m, ps, ev) {
  let left = Math.max(0, int(ev && ev.price));
  const n = Math.max(0, int(P('aug_split_bill').funds, 1));
  if (!(left > 0) || !(n > 0)) return;
  let got = 0;
  for (const t of matesOf(m, ps)) {
    if (!(left > 0)) break;
    const paid = -t.addFunds(-Math.min(n + m.teamRevengeBonus(ps, t), left), { reason: KEY('aug_split_bill') });
    if (!(paid > 0)) continue;
    ps.addFunds(paid, { reason: KEY('aug_split_bill') });
    left -= paid;
    got += paid;
    m.teamGrudge(t, ps);
    fx(m, 'splitBill', t, ps, { amount: paid });
  }
  if (!(got > 0)) return;
  m.tickerText(msg('{name} 让大家公摊了升级费', { name: ps.name }), 1);
  m.markPublic();
}

/** The forwarded prep handlers: augment id → hook → (m, ps, ev). */
const FORWARDED = {
  aug_freeride: { onMerge: (m, ps, ev) => freerideMerge(m, ps, ev) },
  aug_kickback: { onBuy: (m, ps, ev) => kickback(m, ps, ev) },
  aug_snatch: { onBuy: (m, ps, ev) => snatchBought(m, ps, ev), onPrepEnd: (m, ps) => snatchClear(m, ps) },
  aug_split_bill: { onLevelUp: (m, ps, ev) => splitBill(m, ps, ev) },
};

SERVER.call = (ctx, id, hook, ev) => {
  const m = ctx && LINKS.get(ctx.rng);
  const ps = m ? m.players.get(ctx.playerId) : null;
  const fn = FORWARDED[id] && FORWARDED[id][hook];
  if (!ps || !fn) return;
  // one event, once: a player carrying two EffectRefs of the key (its own and a watcher) dispatches it twice
  if (ev && typeof ev === 'object') {
    const seen = `_aug6g11:${id}:${hook}`;
    if (ev[seen]) return;
    ev[seen] = true;
  }
  try { fn(m, ps, ev); } catch (e) { m.reportError(`augments5 g11 ${id}.${hook}`, e); }
};

// ---------------------------------------------------------------------------------------------------------------------
// takes (m.teamGrudge → onTake)

/** I10 连环计: one more take of the holder (counted until the multiplier reaches its cap). */
function schemeTake(ps) {
  const p = P('aug_scheme');
  const step = 1 + (Number(p.pct) || 0) / 100;
  const cap = (Number(p.max) || 0) / 100;
  const top = step > 1 && cap > 1 ? Math.ceil(Math.log(cap) / Math.log(step) - 1e-9) : 0;
  const n = int(ps.counters['aug6:scheme:n']);
  if (n >= top) return;
  ps.counters['aug6:scheme:n'] = n + 1;
  showCounter(ps, 'aug_scheme', n + 1);
}

/** I11 以牙还牙: the victim takes `funds` from the taker — at once while funds can be spent, else at the next round start. */
function titForTat(m, victim, taker) {
  const p = P('aug_tit_for_tat');
  const used = roundCount(m, victim, 'aug6:tft');
  if (used >= Math.max(0, int(p.max, 1))) return;
  const n = Math.max(0, int(p.funds, 1));
  if (!(n > 0)) return;
  victim.counters['aug6:tft'] = used + 1;
  if (SPEND_PHASES.has(m.phase) && taker.funds >= 1) {
    const got = -taker.addFunds(-Math.min(n, taker.funds), { reason: KEY('aug_tit_for_tat') });
    if (!(got > 0)) return;
    victim.addFunds(got, { reason: KEY('aug_tit_for_tat') });
    fx(m, 'titForTat', taker, victim, { amount: got });
    m.tickerText(msg('{a} 以牙还牙：从 {b} 那里拿回 {n} 资金', { a: victim.name, b: taker.name, n: got }), 1);
    m.markPublic();
    return;
  }
  state(m).dues.push({ from: taker.playerId, to: victim.playerId, amount: n });
}

// ---------------------------------------------------------------------------------------------------------------------

export const MATCH = Object.freeze({
  lpCap(m, ps, cap) {
    link(m);
    let c = cap;
    if (ps && ps.augments.includes('aug_cursed_crown')) c += Math.max(0, int(P('aug_cursed_crown').cap, 3));
    const g = ps ? trigramOf(m, ps) : null;
    if (g && g.gua === 'gen' && ps.augments.includes('aug_hexagram')) c = Math.min(c, Math.max(1, int(P('aug_hexagram').lp, 3)));
    return c;
  },

  onPick(m, ps, id) {
    link(m);
    switch (id) {
      case 'aug_freeride': dropWatcher(ps, id); freerideBind(m, ps); ensureWatchers(m); break;
      case 'aug_kickback': dropWatcher(ps, id); ensureWatchers(m); break;
      case 'aug_cuckoo': cuckoo(m, ps); break;
      case 'aug_usurp': usurp(m, ps); break;
      // this round's extra slot right away (the prep follows the pick)
      case 'aug_snatch': snatchSlot(m, ps); break;
      case 'aug_copycat': case 'aug_borrow': ps.counters[`aug6:${id}:from`] = m.round; break;
      case 'aug_gacha': showCounter(ps, id, Math.max(0, int(P(id).miss, 9)) + 1 - int(ps.counters['aug6:gacha:miss'])); break;
      case 'aug_scheme': showCounter(ps, id, int(ps.counters['aug6:scheme:n'])); break;
      default: break;
    }
  },

  roundStart(m) {
    link(m);
    const st = state(m);
    payDues(m, st);
    bloodPacts(m);
    loansAtStart(m, st);
    for (const ps of m.alivePlayers()) if (ps.augments.includes('aug_copycat')) copycat(m, ps);
    for (const ps of m.alivePlayers()) if (ps.augments.includes('aug_snatch')) snatchSlot(m, ps);
    tribute(m, st);
    for (const ps of m.alivePlayers()) if (ps.augments.includes('aug_equalize')) equalize(m, ps);
    agentsAtStart(m, st);
    ensureWatchers(m);
  },

  charges(m, charges) {
    link(m);
    const st = state(m);
    crownCharges(m, charges);
    // (the round's LP charges as billed, every batch's change included — 双面间谍 reads its target's)
    st.charged = new Map(charges);
    st.chargedRound = m.round;
  },

  afterCharges(m) {
    link(m);
    const st = state(m);
    agentsSettle(m, st);
    knifeSettle(m);
  },

  onTake(m, victim, taker, info) {
    link(m);
    if (taker && taker.augments.includes('aug_scheme')) schemeTake(taker);
    // (以牙还牙 answers a take: nothing to answer when the holder's gain was the game's — info.taken false)
    if (holds(victim, 'aug_tit_for_tat') && taker && taker.alive && !(info && info.taken === false)) titForTat(m, victim, taker);
  },

  /** 篡位: the captain's playerId when it voted for one of the options (its vote alone counts), else null. */
  voteCaptain(m, vote) {
    link(m);
    const cap = captainOf(m, state(m));
    const v = cap && vote && vote.votes ? vote.votes[cap.playerId] : null;
    return v != null && Array.isArray(vote.options) && vote.options.includes(v) ? cap.playerId : null;
  },

  /** 唱反调: a holder whose vote lost gets `funds` now (the AUGMENT phase: spent in the prep that follows). */
  voteSettled(m, vote, winner) {
    link(m);
    if (!vote || !vote.votes || winner == null) return;
    const n = Math.max(0, int(P('aug_contrarian').funds, 2));
    if (!(n > 0)) return;
    for (const ps of m.alivePlayers()) {
      if (!ps.augments.includes('aug_contrarian')) continue;
      const v = vote.votes[ps.playerId];
      if (v == null || v === winner || !(vote.options || []).includes(v)) continue;
      ps.addFunds(n, { reason: KEY('aug_contrarian') });
      fx(m, 'contrarian', null, ps, { amount: n });
      m.tickerText(msg('{name} 唱反调，赚了 {n} 资金', { name: ps.name, n }), 1);
    }
  },

  action: {
    /** 限定寻访 (see the header). */
    aug_gacha(m, ps, def) {
      link(m);
      return gacha(m, ps, def);
    },
  },
});
