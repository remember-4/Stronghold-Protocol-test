// shared/augments5/g1.js — A6000 fork, 海克斯第五版 (联动：层数、叠层手、精锐（J1–J7、K1–K5、L1–L4，O14 今日特供，O20 木桩大师）): the definitions of this batch
// (_ops/stronghold-a6000/analysis/海克斯第五版候选-联动与节目效果.md). Built with augR (shared/augmentDef.js): rarity 1…6
// = 白 绿 蓝 紫 金 红. The effects: server/sim/content/augments5/g1.js (battle, prep) and server/match/augments5/g1.js
// (韬光养晦's LP cap).

import { N_ } from '../i18n.js';
import { augR } from '../augmentDef.js';

export const DEFS = Object.freeze([
  // ---- J. 盟约深度：把层数变成伤害
  augR('aug_full_muster', 5, N_('满编之师'), N_('核心盟约达到最高档（6 人；阿戈尔 5 人；炎 6 人和 9 人都算）时，该盟约成员造成的伤害提升至 {dealt}%，受到的伤害降低 {taken}%'),
    { dealt: 125, taken: 15 }, 'battle'),
  augR('aug_layer_raise', 5, N_('层层加码'), N_('每个已激活盟约超过 {from} 层的部分每有 {per} 层，该盟约成员造成的伤害提升 {pct}%（连乘，每名干员至多提升至 {max}%）'),
    { from: 300, per: 100, pct: 4, max: 130 }, 'battle'),
  augR('aug_main_lead', 4, N_('主次相承'), N_('作战中，你层数最高的已激活盟约每有 {per} 层，其余已激活的附加盟约按多 {layer} 层计算（至多多 {max} 层；只影响战斗效果，不影响里程碑和隐秘核心的统计）'),
    { per: 100, layer: 15, max: 90 }, 'battle'),
  augR('aug_deep_focus', 4, N_('专精深耕'), N_('拿到时记下场上人数最多的盟约（核心盟约优先）；之后它获得的层数 +{pct}%（向下取整，每次至少 +1）'),
    { pct: 30 }, 'both'),
  augR('aug_milestone', 3, N_('盟约里程碑'), N_('之后任一盟约的层数每达到 {per} 的整数倍，获得 {funds} 资金（每个盟约至多 {max} 次）'),
    { per: 100, funds: 2, max: 5 }, 'meta'),
  augR('aug_twin_core', 4, N_('双核驱动'), N_('恰好有 2 个核心盟约达到 3 人档时：同时属于两者的干员造成的伤害提升至 {both}%，只属于其中一个的提升至 {one}%'),
    { both: 120, one: 108 }, 'battle'),
  augR('aug_layer_power', 5, N_('层数换算'), N_('最终攻势和隐秘核心中，你已激活盟约的层数总和每有 {per} 层，所有干员造成的伤害提升 {pct}%（连乘，至多提升至 {max}%）'),
    { per: 100, pct: 2.5, max: 130 }, 'battle'),
  // ---- K. 叠层手与中期
  augR('aug_war_feeds', 4, N_('以战养战'), N_('作战中，干员每因自己的特质叠一次层，自身造成的伤害提升 {pct}%（连乘，本场至多提升至 {max}%）'),
    { pct: 1.5, max: 125 }, 'battle'),
  augR('aug_low_profile', 2, N_('韬光养晦'), N_('第 {from}～{to} 回合，你每回合最多扣除 {cap} 点目标生命（之后失效）'),
    { from: 5, to: 9, cap: 5 }, 'meta'),
  augR('aug_late_bloom', 3, N_('先苦后甜'), N_('第 {round} 回合及以前，你的干员造成的伤害降低至 {early}%；之后提升至 {late}%（最终攻势和隐秘核心也算）'),
    { round: 8, early: 90, late: 130 }, 'battle'),
  augR('aug_dojo', 3, N_('练功房'), N_('普通回合的作战中，你的半场清空后出现一个木桩：不攻击、不移动、不会漏走、不算进完美作战，作战结束时消失；生命为本回合你半场敌人总生命的 {hp}%'),
    { hp: 25 }, 'battle'),
  augR('aug_elite_legacy', 2, N_('精锐传承'), N_('合成精锐时，精锐的已激活盟约各 +{layer} 层（每回合至多 {max} 次）'),
    { layer: 3, max: 3 }, 'meta'),
  // ---- L. 精锐与阶级
  augR('aug_golden_glow', 4, N_('金光闪闪'), N_('场上每有 1 名精锐干员，所有精锐干员造成的伤害提升 {pct}%（连乘，至多 {max} 名）'),
    { pct: 2.5, max: 8 }, 'battle'),
  augR('aug_double_reward', 5, N_('双倍奖励'), N_('合成精锐时额外获得一次晋升奖励（再从高一阶干员里免费挑 1 名）；每回合至多 {round} 次、每局至多 {max} 次'),
    { round: 1, max: 4 }, 'meta'),
  augR('aug_top_tier', 3, N_('终端火力'), N_('6 阶干员造成的伤害提升至 {dealt}%，受到的伤害降低 {taken}%；1～{lowTier} 阶干员造成的伤害降低至 {low}%'),
    { dealt: 125, taken: 10, lowTier: 3, low: 90 }, 'battle'),
  augR('aug_grassroots', 3, N_('草根逆袭'), N_('场上没有 {minTier} 阶及以上的干员时，所有干员造成的伤害提升至 {dealt}%，受到的伤害降低 {taken}%'),
    { minTier: 5, dealt: 120, taken: 15 }, 'battle'),
  // ---- O. 节目效果（单人）
  augR('aug_daily_special', 4, N_('今日特供'), N_('每回合开始时随机选一个已激活的盟约「特供」：本回合作战中，它的层数按 {pct}% 计算（只影响战斗效果）'),
    { pct: 150 }, 'both'),
  augR('aug_dummy_master', 1, N_('木桩大师'), N_('第 1～{maxRound} 回合的作战中，你的半场清空后出现一个木桩：不攻击、不移动、不会漏走、不算进完美作战，作战结束时消失；生命为本回合你半场敌人总生命的 {hp}%（持有练功房时不另出现）'),
    { maxRound: 8, hp: 12.5 }, 'battle'),
]);

/** Bot preference of this batch's augments (server/match/match/augments.js BOT_AUGMENT). */
export const BOT = Object.freeze({
  aug_full_muster: 6, aug_layer_raise: 5, aug_main_lead: 5, aug_deep_focus: 5, aug_milestone: 4, aug_twin_core: 5,
  aug_layer_power: 6, aug_war_feeds: 5, aug_low_profile: 4, aug_late_bloom: 5, aug_dojo: 3, aug_elite_legacy: 4,
  aug_golden_glow: 5, aug_double_reward: 6, aug_top_tier: 5, aug_grassroots: 4,
  // 节目效果: a bot rarely takes them
  aug_daily_special: 2, aug_dummy_master: 1,
});
