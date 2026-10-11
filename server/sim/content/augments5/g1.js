// server/sim/content/augments5/g1.js — A6000 fork, 海克斯第五版 (联动：层数、叠层手、精锐（J1–J7、K1–K5、L1–L4，O14 今日特供，O20 木桩大师）): the effects of
// shared/augments5/g1.js. server/sim/content/augments.js calls `install` for every augment a battle player holds (true =
// handled here) and merges `META` (augment id → prep-side handler factory, as its own META).
//
// Battle side (number bonuses are the independent multipliers: augDealtMul 造成的伤害提升至, dmgTakenMul 受到的伤害降低):
//   满编之师  aug_full_muster    the members of a core bond at its top tier (bondTier ≥ 2: 6, 阿戈尔 5, 炎 6 / 9)
//   层层加码  aug_layer_raise    per active bond, (1 + pct)^⌊(L − from) / per⌋ on its members (an operator of several: the
//                               product, ≤ max); re-read at the battle start and one tick after a layer gain
//   主次相承  aug_main_lead      a battle-only layer bonus (addLayerBonus) on the other active add-on bonds: layer per `per`
//                               layers of the top active bond (its real layers, ≤ max); re-read after a gain
//   专精深耕  aug_deep_focus     an in-battle gain of the bond the pick noted (EffectRef data.bond) +pct % (≥ 1)
//   双核驱动  aug_twin_core      exactly two active core bonds: members of both ×both, of one ×one
//   层数换算  aug_layer_power    Final Assault / Hidden Core: (1 + pct)^⌊Σ active layers / per⌋ (≤ max) on every operator
//   以战养战  aug_war_feeds      an operator's own 特质 gain (layerGain reason 'garrison', source = it; once a moment): its
//                               damage ×(1 + pct) more, ≤ max a battle
//   先苦后甜  aug_late_bloom     the battle's round ≤ round: ×early; later (every kind of battle): ×late
//   练功房 / 木桩大师  aug_dojo / aug_dummy_master  a training dummy on the player's half of a normal battle once the half is
//                               cleared, hp % of the round's enemy HP there (dummyOn, spawnDummy)
//   金光闪闪  aug_golden_glow    (1 + pct)^(elites, ≤ max) on the elite operators
//   终端火力  aug_top_tier       tier 6 ×dealt and −taken; tiers ≤ lowTier ×low
//   草根逆袭  aug_grassroots     no operator of tier ≥ minTier: every operator ×dealt and −taken
//   今日特供  aug_daily_special  the round's bond (EffectRef data { round, bond }, the prep's draw) counts pct % of its layers
// A battle-only layer bonus that starts or changes asks the bonds' standing effects to re-read their layers
// (refreshLayers): they were set when the bonds installed, before the 海克斯.
//
// Prep side (META): 专精深耕 (the noted bond, +pct % of a prep gain), 盟约里程碑 (funds per 100-layer milestone), 精锐传承 (an
// elite's active bonds +layer), 双倍奖励 (one more promotion reward), 今日特供 (the round's draw and its ticker).

import {
  num, isOp, isElite, onField, playerOps, passiveBuff, activeBondIds, bondState, bondTier, bondActive, bondLayers,
  addLayerBonus, isMember, isCoreBond, tierOf, COLS,
} from '../support/index.js';
import { N_, msg, dn } from '../../../../shared/i18n.js';
import { PHASE } from '../../../../shared/constants.js';

const KEY = (id) => `augment:${id}`;
const pct = (v) => num(v) / 100;
const cut = (v) => Math.max(0, 1 - pct(v));

/** Bonds with no per-layer effect (调和, 协防, 独行, 绝技 — content/augments.js NO_STACK; its own copy: no import cycle). */
const NO_STACK = new Set(['maniShip', 'emptyShip', 'soloShip', 'suntShip']);
/** Bonds of the prep only (远见, 奇迹, 投资人): no battle effect reads their layers. */
const PREP_ONLY = new Set(['visiShip', 'miraShip', 'investShip']);

/** The data of one of the player's augment EffectRefs (what the prep side decided), or null. */
function dataOf(ps, id) {
  const ref = (ps.playerEffects || []).find((r) => r && r.key === KEY(id));
  return ref && ref.data && typeof ref.data === 'object' ? ref.data : null;
}
const holds = (ps, id) => (ps.playerEffects || []).some((r) => r && r.key === KEY(id));

/**
 * Ask the standing layer effects of `bondIds` (炎 ATK, 维多利亚, 阿戈尔 HP, the add-on passives, the 特质 that read layers)
 * to re-read them: they were set when the bonds installed and are re-read one tick after a `layerGain` of their bond. An
 * empty gain (n 0, reason 'refresh') does that and adds nothing — every gain handler skips a gain of n ≤ 0 (乘胜追击,
 * 小盟约专精, 专属强化I·埃芒加德; 魔王's +extra answers reason 'garrison' only).
 */
function refreshLayers(battle, pid, bondIds) {
  if (!battle.hasHook('layerGain')) return;
  for (const bondId of bondIds) battle.emit('layerGain', { playerId: pid, bondId, n: 0, reason: 'refresh', source: null, tile: null });
}

/** `fn()` one tick after any layer gain of player `pid` (coalesced: the gain is written after the hook). */
function afterGains(battle, pid, fn) {
  let pending = false;
  battle.on('layerGain', (c) => {
    if (c.playerId !== pid || pending) return;
    pending = true;
    battle.after(0, () => { pending = false; fn(); });
  }, { priority: -300 });
}

// =====================================================================================================================
// 练功房 / 木桩大师: the training dummy

const DUMMY_KEY = 'enemy_aug_dummy';
/** Its model: 简饲源石虫 (「无害的源石虫」), which the client has. */
const DUMMY_LOOK = 'enemy_10001_trslim';
const DUMMY_NAME = N_('木桩');
/** Units that hit enemies (a healer's range does not count). */
const HITS = new Set(['phys', 'arts', 'true']);

/** The player whose half a queued spawn comes on (as spawnEnemy decides). */
const ownerOf = (battle, s) => s.ownerPlayerId ?? battle._ownerForTile(s.pos ?? battle._routeFor(s.routeIndex, s.route)?.start);

/**
 * The round's enemies of `pid`'s half: the total max HP and the mean DEF / RES of the counted queued spawns (no leader,
 * no part) with their multipliers and the wave's stat overrides — what spawnEnemy would give them. Read at the install:
 * the whole schedule is queued then. null when none is.
 */
function roundEnemies(battle, pid) {
  let n = 0, hp = 0, def = 0, res = 0;
  const mul = (v, pos = false) => { const x = Number(v); return Number.isFinite(x) && (pos ? x > 0 : x >= 0) ? x : 1; };
  for (const s of battle._pending || []) {
    if (!s || !s.counted || s.tag === 'boss' || s.tag === 'part' || ownerOf(battle, s) !== pid) continue;
    const d = battle.data.getEnemy(s.enemyKey);
    if (!d) continue;
    const ov = (battle.enemyOverrides[d.key] ?? battle.enemyOverrides[s.enemyKey])?.stats ?? null;
    const m = s.mods || {};
    hp += Math.max(1, num(ov?.maxHp ?? ov?.hp, d.maxHp)) * mul(m.hpMul, true);
    def += Math.max(0, num(ov?.def, d.def)) * mul(m.defMul);
    res += Math.max(0, num(ov?.res, d.res)) * mul(m.resMul);
    n++;
  }
  return n ? { n, hp, def: def / n, res: res / n } : null;
}

/** `pid`'s half is cleared: no spawn of it still queued, no enemy of it alive (but the dummy). */
const halfCleared = (battle, pid) => !(battle._pending || []).some((s) => s && ownerOf(battle, s) === pid)
  && !battle.enemies.some((e) => e.alive && e.ownerId === pid && e.tag !== 'augDummy');

/**
 * The dummy's tile: a free ground path tile of `pid`'s half (no route's start or end, no unit on it) inside the attack
 * range of the most of the player's units that hit enemies; ties: the farthest from a goal (the last an operator turns
 * to), then the lowest tile key. null when no such unit reaches any (a dummy nobody hits would only hold the battle).
 */
function dummyTile(battle, pid) {
  const path = battle.groundPathTiles();
  if (!path || !path.size) return null;
  const ends = [];
  const gates = new Set();
  for (const r of battle.routes || []) {
    for (const p of [r && r.start, r && r.end]) if (Array.isArray(p)) gates.add(Math.round(p[0]) * COLS + Math.round(p[1]));
    if (r && Array.isArray(r.end)) ends.push(r.end);
  }
  const shooters = battle.allyUnits.filter((u) => u.ownerId === pid && (u.kind === 'op' || u.kind === 'token') && onField(u) && u.rangeKeySet && HITS.has(u.dmgType));
  let best = null;
  for (const k of path) {
    const r = Math.floor(k / COLS), c = k - r * COLS;
    if (gates.has(k) || !battle.grid.inRect(r, c) || battle._ownerForTile([r, c]) !== pid || battle.isReservedTile(r, c)) continue;
    let cover = 0;
    for (const u of shooters) if (u.rangeKeySet.has(k)) cover++;
    if (!cover) continue;
    const far = ends.length ? Math.min(...ends.map(([er, ec]) => Math.abs(er - r) + Math.abs(ec - c))) : 0;
    if (!best || cover > best.cover || (cover === best.cover && (far > best.far || (far === best.far && k < best.k)))) best = { r, c, k, cover, far };
  }
  return best;
}

/**
 * The training dummy (`foes`: roundEnemies; `share`: its HP as that share of their total HP, their mean DEF / RES). It
 * never attacks (no damage type, disarmed), never moves (noMove), takes no block slot (unblockable), is never pushed
 * (noDisplace), comes after any other enemy in the operators' choice (taunt −1), never leaks — a timeout skips it
 * (mem.noLeak) — and counts in no total, so a perfect battle is judged without it; its key is in no spawn schedule, so the
 * 敌人强化 分裂 / 不灭 leave it alone (mem.ebSplit). null when no tile suits (dummyTile).
 */
function spawnDummy(battle, pid, key, foes, share) {
  const at = dummyTile(battle, pid);
  if (!at) return null;
  const def = {
    key: DUMMY_KEY, name: DUMMY_NAME, rank: 'NORMAL', applyWay: 'NONE', spine: DUMMY_LOOK, iconId: DUMMY_LOOK, notCountInTotal: true,
    stats: {
      maxHp: Math.max(1, Math.round(foes.hp * share)), atk: 0, def: Math.round(foes.def), res: Math.round(foes.res), moveSpeed: 0,
      bat: 2, aspd: 100, rangeRadius: 0, blockCnt: 1, massLevel: 1, lpr: 0, dmgType: 'none', motion: 'WALK', tauntLevel: -1,
    },
    tags: [], abilities: [], talents: { bb: {} }, skills: [],
  };
  const e = battle.spawnEnemy(DUMMY_KEY, { def, pos: [at.r, at.c], ownerPlayerId: pid, countInTotal: false, tag: 'augDummy' });
  if (!e) return null;
  battle.addBuff(e, { key, persist: true, flags: { noMove: true, unblockable: true, noDisplace: true, disarm: true } });
  e.mem.noLeak = true;
  e.mem.ebSplit = true;
  return e;
}

/**
 * 练功房 / 木桩大师 in a normal battle (one that gains layers — not a bot's rehearsal) with enemies queued on the player's
 * half: once that half is cleared, the dummy comes (the `tick` hook runs before the end check, so the battle goes on). The
 * time limit or its knock-out ends the battle: the operators that must hit or cast to stack their layers keep at it after
 * the wave, and nothing of the wave itself changes.
 */
function dummyOn(battle, ps, id, share) {
  if (battle.kind !== 'normal' || battle.flags.layerGainsEnabled === false) return;
  const pid = ps.playerId;
  const foes = roundEnemies(battle, pid);
  if (!foes) return;
  // the ground path of the wave's own routes (Battle.groundPathTiles keeps the routes its queued spawns name: asked now,
  // with the whole schedule queued, a later call still knows them)
  battle.groundPathTiles();
  const h = battle.on('tick', () => {
    if (!halfCleared(battle, pid)) return;
    battle.off(h);
    spawnDummy(battle, pid, KEY(id), foes, share);
  });
}

// =====================================================================================================================
// battle side

const BATTLE = {
  // J1 满编之师: the core bonds at their top tier (thresholds 3 / 6, 阿戈尔 3 / 5, 炎 3 / 6 / 9: tier ≥ 2)
  aug_full_muster(battle, ps, id, p) {
    const pid = ps.playerId;
    const full = activeBondIds(battle, pid).filter((b) => isCoreBond(b) && bondTier(battle, pid, b) >= 2);
    if (!full.length) return;
    const mods = { augDealtMul: pct(p.dealt), dmgTakenMul: cut(p.taken) };
    for (const u of playerOps(battle, pid)) if (full.some((b) => isMember(battle, u, b))) passiveBuff(battle, u, KEY(id), mods);
  },

  // J2 层层加码: every active bond past `from` layers — (1 + pct)^⌊(L − from) / per⌋ on its members; one operator in several
  // takes the product, at most max (one bond alone stays under it: 999 layers ⇒ 6 steps)
  aug_layer_raise(battle, ps, id, p) {
    const pid = ps.playerId;
    const from = num(p.from, 300), per = Math.max(1, num(p.per, 100)), step = 1 + pct(p.pct), top = pct(p.max) || Infinity;
    const ops = playerOps(battle, pid);
    const apply = () => {
      const muls = [];
      for (const b of activeBondIds(battle, pid)) {
        const k = Math.floor((bondLayers(battle, pid, b) - from) / per);
        if (k > 0) muls.push([b, Math.pow(step, k)]);
      }
      for (const u of ops) {
        let m = 1;
        for (const [b, x] of muls) if (isMember(battle, u, b)) m *= x;
        m = Math.min(top, m);
        if (m > 1) passiveBuff(battle, u, KEY(id), { augDealtMul: m }, { visible: true });
        else if (u.findBuff(KEY(id))) battle.removeBuff(u, KEY(id));
      }
    };
    // at the battle start: every install done (主次相承 / 今日特供's layer bonus included)
    battle.on('battleStart', apply);
    afterGains(battle, pid, apply);
  },

  // J3 主次相承: the other active add-on bonds count `layer` more per `per` layers of the top active bond (its real layers:
  // the bonus function never reads bondLayers, which calls it), at most max
  aug_main_lead(battle, ps, id, p) {
    const pid = ps.playerId;
    const per = Math.max(1, num(p.per, 100)), step = Math.max(0, num(p.layer, 15)), most = Math.max(0, num(p.max, 90));
    const raw = (b) => Math.max(0, num(bondState(battle, pid, b)?.layers, 0));
    const st = { top: null, bonus: 0 };
    const read = () => {
      let top = null, best = -1;
      for (const b of activeBondIds(battle, pid)) { const l = raw(b); if (l > best) { best = l; top = b; } }
      st.top = top;
      st.bonus = top ? Math.min(most, step * Math.floor(best / per)) : 0;
    };
    const others = () => activeBondIds(battle, pid).filter((b) => b !== st.top && !isCoreBond(b));
    read();
    addLayerBonus(battle, (who, b, layers) => (who === pid && st.bonus > 0 && b !== st.top && !isCoreBond(b) && bondActive(battle, pid, b) ? layers + st.bonus : layers));
    if (st.bonus > 0) refreshLayers(battle, pid, others());
    // the top bond gains in battle: another `per` (or another bond on top) changes the bonus — the add-on bonds re-read
    let pending = false;
    battle.on('layerGain', (c) => {
      if (c.playerId !== pid || !(c.n > 0) || pending) return;
      pending = true;
      battle.after(0, () => {
        pending = false;
        const [top, bonus, before] = [st.top, st.bonus, others()];
        read();
        if (st.top !== top || st.bonus !== bonus) refreshLayers(battle, pid, [...new Set([...before, ...others()])]);
      });
    }, { priority: -300 });
  },

  // J4 专精深耕 (battle): an in-battle gain of the noted bond +pct % (floored, at least 1) — after the other gain handlers
  // (魔王, 乘胜追击, 小盟约专精: priority ≥ −100)
  aug_deep_focus(battle, ps, id, p) {
    const pid = ps.playerId;
    const bond = dataOf(ps, id)?.bond;
    if (typeof bond !== 'string' || !bond) return;
    battle.on('layerGain', (c) => {
      if (c.playerId !== pid || c.bondId !== bond || !(c.n > 0)) return;
      c.n += Math.max(1, Math.floor((c.n * num(p.pct)) / 100 + 1e-9));
    }, { priority: -150 });
  },

  // J6 双核驱动: exactly two active core bonds (3 members or more each)
  aug_twin_core(battle, ps, id, p) {
    const pid = ps.playerId;
    const core = activeBondIds(battle, pid).filter((b) => isCoreBond(b));
    if (core.length !== 2) return;
    for (const u of playerOps(battle, pid)) {
      const n = core.filter((b) => isMember(battle, u, b)).length;
      if (n) passiveBuff(battle, u, KEY(id), { augDealtMul: pct(n >= 2 ? p.both : p.one) });
    }
  },

  // J7 层数换算: the Final Assault / Hidden Core (no layer gains there): the active bonds' layers summed once at the start
  aug_layer_power(battle, ps, id, p) {
    if (battle.kind !== 'boss' && battle.kind !== 'hidden') return;
    const pid = ps.playerId;
    battle.on('battleStart', () => {
      let sum = 0;
      for (const b of activeBondIds(battle, pid)) sum += bondLayers(battle, pid, b);
      const k = Math.floor(sum / Math.max(1, num(p.per, 100)));
      const mul = Math.min(pct(p.max) || Infinity, Math.pow(1 + pct(p.pct), k));
      if (mul > 1) for (const u of playerOps(battle, pid)) passiveBuff(battle, u, KEY(id), { augDealtMul: mul }, { visible: true });
    });
  },

  // K1 以战养战: an operator's own 特质 gain — one a moment, whatever bonds it reaches
  aug_war_feeds(battle, ps, id, p) {
    const pid = ps.playerId;
    const step = 1 + pct(p.pct), top = pct(p.max) || Infinity;
    const st = new Map(); // operator → { n: stacks, t: the last one's time }
    battle.on('layerGain', (c) => {
      const u = c.source;
      if (c.playerId !== pid || c.reason !== 'garrison' || !(c.n > 0) || !isOp(u) || u.ownerId !== pid) return;
      let s = st.get(u);
      if (!s) st.set(u, (s = { n: 0, t: -1 }));
      if (s.t === battle.time || Math.pow(step, s.n) >= top - 1e-12) return;
      s.t = battle.time;
      s.n++;
      passiveBuff(battle, u, KEY(id), { augDealtMul: Math.min(top, Math.pow(step, s.n)) }, { visible: true, data: { n: s.n } });
    }, { priority: -200 });
  },

  // K3 先苦后甜: by the battle's round (联防, the Final Assault and the Hidden Core too)
  aug_late_bloom(battle, ps, id, p) {
    const late = num(battle.round) > num(p.round, 8);
    const mods = { augDealtMul: pct(late ? p.late : p.early) };
    for (const u of playerOps(battle, ps.playerId)) passiveBuff(battle, u, KEY(id), mods, { visible: late });
  },

  // K4 练功房: every normal battle
  aug_dojo(battle, ps, id, p) { dummyOn(battle, ps, id, Math.max(0.01, pct(p.hp))); },

  // O20 木桩大师: rounds 1…maxRound, a smaller dummy; none beside 练功房's
  aug_dummy_master(battle, ps, id, p) {
    if (num(battle.round) > num(p.maxRound, 8) || holds(ps, 'aug_dojo')) return;
    dummyOn(battle, ps, id, Math.max(0.01, pct(p.hp)));
  },

  // L1 金光闪闪: the elites on the board (≤ max) — every elite operator
  aug_golden_glow(battle, ps, id, p) {
    const elites = playerOps(battle, ps.playerId).filter((u) => isElite(u));
    const n = Math.min(Math.max(0, Math.round(num(p.max, 8))), elites.length);
    if (!n) return;
    const mods = { augDealtMul: Math.pow(1 + pct(p.pct), n) };
    for (const u of elites) passiveBuff(battle, u, KEY(id), mods);
  },

  // L3 终端火力
  aug_top_tier(battle, ps, id, p) {
    for (const u of playerOps(battle, ps.playerId)) {
      const t = tierOf(u);
      if (t >= 6) passiveBuff(battle, u, KEY(id), { augDealtMul: pct(p.dealt), dmgTakenMul: cut(p.taken) });
      else if (t <= num(p.lowTier, 3)) passiveBuff(battle, u, KEY(id), { augDealtMul: pct(p.low) });
    }
  },

  // L4 草根逆袭: no operator of tier ≥ minTier on the board
  aug_grassroots(battle, ps, id, p) {
    const ops = playerOps(battle, ps.playerId);
    if (!ops.length || ops.some((u) => tierOf(u) >= num(p.minTier, 5))) return;
    const mods = { augDealtMul: pct(p.dealt), dmgTakenMul: cut(p.taken) };
    for (const u of ops) passiveBuff(battle, u, KEY(id), mods);
  },

  // O14 今日特供: the round's bond (the prep's draw: EffectRef data { round, bond }) counts pct % of its layers
  aug_daily_special(battle, ps, id, p) {
    const d = dataOf(ps, id);
    const bond = d && d.round === battle.round && typeof d.bond === 'string' ? d.bond : null;
    if (!bond) return;
    const pid = ps.playerId, mul = pct(p.pct);
    addLayerBonus(battle, (who, b, layers) => (who === pid && b === bond ? Math.floor(layers * mul + 1e-9) : layers));
    refreshLayers(battle, pid, [bond]);
  },
};

/**
 * Battle side: install augment `id` (definition `def`) of player `ps` (the battle's player input) on `battle`.
 * @returns {boolean} whether this batch handles the id
 */
export function install(battle, ps, id, def) {
  const fn = BATTLE[id];
  if (!fn) return false;
  fn(battle, ps, id, def.params || {});
  return true;
}

// =====================================================================================================================
// prep side

/** Per-round counter key of a player (reset lazily when the round changes). */
function roundKey(ctx, key) {
  if (ctx.counter(`${key}:r`) !== ctx.round) { ctx.setCounter(`${key}:r`, ctx.round); ctx.setCounter(key, 0); }
  return key;
}
const bondName = (ctx, b) => dn(ctx.gd.bond(b)?.name || b);

/** 专精深耕: the bond with the most members — a core one when any core bond has members (ties: more layers, data order). */
function focusBond(ctx) {
  const list = Object.entries(ctx.bonds()).filter(([b, st]) => st && (st.count ?? 0) > 0 && !NO_STACK.has(b));
  if (!list.length) return null;
  const core = list.filter(([b]) => ctx.gd.bond(b)?.isCore);
  const from = core.length ? core : list;
  let best = from[0];
  for (const x of from) if ((x[1].count ?? 0) > (best[1].count ?? 0) || ((x[1].count ?? 0) === (best[1].count ?? 0) && (x[1].layers ?? 0) > (best[1].layers ?? 0))) best = x;
  return best[0];
}

/** The phases whose funds a player can still spend this prep (盟约里程碑 pays at once there; elsewhere next round). */
const SPEND_PHASES = new Set([PHASE.ROUND_START, PHASE.AUGMENT, PHASE.SP_DRAFT, PHASE.PREP]);

/** Prep side: augment id → (params) => handler object (onRoundStart, onBuy, onSpend, onPrepEnd, …). */
export const META = Object.freeze({
  // J4 专精深耕: the pick notes the bond (EffectRef data.bond — the battle reads it); a prep gain of it +pct % (≥ 1). The
  // battle's own gains were raised in battle (settle: reason 'battle'); its own extra is not raised again.
  aug_deep_focus: (p) => {
    const key = KEY('aug_deep_focus');
    const note = (ctx) => {
      const ref = ctx.effect(key);
      if (!ref || (ref.data && ref.data.bond)) return;
      const bond = focusBond(ctx);
      if (!bond) return;
      ref.data = { bond };
      ctx.toast(msg('专精深耕：记下了 {bond}', { bond: bondName(ctx, bond) }));
    };
    return {
      onAugmentPick: note,
      // (an empty board at the pick: the first bond with members later)
      onRoundStart: note,
      onPrepEnd: note,
      onLayers(ctx, ev) {
        const bond = ctx.effect(key)?.data?.bond;
        if (!ev || !bond || ev.bondId !== bond || ev.reason === 'battle' || ev.reason === key) return;
        const n = num(ev.to) - num(ev.from);
        if (n > 0) ctx.addLayers(bond, Math.max(1, Math.floor((n * num(p.pct)) / 100 + 1e-9)), { reason: key });
      },
    };
  },

  // J5 盟约里程碑: every `per` multiple a bond's layers reach after the pick (the pick notes the ones already passed) pays
  // `funds`, at most max times a bond — at once while the player can spend them, else next round (the prep end, the
  // settlement); a sweep at the round start / prep end / battle result catches what no onLayers announced
  aug_milestone: (p) => {
    const per = Math.max(1, Math.trunc(num(p.per, 100))), funds = Math.max(0, Math.trunc(num(p.funds, 2))), max = Math.max(0, Math.trunc(num(p.max, 5)));
    const seen = (b) => `aug:milestone:seen:${b}`;
    const paid = (b) => `aug:milestone:paid:${b}`;
    const check = (ctx, b, later) => {
      const lvl = Math.floor(Math.max(0, num(ctx.layers(b))) / per);
      const was = ctx.counter(seen(b));
      if (lvl <= was) return;
      ctx.setCounter(seen(b), lvl);
      const n = Math.min(lvl - was, max - ctx.counter(paid(b)));
      if (!(n > 0) || !(funds > 0)) return;
      ctx.incCounter(paid(b), n);
      if (later) ctx.addPendingFunds(n * funds);
      else ctx.addFunds(n * funds, KEY('aug_milestone'));
      ctx.toast(msg('盟约里程碑：{bond} 达到 {layers} 层，+{funds} 资金', { bond: bondName(ctx, b), layers: lvl * per, funds: n * funds }));
    };
    const sweep = (ctx, later) => { for (const b of Object.keys(ctx.bonds())) check(ctx, b, later); };
    return {
      onAugmentPick(ctx) { for (const b of Object.keys(ctx.bonds())) ctx.setCounter(seen(b), Math.floor(Math.max(0, num(ctx.layers(b))) / per)); },
      onRoundStart: (ctx) => sweep(ctx, false),
      onPrepEnd: (ctx) => sweep(ctx, true),
      onBattleResult: (ctx) => sweep(ctx, true),
      onLayers(ctx, ev) { if (ev && ev.bondId) check(ctx, ev.bondId, ev.hook === 'onPrepEnd' || !SPEND_PHASES.has(ctx.phase)); },
    };
  },

  // K5 精锐传承: a chess merge — the elite's active bonds +layer each (a merge that reaches one counts, ≤ max a round)
  aug_elite_legacy: (p) => ({
    onMerge(ctx, ev) {
      if (!ev || ev.kind !== 'chess' || !ev.piece) return;
      const k = roundKey(ctx, 'aug:eliteLegacy');
      if (ctx.counter(k) >= num(p.max, 3)) return;
      const bonds = ctx.pieceBonds(ev.piece.uid).filter((b) => !NO_STACK.has(b) && ctx.bondActive(b));
      if (!bonds.length) return;
      ctx.incCounter(k, 1);
      for (const b of bonds) ctx.addLayers(b, num(p.layer, 3), { requireActive: true, reason: KEY('aug_elite_legacy') });
    },
  }),

  // L2 双倍奖励: a chess merge queues one more promotion reward (the same roll: 3 of the next tier, 4 with 晋升加速), at most
  // `round` a round and max a match
  aug_double_reward: (p) => ({
    onMerge(ctx, ev) {
      if (!ev || ev.kind !== 'chess') return;
      const k = roundKey(ctx, 'aug:doubleReward');
      if (ctx.counter(k) >= num(p.round, 1) || ctx.counter('aug:doubleReward:n') >= num(p.max, 4)) return;
      if (!ctx.offerChess(null, { source: 'merge' })) return;
      ctx.incCounter(k, 1);
      ctx.incCounter('aug:doubleReward:n', 1);
      ctx.toast(msg('双倍奖励：额外获得一次晋升奖励'));
    },
  }),

  // O14 今日特供: every round start (and the pick's round) draws an active bond whose layers a battle reads — one with
  // layers when any has — for the battles of the round (EffectRef data { round, bond }) and announces it
  aug_daily_special: () => {
    const draw = (ctx) => {
      const ref = ctx.effect(KEY('aug_daily_special'));
      if (!ref) return;
      const list = Object.entries(ctx.bonds()).filter(([b, st]) => st && st.active && !NO_STACK.has(b) && !PREP_ONLY.has(b));
      const stacked = list.filter(([, st]) => (st.layers ?? 0) > 0);
      const from = (stacked.length ? stacked : list).map(([b]) => b);
      if (!from.length) { ref.data = null; return; }
      const bond = from[Math.floor(ctx.rng() * from.length)];
      ref.data = { round: ctx.round, bond };
      ctx.ticker(msg('{name} 的今日特供：{bond}', { name: ctx.name, bond: bondName(ctx, bond) }));
    };
    return { onAugmentPick: draw, onRoundStart: draw };
  },
});
