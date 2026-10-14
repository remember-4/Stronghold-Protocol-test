import { reviseAugment } from '../hexRevision.js';
// shared/augments5/g2.js — A6000 fork, 海克斯第五版 (联动：站位、装备、技能、召唤、元素、领袖战、运营（M1–M10、N1–N6、Q1–Q4）): the definitions of this batch
// (_ops/stronghold-a6000/analysis/海克斯第五版候选-联动与节目效果.md). Built with augR (shared/augmentDef.js): rarity 1…6
// = 白 绿 蓝 紫 金 红. The effects: server/sim/content/augments5/g2.js (battle, prep) and server/match/augments5/g2.js
// (争分夺秒's overtime, 背水决战's overtime reading, 开门红's shop).

import { N_ } from '../i18n.js';
import { augR } from '../augmentDef.js';

export const DEFS = Object.freeze([
  // --- M. 站位、装备、技能、召唤、元素
  augR('aug_medic_field', 4, N_('医疗方阵'), N_('每名医疗干员使周围 8 格内的干员受到的伤害降低 {pct}%（同一干员至多叠 {max} 次）'), { pct: 10, max: 2 }, 'battle'),
  augR('aug_dual_wield', 4, N_('双持'), N_('携带 2 件装备的干员，两件装备的属性加成（攻击、防御、生命、攻速、法抗、技力回复、再部署时间等）提升至 {pct}%；特殊效果不变'),
    { pct: 130 }, 'battle'),
  augR('aug_fast_tempo', 4, N_('快节奏'), N_('所有技能的技力消耗 −{cost}%，持续时间 −{dur}%（弹药类技能的弹药数同样减少）'), { cost: 15, dur: 10 }, 'battle'),
  augR('aug_slow_craft', 3, N_('慢工细活'), N_('所有技能的持续时间 +{dur}%（弹药类技能的弹药数同样增加），技力消耗 +{cost}%'), { dur: 30, cost: 15 }, 'battle'),
  augR('aug_summon_horde', 3, N_('人海战术'), N_('召唤物造成的伤害提升至 {dealt}%，最大生命 +{hp}%；有召唤物的干员部署时技力 +{sp}'), { dealt: 125, hp: 25, sp: 3 }, 'battle'),
  augR('aug_rotation', 4, N_('轮换作战'), N_('你的干员每次再部署（被击倒、撤退、突袭跳跃后），本场作战所有干员造成的伤害提升 {pct}%（连乘，至多提升至 {cap}%）'),
    { pct: 2, cap: 130 }, 'battle'),
  augR('aug_elem_overload', 3, N_('元素过载'), N_('你造成的元素损伤提升至 {fill}%，元素爆发造成的伤害提升至 {burst}%'), { fill: 130, burst: 130 }, 'battle'),
  augR('aug_anti_air', 2, N_('对空专家'), N_('对空中敌人（飞行、近地悬浮）造成的伤害提升至 {pct}%'), { pct: 130 }, 'battle'),
  augR('aug_flare', 1, N_('照明弹'), N_('隐匿的敌人进入你任一干员的攻击范围时显形 {sec} 秒，可以被选中'), { sec: 5 }, 'battle'),
  augR('aug_diverse', 3, N_('多元组合'), N_('场上有 {n} 种以上不同职业的干员时，所有干员造成的伤害提升至 {dealt}%，受到的伤害降低 {taken}%'),
    { n: 6, dealt: 115, taken: 10 }, 'battle'),
  // --- N. 领袖战
  augR('aug_limit_break', 6, N_('破限'), N_('你对领袖的单次伤害达到 30 万（限伤）时不再整次作废，改为按 {cap} 点计算'), { cap: 150000 }, 'battle'),
  augR('aug_decapitate', 5, N_('斩首行动'), N_('最终攻势和隐秘核心中，你对领袖造成的伤害提升至 {boss}%，对其他敌人造成的伤害降至 {other}%'),
    { boss: 130, other: 80 }, 'battle'),
  augR('aug_last_battle', 3, N_('背水决战'), N_('最终攻势中，全队目标生命每减少 1 点，你的干员造成的伤害提升 {pct}%（连乘，至多提升至 {cap}%）'),
    { pct: 1, cap: 125 }, 'battle'),
  augR('aug_race_clock', 4, N_('争分夺秒'), N_('最终攻势的加时扣血推迟 {sec} 秒开始（同盟时全队生效）'), { sec: 10 }, 'meta'),
  augR('aug_mobilize', 2, N_('战前动员'), N_('最终攻势和隐秘核心开始时（该回合休整期结束时），所有已激活盟约的层数 +{pct}%（每个至多 +{max} 层）'),
    { pct: 10, max: 50 }, 'meta'),
  augR('aug_one_blow', 3, N_('一锤定音'), N_('最终攻势中，每名干员第一次开启的技能持续期间，其造成的伤害提升至 {pct}%'), { pct: 130 }, 'battle'),
  // --- Q. 运营
  augR('aug_war_fund', 2, N_('战备基金'), N_('回合开始时，若有 {n} 个以上不同的已激活盟约，获得 {funds} 资金'), { n: 4, funds: 1 }, 'meta'),
  augR('aug_headhunt', 2, N_('定向猎头'), N_('每回合首次主动刷新时，商店必定出现一名你主盟约（场上人数最多的核心盟约）中你还没有的干员（卡池还有时）'), {}, 'meta'),
  augR('aug_good_start', 1, N_('开门红'), N_('获得后的下一回合开始时，商店的干员格全部换成你场上人数最多的核心盟约的干员（一次；冻结保留的不换）'), {}, 'meta'),
  augR('aug_miser', 1, N_('守财奴'), N_('休整期结束时每剩 {per} 资金，所有干员攻击力 +{atk}%（整局累计，至多 +{max}%）'), { per: 3, atk: 1, max: 20 }, 'both'),
].map(reviseAugment));

/** Bot preference of this batch's augments (server/match/match/augments.js BOT_AUGMENT). */
export const BOT = Object.freeze({
  // the plain battle numbers a bot's board uses without a plan
  aug_fast_tempo: 6, aug_decapitate: 6, aug_rotation: 5, aug_one_blow: 5, aug_mobilize: 5, aug_race_clock: 5,
  // conditional on the board (medics, two items, six professions, flyers, summons, elements) or on the Final Assault
  aug_medic_field: 4, aug_dual_wield: 4, aug_slow_craft: 4, aug_diverse: 4, aug_anti_air: 4, aug_last_battle: 4, aug_limit_break: 4,
  aug_war_fund: 4, aug_headhunt: 4, aug_good_start: 4, aug_summon_horde: 3, aug_elem_overload: 3, aug_flare: 3, aug_miser: 3,
});
