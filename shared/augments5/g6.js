// shared/augments5/g6.js — A6000 fork, 海克斯第六版 (运营：资金、商店、调度中心（B1–B19）): the definitions of this batch
// (_ops/stronghold-a6000/analysis/海克斯第六版-大扩充.md: rarities, numbers, sets and ids). Built with augR
// (shared/augmentDef.js): rarity 1…6 = 白 绿 蓝 紫 金 红. The effects: server/sim/content/augments5/g6.js (prep handlers,
// battle installs) and server/match/augments5/g6.js (the match-side hooks and the engine's shop / funds checks).

import { N_ } from '../i18n.js';
import { augR } from '../augmentDef.js';

/**
 * B1–B19. Their sets (shared/augmentSets.js) are listed there already: 〔生财〕 金猪 理财 金库 时间胶囊 升级福利 刷新券 打折季
 * 灵质 赏金猎人, 〔赌徒〕 骰子大师 幸运刷新, 〔疾风〕 充足预算. 金猪 is used by a click in the prep (`action`); 金库 is never
 * offered to a strategy that keeps its leftover funds anyway (`noLeftover`, as 储蓄).
 */
export const DEFS = Object.freeze([
  augR('aug_gold_pig', 2, N_('金猪'), N_('一只金猪：拿到时装着 {start} 资金，之后每回合开始时长 {grow}；任意休整期点击此海克斯把它砸开，取出全部资金（每局一次，砸开后这张失效）'),
    { start: 3, grow: 2 }, 'meta', { action: true }),
  augR('aug_wealth', 3, N_('理财'), N_('休整期结束时，剩余资金存进理财账户（每回合至多 {max}）；存满 {rounds} 个回合后，下一回合开始时连本带利取出：本金 ×{mul}（向下取整），然后重新开始存'),
    { max: 6, rounds: 4, mul: 1.5 }, 'meta'),
  augR('aug_vault', 3, N_('金库'), N_('休整期结束时，剩余资金全部留到下回合（至多 {max}）'), { max: 8 }, 'meta', { noLeftover: true }),
  augR('aug_capsule', 1, N_('时间胶囊'), N_('拿到时封存 {funds} 资金（不够就封存全部），第 {round} 回合开始时取出封存额的 {mul} 倍'),
    { funds: 5, round: 12, mul: 3 }, 'meta'),
  augR('aug_dice_master', 2, N_('骰子大师'), N_('每回合开始时掷一次骰子：1、2 点获得 {low} 资金，3～5 点获得 {mid}，6 点获得 {high}'),
    { low: 1, mid: 2, high: 3 }, 'meta'),
  augR('aug_innkeeper', 3, N_('店长推荐'), N_('每回合第一次主动刷新后，商店最右一个干员格换成一名比调度中心等级高一阶的干员（至多 6 阶，价格照常）'), {}, 'meta'),
  augR('aug_boutique', 2, N_('精品店'), N_('调度中心 {level} 级起，商店不再出现 1 阶干员；拿到时获得 {funds} 资金'), { level: 3, funds: 2 }, 'meta'),
  augR('aug_mall', 5, N_('大卖场'), N_('调度中心的干员栏位 +{n}'), { n: 1 }, 'meta'),
  augR('aug_retreat', 4, N_('闭关修炼'), N_('拿到后的 {rounds} 个回合（含拿到的这一回合）不能购买干员、不能刷新商店（升级调度中心、摆阵、配装备照常）；之后的回合开始时免费升级调度中心 {levels} 次（超出满级的部分改为每级 {funds} 资金）'),
    { rounds: 2, levels: 2, funds: 6 }, 'meta'),
  augR('aug_skip_grade', 4, N_('跳级'), N_('立即免费升级一次调度中心（已满级改为获得 {funds} 资金）'), { funds: 8 }, 'meta'),
  augR('aug_level_gift', 2, N_('升级福利'), N_('每次升级调度中心，获得与新等级相同次数的免费刷新（存着，跨回合可用）'), {}, 'meta'),
  augR('aug_lucky_roll', 2, N_('幸运刷新'), N_('每次主动刷新有 {pct}% 概率不花资金'), { pct: 25 }, 'meta'),
  augR('aug_roll_tickets', 1, N_('刷新券'), N_('立即获得 {n} 次免费刷新（存着，跨回合可用）'), { n: 8 }, 'meta'),
  augR('aug_sale', 4, N_('打折季'), N_('干员的价格 −{n}（最低 {min}；每回合至多 {max} 名），但每回合收入 −{income}'), { n: 1, min: 1, max: 4, income: 1 }, 'meta'),
  augR('aug_ectoplasm', 5, N_('灵质'), N_('每回合收入 +{income}，但不再从其他途径获得资金：悬赏、盟约、装备、策略、其他海克斯和套装给的都作废（出售干员照常）'),
    { income: 4 }, 'meta'),
  augR('aug_ascetic', 5, N_('苦修'), N_('所有干员造成的伤害提升至 {pct}%，但不能再刷新商店（免费刷新也不行）'), { pct: 130 }, 'both'),
  augR('aug_reserve_dp', 1, N_('预备费'), N_('休整期结束时每剩 {per} 资金，本回合作战的初始部署费用 +1（至多 +{max}）'), { per: 2, max: 10 }, 'both'),
  augR('aug_budget', 2, N_('充足预算'), N_('作战开始时部署费用 +{dp}，部署费用回复速度 +{pct}%'), { dp: 6, pct: 10 }, 'battle'),
  augR('aug_bounty_hunter', 2, N_('赏金猎人'), N_('每场普通作战，你的战场额外出现 1 名悬赏敌人（生命为本回合普通敌人平均值的 {mul} 倍），击倒得 {funds} 资金（下回合发放）'),
    { mul: 4, funds: 2 }, 'meta'),
]);

/**
 * Bot preference of this batch's augments (server/match/match/augments.js BOT_AUGMENT): the steady economy ones a bot
 * uses without a plan mid-table (零钱罐 4, 升级补贴 4, 储蓄 3), 苦修's plain ×1.3 higher (its bot still buys what shows),
 * the ones a bot cannot play low — 金猪 (a bot never clicks: it would never break it), 闭关修炼 (two rounds without
 * purchases), 预备费 (a bot spends everything), 灵质 (it voids what a bot's other picks pay).
 */
export const BOT = Object.freeze({
  aug_gold_pig: 1, aug_wealth: 3, aug_vault: 3, aug_capsule: 2, aug_dice_master: 3, aug_innkeeper: 4, aug_boutique: 3, aug_mall: 5,
  aug_retreat: 2, aug_skip_grade: 4, aug_level_gift: 3, aug_lucky_roll: 3, aug_roll_tickets: 3, aug_sale: 4, aug_ectoplasm: 3,
  aug_ascetic: 5, aug_reserve_dp: 2, aug_budget: 4, aug_bounty_hunter: 3,
});
