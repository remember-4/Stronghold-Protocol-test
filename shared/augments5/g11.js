// shared/augments5/g11.js — A6000 fork, 海克斯第六版 (规则级与同盟（H1–H7、I1–I14）): the definitions of this batch
// (_ops/stronghold-a6000/analysis/海克斯第六版-大扩充.md: rarities, numbers, sets and ids). Built with augR
// (shared/augmentDef.js): rarity 1…6 = 白 绿 蓝 紫 金 红. The effects: server/sim/content/augments5/g11.js (battle, prep)
// and server/match/augments5/g11.js (the match-side hooks: LP caps and charges, the round start, the clicks, the team
// parts, the votes). The 套装 membership is shared/augmentSets.js's (叠层狂魔 〔叠层〕; 卦象 / 限定寻访 / 混沌召唤 〔赌徒〕;
// the 损人利己 ones 〔坏人〕).

import { N_ } from '../i18n.js';
import { augR } from '../augmentDef.js';

const COOP = Object.freeze({ coop: true });

export const DEFS = Object.freeze([
  // --- H. 规则级
  // H1 诅咒王冠: the leaks' extra LP stays within the (raised) round cap
  augR('aug_cursed_crown', 6, N_('诅咒王冠'), N_('部署上限 +{deploy}；但每回合最多扣除的目标生命 +{cap}，而且每漏过一个敌人多扣 {leak} 点'),
    { deploy: 2, cap: 3, leak: 1 }, 'meta'),
  // H2 破格录用 (server/match/bondsMeta.js computeBonds)
  augR('aug_open_door', 6, N_('破格录用'), N_('附加盟约按多 {n} 人计算（场上至少有 1 名成员时；独行、绝技、调和、协防不算）'), { n: 1 }, 'meta'),
  // H3 叠层狂魔: a 特质's gain, in the prep and in battle
  augR('aug_stack_maniac', 6, N_('叠层狂魔'), N_('你通过特质获得的盟约层数 +{pct}%（向下取整，每次至少 +1）'), { pct: 50 }, 'both'),
  // H4 卦象: the round's trigram (each 1/8, no 幸运): 乾 坤 震 巽 离 in battle, 坎 艮 兑 on the match / prep side
  augR('aug_hexagram', 3, N_('卦象'), N_('每回合开始时抽一卦，本回合生效（八卦各 1/8）：乾，所有干员造成的伤害提升至 {dealt}%；坤，受到的伤害降低 {taken}%；震，开战时晕眩场上所有敌人 {stun} 秒；巽，攻击间隔缩短 {interval}%；坎，获得 {funds} 资金；离，攻击附带灼燃（每秒造成攻击者攻击力 {burn}% 的法术伤害，持续 {burnSec} 秒）；艮，本回合最多扣除 {lp} 点目标生命；兑，本回合前 {refresh} 次主动刷新免费'),
    { dealt: 125, taken: 25, stun: 2, interval: 20, funds: 3, burn: 20, burnSec: 3, lp: 3, refresh: 3 }, 'both'),
  // H5 限定寻访: a click; the tier odds take 幸运 (6 / 5 ×luck, the rest scaled down)
  augR('aug_gacha', 3, N_('限定寻访'), N_('每回合 1 次，休整期点击此海克斯发动：花 {cost} 资金寻访，随机获得 1 名干员（6 阶 {p6}%、5 阶 {p5}%、4 阶 {p4}%、3 阶 {p3}%、1～2 阶 {p12}%，不看调度中心等级）；连续 {miss} 次没出 6 阶时，下一次必出 6 阶'),
    { cost: 3, p6: 3, p5: 12, p4: 25, p3: 30, p12: 30, miss: 9 }, 'meta', { action: true }),
  // H6 血契
  augR('aug_blood_pact', 5, N_('血契'), N_('每回合开始时扣 {lp} 点目标生命（只剩 {floor} 点及以下时不扣）；所有干员造成的伤害提升至 {dealt}%'),
    { lp: 1, floor: 5, dealt: 140 }, 'battle'),
  // H7 混沌召唤: one of six at the pick (no 幸运)
  augR('aug_call_chaos', 6, N_('混沌召唤'), N_('拿到时随机获得一项（各 1/6）：{ops} 名随机 6 阶干员；{projectors} 个<博士投影>；{funds} 资金；{items} 件随机 6 阶装备；所有已激活盟约 +{layer} 层；部署上限 +{deploy}'),
    { ops: 3, projectors: 2, funds: 25, items: 3, layer: 40, deploy: 1, item: 'chess_item_5_06_e_a' }, 'meta'),

  // --- I. 同盟 (co-op only). The 损人利己 floor of the fifth version holds (no teammate's LP below 6, no funds below 0, a cap
  // on each, never an eliminated player); whoever a 〔坏人〕 one profits from holds a grudge against its holder (记仇)
  augR('aug_freeride', 3, N_('搭便车'), N_('拿到时随机绑定一名队友：他每合成一次精锐，你获得 {funds} 资金（每回合至多 {max}）'), { funds: 1, max: 2 }, 'meta', COOP),
  augR('aug_copycat', 4, N_('抄作业'), N_('每 {every} 回合开始时，获得随机一名队友场上一名随机普通干员的复制（不高于你的调度中心等级；卡池没有就不给）'),
    { every: 2 }, 'meta', COOP),
  augR('aug_snatch', 1, N_('抢购'), N_('每回合开始时你的商店多一格：随机一名队友商店里最贵的那名干员；你买下时它从他的商店消失（刷新商店后这一格消失）'), {}, 'meta', COOP),
  augR('aug_borrow_knife', 2, N_('借刀杀人'), N_('联防中，队友每击倒一个你漏的敌人，你下回合获得 {funds} 资金（每回合至多 {max}）'), { funds: 1, max: 3 }, 'meta', COOP),
  augR('aug_borrow', 4, N_('借来用用'), N_('每 {every} 回合开始时，借走随机一名队友的一个战斗类通用海克斯（白～紫）{rounds} 回合：期间他没有、你有；到期自动归还'),
    { every: 3, rounds: 2, maxRarity: 4 }, 'meta', COOP),
  augR('aug_double_agent', 1, N_('双面间谍'), N_('每回合开始时随机选一名队友当「目标」：他本回合扣了多少目标生命，你下回合获得多少资金（至多 {max}）'), { max: 3 }, 'meta', COOP),
  augR('aug_cuckoo', 5, N_('鸠占鹊巢'), N_('拿到时，和一名层数比你高的随机队友交换层数最高的已激活盟约的层数（只一次）'), {}, 'meta', COOP),
  augR('aug_contrarian', 1, N_('唱反调'), N_('敌人强化投票时，你投的那项落选，你获得 {funds} 资金'), { funds: 2 }, 'meta', COOP),
  augR('aug_kickback', 1, N_('吃回扣'), N_('队友每在调度中心买一件装备，你获得 {funds} 资金（每回合至多 {max}）'), { funds: 1, max: 2 }, 'meta', COOP),
  augR('aug_scheme', 3, N_('连环计'), N_('你的损人利己海克斯每拿到一次东西，所有干员造成的伤害提升 {pct}%（连乘，整局累计，至多提升至 {max}%）'),
    { pct: 1, max: 120 }, 'battle', COOP),
  augR('aug_tit_for_tat', 1, N_('以牙还牙'), N_('每当有人用损人利己的海克斯拿走你的东西，你从他那里拿 {funds} 资金（每回合至多 {max} 次）'), { funds: 1, max: 1 }, 'meta', COOP),
  augR('aug_equalize', 2, N_('均贫富'), N_('每回合开始时，全队的资金平均分配（向下取整，余数归你）'), {}, 'meta', COOP),
  augR('aug_split_bill', 2, N_('公摊'), N_('你升级调度中心时，每名队友替你付 {funds} 资金（他没钱就不付），这部分升级费立即退还给你'), { funds: 1 }, 'meta', COOP),
  augR('aug_usurp', 6, N_('篡位'), N_('拿到时成为「队长」：之后敌人强化投票只算你的一票；每回合开始时，每名队友交给你 {funds} 资金（不足 {funds} 不交）'),
    { funds: 1 }, 'meta', COOP),
]);

/**
 * Bot preference of this batch's augments (server/match/match/augments.js BOT_AUGMENT): the rule-level ones a board uses
 * without a plan mid-to-high (破格录用, 血契, 混沌召唤, 诅咒王冠's two deployments), the gamble low, the click one (限定寻访:
 * a bot never clicks) and every co-op one lowest — a bot never takes one when anything else is offered (the analysis:
 * 「人机基本不拿」, so a bot never picks on the humans).
 */
export const BOT = Object.freeze({
  aug_cursed_crown: 5, aug_open_door: 7, aug_stack_maniac: 5, aug_hexagram: 3, aug_gacha: 1, aug_blood_pact: 6, aug_call_chaos: 6,
  ...Object.fromEntries(DEFS.filter((d) => d.coop).map((d) => [d.id, 1])),
});
