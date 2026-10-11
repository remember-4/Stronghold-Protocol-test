// server/sim/content/classAugments.js — A6000 fork: 职业专精 (the per-profession 海克斯 the user asked for while playtesting,
// 2026-10-09: 「更有联动性」 — they reward fielding more operators of one profession). The definitions and numbers:
// shared/augments.js (`cls`: the profession); the offer (a fourth kind of card, for a profession the player fields at
// least twice): shared/augments.js rollAugments + server/match/match/augments.js classCounts.
//
// `n` below is the number of the player's operators of that profession in the battle (the board's, created at the build;
// summons are not operators), capped by the augment's `max`. Number bonuses are independent multipliers like the generic
// ones (content/augments.js): atkMul / hpMul / defMul (攻击力 / 最大生命 / 防御力 +X%), intervalMul (攻击间隔缩短),
// dmgTakenMul (受到的伤害降低), augDealtMul (造成的伤害提升), and a hit's augMul (damage.js 限伤保护) for the conditional
// ones; flat stats add: blockCnt, rangeExtend, maxTargets, dodgePhys, defIgnorePct / resIgnorePct, hpRegenRatio.
// Installed by content/augments.js installPlayer for an augment whose definition has `cls`.

import { num, isOp, playerOps, passiveBuff, alliesAround, N8 } from './support/index.js';

const KEY = (id) => `augment:${id}`;
const pct = (v) => num(v) / 100;
const cut = (v) => Math.max(0, 1 - pct(v));
const faster = (v) => Math.max(0.1, 1 - pct(v));
/** The profession of a unit (its normalised def's; a 补位 / 自选 operator's is the operator it fields). */
export const professionOf = (u) => (u && u.def && typeof u.def.profession === 'string' ? u.def.profession : null);

/**
 * Battle side of one 职业专精 `id` (definition `def`, params `p`) of player `ps`.
 * @param {object} battle
 * @param {{ playerId: string }} ps
 * @param {string} id
 * @param {{ cls: string, params: object }} def
 */
export function installClass(battle, ps, id, def) {
  const pid = ps.playerId;
  const p = def.params || {};
  const cls = def.cls;
  const key = KEY(id);
  const ops = playerOps(battle, pid);
  const ofClass = (u) => isOp(u) && u.ownerId === pid && professionOf(u) === cls;
  const mineOp = (u) => isOp(u) && u.ownerId === pid;
  const members = ops.filter(ofClass);
  const n = Math.min(Math.max(0, Math.round(num(p.max, 5))), members.length);
  const buffClass = (mods) => { for (const u of members) passiveBuff(battle, u, key, mods); };
  // the team part has its own key: on an operator of the profession it adds to the class part (a buff of the same key
  // would replace it)
  const buffAll = (mods, extra) => { for (const u of ops) passiveBuff(battle, u, `${key}:all`, mods, extra); };
  switch (id) {
    // ---- 先锋
    case 'aug_c_pioneer1': {
      buffClass({ atkMul: 1 + pct(p.atk) });
      // the opening rush: every operator of the player, for the first sec seconds of the battle
      if (n > 0) {
        battle.on('battleStart', () => {
          for (const u of ops) if (u.alive) battle.addBuff(u, { key: `${key}:rush`, mods: { intervalMul: faster(num(p.pct) * n) }, duration: num(p.sec, 15), visible: true, refresh: 'replace' });
        });
      }
      break;
    }
    case 'aug_c_pioneer2': {
      if (n > 0) buffAll({ redeployMul: faster(num(p.pct) * n) });
      const cd = num(p.cd, 1);
      let at = -Infinity;
      battle.on('death', (c) => {
        const e = c.unit;
        if (!e || e.side !== 'enemy' || c.reason !== 'killed' || !ofClass(c.killer)) return;
        if (battle.time - at < cd - 1e-9) return;
        at = battle.time;
        for (const u of ops) if (u.alive && u.deployed && u.skill && !u.skill.noSkill) u.skill.gainSp(num(p.sp, 1), 'augment');
      });
      break;
    }
    case 'aug_c_pioneer3': {
      buffClass({ blockCnt: Math.round(num(p.block, 1)), hpMul: 1 + pct(p.hp) });
      if (n > 0) {
        battle.on('battleStart', () => {
          for (const u of ops) if (u.alive && u.skill && !u.skill.noSkill) u.skill.gainSp(num(p.sp) * n, 'init');
        });
      }
      break;
    }
    // ---- 近卫
    case 'aug_c_warrior1': buffClass({ atkMul: 1 + pct(p.atk), dmgTakenMul: cut(num(p.pct) * n) }); break;
    case 'aug_c_warrior2': {
      const share = pct(p.heal);
      battle.on('damaged', (c) => {
        const s = c.source;
        if (!ofClass(s) || !s.alive || !(c.amount > 0) || c.type === 'element') return;
        battle.heal(s, s, c.amount * share, { self: true, silent: true });
      });
      // while blocking: a short buff kept up by the blocker's own state (re-read every quarter second)
      const mods = { intervalMul: faster(p.pct) };
      let acc = 0.25;
      battle.on('tick', ({ dt }) => {
        acc += dt ?? battle.dt;
        if (acc < 0.25 - 1e-9) return;
        acc = 0;
        for (const u of members) {
          if (u.alive && u.deployed && Array.isArray(u.blocking) && u.blocking.length) {
            battle.addBuff(u, { key: `${key}:block`, mods, duration: 0.4, refresh: 'extend', visible: true });
          }
        }
      });
      break;
    }
    case 'aug_c_warrior3': buffClass({ maxTargets: Math.round(num(p.n, 1)), augDealtMul: 1 + pct(num(p.pct) * n) }); break;
    // ---- 重装
    case 'aug_c_tank1': {
      buffClass({ hpMul: 1 + pct(p.hp) });
      if (n > 0) buffAll({ defMul: 1 + pct(num(p.pct) * n) });
      break;
    }
    case 'aug_c_tank2': buffClass({ blockCnt: Math.round(num(p.block, 1)), dmgTakenMul: cut(p.pct) }); break;
    case 'aug_c_tank3': {
      const amp = 1 + pct(p.amp), per = pct(p.pct), most = Math.max(0, Math.round(num(p.max, 3)));
      battle.on('hit', (c) => {
        const t = c.target;
        if (!t || !c.dmg) return;
        // an enemy one of the player's 重装 blocks takes more (any source); a blocking 重装 takes less per enemy it blocks
        if (t.side === 'enemy' && ofClass(t.blockedBy) && t.blockedBy.alive) c.dmg.augMul *= amp;
        else if (ofClass(t) && Array.isArray(t.blocking) && t.blocking.length) c.dmg.mul *= Math.max(0, 1 - per * Math.min(most, t.blocking.length));
      });
      break;
    }
    // ---- 狙击
    case 'aug_c_sniper1': {
      buffClass({ atkMul: 1 + pct(p.atk) });
      const mul = pct(p.fly);
      battle.on('hit', (c) => { if (ofClass(c.source) && c.target && c.target.side === 'enemy' && c.target.isFlying && c.dmg) c.dmg.augMul *= mul; });
      break;
    }
    case 'aug_c_sniper2': buffClass({ rangeExtend: Math.round(num(p.n, 1)), intervalMul: faster(num(p.pct) * n) }); break;
    case 'aug_c_sniper3': buffClass({ maxTargets: Math.round(num(p.n, 1)), defIgnorePct: pct(p.pct) }); break;
    // ---- 术师
    case 'aug_c_caster1': buffClass({ atkMul: 1 + pct(p.atk), spRecoveryMul: 1 + pct(p.sp) }); break;
    case 'aug_c_caster2': buffClass({ resIgnorePct: pct(p.res), augDealtMul: 1 + pct(num(p.pct) * n) }); break;
    case 'aug_c_caster3': {
      // the mark: a visible debuff on the enemy; the player's and everyone's 法术 damage on it is raised while it lasts
      const amp = 1 + pct(num(p.amp) + num(p.pct) * n), sec = num(p.sec, 5);
      const mark = `${key}:mark`;
      battle.on('damaged', (c) => {
        const t = c.target;
        if (!ofClass(c.source) || !t || t.side !== 'enemy' || !t.alive || !(c.amount > 0)) return;
        battle.addBuff(t, { key: mark, mods: {}, duration: sec, refresh: 'replace', visible: true });
      });
      battle.on('hit', (c) => {
        const t = c.target;
        if (t && t.side === 'enemy' && c.dmg && c.dmg.type === 'arts' && t.findBuff && t.findBuff(mark)) c.dmg.augMul *= amp;
      });
      break;
    }
    // ---- 医疗
    case 'aug_c_medic1': {
      buffClass({ healingDealtMul: pct(p.heal) });
      if (n > 0) buffAll({ hpMul: 1 + pct(num(p.pct) * n) });
      break;
    }
    case 'aug_c_medic2': {
      const cap = pct(p.cap), sec = num(p.sec, 8);
      battle.on('heal', (ctx) => {
        const t = ctx.target;
        if (!ofClass(ctx.source) || !mineOp(t) || ctx.source === t || (ctx.opts && ctx.opts.regen)) return;
        const max = t.s.maxHp;
        const over = num(ctx.amount) - Math.max(0, max - t.hp);
        if (!(over > 0)) return;
        const cur = t.findBuff ? t.findBuff(key) : null;
        const val = Math.min(max * cap, (cur && cur.shield > 0 ? cur.shield : 0) + over);
        if (val > 0) battle.addBuff(t, { key, shield: val, duration: sec, refresh: 'replace', visible: true });
      });
      break;
    }
    case 'aug_c_medic3': {
      if (n > 0) buffAll({ hpRegenRatio: pct(num(p.regen) * n) });
      const share = pct(p.splash);
      let splashing = false;
      battle.on('heal', (ctx) => {
        const s = ctx.source, t = ctx.target;
        if (splashing || !ofClass(s) || !mineOp(t) || s === t || (ctx.opts && (ctx.opts.regen || ctx.opts.self))) return;
        const amount = num(ctx.amount) * share;
        if (!(amount > 0)) return;
        splashing = true;
        try {
          for (const v of alliesAround(battle, t, N8)) if (v !== s && v.alive) battle.heal(s, v, amount, { silent: true, regen: true });
        } finally { splashing = false; }
      });
      break;
    }
    // ---- 辅助
    case 'aug_c_support1': buffClass({ atkMul: 1 + pct(p.atk), spRecoveryMul: 1 + pct(p.sp) }); break;
    case 'aug_c_support2': {
      const mods = { augTakenMul: 1 + pct(num(p.amp) + num(p.pct) * n) }, sec = num(p.sec, 4);
      battle.on('damaged', (c) => {
        const t = c.target;
        if (!ofClass(c.source) || !t || t.side !== 'enemy' || !t.alive || !(c.amount > 0)) return;
        battle.addBuff(t, { key: `${key}:weak`, mods, duration: sec, refresh: 'replace', visible: true });
      });
      break;
    }
    case 'aug_c_support3': {
      buffClass({ atkMul: 1 + pct(p.atk) });
      if (n > 0) buffAll({ spRecoveryMul: 1 + pct(num(p.pct) * n) });
      break;
    }
    // ---- 特种
    case 'aug_c_special1': buffClass({ redeployMul: faster(p.pct), atkMul: 1 + pct(p.atk) }); break;
    case 'aug_c_special2': {
      const below = pct(p.hpPct), mul = pct(p.dealt) + pct(num(p.pct) * n);
      battle.on('hit', (c) => {
        const t = c.target;
        if (!ofClass(c.source) || !t || t.side !== 'enemy' || !c.dmg || t.isBoss || t.bossPool) return;
        if (t.hp < t.s.maxHp * below) c.dmg.augMul *= mul;
      });
      break;
    }
    case 'aug_c_special3': {
      buffClass({ dodgePhys: pct(p.dodge) });
      const mods = { intervalMul: faster(p.pct) }, sec = num(p.sec, 5);
      battle.on('death', (c) => {
        const e = c.unit, k = c.killer;
        if (!e || e.side !== 'enemy' || c.reason !== 'killed' || !ofClass(k) || !k.alive) return;
        if (k.skill && !k.skill.noSkill) k.skill.gainSp(num(p.sp, 3), 'augment');
        battle.addBuff(k, { key: `${key}:rush`, mods, duration: sec, refresh: 'replace', visible: true });
      });
      break;
    }
    default: break;
  }
}
