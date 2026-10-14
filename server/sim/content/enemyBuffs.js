import { installEnemyHexRevision } from './enemyHexRevision.js';
// server/sim/content/enemyBuffs.js — A6000 fork: 敌人强化 (the enemies' upgrades) in battle, second version (by tier;
// the definitions and numbers: shared/enemyBuffs.js; the vote, the spawns a battle starts with, LP and funds:
// server/match/match/enemyVotes.js).
//
// The battle flags carry them (server/match/match/augments.js battleFlags → enemyVotes.js enemyBuffFlags): `enemyBuffs`
// (ids in vote order; one chosen twice counts twice) and, per round, `ebRound` { extra (盲盒 / 血月's upgrades of this
// round), marked (点名: a playerId), wanted (通缉令: playerId → board uid), adapt (适应: playerId → 'phys' | 'arts' |
// 'true'), fields (the boss fields of a leader fight) }. A leader (BOSS rank) takes LEADER_SHARE of a generic upgrade's
// numbers; the 首领 options act on the leaders of the leader fights (kind boss / hidden, the pool leader `isBoss`) only,
// at full value. The spawns some upgrades add (增援 / 狂潮 / 精英双生 / 窃贼 / 山芋 / 首领·亲卫 / 首领·护卫) are SpawnSpecs the
// match appends when it builds the battle, so a client's result stays checkable against its spec (server/match/fields.js);
// the 分裂 / 繁衍 children are content spawns, which specBounds is told about (enemyBuffBounds below).
//   at spawn      stats: 强壮 hpMul (not a pool leader) · 疾行 moveMul · 法抗 resFlat · 闪避 dodgePhys (≤ 0.8) · 甲胄 /
//                 真伤抗性 physTakenMul / trueTakenMul · 狂暴 atkMul · 再生 hpRegenRatio (not a pool leader) · 后援 hpMul when
//                 spawned at ≥ sec · 坚壁 / 钢铁之躯 dmgTakenMul · 精英强化 (ELITE) · 狂热 moveMul + aspd · 制空 (FLY) · 匿踪
//                 (acTypes INVISIBLE) · 点名 (the marked player's enemies) · 适应 (the owner's type) · 首领·狂暴 / 首领·铁壁;
//                 远射 a ranged enemy's rangeRadius; 护盾 a shield of pct % max HP — a pool leader pool × leaderPct / fields,
//                 once per battle (one share per leader fight, split over its fields)
//   roles         替身 / 医疗兵 / 统帅: queued spawns picked at install (this module's own rng): a stand-in (×hp, taunt), a
//                 medic (every sec heals the others within range by pct % max HP), a commander (an aura on the others
//                 within range: dmgTakenMul, moveMul — gone with it)
//   thresholds    狂怒 aspd / 冲刺 moveMul below hpPct; 跃迁 blinks once below hpPct (no leader); 首领·狂怒 below hpPct
//   statuses      坚定 control × max(0.1, 1 − pct·k); 控制递减 × (1 − pct)^k within sec after a control's end; 净化 the
//                 catalogue debuffs × (1 − pct)^k and the RES cut of a 灼燃 burst ends early (its lock stays)
//   damage        钝化 the HP part of a hit above pct % max HP × ½^k; 通缉令 / 蚀骨 / 元素过载 raise what enemies deal; 破甲
//                 stacks DEF cuts on the operators an enemy attacks
//   deaths        复仇 (ATK share to the operators within 1 tile) · 分裂 (copies at hp % each) · 繁衍 (one more 频次 child) ·
//                 不灭 (a knock-out revives at hp % with prob)
//   timers        冲撞 (blocked sec by one blocker: unblockable until past it, once) · 天灾 · 匿踪's speed while hidden · 强折射's RES
//                 while its 折射 is on · 首领·威压 (阻回 on the operators until sec)
// Third version (敌人强化第三版 §二, 2026-10-10):
//   our side      后勤不足 base.cost +cost at battleStart (after the strategies' cuts) · 补给延误 redeployMul · 信号干扰 the
//                 'time' SP gains × (1 − pct)^k · 医疗短缺 healingTakenMul · 首领·威慑 intervalMul (a leader fight) — the
//                 operators of the battle's players (not their summons); 精神污染 an enemy attack on an operator takes sp
//                 of its 技力 (once per attack; setSpTotal; a running timed skill keeps its bar)
//   at spawn      法术屏障 artsTakenMul · 首领·物理屏障 / 法术屏障 (the pool leader, full)
//   roles         先锋突击 (the first n of the queue: hpMul, moveMul) · 隐秘行动 (n random: 隐匿 sec s from its spawn) — beside
//                 any other role; 精英晋升 (a NORMAL one: ×hp, ×atk) · 刺客 (unblockable; ranged operators first, a melee one
//                 strikes within 1 tile) · 自爆兵 (blocked sec s: the operators within 1 tile take pct % of their max HP as
//                 physical damage, it is gone) — one role each, drawn after the second version's
//   damage taken  学习 (per attacker and enemy: −pct % every per attacks, at most max) · 军团 (the field's enemies / per) ·
//                 首领·共鸣 (the other enemies alive) · 召唤克星 (enemies' damage to summons +pct %) — the `hit` hook; 进化 a
//                 buff by the time on the field; 连结 (pairs by spawn order: half of what reaches the HP passes to the
//                 partner as a loss credited to the source)
//   layers        叠层税 a 'garrison' layerGain kept at layerTaxKeep · 削弱盟约 a battle-only layer bonus on each player's
//                 top active bond (its real layers at the install)
//   timers        时空裂隙 (n random enemies blink tiles forward) · 首领·护盾 (the pool's steps: a shield of the pool share /
//                 fields) · 首领·限伤 battle.hitLimit (damage.js hitLimitOf)
//   match side    时限压缩, 霉运, 首领·召唤 (spawns in the spec), 首领·复苏 (the shared pool): server/match/match/enemyVotes.js
// Nothing is installed when a battle has none: no hook, no random draw — the battles of upstream are unchanged. Every
// draw comes from this module's own stream (deriveSeed(battle seed, 'enemyBuffs')): battle.rng() keeps its sequence.

import { LEADER_SHARE, enemyBuffCounts, enemyBuffDef, layerTaxKeep } from '../../../shared/enemyBuffs.js';
import { BOSS_HIT_LIMIT } from '../../../shared/constants.js';
import { msg } from '../../../shared/i18n.js';
import { createRng, deriveSeed } from '../rng.js';
import { num, isOp, passiveBuff, bondState, activeBondIds, addLayerBonus, refreshLayerReaders } from './support/index.js';
import { spawnChildren } from './enemies/helpers.js';
import { blinkForward } from './enemies/archetypes.js';

const KEY = (id) => `enemyBuff:${id}`;
const pct = (v) => num(v) / 100;
const P = (id) => enemyBuffDef(id).params;
/** The control statuses 坚定 / 控制递减 shorten (beforeStatus on an enemy). */
const CONTROL = new Set(['stun', 'freeze', 'sleep', 'bind', 'levitate', 'fear', 'cold']);
/** The catalogue debuffs 净化 shortens: 脆弱, 法术 / 物理 / 元素脆弱, 减防, 减抗 (灼燃: the burn burst, elementBurst). */
const DEBUFF = new Set(['fragile', 'artsFragile', 'physFragile', 'elemFragile', 'defDown', 'resDown']);
const rankOf = (e) => String(e?.def?.rank ?? e?.def?.raw?.rank ?? 'NORMAL').toUpperCase();
/** A leader: BOSS rank (its parts too) — the generic upgrades' LEADER_SHARE. */
const isLeader = (e) => !!e && (e.isBoss || rankOf(e) === 'BOSS');
/** A leader whose HP is the shared pool: no HP upgrade reaches it (强壮 / 再生 「领袖无效」). */
const poolLeader = (e) => !!e && (e.isBoss || !!e.bossPool);
const shareOf = (e) => (isLeader(e) ? LEADER_SHARE : 1);
/** The 特训 types of an enemy (data/enemies.json acTypes: FLY / TIMES / ELEMENT / DOT / INVISIBLE / REFLECTION / SPECIAL). */
const acTypes = (e) => { const t = e?.def?.raw?.acTypes; return Array.isArray(t) ? t : []; };
/** The spawns of the upgrades themselves (窃贼 'eb_thief', 山芋 'eb_potato'): no role, no split, no second life. */
const ebTagged = (e) => typeof e?.tag === 'string' && e.tag.startsWith('eb_');
const TAKEN = { phys: 'physTakenMul', arts: 'artsTakenMul', true: 'trueTakenMul' };
/** A foe of the field (the third version's counts and picks): not a 海克斯 training dummy (tag 'augDummy', it never leaks). */
const realFoe = (e) => !!e && e.alive && e.tag !== 'augDummy' && !e.mem.noLeak;
/** A leader's minion for 首领·共鸣: an enemy of the field that is no leader and no part of one. */
const minion = (e) => realFoe(e) && !isLeader(e) && !e.bossPool && e.tag !== 'part' && e.tag !== 'boss';
/** 刺客's first targets. */
const RANGED_OP = (u) => isOp(u) && u.def?.position === 'RANGED';
/** The roles an enemy may hold beside another one (the others: one each). */
const SHARED_ROLES = new Set(['vanrush', 'stealth']);

function installEnemyBuffs(battle, counts, R) {
  const k = (id) => counts.get(id) ?? 0;
  const rng = createRng(deriveSeed(battle.seed, 'enemyBuffs'));
  const bossFight = battle.kind === 'boss' || battle.kind === 'hidden';
  // whose field an enemy is on (点名 / 适应, "他 / 你战场里的敌人"): its owner — none in a 联防, the helpers' field, where
  // a leaker's enemies are no longer on its own
  const fieldOf = (e) => (battle.kind === 'unite' ? null : e.ownerId);

  // ---- roles (替身 / 医疗兵 / 统帅): queued spawns, picked now; a spawn is matched to its queue entry by the queue's length
  const roles = pickRoles(battle, k, rng);
  if (roles.size) {
    const total = battle._pending.length;
    let left = total;
    // first of every enemySpawn handler: a kit's spawn handler may spawn children, whose spawns must not take the role
    battle.on('enemySpawn', ({ enemy: e }) => {
      const now = battle._pending.length;
      if (!e || now >= left) return; // a content spawn: the queue did not move
      left = now;
      const list = roles.get(total - now - 1);
      if (list) { e.mem.ebRoles = list; e.mem.ebRole = list.find((r) => !SHARED_ROLES.has(r)) ?? null; }
    }, { priority: 1000 });
  }

  // 连结: the enemies pair up as they spawn (one waits for the next)
  let link = null;
  if (k('eb_link')) {
    let waiting = null;
    link = (e) => {
      if (isLeader(e) || e.bossPool || e.tag === 'part' || e.tag === 'boss' || !realFoe(e) || e.s.flags.hitCount || e.s.flags.hitCountArts) return;
      if (waiting && waiting.alive && waiting !== e) {
        e.mem.ebLink = waiting;
        waiting.mem.ebLink = e;
        for (const x of [e, waiting]) battle.addBuff(x, { key: KEY('link'), persist: true, visible: true });
        waiting = null;
      } else waiting = e;
    };
  }

  let leaderShield = false;
  battle.on('enemySpawn', ({ enemy: e }) => {
    if (!e || !e.alive) return;
    spawnStats(battle, e, k, R, bossFight, fieldOf);
    if (k('eb_range') && e.base.rangeRadius > 0 && e.def?.applyWay !== 'MELEE') e.base.rangeRadius += num(P('eb_range').tiles) * k('eb_range') * shareOf(e);
    if (k('eb_shield')) {
      let amount = 0;
      if (e.bossPool) {
        if (!leaderShield) {
          leaderShield = true;
          amount = (Number(e.bossPool.maxHp) || 0) * pct(P('eb_shield').leaderPct) * k('eb_shield') / Math.max(1, Math.trunc(num(R.fields, 1)) || 1);
        }
      } else amount = e.s.maxHp * pct(P('eb_shield').pct) * k('eb_shield') * shareOf(e);
      if (amount > 0) battle.addBuff(e, { key: KEY('eb_shield'), shield: amount, visible: true, persist: true });
    }
    if (e.mem.ebRoles) for (const role of e.mem.ebRoles) startRole(battle, e, role, k);
    e.mem.ebBorn = battle.time;
    if (link) link(e);
  });

  // ---- HP thresholds: 狂怒 / 冲刺 / 跃迁 / 首领·狂怒
  const fury = bossFight && k('eb_b_fury') > 0;
  if (k('eb_enrage') || k('eb_dash') || k('eb_blink') || fury) {
    const check = (e) => thresholds(battle, e, k, bossFight);
    battle.on('damaged', (c) => { const e = c.target; if (e && e.side === 'enemy' && e.alive) check(e); });
    // a leader's HP is the shared pool: the other fields' damage lowers it without a hit here
    if (bossFight) battle.every(0.5, () => { for (const e of battle.enemies) if (e.alive && e.isBoss) check(e); });
  }

  // 刺客: its targets in reach, the ranged operators first (the order the attack takes them in)
  if (k('eb_assassin')) {
    battle.on('enemyAttackStart', (c) => {
      const e = c.enemy;
      if (!e || !e.mem.ebRoles || !e.mem.ebRoles.includes('assassin') || !Array.isArray(c.targets) || c.targets.length < 2) return;
      c.targets.sort((a, b) => (RANGED_OP(b) ? 1 : 0) - (RANGED_OP(a) ? 1 : 0));
    });
  }

  if (k('eb_revenge')) {
    const share = pct(P('eb_revenge').pct) * k('eb_revenge');
    battle.on('death', (c) => {
      const e = c.unit;
      if (!e || e.side !== 'enemy' || c.reason !== 'killed' || e.mem.ebBombed) return;
      const amount = num(e.s?.atk) * share * shareOf(e);
      if (!(amount > 0)) return;
      for (const u of battle.allyUnits) {
        if (!isOp(u) || !u.alive || !u.deployed) continue;
        if (Math.max(Math.abs(u.x - e.x), Math.abs(u.y - e.y)) > 1.0 + 1e-9) continue;
        battle.dealDamage(null, u, { amount, type: 'phys', tags: [KEY('eb_revenge')] });
      }
    });
  }

  // ---- statuses: 坚定 / 控制递减 / 净化
  const steady = k('eb_steadfast'), dim = k('eb_diminish'), purify = k('eb_purify');
  if (steady || dim || purify) {
    battle.on('beforeStatus', (c) => {
      const t = c.target;
      if (!t || t.side !== 'enemy') return;
      const d = Number(c.duration);
      if (!(d > 0) || d === Infinity) return;
      const s = shareOf(t);
      let m = 1;
      if (CONTROL.has(c.status)) {
        if (steady) m *= Math.max(0.1, 1 - pct(P('eb_steadfast').pct) * steady * s);
        if (dim && battle.time <= (t.mem.ebCtrlEnd ?? -Infinity) + num(P('eb_diminish').sec) + 1e-9) m *= (1 - pct(P('eb_diminish').pct) * s) ** dim;
      } else if (purify && DEBUFF.has(c.status)) m *= (1 - pct(P('eb_purify').pct) * s) ** purify;
      if (m !== 1) c.duration = d * m;
    });
    // 控制递减: when the last control of an enemy ends (its applied length, after every cut)
    if (dim) {
      battle.on('statusApplied', (c) => {
        const t = c.target;
        const d = Number(c.duration);
        if (t && t.side === 'enemy' && CONTROL.has(c.status) && d > 0 && Number.isFinite(d)) t.mem.ebCtrlEnd = Math.max(t.mem.ebCtrlEnd ?? -Infinity, battle.time + d);
      });
    }
    // 净化 on 灼燃: the burst's RES cut ends early; its lock (爆发冷却) keeps its length — a shorter lock would refill sooner
    if (purify) {
      battle.on('elementBurst', (c) => {
        const t = c.target;
        if (c.element !== 'burn' || !t || t.side !== 'enemy') return;
        battle.after(0, () => {
          const b = t.alive ? t.findBuff('burnBurst') : null;
          if (!b || !b.mods || !(b.duration > 0) || b.duration === Infinity) return;
          const keep = b.duration * (1 - pct(P('eb_purify').pct) * shareOf(t)) ** purify;
          battle.after(Math.max(0, keep - (b.duration - b.timeLeft)), () => {
            if (t.buffs.includes(b) && b.mods) { b.mods = null; t.markDirty(); }
          });
        });
      });
    }
  }

  if (k('eb_blunt')) {
    const cap = pct(P('eb_blunt').pct), keep = 0.5 ** k('eb_blunt');
    battle.on('hpDamage', (c) => {
      const t = c.target;
      if (!t || t.side !== 'enemy' || isLeader(t)) return;
      const limit = t.s.maxHp * cap;
      if (c.amount > limit) c.amount = limit + (c.amount - limit) * keep;
    });
  }

  // ---- what the enemies deal: 通缉令 (the wanted operator), 蚀骨 (持续伤害), 元素过载 (元素损伤); 破甲 (DEF cuts)
  const wanted = k('eb_wanted') && R.wanted && typeof R.wanted === 'object' ? R.wanted : null;
  const isWanted = (u) => !!wanted && !!u && u.side === 'ally' && u.uid != null && wanted[u.ownerId] === u.uid;
  if (wanted) {
    battle.on('deploy', (c) => {
      const u = c.unit;
      if (isWanted(u) && !u.findBuff(KEY('wanted'))) battle.addBuff(u, { key: KEY('wanted'), mods: { taunt: 1 }, persist: true, visible: true });
    });
  }
  const dot = k('eb_t_dot');
  if (wanted || dot) {
    battle.on('hit', (c) => {
      const t = c.target, dmg = c.dmg;
      if (!t || t.side !== 'ally' || !dmg) return;
      const src = c.source ?? c.credit;
      if (!src || src.side !== 'enemy') return;
      if (isWanted(t)) dmg.mul *= 1 + pct(P('eb_wanted').pct) * k('eb_wanted') * shareOf(src);
      if (dot && ((Array.isArray(dmg.tags) && dmg.tags.includes('dot')) || (!dmg.isAttack && acTypes(src).includes('DOT')))) dmg.mul *= 1 + pct(P('eb_t_dot').pct) * dot * shareOf(src);
    });
  }
  if (k('eb_t_element')) {
    battle.on('elementHit', (c) => {
      const s = c.source;
      if (!s || s.side !== 'enemy' || !c.target || c.target.side !== 'ally' || !c.dmg) return;
      c.dmg.mul *= 1 + pct(P('eb_t_element').pct) * k('eb_t_element') * shareOf(s);
    });
  }
  if (k('eb_sunder')) {
    const p = P('eb_sunder');
    battle.on('attack', (c) => {
      const a = c.attacker;
      if (!a || a.side !== 'enemy') return;
      const s = shareOf(a);
      for (const t of c.targets || []) {
        if (!t || t.side !== 'ally' || !t.alive || t.kind === 'device') continue;
        // a leader's cut (half) and the others' stack apart: a stack takes the mods of its latest application
        battle.addBuff(t, { key: KEY(s < 1 ? 'leaderDefDown' : 'defDown'), mods: { defMul: Math.max(0, 1 - pct(p.pct) * k('eb_sunder') * s) },
          refresh: 'stack', stacks: 1, maxStacks: Math.max(1, num(p.max, 10)), duration: num(p.sec, 10), visible: true });
      }
    });
  }

  // ---- deaths: 分裂 / 繁衍 / 不灭
  if (k('eb_split')) {
    const p = P('eb_split');
    battle.on('death', (c) => {
      const e = c.unit;
      if (!e || e.side !== 'enemy' || c.reason !== 'killed' || e.mem.ebSplit || e.mem.ebElite || isLeader(e) || rankOf(e) !== 'NORMAL') return;
      if (e.tag === 'boss' || e.tag === 'part' || ebTagged(e)) return;
      // stacking makes the copies stronger, not more of them: the enemy count stays within what a result may report
      for (const kid of spawnChildren(battle, e, e.defId, num(p.n, 2))) {
        kid.mem.ebSplit = true;
        battle.addBuff(kid, { key: KEY('split'), mods: { hpMul: Math.min(1, pct(p.hp) * k('eb_split')) }, persist: true });
      }
    });
  }
  if (k('eb_t_times')) {
    battle.on('death', (c) => {
      const e = c.unit;
      if (!e || e.side !== 'enemy' || c.reason !== 'killed' || !acTypes(e).includes('TIMES')) return;
      // the 频次 enemies' own death spawn (kitDeathSpawn / kitBlades: talent DeadSpawn.enemy_key) — one more of it
      const tal = e.def?.raw?.talents;
      const key = tal && typeof tal === 'object' && tal.bbStr && typeof tal.bbStr === 'object' ? tal.bbStr['DeadSpawn.enemy_key'] : null;
      if (typeof key === 'string' && key) spawnChildren(battle, e, key, num(P('eb_t_times').n, 1) * k('eb_t_times'));
    });
  }
  if (k('eb_undying')) {
    const p = P('eb_undying');
    const chance = 1 - (1 - pct(p.prob)) ** k('eb_undying');
    // last of the kill handlers: a unit another one already saved is left alone
    battle.on('kill', (c) => {
      const e = c.victim;
      if (!e || e.side !== 'enemy' || !e.alive || e.hp > 0 || e.bossPool || isLeader(e) || e.mem.ebRevived || e.mem.ebSplit || ebTagged(e)) return;
      e.mem.ebRevived = true; // 第一次被击倒时: one roll per enemy
      if (rng() >= chance) return;
      e.hp = e.s.maxHp * pct(p.hp);
      battle.fx('revive', { x: e.x, y: e.y, id: e.id });
    }, { priority: -100 });
  }

  // ---- timers: 冲撞 / 天灾 / 匿踪 / 强折射 / 首领·威压
  if (k('eb_charge')) {
    const sec = num(P('eb_charge').sec, 6) / k('eb_charge');
    battle.every(0.25, () => {
      for (const e of battle.enemies) {
        if (!e.alive) continue;
        const c = e.mem.ebCharging;
        if (c) {
          // 不可阻挡 until it is past its blocker: a tile further along its path and out of that blocker's reach (≤ 8 s)
          if ((c.rem - battle.remainingDistance(e) > 1 && Math.hypot(e.x - c.x, e.y - c.y) > 0.9) || battle.time - c.at > 8) {
            battle.removeBuff(e, KEY('charge'));
            e.mem.ebCharging = null;
          }
          continue;
        }
        if (e.mem.ebCharged) continue;
        const bl = e.blockedBy;
        if (!bl) { e.mem.ebBlk = null; continue; }
        if (e.mem.ebBlk !== bl) { e.mem.ebBlk = bl; e.mem.ebBlkAt = battle.time; continue; }
        if (battle.time - e.mem.ebBlkAt + 1e-9 < sec / shareOf(e)) continue;
        e.mem.ebCharged = true; // each enemy once per battle
        e.mem.ebCharging = { x: bl.x, y: bl.y, at: battle.time, rem: battle.remainingDistance(e) };
        // ai.js updateEnemy releases the block of an unblockable enemy, and it walks on through
        battle.addBuff(e, { key: KEY('charge'), duration: 8.5, flags: { unblockable: true } });
        battle.fx('charge', { x: e.x, y: e.y, id: e.id });
      }
    });
  }
  if (k('eb_calamity')) {
    const p = P('eb_calamity');
    battle.every(num(p.sec, 30), () => {
      const ops = battle.allyUnits.filter((u) => isOp(u) && u.alive && u.deployed && !u.hidden);
      for (let i = num(p.n, 3) * k('eb_calamity'); i > 0 && ops.length; i--) {
        const u = ops.splice(Math.floor(rng() * ops.length), 1)[0];
        battle.fx('telegraph', { x: u.x, y: u.y, r: 0.6, kind: 'calamity', id: u.id });
        battle.dealDamage(null, u, { amount: u.s.maxHp * pct(p.pct), type: 'true', canDodge: false, sourceless: true, ignoreSelect: true, tags: [KEY('eb_calamity')] });
      }
    });
  }
  if (k('eb_t_invis')) {
    const add = pct(P('eb_t_invis').move) * k('eb_t_invis');
    battle.every(0.25, () => {
      for (const e of battle.enemies) {
        if (!e.alive || !acTypes(e).includes('INVISIBLE')) continue;
        const f = e.s.flags;
        const hidden = !!f.stealth && !f.stealthOff && !f.reveal;
        const on = !!e.findBuff(KEY('stealthRun'));
        if (hidden && !on) battle.addBuff(e, { key: KEY('stealthRun'), mods: { moveMul: 1 + add * shareOf(e) }, persist: true });
        else if (!hidden && on) battle.removeBuff(e, KEY('stealthRun'));
      }
    });
  }
  if (k('eb_t_refl')) {
    const res = num(P('eb_t_refl').res) * k('eb_t_refl');
    battle.every(0.25, () => {
      for (const e of battle.enemies) {
        if (!e.alive) continue;
        const refr = !!e.findBuff('ab:refraction'); // the 折射 archetype's buff, on while it is not silenced
        const on = !!e.findBuff(KEY('refraction'));
        if (refr && !on) battle.addBuff(e, { key: KEY('refraction'), mods: { resFlat: res * shareOf(e) }, persist: true });
        else if (!refr && on) battle.removeBuff(e, KEY('refraction'));
      }
    });
  }
  installThird(battle, k, R, rng, bossFight);
  if (bossFight && k('eb_b_awe')) {
    const until = num(P('eb_b_awe').sec, 15) * k('eb_b_awe');
    // 阻回 (noSp) on every ally deployed before `until` — the battle start's deployment and the redeploys
    battle.on('deploy', (c) => {
      const u = c.unit;
      if (!u || u.side !== 'ally' || u.kind === 'device' || battle.time >= until) return;
      battle.addBuff(u, { key: KEY('awe'), duration: until - battle.time, flags: { noSp: true }, visible: true });
    });
  }
}

/** The third version's effects that are no spawn stat and no role (see the header). */
function installThird(battle, k, R, rng, bossFight) {
  const ops = () => battle.allyUnits.filter(isOp);
  // ---- our side
  if (k('eb_logistics')) {
    const add = Math.max(0, Math.round(num(P('eb_logistics').cost, 2))) * k('eb_logistics');
    // the deployment cost the redeploys pay, after the strategies' cuts (大帝 II at battleStart −100)
    battle.on('battleStart', () => { for (const u of ops()) u.base.cost = Math.max(0, num(u.base.cost, 0) + add); }, { priority: -200 });
  }
  if (k('eb_redeploy')) for (const u of ops()) passiveBuff(battle, u, KEY('eb_redeploy'), { redeployMul: 1 + pct(P('eb_redeploy').pct) * k('eb_redeploy') });
  if (k('eb_noheal')) for (const u of ops()) passiveBuff(battle, u, KEY('eb_noheal'), { healingTakenMul: Math.max(0, 1 - pct(P('eb_noheal').pct)) ** k('eb_noheal') });
  if (bossFight && k('eb_b_dread')) for (const u of ops()) passiveBuff(battle, u, KEY('eb_b_dread'), { intervalMul: 1 + pct(P('eb_b_dread').pct) * k('eb_b_dread') });
  if (k('eb_jam')) {
    const keep = Math.max(0, 1 - pct(P('eb_jam').pct)) ** k('eb_jam');
    battle.on('spGain', (c) => { if (c.reason === 'time' && isOp(c.unit) && c.unit.side === 'ally') c.amount *= keep; });
  }
  if (k('eb_spdrain')) {
    const loss = num(P('eb_spdrain').sp, 1) * k('eb_spdrain');
    battle.on('damaged', (c) => {
      const t = c.target, d = c.dmg;
      if (!isOp(t) || t.side !== 'ally' || !t.alive || !d || !d.isAttack || !c.source || c.source.side !== 'enemy') return;
      // one loss per attack (an attack of several instances on it counts once)
      if (d.attackId && t.mem.ebDrainAt === d.attackId) return;
      t.mem.ebDrainAt = d.attackId || null;
      const sk = t.skill;
      if (!sk || sk.noSkill || sk.kind === 'passive' || !(sk.spCost > 0) || (sk.active && sk.isTimed)) return;
      const total = sk.spTotal;
      if (total > 0) sk.setSpTotal(Math.max(0, total - loss));
    });
  }

  // ---- what the enemies take (the `hit` hook): 学习 / 军团 / 首领·共鸣; and deal: 召唤克星
  const anti = k('eb_antisummon'), learn = k('eb_learn'), legion = k('eb_legion'), reso = bossFight ? k('eb_b_resonance') : 0;
  if (anti || learn || legion || reso) {
    const count = { t: -1, field: 0, minions: 0 };
    const counts = () => {
      if (count.t === battle.time) return count;
      count.t = battle.time;
      count.field = 0; count.minions = 0;
      for (const e of battle.enemies) {
        if (!realFoe(e) || e.hidden) continue;
        count.field++;
        if (minion(e)) count.minions++;
      }
      return count;
    };
    const lp = P('eb_learn'), gp = P('eb_legion'), rp = P('eb_b_resonance');
    battle.on('hit', (c) => {
      const t = c.target, dmg = c.dmg, src = c.source;
      if (!t || !dmg) return;
      if (t.side === 'ally') {
        if (anti && t.kind === 'token' && src && src.side === 'enemy') dmg.mul *= 1 + pct(P('eb_antisummon').pct) * anti * shareOf(src);
        return;
      }
      if (t.side !== 'enemy') return;
      const s = shareOf(t);
      if (learn && src && src.side === 'ally') {
        const book = t.mem.ebLearn ?? (t.mem.ebLearn = new Map());
        let rec = book.get(src);
        if (!rec) book.set(src, rec = { n: 0, at: null });
        const steps = Math.floor(rec.n / Math.max(1, num(lp.per, 10)));
        const cut = Math.min(pct(lp.max), pct(lp.pct) * steps);
        if (cut > 0) dmg.mul *= Math.max(0, 1 - cut * s) ** learn;
        // an attack counts once on this enemy, whatever its instances
        if (dmg.isAttack && (!dmg.attackId || rec.at !== dmg.attackId)) { rec.n++; rec.at = dmg.attackId || null; }
      }
      if (legion) {
        const steps = Math.floor(counts().field / Math.max(1, num(gp.per, 5)));
        const cut = Math.min(pct(gp.max), pct(gp.pct) * steps);
        if (cut > 0) dmg.mul *= Math.max(0, 1 - cut * s) ** legion;
      }
      if (reso && t.isBoss) {
        const cut = Math.min(pct(rp.max), pct(rp.pct) * counts().minions);
        if (cut > 0) dmg.mul *= Math.max(0, 1 - cut) ** reso;
      }
    });
  }

  // 连结: half of what reaches the HP passes to the partner (a loss credited to the source: the stats and the kill)
  if (k('eb_link')) {
    battle.on('hpDamage', (c) => {
      const t = c.target, o = t && t.side === 'enemy' ? t.mem.ebLink : null;
      if (!o || !o.alive || o.hidden || !(o.hp > 0) || !(c.amount > 0)) return;
      const half = c.amount / 2;
      c.amount -= half;
      battle.loseHp(o, half, { source: c.credit ?? null, from: c.dmg, tags: [KEY('link')] });
    });
    battle.on('death', (c) => {
      const o = c.unit && c.unit.side === 'enemy' ? c.unit.mem.ebLink : null;
      if (!o) return;
      c.unit.mem.ebLink = null;
      if (o.mem.ebLink === c.unit) { o.mem.ebLink = null; if (o.alive) battle.removeBuff(o, KEY('link')); }
    });
  }

  // 进化: −pct % taken per sec s on the field (at most max): one buff per enemy, refreshed as it ages
  if (k('eb_evolve')) {
    const p = P('eb_evolve'), per = Math.max(1, num(p.sec, 10));
    const most = Math.max(0, Math.floor(num(p.max, 40) / Math.max(1e-9, num(p.pct, 8)) + 1e-9));
    battle.every(0.5, () => {
      for (const e of battle.enemies) {
        if (!e.alive || e.mem.ebBorn == null) continue;
        const step = Math.min(most, Math.floor((battle.time - e.mem.ebBorn) / per + 1e-9));
        if (step === (e.mem.ebEvo ?? 0)) continue;
        e.mem.ebEvo = step;
        const cut = Math.min(pct(p.max), pct(p.pct) * step);
        battle.addBuff(e, { key: KEY('evolve'), mods: { dmgTakenMul: Math.max(0, 1 - cut * shareOf(e)) ** k('eb_evolve') }, persist: true, visible: true });
      }
    });
  }

  // 时空裂隙: every sec s, n random enemies (no leader, none that cannot move) blink forward
  if (k('eb_rift')) {
    const p = P('eb_rift');
    battle.every(Math.max(1, num(p.sec, 20)), () => {
      const list = battle.enemies.filter((e) => realFoe(e) && !e.hidden && !isLeader(e) && !e.bossPool && e.tag !== 'part' && !e.s.flags.noMove && !e.s.flags.selfBound);
      for (let i = num(p.n, 2) * k('eb_rift'); i > 0 && list.length; i--) {
        const e = list.splice(Math.floor(rng() * list.length), 1)[0];
        blinkForward(battle, e, num(p.tiles, 3));
      }
    });
  }

  // ---- layers: 叠层税 (a 特质 gain, after every other gain handler) / 削弱盟约 (the top active bond, battle only)
  if (k('eb_layertax')) {
    battle.on('layerGain', (c) => { if (c.reason === 'garrison' && c.n > 0) c.n = layerTaxKeep(c.n, k('eb_layertax')); }, { priority: -900 });
  }
  if (k('eb_bondsap')) {
    const keep = Math.max(0, 1 - pct(P('eb_bondsap').pct)) ** k('eb_bondsap');
    const top = new Map();
    for (const pl of battle.players) {
      let best = null, most = 0;
      for (const b of activeBondIds(battle, pl.playerId)) {
        const l = Math.max(0, num(bondState(battle, pl.playerId, b)?.layers, 0));
        if (l > most) { most = l; best = b; }
      }
      if (best) top.set(pl.playerId, best);
    }
    if (top.size) {
      addLayerBonus(battle, (pid, b, layers) => (top.get(pid) === b ? Math.floor(layers * keep + 1e-9) : layers));
      for (const [pid, b] of top) refreshLayerReaders(battle, pid, [b]);
    }
  }

  // ---- leader fights: 首领·限伤 (the line), 首领·护盾 (the pool's steps)
  if (bossFight && k('eb_b_cap')) {
    const p = P('eb_b_cap');
    const ratio = num(p.from, 30) > 0 ? Math.min(1, num(p.to, 20) / num(p.from, 30)) : 1;
    battle.hitLimit = BOSS_HIT_LIMIT * ratio ** k('eb_b_cap');
  }
  if (bossFight && k('eb_b_barrier')) {
    const p = P('eb_b_barrier');
    const step = Math.max(1e-6, pct(p.step)), most = Math.max(0, Math.floor(num(p.max, 3)));
    let given = 0;
    const check = () => {
      if (given >= most) return;
      const e = battle.enemies.find((x) => x.alive && x.isBoss && x.bossPool);
      const pool = e && e.bossPool;
      if (!pool || !(pool.maxHp > 0) || !(pool.hp > 0)) return;
      const due = Math.min(most, Math.floor((1 - pool.hp / pool.maxHp) / step + 1e-9));
      if (due <= given) return;
      const amount = (pool.maxHp * pct(p.pct) * k('eb_b_barrier') * (due - given)) / Math.max(1, Math.trunc(num(R.fields, 1)) || 1);
      given = due;
      const b = e.findBuff(KEY('barrier'));
      if (b) { b.shield += amount; e.markDirty(); } else battle.addBuff(e, { key: KEY('barrier'), shield: amount, visible: true, persist: true });
    };
    battle.on('damaged', (c) => { if (c.target && c.target.isBoss) check(); });
    // the other fields' damage lowers the shared pool without a hit here
    battle.every(0.5, check);
  }
}

/** The stat upgrades of an enemy as it spawns (one persistent buff). */
function spawnStats(battle, e, k, R, bossFight, fieldOf) {
  const s = shareOf(e);
  const pool = poolLeader(e);
  const mods = {};
  const mul = (key, v) => { if (Number.isFinite(v) && v !== 1) mods[key] = (mods[key] ?? 1) * v; };
  const add = (key, v) => { if (Number.isFinite(v) && v !== 0) mods[key] = (mods[key] ?? 0) + v; };
  const n = (id) => k(id);
  if (n('eb_vigor') && !pool) mul('hpMul', 1 + pct(P('eb_vigor').hp) * n('eb_vigor') * s);
  if (n('eb_swift')) mul('moveMul', 1 + pct(P('eb_swift').move) * n('eb_swift') * s);
  if (n('eb_res')) add('resFlat', num(P('eb_res').res) * n('eb_res') * s);
  if (n('eb_evasion')) add('dodgePhys', Math.min(0.8, pct(P('eb_evasion').pct) * n('eb_evasion') * s));
  if (n('eb_armor')) mul('physTakenMul', (1 - pct(P('eb_armor').pct) * s) ** n('eb_armor'));
  if (n('eb_trueres')) mul('trueTakenMul', (1 - pct(P('eb_trueres').pct) * s) ** n('eb_trueres'));
  if (n('eb_fury')) mul('atkMul', 1 + pct(P('eb_fury').atk) * n('eb_fury') * s);
  if (n('eb_regen') && !pool) add('hpRegenRatio', pct(P('eb_regen').pct) * n('eb_regen') * s);
  if (n('eb_backup') && !pool && battle.time >= num(P('eb_backup').sec) - 1e-9) mul('hpMul', 1 + pct(P('eb_backup').hp) * n('eb_backup') * s);
  if (n('eb_bulwark')) mul('dmgTakenMul', (1 - pct(P('eb_bulwark').pct) * s) ** n('eb_bulwark'));
  if (n('eb_steel')) mul('dmgTakenMul', (1 - pct(P('eb_steel').pct) * s) ** n('eb_steel'));
  if (n('eb_artsward')) mul('artsTakenMul', (1 - pct(P('eb_artsward').pct) * s) ** n('eb_artsward'));
  if (n('eb_elite') && rankOf(e) === 'ELITE') {
    mul('hpMul', 1 + pct(P('eb_elite').hp) * n('eb_elite'));
    mul('atkMul', 1 + pct(P('eb_elite').atk) * n('eb_elite'));
  }
  if (n('eb_frenzy')) {
    mul('moveMul', 1 + pct(P('eb_frenzy').move) * n('eb_frenzy') * s);
    add('aspd', num(P('eb_frenzy').aspd) * n('eb_frenzy') * s);
  }
  if (n('eb_t_fly') && e.motion === 'FLY' && !pool) {
    mul('hpMul', 1 + pct(P('eb_t_fly').hp) * n('eb_t_fly') * s);
    mul('moveMul', 1 + pct(P('eb_t_fly').move) * n('eb_t_fly') * s);
  }
  if (n('eb_t_invis') && !pool && acTypes(e).includes('INVISIBLE')) mul('hpMul', 1 + pct(P('eb_t_invis').hp) * n('eb_t_invis') * s);
  const owner = fieldOf(e);
  if (n('eb_mark') && !pool && R.marked != null && owner === R.marked) mul('hpMul', 1 + pct(P('eb_mark').hp) * n('eb_mark') * s);
  const type = n('eb_adapt') && R.adapt && typeof R.adapt === 'object' ? TAKEN[R.adapt[owner]] : null;
  if (type) mul(type, (1 - pct(P('eb_adapt').pct) * s) ** n('eb_adapt'));
  // 首领专场: the pool leader of a leader fight, at full value
  if (bossFight && e.isBoss) {
    if (n('eb_b_rage')) {
      mul('atkMul', 1 + pct(P('eb_b_rage').atk) * n('eb_b_rage'));
      add('aspd', num(P('eb_b_rage').aspd) * n('eb_b_rage'));
    }
    if (n('eb_b_wall')) mul('dmgTakenMul', (1 - pct(P('eb_b_wall').pct)) ** n('eb_b_wall'));
    if (n('eb_b_physward')) mul('physTakenMul', (1 - pct(P('eb_b_physward').pct)) ** n('eb_b_physward'));
    if (n('eb_b_artsward')) mul('artsTakenMul', (1 - pct(P('eb_b_artsward').pct)) ** n('eb_b_artsward'));
  }
  // the HP ratio is kept as maxHp changes (units.js): a spawn starts full
  if (Object.keys(mods).length) battle.addBuff(e, { key: KEY('stats'), mods, persist: true });
}

/** 狂怒 / 冲刺 below hpPct (a leader: half), 跃迁 once below its hpPct (no leader), 首领·狂怒 (the pool leader, full). */
function thresholds(battle, e, k, bossFight) {
  const max = e.s.maxHp;
  const r = max > 0 ? e.hp / max : 1;
  if (k('eb_enrage') && !e.mem.ebEnraged && r <= pct(P('eb_enrage').hpPct)) {
    e.mem.ebEnraged = true;
    battle.addBuff(e, { key: KEY('eb_enrage'), mods: { aspd: num(P('eb_enrage').aspd) * k('eb_enrage') * shareOf(e) }, persist: true, visible: true });
  }
  if (k('eb_dash') && !e.mem.ebDash && r <= pct(P('eb_dash').hpPct)) {
    e.mem.ebDash = true;
    battle.addBuff(e, { key: KEY('eb_dash'), mods: { moveMul: 1 + pct(P('eb_dash').move) * k('eb_dash') * shareOf(e) }, persist: true });
  }
  if (k('eb_blink') && !e.mem.ebBlink && e.hp > 0 && r < pct(P('eb_blink').hpPct) && !isLeader(e)) {
    e.mem.ebBlink = true;
    // [ASSUMED] not a unit that does not move on its own (自缚 / 束缚 / hidden): its path is no way forward
    const f = e.s.flags;
    if (!e.hidden && !f.noMove && !f.selfBound) blinkForward(battle, e, num(P('eb_blink').tiles) * k('eb_blink'));
  }
  if (bossFight && e.isBoss && k('eb_b_fury') && !e.mem.ebBossFury && e.hp > 0 && r < pct(P('eb_b_fury').hpPct)) {
    e.mem.ebBossFury = true;
    const p = P('eb_b_fury');
    battle.addBuff(e, { key: KEY('eb_b_fury'), mods: { dmgTakenMul: (1 - pct(p.pct)) ** k('eb_b_fury'), aspd: num(p.aspd) * k('eb_b_fury') }, persist: true, visible: true });
  }
}

/**
 * 替身 / 医疗兵 / 统帅 of this battle: queue index → role. Candidates: the counted queued enemies that are no leader, no
 * part and none of the upgrades' own spawns (a commander: an ELITE one); every role on its own enemy. None in a 联防 (its
 * enemies come from the battles that already had theirs).
 */
function pickRoles(battle, k, rng) {
  const roles = new Map();
  const third = ['eb_vanrush', 'eb_stealth', 'eb_promote', 'eb_assassin', 'eb_bomber'].some((id) => k(id));
  if (battle.kind === 'unite' || !(k('eb_standin') || k('eb_medic') || k('eb_command') || third)) return roles;
  const cands = [];
  battle._pending.forEach((p, i) => {
    if (!p || !p.counted || p.tag === 'boss' || p.tag === 'part' || (typeof p.tag === 'string' && p.tag.startsWith('eb_'))) return;
    const def = battle.data.getEnemy(p.enemyKey);
    const rank = String(def?.rank ?? 'NORMAL').toUpperCase();
    if (!def || rank === 'BOSS') return;
    cands.push({ i, elite: rank === 'ELITE', normal: rank === 'NORMAL' });
  });
  const exclusive = (i) => (roles.get(i) || []).some((r) => !SHARED_ROLES.has(r));
  const put = (i, role) => { const l = roles.get(i); if (l) l.push(role); else roles.set(i, [role]); };
  const take = (n, pred, role) => {
    const list = cands.filter((c) => !exclusive(c.i) && pred(c));
    for (let j = 0; j < n && list.length; j++) put(list.splice(Math.floor(rng() * list.length), 1)[0].i, role);
  };
  take(k('eb_command'), (c) => c.elite, 'command');
  take(num(P('eb_medic').n, 2) * k('eb_medic'), () => true, 'medic');
  take(k('eb_standin'), () => true, 'standin');
  // third version: its exclusive roles draw after the second version's (whose picks stay as they were)
  take(num(P('eb_promote').n, 2) * k('eb_promote'), (c) => c.normal, 'promote');
  take(num(P('eb_assassin').n, 2) * k('eb_assassin'), () => true, 'assassin');
  take(num(P('eb_bomber').n, 3) * k('eb_bomber'), () => true, 'bomber');
  // beside any role: 先锋突击 the first of the queue (in spawn order), 隐秘行动 random ones
  if (k('eb_vanrush')) for (const c of cands.slice(0, num(P('eb_vanrush').n, 3) * k('eb_vanrush'))) put(c.i, 'vanrush');
  if (k('eb_stealth')) {
    const list = cands.slice();
    for (let j = num(P('eb_stealth').n, 2) * k('eb_stealth'); j > 0 && list.length; j--) put(list.splice(Math.floor(rng() * list.length), 1)[0].i, 'stealth');
  }
  return roles;
}

function startRole(battle, e, role, k) {
  if (role === 'standin') {
    // the 'taunt' tail draws the 嘲讽 icon (render/style.js statusIconKey); ×hp keeps the HP ratio: a full stand-in
    battle.addBuff(e, { key: KEY('taunt'), mods: { hpMul: Math.max(1, num(P('eb_standin').hp, 3)), taunt: 1 }, persist: true, visible: true });
  } else if (role === 'medic') {
    const p = P('eb_medic');
    battle.addBuff(e, { key: KEY('medic'), persist: true, visible: true });
    battle.every(num(p.sec, 3), () => {
      if (!e.alive || e.hidden) return;
      let healed = false;
      for (const o of battle.enemiesInRadius(e.x, e.y, num(p.range, 1.5), true)) {
        if (o === e || !o.alive || o.bossPool || o.hp >= o.s.maxHp) continue;
        if (battle.heal(e, o, o.s.maxHp * pct(p.pct)) > 0) healed = true;
      }
      if (healed) battle.fx('cleanse', { x: e.x, y: e.y, r: num(p.range, 1.5), id: e.id });
    }, { owner: e });
  } else if (role === 'vanrush') {
    const p = P('eb_vanrush');
    battle.addBuff(e, { key: KEY('vanrush'), mods: { hpMul: 1 + pct(p.hp) * k('eb_vanrush'), moveMul: 1 + pct(p.move) * k('eb_vanrush') }, persist: true, visible: true });
  } else if (role === 'stealth') {
    battle.applyStatus(e, 'stealth', { duration: num(P('eb_stealth').sec, 10) });
  } else if (role === 'promote') {
    const p = P('eb_promote');
    e.mem.ebElite = true;
    battle.addBuff(e, { key: KEY('promote'), mods: { hpMul: Math.max(1, num(p.hp, 2)), atkMul: Math.max(1, num(p.atk, 1.5)) }, persist: true, visible: true });
  } else if (role === 'assassin') {
    battle.addBuff(e, { key: KEY('assassin'), flags: { unblockable: true }, persist: true, visible: true });
    // [ASSUMED] a melee assassin (it only ever hits its blocker, and nothing blocks it) strikes the operators within 1 tile
    // as it walks
    if ((e.profile?.melee ?? e.def?.applyWay === 'MELEE') || !(e.base.rangeRadius > 0)) {
      if (e.profile) e.profile.melee = false;
      e.base.rangeRadius = Math.max(num(e.base.rangeRadius, 0), 1);
    }
  } else if (role === 'bomber') {
    const p = P('eb_bomber');
    battle.addBuff(e, { key: KEY('bomber'), persist: true, visible: true });
    let since = null;
    battle.every(0.25, () => {
      if (!e.alive) return;
      if (!e.blockedBy) { since = null; return; }
      if (since == null) { since = battle.time; return; }
      if (battle.time - since + 1e-9 < num(p.sec, 3)) return;
      battle.fx('telegraph', { x: e.x, y: e.y, r: 1.2, kind: 'bomber', id: e.id });
      // gone with the blast: no 分裂 copies, no second life, no 复仇
      e.mem.ebSplit = true; e.mem.ebRevived = true; e.mem.ebBombed = true;
      for (const u of battle.allyUnits) {
        if (!isOp(u) || !u.alive || !u.deployed || u.hidden) continue;
        if (Math.max(Math.abs(u.x - e.x), Math.abs(u.y - e.y)) > 1.0 + 1e-9) continue;
        battle.dealDamage(e, u, { amount: u.s.maxHp * pct(p.pct), type: 'phys', canDodge: false, tags: [KEY('eb_bomber')] });
      }
      if (e.alive) battle.kill(e, null);
    }, { owner: e });
  } else if (role === 'command') {
    const p = P('eb_command');
    // 'guard' tails draw the shield icon: the commander and the enemies its aura covers (they take less damage)
    battle.addBuff(e, { key: KEY('commandGuard'), persist: true, visible: true });
    battle.every(0.5, () => {
      if (!e.alive) return;
      for (const o of battle.enemiesInRadius(e.x, e.y, num(p.range, 2), true)) {
        if (o === e || !o.alive) continue;
        const s = shareOf(o);
        battle.addBuff(o, { key: KEY('auraGuard'), duration: 0.6, refresh: 'extend', visible: true,
          mods: { dmgTakenMul: Math.max(0, 1 - pct(p.pct) * k('eb_command') * s), moveMul: 1 + pct(p.move) * k('eb_command') * s } });
      }
    }, { owner: e });
  }
}

export function install(battle) {
  const f = battle.flags || {};
  const R = f.ebRound && typeof f.ebRound === 'object' ? f.ebRound : {};
  const ids = [...(Array.isArray(f.enemyBuffs) ? f.enemyBuffs : []), ...(Array.isArray(R.extra) ? R.extra : [])];
  const counts = enemyBuffCounts(ids);
  if (counts.size) { installEnemyBuffs(battle, counts, R); installEnemyHexRevision(battle,counts); }
}

/**
 * Client results (server/match/fields.js specBounds): the enemies this module adds beyond the spec's schedule. 分裂: a
 * killed NORMAL enemy leaves copies of its own key (a leak of it may outnumber its schedule) — every NORMAL key is a key
 * content spawns (`derived`); 繁衍: one more 频次 child per parent and stack. In a 联防 each counts against the leaker
 * that sent the parent in (`derivedSourceCounts`, `${key}|${playerId}` → how many). Mutates the bounds; nothing without
 * the two upgrades.
 * @param {object} spec @param {any} gd GameData (rank / talent lookups) or null
 * @param {{ derived: Set<string>, derivedSourceCounts: Map<string, number>, maxTotal: number }} b
 */
export function enemyBuffBounds(spec, gd, b) {
  const counts = enemyBuffCounts([...(spec?.flags?.enemyBuffs || []), ...(spec?.flags?.ebRound?.extra || [])]);
  const split = counts.get('eb_split') ?? 0, times = counts.get('eb_t_times') ?? 0;
  if ((!split && !times) || !gd || typeof gd.enemy !== 'function') return;
  const n = num(P('eb_split').n, 2);
  for (const s of Array.isArray(spec.spawns) ? spec.spawns : []) {
    if (!s || typeof s.enemyKey !== 'string') continue;
    const rec = gd.enemy(s.enemyKey);
    if (!rec) continue;
    const cnt = Math.max(1, Math.min(10_000, Math.floor(Number(s.count) || 1)));
    const kids = [];
    if (split && String(rec.rank ?? 'NORMAL').toUpperCase() === 'NORMAL' && s.tag !== 'boss' && s.tag !== 'part') kids.push([s.enemyKey, n]);
    const dk = times && Array.isArray(rec.acTypes) && rec.acTypes.includes('TIMES') ? rec.talents?.bbStr?.['DeadSpawn.enemy_key'] : null;
    if (typeof dk === 'string' && dk) kids.push([dk, times * num(P('eb_t_times').n, 1)]);
    for (const [key, per] of kids) {
      b.derived.add(key);
      if (typeof s.sourcePlayerId !== 'string') continue;
      const ks = `${key}|${s.sourcePlayerId}`;
      b.derivedSourceCounts.set(ks, Math.min(b.maxTotal, (b.derivedSourceCounts.get(ks) || 0) + cnt * per));
    }
  }
}

// =====================================================================================================================
// prep side: the economy upgrades (they only ever take funds — never give any) — 关税 (onPrice / onBuy) and 限流; 通胀 is
// the match's refresh tax (enemyVotes.js enemyRefreshTax). One global handler: it runs for every player on every hook,
// so each hook asks first whether the match holds its upgrade.

const countOf = (ctx, id) => (typeof ctx.enemyBuffs === 'function' ? ctx.enemyBuffs().filter((x) => x === id).length : 0);

/** A per-round counter of a player (reset lazily when the round changes). */
function roundCounter(ctx, key) {
  if (ctx.counter(`${key}:r`) !== ctx.round) { ctx.setCounter(`${key}:r`, ctx.round); ctx.setCounter(key, 0); }
  return ctx.counter(key);
}

/**
 * 限流 bookkeeping of one player, per round (counters `eb:lim:*`): T = the funds effects gave this round — every gain
 * but the round income and selling (an 'income' gain counts its part above the data's income: what onIncome handlers
 * added — the pending payouts of 获得时 effects, interest …), plus the gains no handler hears of (the 海克斯' own payouts:
 * PlayerState.addFunds dispatches no onFundsGain for them — the rise of stats.fundsGained beyond the dispatched gains).
 * What T passes `cap` by is halved: the player keeps min(T, cap) + ⌊(T − cap) / 2⌋ and gives the rest back as soon as it
 * holds the funds (`claw` = taken so far). `a`: { round, gained(), counter(k), setCounter(k, v), take(n) → taken,
 * toast(text) } — a meta ctx (throttleOf) or the match's view of a PlayerState (enemyVotes.js).
 */
export function throttleStart(a, income) {
  a.setCounter('eb:lim:r', a.round);
  a.setCounter('eb:lim:base', a.gained());
  a.setCounter('eb:lim:disp', 0);
  a.setCounter('eb:lim:fx', 0);
  a.setCounter('eb:lim:inc', Math.max(0, Math.trunc(num(income))));
  a.setCounter('eb:lim:claw', 0);
}

export function throttleGain(a, amount, reason, cap) {
  const v = Math.max(0, Math.trunc(num(amount)));
  // the first gain of a round whose income it missed (the vote of this round came after it): the tally starts here
  if (a.counter('eb:lim:r') !== a.round) { throttleStart(a, 0); a.setCounter('eb:lim:base', a.gained() - v); }
  a.setCounter('eb:lim:disp', a.counter('eb:lim:disp') + v);
  const fx = reason === 'income' ? Math.max(0, v - a.counter('eb:lim:inc')) : reason === 'sell' ? 0 : v;
  if (fx > 0) a.setCounter('eb:lim:fx', a.counter('eb:lim:fx') + fx);
  throttleCheck(a, cap);
}

export function throttleCheck(a, cap) {
  if (a.counter('eb:lim:r') !== a.round) throttleStart(a, 0);
  const hidden = Math.max(0, a.gained() - a.counter('eb:lim:base') - a.counter('eb:lim:disp'));
  const total = a.counter('eb:lim:fx') + hidden;
  const c = Math.max(0, Math.trunc(num(cap, 8)));
  const keep = total <= c ? total : c + Math.floor((total - c) / 2);
  const owed = total - keep - a.counter('eb:lim:claw');
  if (owed <= 0) return 0;
  const took = Math.max(0, Math.trunc(num(a.take(owed))));
  if (took > 0) {
    a.setCounter('eb:lim:claw', a.counter('eb:lim:claw') + took);
    a.toast?.(took, c);
  }
  return took;
}

/** The 限流 toast (the match's accessor sends the same). */
export const throttleToast = (n, cap) => msg('限流：本回合因效果获得的资金超过 {cap}，收回 {n} 资金', { n, cap });

/** The 限流 accessor of a meta ctx. */
function throttleOf(ctx) {
  return {
    round: ctx.round,
    gained: () => num(ctx.stats().fundsGained),
    counter: (k) => ctx.counter(k),
    setCounter: (k, v) => ctx.setCounter(k, v),
    take: (n) => -ctx.addFunds(-n, 'enemyBuff:eb_throttle'),
    toast: (n, cap) => ctx.toast(throttleToast(n, cap), 'info'),
  };
}

export function registerMeta(registry) {
  const capOf = () => num(P('eb_throttle').cap, 8);
  const check = (ctx) => { if (countOf(ctx, 'eb_throttle')) throttleCheck(throttleOf(ctx), capOf()); };
  registry.global('enemyBuffs', {
    onIncome(ctx, ev) { if (countOf(ctx, 'eb_throttle')) throttleStart(throttleOf(ctx), ev && ev.income); },
    onFundsGain(ctx, ev) { if (countOf(ctx, 'eb_throttle') && ev) throttleGain(throttleOf(ctx), ev.amount, ev.reason, capOf()); },
    onBuy(ctx, ev) {
      if (ev && ev.kind === 'chess' && countOf(ctx, 'eb_tariff')) { roundCounter(ctx, 'eb:buys'); ctx.setCounter('eb:buys', ctx.counter('eb:buys') + 1); }
      check(ctx);
    },
    // 关税: the operators bought this round before this one
    onPrice(ctx, ev) {
      const n = countOf(ctx, 'eb_tariff');
      if (!n || !ev || ev.kind !== 'chess') return;
      if (roundCounter(ctx, 'eb:buys') >= Math.max(1, num(P('eb_tariff').from, 5)) - 1) ctx.modifyPrice(num(P('eb_tariff').funds, 1) * n);
    },
    onSpend: check,
    onRefresh: check,
    onPrepEnd: check,
  });
}
