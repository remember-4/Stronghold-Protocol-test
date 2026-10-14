// server/match/match/augments.js — A6000 fork: Match methods of the AUGMENT phase (shared/augments.js has the schedule,
// the definitions and the rolls; server/sim/content/augments.js what they do).
//
// After ROUND_START, on an augment round and / or a vote round (afterRoundStart → enterAugment), before the 机变 draft or
// the prep phase (afterAugment):
//   海克斯   every alive player gets AUGMENT_OFFERS augments of the round's tier (never one it holds; no reroll since
//            2026-10-09, the user's call) and picks one (g.augPick). The pick
//            is the player's for the rest of the match: an EffectRef 'augment:<id>' (the effects list, the battles'
//            playerEffects — not for the prep-only ones) and the registry handler's onAugmentPick (the immediate part).
//   敌人强化  match/enemyVotes.js (enemyVoteRound / enemyVoteView): a tier by the room's weights, then VOTE_OPTIONS upgrades
//            of that tier (the 首领专场's pool before the Final Assault); every alive player votes (g.enemyVote; a vote can
//            be changed until the phase ends); the winner joins `enemyBuffs`, which every battle carries from then on.
// Both run at once when a round has both. The phase ends when every alive player has picked and voted, or at the
// deadline (the longer part's seconds; untimed: solo and single-human matches, as the 机变 draft): a missing pick takes a
// random offer, a missing vote abstains. Bots and bot-controlled seats act after DELAYS.BOT_ACTION (staggered).
// Every random draw comes from this.rngAug (seed stream 'augments'): the other streams are untouched.
// Installed on Match.prototype by server/match/Match.js (a method container: never instantiated; `this` is the match).

import { PHASE, ERR } from '../../../shared/constants.js';
import {
  AUGMENT_OFFERS, AUGMENT_SECONDS, VOTE_SECONDS, EXCLUSIVE_ROUNDS, augmentDef, augmentTierAt, rollAugments, rollRarity,
  AUG5_BOT,
} from '../../../shared/augments.js';
import { msg, dn, tn, format } from '../../../shared/i18n.js';
import { OK, fail, DELAYS } from './common.js';
// 海克斯第五版 (the user, 2026-10-10): each batch's match-side hooks (server/match/augments5/*.js MATCH)
import { MATCH as AUG5_M1 } from '../augments5/g1.js';
import { MATCH as AUG5_M2 } from '../augments5/g2.js';
import { MATCH as AUG5_M3 } from '../augments5/g3.js';
import { MATCH as AUG5_M4 } from '../augments5/g4.js';
// 海克斯第六版 (2026-10-10): g5–g11, and the 套装 bonuses kept as EffectRefs (shared/augmentSets.js; syncAugmentSets)
import { MATCH as AUG5_M5 } from '../augments5/g5.js';
import { MATCH as AUG5_M6 } from '../augments5/g6.js';
import { MATCH as AUG5_M7 } from '../augments5/g7.js';
import { MATCH as AUG5_M8 } from '../augments5/g8.js';
import { MATCH as AUG5_M9 } from '../augments5/g9.js';
import { MATCH as AUG5_M10 } from '../augments5/g10.js';
import { MATCH as AUG5_M11 } from '../augments5/g11.js';
import { SET_DEFS, setCounts, setLevel } from '../../../shared/augmentSets.js';

const AUG5_MATCH = [AUG5_M1, AUG5_M2, AUG5_M3, AUG5_M4, AUG5_M5, AUG5_M6, AUG5_M7, AUG5_M8, AUG5_M9, AUG5_M10, AUG5_M11];
/**
 * 记仇的互动 (the user, 2026-10-11): per GRUDGE_PER_FLOOR grudges the victim's LP floor drops 1 (at most GRUDGE_FLOOR_MAX);
 * from GRUDGE_BONUS_AT grudges a take is +1 (funds) / +2 (layers); both holding GRUDGE_FEUD+ against each other: 血仇.
 * (2026-10-14, the user: 「记仇的惩罚太重了 平衡一下」: the floor at most 2 lower — a floor of 6 stops at 4 —, was 3.)
 */
const GRUDGE_PER_FLOOR = 2;
const GRUDGE_FLOOR_MAX = 2;
const GRUDGE_BONUS_AT = 3;
const GRUDGE_FEUD = 3;
/**
 * 还手 (the user, 2026-10-11: 「队友可以采取一点报复手段」) — the victim's own means, no 海克斯 needed; they spend
 * grudges and make none (no ping-pong). 不兜底 (automatic): in a 联防 a helper's damage to the enemies leaked by someone
 * it holds grudges against is GRUDGE_COVER_PCT % lower per grudge (at most GRUDGE_COVER_MAX grudges). A click in the prep
 * on his row (g.augAction { id, target }), once a round each: 讨债 (1 grudge: GRUDGE_DEBT_FUNDS funds from him) and
 * 使绊子 (2 grudges: his operators deal GRUDGE_TRIP_PCT % less in his own combat this round). A bot collects (讨债) at the
 * round start from BOT_DEBT_AT grudges.
 * 2026-10-14 (「记仇的惩罚太重了 平衡一下」): one grudge stands for one take — mostly 1 funds or 1 LP (收保护费, 顺手牵羊,
 * 篡位, 公摊, 吸血鬼 …) — and 讨债 took 2 back, the bots at once: most 损人利己 海克斯 lost their holder funds. Now 讨债 takes
 * 1 (was 2) and a bot lets a single take go (BOT_DEBT_AT 2, was 1); the two that cost the team rather than move something
 * — 不兜底 (the cover's leaks hit the leaker) and 使绊子 — are −10 % (were −15 %), 不兜底 on at most 2 grudges (was 3:
 * −20 % at most, was −45 %).
 */
export const GRUDGE_COVER_PCT = 10;
export const GRUDGE_COVER_MAX = 2;
export const GRUDGE_DEBT_FUNDS = 1;
export const GRUDGE_TRIP_PCT = 10;
export const BOT_DEBT_AT = 2;
export const RV_DEBT = 'aug_rv_debt';
export const RV_TRIP = 'aug_rv_trip';
const RV_COST = Object.freeze({ [RV_DEBT]: 1, [RV_TRIP]: 2 });

/** Bot preference of an augment (higher first): the battle ones a board always uses, then the economy. */
const BOT_AUGMENT = Object.freeze({
  aug_undying: 9, aug_expand: 8, aug_command: 8, aug_haste: 7, aug_glass: 6, aug_lifesteal: 6, aug_surge: 6,
  aug_greed: 6, aug_recruit: 5, aug_tough: 5, aug_sharp: 5, aug_armor: 4, aug_shield: 4, aug_piggy: 4, aug_redeploy: 3,
  // the user's third list (2026-10-09): what a bot's board uses without a plan scores higher; the click ones (献祭, 命运轮盘,
  // 熔炉) a bot never uses — lowest
  aug_supply: 4, aug_savings: 3, aug_haggle: 4, aug_subsidy: 4, aug_adversity: 3, aug_gamble: 3, aug_promo: 4, aug_freezedeal: 2,
  aug_spark: 5, aug_backbone: 5, aug_rookie: 5, aug_last_stand: 4, aug_stoploss: 4, aug_guardian: 4, aug_medic: 3,
  aug_second_wind: 5, aug_execute: 5, aug_triangle: 4, aug_vanguard: 4, aug_quartermaster: 4, aug_mutual: 3, aug_rob: 3,
  aug_bomb: 2, aug_speaker: 2, aug_loot: 5, aug_bonus: 4, aug_eye: 4, aug_hometown: 5, aug_projector: 5, aug_study: 5,
  aug_momentum: 6, aug_dual: 6, aug_reclass: 4, aug_minor: 5, aug_insurance: 5, aug_chain: 6, aug_skill_echo: 5, aug_drill: 5,
  aug_control: 5, aug_thorns: 4, aug_multi: 7, aug_depth: 5, aug_center: 4, aug_highground: 5, aug_craft: 5, aug_refit: 4,
  aug_forge: 1, aug_watch: 4, aug_sync: 4, aug_vampire: 4, aug_sacrifice: 1, aug_blame: 4, aug_wheel: 1, aug_legacy: 3,
  aug_elite: 8, aug_reserve: 3, aug_resonance: 7, aug_harmony: 8, aug_first_strike: 7, aug_pierce: 8, aug_echo: 5,
  aug_armory: 5, aug_together: 7, aug_allin: 6, aug_bound: 4, aug_chosen: 6,
  // the friend's 19 (shared/hexRevision.js USER_AUGMENTS, 2026-10-14; not scanned yet — by what a board without a plan
  // uses): 不等价交换 never (the funds become the LP: a bot's few funds would end its seat), 亮出你的剑 (every range one
  // tile ahead: the snipers' and the medics' too) and 掷投狂人 (a bot never rerolls) the lowest
  aug_u_exchange: -50, aug_u_sword: 1, aug_u_choice_reroll: 1, aug_u_redeploy_hero: 1, aug_u_escape: 1, aug_u_deathcry: 2,
  aug_u_deploy_shield: 2, aug_u_steadfast: 2, aug_u_arts_juice: 2, aug_u_burn_income: 2, aug_u_homeguard: 3, aug_u_heavy_hit: 3,
  aug_u_death_ring: 3, aug_u_basics: 3, aug_u_soul_siphon: 4, aug_u_wind_blessing: 4, aug_u_inferno: 5, aug_u_dualstrike: 6,
  aug_u_infinite_sp: 6,
  // 专属强化: a strategy's own (the bots take one when it is offered, but for 老鲤 III's lost round)
  aug_x_warfarin2: 7, aug_x_warfarin3: 8, aug_x_amiya1: 6, aug_x_amiya2: 6, aug_x_duyaoy1: 6, aug_x_duyaoy3: 7, aug_x_goliath3: 7,
  aug_x_orchid2: 6, aug_x_justin1: 6, aug_x_justin3: 7, aug_x_ermengard1: 6, aug_x_ermengard2: 7, aug_x_lmlee2: 6,
  aug_x_lmlee3: 2, aug_x_kirara1: 6, aug_x_kirara2: 6, aug_x_kirara3: 8,
  // the table of 2026-10-10 moved some tiers: 休露丝 / 潘格尼尼 / 夕 / 变形者集群 III→II, 贾维 / 变形者集群 II→I, 大帝 I new
  aug_x_sciurus1: 6, aug_x_humus1: 6, aug_x_vodfox1: 6, aug_x_emperor1: 6, aug_x_damaztic1: 6, aug_x_chiave1: 6,
  aug_x_pepe2: 7, aug_x_harold2: 6, aug_x_clementia2: 6, aug_x_sciurus2: 7, aug_x_paganini2: 6, aug_x_damaztic2: 7, aug_x_dusk2: 7,
  aug_x_emperor2: 6, aug_x_mberry2: 6, aug_x_humus2: 6, aug_x_yu2: 6, aug_x_doberm2: 6, aug_x_cathy2: 6, aug_x_malkie2: 6,
  aug_x_pith2: 6, aug_x_cannot2: 6, aug_x_duck2: 6, aug_x_lisa2: 6, aug_x_vodfox2: 6, aug_x_ioleta2: 6,
  aug_x_jesica2: 6, aug_x_mlyss2: 6, aug_x_mlynar2: 6, aug_x_harold3: 7, aug_x_paganini3: 7,
  aug_x_mberry3: 7, aug_x_doberm3: 7, aug_x_pith3: 7, aug_x_jesica3: 7,
  aug_x_fang3: 7, aug_x_mlynar3: 7,
  // 海克斯第五版 (shared/augments5/*.js BOT)
  ...AUG5_BOT,
});
export class MatchAugments {
  /** Whether the round that just started has an augment pick or an enemy vote. */
  augmentRound(round = this.round) {
    if (!this.augmentsOn) return false;
    return this._ebState().settings.playerRounds.includes(round) || this.enemyVoteRound(round);
  }

  /**
   * The battle flags every battle of the match takes (+ the enemy upgrades so far; + `trackLastKills` while a player
   * holds 专属强化II·老鲤: the 联防 result then names who defeated each leaker's last enemy).
   */
  battleFlags(flags) {
    // the enemy upgrades so far and their per-battle state (match/enemyVotes.js)
    let out = this.enemyBuffFlags(flags);
    if ([...this.players.values()].some((p) => p.augments.includes('aug_x_lmlee2'))) out = { ...out, trackLastKills: true };
    // 专属强化II·鸭爵: the swapped enemies (spawn tag 'duck') cost no LP — every battle of the team carries the swaps
    if ([...this.players.values()].some((p) => p.alive && p.augments.includes('aug_x_duck2'))) out = { ...out, duckFreeLp: true };
    // 海克斯·献祭: this round's sacrificers (content/augments.js installTeam lifts every other player's damage)
    if (this.augSacrifice && this.augSacrifice.round === this.round && this.augSacrifice.pids.length) out = { ...out, augSacrifice: this.augSacrifice.pids.slice() };
    // 还手·使绊子: this round's tripped players (content/augments.js installTeam: their own combat only)
    if (this.augTrips && this.augTrips.round === this.round && Object.keys(this.augTrips.mul).length) out = { ...out, grudgeTrip: { ...this.augTrips.mul } };
    return out;
  }

  /**
   * Whether `def` may be offered to `ps`: the co-op ones (`coop`) not in solo; 储蓄 not to a strategy that keeps its
   * leftover funds anyway (坎诺特: it would make funds); 专属强化III·哈洛德 not while 维娜·维多利亚 is banned / out of the pool.
   */
  augmentAvailable(ps, def) {
    if (def.coop && (this.isSolo || this.order.length < 2)) return false;
    // 海克斯第六版: a 套装's pseudo augment is never offered; a definition may bound its rounds (任务·速通: maxRound 8) or skip
    // the strategies that keep their leftover funds anyway (金库: noLeftover, as 储蓄 below)
    if (def.pseudo) return false;
    if (Number.isInteger(def.maxRound) && this.round > def.maxRound) return false;
    if (Number.isInteger(def.minRound) && this.round < def.minRound) return false;
    if (def.noLeftover && this.gd.leftoverKeptBands.includes(ps.bandId)) return false;
    if (def.id === 'aug_vs_times' && !this.factions?.includes('TIMES')) return false;
    if (def.id === 'aug_savings' && this.gd.leftoverKeptBands.includes(ps.bandId)) return false;
    // A6000 fork: 不等价交换 swaps the player's own LP — none once the team's LP is one pool (the Hidden Core's round); and
    // never a bot's (its few funds would become its LP): not offered, nor drawn by 盲盒 / 炼金术 (augments5/g5.js drawGeneric)
    if (def.id === 'aug_u_exchange' && (this.teamLp != null || ps.botControlled)) return false;
    if (def.id === 'aug_x_harold3') {
      const base = this.gd.baseIdOf(def.params.chess);
      return !(this.bannedChess || []).includes(base) && this.pool.has(base);
    }
    return true;
  }

  /**
   * The most LP a round's leaks may cost `ps` (settle.js, the LP preview): the data's cap, 海克斯·止损 −n, and the enemy
   * upgrades' change (enemyVotes.js enemyLpCapDelta); at least 1.
   */
  lpCapFor(ps) {
    let cap = this.gd.lpCapPerRound;
    if (ps && ps.augments.includes('aug_stoploss')) cap -= Math.max(0, Math.trunc(Number(augmentDef('aug_stoploss').params.n) || 0));
    cap += Math.trunc(Number(this.enemyLpCapDelta(ps)) || 0);
    for (const g of AUG5_MATCH) if (g.lpCap) cap = Math.trunc(Number(g.lpCap(this, ps, cap)) || cap);
    return Math.max(1, cap);
  }

  /** The vote weights of the 敌人强化 tally: 海克斯·话事人 counts twice (voter id → weight; null = all 1). */
  voteWeights() {
    let out = null;
    for (const ps of this.alivePlayers()) if (ps.augments.includes('aug_speaker')) (out ??= {})[ps.playerId] = 2;
    return out;
  }

  /**
   * 海克斯·话事人 "平票时以你的选择为准": the first holder (seat order) who voted. A tie it decides (the tally of
   * shared/enemyBuffs.js tallyVote — the weights, 逆反 — with its choice among the tied) is announced: finishEnemyVote asks
   * once per vote, right before the tally.
   */
  votePrefer(vote) {
    const ps = this.alivePlayers().find((p) => p.augments.includes('aug_speaker') && vote && vote.votes && vote.votes[p.playerId] != null);
    if (!ps) return null;
    const weights = this.voteWeights() || {};
    const count = new Map((vote.options || []).map((o) => [o, 0]));
    for (const [voter, v] of Object.entries(vote.votes)) if (count.has(v)) count.set(v, count.get(v) + (weights[voter] > 0 ? weights[voter] : 1));
    const best = vote.reverse ? Math.min(...count.values()) : Math.max(...count.values());
    const top = [...count.keys()].filter((o) => count.get(o) === best);
    if (top.length > 1 && top.includes(vote.votes[ps.playerId])) {
      this.tickerText(msg('{name} 拍板了', { name: ps.name }), 1);
      this.teamFx('speaker', { to: ps.playerId, augment: 'aug_speaker' });
    }
    return ps.playerId;
  }

  /** 专属强化III·老鲤: the player's round of the pick is lost (no prep action). */
  augmentLocked(ps) {
    return !!ps && ps.augLockRound === this.round && this.phase === PHASE.PREP;
  }

  enterAugment() {
    const alive = this.alivePlayers();
    const tier = this._ebState().settings.playerRounds.includes(this.round) ? augmentTierAt(this.round) || 3 : 0;
    const vote = this.enemyVoteRound(this.round);
    if (!alive.length || (!tier && !vote)) { this.afterAugment(); return; }
    this.phase = PHASE.AUGMENT;
    const a = { round: this.round, tier, offers: {}, picks: {}, rarity: {}, extra: {}, rerolls: {}, commonRarity: null, vote: null, untimed: this.soloUntimed };
    const settings=this._ebState().settings;
    if(settings.samePlayerQuality && (tier || settings.sameBothQuality && vote)) {
      const seen=alive.some(ps=>!(ps.augRarities||[]).some(r=>r>=5)) ? [] : [5];
      a.commonRarity=rollRarity(Math.min(this.round,13),this.rngAug,seen);
      const shifts=tier ? alive.reduce((sum,ps)=>sum+Math.trunc(Number(ps.augRarityShift)||0),0) : 0;
      a.commonRarity=Math.max(1,Math.min(6,a.commonRarity+shifts));
      if(tier)for(const ps of alive)ps.augRarityShift=0;
      if(settings.sameBothQuality && vote && settings.firstNoPrism && this.round===settings.enemyRounds[0] && a.commonRarity===6)a.commonRarity=5;
    }
    if (tier) {
      for (const ps of alive) {
        const { rarity, offers } = this._augmentOffersFor(ps, tier, { forcedRarity:a.commonRarity, strict:settings.samePlayerQuality });
        a.rarity[ps.playerId] = rarity;
        a.offers[ps.playerId] = offers;
        a.rerolls[ps.playerId]=ps.augments.includes('aug_u_choice_reroll')?1:0;
        // 海克斯第六版 预约券: this phase the player picks once more per voucher (_applyAugment deals the next set)
        if (ps.augVoucher > 0) { a.extra[ps.playerId] = Math.trunc(ps.augVoucher); ps.augVoucher = 0; }
      }
    }
    if (vote) a.vote = this.rollEnemyVote(settings.sameBothQuality ? a.commonRarity : null);
    this.aug = a;
    const secs = Math.max(tier ? AUGMENT_SECONDS : 0, vote ? VOTE_SECONDS : 0);
    const token = ++this._turnToken;
    this.setDeadline(a.untimed ? 0 : secs, () => { if (this.phase === PHASE.AUGMENT && token === this._turnToken) this.finishAugment(); });
    let n = 0;
    for (const ps of alive) if (ps.botControlled) this.scheduleAugmentBot(ps, n++);
    for (const ps of alive) this.markPrivate(ps);
    this.markPublic();
  }

  /**
   * One player's rarity and offers in this AUGMENT phase (also 预约券's next set). The six rarities (the user, 2026-10-10):
   * each player rolls one (shared/augments.js rollRarity, the pity at R8). 海克斯第六版: 增幅 / 预支 shift that roll once
   * (`ps.augRarityShift`), 加购 deals more generic cards (`ps.augExtraOffers`); without them nothing draws differently.
   */
  _augmentOffersFor(ps, tier, opts = {}) {
    const forcedRarity=opts.forcedRarity ?? this.aug?.commonRarity;
    const strict=opts.strict ?? this._ebState().settings.samePlayerQuality;
    let rarity = forcedRarity ?? rollRarity(Math.min(this.round, 13), this.rngAug, ps.augRarities ?? []);
    if (forcedRarity == null && ps.augRarityShift) {
      rarity = Math.max(1, Math.min(6, rarity + Math.trunc(Number(ps.augRarityShift) || 0)));
      ps.augRarityShift = 0;
    }
    if(opts.record!==false)(ps.augRarities ??= []).push(rarity);
    if (rarity === 6) this.tickerText(msg('{name} 抽到了红色海克斯！', { name: ps.name }), 1);
    const n = AUGMENT_OFFERS + Math.max(0, Math.trunc(Number(ps.augExtraOffers) || 0));
    // 专属强化 only on their rounds (EXCLUSIVE_ROUNDS), of that round's tier — the 海克斯 come every round since 2026-10-10
    const ex = EXCLUSIVE_ROUNDS[this.round] ?? 0;
    const bandId = ex && !this.exclusivesOff ? ps.bandId : null;
    const offers = rollAugments(ex || tier, ps.augments, this.rngAug, n, bandId, (d) => this.augmentAvailable(ps, d) && !(opts.avoid||[]).includes(d.id), this.classCounts(ps), rarity, strict);
    // balance runs (tools/matchrun.mjs --augment): a forced augment of the tier, legal for the strategy, is offered (a
    // 专属强化 on its own rounds)
    const forced = this.forceAugments.find((id) => {
      const d = augmentDef(id);
      if (!d || (strict && d.rarity!==rarity) || (opts.avoid||[]).includes(id) || ps.augments.includes(id) || !this.augmentAvailable(ps, d)) return false;
      return d.band ? !!ex && d.tier === ex && d.band === ps.bandId : d.tier === tier;
    });
    if (forced && !offers.includes(forced)) offers[offers.length - 1] = forced;
    return { rarity, offers };
  }

  /** One future selection reroll from 掷投狂人; exact rarity, no extra rarity-history or pity draw. */
  rerollAugment(ps) {
    const a=this.aug,pid=ps.playerId;
    if(this.phase!==PHASE.AUGMENT || !a)return fail(ERR.WRONG_PHASE);
    if(!ps.alive)return fail(ERR.ELIMINATED);
    if(!a.offers[pid] || a.picks[pid]!=null || !(a.rerolls?.[pid]>0))return fail(ERR.BAD_TARGET);
    const next=this._augmentOffersFor(ps,a.tier,{forcedRarity:a.rarity[pid],strict:true,record:false,avoid:a.offers[pid]});
    if(!next.offers.length)return fail(ERR.BAD_TARGET);
    a.rerolls[pid]--;a.offers[pid]=next.offers;this.markPrivate(ps);return OK;
  }

  /** The player still has something to do in this AUGMENT phase. */
  augmentPending(ps) {
    const a = this.aug;
    if (!a || !ps || !ps.alive) return false;
    return (!!a.offers[ps.playerId] && a.picks[ps.playerId] == null) || (!!a.vote && a.vote.votes[ps.playerId] == null);
  }

  scheduleAugmentBot(ps, i = 0) {
    const token = this._turnToken;
    this.later(this.scaled(DELAYS.BOT_ACTION + i * DELAYS.BOT_STAGGER), () => {
      if (this.phase !== PHASE.AUGMENT || token !== this._turnToken || !this.aug || !ps.botControlled || !ps.alive) return;
      const a = this.aug;
      const offers = a.offers[ps.playerId];
      if (offers && a.picks[ps.playerId] == null) this._applyAugment(ps, this.botAugment(ps, offers));
      if (a.vote && a.vote.votes[ps.playerId] == null) this._castVote(ps, this.botVote(ps, a.vote.options));
      this._augmentMaybeDone();
    });
  }

  botAugment(ps, offers) {
    const forced = offers.find((id) => this.forceAugments.includes(id));
    if (forced) return forced;
    // 职业专精: worth more the more operators of its profession the bot fields (2 → 6, 3 → 7, …)
    const counts = offers.some((id) => augmentDef(id)?.cls) ? this.classCounts(ps) : null;
    const scoreOf = (id) => { const d = augmentDef(id); return d && d.cls ? 4 + (counts.get(d.cls) || 0) : BOT_AUGMENT[id] ?? 0; };
    let best = offers[0], score = -Infinity;
    for (const id of offers) { const s = scoreOf(id); if (s > score) { best = id; score = s; } }
    return best;
  }

  /**
   * 职业专精 (A6000 fork, 2026-10-09): a player's operators on the board by profession (Map profession → count, in the
   * board's order) — the roll's class card (shared/augments.js rollAugments). A 补位 / 自选 piece counts as the operator
   * it fields (the battle's unit def: content/classAugments.js professionOf).
   */
  classCounts(ps) {
    const out = new Map();
    const diyOps = this.gd.raw && this.gd.raw.backups && this.gd.raw.backups.diy ? this.gd.raw.backups.diy.operators || {} : {};
    for (const piece of ps.board.values()) {
      if (!piece || piece.kind !== 'chess') continue;
      const rec = this.gd.chess(piece.id);
      const field = rec && typeof ps.fieldRecord === 'function' ? ps.fieldRecord(rec) : rec;
      let prof = field && field.profession;
      if (!prof && typeof ps.diyPickOf === 'function') {
        const pick = ps.diyPickOf(piece.id);
        prof = pick && diyOps[pick.charId] ? diyOps[pick.charId].profession : null;
      }
      if (typeof prof === 'string' && prof) out.set(prof, (out.get(prof) || 0) + 1);
    }
    return out;
  }

  /** g.augPick { id } */
  pickAugment(ps, id) {
    const a = this.aug;
    if (this.phase !== PHASE.AUGMENT || !a) return fail(ERR.WRONG_PHASE);
    if (!ps.alive) return fail(ERR.ELIMINATED);
    const offers = a.offers[ps.playerId];
    if (!offers) return fail(ERR.WRONG_PHASE);
    if (a.picks[ps.playerId] != null) return fail(ERR.ALREADY);
    if (!offers.includes(id)) return fail(ERR.BAD_TARGET);
    this._applyAugment(ps, id);
    this._augmentMaybeDone();
    return OK;
  }

  _applyAugment(ps, id) {
    const a = this.aug;
    if (!a || !augmentDef(id) || a.picks[ps.playerId] != null) return;
    a.picks[ps.playerId] = id;
    this.grantAugment(ps, id);
    // 海克斯第六版 预约券: the next set right away (a fresh rarity roll); the phase waits for it like for a first pick
    const extra = a.extra ? a.extra[ps.playerId] || 0 : 0;
    if (extra > 0 && a.tier && this.phase === PHASE.AUGMENT && ps.alive) {
      a.extra[ps.playerId] = extra - 1;
      const { rarity, offers } = this._augmentOffersFor(ps, a.tier);
      if (!offers.length) return;
      ((a.earlier ??= {})[ps.playerId] ??= []).push(id);
      a.rarity[ps.playerId] = rarity;
      a.offers[ps.playerId] = offers;
      a.picks[ps.playerId] = null;
      if (ps.botControlled) this.scheduleAugmentBot(ps);
      this.markPrivate(ps);
      this.markPublic();
    }
  }

  /**
   * The player holds `id` from now on: the EffectRef, the immediate part, 老鲤 III's lost round (also tests / tools).
   * `silent` (海克斯第六版: 借来用用 lends and returns one): only the holding — no immediate part, no team part, no hook.
   */
  grantAugment(ps, id, { silent = false } = {}) {
    const def = augmentDef(id);
    if (!def || def.pseudo || !ps || ps.augments.includes(id)) return false;
    ps.augments.push(id);
    ps.effects.push({
      id: `augment:${id}`, key: `augment:${id}`, iconKind: 'augment', iconId: null,
      name: def.name, desc: format(def.desc, def.params), params: { ...def.params, tier: def.tier },
      battle: def.side !== 'meta',
    });
    this.syncAugmentSets(ps);
    ps.dirty();
    if (silent) {
      ps.recompute();
      this.markPrivate(ps);
      this.markPublic();
      return true;
    }
    try { this.dispatcher.runKey(ps, `augment:${id}`, 'onAugmentPick', { kind: 'augment' }, { augment: id }); } catch (e) { this.reportError(`augment ${id}`, e); }
    this._augmentTeamPick(ps, id);
    for (const g of AUG5_MATCH) if (g.onPick) { try { g.onPick(this, ps, id); } catch (e) { this.reportError(`augment ${id} onPick`, e); } }
    // 专属强化III·老鲤: this round lost — no prep action (intents.js, prep.js: ready at once), the funds held to the next
    if (id === 'aug_x_lmlee3') {
      ps.augLockRound = this.round;
      if (ps.funds > 0) { ps.pendingFunds += ps.funds; ps.funds = 0; }
    }
    ps.recompute();
    this.markPrivate(ps);
    this.markPublic();
    return true;
  }

  /**
   * 海克斯第六版 (炼金术, 献祭之刃, 金猪, 借来用用): `ps` no longer holds `id` — its EffectRef goes (its prep handlers stop:
   * they run by EffectRef; the next battles lose it), the 套装 recount. What it already did stays done.
   */
  revokeAugment(ps, id) {
    if (!ps || !Array.isArray(ps.augments)) return false;
    const i = ps.augments.indexOf(id);
    if (i < 0) return false;
    ps.augments.splice(i, 1);
    const k = ps.effects.findIndex((e) => e && e.key === `augment:${id}`);
    if (k >= 0) ps.effects.splice(k, 1);
    this.syncAugmentSets(ps);
    ps.recompute();
    ps.dirty();
    this.markPrivate(ps);
    this.markPublic();
    return true;
  }

  /** 海克斯第六版 借来用用: `id` moves from `from` to `to` with its EffectRef's counter and data (no immediate part). */
  transferAugment(from, to, id) {
    if (!from || !to || from === to || !from.augments.includes(id) || to.augments.includes(id)) return false;
    const ref = from.effects.find((e) => e && e.key === `augment:${id}`);
    this.revokeAugment(from, id);
    if (!this.grantAugment(to, id, { silent: true })) return false;
    const moved = to.effects.find((e) => e && e.key === `augment:${id}`);
    if (ref && moved) {
      if (ref.counter != null) moved.counter = ref.counter;
      if (ref.data != null) moved.data = ref.data;
      to.dirty();
    }
    return true;
  }

  /**
   * 海克斯第六版 套装 (shared/augmentSets.js): one EffectRef 'augment:aug_set_<set>' per set `ps` holds 2+ members of, its
   * params.n the level (2, or 3 for 3+), its text filled; gone under 2. The bonuses are the pseudo augments' install / META
   * (batch g5) — a battle or a prep hook reads them like any augment. A level reached shows the player a toast.
   */
  syncAugmentSets(ps) {
    if (!ps || !Array.isArray(ps.effects)) return;
    const counts = setCounts(ps.augments);
    for (const def of SET_DEFS) {
      const level = setLevel(counts.get(def.set) || 0);
      const key = `augment:${def.id}`;
      const i = ps.effects.findIndex((e) => e && e.key === key);
      if (!level) {
        if (i >= 0) { ps.effects.splice(i, 1); ps.dirty(); }
        continue;
      }
      const params = { ...def.params, n: level, tier: def.tier };
      if (i >= 0) {
        if (ps.effects[i].params?.n === level) continue;
        ps.effects[i].params = params;
        ps.effects[i].desc = format(def.desc, params);
      } else {
        ps.effects.push({ id: key, key, iconKind: 'augment', iconId: null, name: def.name, desc: format(def.desc, params), params, battle: def.side !== 'meta' });
      }
      ps.dirty();
      this.toast(ps, 'info', msg('套装{set}：{n} 件效果生效', { set: tn(def.name), n: level }));
    }
  }

  _augmentMaybeDone() {
    if (this.phase !== PHASE.AUGMENT || !this.aug) return;
    if (this.alivePlayers().some((ps) => this.augmentPending(ps))) return;
    this.later(0, () => this.finishAugment());
  }

  finishAugment() {
    const a = this.aug;
    if (this.phase !== PHASE.AUGMENT || !a) return;
    ++this._turnToken;
    for (const ps of this.alivePlayers()) {
      // a missing pick takes a random offer — again for each further set (预约券) that one deals
      for (let guard = 0; guard < 8; guard++) {
        const offers = a.offers[ps.playerId];
        if (!offers || !offers.length || a.picks[ps.playerId] != null) break;
        this._applyAugment(ps, offers[Math.floor(this.rngAug() * offers.length)]);
      }
    }
    if (a.vote) this.finishEnemyVote(a.vote);
    this.aug = null;
    this.setDeadline(0);
    this.markPublic();
    this.afterAugment();
  }

  /**
   * 专属强化II·老鲤 at the settlement of a 联防 (settle.js): a leaker holding it whose leaked enemies the helpers all
   * stopped (its LP charge 0) gets `funds`, and so does the helper that defeated the last of them (the 联防 result's
   * `lastKills`, server/sim/content/augments.js; with one helper, that one). Both next prep (pendingFunds).
   */
  augmentUniteSettle(plan, uniteResult, losses) {
    if (!plan || !uniteResult || uniteResult.synthetic) return;
    // the 联防 of this settlement for the team 海克斯 of the fifth version (augments5/g4.js: 我来兜底, 抢功, 守望相助)
    this.augUnite = { round: this.round, plan, result: uniteResult };
    for (const ps of plan.leakers) {
      if (!ps.alive || !ps.augments.includes('aug_x_lmlee2') || (losses[ps.playerId] ?? 1) !== 0) continue;
      const n = Math.max(0, Math.trunc(Number(augmentDef('aug_x_lmlee2').params.funds) || 0));
      const lk = uniteResult.lastKills && uniteResult.lastKills[ps.playerId];
      const helper = plan.helpers.find((h) => h.playerId === lk) || (plan.helpers.length === 1 ? plan.helpers[0] : null);
      for (const p of [ps, helper]) {
        if (!p || !p.alive) continue;
        p.pendingFunds += n;
        p.stats.fundsGained += n;
        this.toast(p, 'info', msg('专属强化：老鲤 联防兜底奖励 {n} 资金（下回合发放）', { n }));
      }
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // the team 海克斯 (节目效果, the user's I list of 2026-10-09: LP / funds moved between teammates — the team's total
  // stays, the Final Assault merges the LP anyway —, a broadcast every time) and the ones used by a click (g.augAction)

  /** Alive teammates of `ps` (bots included), seat order. */
  _mates(ps) { return this.alivePlayers().filter((p) => p !== ps); }

  /** The pick's immediate team part: 同生共死 binds, 定时炸弹 lights, 打劫 starts counting, 吸血鬼 shows its sips left. */
  _augmentTeamPick(ps, id) {
    if (id === 'aug_bound') {
      const mate = this._mates(ps).sort((a, b) => a.lp - b.lp || a.seat - b.seat)[0];
      if (!mate) return;
      (this.augBonds ??= []).push({ a: ps.playerId, b: mate.playerId });
      this.tickerText(msg('{a} 和 {b} 绑在了一起', { a: ps.name, b: mate.name }), 1);
      this.teamFx('bound', { from: ps.playerId, to: mate.playerId, augment: id });
    } else if (id === 'aug_bomb') {
      (this.augBombs ??= []).push({ owner: ps.playerId, holder: ps.playerId });
      this.tickerText(msg('{name} 点燃了定时炸弹', { name: ps.name }), 1);
      this.teamFx('bomb', { to: ps.playerId, augment: id });
    } else if (id === 'aug_rob') {
      ps.counters['aug:rob:from'] = this.round;
    } else if (id === 'aug_vampire') {
      this._augLeft(ps, id, augmentDef(id).params.max - (ps.counters['aug:vampire:n'] ?? 0));
    }
  }

  /** The holder's EffectRef shows what is left of a capped team 海克斯 (the effects column's number). */
  _augLeft(ps, id, left) {
    const ref = ps.effects.find((e) => e && e.key === `augment:${id}` && !e.hidden);
    if (ref) { ref.counter = Math.max(0, left); ps.dirty(); }
  }

  /**
   * 记仇 (the analysis, under 损人利己): `victim` lost something to a 损人利己 海克斯 of `taker` — one grudge more against it
   * (m.private grudges, the victim's own only). 海克斯第六版: every batch's `onTake(m, victim, taker, { taken })` hears it
   * (〔坏人〕, 连环计, 以牙还牙).
   * `taken` false (2026-10-14): the holder gained without taking anything from `victim` — 吃回扣, 借刀杀人, 双面间谍 (the
   * funds are the game's) — no grudge, no revenge; only the holder's side of onTake (连环计, 〔坏人〕 2) counts it.
   */
  teamGrudge(victim, taker, { taken = true } = {}) {
    if (!victim || !taker || victim === taker) return;
    if (taken) {
      // 报复 (the user, 2026-10-11: 「给仇恨机制做一点互动」): a take from someone the taker holds a grudge against settles
      // one of those grudges — the take itself was already worth more (teamFloor, teamRevengeBonus)
      const owed = this.teamGrudgeOf(taker, victim);
      if (owed > 0) {
        taker.grudges[victim.playerId] = owed - 1;
        taker.dirty();
        this.tickerText(msg('{a} 报复了 {b}', { a: taker.name, b: victim.name }), 1);
        this.teamFx('revenge', { from: taker.playerId, to: victim.playerId });
        this.teamShow(taker, 'revenge');
      }
      const g = (victim.grudges ??= {});
      g[taker.playerId] = (g[taker.playerId] || 0) + 1;
      victim.dirty();
      // 血仇: two players holding GRUDGE_FEUD+ against each other — announced once a pair
      if (this.teamGrudgeOf(victim, taker) >= GRUDGE_FEUD && this.teamGrudgeOf(taker, victim) >= GRUDGE_FEUD) {
        const pair = [victim.playerId, taker.playerId].sort().join('|');
        if (!(this.augFeuds ??= new Set()).has(pair)) {
          this.augFeuds.add(pair);
          this.tickerText(msg('{a} 和 {b} 结下了血仇', { a: victim.name, b: taker.name }), 2);
          this.teamFx('feud', { from: victim.playerId, to: taker.playerId });
        }
      }
    }
    const info = { taken: !!taken };
    for (const b of AUG5_MATCH) if (b.onTake) { try { b.onTake(this, victim, taker, info); } catch (e) { this.reportError('augment onTake', e); } }
  }

  /** 记仇: how many grudges `holder` holds against `target` (0 without). */
  teamGrudgeOf(holder, target) {
    const g = holder && target && holder.grudges;
    return g ? Math.max(0, Math.trunc(Number(g[target.playerId]) || 0)) : 0;
  }

  /**
   * 报复降底线 (2026-10-11): the LP floor `base` that protects `victim` from a 损人利己 take of `taker` — one lower per
   * GRUDGE_PER_FLOOR grudges the taker holds against the victim, at most GRUDGE_FLOOR_MAX lower, never under 1.
   */
  teamFloor(taker, victim, base) {
    const g = this.teamGrudgeOf(taker, victim);
    return Math.max(1, Math.trunc(Number(base) || 0) - Math.min(GRUDGE_FLOOR_MAX, Math.floor(g / GRUDGE_PER_FLOOR)));
  }

  /** 报复加码 (2026-10-11): +1 to a funds take (+2 to a layers take: the caller doubles it) at GRUDGE_BONUS_AT+ grudges. */
  teamRevengeBonus(taker, victim) {
    return this.teamGrudgeOf(taker, victim) >= GRUDGE_BONUS_AT ? 1 : 0;
  }

  /**
   * 还手·不兜底: the 联防 battle flag `grudgeCover` — helper → leaker → the helper's damage multiplier against that leaker's
   * enemies (only the pairs with a grudge; null without any). The ticker names each pair once a 联防.
   */
  teamCoverFlags(plan, { announce = false } = {}) {
    const out = {};
    for (const h of (plan && plan.helpers) || []) {
      for (const l of (plan && plan.leakers) || []) {
        const g = Math.min(GRUDGE_COVER_MAX, this.teamGrudgeOf(h, l));
        if (!(g > 0) || h === l) continue;
        const pct = GRUDGE_COVER_PCT * g;
        (out[h.playerId] ??= {})[l.playerId] = Math.round((1 - pct / 100) * 1e6) / 1e6;
        if (announce) {
          this.tickerText(msg('{a} 不想给 {b} 兜底：对他漏过来的敌人伤害 −{pct}%', { a: h.name, b: l.name, pct }), 1);
          this.teamFx('noCover', { from: h.playerId, to: l.playerId, amount: pct });
        }
      }
    }
    return Object.keys(out).length ? out : null;
  }

  /**
   * 还手 (g.augAction { id: aug_rv_debt | aug_rv_trip, target }): `ps` spends grudges against the teammate `targetId` —
   * 讨债 (GRUDGE_DEBT_FUNDS of his funds) or 使绊子 (his own combat this round: GRUDGE_TRIP_PCT % less damage); once a
   * round each. The checks of the phase are augmentAction's; a bot calls it at the round start (augmentsRoundStart).
   */
  teamRetaliate(ps, id, targetId) {
    const cost = RV_COST[id];
    const t = typeof targetId === 'string' ? this.players.get(targetId) : null;
    if (!cost || this.isSolo || !t || t === ps || !t.alive || !(t.lp > 0)) return fail(ERR.BAD_TARGET);
    const key = `rv:${id}`;
    if (ps.counters[key] === this.round) return fail(ERR.ALREADY, 'once a round');
    const owed = this.teamGrudgeOf(ps, t);
    if (owed < cost) return fail(ERR.BAD_TARGET, 'not enough grudges');
    if (id === RV_DEBT) {
      if (!(t.funds > 0)) return fail(ERR.BAD_TARGET, 'no funds');
      const n = -t.addFunds(-Math.min(t.funds, GRUDGE_DEBT_FUNDS), { reason: 'revenge:debt' });
      ps.addFunds(n, { reason: 'revenge:debt' });
      this.tickerText(msg('{a} 向 {b} 讨债：{n} 资金', { a: ps.name, b: t.name, n }), 1);
      this.teamFx('debt', { from: t.playerId, to: ps.playerId, amount: n });
    } else {
      if (this.round === this.gd.bossRound || this.round === this.gd.hiddenRound) return fail(ERR.BAD_TARGET, 'no own combat this round');
      if (!this.augTrips || this.augTrips.round !== this.round) this.augTrips = { round: this.round, mul: {} };
      const was = Number(this.augTrips.mul[t.playerId]) || 1;
      this.augTrips.mul[t.playerId] = Math.round(was * (1 - GRUDGE_TRIP_PCT / 100) * 1e6) / 1e6;
      this.tickerText(msg('{a} 给 {b} 使了绊子：他本回合的干员伤害 −{pct}%', { a: ps.name, b: t.name, pct: GRUDGE_TRIP_PCT }), 1);
      this.teamFx('trip', { from: ps.playerId, to: t.playerId, amount: GRUDGE_TRIP_PCT });
    }
    ps.grudges[t.playerId] = owed - cost;
    ps.counters[key] = this.round;
    this.teamShow(ps, 'revenge');
    ps.dirty();
    t.dirty();
    this.markPrivate(ps);
    this.markPrivate(t);
    this.markPublic();
    return OK;
  }

  /**
   * 还手 of a bot (the round start): 讨债 the teammate it holds the most grudges against (seat order on a tie) — BOT_DEBT_AT+
   * of them: a single take goes —, if he has funds.
   */
  _botRetaliate(ps) {
    const g = ps.grudges || {};
    const at = Math.max(RV_COST[RV_DEBT], BOT_DEBT_AT);
    const t = this._mates(ps).filter((m) => (g[m.playerId] || 0) >= at && m.funds > 0)
      .sort((a, b) => (g[b.playerId] || 0) - (g[a.playerId] || 0) || a.seat - b.seat)[0];
    if (t) this.teamRetaliate(ps, RV_DEBT, t.playerId);
  }

  /**
   * The random target of a 损人利己 海克斯 of `ps` among `cands`: the one it holds the most grudges against first (冤冤相报).
   * 海克斯第六版: a candidate a batch's `grudgeImmune(m, c)` covers (〔坏人〕 3 件) draws no grudge priority.
   */
  teamPickVictim(ps, cands) {
    const list = (cands || []).filter(Boolean);
    if (list.length <= 1) return list[0] ?? null;
    const g = ps.grudges || {};
    const immune = (c) => AUG5_MATCH.some((b) => { try { return !!(b.grudgeImmune && b.grudgeImmune(this, c)); } catch { return false; } });
    const weight = (c) => (immune(c) ? 0 : g[c.playerId] || 0);
    const top = Math.max(...list.map(weight));
    const pool = top > 0 ? list.filter((c) => weight(c) === top) : list;
    return pool.length === 1 ? pool[0] : pool[Math.floor(this.rngMeta() * pool.length)];
  }

  /** A 节目称号's count (results.js SHOW_TITLES): the player's counter `show:<key>`. */
  teamShow(ps, key, n = 1) {
    if (!ps || !(n > 0)) return;
    const k = `show:${key}`;
    ps.counters[k] = (Number(ps.counters[k]) || 0) + n;
  }

  /** The round start of the 海克斯 that act on the whole team (Match.startRound, after every player's onRoundStart). */
  augmentsRoundStart() {
    const alive = this.alivePlayers();
    for (const ps of alive) {
      // 吸血鬼: 1 LP from the teammate with the most (not one at `floor` or less), at most max a match
      if (ps.augments.includes('aug_vampire')) {
        const p = augmentDef('aug_vampire').params;
        const used = ps.counters['aug:vampire:n'] ?? 0;
        const mate = this._mates(ps).filter((m) => m.lp > this.teamFloor(ps, m, p.floor)).sort((a, b) => b.lp - a.lp || a.seat - b.seat)[0];
        if (used < p.max && mate) {
          mate.lp -= 1;
          mate.stats.lpLost += 1;
          ps.lp += 1;
          ps.counters['aug:vampire:n'] = used + 1;
          mate.dirty();
          ps.dirty();
          this.tickerText(msg('{a} 吸了 {b} 一口血', { a: ps.name, b: mate.name }), 1);
          this.teamFx('vampire', { from: mate.playerId, to: ps.playerId, amount: 1, augment: 'aug_vampire' });
          this.teamGrudge(mate, ps);
          this.teamShow(ps, 'vampire');
          this._augLeft(ps, 'aug_vampire', p.max - used - 1);
        }
      }
      // 打劫: every `every` rounds after the pick, `funds` from the richest teammate who has them
      if (ps.augments.includes('aug_rob')) {
        const p = augmentDef('aug_rob').params;
        const from = ps.counters['aug:rob:from'] ?? this.round;
        const mate = this._mates(ps).filter((m) => m.funds >= p.funds).sort((a, b) => b.funds - a.funds || a.seat - b.seat)[0];
        if (this.round > from && (this.round - from) % p.every === 0 && mate) {
          const n = Math.min(mate.funds, p.funds + this.teamRevengeBonus(ps, mate));
          mate.addFunds(-n, { reason: 'augment:aug_rob' });
          ps.addFunds(n, { reason: 'augment:aug_rob' });
          this.tickerText(msg('{a} 打劫了 {b}：{n} 资金', { a: ps.name, b: mate.name, n }), 1);
          this.teamFx('rob', { from: mate.playerId, to: ps.playerId, amount: n, augment: 'aug_rob' });
          this.teamGrudge(mate, ps);
          this.teamShow(ps, 'rob');
        }
      }
    }
    // 定时炸弹: on to the next alive player (seat order, its lighter included); gone with its lighter
    this.augBombs = (this.augBombs ?? []).filter((bomb) => alive.some((p) => p.playerId === bomb.owner));
    for (const bomb of this.augBombs) {
      const at = alive.findIndex((p) => p.playerId === bomb.holder);
      const next = alive[(at + 1) % alive.length];
      const prev = bomb.holder;
      bomb.holder = next.playerId;
      this.tickerText(msg('炸弹传到了 {name} 手里', { name: next.name }), 1);
      this.teamFx('bomb', { from: at >= 0 ? prev : null, to: next.playerId, also: [bomb.owner], augment: 'aug_bomb' });
    }
    this._aug5Hook('roundStart');
    // 还手: a bot holding grudges collects (讨债) — after this round start's takes
    if (!this.isSolo) for (const ps of this.alivePlayers()) if (ps.isBot && ps.grudges) this._botRetaliate(ps);
  }

  /** 海克斯第五版: a batch hook on every batch that has it (errors reported, the flow goes on). */
  _aug5Hook(name, ...args) {
    for (const g of AUG5_MATCH) {
      if (typeof g[name] !== 'function') continue;
      try { g[name](this, ...args); } catch (e) { this.reportError(`augments5 ${name}`, e); }
    }
  }

  /**
   * 海克斯第五版: a team effect for the clients' team panels (m.teamFx; public/js/ui — the batch g4 draws them): `kind` (a
   * short id), `from` / `to` (player ids or null), `amount`, `item` / `chess` (ids), `augment` (the 海克斯 it comes from).
   * Every client gets it; the panel shows it in full to the players it concerns (from / to / `also`) and to the others
   * only as their setting allows (default: only what concerns them).
   * The convention: what moves goes `from` → `to` (blood, funds, an item, an operator, layers, the blame, the bomb, the
   * baton, a red packet); a moment of one player names it in `to` (from null, or the 海克斯's owner); a holder acting on
   * a teammate is `from`, the teammate `to`. Kinds: this file's vampire, sacrifice, bound, boundAvg, rob, blame, bomb,
   * bombDefuse, bombBoom, speaker, legacy; server/match/augments5/g4.js (its header) the rest.
   */
  teamFx(kind, data = {}) {
    const d = data && typeof data === 'object' ? data : {};
    this.broadcast({
      t: 'm.teamFx', kind: String(kind).slice(0, 24), round: this.round, from: d.from ?? null, to: d.to ?? null,
      also: Array.isArray(d.also) ? d.also.slice(0, 4) : null, amount: Number.isFinite(d.amount) ? d.amount : null,
      item: d.item ?? null, chess: d.chess ?? null, augment: d.augment ?? null,
    });
  }

  /**
   * Settlement, before the LP is charged (settle.js): 甩锅 moves pct % (rounded) of a holder's charge to the teammate with
   * the most LP. `charges`: playerId → LP charge, rewritten in place.
   */
  augmentCharges(charges) {
    const p = augmentDef('aug_blame').params;
    for (const ps of this.alivePlayers()) {
      if (!ps.augments.includes('aug_blame')) continue;
      const own = charges.get(ps.playerId) || 0;
      const moved = Math.min(own, Math.round((own * p.pct) / 100));
      const mate = this._mates(ps).sort((a, b) => b.lp - a.lp || a.seat - b.seat)[0];
      if (!(moved > 0) || !mate) continue;
      charges.set(ps.playerId, own - moved);
      charges.set(mate.playerId, (charges.get(mate.playerId) || 0) + moved);
      this.tickerText(msg('{a} 把锅甩给了 {b}（{n} 点目标生命）', { a: ps.name, b: mate.name, n: moved }), 1);
      this.teamFx('blame', { from: ps.playerId, to: mate.playerId, amount: moved, augment: 'aug_blame' });
      this.teamGrudge(mate, ps);
      this.teamShow(mate, 'blamed', moved);
    }
    this._aug5Hook('charges', charges);
  }

  /**
   * Settlement, after the LP is charged and before the eliminations: 定时炸弹 (its holder: a perfect round pays funds
   * next round, anything else costs LP), then 同生共死 (the two LPs averaged, rounded down). `perfect`: playerId → bool.
   */
  augmentAfterCharges(perfect) {
    const alive = this.alivePlayers();
    for (const bomb of this.augBombs ?? []) {
      const ps = alive.find((p) => p.playerId === bomb.holder);
      if (!ps) continue;
      const p = augmentDef('aug_bomb').params;
      if (perfect.get(ps.playerId)) {
        ps.pendingFunds += p.funds;
        ps.stats.fundsGained += p.funds;
        this.tickerText(msg('{name} 完美作战，拆掉了炸弹：下回合 +{n} 资金', { name: ps.name, n: p.funds }), 1);
        this.teamFx('bombDefuse', { from: bomb.owner, to: ps.playerId, amount: p.funds, augment: 'aug_bomb' });
        this.teamShow(ps, 'defuse');
      } else {
        ps.lp -= p.lp;
        ps.stats.lpLost += p.lp;
        this.tickerText(msg('炸弹在 {name} 手里炸了：目标生命 −{n}', { name: ps.name, n: p.lp }), 1);
        this.teamFx('bombBoom', { from: bomb.owner, to: ps.playerId, amount: p.lp, augment: 'aug_bomb' });
        this.teamShow(ps, 'boom');
      }
      ps.dirty();
    }
    for (const bond of this.augBonds ?? []) {
      const a = alive.find((p) => p.playerId === bond.a);
      const b = alive.find((p) => p.playerId === bond.b);
      if (!a || !b || a.lp === b.lp) continue;
      const avg = Math.floor((a.lp + b.lp) / 2);
      a.lp = avg;
      b.lp = avg;
      a.dirty();
      b.dirty();
      this.tickerText(msg('{a} 和 {b} 平分了目标生命', { a: a.name, b: b.name }), 1);
      this.teamFx('boundAvg', { from: a.playerId, to: b.playerId, amount: avg, augment: 'aug_bound' });
    }
    this._aug5Hook('afterCharges', perfect);
  }

  /** 遗产: what an eliminated holder leaves (taken before PlayerState.eliminate empties it), or null. */
  augmentLegacyOf(ps) {
    if (!ps.augments.includes('aug_legacy')) return null;
    let best = null;
    for (const p of ps.board.values()) {
      if (!p || p.kind !== 'chess') continue;
      if (!best || this.gd.tierOf(p.id) > this.gd.tierOf(best.id)) best = p;
    }
    return { funds: Math.max(0, ps.funds) + Math.max(0, ps.pendingFunds), base: best ? this.gd.baseIdOf(best.id) : null };
  }

  /** 遗产, after the elimination returned its copies: the teammates split the funds and each gains the operator. */
  augmentLegacy(ps, legacy) {
    if (!legacy) return;
    // (a teammate going out in the same settlement inherits nothing)
    const mates = this._mates(ps).filter((m) => m.lp > 0);
    if (!mates.length) return;
    const share = Math.floor(legacy.funds / mates.length);
    for (const m of mates) {
      if (share > 0) m.addFunds(share, { reason: 'augment:aug_legacy' });
      const got = legacy.base && this.pool.left(legacy.base) >= 1 ? m.acquireChess(legacy.base, { source: 'augment:aug_legacy' }) : null;
      m.recompute();
      this.teamFx('legacy', { from: ps.playerId, to: m.playerId, amount: share, chess: got ? legacy.base : null, augment: 'aug_legacy' });
    }
    this.tickerText(msg('{name} 留下了遗产', { name: ps.name }), 1);
  }

  /**
   * g.augAction { id } — a 海克斯 used by a click in the prep, once a round: 献祭 (LP for the teammates' damage this
   * round: the battle flags' `augSacrifice`), 命运轮盘 (1 LP for a spin), 熔炉 (two items into one of the next tier).
   */
  augmentAction(ps, id, target = null) {
    if (this.phase !== PHASE.PREP) return fail(ERR.WRONG_PHASE);
    if (!ps.alive) return fail(ERR.ELIMINATED);
    if (ps.ready || this.augmentLocked(ps)) return fail(ERR.WRONG_PHASE);
    // 还手 (2026-10-11): no 海克斯 of the player's — its grudges
    if (id === RV_DEBT || id === RV_TRIP) return this.teamRetaliate(ps, id, target);
    const def = augmentDef(id);
    if (!def || !def.action || !ps.augments.includes(id)) return fail(ERR.BAD_TARGET);
    if (ps.counters[`aug:act:${id}`] === this.round) return fail(ERR.ALREADY, 'once a round');
    const p = def.params;
    if (id === 'aug_sacrifice') {
      if (!(ps.lp > p.lp)) return fail(ERR.BAD_TARGET, 'not enough LP');
      ps.lp -= p.lp;
      ps.stats.lpLost += p.lp;
      if (!this.augSacrifice || this.augSacrifice.round !== this.round) this.augSacrifice = { round: this.round, pids: [] };
      this.augSacrifice.pids.push(ps.playerId);
      this.tickerText(msg('{name} 献祭了自己：本回合队友造成的伤害提升', { name: ps.name }), 1);
      this.teamFx('sacrifice', { from: ps.playerId, also: this._mates(ps).map((m) => m.playerId), amount: p.lp, augment: id });
      this.teamShow(ps, 'sacrifice');
    } else if (id === 'aug_wheel') {
      // the worst outcome (1 + lp) must leave the player alive
      if (!(ps.lp > 1 + p.lp)) return fail(ERR.BAD_TARGET, 'not enough LP');
      ps.lp -= 1;
      ps.stats.lpLost += 1;
      const lvl = Math.max(1, ps.shop.level);
      const roll = Math.floor(this.rngMeta() * 5);
      // (one whole msgid per outcome: a message param cannot be a message — shared/i18n.js cleanParam)
      let line = msg('{name} 转动了命运轮盘：什么也没有', { name: ps.name });
      if (roll === 0) {
        const itemId = this.rollItemId({ maxTier: lvl });
        const it = itemId ? ps.acquireItem(itemId, { source: 'augment:aug_wheel' }) : null;
        if (it) line = msg('{name} 转动了命运轮盘：获得装备 {item}', { name: ps.name, item: dn(this.gd.item(it.id)?.name || '') });
      } else if (roll === 1) {
        const chessId = this.pool.roll(this.rngMeta, { maxTier: lvl, extra: ps.diyRollEntries() });
        const c = chessId ? ps.acquireChess(chessId, { source: 'augment:aug_wheel' }) : null;
        if (c) line = msg('{name} 转动了命运轮盘：获得干员 {chess}', { name: ps.name, chess: dn(this.gd.chess(c.id)?.name || '') });
      } else if (roll === 2) {
        ps.addFunds(p.funds, { reason: 'augment:aug_wheel' });
        line = msg('{name} 转动了命运轮盘：获得 {n} 资金', { name: ps.name, n: p.funds });
      } else if (roll === 4) {
        ps.lp -= p.lp;
        ps.stats.lpLost += p.lp;
        line = msg('{name} 转动了命运轮盘：再扣 {n} 点目标生命', { name: ps.name, n: p.lp });
      }
      this.tickerText(line, 1);
    } else if (id === 'aug_forge') {
      // the lowest tier with two different normal items in the 整备区 (equipped ones stay out: move one off to keep it)
      const items = ps.hand.filter((x) => x && x.kind === 'item').map((x) => ({ x, rec: this.gd.item(x.id) }))
        .filter(({ rec }) => rec && rec.itemType === 'EQUIP' && !rec.isGolden && rec.tier < 6);
      items.sort((a, b) => a.rec.tier - b.rec.tier);
      let pair = null;
      for (const a of items) {
        const b = items.find((o) => o !== a && o.rec.tier === a.rec.tier && o.x.id !== a.x.id);
        if (b) { pair = [a, b]; break; }
      }
      if (!pair) return fail(ERR.BAD_TARGET, 'no two different items of a tier');
      const next = this.rollItemId({ tier: pair[0].rec.tier + 1 });
      if (!next) return fail(ERR.BAD_TARGET, 'no item of the next tier');
      for (const { x } of pair) { const l = ps.find(x.uid); if (l) ps._detach(l); }
      ps.acquireItem(next, { source: 'augment:aug_forge' });
      this.toast(ps, 'info', msg('熔炉：{a} + {b} → {c}', { a: dn(pair[0].rec.name), b: dn(pair[1].rec.name), c: dn(this.gd.item(next)?.name || '') }));
    } else {
      // 海克斯第五版: a batch's click action (target: a teammate's playerId or null)
      const g = AUG5_MATCH.find((x) => x.action && typeof x.action[id] === 'function');
      if (!g) return fail(ERR.BAD_TARGET);
      const r = g.action[id](this, ps, def, typeof target === 'string' ? target : null);
      if (r && r.error) return r;
    }
    ps.counters[`aug:act:${id}`] = this.round;
    ps.recompute();
    ps.dirty();
    this.markPrivate(ps);
    this.markPublic();
    return OK;
  }

  afterAugment() {
    if (this.gd.spRounds().includes(this.round)) this.enterSpDraft();
    else this.enterPrep();
  }

  /** m.public.aug (during the phase) */
  augmentPublicView() {
    const a = this.aug;
    if (this.phase !== PHASE.AUGMENT || !a) return null;
    const picked = {};
    for (const pid of Object.keys(a.offers)) picked[pid] = a.picks[pid] != null;
    return {
      round: a.round, tier: a.tier, untimed: !!a.untimed, picked,
      // + its tier, 首领专场, 逆反 (match/enemyVotes.js enemyVoteView)
      vote: a.vote ? this.enemyVoteView(a.vote) : null,
    };
  }

  /** m.private.aug (during the phase) */
  augmentPrivateView(ps) {
    const a = this.aug;
    if (this.phase !== PHASE.AUGMENT || !a || !a.offers[ps.playerId]) return null;
    return {
      canReroll: !!(a.rerolls?.[ps.playerId]>0 && a.picks[ps.playerId]==null), offers: a.offers[ps.playerId].slice(), picked: a.picks[ps.playerId] ?? null, rarity: a.rarity?.[ps.playerId] ?? null,
    };
  }
}
