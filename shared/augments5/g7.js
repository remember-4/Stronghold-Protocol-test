// shared/augments5/g7.js — A6000 fork, 海克斯第六版 (招募、精锐与装备（C1–C21）): the definitions of this batch
// (_ops/stronghold-a6000/analysis/海克斯第六版-大扩充.md: rarities, numbers, sets and ids). Built with augR
// (shared/augmentDef.js): rarity 1…6 = 白 绿 蓝 紫 金 红. The effects: server/sim/content/augments5/g7.js (博物馆 in battle,
// the gains and offers of the prep), server/match/augments5/g7.js (克隆大作战, 双子合成's catch-up merges, 回收站's click)
// and the engine: 双子合成's merge count (server/match/player/acquire.js mergeNeed, bot.js), 晋升跳级's reward tier
// (acquire.js pushRewardOffer).

import { N_ } from '../i18n.js';
import { augR } from '../augmentDef.js';

export const DEFS = Object.freeze([
  // C1 双子合成: the holder's normal chess of tier ≤ maxTier merge at n copies (风丸's 2 stays)
  augR('aug_twin_merge', 6, N_('双子合成'), N_('1～{maxTier} 阶干员只需 {n} 名同名即可合成精锐'), { maxTier: 3, n: 2 }, 'meta'),
  // C2 精锐速递
  augR('aug_golden_express', 6, N_('精锐速递'), N_('立即获得 1 个<博士投影>，之后每 {every} 回合 1 个'), { every: 3 }, 'meta'),
  // C3 克隆大作战 (the copy: one more normal copy from the pool)
  augR('aug_clone', 5, N_('克隆大作战'), N_('每 {every} 回合开始时，获得你场上阶级最高的一名普通干员的复制（同阶取攻击最高；至多 {maxTier} 阶；卡池没有就不给）'),
    { every: 2, maxTier: 5 }, 'meta'),
  // C4 晋升跳级 (the data's reward is 1 tier above the dispatch level)
  augR('aug_leapfrog', 4, N_('晋升跳级'), N_('晋升奖励（合成精锐后的免费招募）改为高 {up} 阶的干员（至多 6 阶）'), { up: 2 }, 'meta'),
  // C5 复制许可
  augR('aug_mimic', 3, N_('复制许可'), N_('立即获得 {n} 个<拟态物质>'), { n: 2 }, 'meta'),
  // C6 军火商 (the shop's items: no special one)
  augR('aug_arms_dealer', 4, N_('军火商'), N_('立即从 {n} 件随机的 {minTier}～{maxTier} 阶装备（不含特殊装备）中免费选 1 件'), { n: 4, minTier: 5, maxTier: 6 }, 'meta'),
  // C7 突变
  augR('aug_mutation', 4, N_('突变'), N_('立即获得 1 个<突变细胞>（每场战斗后把装备者换成高一阶的随机干员，可以反复用）'), {}, 'meta'),
  // C8 天马座
  augR('aug_pegasus', 5, N_('天马座'), N_('立即获得<天马之盔>和<天马之枪>'), {}, 'meta'),
  // C9 人事调动
  augR('aug_hr', 5, N_('人事调动'), N_('立即获得 1 个<人事部文档>（部署上限变为 9）'), {}, 'meta'),
  // C10 维式全家桶 (items.json family 'hammer')
  augR('aug_hammer_box', 3, N_('维式全家桶'), N_('立即获得 1 把随机的特殊维式重锤（战栗、坚固、加速、灼燃之一）'), {}, 'meta'),
  // C11 夕的画卷
  augR('aug_scroll', 6, N_('夕的画卷'), N_('立即获得 1 个<画卷>（复制范围内 2 格的干员，含精锐和装备）和 {funds} 资金'), { funds: 4 }, 'meta'),
  // C12 群星
  augR('aug_stars', 6, N_('群星'), N_('拿到时和之后每 {every} 回合，从 {n} 名随机 6 阶干员中免费选 1 名'), { every: 3, n: 3 }, 'meta'),
  // C13 神谕
  augR('aug_oracle', 5, N_('神谕'), N_('每回合开始时，从 {n} 名随机的、属于你场上已有盟约的干员（至多比调度中心等级高 {up} 阶）中免费选 1 名'),
    { n: 3, up: 1 }, 'meta'),
  // C14 补货
  augR('aug_restock', 2, N_('补货'), N_('每回合开始时获得 1 名随机的、属于你场上已有盟约的 1～{maxTier} 阶干员（不高于调度中心等级）'), { maxTier: 3 }, 'meta'),
  // C15 快递
  augR('aug_delivery', 2, N_('快递'), N_('立即获得 {n} 名随机 1～{maxTier} 阶干员；{after} 回合后再获得 {later} 名随机 {laterTier} 阶干员'),
    { n: 3, maxTier: 2, after: 3, later: 2, laterTier: 3 }, 'meta'),
  // C16 猎头合同
  augR('aug_hunt_contract', 3, N_('猎头合同'), N_('拿到时和之后每 {every} 回合，从 {n} 名你人数最多的核心盟约中你还没有的干员里免费选 1 名（不高于调度中心等级）'),
    { every: 3, n: 3 }, 'meta'),
  // C17 回收站 (a click: the 整备区's leftmost equipment)
  augR('aug_recycle', 1, N_('回收站'), N_('每回合 1 次，休整期点击此海克斯发动：把整备区最左边的一件装备换成同阶的另一件随机装备（进阶装备换成进阶装备）'),
    {}, 'meta', { action: true }),
  // C18 装备补给箱
  augR('aug_crate', 1, N_('装备补给箱'), N_('立即获得 {n} 件随机 {minTier}～{maxTier} 阶装备'), { n: 2, minTier: 2, maxTier: 3 }, 'meta'),
  // C19 自动化工厂
  augR('aug_factory', 4, N_('自动化工厂'), N_('每 {every} 回合获得 1 件随机 {minTier}～{maxTier} 阶装备（至多比调度中心等级高 {up} 阶）'),
    { every: 2, minTier: 3, maxTier: 5, up: 1 }, 'meta'),
  // C20 博物馆
  augR('aug_museum', 3, N_('博物馆'), N_('作战中你的干员身上每有 1 件装备，所有干员造成的伤害提升 {pct}%（连乘，至多 {max} 件）'), { pct: 1, max: 16 }, 'battle'),
  // C21 教鞭 (〔生财〕)
  augR('aug_whip', 1, N_('教鞭'), N_('立即获得 1 个<教鞭>（选一项悬赏任务挑战）'), {}, 'meta'),
]);

/**
 * Bot preference of this batch's augments (server/match/match/augments.js BOT_AUGMENT): what grows a bot's board without a
 * plan (elites, tier-6 picks, a 9th deployment) scores high, single items mid-table, the click one (回收站: a bot never
 * clicks) lowest.
 */
export const BOT = Object.freeze({
  aug_twin_merge: 6, aug_golden_express: 6, aug_clone: 5, aug_leapfrog: 5, aug_mimic: 4, aug_arms_dealer: 5, aug_mutation: 4,
  aug_pegasus: 5, aug_hr: 6, aug_hammer_box: 4, aug_scroll: 5, aug_stars: 6, aug_oracle: 6, aug_restock: 4, aug_delivery: 4,
  aug_hunt_contract: 4, aug_recycle: 1, aug_crate: 3, aug_factory: 5, aug_museum: 4, aug_whip: 3,
});
