// server/sim/content/augments5/g9.js — A6000 fork, 海克斯第六版 (战斗：伤害与条件（F1–F20）): the effects of
// shared/augments5/g9.js. server/sim/content/augments.js calls `install` for every augment a battle player holds (true =
// handled here) and merges `META` (augment id → prep-side handler factory, as its own META).
//
// Battle side. Number bonuses are the independent multipliers of content/augments.js — a unit's augDealtMul / a hit's
// augMul (damage.js applies them with 限伤保护), dmgTakenMul, intervalMul, spRecoveryMul. "所有干员" = the player's
// operators (playerOps: a redeploy keeps the passive buffs); "你的伤害" = damage whose source is one of the player's units
// (its summons included); "你战场上的敌人" = the enemies of the player's own half (`ownerId`, as 贪婪's).
//   aug_opening       every operator ×dealt until the battle's `sec`-th second
//   aug_comeback      the prep end's LP count (EffectRef data { round, lost }: LP under the strategy's starting LP) → every
//                     operator ×(1 + pct)^lost, at most ×cap
//   aug_banana        every operator ×dealt; the match's settlement roll (server/match/augments5/g9.js: EffectRef data
//                     { state: 'eaten' | 'cavendish' }) → nothing / ×cavendish
//   aug_misprint      at the build, one draw of the battle's own rng (幸运: luckyDraw) → every operator ×(low…high)
//   aug_star_of_day   at the battle start, one of the player's board operators that deal damage (not the 俄罗斯轮盘 shot
//                     one; board order) — picked by the prep end's roll (data { round, roll }), the same in every battle
//                     of the round — gets ×dealt and −taken for the battle; each enemy it knocks out drops a coin at pct %
//                     (幸运: goodChance; Battle.addCoins, at most battleCoins a battle, none in a 联防 — 招财猫's way)
//   aug_glass_heart   every operator ×dealt until the first knock-out of one of them in the battle (reason 'killed')
//   aug_sword_hammer  every operator ×dealt and −taken; the deployment cost (base.cost, paid by redeploys) +cost
//   aug_shaped_glass  every operator ×dealt, max HP ×(1 − hp)
//   aug_silence       an enemy of the player's half spawning, not a leader (nor a part of its pool): max HP ×(1 − pct)
//   aug_exploit       the player's hits on an enemy held by 晕眩 / 冻结 / 沉睡 / 束缚 (not 浮空 alone) ×(1 + pct)
//   aug_executioner   the player's hits on an enemy under `below` % of its HP (a pooled leader: the pool's) ×pct
//   aug_giant_slayer  the player's hits on an 精英 (rank ELITE) or leader enemy (rank BOSS, isBoss, a part of its pool) ×pct
//   aug_corrosion     each hit of the player's units that lands on an enemy (no 流失, no element 损伤, no DoT tick): one
//                     stack more, its DEF and RES ×(1 − pct·stacks) (defMul / resMul: independent of the other cuts), at
//                     most max / pct stacks — boss / pct on a leader; for the battle
//   aug_double_shot   each attack of a ranged-position operator on an enemy (one per attack, whatever its hits or targets;
//                     never a heal): another enemy of its range (not a target of the attack; its own targeting order)
//                     takes pct % of the attack's raw damage (ATK × the profile's atkScale × the skill's damage multiplier),
//                     its damage type, through a projectile like the attack's; fx 'volley' draws the shot
//   aug_frenzy        the battle's every `every`-th second: every operator's interval ×(1 − pct·k), at most −max
//   aug_pulse         the battle's t1-th, t2-th, t3-th second: every enemy of the player's half stunned `sec` s (a leader
//                     `boss` s; immunities and 抵抗 as usual); fx 'shockBlast' over the field
//   aug_war_machine   every operator ×dealt, −taken, interval −interval, SP recovery +sp
//   aug_verticality   at the battle start, each operator ×(1 + pct·n), n = the other operators of the board (the 俄罗斯轮盘
//                     shot one aside) that share a bond with it (变形同构体's and 调和's membership included), ≤ ×cap
//   aug_skyfire       every `every` s (one that finds no operator or no enemy falls the first moment there are both):
//                     every selectable enemy of the player's half takes pct % of the player's highest field ATK as arts
//                     damage (that operator's, no dodge; a leader half); fx 'scorchBurst' on each
//   aug_urf           快节奏's skill tempo (g2.js skillTempo: SP cost ×(1 − cost), each activation ×(1 − dur)) and every
//                     operator's interval −interval
// Prep side (META): 绝地反击 (the LP count: the battle's data, the bonus % as the EffectRef counter), 今日之星 (the round's
// roll at the prep end). 香蕉's roll: server/match/augments5/g9.js.

import { num, isOp, playerOps, passiveBuff, fxOn, unitBonds, isMember } from '../support/index.js';
import { luckOfRefs, goodChance, luckyDraw } from '../../../../shared/luck.js';
import { enemyStealthed, sortEnemyTargets } from '../../targeting.js';
import { isHpLoss } from '../../damage.js';
import { PROJECTILE_SPEEDS, PROJECTILE_SPEED } from '../../constants.js';
import { skillTempo } from './g2.js';

const KEY = (id) => `augment:${id}`;
const pct = (v) => num(v) / 100;
const cut = (v) => Math.max(0, 1 - pct(v));
const faster = (v) => Math.max(0.1, 1 - pct(v));

/** 天火: a leader's share of the damage. */
const LEADER_HALF = 0.5;
/** 香蕉's states (EffectRef data.state, written by the match's settlement roll). */
export const BANANA = Object.freeze({ EATEN: 'eaten', CAVENDISH: 'cavendish' });

function refOf(ps, id) { return (ps.playerEffects || []).find((r) => r && r.key === KEY(id)) || null; }
/** The data of one of the player's augment EffectRefs (what the prep / match side decided), or null. */
function dataOf(ps, id) { const r = refOf(ps, id); return r && r.data && typeof r.data === 'object' ? r.data : null; }

/** The player's operators on the field (alive and deployed). */
const fieldOps = (battle, pid) => playerOps(battle, pid, { fieldOnly: true });
/** A unit of player `pid` (an operator or one of its summons). */
const mine = (u, pid) => !!u && u.side === 'ally' && u.ownerId === pid;
/** A leader, or a part feeding a leader's pool. */
const leaderLike = (e) => !!e && (e.isBoss || !!e.bossPool);
const rankOf = (e) => String(e?.def?.rank ?? e?.def?.raw?.rank ?? 'NORMAL').toUpperCase();
/** The HP share left of an enemy (a pooled leader: its pool's). */
function hpShare(e) {
  const pool = e.bossPool;
  if (pool && pool.maxHp > 0) return Math.max(0, num(pool.hp, 0)) / pool.maxHp;
  const max = e.s.maxHp;
  return max > 0 ? e.hp / max : 0;
}
/** An area effect may select it (Battle.foesInRadius' rule: no untargetable one, no unrevealed 隐匿 one). */
const selectable = (e) => !e.s.flags.untargetable && !(e.s.flags.stealth && enemyStealthed(e));

/** Does `u` deal damage with its attacks at all (a 仅技能攻击 one: while its skill runs)? (g3.js `hurts`) */
const hurts = (u) => { const p = u && u.profile; return !!p && !p.noAttack && p.dmgType !== 'heal' && p.dmgType !== 'none'; };

/** The unit of `list` with the highest current ATK (ties: the lower id), or null. */
function topAtk(list) {
  let best = null;
  for (const u of list) {
    const d = best ? u.s.atk - best.s.atk : 1;
    if (d > 1e-9 || (Math.abs(d) <= 1e-9 && u.id < best.id)) best = u;
  }
  return best;
}

/**
 * Held by 晕眩 / 冻结 / 沉睡 / 束缚: the aggregated `stun` flag also stands for 浮空 (units.js), so a 浮空 enemy counts only
 * with a stun of another source on it.
 */
function controlled(e) {
  const f = e.s.flags;
  if (f.freeze || f.sleep || f.bind) return true;
  if (!f.stun) return false;
  if (!f.levitate) return true;
  return e.buffs.some((b) => b.flags && b.flags.stun && !b.flags.levitate);
}

/** Do operators `a` and `b` share a bond (an own one, 变形同构体's, or a core bond 调和 lets one of them enjoy)? */
const shareBond = (battle, a, b) => unitBonds(a).some((x) => isMember(battle, b, x)) || unitBonds(b).some((x) => isMember(battle, a, x));

/** Every operator of the player (dead ones too: a redeploy keeps it) gets the match-long buff `mods` under `key`. */
function allOps(battle, pid, key, mods, extra = {}) {
  for (const u of playerOps(battle, pid)) passiveBuff(battle, u, key, mods, extra);
}

/** 绝地反击's multiplier for `lost` LP (shared by the battle and the prep side's counter). */
export function comebackMul(p, lost) {
  const n = Math.max(0, Math.floor(num(lost, 0)));
  return Math.min(Math.max(1, pct(p.cap)), Math.pow(1 + pct(p.pct), n));
}

// =====================================================================================================================
// battle side

/** Battle installs: (battle, ps, params, key, id). */
const BATTLE = {
  // F1 开局冲锋
  aug_opening(battle, ps, p, key) {
    const pid = ps.playerId, until = num(p.sec, 20);
    allOps(battle, pid, key, { augDealtMul: pct(p.dealt) }, { visible: true });
    const h = battle.on('tick', () => {
      if (battle.time < until - 1e-9) return;
      battle.off(h);
      for (const u of playerOps(battle, pid)) battle.removeBuff(u, key);
    });
  },

  // F2 绝地反击 (the prep end's count)
  aug_comeback(battle, ps, p, key, id) {
    const d = dataOf(ps, id);
    if (!d || d.round !== battle.round) return;
    const mul = comebackMul(p, d.lost);
    if (mul > 1) allOps(battle, ps.playerId, key, { augDealtMul: mul }, { visible: true });
  },

  // F3 香蕉 (the settlement's roll)
  aug_banana(battle, ps, p, key, id) {
    const st = dataOf(ps, id)?.state;
    if (st === BANANA.EATEN) return;
    allOps(battle, ps.playerId, key, { augDealtMul: pct(st === BANANA.CAVENDISH ? p.cavendish : p.dealt) });
  },

  // F4 乱码: one draw of the battle's own stream (the client's battle draws the same), a lucky player's better of two
  aug_misprint(battle, ps, p, key) {
    const x = luckyDraw(battle.rng, () => battle.rng(), luckOfRefs(ps.playerEffects, battle.flags.enemyBuffs));
    const lo = pct(p.low), hi = pct(p.high);
    const mul = lo + (hi - lo) * Math.max(0, Math.min(1, x));
    allOps(battle, ps.playerId, key, { augDealtMul: mul }, { visible: true, data: { mul } });
  },

  // F5 今日之星
  aug_star_of_day(battle, ps, p, key, id) {
    const pid = ps.playerId;
    const d = dataOf(ps, id);
    const roll = d && d.round === battle.round && Number.isFinite(d.roll) ? d.roll : null;
    let star = null;
    battle.on('battleStart', () => {
      // the board's operators that deal damage, in board order: the same list in every battle of the round, so the
      // round's roll names the same one (one knocked out at the start of a 联防 is still the star when it comes back)
      const list = playerOps(battle, pid).filter((u) => !u.deferDeploy && hurts(u));
      if (!list.length) return;
      const x = roll ?? battle.rng();
      star = list[Math.min(list.length - 1, Math.floor(Math.max(0, x) * list.length))];
      passiveBuff(battle, star, key, { augDealtMul: pct(p.dealt), dmgTakenMul: cut(p.taken) }, { visible: true });
      if (star.alive && star.deployed) fxOn(battle, 'bondMilestone', star, key, id);
    });
    if (battle.kind === 'unite') return;
    const prob = goodChance(pct(p.pct), luckOfRefs(ps.playerEffects, battle.flags.enemyBuffs));
    const cap = Math.max(0, Math.floor(num(p.battleCoins, 2)));
    let got = 0;
    battle.on('death', (c) => {
      const e = c.unit;
      if (!star || got >= cap || !e || e.side !== 'enemy' || c.reason !== 'killed' || c.killer !== star) return;
      if (!(battle.rng() < prob)) return;
      if (battle.addCoins(pid, 1) > 0) {
        got++;
        battle.fx('coin', { x: e.x, y: e.y, src: key });
      }
    });
  },

  // F6 玻璃心
  aug_glass_heart(battle, ps, p, key, id) {
    const pid = ps.playerId;
    allOps(battle, pid, key, { augDealtMul: pct(p.dealt) }, { visible: true });
    let broken = false;
    battle.on('death', (c) => {
      const u = c.unit;
      if (broken || !isOp(u) || u.ownerId !== pid || c.reason !== 'killed') return;
      broken = true;
      for (const v of playerOps(battle, pid)) battle.removeBuff(v, key);
      fxOn(battle, 'shieldBreak', u, key, id);
    });
  },

  // F7 剑锤: the cost at the build (a strategy's own cut — 大帝 II at the battle start — then applies to it)
  aug_sword_hammer(battle, ps, p, key) {
    const add = Math.max(0, Math.round(num(p.cost, 3)));
    for (const u of playerOps(battle, ps.playerId)) {
      passiveBuff(battle, u, key, { augDealtMul: pct(p.dealt), dmgTakenMul: cut(p.taken) });
      if (add > 0) u.base.cost = Math.max(0, num(u.base.cost, 0) + add);
    }
  },

  // F8 珍贵的玻璃
  aug_shaped_glass(battle, ps, p, key) {
    allOps(battle, ps.playerId, key, { augDealtMul: pct(p.dealt), hpMul: cut(p.hp) });
  },

  // F9 大静谧
  aug_silence(battle, ps, p, key) {
    const pid = ps.playerId, mul = cut(p.pct);
    battle.on('enemySpawn', ({ enemy: e }) => {
      if (!e || !e.alive || leaderLike(e) || e.ownerId !== pid) return;
      battle.addBuff(e, { key, mods: { hpMul: mul }, persist: true });
    });
  },

  // F10 趁虚而入
  aug_exploit(battle, ps, p) {
    const pid = ps.playerId, mul = 1 + pct(p.pct);
    battle.on('hit', (c) => {
      const t = c.target;
      if (c.dmg && mine(c.source, pid) && t && t.side === 'enemy' && controlled(t)) c.dmg.augMul *= mul;
    });
  },

  // F11 处刑人
  aug_executioner(battle, ps, p) {
    const pid = ps.playerId, below = pct(p.below), mul = pct(p.pct);
    battle.on('hit', (c) => {
      const t = c.target;
      if (c.dmg && mine(c.source, pid) && t && t.side === 'enemy' && hpShare(t) < below) c.dmg.augMul *= mul;
    });
  },

  // F12 巨人杀手
  aug_giant_slayer(battle, ps, p) {
    const pid = ps.playerId, mul = pct(p.pct);
    battle.on('hit', (c) => {
      const t = c.target;
      if (!c.dmg || !mine(c.source, pid) || !t || t.side !== 'enemy') return;
      const r = rankOf(t);
      if (leaderLike(t) || r === 'ELITE' || r === 'BOSS') c.dmg.augMul *= mul;
    });
  },

  // F13 腐蚀: the stacks live on the enemy's buff (one buff per enemy whoever adds it: the cap holds for a shared field)
  aug_corrosion(battle, ps, p, key) {
    const pid = ps.playerId, step = pct(p.pct);
    const per = Math.max(1e-9, num(p.pct, 1.5));
    const top = Math.max(0, Math.floor(num(p.max, 30) / per + 1e-9)), lead = Math.max(0, Math.floor(num(p.boss, 15) / per + 1e-9));
    battle.on('damaged', (c) => {
      const e = c.target, d = c.dmg;
      if (!e || e.side !== 'enemy' || !e.alive || !mine(c.source, pid) || !d || c.type === 'element' || isHpLoss(d)) return;
      if (Array.isArray(d.tags) && d.tags.includes('dot')) return;
      const cap = leaderLike(e) ? lead : top;
      const b = e.findBuff(key);
      const had = b ? num(b.data && b.data.n, 0) : 0;
      if (had >= cap) return;
      const n = had + 1;
      const m = Math.max(0, 1 - step * n);
      battle.addBuff(e, { key, mods: { defMul: m, resMul: m }, persist: true, refresh: 'replace', visible: true, data: { n } });
    });
  },

  // F14 双发
  aug_double_shot(battle, ps, p, key) {
    const pid = ps.playerId, share = pct(p.pct);
    battle.on('attack', ({ attacker: u, targets }) => {
      if (!isOp(u) || u.ownerId !== pid || !u.alive || !u.deployed || u.def?.position !== 'RANGED') return;
      const list = Array.isArray(targets) ? targets : [];
      if (!list.some((t) => t && t.side === 'enemy')) return;
      const prof = battle.effectiveProfile(u);
      if (!prof || prof.noAttack || (prof.heal && prof.dmgType === 'heal')) return;
      const type = prof.dmgType || 'phys';
      if (type !== 'phys' && type !== 'arts' && type !== 'true') return;
      const cands = battle.enemiesInKeys(u.rangeKeys, u, prof).filter((e) => !list.includes(e));
      if (!cands.length) return;
      sortEnemyTargets(battle, u, cands, prof.priority);
      const t = cands[0];
      const scale = num(prof.atkScale, 1) * num(u.s.atkScaleMul, 1) * num(prof.skillDmgMul, 1);
      const amount = u.s.atk * scale * share;
      if (!(amount > 0)) return;
      battle.fx('volley', { x: t.x, y: t.y, id: u.id, targets: [t.id] });
      const hit = (target) => battle.dealDamage(u, target, { amount, type, tags: [key] });
      const proj = prof.projectile;
      if (prof.attack === 'ranged' && proj && proj !== 'none' && proj !== 'beam') {
        battle.addProjectile({ from: u, target: t, speed: PROJECTILE_SPEEDS[proj] ?? PROJECTILE_SPEED, visual: proj, source: u, onHit: (c) => { if (c.target) hit(c.target); } });
      } else {
        hit(t);
      }
    });
  },

  // F15 狂热
  aug_frenzy(battle, ps, p, key) {
    const pid = ps.playerId, every = Math.max(0.1, num(p.every, 5)), step = pct(p.pct);
    const most = Math.max(0, Math.floor(num(p.max, 30) / Math.max(1e-9, num(p.pct, 3)) + 1e-9));
    let k = 0;
    battle.on('tick', () => {
      if (k >= most) return;
      const n = Math.min(most, Math.floor(battle.time / every + 1e-9));
      if (n <= k) return;
      k = n;
      allOps(battle, pid, key, { intervalMul: Math.max(0.1, 1 - step * k) }, { visible: true, data: { n: k } });
    });
  },

  // F16 定时震荡
  aug_pulse(battle, ps, p, key) {
    const pid = ps.playerId;
    const at = [p.t1, p.t2, p.t3].map((t) => num(t, NaN)).filter((t) => Number.isFinite(t) && t >= 0).sort((a, b) => a - b);
    const sec = num(p.sec, 1.5), boss = num(p.boss, 0.5);
    let i = 0;
    battle.on('tick', () => {
      let due = false;
      while (i < at.length && battle.time >= at[i] - 1e-9) { i++; due = true; }
      if (!due) return;
      const list = battle.enemies.filter((e) => e.alive && !e.hidden && e.ownerId === pid);
      if (!list.length) return;
      for (const e of list) {
        const d = leaderLike(e) ? boss : sec;
        if (d > 0 && e.alive) battle.applyStatus(e, 'stun', { duration: d, source: null });
      }
      const R = battle.rect;
      battle.fx('shockBlast', { x: (R.c0 + R.c1) / 2, y: (R.r0 + R.r1) / 2, r: 20, src: key });
    });
  },

  // F17 战争机器
  aug_war_machine(battle, ps, p, key) {
    allOps(battle, ps.playerId, key, {
      augDealtMul: pct(p.dealt), dmgTakenMul: cut(p.taken), intervalMul: faster(p.interval), spRecoveryMul: 1 + pct(p.sp),
    });
  },

  // F18 同仇敌忾 (at the battle start: every install has run — 俄罗斯轮盘's shot is known)
  aug_verticality(battle, ps, p, key) {
    const pid = ps.playerId, step = pct(p.pct), cap = Math.max(1, pct(p.cap));
    battle.on('battleStart', () => {
      const ops = playerOps(battle, pid).filter((u) => !u.deferDeploy);
      for (const u of ops) {
        let n = 0;
        for (const v of ops) if (v !== u && shareBond(battle, u, v)) n++;
        const mul = Math.min(cap, 1 + step * n);
        if (mul > 1) passiveBuff(battle, u, key, { augDealtMul: mul }, { data: { n } });
      }
    });
  },

  // F19 天火
  aug_skyfire(battle, ps, p, key) {
    const pid = ps.playerId, period = Math.max(1, num(p.every, 20)), share = pct(p.pct);
    let acc = 0;
    battle.on('tick', ({ dt }) => {
      acc += dt ?? battle.dt;
      if (acc < period - 1e-9) return;
      const src = topAtk(fieldOps(battle, pid));
      if (!src) return;
      const list = battle.enemies.filter((e) => e.alive && !e.hidden && e.ownerId === pid && selectable(e));
      if (!list.length) return; // ready: it falls the first moment there are both an operator and an enemy
      acc = 0;
      const atk = src.s.atk;
      for (const e of list) {
        if (!e.alive) continue;
        battle.fx('scorchBurst', { x: e.x, y: e.y, r: 0.7, src: key });
        battle.dealDamage(src, e, { amount: atk * share * (leaderLike(e) ? LEADER_HALF : 1), type: 'arts', canDodge: false, tags: [key] });
      }
    });
  },

  // F20 无限火力
  aug_urf(battle, ps, p, key) {
    skillTempo(battle, ps.playerId, cut(p.cost), cut(p.dur));
    allOps(battle, ps.playerId, key, { intervalMul: faster(p.interval) });
  },
};

/**
 * Battle side: install augment `id` (definition `def`) of player `ps` (the battle's player input) on `battle`.
 * @returns {boolean} whether this batch handles the id
 */
export function install(battle, ps, id, def) {
  const fn = BATTLE[id];
  if (typeof fn !== 'function') return false;
  fn(battle, ps, (def && def.params) || {}, KEY(id), id);
  return true;
}

// =====================================================================================================================
// prep side

/** Prep side: augment id → (params) => handler object (onRoundStart, onBuy, onSpend, onPrepEnd, …). */
export const META = Object.freeze({
  // F2 绝地反击: the LP under the strategy's starting LP — the bonus % on the icon (its counter) from the pick on, and the
  // count of the round's battles at the prep end (data { round, lost })
  aug_comeback: (p) => {
    const key = KEY('aug_comeback');
    const count = (ctx) => {
      const ref = ctx.effect(key);
      if (!ref) return null;
      const lost = Math.max(0, Math.trunc(num(ctx.gd.startLp(ctx.bandId()), 0) - num(ctx.lp(), 0)));
      const mul = comebackMul(p, lost);
      ctx.setEffectCounter(key, mul > 1 + 1e-9 ? Math.round((mul - 1) * 100) : null);
      return { ref, lost };
    };
    return {
      onAugmentPick: count,
      onRoundStart: count,
      onPrepEnd(ctx) {
        const c = count(ctx);
        if (c) c.ref.data = { round: ctx.round, lost: c.lost };
      },
    };
  },
  // F5 今日之星: the round's roll (the battles pick the star with it: the same one in each)
  aug_star_of_day: () => ({
    onPrepEnd(ctx) {
      const ref = ctx.effect(KEY('aug_star_of_day'));
      if (ref) ref.data = { round: ctx.round, roll: ctx.rng() };
    },
  }),
});
