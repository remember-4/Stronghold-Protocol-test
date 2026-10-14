// server/sim/content/augments.js — A6000 fork: 海克斯 (augments) and 敌人强化 (enemy upgrades) in battle, and the prep
// side of the augments (registerMeta). The definitions and numbers: shared/augments.js; the AUGMENT phase (offers,
// picks, votes): server/match/match/augments.js.
//
// Battle side — install(battle):
//   a player's augments are its playerEffects with key 'augment:<id>' (server/match/match/augments.js adds the
//   EffectRef at the pick; the side 'meta' ones never reach a battle). Operator stats are match-long passive buffs put on
//   the player's operators when the battle is built (the bonds' way: support passiveBuff, 直接乘算 through directMods),
//   so a redeploy keeps them:
//     aug_tough / aug_armor                           dmgTakenMul / physTakenMul (受到的伤害降低 — independent multipliers)
//     aug_sharp / aug_glass                           augDealtMul (造成的伤害提升至; damage.js applies it with 限伤保护)
//     aug_haste                                       intervalMul (攻击间隔缩短: units.js)
//     aug_redeploy                                    redeployMul (1 − pct)
//     aug_surge                                       spRecoveryMul; +sp SP at every deployment ('init': passes 阻回)
//     aug_command                                     augDealtMul (1 + n %)^(active bonds of the player at battle start)
//     aug_shield                                      at battle start, a shield of pct % max HP for sec s on each
//                                                     deployed operator
//     aug_lifesteal                                   every damage instance an operator deals (not 流失) heals it pct %
//     aug_undying                                     an operator's first knock-out of the battle: a free redeploy where
//                                                     it lies at pct % HP — after every other saver and revive (the
//                                                     items' reviveNow: one already answered is not taken)
//     aug_greed                                       the enemies of the player's own half (ownerId) HP +hp %
//   enemy upgrades: content/enemyBuffs.js (split out; the battle flags' `enemyBuffs`).
// Nothing is installed when a battle has no augment: no hook, no random draw — the battles of upstream are unchanged.
//
// Prep side — registerMeta(registry): 'augment:<id>' handlers for the persistent EffectRefs (onRoundStart: aug_piggy,
// aug_greed funds) and onAugmentPick (the immediate part: aug_expand deploy cap, aug_recruit a chess).

import { AUGMENTS, LEADER_SHARE, augmentDef } from '../../../shared/augments.js';
// 海克斯第六版 幸运 (shared/luck.js): 豪赌, 天选之人 and 乘胜追击 read it — a player without luck draws exactly as before
import { luckOf, luckOfRefs, goodChance } from '../../../shared/luck.js';
import {
  num, isOp, playerOps, passiveBuff, directMods, activeBondIds, fxOn, unitBonds, bondActive, gainLayers, tierOf, itemsOf, alliesAround,
  rowMates, frontTile, allyAt, inRange, N4, isCoreBond,
} from './support/index.js';
import { metaBonds } from './support/meta.js';
import { reviveNow, addShieldLayer } from './items/battle.js';
import { tileFree } from './tokens.js';
import { installClass } from './classAugments.js';
// 海克斯第五版 (the user, 2026-10-10): each batch its own module (install → true when it handles the id; META factories)
import * as AUG5_G1 from './augments5/g1.js';
import * as AUG5_G2 from './augments5/g2.js';
import * as AUG5_G3 from './augments5/g3.js';
import * as AUG5_G4 from './augments5/g4.js';
// 海克斯第六版 (2026-10-10): g5–g11; a set's bonus is the pseudo augment aug_set_<set> (shared/augmentSets.js), handled by g5
import * as AUG5_G5 from './augments5/g5.js';
import * as AUG5_G6 from './augments5/g6.js';
import * as AUG5_G7 from './augments5/g7.js';
import * as AUG5_G8 from './augments5/g8.js';
import * as AUG5_G9 from './augments5/g9.js';
import * as AUG5_G10 from './augments5/g10.js';
import * as AUG5_G11 from './augments5/g11.js';
import * as USER_HEX from './augments5/user.js';

const AUG5 = [USER_HEX, AUG5_G1, AUG5_G2, AUG5_G3, AUG5_G4, AUG5_G5, AUG5_G6, AUG5_G7, AUG5_G8, AUG5_G9, AUG5_G10, AUG5_G11];
import { COLS } from '../constants.js';
import { msg, dn } from '../../../shared/i18n.js';

const KEY = (id) => `augment:${id}`;
const pct = (v) => num(v) / 100;
const rankOf = (e) => String(e?.def?.rank ?? e?.def?.raw?.rank ?? 'NORMAL').toUpperCase();
const shareOf = (e) => (rankOf(e) === 'BOSS' ? LEADER_SHARE : 1);

/**
 * The augment ids of one battle player (its 'augment:<id>' EffectRefs; the 套装 pseudo augments aug_set_* included). 幸运
 * (shared/luck.js luckOf) takes this list in a battle.
 */
export function augmentsOf(ps) {
  const out = [];
  for (const ref of ps.playerEffects || []) {
    if (!ref || typeof ref.key !== 'string' || !ref.key.startsWith('augment:')) continue;
    const id = ref.key.slice('augment:'.length);
    if (augmentDef(id)) out.push(id);
  }
  return out;
}

/** The counter of one of the player's augment EffectRefs (专属强化III·绮良: funds used since the pick), or 0. */
function counterOf(ps, id) {
  const ref = (ps.playerEffects || []).find((r) => r && r.key === KEY(id));
  return Math.max(0, num(ref && ref.counter, 0));
}

/** Operator mods of the stat augments (a battle's start state: bonds counted then). */
function opModsOf(battle, pid, id, p) {
  switch (id) {
    // the generic number augments: independent multipliers (units.js augDealtMul / intervalMul, damage.js 限伤保护)
    case 'aug_tough': return { dmgTakenMul: Math.max(0, 1 - pct(p.pct)) };
    case 'aug_sharp': return { augDealtMul: pct(p.pct) };
    case 'aug_armor': return { physTakenMul: Math.max(0, 1 - pct(p.pct)) };
    case 'aug_glass': return { augDealtMul: pct(p.dealt), dmgTakenMul: 1 + pct(p.taken) };
    case 'aug_haste': return { intervalMul: Math.max(0.1, 1 - pct(p.pct)) };
    case 'aug_redeploy': return { redeployMul: Math.max(0.1, 1 - pct(p.pct)) };
    case 'aug_surge': return { spRecoveryMul: 1 + pct(p.pct) };
    case 'aug_command': {
      const n = activeBondIds(battle, pid).length;
      return n > 0 ? { augDealtMul: Math.pow(1 + pct(p.pct), n) } : null;
    }
    // 专属强化I·阿米娅: the strategy's own thresholds (3 / 4 / 5 active bonds) for DEF % and RES
    case 'aug_x_amiya1': {
      const n = activeBondIds(battle, pid).length;
      let i = 0;
      for (const k of [1, 2, 3]) if (n >= num(p[`v${k}`], Infinity)) i = k;
      return i ? directMods({ def: pct(p[`def${i}`]) }, { resFlat: num(p[`res${i}`]) }) : null;
    }
    default: return null;
  }
}

/** The data of one of the player's augment EffectRefs (what the prep side decided: 背水一战, 天选之人, 小盟约专精), or null. */
function dataOf(ps, id) {
  const ref = (ps.playerEffects || []).find((r) => r && r.key === KEY(id));
  return ref && ref.data && typeof ref.data === 'object' ? ref.data : null;
}

/** Bonds no layer of a 海克斯 goes to: they have no per-layer effect (调和, 协防, 独行, 绝技 — the user, 2026-10-09). */
export const NO_STACK = Object.freeze(new Set(['maniShip', 'emptyShip', 'soloShip', 'suntShip']));

/** Seconds between two reads of a positional 海克斯 (铁三角, 纵深, 中军, 前哨): operators move, die and redeploy. */
const POS_PERIOD = 0.25;

/** `fn()` every `period` seconds of the battle (the first at once). */
function every(battle, period, fn) {
  let acc = period;
  battle.on('tick', ({ dt }) => {
    acc += dt ?? battle.dt;
    if (acc < period - 1e-9) return;
    acc = 0;
    fn();
  });
}

/** A buff a periodic rule keeps up: it lapses one period after the rule stops holding. */
const keepUp = (battle, u, key, mods, period = POS_PERIOD) => battle.addBuff(u, { key, mods, duration: period + 0.15, refresh: 'extend', visible: true });

const cut = (v) => Math.max(0, 1 - pct(v));
const faster = (v) => Math.max(0.1, 1 - pct(v));

/**
 * The generic 海克斯 of the user's third list in battle (the definitions: shared/augments.js). Number bonuses are the
 * independent multipliers: `augDealtMul` (造成的伤害提升至 — damage.js applies it with 限伤保护), `dmgTakenMul` /
 * `physTakenMul` (受到的伤害降低), `intervalMul` (攻击间隔缩短), `augTakenMul` on enemies (中军).
 */
function installGeneric(battle, ps, id, p) {
  const pid = ps.playerId;
  const own = (u) => isOp(u) && u.ownerId === pid;
  // operators and their summons ("你的干员" dealing damage / applying a status)
  const mine = (u) => !!u && u.side === 'ally' && u.ownerId === pid;
  const key = KEY(id);
  const allOps = (mods, extra) => { for (const u of playerOps(battle, pid)) passiveBuff(battle, u, key, mods, extra); };
  switch (id) {
    case 'aug_rookie':
      for (const u of playerOps(battle, pid)) if (tierOf(u) <= num(p.maxTier, 3)) passiveBuff(battle, u, key, { augDealtMul: pct(p.dealt), dmgTakenMul: cut(p.taken) });
      break;
    // 背水一战: the prep side marks a player at ≤ half its starting LP (EffectRef data.low, onPrepEnd)
    case 'aug_last_stand':
      if (dataOf(ps, id)?.low) allOps({ augDealtMul: pct(p.dealt), dmgTakenMul: cut(p.taken) }, { visible: true });
      break;
    case 'aug_medic': allOps({ healingDealtMul: pct(p.pct) }); break;
    // 穿甲: added to every other 无视 (精准, 锐利, 激光发射器 …); units.js clamps the sums at 100 %
    case 'aug_pierce': allOps({ defIgnorePct: pct(p.pct), resIgnorePct: pct(p.pct) }); break;
    case 'aug_craft':
      for (const u of playerOps(battle, pid)) if (itemsOf(u).length >= 2) passiveBuff(battle, u, key, { intervalMul: faster(p.interval), dmgTakenMul: cut(p.taken) });
      break;
    case 'aug_allin': allOps({ augDealtMul: pct(p.dealt), dmgTakenMul: cut(p.taken) }); break;
    // 天选之人: the round start's 1/odds draw (EffectRef data.round = the round it hit)
    case 'aug_chosen':
      if (dataOf(ps, id)?.round === battle.round) allOps({ intervalMul: faster(p.interval), augDealtMul: pct(p.dealt) }, { visible: true });
      break;
    case 'aug_guardian': {
      const m = cut(p.pct);
      battle.on('hit', (c) => { const t = c.target; if (own(t) && Array.isArray(t.blocking) && t.blocking.length) c.dmg.mul *= m; });
      break;
    }
    // 后劲: from the sec-th second of the battle on (a persistent buff: a redeploy keeps it)
    case 'aug_second_wind': {
      let on = false;
      battle.on('tick', () => {
        if (on || battle.time < num(p.sec, 25)) return;
        on = true;
        allOps({ intervalMul: faster(p.pct) }, { visible: true });
      });
      break;
    }
    // 斩杀: a hit of the player's units that leaves a non-leader enemy under pct % of its HP knocks it out — a 流失 of the
    // rest (no shield, no multiplier; the kill and its credit as usual)
    case 'aug_execute': {
      const below = pct(p.pct);
      battle.on('damaged', (c) => {
        const e = c.target;
        const s = c.credit || c.source;
        if (!mine(s) || !e || e.side !== 'enemy' || !e.alive || e.isBoss || e.bossPool || !(c.amount > 0)) return;
        if (c.dmg && Array.isArray(c.dmg.tags) && c.dmg.tags.includes(key)) return;
        if (!(e.hp > 0) || e.hp >= e.s.maxHp * below) return;
        battle.loseHp(e, e.hp, { source: s, tags: [key] });
      });
      break;
    }
    // 连锁爆破: an enemy the player's units knock out hits the other enemies within 1 tile for pct % of ITS max HP — true,
    // 无来源 (no multiplier of the killer; the killer keeps the credit); a knock-out by it does not chain; leaders immune
    case 'aug_chain': {
      const share = pct(p.pct);
      let chaining = false;
      battle.on('death', (c) => {
        const e = c.unit;
        if (chaining || !e || e.side !== 'enemy' || c.reason !== 'killed' || !mine(c.killer)) return;
        const amount = num(e.s?.maxHp) * share;
        if (!(amount > 0)) return;
        chaining = true;
        try {
          for (const o of battle.enemies.slice()) {
            if (o === e || !o.alive || o.isBoss || o.bossPool) continue;
            if (Math.max(Math.abs(o.x - e.x), Math.abs(o.y - e.y)) > 1 + 1e-9) continue;
            battle.dealDamage(c.killer, o, { amount, type: 'true', canDodge: false, sourceless: true, tags: [key] });
          }
        } finally { chaining = false; }
      });
      break;
    }
    case 'aug_skill_echo': {
      const sp = num(p.sp, 2), cd = num(p.cd, 8);
      battle.on('skillStart', ({ unit: u }) => {
        if (!own(u) || !u.alive) return;
        for (const v of alliesAround(battle, u, N4)) {
          if (!isOp(v) || !v.skill || v.skill.noSkill) continue;
          const at = v.mem.augEchoAt;
          if (at != null && battle.time - at < cd - 1e-9) continue;
          v.mem.augEchoAt = battle.time;
          v.skill.gainSp(sp, 'augment');
        }
      });
      break;
    }
    // 再部署演练: a redeployment (not the battle start's, not a move)
    case 'aug_drill': {
      const mods = { intervalMul: faster(p.pct), dmgTakenMul: cut(p.pct) };
      battle.on('deploy', ({ unit: u, initial, move }) => {
        if (!own(u) || initial || move) return;
        battle.addBuff(u, { key, mods, duration: num(p.sec, 10), refresh: 'replace', visible: true });
      });
      break;
    }
    // 控制延长: the player's units' 晕眩 / 冻结 / 沉睡 / 束缚 on enemies (a leader at half the extra)
    case 'aug_control': {
      const up = pct(p.pct);
      const KINDS = new Set(['stun', 'freeze', 'sleep', 'bind']);
      battle.on('beforeStatus', (c) => {
        const t = c.target;
        if (!t || t.side !== 'enemy' || !KINDS.has(c.status) || !mine(c.source)) return;
        const d = Number(c.duration);
        if (!(d > 0) || d === Infinity) return;
        c.duration = d * (1 + up * (t.isBoss ? LEADER_SHARE : 1));
      });
      break;
    }
    // 荆棘: a blocked enemy's attack on the player's operator returns pct % of that operator's ATK as arts damage
    case 'aug_thorns': {
      const share = pct(p.pct), cd = num(p.cd, 0.5);
      battle.on('attack', ({ attacker: e, targets }) => {
        if (!e || e.side !== 'enemy' || !e.alive || !e.blockedBy) return;
        for (const t of targets || []) {
          if (!own(t) || !t.alive) continue;
          const at = t.mem.augThornsAt;
          if (at != null && battle.time - at < cd - 1e-9) continue;
          t.mem.augThornsAt = battle.time;
          battle.dealDamage(t, e, { amount: num(t.s?.atk) * share, type: 'arts', tags: [key] });
          if (!e.alive) break;
        }
      });
      break;
    }
    // 多重打击: every n-th attack of an operator (skills' attacks too) — one more instance of pct % ATK, its damage type
    case 'aug_multi': {
      const n = Math.max(1, Math.round(num(p.n, 4))), share = pct(p.pct);
      battle.on('attack', ({ attacker: u, targets }) => {
        if (!own(u) || !u.alive) return;
        const type = u.dmgType;
        if (type !== 'phys' && type !== 'arts' && type !== 'true') return;
        u.mem.augMulti = (u.mem.augMulti ?? 0) + 1;
        if (u.mem.augMulti % n) return;
        const t = (targets || []).find((x) => x && x.side === 'enemy' && x.alive);
        if (t) battle.dealDamage(u, t, { amount: num(u.s.atk) * share, type, tags: [key] });
      });
      break;
    }
    case 'aug_highground': {
      const dist = num(p.dist, 3), mul = pct(p.pct);
      battle.on('hit', (c) => {
        const u = c.source, t = c.target;
        if (!own(u) || u.def?.position !== 'RANGED' || !t || t.side !== 'enemy') return;
        if (Math.hypot(t.x - u.x, t.y - u.y) > dist + 1e-9) c.dmg.augMul *= mul;
      });
      break;
    }
    case 'aug_triangle': {
      const need = num(p.n, 3), mods = { dmgTakenMul: cut(p.pct) };
      every(battle, POS_PERIOD, () => {
        for (const u of playerOps(battle, pid, { fieldOnly: true })) if (rowMates(battle, u).length >= need) keepUp(battle, u, key, mods);
      });
      break;
    }
    // 纵深: the operator with one of the player's operators on the tile in front of it (its facing)
    case 'aug_depth': {
      const mods = { intervalMul: faster(p.pct) };
      every(battle, POS_PERIOD, () => {
        for (const u of playerOps(battle, pid, { fieldOnly: true })) {
          const [r, c] = frontTile(u, 1);
          const f = allyAt(battle, r, c, pid);
          if (f && f !== u && isOp(f)) keepUp(battle, u, key, mods);
        }
      });
      break;
    }
    // 中军: an operator with the player's units on all four sides marks the enemies in its range (one mark, any number of
    // such operators — the same key)
    case 'aug_center': {
      const mods = { augTakenMul: 1 + pct(p.pct) };
      every(battle, POS_PERIOD, () => {
        for (const u of playerOps(battle, pid, { fieldOnly: true })) {
          if (alliesAround(battle, u, N4).length < 4) continue;
          for (const e of battle.enemies) if (e.alive && !e.hidden && inRange(u, e)) keepUp(battle, e, id === 'aug_center' ? 'augment:aug_center:aura' : key, mods);
        }
      });
      break;
    }
    // 前哨: the right-most column the player's operators stand in (the mirrored Final Assault side: the left-most)
    case 'aug_vanguard': {
      const mods = { dmgTakenMul: cut(p.pct) };
      const col = (u) => (ps.mirror ? -u.tileC : u.tileC);
      every(battle, POS_PERIOD, () => {
        const ops = playerOps(battle, pid, { fieldOnly: true });
        let front = -Infinity;
        for (const u of ops) front = Math.max(front, col(u));
        for (const u of ops) if (col(u) === front) keepUp(battle, u, key, mods);
      });
      break;
    }
    // 技能先发: the battle start's deployment fills one charge
    case 'aug_first_strike':
      battle.on('deploy', ({ unit: u, initial }) => {
        if (!own(u) || !initial || !u.skill || u.skill.noSkill || u.skill.kind === 'passive') return;
        const sk = u.skill;
        if (sk.charges < 1 && sk.spCost > sk.sp) sk.gainSp(sk.spCost - sk.sp, 'init');
      });
      break;
    // 乘胜追击: an in-battle 特质 gain (reason 'garrison') of the player, prob % one more (at most max a battle); 幸运 raises
    // the chance (a good outcome)
    case 'aug_momentum': {
      const prob = goodChance(pct(p.prob), luckOfRefs(ps.playerEffects, battle.flags.enemyBuffs)), max = num(p.max, 10);
      let used = 0;
      battle.on('layerGain', (c) => {
        if (c.playerId !== pid || c.reason !== 'garrison' || used >= max || !(c.n > 0) || NO_STACK.has(c.bondId)) return;
        if (battle.rng() >= prob) return;
        used++;
        c.n += 1;
      }, { priority: -100 });
      break;
    }
    // 小盟约专精: an in-battle 特质 gain of an add-on bond +1, within the round's room the prep side left (data.left)
    case 'aug_minor': {
      let left = num(dataOf(ps, id)?.left, num(p.max, 6));
      battle.on('layerGain', (c) => {
        if (c.playerId !== pid || c.reason !== 'garrison' || left <= 0 || !(c.n > 0) || isCoreBond(c.bondId) || NO_STACK.has(c.bondId)) return;
        left--;
        c.n += 1;
      }, { priority: -100 });
      break;
    }
    case 'aug_sync':
      if (battle.kind === 'unite') {
        battle.on('deploy', ({ unit: u, initial }) => { if (own(u) && initial && u.skill && !u.skill.noSkill) u.skill.gainSp(num(p.sp, 10), 'init'); });
      }
      break;
    default: break;
  }
}

/**
 * The 海克斯 that act on other players' operators: 并肩作战 (the Final Assault / Hidden Core field's every operator, one
 * buff whoever holds it) and 献祭 (the battle flags' `augSacrifice`: this round's sacrificers — every other player's
 * operators, one buff per sacrificer).
 */
function installTeam(battle) {
  const bossLike = battle.kind === 'boss' || battle.kind === 'hidden';
  if (bossLike && (battle.players || []).some((ps) => augmentsOf(ps).includes('aug_together'))) {
    const p = augmentDef('aug_together').params;
    for (const u of battle.allyUnits) if (isOp(u)) passiveBuff(battle, u, KEY('aug_together'), { augDealtMul: pct(p.pct) });
  }
  const sac = battle.flags && Array.isArray(battle.flags.augSacrifice) ? battle.flags.augSacrifice : [];
  if (sac.length) {
    const p = augmentDef('aug_sacrifice').params;
    for (const pid of sac) {
      for (const u of battle.allyUnits) if (isOp(u) && u.ownerId !== pid) passiveBuff(battle, u, `${KEY('aug_sacrifice')}:${pid}`, { augDealtMul: pct(p.pct) }, { visible: true });
    }
  }
  // 还手 (the user, 2026-10-11; server/match/match/augments.js teamRetaliate / teamCoverFlags). 使绊子: the tripped
  // player's operators in his own combat (playerId → damage multiplier). 不兜底: in a 联防, a helper's units against the
  // enemies of a leaker it holds grudges against (helper → leaker → multiplier)
  const trip = battle.kind === 'normal' && battle.flags && battle.flags.grudgeTrip;
  if (trip && typeof trip === 'object') {
    for (const u of battle.allyUnits) {
      const mul = Number(trip[u.ownerId]);
      if (isOp(u) && mul > 0 && mul < 1) passiveBuff(battle, u, 'grudge:trip', { augDealtMul: mul });
    }
  }
  const cover = battle.kind === 'unite' && battle.flags && battle.flags.grudgeCover;
  if (cover && typeof cover === 'object') {
    battle.on('hit', (c) => {
      const s = c.credit;
      const t = c.target;
      if (!c.dmg || !s || s.side !== 'ally' || !t || t.side !== 'enemy' || !t.sourcePlayerId) return;
      const row = cover[s.ownerId];
      const mul = row && typeof row === 'object' ? Number(row[t.sourcePlayerId]) : NaN;
      if (mul > 0 && mul < 1) c.dmg.augMul *= mul;
    });
  }
}

function installPlayer(battle, ps, ids) {
  const pid = ps.playerId;
  const own = (u) => isOp(u) && u.ownerId === pid;
  for (const id of ids) {
    const def = augmentDef(id);
    const p = def.params;
    // 职业专精 (A6000 fork, 2026-10-09): their own module
    if (def.cls) { installClass(battle, ps, id, def); continue; }
    // 海克斯第五版: the batch that defines it
    if (id === 'aug_medic') USER_HEX.installMedic(battle,ps);
    if (AUG5.some((g) => g.install(battle, ps, id, def))) continue;
    const mods = opModsOf(battle, pid, id, p);
    installGeneric(battle, ps, id, p);
    if (mods && Object.keys(mods).length) for (const u of playerOps(battle, pid)) passiveBuff(battle, u, KEY(id), mods);
    if (id === 'aug_surge' && num(p.sp) > 0) {
      battle.on('deploy', ({ unit }) => {
        if (own(unit) && unit.skill && !unit.skill.noSkill) unit.skill.gainSp(num(p.sp), 'init');
      });
    }
    if (id === 'aug_shield') {
      battle.on('battleStart', () => {
        for (const u of playerOps(battle, pid, { fieldOnly: true })) {
          if (!u.alive) continue;
          battle.addBuff(u, { key: KEY(id), shield: u.s.maxHp * pct(p.pct), duration: num(p.sec, 15), visible: true, refresh: 'replace' });
        }
      });
    }
    if (id === 'aug_lifesteal') {
      const share = pct(p.pct);
      battle.on('damaged', (c) => {
        const s = c.source;
        if (!own(s) || !s.alive || !(c.amount > 0) || c.type === 'element') return;
        battle.heal(s, s, c.amount * share, { self: true, silent: true });
      });
    }
    if (id === 'aug_undying') {
      const used = new Set();
      battle.on('death', (c) => {
        const u = c.unit;
        if (!own(u) || used.has(u) || !reviveNow(battle, c, 'augment')) return;
        used.add(u);
        u.hp = Math.max(1, u.s.maxHp * pct(p.pct));
        fxOn(battle, 'revive', u, KEY(id), id, {});
      }, { priority: 5 });
    }
    // 专属强化III·绮良: ATK +atk % and ASPD +aspd per fund used since the pick (the EffectRef's counter)
    if (id === 'aug_x_kirara3') {
      const n = counterOf(ps, id);
      if (n > 0) for (const u of playerOps(battle, pid)) passiveBuff(battle, u, KEY(id), directMods({ atk: pct(p.atk) * n }, { aspd: num(p.aspd) * n }));
    }
    // 专属强化II·埃芒加德: an own operator knocked out → each of its active bonds +layer (an in-battle gain)
    if (id === 'aug_x_ermengard2') {
      battle.on('death', (c) => {
        const u = c.unit;
        if (!own(u) || c.reason !== 'killed') return;
        for (const b of unitBonds(u)) if (bondActive(battle, pid, b)) gainLayers(battle, { playerId: pid, bonds: b, n: num(p.layer, 2), source: u, reason: 'band' });
      }, { priority: -500 });
    }
    // 专属强化I·埃芒加德: the layers an operator the strategy revives gains at that moment — its own 被击倒时 and 部署时
    // triggers (砾, 瑕光 …: `source` = the unit, the same tick) — are gained once more, at the end of the death's dispatch
    if (id === 'aug_x_ermengard1') {
      const seen = [];
      let again = false;
      battle.on('layerGain', (c) => {
        if (again || c.playerId !== pid || !c.source || !(c.n > 0)) return;
        seen.push({ t: battle.time, unit: c.source, bondId: c.bondId, n: c.n });
        if (seen.length > 64) seen.splice(0, seen.length - 64);
      }, { priority: -1000 });
      battle.on('death', (c) => {
        const u = c.unit;
        if (!own(u) || c.revivedBy !== 'band') return;
        const now = battle.time;
        const mine = seen.filter((g) => g.unit === u && g.t === now);
        again = true;
        try { for (const g of mine) battle.addLayers(pid, g.bondId, g.n, 'band', { source: u }); } finally { again = false; }
      }, { priority: -1000 });
    }
    // 专属强化II·大帝: the deployment cost (DP, paid by the redeploys) −pct %, once every install has set it
    if (id === 'aug_x_emperor2') {
      const keep = Math.max(0, 1 - pct(p.pct));
      battle.on('battleStart', () => {
        for (const u of playerOps(battle, pid)) u.base.cost = Math.max(0, Math.round(num(u.base.cost) * keep));
      }, { priority: -100 });
    }
    // 专属强化I·大帝 (the table of 2026-10-10): each own operator's first redeploy time −pct % — a persistent buff its
    // knock-out / retreat reads (battle/deploy.js _remove; the 联防 forced exit re-reads it after battleStart), dropped
    // when that first redeploy happens; the strategy's own −50 % per deployment stays
    if (id === 'aug_x_emperor1') {
      const key = `${KEY(id)}:first`;
      const mul = Math.max(0, 1 - pct(p.pct));
      battle.on('battleStart', () => {
        for (const u of playerOps(battle, pid)) battle.addBuff(u, { key, mods: { redeployMul: mul }, persist: true, allowDead: true, refresh: 'replace' });
      }, { priority: 50 });
      battle.on('death', (c) => { if (own(c.unit)) c.unit.mem.emperor1Down = true; }, { priority: -1000 });
      battle.on('deploy', ({ unit }) => { if (own(unit) && unit.mem.emperor1Down) battle.removeBuff(unit, key); }, { priority: -1000 });
    }
    // 专属强化·桑葚 「改为」 (the strategy steps aside: bands/battle.js): II every own unit, max 1 layer; III the right-most
    // column, max 2 layers, and every layer gained (a proc at the cap counts: the table's 备注) or lost stacks ATK / HP
    // +pct % and ASPD +aspd, at most cap times
    if (id === 'aug_x_mberry2') shieldProc(battle, ps, id, { prob: pct(p.prob), max: 1, everyone: true });
    if (id === 'aug_x_mberry3') shieldProc(battle, ps, id, { prob: pct(p.prob), max: num(p.max, 2), stack: { atk: pct(p.pct), hp: pct(p.pct), aspd: num(p.aspd), cap: num(p.cap, 10) } });
    // 专属强化II·休谟斯: every SP point that found the bar full (Skill._overflow) → that operator ATK +atk % for the battle,
    // at most +cap % (the table of 2026-10-10)
    if (id === 'aug_x_humus2') {
      const step = pct(p.atk);
      const top = p.cap != null ? Math.max(0, Math.floor(pct(p.cap) / Math.max(1e-9, step) + 1e-9)) : Infinity;
      battle.on('spOverflow', ({ unit, amount }) => {
        if (!own(unit)) return;
        const acc = (unit.mem.augOverflow ?? 0) + amount;
        unit.mem.augOverflow = acc;
        const n = Math.min(top, Math.floor(acc + 1e-9));
        if (n <= (unit.mem.augOverflowN ?? 0)) return;
        unit.mem.augOverflowN = n;
        battle.addBuff(unit, { key: KEY(id), mods: directMods({ atk: step * n }), refresh: 'replace', persist: true, allowDead: true, visible: true, data: { n } });
      });
    }
    // 专属强化I·巫恋: a curse doll with no time limit on the player's half — placed by the battle on the free tile that
    // covers the most enemy path tiles (nearest a protection point first) [a simplification: the player cannot place it]
    if (id === 'aug_x_vodfox1') battle.on('battleStart', () => placeDoll(battle, pid, KEY(id), pct(p.pct)), { priority: -50 });
    // 专属强化II·变形者集群: the operators the prep side found 调和 by two 变形同构体 (the EffectRef's data)
    if (id === 'aug_x_damaztic2') {
      const ref = (ps.playerEffects || []).find((r) => r && r.key === KEY(id));
      const uids = Array.isArray(ref?.data?.harmony) ? ref.data.harmony : [];
      for (const u of playerOps(battle, pid)) if (uids.includes(u.uid)) u.extraBonds = ['maniShip'];
    }
    if (id === 'aug_greed' && num(p.hp) > 0) {
      battle.on('enemySpawn', ({ enemy: e }) => {
        if (!e || !e.alive) return;
        const owner = e.ownerId ?? (battle.players.length === 1 ? battle.players[0].playerId : null);
        if (owner !== pid) return;
        battle.addBuff(e, { key: KEY(id), mods: { hpMul: 1 + pct(p.hp) * shareOf(e) }, persist: true });
      });
    }
  }
}

/** 专属强化·桑葚: the shield proc of 药枚实验 for `ps`'s chosen units (see installPlayer). */
function shieldProc(battle, ps, id, { prob, max, everyone = false, stack = null }) {
  const key = `${KEY(id)}:shield`;
  const chosen = new Set();
  const st = new Map(); // unit → { last: shield layers seen, n: stacks }
  battle.on('battleStart', () => {
    const units = battle.allies(ps.playerId);
    if (everyone) { for (const u of units) chosen.add(u); return; }
    // "最右边的所有我方单位": as the strategy (bands/battle.js — the mirrored Final Assault side counts from the left)
    const col = (u) => (ps.mirror ? -u.tileC : u.tileC);
    let front = -Infinity;
    for (const u of units) front = Math.max(front, col(u));
    for (const u of units) if (col(u) === front) chosen.add(u);
  });
  if (!(prob > 0)) return;
  const layersOf = (u) => u.findBuff(key)?.shieldHits ?? 0;
  const bump = (u, s, k) => {
    const n = Math.min(stack.cap, s.n + k);
    if (n === s.n) return;
    s.n = n;
    battle.addBuff(u, { key: `${KEY(id)}:stack`, mods: directMods({ atk: stack.atk * n, hp: stack.hp * n }, { aspd: stack.aspd * n }), refresh: 'replace', persist: true, allowDead: true, visible: true, data: { n } });
  };
  const seen = (u) => {
    let s = st.get(u);
    if (!s) st.set(u, (s = { last: 0, n: 0 }));
    const cur = layersOf(u);
    if (cur < s.last) bump(u, s, s.last - cur);
    s.last = cur;
    return s;
  };
  battle.on('attack', (c) => {
    const u = c.attacker;
    if (!chosen.has(u) || !u.alive) return;
    if (!(prob >= 1 || battle.rng() < prob)) return;
    const s = stack ? seen(u) : null;
    if (addShieldLayer(battle, u, key, max)) fxOn(battle, 'shield', u, KEY(id), id);
    if (s) { bump(u, s, 1); s.last = layersOf(u); }
  });
  if (stack) battle.on('tick', () => { for (const u of chosen) if (u.alive) seen(u); });
}

/** 专属强化I·巫恋's doll: the free tile of `pid`'s half covering the most enemy path tiles (3×3), nearest a goal. */
function placeDoll(battle, pid, key, cut) {
  const DOLL = 'token_10006_vodfox_doll';
  const path = battle.groundPathTiles();
  const ends = (battle.routes || []).filter((r) => r && Array.isArray(r.end)).map((r) => r.end);
  const R = battle.rect;
  const cands = [];
  for (let r = R.r0; r <= R.r1; r++) {
    for (let c = R.c0; c <= R.c1; c++) {
      if (battle._ownerForTile([r, c]) !== pid || !tileFree(battle, r, c)) continue;
      if (!battle.grid.canStand(r, c, { ranged: false }) && !battle.grid.canStand(r, c, { ranged: true })) continue;
      let cover = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (path.has((r + dr) * COLS + (c + dc))) cover++;
      if (!cover) continue;
      const d = ends.length ? Math.min(...ends.map(([er, ec]) => Math.abs(er - r) + Math.abs(ec - c))) : 0;
      cands.push([-cover, d, r, c]);
    }
  }
  cands.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3]);
  let doll = null;
  for (const [, , r, c] of cands) {
    doll = battle.spawnToken(pid, DOLL, r, c, { kit: { skill: null, trait: { noAttack: true } }, untargetable: true, anySource: true });
    if (doll) break;
  }
  if (!doll) return;
  const mods = { atkPct: -cut, defPct: -cut };
  const EVERY = 0.2;
  let acc = EVERY;
  battle.on('tick', ({ dt }) => {
    if (!doll.alive) return;
    acc += dt ?? battle.dt;
    if (acc < EVERY - 1e-9) return;
    acc = 0;
    const r0 = doll.tileR, c0 = doll.tileC;
    for (const e of battle.enemies) {
      if (!e.alive || Math.abs(Math.round(e.y) - r0) > 1 || Math.abs(Math.round(e.x) - c0) > 1) continue;
      battle.addBuff(e, { key, duration: EVERY + 0.15, refresh: 'extend', mods, source: doll });
    }
  });
}

export function install(battle) {
  for (const ps of battle.players || []) {
    const ids = augmentsOf(ps);
    if (ids.length) installPlayer(battle, ps, ids);
  }
  installTeam(battle);
  // 专属强化II·老鲤: in a 联防, who defeated each leaker's last enemy (BattleResult.lastKills, battle/lifecycle.js)
  if (battle.kind === 'unite' && battle.flags && battle.flags.trackLastKills) {
    battle._lastKills = new Map();
    battle.on('death', (c) => {
      const e = c.unit;
      if (!e || e.side !== 'enemy' || c.reason !== 'killed' || !e.sourcePlayerId) return;
      const killer = c.killer && c.killer.ownerId != null ? c.killer.ownerId : null;
      if (killer != null) battle._lastKills.set(e.sourcePlayerId, killer);
    });
  }
  // 专属强化II·鸭爵: the swapped enemies (bands/meta.js duckReplace, spawn tag 'duck') cost no LP when they get through
  if (battle.flags && battle.flags.duckFreeLp) {
    battle.on('enemySpawn', ({ enemy: e }) => { if (e && e.tag === 'duck') e.lpr = 0; });
  }
}

// =====================================================================================================================
// prep side

export function registerMeta(registry) {
  for (const def of AUGMENTS) {
    const p = def.params;
    const h = {};
    if (def.id === 'aug_piggy' || def.id === 'aug_greed') h.onRoundStart = (ctx) => { ctx.addFunds(num(p.funds), `augment:${def.id}`); };
    if (def.id === 'aug_recruit') {
      h.onAugmentPick = (ctx) => {
        // the highest tier the player's dispatch level offers, then lower ones while the pool has none left
        for (let tier = Math.min(6, Number(ctx.shopLevel()) || 6); tier >= 1; tier--) {
          const id = ctx.rollChess({ tier });
          if (id && ctx.grantChess(id, { source: `augment:${def.id}` })) return;
        }
      };
    }
    Object.assign(h, GENERIC_META[def.id]?.(p) ?? {}, EXCLUSIVE_META[def.id]?.(p) ?? {});
    for (const g of AUG5) Object.assign(h, g.META[def.id]?.(p) ?? {});
    if (Object.keys(h).length) registry.register(KEY(def.id), h);
  }
}

/** Per-round counter of a player (reset lazily when the round changes). */
function roundKey(ctx, key) {
  if (ctx.counter(`${key}:r`) !== ctx.round) { ctx.setCounter(`${key}:r`, ctx.round); ctx.setCounter(key, 0); }
  return key;
}

/** Chess slot indices of the shop that are not sold. */
const chessSlots = (ctx) => ctx.shopSlots().map((x, i) => (x && x.kind === 'chess' && !x.sold ? i : -1)).filter((i) => i >= 0);

/** Active bonds of the player a 海克斯 may add layers to (NO_STACK left out), [id, state] in the data's order. */
function stackable(ctx) {
  return Object.entries(ctx.bonds()).filter(([b, st]) => st && st.active && !NO_STACK.has(b));
}

/** The base ids of which the player holds exactly one copy short of a merge — normal copies only (慧眼). */
function nearMerges(ctx) {
  const n = new Map();
  for (const v of [...ctx.board(), ...ctx.hand(), ...ctx.temp()]) {
    if (!v || v.kind !== 'chess' || ctx.gd.isGolden(v.id)) continue;
    const base = ctx.gd.baseIdOf(v.id);
    n.set(base, (n.get(base) ?? 0) + 1);
  }
  return [...n].filter(([b, k]) => { const need = ctx.gd.mergeCount(b); return need > 1 && k === need - 1; }).map(([b]) => b);
}

/**
 * Put a chess of `ok(id)` (≤ the dispatch level, copy-weighted from the pool) on a random unfrozen chess slot, unless an
 * unsold slot already shows one. Returns whether the shop shows one now.
 */
function ensureInShop(ctx, ok) {
  const slots = ctx.shopSlots();
  if (slots.some((x) => x && x.kind === 'chess' && !x.sold && ok(x.id))) return true;
  const free = chessSlots(ctx).filter((i) => !slots[i].frozen);
  if (!free.length) return false;
  const id = ctx.rollChess({ maxTier: Math.max(1, ctx.shopLevel()), filter: (x) => !ctx.gd.isGolden(x) && ok(x) });
  if (!id) return false;
  return ctx.setShopSlot(ctx.rng.pick(free), { kind: 'chess', id });
}

/** The core bond with the most distinct board members (ties: more layers), or null (同乡会). */
function topCoreOnBoard(ctx) {
  const by = new Map();
  for (const v of ctx.board()) {
    if (!v || v.kind !== 'chess') continue;
    for (const b of ctx.pieceBonds(v.uid)) {
      if (!ctx.gd.bond(b)?.isCore) continue;
      if (!by.has(b)) by.set(b, new Set());
      by.get(b).add(ctx.gd.baseIdOf(v.id));
    }
  }
  let best = null, n = 0;
  for (const [b, s] of by) if (s.size > n || (s.size === n && ctx.layers(b) > ctx.layers(best))) { best = b; n = s.size; }
  return best;
}

/**
 * The prep side of the generic 海克斯 of the user's third list (funds, the shop, layers, items). Funds follow the rules of
 * the analysis (§五): per round with a cap, never per gain / sale, never a 获得时 effect (投资人 would double it, 铃兰
 * repeat it). The team ones (吸血鬼, 打劫, 定时炸弹, 同生共死, 甩锅, 遗产, 献祭, 命运轮盘, 熔炉) are the match's:
 * server/match/match/augments.js.
 */
const GENERIC_META = {
  // 补给线: one free manual refresh a round; one the round did not use lapses at its prep end (不累积)
  aug_supply: () => ({
    onAugmentPick(ctx) { ctx.grantFreeRefresh(1); ctx.setCounter('aug:supply:r', ctx.round); },
    onRoundStart(ctx) { ctx.grantFreeRefresh(1); ctx.setCounter('aug:supply:r', ctx.round); },
    onPrepEnd(ctx) { if (ctx.counter('aug:supply:r') === ctx.round && !(ctx.roundStats().refreshes > 0)) ctx.takeFreeRefresh(1); },
  }),
  // 储蓄: half the funds left at the prep end (≤ max) at the next round start (never for a strategy that keeps them all)
  aug_savings: (p) => ({
    onPrepEnd(ctx) {
      if (ctx.gd.leftoverKeptBands.includes(ctx.bandId())) return;
      const n = Math.min(num(p.max, 3), Math.floor(ctx.funds() / 2));
      if (n > 0) ctx.addPendingFunds(n);
    },
  }),
  // 议价: the round's first operator bought costs n less (not below min; an effect's own lower price is kept)
  aug_haggle: (p) => ({
    onPrice(ctx, ev) {
      if (!ev || !ev.slot || ev.slot.kind !== 'chess' || ctx.counter(roundKey(ctx, 'aug:haggle')) > 0) return;
      const price = Number(ev.price) || 0;
      if (price > num(p.min, 1)) ev.price = Math.max(num(p.min, 1), price - num(p.n, 1));
    },
    onBuy(ctx, ev) { if (ev && ev.kind === 'chess') ctx.setCounter(roundKey(ctx, 'aug:haggle'), 1); },
  }),
  // 升级补贴: the upgrade price now and after every upgrade (the per-round −1 goes on as before)
  aug_subsidy: (p) => ({
    onAugmentPick(ctx) { ctx.discountUpgrade(num(p.n, 2)); },
    onLevelUp(ctx) { ctx.discountUpgrade(num(p.n, 2)); },
  }),
  aug_adversity: (p) => ({
    onBattleResult(ctx, ev) {
      const n = Math.min(num(p.max, 3), Math.ceil(Math.max(0, num(ev && ev.lpLoss)) / 2));
      if (n > 0) ctx.addPendingFunds(n);
    },
  }),
  aug_loot: (p) => ({ onBattleResult(ctx, ev) { if (ev && ev.perfect) ctx.addPendingFunds(num(p.funds, 2)); } }),
  // 晋升奖金: a chess merge (an elite) — funds now, at most max a round
  aug_bonus: (p) => ({
    onMerge(ctx, ev) {
      if (!ev || ev.kind !== 'chess') return;
      const k = roundKey(ctx, 'aug:bonus');
      if (ctx.counter(k) >= num(p.max, 2)) return;
      ctx.incCounter(k, 1);
      ctx.addFunds(num(p.funds, 1), 'augment:aug_bonus');
    },
  }),
  // 豪赌: 幸运 raises the chance to win (a good outcome)
  aug_gamble: (p) => ({
    onRoundStart(ctx) {
      if (ctx.rng() < goodChance(pct(p.win), luckOf(ctx.augments(), ctx.enemyBuffs?.()))) {
        ctx.addFunds(num(p.gain, 4), 'augment:aug_gamble');
        ctx.toast(msg('豪赌：获得 {n} 资金', { n: num(p.gain, 4) }));
      } else if (ctx.funds() > 0) {
        ctx.addFunds(-num(p.loss, 1), 'augment:aug_gamble');
        ctx.toast(msg('豪赌：失去 {n} 资金', { n: num(p.loss, 1) }), 'warn');
      }
    },
  }),
  // 冻结优惠: a slot frozen over the round start (`kept`, economy.js rollShop) costs n less, at most max a round
  aug_freezedeal: (p) => ({
    onPrice(ctx, ev) {
      if (!ev || !ev.slot || ev.slot.kind !== 'chess' || !ev.slot.kept) return;
      if (ctx.counter(roundKey(ctx, 'aug:freezedeal')) >= num(p.max, 2)) return;
      const price = Number(ev.price) || 0;
      if (price > 1) ev.price = Math.max(1, price - num(p.n, 1));
    },
    onBuy(ctx, ev) { if (ev && ev.kind === 'chess' && ev.slot && ev.slot.kept) ctx.incCounter(roundKey(ctx, 'aug:freezedeal'), 1); },
  }),
  // 盟约火种: the active bond with the fewest layers (NO_STACK left out; ties: the data's order)
  aug_spark: (p) => ({
    onRoundStart(ctx) {
      const list = stackable(ctx).sort((a, b) => (a[1].layers ?? 0) - (b[1].layers ?? 0));
      for (const [id] of list.slice(0,2)) ctx.addLayers(id, num(p.layer, 2), { requireActive: true, reason: 'augment:aug_spark' });
    },
  }),
  // 主心骨: the active bond with the most members (ties: more layers)
  aug_backbone: (p) => ({
    onPrepEnd(ctx) {
      const list = stackable(ctx).sort((a, b) => (b[1].count ?? 0) - (a[1].count ?? 0) || (b[1].layers ?? 0) - (a[1].layers ?? 0));
      if (list.length) ctx.addLayers(list[0][0], num(p.layer, 3), { requireActive: true, reason: 'augment:aug_backbone' });
    },
  }),
  // 背水一战: the battles of a player at ≤ half its starting LP (the battle side reads data.low)
  aug_last_stand: () => ({
    onPrepEnd(ctx) {
      const ref = ctx.effect(KEY('aug_last_stand'));
      if (ref) ref.data = { low: ctx.lp() * 2 <= num(ctx.gd.startLp(ctx.bandId()), 28) };
    },
  }),
  // 天选之人: the round's 1/odds draw — the battles of this round read data.round; 幸运 raises the chance (a good outcome)
  aug_chosen: (p) => ({
    onRoundStart(ctx) {
      const ref = ctx.effect(KEY('aug_chosen'));
      if (!ref || !(ctx.rng() < goodChance(1 / Math.max(1, num(p.odds, 6)), luckOf(ctx.augments(), ctx.enemyBuffs?.())))) return;
      ref.data = { round: ctx.round };
      ctx.ticker(msg('天选降临 {name}', { name: ctx.name }));
    },
  }),
  // 慧眼: the round's first manual refresh shows one of the near-merges, when the pool has a copy
  aug_eye: () => ({
    onRefresh(ctx, ev) {
      if ((ev && ev.trigger) || ctx.roundStats().refreshes !== 1) return;
      const bases = nearMerges(ctx);
      if (bases.length) ensureInShop(ctx, (id) => bases.includes(ctx.gd.baseIdOf(id)));
    },
  }),
  // 同乡会: the round start's shop (and the pick's) shows a member of the core bond with the most board members
  aug_hometown: () => {
    const run = (ctx) => {
      const b = topCoreOnBoard(ctx);
      if (b) ensureInShop(ctx, (id) => (ctx.chessRecord(id)?.bonds || []).includes(b));
    };
    return { onAugmentPick: run, onRoundStart: run };
  },
  // 精锐征召: on its rounds, a random normal board operator of the highest tier is promoted in place (no 获得时: a
  // promotion is not a gain — the 倒转 rules)
  aug_elite: (p) => ({
    onRoundStart(ctx) {
      if (!(p.rounds || []).includes(ctx.round)) return;
      const cands = ctx.board().filter((v) => v && v.kind === 'chess' && !ctx.gd.isGolden(v.id) && ctx.gd.goldenIdOf(v.id));
      if (!cands.length) return;
      const top = Math.max(...cands.map((v) => ctx.gd.tierOf(v.id)));
      const pick = ctx.rng.pick(cands.filter((v) => ctx.gd.tierOf(v.id) === top));
      if (ctx.promote(pick.uid)) ctx.toast(msg('精锐征召：{name}晋升为精锐', { name: dn(ctx.chessRecord(pick.id)?.name || '') }));
    },
  }),
  aug_projector: (p) => ({ onAugmentPick(ctx) { ctx.grantItem(p.item, { source: 'augment' }); } }),
  // 休整研读: a 进入休整期时 / 休整期结束时 特质's gain (ctx.addLayers carries the dispatch's hook) +1, at most max a round
  aug_study: (p) => ({
    onLayers(ctx, ev) {
      if (!ev || !String(ev.reason).startsWith('garrison:') || (ev.hook !== 'onRoundStart' && ev.hook !== 'onPrepEnd')) return;
      if (NO_STACK.has(ev.bondId)) return;
      const k = roundKey(ctx, 'aug:study');
      if (ctx.counter(k) >= num(p.max, 6)) return;
      if (ctx.addLayers(ev.bondId, 1, { reason: 'augment:aug_study' }) > 0) ctx.incCounter(k, 1);
    },
  }),
  // 小盟约专精 (prep): an add-on bond's 特质 gain +1; the round's room left goes to the battle (data.left)
  aug_minor: (p) => {
    const max = num(p.max, 6);
    const left = (ctx) => { const ref = ctx.effect(KEY('aug_minor')); if (ref) ref.data = { left: Math.max(0, max - ctx.counter(roundKey(ctx, 'aug:minor'))) }; };
    return {
      onAugmentPick: left,
      onRoundStart: left,
      onLayers(ctx, ev) {
        if (!ev || !String(ev.reason).startsWith('garrison:') || ctx.gd.bond(ev.bondId)?.isCore || NO_STACK.has(ev.bondId)) return;
        const k = roundKey(ctx, 'aug:minor');
        if (ctx.counter(k) >= max) return;
        if (ctx.addLayers(ev.bondId, 1, { reason: 'augment:aug_minor' }) > 0) ctx.incCounter(k, 1);
        left(ctx);
      },
    };
  },
  // 双重身份: every board operator of 2+ bonds (变形同构体's count) — each of its active bonds +layer
  aug_dual: (p) => ({
    onPrepEnd(ctx) {
      for (const v of ctx.board()) {
        if (!v || v.kind !== 'chess') continue;
        const bonds = ctx.pieceBonds(v.uid);
        if (bonds.length < 2) continue;
        for (const b of bonds) if (!NO_STACK.has(b)) ctx.addLayers(b, num(p.layer, 3), { requireActive: true, reason: 'augment:aug_dual' });
      }
    },
  }),
  // 转职许可: a 变形同构体 and a random item that pairs with it (a giveBondId of a bond this mode has on)
  aug_reclass: (p) => ({
    onAugmentPick(ctx) {
      ctx.grantItem(p.item, { source: 'augment' });
      const items = ctx.data && ctx.data.items && typeof ctx.data.items === 'object' ? Object.entries(ctx.data.items) : [];
      const off = ctx.gd.modeInactiveBonds instanceof Set ? ctx.gd.modeInactiveBonds : new Set();
      const list = items.filter(([, r]) => r && !r.isGolden && typeof r.giveBondId === 'string' && ctx.gd.bond(r.giveBondId) && !off.has(r.giveBondId)).map(([id]) => id).sort();
      if (list.length) ctx.grantItem(ctx.rng.pick(list), { source: 'augment' });
    },
  }),
  aug_resonance: (p) => ({
    onPrepEnd(ctx) {
      const list = stackable(ctx);
      if (list.length < 2) return;
      const [top, st] = list.reduce((a, b) => ((b[1].layers ?? 0) > (a[1].layers ?? 0) ? b : a));
      // (integer percent first: 100 × 0.29 would floor to 28)
      const add = Math.min(num(p.max, 10), Math.floor(((st.layers ?? 0) * num(p.pct)) / 100 + 1e-9));
      if (add > 0) for (const [b] of list) if (b !== top) ctx.addLayers(b, add, { requireActive: true, reason: 'augment:aug_resonance' });
    },
  }),
  aug_insurance: (p) => ({
    onPrepEnd(ctx) {
      if (ctx.round !== num(p.round, 13)) return;
      for (const [b] of stackable(ctx)) ctx.addLayers(b, num(p.layer, 15), { requireActive: true, reason: 'augment:aug_insurance' });
    },
  }),
  // 军需: n random tier 1–2 items now; one more (≤ the dispatch level) every `every` rounds after the pick
  aug_quartermaster: (p) => ({
    onAugmentPick(ctx) {
      for (let i = 0; i < num(p.n, 2); i++) { const id = ctx.rollItem({ maxTier: 2 }); if (id) ctx.grantItem(id, { source: 'augment' }); }
      ctx.setCounter('aug:qm:from', ctx.round);
    },
    onRoundStart(ctx) {
      const from = ctx.counter('aug:qm:from'), every = Math.max(1, num(p.every, 3));
      if (!(from > 0) || ctx.round <= from || (ctx.round - from) % every) return;
      const id = ctx.rollItem({ maxTier: Math.max(1, ctx.shopLevel()) });
      if (id) ctx.grantItem(id, { source: 'augment' });
    },
  }),
  // 整备: the next n items bought become their 进阶 version (one that merged at once is golden already: not counted)
  aug_refit: (p) => ({
    onBuy(ctx, ev) {
      if (!ev || ev.kind !== 'item' || !ev.piece || ctx.counter('aug:refit:n') >= num(p.n, 2)) return;
      const v = ctx.piece(ev.piece.uid);
      if (!v || ctx.gd.item(v.id)?.isGolden) return;
      if (ctx.upgradeItem(ev.piece.uid)) ctx.incCounter('aug:refit:n', 1);
    },
  }),
  aug_armory: (p) => ({ onAugmentPick(ctx) { ctx.addShopItemSlots(num(p.n, 1)); } }),
  // 守望相助: the 联防 enemies the player knocked out as a helper, next round (≤ max)
  aug_watch: (p) => ({
    onBattleResult(ctx, ev) {
      const up = ev && ev.unite && ev.unite.perPlayer ? ev.unite.perPlayer[ctx.playerId] : null;
      const n = Math.min(num(p.max, 3), Math.max(0, Math.trunc(num(up && up.killed))));
      if (n > 0) ctx.addPendingFunds(n);
    },
  }),
  aug_mutual: (p) => ({
    onRoundStart(ctx) {
      const mates = ctx.teammates();
      if (!mates.length) return;
      const avg = mates.reduce((s, t) => s + t.funds(), 0) / mates.length;
      if (ctx.funds() < avg) ctx.addFunds(num(p.funds, 1), 'augment:aug_mutual');
    },
  }),
  aug_allin: () => ({ onAugmentPick(ctx) { ctx.addDeployCap(-1); } }),
  // 扩编: the deployment and the income it costs (−income every round from the next)
  aug_expand: (p) => ({
    onAugmentPick(ctx) { ctx.addDeployCap(num(p.n, 1)); },
    onIncome(ctx, ev) { if (ev && Number.isFinite(ev.income)) ev.income = Math.max(0, ev.income - num(p.income, 1)); },
  }),
};

/**
 * The prep side of the 专属强化 (the strategies' own augments, the user's table of 2026-10-09). Timing as the strategy
 * they add to: 华法琳 at the prep end, 杜遥夜 / 梓兰 on a manual refresh, 小贾斯汀 / 老鲤 at round start.
 */
const EXCLUSIVE_META = {
  // 华法琳 II: the bond with the most of the player's board members gets mul × that count more layers
  aug_x_warfarin2: (p) => ({
    onPrepEnd(ctx) {
      const count = new Map();
      for (const pc of ctx.board()) if (pc && pc.kind === 'chess') for (const b of metaBonds(ctx, pc)) count.set(b, (count.get(b) ?? 0) + 1);
      let best = null, n = 0;
      for (const [b, k] of count) if (k > n) { best = b; n = k; }
      if (best && n > 0) ctx.addLayers(best, num(p.mul, 2) * n, { requireActive: false, reason: 'band' });
    },
  }),
  // 华法琳 III 「改为」: every board operator → each of its bonds +layer (the strategy's own handler steps aside)
  aug_x_warfarin3: (p) => ({
    onPrepEnd(ctx) {
      for (const pc of ctx.board()) if (pc && pc.kind === 'chess') for (const b of metaBonds(ctx, pc)) ctx.addLayers(b, num(p.layer, 2), { requireActive: false, reason: 'band' });
    },
  }),
  // 阿米娅 II: a 寻呼模块 now and one at the next round start
  aug_x_amiya2: (p) => ({
    onAugmentPick(ctx) { ctx.grantItem(p.item, { source: 'augment' }); ctx.setCounter('aug:amiya2:at', ctx.round + 1); },
    onRoundStart(ctx) {
      if (ctx.counter('aug:amiya2:at') !== ctx.round) return;
      ctx.setCounter('aug:amiya2:at', 0);
      ctx.grantItem(p.item, { source: 'augment' });
    },
  }),
  // 杜遥夜 I: n free refreshes every round (this round included)
  aug_x_duyaoy1: (p) => ({
    onAugmentPick(ctx) { ctx.grantFreeRefresh(num(p.n, 2)); },
    onRoundStart(ctx) { ctx.grantFreeRefresh(num(p.n, 2)); },
  }),
  // 杜遥夜 III: in the strategy's special refreshes (the first 2 manual ones of the round) one more <炎> chess of the
  // dispatch level's tier, put in a non-<炎> chess slot [ASSUMED: the shop keeps its slot count] (a lower tier when that
  // tier has none left)
  aug_x_duyaoy3: (p) => ({
    onRefresh(ctx, ev) {
      if ((ev && ev.trigger) || (ctx.roundStats().refreshes || 0) > 2) return;
      const slots = ctx.shopSlots();
      const isBond = (id) => { const c = ctx.gd.chess(id); return !!(c && Array.isArray(c.bonds) && c.bonds.includes(p.bond)); };
      const free = chessSlots(ctx).filter((i) => !slots[i].frozen && !isBond(slots[i].id));
      if (!free.length) return;
      for (let tier = Math.max(1, ctx.shopLevel()); tier >= 1; tier--) {
        const id = ctx.rollChess({ bond: p.bond, tier });
        if (id) { ctx.setShopSlot(ctx.rng.pick(free), { kind: 'chess', id }); return; }
      }
    },
  }),
  // 歌利亚 III: every `per` LP lost → `funds`, at the next prep (the table of 2026-10-10: 每损失2点生命值，获得3资金; an
  // odd point carries over to the next loss)
  aug_x_goliath3: (p) => ({
    onBattleResult(ctx, ev) {
      const n = Math.max(0, Math.trunc(num(ev && ev.lpLoss)));
      if (!(n > 0)) return;
      const per = Math.max(1, Math.trunc(num(p.per, 2)));
      const lost = ctx.incCounter('aug:goliath3:lp', n);
      const due = Math.floor(lost / per) - ctx.counter('aug:goliath3:paid');
      if (due > 0) { ctx.incCounter('aug:goliath3:paid', due); ctx.addPendingFunds(due * num(p.funds, 3)); }
    },
  }),
  // 梓兰 II: the pair the strategy's special refresh makes (a chess twice, one copy frozen) costs n less, both copies
  aug_x_orchid2: (p) => ({
    onRefresh(ctx, ev) {
      if (ev && ev.trigger) return;
      const slots = ctx.shopSlots();
      const by = new Map();
      for (const i of chessSlots(ctx)) { if (!by.has(slots[i].id)) by.set(slots[i].id, []); by.get(slots[i].id).push(i); }
      for (const [id, idx] of by) {
        if (idx.length < 2 || !idx.some((i) => slots[i].frozen)) continue;
        const price = Math.max(0, ctx.gd.chessPrice(id) - num(p.n, 1));
        for (const i of idx.slice(0, 2)) ctx.setShopSlot(i, { kind: 'chess', id, frozen: slots[i].frozen, price });
        return;
      }
    },
  }),
  // 小贾斯汀 I: a 进阶 骑士储蓄罐 now (the table of 2026-10-10; its II is gone)
  aug_x_justin1: (p) => ({ onAugmentPick(ctx) { ctx.setCounter('aug:justin1:due',ctx.round+1); }, onRoundStart(ctx) {if(ctx.counter('aug:justin1:due')===ctx.round){ctx.setCounter('aug:justin1:due',0);ctx.grantItem(p.item,{source:'augment'});}} }),
  // 小贾斯汀 III: every `step` funds used in a round → 1 at the next round start, at most max
  aug_x_justin3: (p) => ({
    onSpend(ctx, ev) { if (ev && ev.amount > 0) ctx.incCounter(`aug:justin3:${ctx.round}`, ev.amount); },
    onRoundStart(ctx) {
      const n = Math.min(num(p.max, 5), Math.floor(ctx.counter(`aug:justin3:${ctx.round - 1}`) / Math.max(1, num(p.step, 8))));
      if (n > 0) ctx.addFunds(n, 'augment:aug_x_justin3');
    },
  }),
  // 老鲤 III: the next round's prep start gives a random tier-6 elite (the lost round and the held funds:
  // server/match/match/augments.js)
  aug_x_lmlee3: (p) => ({
    onAugmentPick(ctx) { ctx.setCounter('aug:lmlee3:at', ctx.round + 1); },
    onRoundStart(ctx) {
      if (ctx.counter('aug:lmlee3:at') !== ctx.round) return;
      ctx.setCounter('aug:lmlee3:at', 0);
      const id = ctx.rollChess({ tier: num(p.tier, 6) }) || ctx.rollChess({ maxTier: num(p.tier, 6) });
      if (id) ctx.grantChess(id, { golden: true, requirePool: false, source: 'augment' });
    },
  }),
  // 绮良 I 「改为」: every `step` funds gained → a random chess ≤ the dispatch level (the strategy's spend count steps aside)
  aug_x_kirara1: (p) => ({
    onFundsGain(ctx, ev) {
      const step = Math.max(1, num(p.step, 16));
      let acc = ctx.incCounter('aug:kirara1:acc', Math.max(0, Math.trunc(num(ev && ev.amount))));
      while (acc >= step) {
        acc = ctx.incCounter('aug:kirara1:acc', -step);
        const id = ctx.rollChess({ maxTier: Math.max(1, ctx.shopLevel()) });
        if (id) ctx.grantChess(id, { source: 'augment' });
      }
    },
  }),
  // 绮良 II: every `step` funds gained → 1 more (not counted itself)
  aug_x_kirara2: (p) => ({
    onFundsGain(ctx, ev) {
      const step = Math.max(1, num(p.step, 10));
      let acc = ctx.incCounter('aug:kirara2:acc', Math.max(0, Math.trunc(num(ev && ev.amount))));
      while (acc >= step) { acc = ctx.incCounter('aug:kirara2:acc', -step); ctx.addFunds(1, 'augment:aug_x_kirara2'); }
    },
  }),
  // 绮良 III: the funds used since the pick, kept on the EffectRef's counter (the battle reads it)
  aug_x_kirara3: () => ({
    onSpend(ctx, ev) {
      if (!(ev && ev.amount > 0)) return;
      const n = ctx.incCounter('aug:kirara3:spent', ev.amount);
      ctx.setEffectCounter(KEY('aug_x_kirara3'), n);
    },
  }),

  // ---- the table's rows 19–56. Changes to a strategy's own handler (休露丝 I, 潘格尼尼 II, 余 II's step aside, 凯瑟琳 II,
  // 坎诺特 II, 鸭爵 II, 铃兰 II, 玛恩纳 II): bands/meta.js; to an item (杜宾, 杰西卡, 缪尔赛思's marks, 芬, 马克维茨):
  // items/meta.js; 贾维 II: garrisons/meta.js; 夕 III / 变形者集群 III's counting: server/match/bondsMeta.js.

  // 佩佩 II: the round's first <萨尔贡> bought refunds `refund` (the table of 2026-10-10: and the 6-member ATK cap is
  // lifted — server/sim/content/bonds/core.js installSargon)
  aug_x_pepe2: (p) => ({
    onBuy(ctx, ev) {
      if (!ev || ev.kind !== 'chess' || !ev.slot) return;
      const rec = ctx.chessRecord(ev.slot.id);
      if (!rec || !Array.isArray(rec.bonds) || !rec.bonds.includes('sargonShip')) return;
      const k = roundKey(ctx, 'aug:pepe2');
      if (ctx.counter(k) > 0) return;
      ctx.setCounter(k, 1);
      ctx.addFunds(num(p.refund, 1), 'augment:aug_x_pepe2');
    },
  }),
  // 哈洛德 II: every `every` rounds after the pick, one more <维多利亚> (the strategy's gift: ≤ the dispatch level, else any
  // tier) — the table's <干员惊喜盒子> read as the strategy's 人才盲盒 [ASSUMED: no such item in the data]
  aug_x_harold2: (p) => ({
    onAugmentPick(ctx) { ctx.setCounter('aug:harold2:from', ctx.round); },
    onRoundStart(ctx) {
      const from = ctx.counter('aug:harold2:from'), every = Math.max(1, num(p.every, 2));
      if (!(from > 0) || ctx.round <= from || (ctx.round - from) % every !== 0) return;
      const owned = new Set([...ctx.board(),...ctx.hand(),...ctx.temp()].filter(v=>v?.kind==='chess').map(v=>ctx.gd.baseIdOf(v.id)));
      const id = ctx.rollChess({ bond: p.bond, maxTier: Math.max(1, ctx.shopLevel()), filter:id=>!owned.has(ctx.gd.baseIdOf(id)) }) || ctx.rollChess({ bond: p.bond, maxTier: Math.max(1, ctx.shopLevel()) }) || ctx.rollChess({ bond:p.bond,maxTier:6 });
      if (id) ctx.grantChess(id, { source: 'augment' });
    },
  }),
  // 哈洛德 III: a 维娜·维多利亚 now, and one per `step` <奇迹> layers held (those held already included)
  aug_x_harold3: (p) => {
    const step = Math.max(1, num(p.step, 50));
    const due = (ctx) => {
      const k = Math.floor(ctx.layers('miraShip') / step);
      while (ctx.counter('aug:harold3:paid') < k) { ctx.incCounter('aug:harold3:paid', 1); ctx.grantChess(p.chess, { source: 'augment' }); }
    };
    return {
      onAugmentPick(ctx) { ctx.grantChess(p.chess, { source: 'augment' }); due(ctx); },
      onLayers(ctx, ev) { if (ev && ev.bondId === 'miraShip') due(ctx); },
    };
  },
  // 休露丝 II (III before the table of 2026-10-10): a <谢拉格> gained counts as gained once more (ctx.echoGain: its 获得时
  // 特质, the round's gain count)
  aug_x_sciurus2: () => ({
    onGain(ctx, ev) {
      if (!ev || ev.kind !== 'chess' || !ev.piece || ev.source === 'echo') return;
      const rec = ctx.chessRecord(ev.piece.id);
      if (rec && Array.isArray(rec.bonds) && rec.bonds.includes('kjeragShip')) ctx.echoGain(ev.piece.uid);
    },
  }),
  // 潘格尼尼 III: once `coin` funds are used after the pick — a random tier-6 elite, a 变形同构体 and a 拉特兰桥夹
  aug_x_paganini3: (p) => ({
    onSpend(ctx, ev) {
      if (ctx.counter('aug:pag3:done') > 0 || !(ev && ev.amount > 0)) return;
      if (ctx.incCounter('aug:pag3:spent', ev.amount) < num(p.coin, 30)) return;
      ctx.setCounter('aug:pag3:done', 1);
      const id = ctx.rollChess({ tier: 6 });
      if (id) ctx.grantChess(id, { golden: true, source: 'augment' });
      ctx.grantItem('chess_item_6_09_e_a', { source: 'augment' });
      ctx.grantItem('chess_item_4_08_e_a', { source: 'augment' });
    },
  }),
  // 余 II 「改为」: round `round` start — every active bond +layer
  aug_x_yu2: (p) => ({
    onRoundStart(ctx) {
      if (ctx.round !== num(p.round, 8)) return;
      for (const [b, st] of Object.entries(ctx.bonds())) if (st && st.active) ctx.addLayers(b, num(p.layer, 36), { requireActive: true, reason: 'band' });
    },
  }),
  // 变形者集群 I (II before the table of 2026-10-10): every round start, a random item that pairs with 变形同构体 (a
  // giveBondId of a bond this mode has on)
  aug_x_damaztic1: () => ({
    onRoundStart(ctx) {
      const items = ctx.data && ctx.data.items && typeof ctx.data.items === 'object' ? Object.entries(ctx.data.items) : [];
      const off = ctx.gd.modeInactiveBonds instanceof Set ? ctx.gd.modeInactiveBonds : new Set();
      const list = items.filter(([, r]) => r && !r.isGolden && typeof r.giveBondId === 'string' && ctx.gd.bond(r.giveBondId) && !off.has(r.giveBondId)).map(([id]) => id).sort();
      if (list.length) ctx.grantItem(ctx.rng.pick(list), { source: 'augment' });
    },
  }),
  // 变形者集群 II (III before the table of 2026-10-10): a 变形同构体 now; at the prep end the board operators 调和 by a
  // pair are noted for the battle
  aug_x_damaztic2: (p) => ({
    onAugmentPick(ctx) { ctx.grantItem(p.item, { source: 'augment' }); },
    onPrepEnd(ctx) {
      const uids = ctx.board().filter((v) => v && v.kind === 'chess' && ctx.pieceBonds(v.uid).includes('maniShip')
        && !(ctx.chessRecord(v.id)?.bonds || []).includes('maniShip')).map((v) => v.uid);
      const ref = ctx.effect(KEY('aug_x_damaztic2'));
      if (ref) ref.data = { harmony: uids };
    },
  }),
  aug_x_pith2: (p) => pithLayers(p, true),
  aug_x_pith3: (p) => pithLayers(p, false),
  // 巫恋 II: the round's first operator sold (its normal form) shows in the shop at the next round start — when the pool
  // still has a copy (else the augment does nothing that round)
  aug_x_vodfox2: () => ({
    onSold(ctx, ev) {
      const piece = ev && ev.piece;
      const ref = ctx.effect(KEY('aug_x_vodfox2'));
      if (!piece || piece.kind !== 'chess' || !ref || (ref.data && ref.data.round === ctx.round)) return;
      ref.data = { round: ctx.round, id: ctx.gd.baseIdOf(piece.id) };
    },
    onRoundStart(ctx) {
      const d = ctx.effect(KEY('aug_x_vodfox2'))?.data;
      if (!d || d.round !== ctx.round - 1 || !d.id) return;
      const id = ctx.rollChess({ filter: (x) => x === d.id });
      const slots = ctx.shopSlots();
      const free = chessSlots(ctx).filter((i) => !slots[i].frozen);
      if (id && free.length) ctx.setShopSlot(ctx.rng.pick(free), { kind: 'chess', id });
    },
  }),
  // 伊奥莱塔 II: round start — `funds` per `per` elites on the board
  aug_x_ioleta2: (p) => ({
    onRoundStart(ctx) {
      const n = ctx.board().filter((v) => v && v.kind === 'chess' && ctx.gd.isGolden(v.id)).length;
      const f = Math.floor(n / Math.max(1, num(p.per, 2))) * Math.max(0, Math.trunc(num(p.funds, 1)));
      if (f > 0) ctx.addFunds(f, 'augment:aug_x_ioleta2');
    },
  }),
  // 缪尔赛思 II: a 博士投影 now; an operator a strategy's / 海克斯's 博士投影 was used on (items/meta.js marks it) gives one
  // back when sold
  aug_x_mlyss2: (p) => ({
    onAugmentPick(ctx) { ctx.grantItem(p.item, { source: 'augment' }); },
    onSold(ctx, ev) {
      const piece = ev && ev.piece;
      if (!piece || piece.kind !== 'chess' || !(ctx.counter(`mlyss:used:${piece.uid}`) > 0)) return;
      ctx.setCounter(`mlyss:used:${piece.uid}`, 0);
      ctx.grantItem(p.item, { source: 'augment' });
    },
  }),
  // 玛恩纳 III: a <卡西米尔> gained — its bonds +layer (无需激活); every `per` of them +1 fund
  aug_x_mlynar3: (p) => ({
    onGain(ctx, ev) {
      if (!ev || ev.kind !== 'chess' || !ev.piece || ev.source === 'echo') return;
      const rec = ctx.chessRecord(ev.piece.id);
      if (!rec || !Array.isArray(rec.bonds) || !rec.bonds.includes(p.bond)) return;
      const bonds = ctx.piece(ev.piece.uid) ? ctx.pieceBonds(ev.piece.uid) : rec.bonds;
      for (const b of bonds) ctx.addLayers(b, num(p.layer, 3), { requireActive: false, reason: 'augment' });
      if (ctx.incCounter('aug:mlynar3:n', 1) % Math.max(1, num(p.per, 3)) === 0) ctx.addFunds(1, 'augment:aug_x_mlynar3');
    },
  }),
};

/** Pith II / III: at the prep end with Pith's operator on the board, the active core (II) / other (III) bonds +layer. */
const PITH_CHESS = 'chess_char_1_15_a';
function pithLayers(p, core) {
  return {
    onPrepEnd(ctx) {
      if (!ctx.board().some((v) => v && v.kind === 'chess' && ctx.gd.baseIdOf(v.id) === PITH_CHESS)) return;
      for (const [b, st] of Object.entries(ctx.bonds())) {
        if (!st || !st.active || !!ctx.gd.bond(b)?.isCore !== core) continue;
        ctx.addLayers(b, num(p.layer, 10), { requireActive: true, reason: 'band' });
      }
    },
  };
}
