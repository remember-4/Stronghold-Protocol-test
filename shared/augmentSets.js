// shared/augmentSets.js — A6000 fork, 海克斯第六版: the 套装 (ARAM: Mayhem's augment sets; the user's call of 2026-10-10
// 「大幅扩展一下我们海克斯的数量，你可以从别的游戏或者网上找找灵感」, the analysis 海克斯第六版-大扩充.md 1.1).
// A generic augment belongs to at most one set; holding 2 / 3+ members of a set turns its bonus on. Each set's bonus is a
// pseudo augment `aug_set_<set>` (SET_DEFS: never offered, not in a player's `augments`): the match keeps an EffectRef
// with key 'augment:aug_set_<set>' and params { n: 2 | 3 } while the player holds 2+ members (server/match/match/
// augments.js syncAugmentSets), so the battle install and the prep META of the batch that implements the bonuses read it
// like any augment. Offers lean to the sets a player started (rollAugments: SET_BIAS).

import { N_ } from './i18n.js';
import { augR } from './augmentDef.js';

/** Percent: per set the player holds a member of, the chance that an offer swaps a generic card for a member of it. */
export const SET_BIAS = 40;

/**
 * The sets: id, name, the member augment ids (older and newer; an id not defined yet is ignored), and the bonus text by
 * count (2, 3+). `coop`: the members are co-op only.
 */
export const AUGMENT_SETS = Object.freeze([
  {
    id: 'wealth', name: N_('生财'),
    members: [
      'aug_savings', 'aug_adversity', 'aug_piggy', 'aug_loot', 'aug_bonus', 'aug_greed', 'aug_milestone', 'aug_war_fund', 'aug_miser',
      'aug_lucky_cat', 'aug_advance', 'aug_gold_pig', 'aug_wealth', 'aug_vault', 'aug_capsule', 'aug_level_gift', 'aug_roll_tickets',
      'aug_sale', 'aug_ectoplasm', 'aug_bounty_hunter', 'aug_whip', 'aug_q_spender', 'aug_q_roller', 'aug_q_recruiter', 'aug_chaos_wealth',
    ],
  },
  {
    id: 'stack', name: N_('叠层'),
    members: [
      'aug_spark', 'aug_backbone', 'aug_study', 'aug_momentum', 'aug_dual', 'aug_minor', 'aug_insurance', 'aug_resonance', 'aug_main_lead',
      'aug_deep_focus', 'aug_layer_raise', 'aug_war_feeds', 'aug_elite_legacy', 'aug_mobilize', 'aug_verticality', 'aug_q_summit',
      'aug_q_bloom', 'aug_stack_maniac',
    ],
  },
  {
    id: 'gamble', name: N_('赌徒'),
    members: [
      'aug_gamble', 'aug_wheel', 'aug_chosen', 'aug_roulette', 'aug_fate_dice', 'aug_lottery', 'aug_double_or_nothing', 'aug_amplify',
      'aug_mystery1', 'aug_mystery3', 'aug_mystery5', 'aug_mystery6', 'aug_alchemy', 'aug_lucky_star', 'aug_dice_master', 'aug_lucky_roll',
      'aug_banana', 'aug_misprint', 'aug_star_of_day', 'aug_stray', 'aug_golden_egg', 'aug_hexagram', 'aug_gacha', 'aug_call_chaos',
    ],
  },
  {
    id: 'guard', name: N_('铁壁'),
    members: [
      'aug_tough', 'aug_armor', 'aug_shield', 'aug_guardian', 'aug_triangle', 'aug_vanguard', 'aug_stoploss', 'aug_undying',
      'aug_low_profile', 'aug_medic_field', 'aug_taunt_master', 'aug_comeback', 'aug_mirror', 'aug_wall_eye', 'aug_veteran',
      'aug_twin_wall', 'aug_last_line', 'aug_frozen_heart', 'aug_tank_engine', 'aug_q_perfect',
    ],
  },
  {
    id: 'swift', name: N_('疾风'),
    members: [
      'aug_redeploy', 'aug_second_wind', 'aug_haste', 'aug_surge', 'aug_skill_echo', 'aug_drill', 'aug_first_strike', 'aug_fast_tempo',
      'aug_rotation', 'aug_budget', 'aug_opening', 'aug_frenzy', 'aug_war_machine', 'aug_urf', 'aug_lightning_rod', 'aug_practice',
      'aug_echo_sp', 'aug_charge', 'aug_opener_sp', 'aug_chaos_speed',
    ],
  },
  {
    id: 'behead', name: N_('斩首'),
    members: [
      'aug_limit_break', 'aug_decapitate', 'aug_layer_power', 'aug_last_battle', 'aug_race_clock', 'aug_one_blow', 'aug_sneak_attack',
      'aug_executioner', 'aug_giant_slayer',
    ],
  },
  {
    id: 'villain', name: N_('坏人'), coop: true,
    members: [
      'aug_rob', 'aug_vampire', 'aug_blame', 'aug_sell_out', 'aug_absorb', 'aug_pickpocket', 'aug_snipe', 'aug_extort', 'aug_protection',
      'aug_life_swap', 'aug_possess', 'aug_mole', 'aug_steal_credit', 'aug_snatch', 'aug_borrow', 'aug_cuckoo', 'aug_kickback',
      'aug_scheme', 'aug_equalize', 'aug_split_bill', 'aug_usurp', 'aug_borrow_knife', 'aug_double_agent',
    ],
  },
].map((s) => Object.freeze({ ...s, members: Object.freeze(s.members.slice()) })));

/** The pseudo augment id carrying a set's bonus. */
export const setAugmentId = (setId) => `aug_set_${setId}`;

/**
 * The set bonuses as pseudo definitions (rarity 1, `pseudo: true`, `set`): never offered, never in `ps.augments`; the
 * match keeps their EffectRef with params.n = 2 or 3 (3 for 3+). The effects: the batch that implements the sets.
 */
export const SET_DEFS = Object.freeze([
  augR(setAugmentId('wealth'), 1, N_('〔生财〕'), N_('套装 {n} 件。2 件：每回合开始时 +1 资金；3 件：改为 +2 资金，且每回合第一次主动刷新免费'), { n: 2, funds2: 1, funds3: 2 }, 'meta', { pseudo: true, set: 'wealth' }),
  augR(setAugmentId('stack'), 1, N_('〔叠层〕'), N_('套装 {n} 件。2 件：休整期结束时，你层数最高的已激活盟约 +3 层；3 件：改为 +6 层，其余已激活盟约各 +2 层'), { n: 2, top2: 3, top3: 6, rest3: 2 }, 'meta', { pseudo: true, set: 'stack' }),
  augR(setAugmentId('gamble'), 1, N_('〔赌徒〕'), N_('套装 {n} 件。2 件：幸运 ×1.25；3 件：幸运 ×1.5（好结果的概率乘以幸运，坏结果的概率除以幸运）'), { n: 2, luck2: 1.25, luck3: 1.5 }, 'both', { pseudo: true, set: 'gamble' }),
  augR(setAugmentId('guard'), 1, N_('〔铁壁〕'), N_('套装 {n} 件。2 件：所有干员受到的伤害 −6%；3 件：改为 −12%，且每回合最多扣除的目标生命 −1'), { n: 2, taken2: 6, taken3: 12, lp3: 1 }, 'both', { pseudo: true, set: 'guard' }),
  augR(setAugmentId('swift'), 1, N_('〔疾风〕'), N_('套装 {n} 件。2 件：技力回复速度 +8%；3 件：改为 +15%，且攻击间隔 −6%'), { n: 2, sp2: 8, sp3: 15, interval3: 6 }, 'battle', { pseudo: true, set: 'swift' }),
  augR(setAugmentId('behead'), 1, N_('〔斩首〕'), N_('套装 {n} 件。2 件：最终攻势和隐秘核心中，对领袖造成的伤害 ×1.08；3 件：改为 ×1.18'), { n: 2, boss2: 108, boss3: 118 }, 'battle', { pseudo: true, set: 'behead' }),
  augR(setAugmentId('villain'), 1, N_('〔坏人〕'), N_('套装 {n} 件。2 件：你的损人利己海克斯每拿到一次东西，额外 +1 资金（每回合至多 1）；3 件：记仇对你失效'), { n: 2, funds2: 1 }, 'meta', { pseudo: true, set: 'villain', coop: true }),
]);

const SET_OF = new Map();
for (const s of AUGMENT_SETS) for (const id of s.members) if (!SET_OF.has(id)) SET_OF.set(id, s.id);
const SET_BY_ID = new Map(AUGMENT_SETS.map((s) => [s.id, s]));

/** The set id of augment `id` (null when it belongs to none). */
export const setOf = (id) => SET_OF.get(id) ?? null;

/** The set record (id, name, members, coop) of `setId`. */
export const augmentSet = (setId) => SET_BY_ID.get(setId) ?? null;

/** Members held per set: Map setId → count, for a list of augment ids (a player's `augments`). */
export function setCounts(ids) {
  const out = new Map();
  for (const id of ids || []) {
    const s = SET_OF.get(id);
    if (s) out.set(s, (out.get(s) || 0) + 1);
  }
  return out;
}

/** The bonus level a count turns on: 0 (under 2), 2, or 3 (3 and more). */
export const setLevel = (count) => (count >= 3 ? 3 : count >= 2 ? 2 : 0);
