// server/sim/content/augments5/g2.js — A6000 fork, 海克斯第五版 (联动：站位、装备、技能、召唤、元素、领袖战、运营（M1–M10、N1–N6、Q1–Q4）): the effects of
// shared/augments5/g2.js. server/sim/content/augments.js calls `install` for every augment a battle player holds (true =
// handled here) and merges `META` (augment id → prep-side handler factory, as its own META).
//
// Battle side. Number bonuses are the independent multipliers of content/augments.js — a unit's augDealtMul / a hit's
// augMul (damage.js applies them with 限伤保护), dmgTakenMul —; 守财奴 is its text's 攻击 +X% (直接乘算). "Mine" = the
// player's units (summons included) unless an operator is named.
//   aug_medic_field   every 0.25 s: an operator with k of the player's MEDIC operators on its 8 surrounding tiles takes
//                     ×(1 − pct·min(k, max)) (medics count for each other; a knocked-out one covers nobody)
//   aug_dual_wield    an operator carrying 2 items: its items' attribute bonuses ×pct (items/battle.js itemStatScale —
//                     the bonuses only: a drawback such as 不屈弹射器's HP −30 % stays; triggered effects unchanged)
//   aug_fast_tempo /  every skill of mine: the SP cost ×(1 ∓ cost) from its first deployment (Skill.spCostMul, the way
//   aug_slow_craft    绝技 changes it), and at each activation the time left ×(1 ∓ dur) — an ammo skill's bullets too
//                     (rounded, ≥ 1): its "duration" (慢工细活's 联动 names 拉特兰's ammo skills)
//   aug_summon_horde  my summons (tokens) deal ×dealt and have HP ×(1 + hp) from their deployment; an operator whose loadout
//                     makes summons (def.tokens it produces: Battle.producesToken) +sp SP at every deployment ('init', as
//                     技力涌流's)
//   aug_rotation      every redeploy of my operators (after a knock-out, a retreat, a 突袭 jump: a `deploy` neither
//                     initial nor a 【移动】) → every operator ×(1 + pct)^n for the battle, at most ×cap
//   aug_elem_overload my element 损伤 on enemies ×fill (elementHit: dmg.mul), the element bursts it sets off (无来源 damage
//                     credited to the filler: tagged 'burst' + its element) ×burst
//   aug_anti_air      my hits on an air enemy (Unit.isFlying: 飞行, 近地悬浮 and 浮空; a 缚地 one is not) ×pct
//   aug_flare         every 0.2 s: a 隐匿 enemy that came into the attack range of one more of my operators gets 反隐 (status
//                     'reveal', selectable) for sec s — each range entered refreshes it, staying in one does not
//   aug_diverse       n+ professions among my operators of the battle: ×dealt, damage taken ×(1 − taken)
//   aug_limit_break   boss / hidden: a hit credited to me that would reach the 限伤 counts as `cap` HP instead of nothing
//                     (damage.js `hitLimit`); a 'crit' fx marks it
//   aug_decapitate    boss / hidden: my hits on a leader (isBoss, or a part feeding its pool) ×boss, on other enemies ×other
//   aug_last_battle   boss (the Final Assault): the team LP lost in this field — leaks (their lpr), the leaders' 扣除目标生命
//                     (`lpLoss`) and the overtime drain by the field clock (the EffectRef data the match writes at the boss
//                     round's start, server/match/augments5/g2.js: { after: REAL s the drain starts, scale: game s a real
//                     second, drain: LP a real second }; without it 150 / 2 / 1) — every operator ×(1 + pct)^lost, at
//                     most ×cap. An estimate: the other boss field's leaks are not seen here.
//   aug_one_blow      boss: an operator's hits while the first skill activation of its battle runs (Skill.activations 1 —
//                     an instant cast until its attack is done) ×pct
//   aug_miser         ATK +n % (直接乘算) — n = the EffectRef counter the prep keeps
// Prep side (META): 战前动员 (onPrepEnd of the boss / hidden round), 战备基金 (onRoundStart), 定向猎头 (onRefresh), 守财奴
// (onPrepEnd). 争分夺秒, 背水决战's overtime data and 开门红: server/match/augments5/g2.js (helpers exported below).

import { num, isOp, playerOps, passiveBuff, directMods, fxOn, alliesAround, itemsOf, inRange, N8 } from '../support/index.js';
import { hitLimitOf } from '../../damage.js';
import { BOSS_HIT_LIMIT } from '../../../../shared/constants.js';
import { professionOf } from '../classAugments.js';
import { rescaleItemStats } from '../items/battle.js';
import { enemyStealthed } from '../../targeting.js';
import { ELEMENT_ORDER } from '../../constants.js';
import { msg } from '../../../../shared/i18n.js';

const KEY = (id) => `augment:${id}`;
const pct = (v) => num(v) / 100;
const cut = (v) => Math.max(0, 1 - pct(v));
/** Seconds between two reads of 医疗方阵's neighbourhoods: operators move, die and redeploy. */
const POS_PERIOD = 0.25;
/** Seconds between two reads of 照明弹's attack ranges. */
const FLARE_PERIOD = 0.2;
/** Bonds no layer of a 海克斯 goes to (content/augments.js NO_STACK: 调和, 协防, 独行, 绝技 — no per-layer effect). */
const NO_STACK = new Set(['maniShip', 'emptyShip', 'soloShip', 'suntShip']);
/** The overtime drain when the match wrote no numbers (server/match/gamedata.js defaults: 150 real s, ×2 clock, 1 LP / s). */
const OVERTIME = Object.freeze({ after: 150, scale: 2, drain: 1 });

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

/** A buff a periodic rule keeps up: it lapses one period after the rule stops holding (new mods are taken at once). */
const keepUp = (battle, u, key, mods, period = POS_PERIOD) => battle.addBuff(u, { key, mods, duration: period + 0.15, refresh: 'extend', visible: true });

function refOf(ps, id) { return (ps.playerEffects || []).find((r) => r && r.key === KEY(id)) || null; }
function dataOf(ps, id) { const r = refOf(ps, id); return r && r.data && typeof r.data === 'object' ? r.data : null; }
const counterOf = (ps, id) => Math.max(0, num(refOf(ps, id)?.counter, 0));
const bossLike = (battle) => battle.kind === 'boss' || battle.kind === 'hidden';

/** Every operator of `pid` (dead ones included: a redeploy keeps it) gets the battle-long multiplier `mul` under `key`. */
function allOpsMul(battle, pid, key, mul) {
  for (const u of playerOps(battle, pid)) passiveBuff(battle, u, key, { augDealtMul: mul }, { visible: true });
}

/**
 * 快节奏 / 慢工细活: the SP cost of every skill of `pid`'s units × costMul, each activation's time left (bullets) × durMul.
 * (海克斯第六版's 无限火力 takes it too: augments5/g9.js.)
 */
export function skillTempo(battle, pid, costMul, durMul) {
  const mine = (u) => !!u && u.side === 'ally' && u.ownerId === pid;
  const done = new WeakSet();
  battle.on('deploy', ({ unit: u }) => {
    const sk = u && u.skill;
    if (!mine(u) || !sk || sk.noSkill || sk.kind === 'passive' || done.has(sk)) return;
    done.add(sk);
    sk.spCostMul = sk.spCostMul * costMul;
  }, { priority: 100 });
  battle.on('skillStart', ({ unit: u, skill: sk }) => {
    if (!mine(u) || !sk || !sk.active || durMul === 1) return;
    if (Number.isFinite(sk.timeLeft) && sk.timeLeft > 0) sk.extend(sk.timeLeft * (durMul - 1));
    if (sk.kind === 'ammo' && sk.ammoLeft > 0) {
      const want = Math.max(1, Math.round(sk.ammoLeft * durMul));
      if (want > sk.ammoLeft) sk.addAmmo(want - sk.ammoLeft);
      else if (want < sk.ammoLeft) { sk.ammoLeft = want; sk.ammoMax = Math.min(sk.ammoMax, want); }
    }
  }, { priority: -50 });
}

/** Whether operator `u`'s loadout makes summons (人海战术): a token of its record that its skill / module produces. */
function makesSummons(battle, u) {
  if (u.mem.aug5Summons != null) return u.mem.aug5Summons;
  let yes = false;
  for (const t of Array.isArray(u.def?.tokens) ? u.def.tokens : []) {
    const id = typeof t === 'string' ? t : t && (t.tokenId ?? t.id);
    if (typeof id === 'string' && id && battle.producesToken(u, id)) { yes = true; break; }
  }
  u.mem.aug5Summons = yes;
  return yes;
}

/** An element burst's damage (damage.js resolveBurst): 无来源, tagged 'burst' and its element. */
const isBurst = (d) => !!d && d.sourceless && Array.isArray(d.tags) && d.tags.includes('burst') && ELEMENT_ORDER.some((el) => d.tags.includes(el));

/** Battle installs: (battle, ps, params, key, id). */
const BATTLE = {
  aug_medic_field(battle, ps, p, key) {
    const pid = ps.playerId;
    const per = pct(p.pct), most = Math.max(1, Math.round(num(p.max, 2)));
    const mods = [null];
    for (let k = 1; k <= most; k++) mods.push({ dmgTakenMul: Math.max(0, 1 - per * k) });
    const medic = (u) => isOp(u) && professionOf(u) === 'MEDIC';
    every(battle, POS_PERIOD, () => {
      const ops = playerOps(battle, pid, { fieldOnly: true });
      if (!ops.some(medic)) return;
      for (const u of ops) {
        let k = 0;
        for (const v of alliesAround(battle, u, N8)) if (medic(v)) k++;
        if (k > 0) keepUp(battle, u, key, mods[Math.min(most, k)]);
      }
    });
  },

  aug_dual_wield(battle, ps, p) {
    const pid = ps.playerId, k = pct(p.pct);
    const holds = (u) => isOp(u) && u.ownerId === pid && itemsOf(u).length >= 2;
    const prev = battle.itemStatScale;
    battle.itemStatScale = (u) => (holds(u) ? k : 1) * (typeof prev === 'function' ? num(prev(u), 1) : 1);
    for (const u of playerOps(battle, pid)) if (holds(u)) rescaleItemStats(battle, u);
  },

  aug_fast_tempo(battle, ps, p) { skillTempo(battle, ps.playerId, cut(p.cost), cut(p.dur)); },
  aug_slow_craft(battle, ps, p) { skillTempo(battle, ps.playerId, 1 + pct(p.cost), 1 + pct(p.dur)); },

  aug_summon_horde(battle, ps, p, key) {
    const pid = ps.playerId;
    const mods = { augDealtMul: pct(p.dealt), hpMul: 1 + pct(p.hp) };
    const sp = num(p.sp, 3);
    battle.on('deploy', ({ unit: u }) => {
      if (!u || u.side !== 'ally' || u.ownerId !== pid) return;
      if (u.kind === 'token') { if (!u.findBuff(key)) passiveBuff(battle, u, key, mods); return; }
      if (u.kind === 'op' && sp > 0 && u.skill && !u.skill.noSkill && makesSummons(battle, u)) u.skill.gainSp(sp, 'init');
    });
  },

  aug_rotation(battle, ps, p, key) {
    const pid = ps.playerId;
    const step = 1 + pct(p.pct), cap = pct(p.cap);
    let n = 0, cur = 1;
    battle.on('deploy', ({ unit: u, initial, move }) => {
      if (initial || move || !isOp(u) || u.ownerId !== pid) return;
      n++;
      const mul = Math.min(cap, Math.pow(step, n));
      if (!(mul > cur + 1e-12)) return;
      cur = mul;
      allOpsMul(battle, pid, key, mul);
    });
  },

  aug_elem_overload(battle, ps, p) {
    const pid = ps.playerId;
    const mine = (u) => !!u && u.side === 'ally' && u.ownerId === pid;
    const fill = pct(p.fill), burst = pct(p.burst);
    battle.on('elementHit', (c) => { if (c.dmg && mine(c.source) && c.target && c.target.side === 'enemy') c.dmg.mul *= fill; });
    battle.on('hit', (c) => { if (c.dmg && isBurst(c.dmg) && mine(c.credit) && c.target && c.target.side === 'enemy') c.dmg.augMul *= burst; });
  },

  aug_anti_air(battle, ps, p) {
    const pid = ps.playerId, mul = pct(p.pct);
    battle.on('hit', (c) => {
      const s = c.source, t = c.target;
      if (c.dmg && s && s.side === 'ally' && s.ownerId === pid && t && t.side === 'enemy' && t.isFlying) c.dmg.augMul *= mul;
    });
  },

  aug_flare(battle, ps, p) {
    const pid = ps.playerId, sec = num(p.sec, 5);
    const seen = new WeakMap(); // enemy → my operators whose attack range held it at the last read
    every(battle, FLARE_PERIOD, () => {
      let ops = null;
      for (const e of battle.enemies) {
        if (!e.alive || e.hidden || !e.deployed || !e.s.flags.stealth) continue;
        ops ??= playerOps(battle, pid, { fieldOnly: true });
        const now = ops.filter((u) => inRange(u, e));
        const before = seen.get(e);
        seen.set(e, now);
        const by = now.find((u) => !before || !before.includes(u));
        if (!by) continue;
        const shown = !enemyStealthed(e);
        if (battle.applyStatus(e, 'reveal', { duration: sec, source: by }) && !shown) battle.fx('reveal', { x: e.x, y: e.y, id: e.id });
      }
    });
  },

  aug_diverse(battle, ps, p, key) {
    const ops = playerOps(battle, ps.playerId);
    if (new Set(ops.map(professionOf).filter(Boolean)).size < num(p.n, 6)) return;
    for (const u of ops) passiveBuff(battle, u, key, { augDealtMul: pct(p.dealt), dmgTakenMul: cut(p.taken) });
  },

  aug_limit_break(battle, ps, p, key, id) {
    if (!bossLike(battle)) return;
    const pid = ps.playerId, cap = num(p.cap, 150000);
    battle.on('hitLimit', (c) => {
      const s = c.credit;
      if (!s || s.side !== 'ally' || s.ownerId !== pid || c.capped > 0) return;
      // 敌人强化·首领·限伤 lowers the line: the counted hit shrinks with it (half of it at the default cap)
      c.capped = cap * (hitLimitOf(battle) / BOSS_HIT_LIMIT);
      fxOn(battle, 'crit', c.target, key, id);
    });
  },

  aug_decapitate(battle, ps, p) {
    if (!bossLike(battle)) return;
    const pid = ps.playerId, boss = pct(p.boss), other = pct(p.other);
    battle.on('hit', (c) => {
      const s = c.source, t = c.target;
      if (!c.dmg || !s || s.side !== 'ally' || s.ownerId !== pid || !t || t.side !== 'enemy') return;
      c.dmg.augMul *= t.isBoss || t.bossPool ? boss : other;
    });
  },

  aug_last_battle(battle, ps, p, key, id) {
    if (battle.kind !== 'boss') return;
    const pid = ps.playerId;
    const step = 1 + pct(p.pct), cap = pct(p.cap);
    const d = dataOf(ps, id);
    const ot = d && d.round === battle.round ? d : OVERTIME;
    const after = num(ot.after, OVERTIME.after), scale = num(ot.scale, OVERTIME.scale) > 0 ? num(ot.scale, OVERTIME.scale) : OVERTIME.scale;
    const drain = num(ot.drain, OVERTIME.drain);
    // gamedata.js bossOvertimeDue: `drain` per whole real second past `after`
    const due = () => { const over = battle.time / scale - after; return over >= 1 ? Math.floor(over) * drain : 0; };
    let lost = 0, cur = 1;
    const apply = () => {
      const mul = Math.min(cap, Math.pow(step, lost + due()));
      if (Math.abs(mul - cur) < 1e-12) return;
      cur = mul;
      allOpsMul(battle, pid, key, mul);
    };
    battle.on('enemyLeak', ({ enemy: e }) => { lost += e && Number.isFinite(e.lpr) && e.lpr >= 0 ? e.lpr : 1; apply(); });
    battle.on('lpLoss', (c) => { const n = Number(c && c.amount); if (n > 0) { lost += n; apply(); } });
    every(battle, 0.5, apply);
  },

  aug_one_blow(battle, ps, p) {
    if (battle.kind !== 'boss') return;
    const pid = ps.playerId, mul = pct(p.pct);
    battle.on('hit', (c) => {
      const s = c.source, sk = s && s.skill, t = c.target;
      if (!c.dmg || !isOp(s) || s.ownerId !== pid || !sk || sk.noSkill || sk.kind === 'passive' || !sk.active || sk.activations !== 1) return;
      if (t && t.side === 'enemy') c.dmg.augMul *= mul;
    });
  },

  aug_miser(battle, ps, p, key, id) {
    const n = Math.min(num(p.max, 20), counterOf(ps, id));
    if (n > 0) for (const u of playerOps(battle, ps.playerId)) passiveBuff(battle, u, key, directMods({ atk: n / 100 }));
  },
};

/**
 * Battle side: install augment `id` (definition `def`) of player `ps` (the battle's player input) on `battle`.
 * @returns {boolean} whether this batch handles the id
 */
export function install(battle, ps, id, def) {
  const fn = BATTLE[id];
  if (typeof fn !== 'function') return false;
  fn(battle, ps, def.params || {}, KEY(id), id);
  return true;
}

// =====================================================================================================================
// prep side — helpers shared with server/match/augments5/g2.js (开门红 builds a ctx: effectsMeta.js makeCtx)

/**
 * The core bond with the most distinct board members (ties: more layers), or null — 同乡会's rule (content/augments.js),
 * leaving out a bond the mode switches off (gd.modeInactiveBonds).
 */
export function topCoreOnBoard(ctx) {
  const off = ctx.gd.modeInactiveBonds instanceof Set ? ctx.gd.modeInactiveBonds : null;
  const by = new Map();
  for (const v of ctx.board()) {
    if (!v || v.kind !== 'chess') continue;
    for (const b of ctx.pieceBonds(v.uid)) {
      if (!ctx.gd.bond(b)?.isCore || (off && off.has(b))) continue;
      if (!by.has(b)) by.set(b, new Set());
      by.get(b).add(ctx.gd.baseIdOf(v.id));
    }
  }
  let best = null, n = 0;
  for (const [b, s] of by) if (s.size > n || (s.size === n && ctx.layers(b) > ctx.layers(best))) { best = b; n = s.size; }
  return best;
}

/** Whether chess `id` is a normal chess of `bond` (the player's data view). */
export const isBondMember = (ctx, id, bond) => !ctx.gd.isGolden(id) && (ctx.chessRecord(id)?.bonds || []).includes(bond);

/** The base ids of every chess the player holds (board, hand, 临时整备区). */
function ownedBases(ctx) {
  const out = new Set();
  for (const v of [...ctx.board(), ...ctx.hand(), ...ctx.temp()]) if (v && v.kind === 'chess') out.add(ctx.gd.baseIdOf(v.id));
  return out;
}

/**
 * Put a normal chess of `ok(id)` (≤ the dispatch level, copy-weighted from the pool) on a random unfrozen chess slot,
 * unless an unsold slot already shows one (content/augments.js ensureInShop). Returns whether the shop shows one now.
 */
function ensureInShop(ctx, ok) {
  const slots = ctx.shopSlots();
  if (slots.some((x) => x && x.kind === 'chess' && !x.sold && ok(x.id))) return true;
  const free = slots.map((x, i) => (x && x.kind === 'chess' && !x.sold && !x.frozen ? i : -1)).filter((i) => i >= 0);
  if (!free.length) return false;
  const id = ctx.rollChess({ maxTier: Math.max(1, ctx.shopLevel()), filter: (x) => !ctx.gd.isGolden(x) && ok(x) });
  if (!id) return false;
  return ctx.setShopSlot(ctx.rng.pick(free), { kind: 'chess', id });
}

/** Prep side: augment id → (params) => handler object (onRoundStart, onBuy, onSpend, onPrepEnd, …). */
export const META = Object.freeze({
  // 战前动员: the prep end of the boss / hidden round (the battle comes next) — every active bond (NO_STACK left out)
  // + pct % of its layers, at most max, as real layers (they count for the Hidden Core's sum, taken right after)
  aug_mobilize: (p) => ({
    onPrepEnd(ctx) {
      const gd = ctx.gd;
      if (ctx.round !== gd.bossRound && !(gd.hiddenRound && ctx.round === gd.hiddenRound)) return;
      let sum = 0;
      for (const [b, st] of Object.entries(ctx.bonds())) {
        if (!st || !st.active || NO_STACK.has(b)) continue;
        const add = Math.min(num(p.max, 50), Math.floor((ctx.layers(b) * num(p.pct, 10)) / 100 + 1e-9));
        if (add > 0) sum += ctx.addLayers(b, add, { requireActive: true, reason: 'augment:aug_mobilize' });
      }
      if (sum > 0) ctx.toast(msg('战前动员：已激活的盟约共 +{n} 层', { n: sum }));
    },
  }),
  // 战备基金: the round start — n or more different active bonds → +funds
  aug_war_fund: (p) => ({
    onRoundStart(ctx) {
      const n = Object.values(ctx.bonds()).filter((st) => st && st.active).length;
      if (n >= num(p.n, 4)) ctx.addFunds(num(p.funds, 1), 'augment:aug_war_fund');
    },
  }),
  // 定向猎头: the round's first manual refresh shows a member of the top core bond the player holds no copy of
  aug_headhunt: () => ({
    onRefresh(ctx, ev) {
      if ((ev && ev.trigger) || ctx.roundStats().refreshes !== 1) return;
      const b = topCoreOnBoard(ctx);
      if (!b) return;
      const have = ownedBases(ctx);
      ensureInShop(ctx, (id) => isBondMember(ctx, id, b) && !have.has(ctx.gd.baseIdOf(id)));
    },
  }),
  // 守财奴: the prep end — every `per` funds left adds atk % to the battle's ATK bonus (the EffectRef counter), at most max
  // for the match (坎诺特's kept funds count as well: they are left at the prep end like anyone's)
  aug_miser: (p) => ({
    onPrepEnd(ctx) {
      const max = num(p.max, 20);
      const cur = Math.min(max, ctx.counter('aug5:miser'));
      const add = Math.floor(Math.max(0, ctx.funds()) / Math.max(1, Math.trunc(num(p.per, 3)))) * num(p.atk, 1);
      const next = Math.min(max, cur + add);
      if (!(next > cur)) return;
      ctx.setCounter('aug5:miser', next);
      ctx.setEffectCounter(KEY('aug_miser'), next);
    },
  }),
});
