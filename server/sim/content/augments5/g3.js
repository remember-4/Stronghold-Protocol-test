// server/sim/content/augments5/g3.js — A6000 fork, 海克斯第五版 (单人节目效果（O1–O10、O12、O13、O15–O18）): the effects of
// shared/augments5/g3.js. server/sim/content/augments.js calls `install` for every augment a battle player holds (true =
// handled here) and merges `META` (augment id → prep-side handler factory, as its own META).
//
// Battle side (install):
//   aug_giant            at the build — before the start's deployment, so its spawn's UnitInfo carries it — the player's
//                        highest-tier operator (ties: the higher ATK, then the lower id; never 俄罗斯轮盘's shot one) gets
//                        `unit.scale` (sim snapshot.js unitInfo `scale`: render/units.js draws its model that much
//                        bigger) and a match-long buff: hpMul, atkMul, blockCnt +block, intervalMul 1 + interval %
//   aug_shadow_clone     `delay` s in: the player's field operator with the highest ATK that attacks normally (no healer,
//                        no 仅技能攻击) calls `n` shadow clones onto free tiles around it (its own deploy class first, then
//                        the other; content/tokens.js findSummonTile 'adjacent') — tokens of an inline def copied from it
//                        like a 流形 copy (tokens.js applyManifoldCopy): pct % of its current max HP and ATK, its DEF /
//                        RES / interval / block / range / damage type and its model (defId: its chess id, so the client
//                        draws it and a client result names it), no skill, no sub-profession trait (the profession's
//                        plain attack); they leave after `sec` s
//   aug_meteor           every `every` s (a meteor that finds no enemy falls at the first moment one is there): the
//                        enemy with the most enemies within `radius` (ties: the nearest its goal, then the oldest) — every
//                        selectable enemy within `radius` of it takes pct % of the player's highest field ATK as arts
//                        damage (that operator's, no dodge) and a `stun` s stun (not a leader); fx 'airstrike'
//   aug_time_stop        the first time an enemy stands within `dist` tiles of a protection point (the field's 'end'
//                        tiles): every enemy — leaders included, immunities and 抵抗 aside (a plain buff: 冻结's flags
//                        without its RES cut) — stops for `sec` s, and one that spawns meanwhile for the rest of it; they
//                        still take damage. fx 'frostNova' over the whole field (r ≥ 12: the client's screen tint),
//                        pulsing while it lasts
//   aug_art_blast        an own operator knocked out ('killed'): every selectable enemy within `radius` takes pct % of its
//                        max HP as physical damage (无来源 credited to it: none of its multipliers; a leader half); fx
//                        'explosion'
//   aug_chain_lightning  every n-th attack of an operator that has an enemy target: a bolt from it to that target (or, the
//                        target down already, the enemy nearest where it stood), then on to the nearest enemy not hit yet
//                        within BOLT_HOP tiles — `jumps` enemies, pct % of the operator's ATK each as arts damage; fx
//                        'lightning' per hop
//   aug_roulette         the prep end's spin (EffectRef data { round, shot }): the shot board operator never deploys this
//                        round (`deferDeploy`: Battle.start skips it, no redeploy timer runs); else every operator
//                        augDealtMul dealt %
//   aug_fate_dice        the prep end's roll (data { round, roll }): augDealtMul low / mid / high %; a 6 also stuns every
//                        enemy on the field `stun` s the first moment there is one (immunities and 抵抗 as usual)
//   aug_avenger          an own operator knocked out: the other field operator with the highest ATK that deals damage —
//                        its next attack's damage instances (one attackId: every target, splash) take augMul × pct %
//   aug_six_stars        while the player's field operators count every tier 1–6: each of them augDealtMul dealt % and
//                        spRecoveryMul 1 + sp % (kept up every POS_PERIOD s, as 铁三角)
//   aug_sneak_attack     the Final Assault (kind 'boss'): the first leader to spawn loses pct % of its HP bar (the shared
//                        pool's max) — a 流失 credited to the player's highest-ATK operator (无来源: no multiplier, no hit
//                        hook), past the 限伤 (noHitLimit)
//   aug_lucky_cat        an enemy the player's units knock out: prob % for 1 coin (Battle.addCoins — the bounty path:
//                        result coins → the settle's pending funds), at most battleCoins a battle; never in a 联防 (the
//                        cap is a round's: the round's own battle is where they drop)
//   aug_last_light       the match side's restore (server/match/augments5/g3.js: data { from, to }): the battles of those
//                        rounds, every operator augDealtMul dealt %
//   aug_taunt_master     the player's field operator with the most max HP at the start (ties: the lower id) — the first
//                        time an enemy comes within TAUNT_NEAR tiles of it: taunt +TAUNT_LEVEL and dmgTakenMul
//                        (1 − taken %) for `sec` s
// Prep side (META): 俄罗斯轮盘 / 命运骰子 at onPrepEnd (ctx.rng = the match's meta stream; the data for the battles, a
// ticker line; the dice's roll also as its EffectRef counter, the number on its icon), 彩票站 at onRoundStart,
// 双倍或归零's income (onIncome; the bet and its result are the match's: server/match/augments5/g3.js), 偷袭's ticker
// line (onBattleStart of the Final Assault).

import { num, isOp, playerOps, passiveBuff, fxOn, tierOf } from '../support/index.js';
import { findSummonTile } from '../tokens.js';
import { msg, dn } from '../../../../shared/i18n.js';
// 海克斯第六版 幸运 (shared/luck.js): 俄罗斯轮盘's shot a bad outcome, 命运骰子 a die, 彩票站's prizes and 招财猫's coin good
// outcomes — a player without luck draws exactly as before
import { luckOf, luckOfRefs, goodChance, badChance, luckyDraw } from '../../../../shared/luck.js';

const KEY = (id) => `augment:${id}`;
const pct = (v) => num(v) / 100;
const cut = (v) => Math.max(0, 1 - pct(v));

/** Seconds between two reads of a condition kept up by a buff (六星连珠: operators move, die and redeploy). */
const POS_PERIOD = 0.25;
/** 连锁闪电: how far a bolt hops to the next enemy (tiles) [ASSUMED: a little over the 链术师's 1.7, so it reaches]. */
const BOLT_HOP = 2.5;
/** 嘲讽大师: an enemy this close (tiles) starts the taunt; the taunt level it adds (above the usual 0 / +1). */
const TAUNT_NEAR = 2;
const TAUNT_LEVEL = 2;
/** 时间停止: the screen tint's pulse (s) while the stop lasts; 艺术就是爆炸: a leader's share. */
const STOP_PULSE = 0.6;
const LEADER_HALF = 0.5;

/** The data of one of the player's augment EffectRefs (what the prep / match side decided), or null. */
function dataOf(ps, id) {
  const ref = (ps.playerEffects || []).find((r) => r && r.key === KEY(id));
  return ref && ref.data && typeof ref.data === 'object' ? ref.data : null;
}

/** The player's operators on the field (alive and deployed). */
const fieldOps = (battle, pid) => playerOps(battle, pid, { fieldOnly: true });

/** The unit of `list` with the highest current ATK (ties: the lower id), or null. */
function topAtk(list) {
  let best = null;
  for (const u of list) {
    const d = best ? u.s.atk - best.s.atk : 1;
    if (d > 1e-9 || (Math.abs(d) <= 1e-9 && u.id < best.id)) best = u;
  }
  return best;
}

/** Does `u`'s normal attack hit enemies (no healer, no 不攻击 / 仅技能攻击 profile)? */
const strikes = (u) => { const p = u && u.profile; return !!p && !p.noAttack && !p.noAttackUnlessSkill && p.dmgType !== 'heal' && p.dmgType !== 'none'; };
/** Does `u` deal damage with its attacks at all (a 仅技能攻击 one: while its skill runs)? */
const hurts = (u) => { const p = u && u.profile; return !!p && !p.noAttack && p.dmgType !== 'heal' && p.dmgType !== 'none'; };

/** 俄罗斯轮盘: the board uid of `ps`'s operator shot for this battle's round (it never deploys), or null. */
function shotUid(battle, ps) {
  const d = dataOf(ps, 'aug_roulette');
  return d && d.round === battle.round && d.shot != null ? d.shot : null;
}

/** `fn()` every `period` seconds of the battle (the first after one period). */
function every(battle, period, fn) {
  let acc = 0;
  battle.on('tick', ({ dt }) => {
    acc += dt ?? battle.dt;
    if (acc < period - 1e-9) return;
    acc = 0;
    fn();
  });
}

/** Every operator of the player: a match-long buff of `mods` under the augment's key. */
function allOps(battle, pid, id, mods, extra = {}) {
  for (const u of playerOps(battle, pid)) passiveBuff(battle, u, KEY(id), mods, extra);
}

// ---------------------------------------------------------------------------------------------------------------------
// battle side

/** O1 巨人化 (see the header). */
function giant(battle, ps, id, p) {
  const pid = ps.playerId;
  const shot = shotUid(battle, ps);
  let best = null;
  for (const u of playerOps(battle, pid)) {
    if (u.deferDeploy || (shot != null && u.uid === shot)) continue;
    if (!best) { best = u; continue; }
    const dt = tierOf(u) - tierOf(best), da = u.s.atk - best.s.atk;
    if (dt > 0 || (dt === 0 && (da > 1e-9 || (Math.abs(da) <= 1e-9 && u.id < best.id)))) best = u;
  }
  if (!best) return;
  const scale = num(p.scale, 160) / 100;
  if (scale > 0 && scale !== 1) best.scale = scale;
  passiveBuff(battle, best, KEY(id), {
    hpMul: pct(num(p.hp, 160)), atkMul: pct(num(p.atk, 130)), blockCnt: Math.round(num(p.block, 1)), intervalMul: 1 + pct(p.interval),
  });
  const g = best;
  battle.on('deploy', ({ unit, initial }) => { if (unit === g && initial) fxOn(battle, 'grow', g, KEY(id), id); });
}

/** O2 影分身: one shadow clone of `origin` on a free tile around it, or null. */
function spawnClone(battle, origin, share, life, key) {
  const ranged = origin.def?.position === 'RANGED';
  const tile = findSummonTile(battle, origin, 'adjacent', { melee: !ranged }) ?? findSummonTile(battle, origin, 'adjacent', { melee: ranged });
  if (!tile) return null;
  const s = origin.s, d = origin.def || {}, pr = origin.profile || {};
  // the attack as the origin makes it (its resolved profile); a projectile whose flight needs its branch's own handlers
  // (回环射手's boomerang, 阵法 / 轰击's instant beam, a healer's orb) becomes a plain bolt, as a 流形 copy's
  const shot = pr.attack === 'ranged' ? (pr.projectile && !['none', 'orb', 'beam', 'boomerang'].includes(pr.projectile) ? pr.projectile : 'bolt') : null;
  const def = {
    name: d.name ?? origin.name, tier: d.tier ?? 1, profession: d.profession, position: d.position,
    stats: {
      maxHp: Math.max(1, s.maxHp * share), atk: s.atk * share, def: s.def, res: s.res, aspd: 100, bat: s.interval,
      blockCnt: s.blockCnt, cost: 0, respawnTime: 0, spRecovery: 0, tauntLevel: 0, massLevel: num(origin.base?.massLevel, 0),
    },
    rangeGrid: origin.rangeGrid, dmgType: pr.dmgType, attackKind: pr.attack, projectile: shot, canHitFly: !!pr.canHitFly,
    targetPriority: d.targetPriority, spine: d.spine, avatar: d.avatar,
  };
  const c = battle.spawnToken(origin, origin.defId, tile[0], tile[1], { def, kit: {}, duration: life, dir: origin.dir });
  if (!c) return null;
  c.mem.isClone = true;
  c.mem.shadowOf = origin.id;
  battle.fx('copy', { x: c.x, y: c.y, id: c.id, from: origin.id, src: key });
  return c;
}

function shadowClone(battle, ps, id, p) {
  const pid = ps.playerId;
  const n = Math.max(0, Math.round(num(p.n, 2))), share = pct(num(p.pct, 30)), life = num(p.sec, 25);
  battle.after(Math.max(0, num(p.delay, 10)), () => {
    if (battle.finished) return;
    const origin = topAtk(fieldOps(battle, pid).filter(strikes));
    if (!origin) return;
    for (let i = 0; i < n; i++) if (!spawnClone(battle, origin, share, life, KEY(id))) break;
  });
}

/** O3 天降正义: the enemy with the most selectable enemies within `r` (ties: nearest its goal, then the oldest), or null. */
function densest(battle, r) {
  let best = null, bn = 0, bd = Infinity;
  for (const e of battle.enemies) {
    if (!e.alive || e.hidden) continue;
    const near = battle.foesInRadius(e.x, e.y, r, true);
    if (!near.includes(e)) continue; // itself not selectable (隐匿, 无法选中)
    const d = battle.remainingDistance(e);
    if (near.length > bn || (near.length === bn && (d < bd - 1e-9 || (Math.abs(d - bd) <= 1e-9 && e.spawnSeq < best.spawnSeq)))) {
      best = e; bn = near.length; bd = d;
    }
  }
  return best;
}

function meteor(battle, ps, id, p) {
  const pid = ps.playerId, key = KEY(id);
  const period = Math.max(1, num(p.every, 15)), r = num(p.radius, 1.5), share = pct(num(p.pct, 200)), stun = num(p.stun, 0.5);
  let acc = 0;
  battle.on('tick', ({ dt }) => {
    acc += dt ?? battle.dt;
    if (acc < period - 1e-9) return;
    const src = topAtk(fieldOps(battle, pid));
    const at = src ? densest(battle, r) : null;
    if (!at) return; // ready: it falls the first moment there are both an operator and an enemy
    acc = 0;
    const x = at.x, y = at.y;
    battle.fx('airstrike', { x, y, r, src: key });
    const amount = src.s.atk * share;
    for (const e of battle.foesInRadius(x, y, r)) {
      if (!e.alive) continue;
      battle.dealDamage(src, e, { amount, type: 'arts', canDodge: false, tags: [key] });
      if (stun > 0 && e.alive && !e.isBoss) battle.applyStatus(e, 'stun', { duration: stun, source: src });
    }
  });
}

/** O4 时间停止 (see the header). */
function timeStop(battle, ps, id, p) {
  const key = KEY(id);
  const dist = num(p.dist, 2), sec = num(p.sec, 3);
  const goals = battle.grid.specialTiles('end');
  if (!goals.length || !(sec > 0)) return;
  let until = null;
  const stop = (e, d) => battle.addBuff(e, { key: `${key}:freeze`, duration: d, refresh: 'extend', flags: { freeze: true, stun: true }, visible: true });
  const R = battle.rect;
  const pulse = () => battle.fx('frostNova', { x: (R.c0 + R.c1) / 2, y: (R.r0 + R.r1) / 2, r: 20, src: key });
  battle.on('tick', () => {
    if (until != null) return;
    const e = battle.enemies.find((x) => x.alive && !x.hidden && goals.some(([gr, gc]) => Math.hypot(x.x - gc, x.y - gr) <= dist + 1e-9));
    if (!e) return;
    until = battle.time + sec;
    for (const o of battle.enemies) if (o.alive) stop(o, sec);
    pulse();
    for (let t = STOP_PULSE; t < sec - 1e-9; t += STOP_PULSE) battle.after(t, pulse);
  });
  battle.on('enemySpawn', ({ enemy: e }) => {
    if (until == null || !e || !e.alive) return;
    const left = until - battle.time;
    if (left > 1e-6) stop(e, left);
  });
}

/** O5 艺术就是爆炸. */
function artBlast(battle, ps, id, p) {
  const pid = ps.playerId, key = KEY(id);
  const r = num(p.radius, 1.5), share = pct(num(p.pct, 30));
  battle.on('death', (c) => {
    const u = c.unit;
    if (!isOp(u) || u.ownerId !== pid || c.reason !== 'killed') return;
    const amount = u.s.maxHp * share;
    if (!(amount > 0)) return;
    battle.fx('explosion', { x: u.x, y: u.y, r, src: key });
    for (const e of battle.foesInRadius(u.x, u.y, r)) {
      if (!e.alive) continue;
      battle.dealDamage(u, e, { amount: amount * (e.isBoss ? LEADER_HALF : 1), type: 'phys', canDodge: false, sourceless: true, tags: [key] });
    }
  });
}

/** O6 连锁闪电: the nearest selectable enemy within `r` of (x, y) not in `hit` (ties: the oldest), or null. */
function nearestFoe(battle, x, y, r, hit) {
  let best = null, bd = Infinity;
  for (const e of battle.foesInRadius(x, y, r, true)) {
    if (!e.alive || hit.has(e)) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d < bd - 1e-9 || (Math.abs(d - bd) <= 1e-9 && best && e.spawnSeq < best.spawnSeq)) { best = e; bd = d; }
  }
  return best;
}

function chainLightning(battle, ps, id, p) {
  const pid = ps.playerId, key = KEY(id);
  const n = Math.max(1, Math.round(num(p.n, 5))), jumps = Math.max(1, Math.round(num(p.jumps, 3))), share = pct(num(p.pct, 50));
  battle.on('attack', ({ attacker: u, targets }) => {
    if (!isOp(u) || u.ownerId !== pid || !u.alive) return;
    const first = (targets || []).find((t) => t && t.side === 'enemy');
    if (!first) return;
    u.mem.augBolt = (u.mem.augBolt ?? 0) + 1;
    if (u.mem.augBolt % n) return;
    const amount = u.s.atk * share;
    const hit = new Set();
    let prev = u, x = first.x, y = first.y;
    for (let k = 0; k < jumps; k++) {
      const next = k === 0 && first.alive && !first.hidden ? first : nearestFoe(battle, x, y, BOLT_HOP, hit);
      if (!next) break;
      hit.add(next);
      battle.fx('lightning', { x: next.x, y: next.y, from: prev.id, to: next.id, src: key });
      x = next.x; y = next.y;
      battle.dealDamage(u, next, { amount, type: 'arts', tags: [key] });
      prev = next;
    }
  });
}

/** O7 俄罗斯轮盘 (battle side). */
function roulette(battle, ps, id, p) {
  const d = dataOf(ps, id);
  if (!d || d.round !== battle.round) return;
  if (d.shot != null) {
    const u = playerOps(battle, ps.playerId).find((x) => x.uid === d.shot);
    if (!u) return;
    u.deferDeploy = true;
    battle.on('battleStart', () => battle.fx('downed', { x: u.homeC, y: u.homeR, src: KEY(id) }));
    return;
  }
  allOps(battle, ps.playerId, id, { augDealtMul: pct(num(p.dealt, 115)) });
}

/** O8 命运骰子 (battle side). */
function fateDice(battle, ps, id, p) {
  const d = dataOf(ps, id);
  if (!d || d.round !== battle.round || !Number.isInteger(d.roll)) return;
  const roll = d.roll;
  const mul = roll <= 1 ? pct(num(p.low, 90)) : roll >= 6 ? pct(num(p.high, 125)) : pct(num(p.mid, 105));
  allOps(battle, ps.playerId, id, { augDealtMul: mul });
  const stun = num(p.stun, 1);
  if (roll < 6 || !(stun > 0)) return;
  let done = false;
  battle.on('tick', () => {
    if (done) return;
    const list = battle.enemies.filter((e) => e.alive && !e.hidden);
    if (!list.length) return;
    done = true;
    for (const e of list) if (e.alive) battle.applyStatus(e, 'stun', { duration: stun, source: null });
    const R = battle.rect;
    battle.fx('shockBlast', { x: (R.c0 + R.c1) / 2, y: (R.r0 + R.r1) / 2, r: 20, src: KEY(id) });
  });
}

/** O12 复仇者. */
function avenger(battle, ps, id, p) {
  const pid = ps.playerId, key = KEY(id);
  const mul = pct(num(p.pct, 200));
  battle.on('death', (c) => {
    const u = c.unit;
    if (!isOp(u) || u.ownerId !== pid || c.reason !== 'killed') return;
    const a = topAtk(fieldOps(battle, pid).filter((x) => x !== u && hurts(x)));
    if (!a) return;
    a.mem.augAvenge = true;
    fxOn(battle, 'bloodBattle', a, key, id);
  });
  battle.on('hit', (c) => {
    const s = c.source;
    if (!s || !s.mem || !c.dmg || !c.dmg.isAttack || !c.dmg.attackId || !isOp(s) || s.ownerId !== pid) return;
    if (s.mem.augAvenge) { s.mem.augAvenge = false; s.mem.augAvengeId = c.dmg.attackId; }
    if (s.mem.augAvengeId === c.dmg.attackId) c.dmg.augMul *= mul;
  });
}

/** O13 六星连珠. */
function sixStars(battle, ps, id, p) {
  const pid = ps.playerId, key = KEY(id);
  const mods = { augDealtMul: pct(num(p.dealt, 120)), spRecoveryMul: 1 + pct(num(p.sp, 20)) };
  let was = false;
  every(battle, POS_PERIOD, () => {
    const ops = fieldOps(battle, pid);
    const tiers = new Set(ops.map(tierOf));
    const on = [1, 2, 3, 4, 5, 6].every((t) => tiers.has(t));
    if (on) {
      for (const u of ops) battle.addBuff(u, { key, mods, duration: POS_PERIOD + 0.15, refresh: 'extend', visible: true });
      if (!was) for (const u of ops) fxOn(battle, 'bondMilestone', u, key, id);
    }
    was = on;
  });
}

/** O15 偷袭. */
function sneakAttack(battle, ps, id, p) {
  if (battle.kind !== 'boss') return;
  const pid = ps.playerId, key = KEY(id);
  const share = pct(num(p.pct, 2));
  let done = false;
  battle.on('enemySpawn', ({ enemy: e }) => {
    if (done || !e || !e.alive || !e.isBoss) return;
    done = true;
    const max = e.bossPool ? num(e.bossPool.maxHp, 0) : e.s.maxHp;
    const amount = max * share;
    if (!(amount > 0)) return;
    const src = topAtk(playerOps(battle, pid).filter((u) => u.alive));
    battle.loseHp(e, amount, { source: src, sourceless: true, noHitLimit: true, tags: [key] });
    fxOn(battle, 'crit', e, key, id);
  });
}

/** O16 招财猫. */
function luckyCat(battle, ps, id, p) {
  if (battle.kind === 'unite') return;
  const pid = ps.playerId, key = KEY(id);
  const prob = goodChance(pct(num(p.pct, 5)), luckOfRefs(ps.playerEffects, battle.flags.enemyBuffs)), cap = Math.max(0, Math.floor(num(p.battleCoins, 2)));
  let got = 0;
  battle.on('death', (c) => {
    const e = c.unit, k = c.killer;
    if (got >= cap || !e || e.side !== 'enemy' || c.reason !== 'killed' || !k || k.side !== 'ally' || k.ownerId !== pid) return;
    if (!(battle.rng() < prob)) return;
    if (battle.addCoins(pid, 1) > 0) {
      got++;
      battle.fx('coin', { x: e.x, y: e.y, src: key });
    }
  });
}

/** O17 回光返照 (battle side). */
function lastLight(battle, ps, id, p) {
  const d = dataOf(ps, id);
  if (!d || !(battle.round >= num(d.from, Infinity) && battle.round <= num(d.to, -Infinity))) return;
  allOps(battle, ps.playerId, id, { augDealtMul: pct(num(p.dealt, 120)) }, { visible: true });
}

/** O18 嘲讽大师. */
function tauntMaster(battle, ps, id, p) {
  const pid = ps.playerId, key = KEY(id);
  const sec = num(p.sec, 8), mods = { taunt: TAUNT_LEVEL, dmgTakenMul: cut(num(p.taken, 30)) };
  let who = null, started = false;
  battle.on('battleStart', () => {
    for (const u of fieldOps(battle, pid)) {
      const d = who ? u.s.maxHp - who.s.maxHp : 1;
      if (d > 1e-9 || (Math.abs(d) <= 1e-9 && u.id < who.id)) who = u;
    }
  });
  battle.on('tick', () => {
    if (started || !who || !who.alive || !who.deployed) return;
    if (!battle.enemies.some((e) => e.alive && !e.hidden && Math.hypot(e.x - who.x, e.y - who.y) <= TAUNT_NEAR + 1e-9)) return;
    started = true;
    battle.addBuff(who, { key: `${key}:taunt`, mods, duration: sec, refresh: 'replace', visible: true });
    fxOn(battle, 'taunt', who, key, id);
  });
}

const BATTLE = Object.freeze({
  aug_giant: giant,
  aug_shadow_clone: shadowClone,
  aug_meteor: meteor,
  aug_time_stop: timeStop,
  aug_art_blast: artBlast,
  aug_chain_lightning: chainLightning,
  aug_roulette: roulette,
  aug_fate_dice: fateDice,
  aug_avenger: avenger,
  aug_six_stars: sixStars,
  aug_sneak_attack: sneakAttack,
  aug_lucky_cat: luckyCat,
  aug_last_light: lastLight,
  aug_taunt_master: tauntMaster,
});
/** This batch's augments without a battle part (side 'meta': never in a battle's playerEffects). */
const PREP_ONLY = new Set(['aug_lottery', 'aug_double_or_nothing']);

/**
 * Battle side: install augment `id` (definition `def`) of player `ps` (the battle's player input) on `battle`.
 * @returns {boolean} whether this batch handles the id
 */
export function install(battle, ps, id, def) {
  const fn = BATTLE[id];
  if (!fn) return PREP_ONLY.has(id);
  fn(battle, ps, id, (def && def.params) || {});
  return true;
}

// ---------------------------------------------------------------------------------------------------------------------
// prep side

/** Prep side: augment id → (params) => handler object (onRoundStart, onBuy, onSpend, onPrepEnd, …). */
export const META = Object.freeze({
  // O7 俄罗斯轮盘: the spin of this round's battles (data { round, shot }: a board uid, or null)
  aug_roulette: (p) => ({
    onPrepEnd(ctx) {
      const ref = ctx.effect(KEY('aug_roulette'));
      if (!ref) return;
      const odds = Math.max(2, Math.round(num(p.odds, 6)));
      const ops = ctx.board().filter((v) => v && v.kind === 'chess');
      const x = ctx.rng();
      if (x < badChance(1 / odds, luckOf(ctx.augments(), ctx.enemyBuffs?.())) && ops.length) {
        const v = ctx.rng.pick(ops);
        ref.data = { round: ctx.round, shot: v.uid };
        ctx.ticker(msg('俄罗斯轮盘：{name} 的 {chess} 中弹了，本回合无法部署', { name: ctx.name, chess: dn(ctx.chessRecord(v.id)?.name || '') }));
      } else {
        ref.data = { round: ctx.round, shot: null };
        ctx.ticker(msg('俄罗斯轮盘：{name} 平安无事', { name: ctx.name }));
      }
    },
  }),
  // O8 命运骰子: the roll of this round's battles (data { round, roll })
  aug_fate_dice: () => ({
    onPrepEnd(ctx) {
      const ref = ctx.effect(KEY('aug_fate_dice'));
      if (!ref) return;
      // (幸运: the better of two rolls — luckyDraw draws once without luck)
      const roll = luckyDraw(ctx.rng, () => 1 + Math.min(5, Math.floor(ctx.rng() * 6)), luckOf(ctx.augments(), ctx.enemyBuffs?.()));
      ref.data = { round: ctx.round, roll };
      // the roll on the augment's icon in the effects column (its counter: ui/effectsList.js)
      ctx.setEffectCounter(KEY('aug_fate_dice'), roll);
      // (one whole msgid per outcome: a message param cannot be a message — shared/i18n.js cleanParam)
      if (roll === 1) ctx.ticker(msg('命运骰子：{name} 掷出了 1 点，本回合伤害降低', { name: ctx.name }));
      else if (roll === 6) ctx.ticker(msg('命运骰子：{name} 掷出了 6 点！本回合伤害大幅提升', { name: ctx.name }));
      else ctx.ticker(msg('命运骰子：{name} 掷出了 {n} 点', { name: ctx.name, n: roll }));
    },
  }),
  // O9 彩票站: a ticket a round start when the funds allow it (the jackpot once a match; −EV: no funds loop)
  aug_lottery: (p) => ({
    onRoundStart(ctx) {
      const cost = Math.max(1, Math.round(num(p.cost, 1)));
      if (ctx.funds() < cost) return;
      ctx.addFunds(-cost, 'augment:aug_lottery');
      const x = ctx.rng();
      const luck = luckOf(ctx.augments(), ctx.enemyBuffs?.());
      const big = goodChance(pct(num(p.jackpotPct, 1)), luck), small = goodChance(pct(num(p.prizePct, 10)), luck);
      if (x < big && !(ctx.counter('aug:lottery:jackpot') > 0)) {
        const n = Math.max(0, Math.round(num(p.jackpot, 25)));
        ctx.setCounter('aug:lottery:jackpot', ctx.round);
        ctx.addFunds(n, 'augment:aug_lottery');
        ctx.ticker(msg('彩票站：{name} 中了头奖，获得 {n} 资金！', { name: ctx.name, n }));
      } else if (x >= big && x < big + small) {
        const n = Math.max(0, Math.round(num(p.prize, 4)));
        ctx.addFunds(n, 'augment:aug_lottery');
        ctx.ticker(msg('彩票站：{name} 中奖了，获得 {n} 资金', { name: ctx.name, n }));
      } else {
        ctx.toast(msg('彩票站：没有中奖'));
      }
    },
  }),
  // O10 双倍或归零: the income of the round after a bet (the match side keeps 'aug:double:round' / 'aug:double:win')
  aug_double_or_nothing: (p) => ({
    onIncome(ctx, ev) {
      if (!ev || !Number.isFinite(ev.income) || ctx.counter('aug:double:round') !== ev.round) return;
      ev.income = ctx.counter('aug:double:win') > 0 ? Math.max(0, Math.trunc(ev.income * Math.max(1, num(p.mul, 2)))) : 0;
    },
  }),
  // O15 偷袭: the Final Assault's ticker line (the damage: the battle side)
  aug_sneak_attack: () => ({
    onBattleStart(ctx, ev) {
      if (!ev || ev.kind !== 'boss' || ev.preview) return;
      ctx.ticker(msg('{name} 偷袭了领袖', { name: ctx.name }));
    },
  }),
});
