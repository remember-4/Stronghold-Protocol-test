// server/match/match/enemyVotes.js — A6000 fork: Match methods of the 敌人强化 (the enemies' upgrades), second version: by
// tier (definitions: shared/enemyBuffs.js; the battle side: server/sim/content/enemyBuffs.js; the AUGMENT phase that runs
// the vote: match/augments.js). Installed on Match.prototype by server/match/Match.js (a method container: never
// instantiated; `this` is the match).
//
// The room's settings (opts.enemyBuffs, server/lobby.js — the host's when the room is created: enemyBuffSettings fills the
// defaults): `on` (the votes at all), `weights` [白银, 黄金, 彩色] of the tier roll, `firstNoPrism` (第 4 回合不出彩色).
//   the vote       enemyVoteRound (a vote round with the votes on) → rollEnemyVote: the tier (rngAug, one draw), then
//                  three options of it (rollVoteOptions: different `group`s first, the ones not chosen yet first; the
//                  vote before the Final Assault — round 13 — from the 首领 pool; enemyBuffAvailable vetoes the co-op ones
//                  with fewer than two players alive and a 特训加强 whose type has no round left); botVote, voteEnemyBuff,
//                  finishEnemyVote (逆反: the next vote's fewest votes win; 海克斯第六版 篡位 / 唱反调: the hooks of
//                  server/match/augments5/g11.js); enemyVoteView (m.public.aug.vote)
//   per battle     enemyBuffFlags (battleFlags: every battle carries the chosen ids and the round's state `ebRound`);
//                  enemyBuffSpawns / enemyBuffBossSpawns — the SpawnSpecs the upgrades add as a battle is built (combat.js
//                  _normalOpts after the onBattleStart handlers, bossRounds.js per boss field): 增援 / 狂潮 (a share more of
//                  every scheduled action), 精英双生 (each elite action twice), 窃贼 (normal fields; uncounted, tag
//                  'eb_thief'), 山芋 (the holder's normal field; uncounted, tag 'eb_potato'), 首领·亲卫 / 首领·护卫 (elite
//                  escorts per boss field) — in the spec, so a client's result is checked against them like any spawn;
//                  enemyBuffPreviewSpawns: the same list for the prep preview (views.js nextEnemiesFor). Their draws come
//                  from deriveSeed(match seed, round, field): the preview and the battle agree, no other stream moves.
//   per round      enemyBuffsRoundStart (Match.startRound, after the players' round start): 窃贼's thefts of the last
//                  round, the round's 点名 / 山芋 / 通缉令 / 适应 (an upgrade won later in the round draws at once:
//                  finishEnemyVote), 限流 after the round start's payouts; the combat start (_ebCombatStart, the first
//                  battle built in the round): 盲盒 / 血月 draw and reveal the round's upgrades, 替身 announces itself
//   LP / funds     enemyLpCapDelta (决堤), enemyBuffSettle (精英突破, 窃贼, 山芋 — after the player's LP charge, within its
//                  round cap), enemyRefreshTax (通胀), enemyBossPoolMul (首领·坚韧), enemyOvertimeLead (首领·倒计时)
//   third version  enemyTimeLimit (时限压缩: the normal fields' limit and the phase's deadline), enemyLayerTax (叠层税: the
//                  prep's 特质 gains, PlayerState.addLayers), enemyBossRevive (首领·复苏: the shared pool's onHit, once a
//                  pool), 首领·召唤's escorts (extraSpawns, kind 'boss': every sec s up to SUMMON_HORIZON); 霉运 is
//                  shared/luck.js (the callers pass m.enemyBuffs)
// 节目效果 (show) announce themselves with a ticker line. Nothing here draws a random number or changes a battle while no
// upgrade has been chosen.

import { PHASE, ERR } from '../../../shared/constants.js';
import {
  enemyBuffDef, enemyBuffCounts, enemyBuffSettings, rollVoteOptions, rollVoteTier,
  tallyVote, tempBuffPool, layerTaxKeep,
} from '../../../shared/enemyBuffs.js';
import { msg, dn } from '../../../shared/i18n.js';
import { createRng, deriveSeed } from '../../sim/rng.js';
import { throttleCheck, throttleToast } from '../../sim/content/enemyBuffs.js';
import { pairPlayers } from '../finalAssault.js';
// 海克斯第六版 batch g11: 篡位 (the captain decides the vote) and 唱反调 (a lost vote pays) — its two vote hooks
import { MATCH as AUG6_G11 } from '../augments5/g11.js';
import { OK, fail } from './common.js';

/** Bot dislike of an enemy upgrade (lower = voted for); 甲胄 / 闪避 / 法抗 move with the board's damage type. */
const BOT_HARM = Object.freeze({
  // 白银
  eb_vigor: 6, eb_swift: 5, eb_res: 5, eb_evasion: 5, eb_armor: 5, eb_trueres: 2, eb_fury: 5, eb_enrage: 4, eb_revenge: 4,
  eb_regen: 3, eb_backup: 4, eb_range: 4, eb_dash: 4, eb_blink: 4, eb_purify: 2, eb_elitebreak: 4, eb_thief: 3, eb_standin: 4,
  eb_reverse: 2, eb_t_fly: 4, eb_t_times: 4, eb_t_element: 3, eb_t_dot: 3, eb_t_invis: 4, eb_t_refl: 3, eb_inflation: 1,
  eb_logistics: 3, eb_redeploy: 3, eb_jam: 4, eb_noheal: 4, eb_artsward: 5, eb_vanrush: 4, eb_stealth: 3, eb_antisummon: 3,
  eb_jinx: 2, eb_layertax: 3,
  // 黄金
  eb_bulwark: 7, eb_elite: 6, eb_reinforce: 7, eb_shield: 6, eb_adapt: 5, eb_blunt: 4, eb_charge: 5, eb_steadfast: 4,
  eb_diminish: 3, eb_sunder: 5, eb_medic: 5, eb_flood: 4, eb_mark: 4, eb_potato: 4, eb_wanted: 5, eb_blindbox: 5, eb_tariff: 1,
  eb_spdrain: 5, eb_learn: 5, eb_promote: 6, eb_link: 5, eb_bondsap: 5, eb_rush: 5, eb_assassin: 5, eb_bomber: 5,
  // 彩色
  eb_surge: 8, eb_steel: 8, eb_split: 7, eb_command: 6, eb_twins: 7, eb_undying: 7, eb_frenzy: 7, eb_calamity: 6, eb_bloodmoon: 6,
  eb_throttle: 1, eb_evolve: 7, eb_legion: 7, eb_rift: 6,
  // 首领专场
  eb_b_rage: 5, eb_b_awe: 4, eb_b_guard: 4, eb_b_wall: 6, eb_b_clock: 5, eb_b_escort: 6, eb_b_tough: 8, eb_b_fury: 7,
  eb_b_physward: 4, eb_b_artsward: 4, eb_b_dread: 5, eb_b_summon: 6, eb_b_barrier: 6, eb_b_cap: 4, eb_b_resonance: 5, eb_b_revive: 7,
  // the friend's 14 (shared/enemyBuffs.js eb_n_*, 2026-10-14): by their numbers against the table's
  eb_n_health: 3, eb_n_power: 3, eb_n_speed: 4, eb_n_defense: 4, eb_n_arts: 5, eb_n_phys: 5, eb_n_regen: 5, eb_n_shatter: 3,
  eb_n_element: 3, eb_n_slow: 7, eb_n_wall: 8, eb_n_hunter: 3, eb_n_b_guard: 4, eb_n_b_doom: 7,
});
const PHYS_HARM = new Set(['eb_armor', 'eb_evasion', 'eb_b_physward', 'eb_n_defense', 'eb_n_phys']);
const ARTS_HARM = new Set(['eb_res', 'eb_artsward', 'eb_b_artsward', 'eb_n_arts']);
/** 首领·召唤: the escorts a boss field's spec carries — every sec s, this many times (600 game s at 30 s; the drain of the
 * overtime starts at 300). */
export const SUMMON_HORIZON = 20;

const pct = (v) => (Number(v) || 0) / 100;
const P = (id) => enemyBuffDef(id).params;
const cnt = (s) => Math.max(1, Math.min(50, Math.trunc(Number(s.count) || 1)));
const time0 = (s) => Math.max(0, Number(s.time) || 0);

/**
 * The SpawnSpecs the upgrades add to a battle built on `wave` (the round's shared composition: the per-player bounty
 * units and the onBattleStart edits never count). kind 'normal' | 'boss'; `potato`: { mul } on the holder's field.
 * The scheduled actions (`base`): no leader, part, bounty or uncounted entry.
 */
export function extraSpawns(gd, wave, { kind, counts, rng, potato = null }) {
  const k = (id) => counts.get(id) ?? 0;
  const rank = (s) => String(gd.enemy(s.enemyKey)?.rank ?? 'NORMAL').toUpperCase();
  const base = (Array.isArray(wave && wave.spawns) ? wave.spawns : []).filter((s) => s && typeof s.enemyKey === 'string' && gd.enemy(s.enemyKey)
    && s.tag !== 'boss' && s.tag !== 'part' && s.tag !== 'bounty' && s.countInTotal !== false && Number.isFinite(Number(s.time)) && rank(s) !== 'BOSS');
  const copy = (s, o) => ({ ...s, mods: s.mods ? { ...s.mods } : undefined, preview: s.preview ? { ...s.preview } : s.preview, ...o });
  const out = [];
  // 增援 / 狂潮: n·share more of every action (the fraction by the rng), between its own units
  const more = pct(P('eb_reinforce').pct) * k('eb_reinforce') + pct(P('eb_surge').pct) * k('eb_surge');
  if (more > 0) {
    for (const s of base) {
      const n = cnt(s), want = n * more;
      const whole = Math.floor(want + 1e-9);
      const add = whole + (rng() < want - whole ? 1 : 0);
      if (add <= 0) continue;
      const span = n > 1 ? (n - 1) * Math.max(0, Number(s.interval) || 0) : 0;
      out.push(copy(s, span > 0
        ? { count: add, time: time0(s) + span / (2 * add), interval: add > 1 ? span / add : 0 }
        : { count: add, time: time0(s) + 1, interval: add > 1 ? 1 : 0 }));
    }
  }
  // 精英双生: every elite action once more per stack, a moment later
  for (const s of base) if (rank(s) === 'ELITE') for (let i = 1; i <= k('eb_twins'); i++) out.push(copy(s, { time: time0(s) + 0.6 * i }));
  if (kind === 'normal') {
    const normals = base.filter((s) => rank(s) === 'NORMAL');
    const pool = normals.length ? normals : base;
    // 窃贼: uncounted (its leak costs no LP: settle charges funds instead), half HP, +move %
    for (let i = 0; i < k('eb_thief') && pool.length; i++) {
      const s = pool[Math.floor(rng() * pool.length)];
      const m = s.mods || {};
      out.push(copy(s, {
        count: 1, interval: 0, time: time0(s) + 1 + i, tag: 'eb_thief', countInTotal: false,
        mods: { ...m, hpMul: (Number(m.hpMul) || 1) * (1 - pct(P('eb_thief').hp)), speedMul: (Number(m.speedMul) || 1) * (1 + pct(P('eb_thief').move)), eb: 'thief' },
      }));
    }
    // 山芋: uncounted (settle charges its own LP), the holder's field only
    if (potato && pool.length) {
      const s = pool[Math.floor(rng() * pool.length)];
      const m = s.mods || {};
      out.push(copy(s, {
        count: 1, interval: 0, time: time0(s) + 0.5, tag: 'eb_potato', countInTotal: false,
        mods: { ...m, hpMul: (Number(m.hpMul) || 1) * Math.max(1, Number(potato.mul) || 1), eb: 'potato' },
      }));
    }
  } else if (kind === 'boss') {
    // 首领·亲卫 / 首领·护卫: elite escorts (the field's elite actions in turn; any action when it has none)
    const n = Math.trunc(Number(P('eb_b_guard').n) || 0) * k('eb_b_guard') + Math.trunc(Number(P('eb_b_escort').n) || 0) * k('eb_b_escort');
    const elites = base.filter((s) => rank(s) === 'ELITE');
    const pool = elites.length ? elites : base;
    for (let i = 0; i < n && pool.length; i++) {
      const s = pool[i % pool.length];
      out.push(copy(s, { count: 1, interval: 0, time: time0(s) + 2 + 3 * i }));
    }
    // 首领·召唤 (third version): n elite escorts every sec s of the field (the field's elite actions in turn), queued in the
    // spec up to SUMMON_HORIZON times — the fight ends with its leader
    const sum = k('eb_b_summon');
    if (sum && pool.length) {
      const sp = P('eb_b_summon'), per = Math.max(1, Math.trunc(Number(sp.n) || 0) * sum), every = Math.max(5, Number(sp.sec) || 30);
      let j = 0;
      for (let w = 1; w <= SUMMON_HORIZON; w++) {
        for (let i = 0; i < per; i++, j++) {
          const s = pool[j % pool.length];
          out.push(copy(s, { count: 1, interval: 0, time: every * w + 0.5 * i, tag: 'eb_summon' }));
        }
      }
    }
  }
  return out;
}

/** The match's view of a player for 限流 (server/sim/content/enemyBuffs.js throttleCheck). */
function throttleOfPlayer(m, ps) {
  return {
    round: m.round,
    gained: () => Number(ps.stats.fundsGained) || 0,
    counter: (key) => (Number.isFinite(ps.counters[key]) ? ps.counters[key] : 0),
    setCounter: (key, v) => { ps.counters[key] = v; },
    take: (n) => -ps.addFunds(-n, { reason: 'enemyBuff:eb_throttle' }),
    toast: (n, cap) => m.toast(ps, 'info', throttleToast(n, cap)),
  };
}

export class MatchEnemyVotes {
  /** The 敌人强化 state of the match (created on first use): the room's settings, 逆反, the round's draws, 山芋, debts. */
  _ebState() {
    if (!this._eb) {
      this._eb = {
        settings: enemyBuffSettings(this.opts && this.opts.enemyBuffs),
        /** 逆反 won and not spent yet (each turns the next vote) */
        reverse: 0,
        /** the current round's draws: see _ebRound */
        round: null,
        /** 山芋 between rounds: null (a new one next round) | { from: the player that let it through, mul } */
        potato: null,
        /** 窃贼: playerId → funds taken at the next round start */
        debt: new Map(),
      };
    }
    return this._eb;
  }

  /** This round's draws (a fresh record when the round changed). */
  _ebRound() {
    const st = this._ebState();
    if (!st.round || st.round.r !== this.round) {
      st.round = { r: this.round, extra: null, marked: null, potato: null, wanted: null, adapt: null, prev: null };
    }
    return st.round;
  }

  /** Times each upgrade was chosen (vote order list → counts). */
  _ebChosen() { return enemyBuffCounts(this.enemyBuffs); }

  /** The upgrades in effect now: the chosen ones plus this round's 盲盒 / 血月 draws once they were made. */
  _ebCountsNow() {
    const R = this._eb && this._eb.round && this._eb.round.r === this.round ? this._eb.round : null;
    return enemyBuffCounts(R && R.extra ? [...(this.enemyBuffs || []), ...R.extra] : this.enemyBuffs);
  }

  _ebCount(id) { return this._ebChosen().get(id) ?? 0; }

  /** Whether `round` has an enemy upgrade vote: a vote round, and the room did not switch the votes off. */
  enemyVoteRound(round = this.round) {
    const s = this._ebState().settings;
    return s.on && s.enemyRounds.includes(round);
  }

  /**
   * Whether `def` may be offered: a co-op one (点名 / 烫手山芋 / 逆反) only with two players alive or more in a co-op match,
   * a 特训加强 only while its type still has a normal round left from this one on.
   */
  enemyBuffAvailable(def) {
    if (!def) return false;
    if (def.coop && (this.isSolo || this.alivePlayers().length < 2)) return false;
    if (def.faction) return this.factionRoundsLeft(def.faction) > 0;
    return true;
  }

  /** The normal rounds from this one up to the Final Assault whose special type (the schedule's typeSlots) is `type`. */
  factionRoundsLeft(type) {
    const f = this.factions;
    const slots = f && f.schedule && Array.isArray(f.schedule.typeSlots) ? f.schedule.typeSlots : null;
    if (!Array.isArray(f) || !f.includes(type) || !slots) return 0;
    let n = 0;
    for (let r = Math.max(1, this.round); r < this.gd.bossRound; r++) if (slots[r - 1] === type) n++;
    return n;
  }

  /** The vote of this round: { options, votes, tier, boss, reverse } (the AUGMENT phase's `aug.vote`). */
  rollEnemyVote(forcedRarity = null) {
    const st = this._ebState();
    const boss = this.round >= this.gd.bossRound - 1;
    const tier = forcedRarity ?? rollVoteTier(st.settings.weights, this.rngAug, { noPrism: st.settings.firstNoPrism && this.round === st.settings.enemyRounds[0] });
    const options = rollVoteOptions(this.enemyBuffs, this.rngAug, { tier, boss, strict: true, allowed: (d) => this.enemyBuffAvailable(d) });
    return { options, votes: {}, tier, boss, reverse: st.reverse > 0 };
  }

  /** m.public.aug.vote */
  enemyVoteView(vote) {
    return { options: vote.options.slice(), votes: { ...vote.votes }, tier: vote.tier ?? null, boss: !!vote.boss, reverse: !!vote.reverse };
  }

  /**
   * The phase ends: the winner joins `enemyBuffs` (every battle from now on). 海克斯·话事人: voteWeights / votePrefer; 逆反:
   * the fewest votes win. An upgrade with draws of its own this round (点名 / 山芋 / 通缉令 / 适应) draws at once.
   */
  finishEnemyVote(vote) {
    const st = this._ebState();
    const reverse = !!vote.reverse;
    // 海克斯第六版·篡位 (server/match/augments5/g11.js voteCaptain): the captain's vote alone is counted when it voted (逆反
    // still turns it: the fewest votes win); without a captain the tally is as before
    const captain = AUG6_G11.voteCaptain(this, vote);
    const win = captain
      ? tallyVote(vote.options, { [captain]: vote.votes[captain] }, this.rngAug, { prefer: captain, reverse })
      : tallyVote(vote.options, vote.votes, this.rngAug, { weights: this.voteWeights(), prefer: this.votePrefer(vote), reverse });
    if (reverse) st.reverse = Math.max(0, st.reverse - 1);
    if (!enemyBuffDef(win)) return; // a vote without options (no pool left) changes nothing
    this.enemyBuffs.push(win);
    vote.winner = win;
    for(const ps of this.alivePlayers())if(ps.augments.includes('aug_speaker')&&vote.votes[ps.playerId]===win)ps.addFunds(1,{reason:'augment:aug_speaker'});
    const def = enemyBuffDef(win);
    if (captain) this.tickerText(msg('队长 {name} 一人决定了这次投票', { name: this.players.get(captain)?.name ?? '' }), 1);
    if (def) this.tickerText(msg('敌人获得强化：{name}', { name: dn(def.name) }), 1);
    if (def && reverse) this.tickerText(msg('逆反：票数最少的「{name}」生效', { name: dn(def.name) }), 1);
    if (win === 'eb_reverse') {
      st.reverse++;
      this.tickerText(msg('逆反：下次投票反着来，票数最少的选项获胜'), 1);
    }
    // 海克斯第六版·唱反调: a holder whose vote lost is paid
    AUG6_G11.voteSettled(this, vote, win);
    this._ebPrepareRound([win]);
  }

  botVote(ps, options) {
    // the board's damage: mostly physical makes 甲胄 / 闪避 hurt more, mostly arts 法抗; under 逆反 the bots vote for what
    // they fear most (the fewest votes win)
    const reverse = !!(this.aug && this.aug.vote && this.aug.vote.reverse);
    let phys = 0, arts = 0;
    for (const p of ps.board.values()) {
      if (!p || p.kind !== 'chess') continue;
      const t = (ps.gd || this.gd).chess(p.id)?.dmgType;
      if (t === 'arts') arts++; else if (t === 'phys') phys++;
    }
    const harm = (id) => {
      let h = BOT_HARM[id] ?? 5;
      if (PHYS_HARM.has(id)) h += phys > arts ? 2 : -2;
      if (ARTS_HARM.has(id)) h += arts > phys ? 2 : -2;
      return reverse ? -h : h;
    };
    let best = options[0], low = Infinity;
    for (const id of options) { const h = harm(id); if (h < low) { best = id; low = h; } }
    return best;
  }

  /** g.enemyVote { id } — may be changed until the phase ends. */
  voteEnemyBuff(ps, id) {
    const a = this.aug;
    if (this.phase !== PHASE.AUGMENT || !a || !a.vote) return fail(ERR.WRONG_PHASE);
    if (!ps.alive) return fail(ERR.ELIMINATED);
    if (!a.vote.options.includes(id)) return fail(ERR.BAD_TARGET);
    this._castVote(ps, id);
    this._augmentMaybeDone();
    return OK;
  }

  _castVote(ps, id) {
    this.aug.vote.votes[ps.playerId] = id;
    this.markPublic();
  }

  // -------------------------------------------------------------------------------------------------------------------
  // per battle

  /**
   * The battle flags every battle takes (battleFlags): `enemyBuffs` (chosen, vote order) and the round's `ebRound` —
   * { extra (盲盒 / 血月, once drawn at the combat start), marked (点名), wanted (通缉令), adapt (适应), fields (the boss
   * fields of a leader fight, for 护盾's one share) }. Unchanged without an upgrade.
   */
  enemyBuffFlags(flags) {
    if (!this.enemyBuffs || !this.enemyBuffs.length) return flags;
    const out = { ...flags, enemyBuffs: this.enemyBuffs.slice() };
    const R = this._eb && this._eb.round && this._eb.round.r === this.round ? this._eb.round : null;
    const k = this._ebCountsNow();
    const r = {};
    if (R && R.extra && R.extra.length) r.extra = R.extra.slice();
    if (R && R.marked != null && k.get('eb_mark')) r.marked = R.marked;
    if (R && R.wanted && k.get('eb_wanted')) r.wanted = { ...R.wanted };
    if (R && R.adapt && k.get('eb_adapt')) r.adapt = { ...R.adapt };
    if ((this.phase === PHASE.FINAL_ASSAULT || this.phase === PHASE.HIDDEN_CORE) && (k.get('eb_shield') || k.get('eb_b_barrier'))) r.fields = pairPlayers(this.alivePlayers()).length;
    if (Object.keys(r).length) out.ebRound = r;
    return out;
  }

  /** The SpawnSpecs the upgrades add to `ps`'s normal field (combat.js _normalOpts, after the onBattleStart handlers). */
  enemyBuffSpawns(ps, ev) {
    if (!this.enemyBuffs || !this.enemyBuffs.length || !ps || !ev || !Array.isArray(ev.spawns) || !this.wave) return;
    this._ebCombatStart();
    for (const s of this._ebExtraSpawns(this.wave, 'normal', `n:${ps.seat}`, ps)) ev.spawns.push(s);
  }

  /** The same for a boss field (bossRounds.js, the field's shared list after its players' onBattleStart handlers). */
  enemyBuffBossSpawns(spawns, wave, fieldId) {
    if (!this.enemyBuffs || !this.enemyBuffs.length || !Array.isArray(spawns) || !wave) return;
    this._ebCombatStart();
    for (const s of this._ebExtraSpawns(wave, 'boss', fieldId, null)) spawns.push(s);
  }

  /**
   * The prep preview's share (views.js nextEnemiesFor): what enemyBuffSpawns / enemyBuffBossSpawns will add — without the
   * upgrades 盲盒 / 血月 reveal at the combat start. `g`: the player's boss group (bossWaves entry) in a leader fight's prep.
   */
  enemyBuffPreviewSpawns(ps, g = null) {
    if (!this.enemyBuffs || !this.enemyBuffs.length || !ps) return [];
    if (g) {
      // bossGroupOf hands out a copy of the bossWaves entry: the field is the entry with the same wave (field b<i+1>)
      const i = Array.isArray(this.bossWaves) ? this.bossWaves.findIndex((x) => x && x.wave === g.wave) : -1;
      return i < 0 ? [] : this._ebExtraSpawns(g.wave, 'boss', `b${i + 1}`, null);
    }
    return this.wave ? this._ebExtraSpawns(this.wave, 'normal', `n:${ps.seat}`, ps) : [];
  }

  _ebExtraSpawns(wave, kind, salt, ps) {
    const R = this._ebRound();
    const potato = kind === 'normal' && ps && R.potato && R.potato.holder === ps.playerId ? R.potato : null;
    const counts = this._ebCountsNow();
    if (!counts.size) return [];
    return extraSpawns(this.gd, wave, { kind, counts, potato, rng: createRng(deriveSeed(this.seed, `eb:spawn:${this.round}:${salt}`)) });
  }

  // -------------------------------------------------------------------------------------------------------------------
  // per round

  /** Match.startRound, after every player's round start. */
  enemyBuffsRoundStart() {
    const st = this._eb;
    if ((!this.enemyBuffs || !this.enemyBuffs.length) && !(st && st.debt.size)) return;
    this._ebRound();
    // 窃贼: what the thieves of the last round took (after the round's income: "下回合资金 −{funds}")
    if (st && st.debt.size) {
      for (const [pid, n] of st.debt) {
        const ps = this.players.get(pid);
        if (!ps || !ps.alive || !(n > 0)) continue;
        const took = -ps.addFunds(-n, { reason: 'enemyBuff:eb_thief' });
        if (took > 0) this.toast(ps, 'warn', msg('窃贼偷走了你 {n} 资金', { n: took }));
      }
      st.debt.clear();
    }
    this._ebPrepareRound();
    const cap = this._ebCount('eb_throttle') ? Number(P('eb_throttle').cap) || 8 : 0;
    if (cap) for (const ps of this.alivePlayers()) throttleCheck(throttleOfPlayer(this, ps), cap);
  }

  /**
   * The round's draws of the upgrades in `ids` (default: every chosen one) that have none yet: 点名 (a random player
   * alive), 山芋 (who holds it), 通缉令 / 适应 (from the players' last battle — kept for 血月 too, which may draw them at
   * the combat start, when that battle's results are gone). Each draw from deriveSeed(match seed, its name, round).
   */
  _ebPrepareRound(ids = null) {
    const R = this._ebRound();
    const has = (id) => (ids ? ids.includes(id) : this._ebCount(id) > 0);
    const bossRound = this.round === this.gd.bossRound || this.round === this.gd.hiddenRound;
    const alive = this.alivePlayers();
    if (!alive.length) return;
    if (has('eb_mark') && R.marked == null && !this.isSolo) {
      const rng = createRng(deriveSeed(this.seed, `eb:mark:${this.round}`));
      const ps = alive[Math.floor(rng() * alive.length)];
      R.marked = ps.playerId;
      this.tickerText(msg('点名：敌人盯上了{name}博士', { name: ps.name }), 1);
    }
    if (has('eb_potato') && R.potato == null && !bossRound && !this.isSolo) this._ebPotatoRound(alive);
    const prev = (has('eb_wanted') || has('eb_adapt') || has('eb_bloodmoon')) && !R.prev ? (R.prev = this._ebLastBattle(alive)) : R.prev;
    if (has('eb_wanted') && !R.wanted && prev) this._ebWanted(prev);
    if (has('eb_adapt') && !R.adapt && prev) this._ebAdapt(prev);
  }

  /** 山芋 of this round: passed on from the one who let it through, or a new one with a random player. */
  _ebPotatoRound(alive) {
    const st = this._ebState();
    const R = this._ebRound();
    const p = P('eb_potato');
    let holder = null, mul = Math.max(1, Number(p.hp) || 3);
    if (st.potato && st.potato.from) {
      // the next teammate in seat order (cyclic) after the one who let it through; with nobody else, itself
      const seats = this.order.filter((x) => x.alive);
      const from = this.players.get(st.potato.from);
      const after = from ? seats.filter((x) => x.seat > from.seat) : [];
      holder = after[0] || seats.find((x) => x !== from) || from || seats[0] || null;
      mul = Number(st.potato.mul) || mul;
    } else {
      const rng = createRng(deriveSeed(this.seed, `eb:potato:${this.round}`));
      holder = alive[Math.floor(rng() * alive.length)];
    }
    if (!holder || !holder.alive) holder = alive[0];
    R.potato = { holder: holder.playerId, mul };
    this.tickerText(msg('烫手山芋：山芋传到了{name}博士手里', { name: holder.name }), 1);
  }

  /** Per alive player: its board uids → damage of its last battle's units (BattleResult unitStats), and its damage by type. */
  _ebLastBattle(alive) {
    const out = new Map();
    for (const ps of alive) {
      const r = this.lastResults && this.lastResults.get(ps.playerId);
      if (!r || !Array.isArray(r.unitStats)) continue;
      const board = new Map();
      for (const p of ps.board.values()) if (p && p.kind === 'chess') board.set(p.uid, p);
      const gd = ps.gd || this.gd;
      let top = null, topDmg = 0;
      const byType = { phys: 0, arts: 0, true: 0 };
      for (const u of r.unitStats) {
        if (!u) continue;
        const dmg = Number(u.dmg) || 0;
        if (Number.isInteger(u.uid) && board.has(u.uid) && dmg > topDmg) { top = u.uid; topDmg = dmg; }
        // [ASSUMED] a unit's damage counts as its normal attack's type (the data's dmgType; skills / talents of
        // another type are not told apart — the result has no per-type split)
        const rec = u.kind === 'token' ? gd.token(u.defId) : gd.chess(u.defId);
        const type = rec && rec.dmgType;
        if (type && Object.prototype.hasOwnProperty.call(byType, type)) byType[type] += dmg;
      }
      out.set(ps.playerId, { top, piece: top != null ? board.get(top) : null, byType });
    }
    return out;
  }

  /** 通缉令: each player's operator that dealt the most damage in its last battle (still on its board). */
  _ebWanted(prev) {
    const R = this._ebRound();
    R.wanted = {};
    for (const [pid, x] of prev) {
      if (x.top == null || !x.piece) continue;
      const ps = this.players.get(pid);
      if (!ps || !ps.alive || ![...ps.board.values()].includes(x.piece)) continue;
      R.wanted[pid] = x.top;
      const rec = (ps.gd || this.gd).chess(x.piece.id);
      this.tickerText(msg('通缉令：敌人悬赏了{name}博士的{unit}', { name: ps.name, unit: dn(rec ? rec.name : x.piece.id) }), 1);
    }
  }

  /** 适应: each player's most dealt damage type of its last battle. */
  _ebAdapt(prev) {
    const R = this._ebRound();
    R.adapt = {};
    const TEXT = {
      phys: msg('适应：本回合你战场里的敌人受到的物理伤害降低'),
      arts: msg('适应：本回合你战场里的敌人受到的法术伤害降低'),
      true: msg('适应：本回合你战场里的敌人受到的真实伤害降低'),
    };
    for (const [pid, x] of prev) {
      let best = null, most = 0;
      for (const t of ['phys', 'arts', 'true']) if (x.byType[t] > most) { best = t; most = x.byType[t]; }
      if (!best) continue;
      R.adapt[pid] = best;
      const ps = this.players.get(pid);
      if (ps) this.toast(ps, 'warn', TEXT[best]);
    }
  }

  /**
   * The first battle of the round is being built: 盲盒 (a 白银 upgrade per stack) and 血月 (a 黄金 one) draw this round's
   * upgrades and reveal them; 替身 announces itself. Once per round.
   */
  _ebCombatStart() {
    const R = this._ebRound();
    if (R.extra) return;
    const blind = this._ebCount('eb_blindbox'), moon = this._ebCount('eb_bloodmoon');
    const extra = [];
    if (blind || moon) {
      const rng = createRng(deriveSeed(this.seed, `eb:extra:${this.round}`));
      const draw = (tier, n, text) => {
        const pool = tempBuffPool(tier).filter((id) => this.enemyBuffAvailable(enemyBuffDef(id)));
        for (let i = 0; i < n && pool.length; i++) {
          const id = pool[Math.floor(rng() * pool.length)];
          extra.push(id);
          this.tickerText(text(dn(enemyBuffDef(id).name)), 1);
        }
      };
      draw(1, blind, (name) => msg('盲盒：今天的盲盒是……{name}', { name }));
      draw(2, moon, (name) => msg('血月升起：敌人本回合获得{name}', { name }));
    }
    R.extra = extra;
    // an upgrade 血月 drew that has draws of its own (通缉令 / 适应: from the round start's look at the last battle)
    if (extra.length) this._ebPrepareRound(extra.filter((id) => !this._ebCount(id)));
    if (this._ebCountsNow().get('eb_standin')) this.tickerText(msg('替身出现了：每波有敌人生命成倍并嘲讽干员'), 1);
  }

  // -------------------------------------------------------------------------------------------------------------------
  // LP and funds

  /** settle.js lpCapFor: 决堤 raises the player's per-round LP cap. */
  enemyLpCapDelta(ps) {
    void ps;
    const n = this._ebCountsNow().get('eb_flood') ?? 0;
    return n ? Math.trunc(Number(P('eb_flood').n) || 0) * n : 0;
  }

  /**
   * settle.js, per alive player after its LP charge and onBattleResult (`uniteResult`: the round's 联防 result, if one
   * ran): 窃贼 (each thief that got through takes funds at the next round start), 精英突破 (an elite that got through —
   * a 联防 leaker: one that survived the 联防 — costs lp − 1 more), 山芋 (the holder lets it through: lp, and it passes on
   * stronger; else the passing ends). The extra LP stays within the player's round cap (lpCapFor) and joins the 联防
   * result box's loss.
   */
  enemyBuffSettle(ps, result, uniteResult = null) {
    if (!this.enemyBuffs || !this.enemyBuffs.length || !ps || !result) return;
    const st = this._ebState();
    const counts = this._ebCountsNow();
    const leaked = Array.isArray(result.leaked) ? result.leaked : [];
    const pid = ps.playerId;
    const thieves = leaked.filter((l) => l && l.tag === 'eb_thief').length;
    if (thieves > 0) {
      const n = thieves * Math.max(0, Math.trunc(Number(P('eb_thief').funds) || 0));
      st.debt.set(pid, (st.debt.get(pid) ?? 0) + n);
      this.tickerText(msg('窃贼：{name}博士被偷了 {n} 资金', { name: ps.name, n }), 1);
    }
    let charged = this._ebChargedLoss(ps, result);
    const charge = (n) => {
      const x = Math.max(0, Math.min(Math.trunc(n), this.lpCapFor(ps) - charged));
      if (!(x > 0)) return 0;
      ps.lp -= x;
      ps.stats.lpLost += x;
      charged += x;
      const v = this.uniteResultView;
      if (v && v.losses) v.losses[pid] = (Number(v.losses[pid]) || 0) + x;
      return x;
    };
    const elite = counts.get('eb_elitebreak') ?? 0;
    if (elite) {
      const per = Math.max(0, (Math.trunc(Number(P('eb_elitebreak').lp)) || 2) - 1) * elite;
      const x = charge(this._ebEliteLeaks(ps, leaked, uniteResult) * per);
      if (x > 0) this.toast(ps, 'warn', msg('精英突破：精英敌人漏过，额外扣除 {n} 点目标生命', { n: x }));
    }
    const R = this._ebRound();
    if (R.potato && R.potato.holder === pid) {
      const p = P('eb_potato');
      if (leaked.some((l) => l && l.tag === 'eb_potato')) {
        const x = charge(Math.max(0, Math.trunc(Number(p.lp) || 2)) * (counts.get('eb_potato') || 1));
        st.potato = { from: pid, mul: R.potato.mul * (Number(p.grow) || 1.5) };
        this.tickerText(msg('烫手山芋：{name}博士没接住山芋，扣除 {n} 点目标生命', { name: ps.name, n: x }), 1);
      } else {
        st.potato = null;
        this.tickerText(msg('烫手山芋：{name}博士击倒了山芋，传递结束', { name: ps.name }), 1);
      }
    }
  }

  /** What settle() already charged `ps` this round (its 联防 result box's loss, else min(cap, its counted leaks)). */
  _ebChargedLoss(ps, result) {
    const v = this.uniteResultView;
    if (v && v.losses && Number.isFinite(v.losses[ps.playerId])) return v.losses[ps.playerId];
    const counted = (result.leaked || []).filter((l) => l && l.counted !== false).length;
    return Math.min(this.lpCapFor(ps), counted);
  }

  /** The elites (ELITE rank) the player is billed for: its own counted leaks, or — a 联防 leaker — its 联防 survivors. */
  _ebEliteLeaks(ps, leaked, uniteResult) {
    const isElite = (key) => String(this.gd.enemy(key)?.rank ?? '').toUpperCase() === 'ELITE';
    const v = this.uniteResultView;
    if (v && Array.isArray(v.leakers) && v.leakers.includes(ps.playerId) && uniteResult && !uniteResult.synthetic) {
      let n = 0;
      for (const pp of Object.values(uniteResult.perPlayer || {})) {
        for (const l of (pp && pp.leaked) || []) if (l && l.counted !== false && l.sourcePlayerId === ps.playerId && isElite(l.enemyKey)) n++;
      }
      for (const u of uniteResult.unspawned || []) if (u && u.sourcePlayerId === ps.playerId && isElite(u.enemyKey)) n++;
      return n;
    }
    return leaked.filter((l) => l && l.counted !== false && isElite(l.enemyKey)).length;
  }

  /** player/economy.js refreshPriceNow: 通胀 — a paid manual refresh from the round's `from`-th on costs more. */
  enemyRefreshTax(ps) {
    const n = this._ebCount('eb_inflation');
    if (!n || !ps || !ps.round) return 0;
    const p = P('eb_inflation');
    return ps.round.refreshes >= Math.max(1, Math.trunc(Number(p.from) || 6)) - 1 ? Math.trunc(Number(p.funds) || 1) * n : 0;
  }

  /** bossRounds.js startFinalAssault: 首领·坚韧 — the shared pool × this (1 without it). */
  enemyBossPoolMul() {
    const n = this._ebCount('eb_b_tough');
    return n ? 1 + pct(P('eb_b_tough').pct) * n : 1;
  }

  /**
   * combat.js: 时限压缩 — a normal field's time limit (the battle's and the phase's deadline) × (1 − pct)^k; `limit` as is
   * without it. The round's 盲盒 / 血月 upgrades count once drawn (the first battle built).
   */
  enemyTimeLimit(limit) {
    const n = this._ebCountsNow().get('eb_rush') ?? 0;
    if (!n || !(limit > 0) || !Number.isFinite(limit)) return limit;
    return Math.max(1, Math.round(limit * (1 - pct(P('eb_rush').pct)) ** n * 100) / 100);
  }

  /** PlayerState.addLayers: 叠层税 — a 特质 gain (reason 'garrison:…') of `n` layers, cut (n as is otherwise). */
  enemyLayerTax(n, reason) {
    const k = this._ebCount('eb_layertax');
    if (!k || !(n > 0) || typeof reason !== 'string' || !reason.startsWith('garrison')) return n;
    return layerTaxKeep(n, k);
  }

  /**
   * bossRounds.js, the shared pool's onHit: 首领·复苏 — the first time the pool is at hpPct % or below (with HP left) it
   * gets pct % of its max back, once a pool (every field shares it; a client's field follows b.pool).
   */
  enemyBossRevive(pool) {
    const n = this._ebCount('eb_b_revive');
    if (!n || !pool || pool.ebRevived || !(pool.hp > 0)) return;
    const p = P('eb_b_revive');
    if (pool.hp > pool.maxHp * pct(p.hpPct)) return;
    pool.ebRevived = true;
    const add = Math.min(pool.maxHp - pool.hp, pool.maxHp * pct(p.pct) * n);
    if (add > 0) pool.hp += add;
    this.tickerText(msg('首领·复苏：领袖回复了共享血池的 {pct}%', { pct: Math.round(Number(p.pct) * n) }), 1);
  }

  /** bossRounds.js: 首领·倒计时 — the overtime drain starts this many REAL seconds sooner (0 without it). */
  enemyOvertimeLead() {
    const n = this._ebCount('eb_b_clock');
    if (!n) return 0;
    return Math.min(Math.max(0, Number(this.gd.bossOvertimeAfterReal) || 0), (Number(P('eb_b_clock').sec) || 0) * n);
  }
}
