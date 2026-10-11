// shared/augments5/g4.js — A6000 fork, 海克斯第五版 (同盟节目效果（P1–P20）): the definitions of this batch
// (_ops/stronghold-a6000/analysis/海克斯第五版候选-联动与节目效果.md, table P and the rules under it: 损人利己的底线, 记仇).
// Built with augR (shared/augmentDef.js): rarity 1…6 = 白 绿 蓝 紫 金 红. Every one is co-op only (`coop`); 加油 / 卖队友
// are used by a click in the prep with a teammate as the target (`action`, g.augAction { id, target }).
// The effects: the battle parts server/sim/content/augments5/g4.js, the team parts server/match/augments5/g4.js.

import { N_ } from '../i18n.js';
import { augR } from '../augmentDef.js';

const COOP = Object.freeze({ coop: true });
const CLICK = Object.freeze({ coop: true, action: true });

export const DEFS = Object.freeze([
  // --- P1–P10: the mixed ones
  augR('aug_soul_swap', 6, N_('灵魂交换'), N_('拿到时，和随机一名队友交换整备区的全部干员和装备'), {}, 'meta', COOP),
  augR('aug_team_spirit', 3, N_('团队精神'), N_('全队本回合都完美作战时，全队每人获得 {funds} 资金（下回合发放），所有已激活的盟约 +{layer} 层'),
    { funds: 1, layer: 2 }, 'meta', COOP),
  augR('aug_bet', 1, N_('打赌'), N_('每回合开始时和随机一名队友打赌：本回合漏怪少的人拿走对方 {funds} 资金（下回合开始时结算，平局不动）'),
    { funds: 1 }, 'meta', COOP),
  augR('aug_cover_me', 3, N_('我来兜底'), N_('参加联防时，你击倒的敌人每个使你下回合获得 1 资金（每回合至多 {max}），你的干员在联防中造成的伤害提升至 {pct}%'),
    { max: 3, pct: 115 }, 'both', COOP),
  augR('aug_kill_steal', 2, N_('抢人头'), N_('最终攻势中，同一战场的你和队友谁对领袖造成的伤害高，谁的干员造成的伤害提升至 {pct}%（每 {sec} 秒重算）'),
    { pct: 110, sec: 10 }, 'battle', COOP),
  augR('aug_collective', 1, N_('连坐'), N_('队友漏怪被扣目标生命时，你也扣同样的点数（不会扣到 {floor} 点以下），但下回合获得 {funds} 资金（每回合一次）'),
    { floor: 6, funds: 3 }, 'meta', COOP),
  augR('aug_red_packet', 3, N_('红包'), N_('每 {every} 回合开始时，你付 {cost} 资金发红包，存活的队友拼手气分 {pot} 资金（每人至少 1）；你的资金不足时不发'),
    { every: 2, cost: 2, pot: 4 }, 'meta', COOP),
  augR('aug_cheer', 3, N_('加油'), N_('每回合 1 次，休整期点击此海克斯并选择一名队友为他加油：他本回合造成的伤害提升至 {pct}%；他完美作战时你们各获得 {funds} 资金（下回合发放）'),
    { pct: 110, funds: 1 }, 'both', CLICK),
  augR('aug_megaphone', 1, N_('传声筒'), N_('你发的表情会大号显示在所有队友的战场上方'), {}, 'meta', COOP),
  augR('aug_baton', 3, N_('接力棒'), N_('一根接力棒在全队传递，从你开始：持棒的人本回合造成的伤害提升至 {pct}%；他完美作战时获得 {funds} 资金（下回合发放）并把棒传给下一名玩家，否则留在手里'),
    { pct: 115, funds: 1 }, 'both', COOP),
  // --- P11–P20: 损人利己 (the user, 2026-10-10). The floor of them all: no teammate's LP below 6, no funds below 0, a cap
  // on each, never an eliminated player; whoever loses something to one holds a grudge (记仇) against its holder
  augR('aug_sell_out', 4, N_('卖队友'), N_('每回合 1 次（每局至多 {max} 次），休整期点击此海克斯并选择一名队友把他卖了：他扣 {lp} 点目标生命，你获得 {funds} 资金（他只剩 {floor} 点及以下时不能卖）'),
    { max: 4, lp: 1, funds: 2, floor: 6 }, 'meta', CLICK),
  augR('aug_absorb', 3, N_('吸星大法'), N_('每回合开始时，从一名随机队友层数最高的已激活盟约吸走 {layer} 层，加到你层数最高的已激活盟约（那个盟约少于 {min} 层时不吸；每局至多 {max} 次）'),
    { layer: 5, min: 30, max: 8 }, 'meta', COOP),
  augR('aug_pickpocket', 1, N_('顺手牵羊'), N_('每 {every} 回合开始时，从一名随机队友的整备区拿走 1 件装备；他没有装备时拿走 {funds} 资金'),
    { every: 2, funds: 1 }, 'meta', COOP),
  augR('aug_snipe', 4, N_('截胡'), N_('队友买下一名你能凑成精锐的干员（你已有 2 名同名普通干员）时，这名干员改为给你，他的资金退回（每 {every} 回合至多 1 次）'),
    { every: 2 }, 'meta', COOP),
  augR('aug_extort', 2, N_('碰瓷'), N_('你某回合扣了目标生命时，一名随机的本回合完美作战的队友赔你 {funds} 资金（下回合开始时结算，他资金不够就赔光；每局至多 {max} 次）'),
    { funds: 2, max: 5 }, 'meta', COOP),
  augR('aug_protection', 1, N_('收保护费'), N_('每 {every} 回合开始时，资金比你多的每名队友交给你 {funds} 资金'), { every: 3, funds: 1 }, 'meta', COOP),
  augR('aug_life_swap', 6, N_('偷命'), N_('拿到时，若你不是目标生命最高的人，和目标生命最高的队友交换目标生命（他不会因此低于 {floor} 点）'),
    { floor: 6 }, 'meta', COOP),
  augR('aug_possess', 6, N_('夺舍'), N_('拿到时，从目标生命最高的队友场上拿走他阶级最高的普通干员（同阶取攻击最高；其装备退回他的整备区），他的整备区补一名同阶的随机干员'),
    {}, 'meta', COOP),
  augR('aug_mole', 5, N_('内鬼'), N_('最终攻势和隐秘核心中，你的干员造成的伤害提升至 {dealt}%，同一战场队友的干员受到的伤害提升 {taken}%'),
    { dealt: 125, taken: 10 }, 'battle', COOP),
  augR('aug_steal_credit', 1, N_('抢功'), N_('联防和最终攻势中，同一战场队友击倒悬赏敌人所得的资金改为归你（每回合至多 {max} 资金）'),
    { max: 2 }, 'meta', COOP),
]);

/**
 * Bot preference of this batch's augments (server/match/match/augments.js BOT_AUGMENT): all the lowest — a bot never takes
 * one when anything else is offered (the analysis: 「人机基本不拿这类」, so a bot never picks on the humans), and never
 * clicks 加油 / 卖队友.
 */
export const BOT = Object.freeze(Object.fromEntries(DEFS.map((d) => [d.id, 1])));
