// server/sim/content/augments5/g10.js — A6000 fork, 海克斯第六版 (技能、防御、站位、克制（G1–G25）): the effects of
// shared/augments5/g10.js. server/sim/content/augments.js calls `install` for every augment a battle player holds (true =
// handled here) and merges `META` (augment id → prep-side handler factory, as its own META).
//
// Battle side (number bonuses are the independent multipliers: augDealtMul 造成的伤害提升至, dmgTakenMul 受到的伤害降低,
// intervalMul 攻击间隔, spRecoveryMul 技力回复速度; "your operators" = the player's operators, its summons are not):
//   技能
//   雷针      aug_lightning_rod  every skill activation of the player's operators (skillStart) → every operator's
//                                spRecoveryMul 1 + min(max, pct · n) % for the rest of the battle
//   熟能生巧  aug_practice       each operator's own activations: its damage ×(1 + pct)^n, at most ×max
//   技能冲击  aug_skill_burst    an activation: pct % of the operator's ATK (as it casts: the skill's own ATK bonus in) as
//                                arts damage to every enemy its attack range holds then that it can select (flyers
//                                too); at most once per `cd` s per operator — a cast with nobody in range does not count
//   回响      aug_echo_sp        a skill that ends (its duration, its ammo, an instant cast; not a knock-out's end, not
//                                a withdrawn cast) gives back pct % of its SP cost (a gain: 阻回 stops it)
//   充能      aug_charge         spRecoveryMul 1 + pct %
//   起手式    aug_opener_sp      +sp SP at every deployment (a 【移动】 is one: PRTS "可以通过移动行为多次触发部署时触发的效果";
//                                'init', as 技力涌流's)
//   终极形态  aug_final_form     the first activation of each deployment (deploySeq): a shield of shield % max HP for
//                                `sec` s, and the operator's interval ×(1 − interval %) for the rest of the battle (once)
//   防御
//   镜中境    aug_mirror         each enemy's first damage instance that reaches one of the player's operators (an HP
//                                damage that is not dodged or cancelled — a `damaged` of it) ×(1 − pct %)
//   墙眼      aug_wall_eye       an enemy's damage on an operator from outside that operator's current attack range ×(1 −
//                                pct %) (无来源 damage has no position: never)
//   老兵      aug_veteran        an operator `sec` s past its deployment (deployedAt): damage taken ×(1 − pct %)
//   长明灯    aug_lamp           the player's first operator to deploy in the battle (the battle start deploys by column,
//                                Battle.start): ×dealt, −taken until it is knocked out (a retreat keeps it)
//   冬日余晖  aug_winter_glow    an enemy the player's units knock out: the other enemies within `radius` tiles
//                                (Chebyshev, as 连锁爆破) that an ally-side area effect can select get `sec` s of 寒冷
//                                (the catalogue status: a second one freezes)
//   燃油      aug_gasoline       the same enemies: a burn — every second pct % of the knocker's ATK (at the knock-out) as
//                                arts damage credited to it, for `sec` s (one burn per enemy: a new one replaces it)
//   萤火      aug_firefly        the player's field operators within `radius` tiles of it heal pct % of their max HP
//   流弹      aug_stray          a ranged operator's attack on enemies: prob % (幸运 — shared/luck.js goodChance) for pct %
//                                of its ATK, its damage type, on another random enemy it can target (not one the attack
//                                took)
//   站位 (read every POS_PERIOD s, as 前哨 / 铁三角: operators move, die and redeploy; "the right-most column" is 前哨's: the
//   right-most column the player's operators stand in — the left-most on the mirrored Final Assault side)
//   孤狼      aug_lone_wolf      an operator with none of the player's operators on its 8 surrounding tiles
//   双璧      aug_twin_wall      exactly `n` operators in the right-most column: both
//   前排掩护  aug_cover          k = the operators of the two right-most columns (that column and the next one in): every
//                                other operator ×(1 + pct)^min(k, max)
//   最后防线  aug_last_line      an operator within `dist` tiles (Chebyshev) of a protection point (the field's 'end' tiles):
//                                block +block, −taken
//   风水宝地  aug_feng_shui      the round's tiles (EffectRef data { round, tiles: [[row, col] board tiles] }: the match side,
//                                server/match/augments5/g10.js) mapped onto this field (Battle.mapTile): an operator
//                                standing on one ×dealt
//   寒冰之心  aug_frozen_heart   an enemy blocked by one of the player's operators: interval ×(1 + pct %)
//   克制 (特训敌人)
//   连击专家  aug_vs_times       a damage instance of the player's units on a 频次 enemy (flags hitCount / hitCountArts)
//                                counts as `n` hits (DamageInfo `hits`: damage.js)
//   元素抗性  aug_vs_element     the operators' elemTakenMul ×(1 − pct %) (元素损伤: the gauge fill)
//   净化      aug_vs_dot         持续伤害 on an operator ×(1 − pct %): a damage instance one of its own buffs deals while it
//                                ticks (Battle._tickingUnit: bleeding, burning, 沙狱 …), one tagged 'dot' (periodicDamage,
//                                the kits' DoTs) or by a damage zone ('pollution', 'poison', 'burning'), or a non-attack
//                                damage of a 持续 (DOT) type enemy (its pulses and zones — 特训加强·蚀骨's reading)
//   防反光    aug_vs_reflect     the player's units' arts damage on an enemy whose 折射 is on ignores pct % of the RES it
//                                gives (its 'ab:refraction' buff and 强折射's) — no enemy here reflects damage
// Nothing is installed for a player without them (no hook, no random draw).
//
// Prep side: none (风水宝地's tiles are drawn by the match: server/match/augments5/g10.js).

import { num, isOp, playerOps, passiveBuff, fxOn, alliesAround, inRange, N8, COLS } from '../support/index.js';
import { canTargetEnemy, enemyStealthed } from '../../targeting.js';
import { luckOfRefs, goodChance } from '../../../../shared/luck.js';

const KEY = (id) => `augment:${id}`;
const pct = (v) => num(v) / 100;
const cut = (v) => Math.max(0, 1 - pct(v));
const faster = (v) => Math.max(0.1, 1 - pct(v));
/** Seconds between two reads of a positional 海克斯 (operators move, die and redeploy) — content/augments.js POS_PERIOD. */
const POS_PERIOD = 0.25;
/** 技能冲击: the enemies its burst may select — any enemy of the range the operator can select, flyers too. */
const AREA = Object.freeze({ canHitFly: true });
/** 净化: the damage tags of a 持续伤害 that no buff tick of the target deals (periodicDamage / kits' DoTs, the zones). */
const DOT_TAGS = new Set(['dot', 'pollution', 'poison', 'burning']);

/** `fn()` every `period` seconds of the battle (the first at once) — content/augments.js every. */
function every(battle, period, fn) {
  let acc = period;
  battle.on('tick', ({ dt }) => {
    acc += dt ?? battle.dt;
    if (acc < period - 1e-9) return;
    acc = 0;
    fn();
  });
}

/** A buff a periodic rule keeps up: it lapses one period after the rule stops holding (new mods are taken at once). */
const keepUp = (battle, u, key, mods, visible = true) => battle.addBuff(u, { key, mods, duration: POS_PERIOD + 0.15, refresh: 'extend', visible });

/** The data of one of the player's augment EffectRefs (what the match side decided), or null. */
function dataOf(ps, id) {
  const ref = (ps.playerEffects || []).find((r) => r && r.key === KEY(id));
  return ref && ref.data && typeof ref.data === 'object' ? ref.data : null;
}

/** The special 训练 types of an enemy (data/enemies.json acTypes: FLY / TIMES / ELEMENT / DOT / INVISIBLE / REFLECTION …). */
const acTypes = (e) => { const t = e?.def?.raw?.acTypes; return Array.isArray(t) ? t : []; };

/**
 * The enemies within `r` tiles (Chebyshev, as 连锁爆破) of (x, y) that an ally-side area effect can select (no 隐匿 one
 * unless revealed or blocked, no untargetable one — Battle.foesInRadius), `except` left out.
 */
function foesAround(battle, x, y, r, except = null) {
  const out = [];
  for (const o of battle.enemies) {
    if (o === except || !o.alive || o.hidden || !o.deployed) continue;
    const f = o.s.flags;
    if (f.untargetable || (f.stealth && enemyStealthed(o))) continue;
    if (Math.max(Math.abs(o.x - x), Math.abs(o.y - y)) > r + 1e-9) continue;
    out.push(o);
  }
  return out;
}

/** An enemy knocked out by one of the player's units (op or summon): the `death` ctx's killer, else null. */
function ownKill(c, pid) {
  const e = c.unit, k = c.killer;
  if (!e || e.side !== 'enemy' || c.reason !== 'killed' || !k || k.side !== 'ally' || k.ownerId !== pid) return null;
  return k;
}

/** The RES an enemy's 折射 gives it now: its 'ab:refraction' buff (on while not silenced) and 强折射's. */
function refractionRes(e) {
  let res = 0;
  for (const b of e.buffs) if ((b.key === 'ab:refraction' || b.key === 'enemyBuff:refraction') && b.mods) res += Math.max(0, num(b.mods.resFlat));
  return res;
}

/** The column read of 前哨 (content/augments.js aug_vanguard): the mirrored Final Assault side counts from the left. */
const colOf = (ps) => (u) => (ps.mirror ? -u.tileC : u.tileC);

// =====================================================================================================================
// battle side

const BATTLE = {
  // ---- 技能

  aug_lightning_rod(battle, ps, id, p) {
    const pid = ps.playerId, key = KEY(id);
    const step = num(p.pct, 2), most = num(p.max, 30);
    let n = 0, cur = 0;
    battle.on('skillStart', ({ unit: u }) => {
      if (!isOp(u) || u.ownerId !== pid) return;
      n++;
      const add = Math.min(most, step * n);
      if (!(add > cur + 1e-9)) return;
      cur = add;
      for (const o of playerOps(battle, pid)) passiveBuff(battle, o, key, { spRecoveryMul: 1 + add / 100 }, { visible: true, data: { n } });
    });
  },

  aug_practice(battle, ps, id, p) {
    const pid = ps.playerId, key = KEY(id);
    const step = 1 + pct(p.pct), top = pct(p.max) || Infinity;
    battle.on('skillStart', ({ unit: u }) => {
      if (!isOp(u) || u.ownerId !== pid) return;
      const n = (u.mem.aug10Practice ?? 0) + 1;
      if (Math.pow(step, n - 1) >= top - 1e-12) return;
      u.mem.aug10Practice = n;
      passiveBuff(battle, u, key, { augDealtMul: Math.min(top, Math.pow(step, n)) }, { visible: true, data: { n } });
    });
  },

  aug_skill_burst(battle, ps, id, p) {
    const pid = ps.playerId, key = KEY(id);
    const share = pct(p.pct), cd = num(p.cd, 5);
    battle.on('skillStart', ({ unit: u }) => {
      if (!isOp(u) || u.ownerId !== pid || !u.alive || !u.deployed) return;
      const at = u.mem.aug10BurstAt;
      if (at != null && battle.time - at < cd - 1e-9) return;
      const foes = battle.enemiesInKeys(u.rangeKeys, u, AREA);
      if (!foes.length) return;
      u.mem.aug10BurstAt = battle.time;
      fxOn(battle, 'pulse', u, key, id, { r: 1.5 });
      const amount = num(u.s.atk) * share;
      for (const e of foes) if (e.alive) battle.dealDamage(u, e, { amount, type: 'arts', canDodge: false, tags: [key] });
    });
  },

  aug_echo_sp(battle, ps, id, p) {
    const pid = ps.playerId, key = KEY(id);
    const share = pct(p.pct);
    battle.on('skillEnd', ({ unit: u, skill: sk, reason }) => {
      if (!isOp(u) || u.ownerId !== pid || !u.alive || !u.deployed || reason === 'death' || reason === 'withdrawn') return;
      if (!sk || sk.noSkill || sk.kind === 'passive') return;
      const back = sk.spCost * share;
      if (back > 0 && sk.gainSp(back, 'augment') > 0) fxOn(battle, 'spGift', u, key, id);
    });
  },

  aug_charge(battle, ps, id, p) {
    for (const u of playerOps(battle, ps.playerId)) passiveBuff(battle, u, KEY(id), { spRecoveryMul: 1 + pct(p.pct) });
  },

  aug_opener_sp(battle, ps, id, p) {
    const pid = ps.playerId, sp = num(p.sp, 10);
    if (!(sp > 0)) return;
    battle.on('deploy', ({ unit: u }) => {
      if (!isOp(u) || u.ownerId !== pid || !u.skill || u.skill.noSkill || u.skill.kind === 'passive') return;
      u.skill.gainSp(sp, 'init');
    });
  },

  aug_final_form(battle, ps, id, p) {
    const pid = ps.playerId, key = KEY(id);
    const share = pct(p.shield), sec = num(p.sec, 10), mods = { intervalMul: faster(p.interval) };
    battle.on('skillStart', ({ unit: u }) => {
      if (!isOp(u) || u.ownerId !== pid || !u.alive || !u.deployed || u.mem.aug10FormSeq === u.deploySeq) return;
      u.mem.aug10FormSeq = u.deploySeq;
      if (share > 0 && sec > 0) battle.addBuff(u, { key: `${key}:shield`, shield: u.s.maxHp * share, duration: sec, visible: true, refresh: 'replace' });
      passiveBuff(battle, u, key, mods, { visible: true });
      fxOn(battle, 'shield', u, key, id);
    });
  },

  // ---- 防御

  aug_mirror(battle, ps, id, p) {
    const pid = ps.playerId;
    const keep = cut(p.pct);
    const done = new WeakSet();     // enemies whose first damage reached an operator
    const cutBy = new WeakMap();    // a DamageInfo this cut → its enemy (marked once it lands: `damaged`)
    battle.on('hit', (c) => {
      const s = c.source, t = c.target;
      if (!s || s.side !== 'enemy' || !isOp(t) || t.ownerId !== pid || !c.dmg || done.has(s)) return;
      c.dmg.mul *= keep;
      cutBy.set(c.dmg, s);
    });
    battle.on('damaged', (c) => {
      const s = c.dmg ? cutBy.get(c.dmg) : null;
      if (s) done.add(s);
    });
  },

  aug_wall_eye(battle, ps, id, p) {
    const pid = ps.playerId;
    const keep = cut(p.pct);
    battle.on('hit', (c) => {
      const s = c.source, t = c.target;
      if (!s || s.side !== 'enemy' || !isOp(t) || t.ownerId !== pid || !c.dmg || inRange(t, s)) return;
      c.dmg.mul *= keep;
    });
  },

  aug_veteran(battle, ps, id, p) {
    const pid = ps.playerId, key = KEY(id);
    const sec = num(p.sec, 40), mods = { dmgTakenMul: cut(p.pct) };
    every(battle, POS_PERIOD, () => {
      for (const u of playerOps(battle, pid, { fieldOnly: true })) if (battle.time - u.deployedAt >= sec - 1e-9) keepUp(battle, u, key, mods);
    });
  },

  aug_lamp(battle, ps, id, p) {
    const pid = ps.playerId, key = KEY(id);
    const mods = { augDealtMul: pct(p.dealt), dmgTakenMul: cut(p.taken) };
    let lamp = null;
    battle.on('deploy', ({ unit: u }) => {
      if (lamp || !isOp(u) || u.ownerId !== pid) return;
      lamp = u;
      passiveBuff(battle, u, key, mods, { visible: true });
      fxOn(battle, 'candle', u, key, id);
    });
    battle.on('death', (c) => {
      if (!lamp || c.unit !== lamp || (c.reason !== 'killed' && !c.dying)) return;
      battle.removeBuff(lamp, key);
    });
  },

  aug_winter_glow(battle, ps, id, p) {
    const pid = ps.playerId, key = KEY(id);
    const sec = num(p.sec, 3), r = num(p.radius, 1);
    battle.on('death', (c) => {
      const k = ownKill(c, pid);
      if (!k || !(sec > 0)) return;
      const e = c.unit;
      const foes = foesAround(battle, e.x, e.y, r, e);
      if (!foes.length) return;
      battle.fx('coldWind', { x: e.x, y: e.y, r, src: key });
      for (const o of foes) if (o.alive) battle.applyStatus(o, 'cold', { duration: sec, source: k });
    });
  },

  aug_gasoline(battle, ps, id, p) {
    const pid = ps.playerId, key = KEY(id);
    const share = pct(p.pct), sec = num(p.sec, 4), r = num(p.radius, 1);
    battle.on('death', (c) => {
      const k = ownKill(c, pid);
      if (!k || !(sec > 0)) return;
      const amount = num(k.s?.atk) * share;
      if (!(amount > 0)) return;
      const e = c.unit;
      for (const o of foesAround(battle, e.x, e.y, r, e)) {
        if (!o.alive) continue;
        battle.addBuff(o, {
          key: `${key}:burn`, duration: sec, interval: 1, refresh: 'replace', visible: true, source: k,
          onTick: ({ battle: b, unit }) => b.dealDamage(k, unit, { amount, type: 'arts', canDodge: false, ignoreSelect: true, tags: ['dot', key] }),
        });
        fxOn(battle, 'ignite', o, key, id);
      }
    });
  },

  aug_firefly(battle, ps, id, p) {
    const pid = ps.playerId, key = KEY(id);
    const share = pct(p.pct), r = num(p.radius, 1);
    battle.on('death', (c) => {
      if (!ownKill(c, pid) || !(share > 0)) return;
      const e = c.unit;
      for (const u of playerOps(battle, pid, { fieldOnly: true })) {
        if (Math.max(Math.abs(u.x - e.x), Math.abs(u.y - e.y)) > r + 1e-9 || u.s.flags.noHeal) continue;
        if (battle.heal(null, u, u.s.maxHp * share, { self: true }) > 0) fxOn(battle, 'mote', u, key, id);
      }
    });
  },

  aug_stray(battle, ps, id, p) {
    const pid = ps.playerId, key = KEY(id);
    const chance = goodChance(pct(p.prob), luckOfRefs(ps.playerEffects, battle.flags.enemyBuffs)), share = pct(p.pct);
    battle.on('attack', ({ attacker: u, targets }) => {
      if (!isOp(u) || u.ownerId !== pid || !u.alive || u.def?.position !== 'RANGED') return;
      const type = u.dmgType;
      if (type !== 'phys' && type !== 'arts' && type !== 'true') return;
      const took = targets || [];
      if (!took.some((t) => t && t.side === 'enemy') || !(battle.rng() < chance)) return;
      const cands = battle.enemies.filter((e) => !took.includes(e) && canTargetEnemy(u, e, u.profile));
      if (!cands.length) return;
      const t = cands[Math.floor(battle.rng() * cands.length)];
      fxOn(battle, 'strike', t, key, id);
      battle.dealDamage(u, t, { amount: num(u.s.atk) * share, type, tags: [key] });
    });
  },

  // ---- 站位

  aug_lone_wolf(battle, ps, id, p) {
    const pid = ps.playerId, key = KEY(id);
    const mods = { augDealtMul: pct(p.dealt), dmgTakenMul: cut(p.taken) };
    every(battle, POS_PERIOD, () => {
      for (const u of playerOps(battle, pid, { fieldOnly: true })) if (!alliesAround(battle, u, N8).some(isOp)) keepUp(battle, u, key, mods);
    });
  },

  aug_twin_wall(battle, ps, id, p) {
    const pid = ps.playerId, key = KEY(id);
    const n = Math.max(1, Math.round(num(p.n, 2))), mods = { dmgTakenMul: cut(p.taken), augDealtMul: pct(p.dealt) };
    const col = colOf(ps);
    every(battle, POS_PERIOD, () => {
      const ops = playerOps(battle, pid, { fieldOnly: true });
      let front = -Infinity;
      for (const u of ops) front = Math.max(front, col(u));
      const wall = ops.filter((u) => col(u) === front);
      if (wall.length === n) for (const u of wall) keepUp(battle, u, key, mods);
    });
  },

  aug_cover(battle, ps, id, p) {
    const pid = ps.playerId, key = KEY(id);
    const step = 1 + pct(p.pct), most = Math.max(0, Math.round(num(p.max, 4)));
    const col = colOf(ps);
    every(battle, POS_PERIOD, () => {
      const ops = playerOps(battle, pid, { fieldOnly: true });
      let front = -Infinity;
      for (const u of ops) front = Math.max(front, col(u));
      const k = Math.min(most, ops.filter((u) => col(u) >= front - 1).length);
      if (!k) return;
      const mods = { augDealtMul: Math.pow(step, k) };
      for (const u of ops) if (col(u) < front - 1) keepUp(battle, u, key, mods);
    });
  },

  aug_last_line(battle, ps, id, p) {
    const goals = battle.grid.specialTiles('end');
    if (!goals.length) return;
    const pid = ps.playerId, key = KEY(id);
    const dist = num(p.dist, 2), mods = { blockCnt: Math.round(num(p.block, 1)), dmgTakenMul: cut(p.taken) };
    every(battle, POS_PERIOD, () => {
      for (const u of playerOps(battle, pid, { fieldOnly: true })) {
        if (goals.some(([gr, gc]) => Math.max(Math.abs(u.tileR - gr), Math.abs(u.tileC - gc)) <= dist)) keepUp(battle, u, key, mods);
      }
    });
  },

  aug_feng_shui(battle, ps, id, p) {
    const d = dataOf(ps, id);
    if (!d || d.round !== battle.round || !Array.isArray(d.tiles)) return;
    const spots = new Set();
    for (const t of d.tiles) {
      if (!Array.isArray(t) || !Number.isInteger(t[0]) || !Number.isInteger(t[1])) continue;
      // board tiles, whatever coordinates the player's units came in (Battle._boardTile: a 联防 helper's +8 columns, the
      // boss field's rows, the mirrored right half)
      const [r, c] = typeof battle._boardTile === 'function' ? battle._boardTile(ps, t[0], t[1]) : battle.mapTile(ps, t[0], t[1]);
      spots.add(r * COLS + c);
    }
    if (!spots.size) return;
    const pid = ps.playerId, key = KEY(id);
    const mods = { augDealtMul: pct(p.dealt) };
    every(battle, POS_PERIOD, () => {
      for (const u of playerOps(battle, pid, { fieldOnly: true })) if (spots.has(u.tileR * COLS + u.tileC)) keepUp(battle, u, key, mods);
    });
  },

  aug_frozen_heart(battle, ps, id, p) {
    const pid = ps.playerId, key = KEY(id);
    const mods = { intervalMul: 1 + pct(p.pct) };
    every(battle, POS_PERIOD, () => {
      for (const e of battle.enemies) {
        const b = e.alive ? e.blockedBy : null;
        if (isOp(b) && b.ownerId === pid) keepUp(battle, e, key, mods, false);
      }
    });
  },

  // ---- 克制

  aug_vs_times(battle, ps, id, p) {
    const pid = ps.playerId;
    const n = Math.max(1, Math.round(num(p.n, 2)));
    battle.on('hit', (c) => {
      const s = c.source, t = c.target;
      if (!s || s.side !== 'ally' || s.ownerId !== pid || !t || t.side !== 'enemy' || !c.dmg) return;
      const f = t.s.flags;
      if (f.hitCount || f.hitCountArts) c.dmg.hits = Math.max(num(c.dmg.hits, 1), n);
    });
  },

  aug_vs_element(battle, ps, id, p) {
    for (const u of playerOps(battle, ps.playerId)) passiveBuff(battle, u, KEY(id), { elemTakenMul: cut(p.pct) });
  },

  aug_vs_dot(battle, ps, id, p) {
    const pid = ps.playerId;
    const keep = cut(p.pct);
    battle.on('hit', (c) => {
      const t = c.target, d = c.dmg;
      if (!isOp(t) || t.ownerId !== pid || !d) return;
      const tags = Array.isArray(d.tags) ? d.tags : [];
      const src = c.source ?? c.credit;
      const dot = battle._tickingUnit === t || tags.some((x) => DOT_TAGS.has(x))
        || (!!src && src.side === 'enemy' && !d.isAttack && acTypes(src).includes('DOT'));
      if (dot) d.mul *= keep;
    });
  },

  aug_vs_reflect(battle, ps, id, p) {
    const pid = ps.playerId;
    const share = pct(p.pct);
    battle.on('hit', (c) => {
      const s = c.source, t = c.target, d = c.dmg;
      if (!s || s.side !== 'ally' || s.ownerId !== pid || !t || t.side !== 'enemy' || !d || d.type !== 'arts') return;
      const res = refractionRes(t);
      if (res > 0) d.resIgnoreFlat = num(d.resIgnoreFlat) + res * share;
    });
  },
};

/**
 * Battle side: install augment `id` (definition `def`) of player `ps` (the battle's player input) on `battle`.
 * @returns {boolean} whether this batch handles the id
 */
export function install(battle, ps, id, def) {
  const fn = BATTLE[id];
  if (typeof fn !== 'function') return false;
  fn(battle, ps, id, (def && def.params) || {});
  return true;
}

/** Prep side: augment id → (params) => handler object (onRoundStart, onBuy, onSpend, onPrepEnd, …). */
export const META = Object.freeze({});
