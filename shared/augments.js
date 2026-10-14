import { reviseAugment, REMOVED_AUGMENTS, USER_AUGMENTS } from './hexRevision.js';
// shared/augments.js — A6000 fork: 海克斯 (the players' augments) and 敌人强化 (the enemies' upgrades), the user's design of
// 2026-10-09: on some rounds each player picks one of three augments for the rest of the match; on others every player
// votes on one of three upgrades that every enemy of the match takes from then on. Imported by the server (the AUGMENT
// phase: server/match/match/augments.js; the prep effects: server/match/augmentsMeta.js), the sim (the battle effects:
// server/sim/content/augments.js — no Node API here) and the client (the overlay, the HUD).
//
// Every definition is data: `name` / `desc` are msgids (N_) with {param} placeholders filled from `params`; the server
// sends ids only. Generic effects for now; per-profession augments come later (the user's plan).
//
// Schedule (round → what happens at its start, before the 机变 draft / the prep phase; the 机变 rounds are 3/6/9/11):
//   AUGMENT_ROUNDS  every round 1–13 (the user, 2026-10-10 evening: 「海克斯每回合一次，然后敌人频率也变高」; before that every
//                   second round 2 4 6 8 10, the call of 2026-10-09; first 2 / 5 / 8); no reroll. The vote rounds share the
//                   phase with the pick. The value is the round's band (1–5 → 1, 6–9 → 2, 10–13 → 3: the forced cards of the
//                   balance runs). 专属强化 keep their rounds (EXCLUSIVE_ROUNDS: I on 2 / 4, II on 6 / 10, III on 8).
//   rarity          (the user, 2026-10-10: six rarities 白 绿 蓝 紫 金 红, the odds left to me) each player rolls one per
//                   pick from AUGMENT_RARITY_ODDS (rollRarity; a pity at RARITY_PITY_ROUND); the generic cards are of it,
//                   职业专精 of its band. Older generic augments map 白银 → 白 / 绿, 黄金 → 蓝 / 紫, 彩色 → 金 / 红
//                   (GENERIC_RARITY); 专属强化 show their table's 品质 (白 / 金 / 彩 → 白 / 金 / 红), 职业专精 绿 / 紫 / 金.
//   VOTE_ROUNDS     2, 4, 6, 8, 10, 12, 13 → an enemy upgrade vote (three options; ties broken by the match's seeded rng;
//                   13: the 首领专场)

import { N_ } from './i18n.js';
import { aug, CLS, bandOf, RARITY_NAME, RARITIES } from './augmentDef.js';
// 海克斯第五版 (the user, 2026-10-10: 「多做一些海克斯」): the batches, each its own module
import * as AUG5_G1 from './augments5/g1.js';
import * as AUG5_G2 from './augments5/g2.js';
import * as AUG5_G3 from './augments5/g3.js';
import * as AUG5_G4 from './augments5/g4.js';
// 海克斯第六版 (the user, 2026-10-10: 「大幅扩展一下我们海克斯的数量，你可以从别的游戏或者网上找找灵感」): seven more batches,
// the 套装 (shared/augmentSets.js) and 幸运 (shared/luck.js)
import * as AUG5_G5 from './augments5/g5.js';
import * as AUG5_G6 from './augments5/g6.js';
import * as AUG5_G7 from './augments5/g7.js';
import * as AUG5_G8 from './augments5/g8.js';
import * as AUG5_G9 from './augments5/g9.js';
import * as AUG5_G10 from './augments5/g10.js';
import * as AUG5_G11 from './augments5/g11.js';
import { SET_DEFS, SET_BIAS, setCounts, setOf } from './augmentSets.js';
// 敌人强化 (the enemies' upgrades): shared/enemyBuffs.js — re-exported here for the callers of before the split
export {
  VOTE_ROUNDS, VOTE_OPTIONS, VOTE_SECONDS, LEADER_SHARE, ENEMY_BUFFS, enemyBuffDef, isVoteRound, rollVoteOptions, tallyVote, enemyBuffCounts,
} from './enemyBuffs.js';

export const AUGMENT_ROUNDS = Object.freeze({ 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 2, 7: 2, 8: 2, 9: 2, 10: 3, 11: 3, 12: 3, 13: 3 });
/** 专属强化's rounds (the user's table: I on 2 / 4, II on 6 / 10, III on 8) → the tier of the strategy's card offered there. */
export const EXCLUSIVE_ROUNDS = Object.freeze({ 2: 1, 4: 1, 6: 2, 8: 3, 10: 2 });
export const AUGMENT_OFFERS = 3;
/** Seconds of a timed pick / vote (solo and single-human matches are untimed, as the 机变 draft). */
export const AUGMENT_SECONDS = 30;

export const TIER_NAME = Object.freeze({ 1: N_('白银'), 2: N_('黄金'), 3: N_('彩色') });

export { RARITY_NAME, RARITIES, bandOf };
/**
 * Augments. `side`: 'battle' (a battle effect: server/sim/content/augments.js), 'meta' (prep only:
 * server/match/augmentsMeta.js), 'both'.
 */
const BASE_AUGMENTS = [
  // The generic ones: the user's list of 2026-10-09 (third version, _ops/stronghold-a6000/analysis §七). Number bonuses are
  // independent multipliers — 造成的伤害提升至 / 受到的伤害降低 / 攻击间隔缩短 — never the additive ATK % / ASPD the bonds
  // dilute (the user: 「如果不是那其实没什么用 会被稀释的很厉害」). `coop`: offered in co-op matches only; `action`: used by a
  // click in the prep (g.augAction — server/match/match/augments.js augmentAction).
  // --- 白银
  aug('aug_tough', 1, N_('坚韧'), N_('所有干员受到的伤害降低 {pct}%'), { pct: 15 }, 'battle'),
  aug('aug_sharp', 1, N_('锋锐'), N_('所有干员造成的伤害提升至 {pct}%'), { pct: 112 }, 'battle'),
  aug('aug_armor', 1, N_('重甲'), N_('所有干员受到的物理伤害降低 {pct}%'), { pct: 22 }, 'battle'),
  aug('aug_redeploy', 1, N_('快速部署'), N_('所有干员再部署时间 −{pct}%'), { pct: 45 }, 'battle'),
  aug('aug_shield', 1, N_('开局护盾'), N_('开战时每名干员获得 {pct}% 最大生命的护盾，持续 {sec} 秒'), { pct: 30, sec: 15 }, 'battle'),
  aug('aug_piggy', 1, N_('零钱罐'), N_('每回合开始时获得 {funds} 资金'), { funds: 2 }, 'meta'),
  aug('aug_supply', 1, N_('补给线'), N_('每回合首次主动刷新免费（不累积）'), {}, 'meta'),
  aug('aug_savings', 1, N_('储蓄'), N_('休整期结束时，剩余资金的一半（至多 {max}）留到下回合'), { max: 4 }, 'meta'),
  aug('aug_haggle', 1, N_('议价'), N_('每回合第一次购买干员的价格 −{n}（最低 {min}）'), { n: 1, min: 1 }, 'meta'),
  aug('aug_subsidy', 1, N_('升级补贴'), N_('升级调度中心的价格 −{n}'), { n: 3 }, 'meta'),
  aug('aug_adversity', 1, N_('逆境补给'), N_('扣除目标生命后，下回合获得扣除量一半的资金（向上取整，至多 {max}）'), { max: 4 }, 'meta'),
  aug('aug_gamble', 1, N_('豪赌'), N_('每回合开始时，{win}% 概率获得 {gain} 资金，否则失去 {loss} 资金'), { win: 60, gain: 5, loss: 1 }, 'meta'),
  aug('aug_promo', 1, N_('晋升加速'), N_('晋升奖励（合成精锐后的免费招募）改为 {n} 选 1'), { n: 4 }, 'meta'),
  aug('aug_freezedeal', 1, N_('冻结优惠'), N_('上回合冻结保留下来的干员，购买价格 −{n}（最低 1，每回合至多 {max} 名）'), { n: 1, max: 3 }, 'meta'),
  aug('aug_spark', 1, N_('盟约火种'), N_('回合开始时，层数最少的已激活盟约 +{layer} 层（调和、协防、独行、绝技不参与）'), { layer: 3 }, 'meta'),
  aug('aug_backbone', 1, N_('主心骨'), N_('休整期结束时，场上人数最多的已激活盟约 +{layer} 层'), { layer: 4 }, 'meta'),
  aug('aug_rookie', 1, N_('新兵训练'), N_('1～{maxTier} 阶干员造成的伤害提升至 {dealt}%，受到的伤害降低 {taken}%'), { maxTier: 3, dealt: 122, taken: 22 }, 'battle'),
  aug('aug_last_stand', 1, N_('背水一战'), N_('目标生命不高于初始值的一半时，所有干员造成的伤害提升至 {dealt}%，受到的伤害降低 {taken}%'), { dealt: 122, taken: 22 }, 'both'),
  aug('aug_stoploss', 1, N_('止损'), N_('每回合最多扣除的目标生命 −{n}'), { n: 4 }, 'meta'),
  aug('aug_guardian', 1, N_('守护者'), N_('正在阻挡敌人的干员受到的伤害降低 {pct}%'), { pct: 22 }, 'battle'),
  aug('aug_medic', 1, N_('战地医疗'), N_('干员的治疗量提升至 {pct}%'), { pct: 130 }, 'battle'),
  aug('aug_second_wind', 1, N_('后劲'), N_('开战 {sec} 秒后，所有干员攻击间隔缩短 {pct}%'), { sec: 25, pct: 22 }, 'battle'),
  aug('aug_execute', 1, N_('斩杀'), N_('干员的攻击使非领袖敌人的生命低于 {pct}% 时，直接将其击倒'), { pct: 18 }, 'battle'),
  aug('aug_triangle', 1, N_('铁三角'), N_('同一行有 {n} 名以上干员时，这一行的干员受到的伤害降低 {pct}%'), { n: 3, pct: 22 }, 'battle'),
  aug('aug_vanguard', 1, N_('前哨'), N_('最右一列的干员受到的伤害降低 {pct}%'), { pct: 30 }, 'battle'),
  aug('aug_quartermaster', 1, N_('军需'), N_('立即获得 {n} 件随机的 1～2 阶装备；之后每 {every} 回合获得 1 件（不高于调度中心等级）'), { n: 2, every: 2 }, 'meta'),
  aug('aug_mutual', 1, N_('资源互助'), N_('回合开始时，若你的资金少于队友的平均值，获得 {funds} 资金'), { funds: 2 }, 'meta', null, { coop: true }),
  aug('aug_rob', 1, N_('打劫'), N_('每 {every} 回合一次：从资金最多的队友那里拿走 {funds} 资金'), { every: 3, funds: 3 }, 'meta', null, { coop: true }),
  aug('aug_bomb', 1, N_('定时炸弹'), N_('一颗炸弹在全队之间传递，每回合开始时传给下一名玩家：持有者本回合完美作战获得 {funds} 资金（下回合发放），否则扣 {lp} 点目标生命'),
    { funds: 3, lp: 2 }, 'meta', null, { coop: true }),
  aug('aug_speaker', 1, N_('话事人'), N_('敌人强化投票时，你的一票算两票；平票时以你的选择为准'), {}, 'meta', null, { coop: true }),
  // --- 黄金
  aug('aug_haste', 2, N_('急速'), N_('所有干员攻击间隔缩短 {pct}%'), { pct: 18 }, 'battle'),
  aug('aug_surge', 2, N_('技力涌流'), N_('干员部署时技力 +{sp}，技力回复速度 +{pct}%'), { sp: 8, pct: 22 }, 'battle'),
  aug('aug_lifesteal', 2, N_('战地吸血'), N_('干员造成伤害的 {pct}% 回复自身生命'), { pct: 9 }, 'battle'),
  aug('aug_undying', 2, N_('不屈意志'), N_('每场作战中，每名干员首次被击倒时立即在原地复活，生命为 {pct}%'), { pct: 75 }, 'battle'),
  aug('aug_glass', 2, N_('玻璃大炮'), N_('所有干员造成的伤害提升至 {dealt}%，但受到的伤害提升 {taken}%'), { dealt: 130, taken: 15 }, 'battle'),
  aug('aug_recruit', 2, N_('精锐速成'), N_('立即获得一名当前调度中心等级能招募到的最高阶随机干员'), {}, 'meta'),
  aug('aug_loot', 2, N_('战利品'), N_('完美作战时，下回合获得 {funds} 资金'), { funds: 3 }, 'meta'),
  aug('aug_bonus', 2, N_('晋升奖金'), N_('合成精锐时获得 {funds} 资金（每回合至多 {max} 次）'), { funds: 1, max: 3 }, 'meta'),
  aug('aug_eye', 2, N_('慧眼'), N_('每回合首次主动刷新时，若你持有 2 名同名的普通干员，商店至少出现其中一名（卡池还有时）；1 名普通加 1 名精锐不算'), {}, 'meta'),
  aug('aug_hometown', 2, N_('同乡会'), N_('回合开始时，商店至少有 1 名你场上人数最多的核心盟约的干员（卡池还有时）'), {}, 'meta'),
  aug('aug_projector', 2, N_('投影补给'), N_('立即获得 1 个<博士投影>'), { item: 'chess_item_5_06_e_a' }, 'meta'),
  aug('aug_study', 2, N_('休整研读'), N_('「进入休整期时」「休整期结束时」的叠层特质每次额外 +1 层（每回合至多 +{max}）'), { max: 9 }, 'meta'),
  aug('aug_momentum', 2, N_('乘胜追击'), N_('战斗中通过特质叠层时，{prob}% 概率额外 +1 层（每场至多 +{max}）'), { prob: 45, max: 15 }, 'battle'),
  aug('aug_dual', 2, N_('双重身份'), N_('休整期结束时，场上每名属于 2 个以上盟约的干员，使它已激活的盟约各 +{layer} 层'), { layer: 4 }, 'meta'),
  aug('aug_reclass', 2, N_('转职许可'), N_('立即获得 1 个<变形同构体>和 1 件随机的盟约装备'), { item: 'chess_item_6_09_e_a' }, 'meta'),
  aug('aug_minor', 2, N_('小盟约专精'), N_('附加盟约通过特质叠层时额外 +1 层（每回合至多 +{max}）'), { max: 9 }, 'both'),
  aug('aug_insurance', 2, N_('层数保险'), N_('第 {round} 回合休整期结束时，所有已激活的盟约各 +{layer} 层'), { round: 13, layer: 22 }, 'meta'),
  aug('aug_chain', 2, N_('连锁爆破'), N_('敌人被你的干员击倒时，对周围 1 格内的其他敌人造成其最大生命 {pct}% 的真实伤害（不连锁；领袖不受影响）'), { pct: 12 }, 'battle'),
  aug('aug_skill_echo', 2, N_('技能共鸣'), N_('干员开启技能时，上下左右的干员技力 +{sp}（每名干员每 {cd} 秒至多获得 1 次）'), { sp: 3, cd: 8 }, 'battle'),
  aug('aug_drill', 2, N_('再部署演练'), N_('干员再部署后 {sec} 秒内，攻击间隔缩短 {pct}%，受到的伤害降低 {pct}%'), { sec: 10, pct: 45 }, 'battle'),
  aug('aug_control', 2, N_('控制延长'), N_('干员造成的晕眩、冻结、沉睡、束缚持续时间 +{pct}%（对领袖减半）'), { pct: 45 }, 'battle'),
  aug('aug_thorns', 2, N_('荆棘'), N_('被阻挡的敌人攻击干员时，受到该干员攻击力 {pct}% 的法术伤害（每名干员每 {cd} 秒至多 1 次）'), { pct: 45, cd: 0.5 }, 'battle'),
  aug('aug_multi', 2, N_('多重打击'), N_('干员每第 {n} 次攻击，额外造成一次 {pct}% 攻击力的伤害'), { n: 4, pct: 90 }, 'battle'),
  aug('aug_depth', 2, N_('纵深'), N_('身前一格有己方干员的干员，攻击间隔缩短 {pct}%'), { pct: 37 }, 'battle'),
  aug('aug_center', 2, N_('中军'), N_('上下左右都有己方单位的干员，攻击范围内的敌人受到的伤害提升 {pct}%'), { pct: 22 }, 'battle'),
  aug('aug_highground', 2, N_('高台火力'), N_('高台干员攻击距离超过 {dist} 格的目标时，造成的伤害提升至 {pct}%'), { dist: 3, pct: 130 }, 'battle'),
  aug('aug_craft', 2, N_('精工'), N_('携带 2 件装备的干员攻击间隔缩短 {interval}%，受到的伤害降低 {taken}%'), { interval: 30, taken: 15 }, 'battle'),
  aug('aug_refit', 2, N_('整备'), N_('之后购买的 {n} 件装备变为进阶品质'), { n: 3 }, 'meta'),
  aug('aug_forge', 2, N_('熔炉'), N_('每回合 1 次，休整期点击此海克斯发动：把整备区里同阶、不同的 2 件普通装备熔成 1 件高一阶的随机装备'), {}, 'meta', null, { action: true }),
  aug('aug_watch', 2, N_('守望相助'), N_('参加联防时，你击倒的敌人每个使你下回合获得 1 资金（每回合至多 {max}）'), { max: 4 }, 'meta', null, { coop: true }),
  aug('aug_sync', 2, N_('战术同步'), N_('联防开场时，你的干员技力 +{sp}'), { sp: 15 }, 'battle', null, { coop: true }),
  aug('aug_vampire', 2, N_('吸血鬼'), N_('回合开始时，从目标生命最高的队友身上吸 1 点目标生命给自己（每局至多 {max} 次；对方只剩 {floor} 点及以下时不吸）'),
    { max: 6, floor: 5 }, 'meta', null, { coop: true }),
  aug('aug_sacrifice', 2, N_('献祭'), N_('每回合 1 次，休整期点击此海克斯发动：自己扣 {lp} 点目标生命，本回合所有队友造成的伤害提升至 {pct}%'),
    { lp: 3, pct: 130 }, 'meta', null, { coop: true, action: true }),
  aug('aug_blame', 2, N_('甩锅'), N_('每回合扣除目标生命时，其中 {pct}% 改由目标生命最高的队友承担（四舍五入）'), { pct: 30 }, 'meta', null, { coop: true }),
  aug('aug_wheel', 2, N_('命运轮盘'), N_('每回合 1 次，休整期点击此海克斯发动：花 1 点目标生命转一次，随机获得 1 件装备、1 名干员（均不高于调度中心等级）、{funds} 资金、什么也没有，或再扣 {lp} 点目标生命'),
    { funds: 4, lp: 2 }, 'meta', null, { action: true }),
  aug('aug_legacy', 2, N_('遗产'), N_('你被淘汰时，存活的队友平分你的资金，并各获得 1 名你场上阶级最高的干员'), {}, 'meta', null, { coop: true }),
  // --- 彩色
  aug('aug_expand', 3, N_('扩编'), N_('部署上限 +{n}，但每回合收入 −{income}'), { n: 1, income: 1 }, 'meta'),
  aug('aug_command', 3, N_('指挥官光环'), N_('作战时每有 1 个已激活的盟约，所有干员造成的伤害提升 {pct}%（连乘）'), { pct: 4 }, 'battle'),
  aug('aug_greed', 3, N_('贪婪'), N_('每回合开始时获得 {funds} 资金，但你战场上的敌人生命 +{hp}%'), { funds: 5, hp: 12 }, 'both'),
  aug('aug_elite', 3, N_('精锐征召'), N_('第 9、11、13 回合开始时，场上一名随机的普通干员直接晋升为精锐（优先最高阶）'), { rounds: [9, 11, 13] }, 'meta'),
  aug('aug_reserve', 3, N_('预备队'), N_('整备区满时仍能购买，买到的干员或装备放入临时整备区'), {}, 'meta'),
  aug('aug_resonance', 3, N_('共振'), N_('休整期结束时，其他每个已激活的盟约获得层数最高的盟约 {pct}% 的层数（每个至多 +{max}）'), { pct: 7, max: 15 }, 'meta'),
  aug('aug_harmony', 3, N_('调和之心'), N_('场上人数最多的核心盟约人数 +1（<调和>激活时不叠加）'), {}, 'meta'),
  aug('aug_first_strike', 3, N_('技能先发'), N_('每场作战开始时，干员的技力充满'), {}, 'battle'),
  aug('aug_pierce', 3, N_('穿甲'), N_('所有干员攻击无视 {pct}% 的防御力和法术抗性（与其他无视效果相加，至多 100%）'), { pct: 37 }, 'battle'),
  aug('aug_echo', 3, N_('前后呼应'), N_('以下特质的范围多一格：空弦、引星棘刺「自身及身前一格」改为两格，断崖、见行者「自身及身后一格」改为两格；铃兰多触发一格；白面鸮、塞雷娅身前一格没有可复制的特质时，复制身前第二格的；华法琳、寒芒克洛丝、凛御银灰、耀骑士临光开战时给身前一格干员的特质，身前第二格也获得；魔王对身前两格都生效'),
    {}, 'both'),
  aug('aug_armory', 3, N_('武器库'), N_('调度中心的装备栏位 +{n}'), { n: 1 }, 'meta'),
  aug('aug_together', 3, N_('并肩作战'), N_('最终攻势和隐秘核心中，你和同一战场的队友造成的伤害提升至 {pct}%'), { pct: 145 }, 'battle', null, { coop: true }),
  aug('aug_allin', 3, N_('孤注一掷'), N_('部署上限 −1，但场上人数最多的核心盟约人数 +1；所有干员造成的伤害提升至 {dealt}%，受到的伤害降低 {taken}%'), { dealt: 137, taken: 30 }, 'both'),
  aug('aug_bound', 3, N_('同生共死'), N_('选择时与目标生命最低的队友绑定：之后每回合结算后，两人的目标生命取平均（向下取整）'), {}, 'meta', null, { coop: true }),
  aug('aug_chosen', 3, N_('天选之人'), N_('每回合开始时有 1/{odds} 的概率被「天选」：本回合所有干员攻击间隔缩短 {interval}%，造成的伤害提升至 {dealt}%'),
    { odds: 4, interval: 40, dealt: 150 }, 'both'),

  // --- 职业专精 (the user, 2026-10-09 while playtesting: 「更有联动性」): per profession (`cls`, the operators' `profession`), one
  // per tier; the effects grow with the player's operators of that profession in the battle (server/sim/content/
  // classAugments.js). Never drawn as generic cards: the roll's class card (rollAugments `classCounts`) offers one for a
  // profession the player fields at least CLASS_OFFER_MIN times.
  aug('aug_c_pioneer1', 1, N_('先锋号令'), N_('先锋干员攻击力 +{atk}%；开战后 {sec} 秒内，所有干员攻击间隔缩短 {pct}% × 场上先锋人数（至多 {max} 名）'), { atk: 20, sec: 15, pct: 4, max: 5 }, 'battle', null, CLS('PIONEER')),
  aug('aug_c_pioneer2', 2, N_('突击部署'), N_('先锋干员击倒敌人时，所有干员技力 +{sp}（每秒至多 1 次）；场上每有 1 名先锋，所有干员再部署时间 −{pct}%（至多 {max} 名）'), { sp: 1, cd: 1, pct: 8, max: 5 }, 'battle', null, CLS('PIONEER')),
  aug('aug_c_pioneer3', 3, N_('破阵先锋'), N_('先锋干员阻挡数 +{block}、最大生命 +{hp}%；作战开始时，所有干员技力 +{sp} × 场上先锋人数（至多 {max} 名）'), { block: 1, hp: 40, sp: 2, max: 5 }, 'battle', null, CLS('PIONEER')),
  aug('aug_c_warrior1', 1, N_('近卫操典'), N_('近卫干员攻击力 +{atk}%；场上每有 1 名近卫，近卫干员受到的伤害降低 {pct}%（至多 {max} 名）'), { atk: 20, pct: 3, max: 5 }, 'battle', null, CLS('WARRIOR')),
  aug('aug_c_warrior2', 2, N_('浴血奋战'), N_('近卫干员造成伤害的 {heal}% 回复自身生命；阻挡着敌人时攻击间隔缩短 {pct}%'), { heal: 10, pct: 20 }, 'battle', null, CLS('WARRIOR')),
  aug('aug_c_warrior3', 3, N_('横扫千军'), N_('近卫干员同时攻击的目标数 +{n}；场上每有 1 名近卫，近卫干员造成的伤害提升 {pct}%（至多 {max} 名）'), { n: 1, pct: 5, max: 5 }, 'battle', null, CLS('WARRIOR')),
  aug('aug_c_tank1', 1, N_('坚盾'), N_('重装干员最大生命 +{hp}%；场上每有 1 名重装，所有干员防御力 +{pct}%（至多 {max} 名）'), { hp: 25, pct: 5, max: 5 }, 'battle', null, CLS('TANK')),
  aug('aug_c_tank2', 2, N_('铁壁阵线'), N_('重装干员阻挡数 +{block}，受到的伤害降低 {pct}%'), { block: 1, pct: 20 }, 'battle', null, CLS('TANK')),
  aug('aug_c_tank3', 3, N_('不动如山'), N_('被你的重装干员阻挡的敌人受到的伤害提升 {amp}%；重装干员每阻挡 1 名敌人，受到的伤害降低 {pct}%（至多 {max} 名）'), { amp: 25, pct: 10, max: 3 }, 'battle', null, CLS('TANK')),
  aug('aug_c_sniper1', 1, N_('鹰眼'), N_('狙击干员攻击力 +{atk}%，对空中敌人造成的伤害提升至 {fly}%'), { atk: 20, fly: 140 }, 'battle', null, CLS('SNIPER')),
  aug('aug_c_sniper2', 2, N_('狙击阵地'), N_('狙击干员攻击范围扩大 {n} 格；场上每有 1 名狙击，狙击干员攻击间隔缩短 {pct}%（至多 {max} 名）'), { n: 1, pct: 5, max: 5 }, 'battle', null, CLS('SNIPER')),
  aug('aug_c_sniper3', 3, N_('弹雨'), N_('狙击干员同时攻击的目标数 +{n}，攻击无视 {pct}% 防御力'), { n: 1, pct: 30 }, 'battle', null, CLS('SNIPER')),
  aug('aug_c_caster1', 1, N_('法力涌动'), N_('术师干员攻击力 +{atk}%，技力回复速度 +{sp}%'), { atk: 20, sp: 20 }, 'battle', null, CLS('CASTER')),
  aug('aug_c_caster2', 2, N_('法术穿透'), N_('术师干员攻击无视 {res}% 法术抗性；场上每有 1 名术师，术师造成的伤害提升 {pct}%（至多 {max} 名）'), { res: 30, pct: 4, max: 5 }, 'battle', null, CLS('CASTER')),
  aug('aug_c_caster3', 3, N_('奥术共鸣'), N_('术师干员的攻击使目标受到的法术伤害提升 {amp}%（{sec} 秒）；场上每有 1 名术师，再提升 {pct}%（至多 {max} 名）'), { amp: 20, sec: 5, pct: 4, max: 5 }, 'battle', null, CLS('CASTER')),
  aug('aug_c_medic1', 1, N_('急救包'), N_('医疗干员的治疗量提升至 {heal}%；场上每有 1 名医疗，所有干员最大生命 +{pct}%（至多 {max} 名）'), { heal: 130, pct: 4, max: 5 }, 'battle', null, CLS('MEDIC')),
  aug('aug_c_medic2', 2, N_('生命护盾'), N_('医疗干员治疗时溢出的部分转为护盾（至多目标最大生命的 {cap}%，持续 {sec} 秒）'), { cap: 25, sec: 8 }, 'battle', null, CLS('MEDIC')),
  aug('aug_c_medic3', 3, N_('战地医院'), N_('医疗干员的治疗同时回复目标周围 1 格内其他干员 {splash}% 的治疗量；场上每有 1 名医疗，所有干员每秒回复 {regen}% 最大生命（至多 {max} 名）'), { splash: 30, regen: 0.5, max: 5 }, 'battle', null, CLS('MEDIC')),
  aug('aug_c_support1', 1, N_('战术支援'), N_('辅助干员攻击力 +{atk}%，技力回复速度 +{sp}%'), { atk: 20, sp: 25 }, 'battle', null, CLS('SUPPORT')),
  aug('aug_c_support2', 2, N_('弱点标记'), N_('辅助干员的攻击使目标受到的伤害提升 {amp}%（{sec} 秒）；场上每有 1 名辅助，再提升 {pct}%（至多 {max} 名）'), { amp: 12, sec: 4, pct: 3, max: 5 }, 'battle', null, CLS('SUPPORT')),
  aug('aug_c_support3', 3, N_('指挥中枢'), N_('场上每有 1 名辅助，所有干员技力回复速度 +{pct}%（至多 {max} 名）；辅助干员攻击力 +{atk}%'), { pct: 8, max: 5, atk: 25 }, 'battle', null, CLS('SUPPORT')),
  aug('aug_c_special1', 1, N_('快速轮换'), N_('特种干员再部署时间 −{pct}%，攻击力 +{atk}%'), { pct: 50, atk: 20 }, 'battle', null, CLS('SPECIAL')),
  aug('aug_c_special2', 2, N_('暗杀'), N_('特种干员对生命低于 {hpPct}% 的非领袖敌人造成的伤害提升至 {dealt}%；场上每有 1 名特种，再提升 {pct}%（至多 {max} 名）'), { hpPct: 50, dealt: 140, pct: 5, max: 5 }, 'battle', null, CLS('SPECIAL')),
  aug('aug_c_special3', 3, N_('影袭'), N_('特种干员有 {dodge}% 概率闪避物理攻击；击倒敌人时回复 {sp} 点技力，攻击间隔缩短 {pct}%（{sec} 秒）'), { dodge: 30, sp: 3, pct: 30, sec: 5 }, 'battle', null, CLS('SPECIAL')),

  // --- 专属强化 (the user's table of 2026-10-09, revised 2026-10-10: tiers moved, numbers changed, and its note now
  // reads 「对于同名装备、法术，都可生效，但默认下不会影响到队友」 — a change to an item or Art applies to every one of
  // that name the player holds, not only the one a strategy / 海克斯 gave): offered only to a player whose strategy is
  // `band`, in the slot the roll keeps for it (rollAugments). "额外" adds to the strategy, "改为" replaces it (the
  // strategy's handler steps aside: server/sim/content/bands/meta.js). What each does: server/sim/content/augments.js.
  aug('aug_x_warfarin2', 2, N_('专属强化II·华法琳'), N_('额外：休整期结束时，场上人数最多的盟约额外获得 {mul} 倍其人数的层数'), { mul: 2 }, 'meta', 'band_bldsk'),
  aug('aug_x_warfarin3', 3, N_('专属强化III·华法琳'), N_('改为：开始作战时，场上每名我方干员使其所属盟约层数 +{layer}'), { layer: 2 }, 'meta', 'band_bldsk'),
  aug('aug_x_amiya1', 1, N_('专属强化I·阿米娅'), N_('额外：场上存在 3、4 或 5 种以上激活盟约时，所有干员防御力 +20/30/40%，法抗 +10/15/20'),
    { v1: 3, v2: 4, v3: 5, def1: 20, def2: 30, def3: 40, res1: 10, res2: 15, res3: 20 }, 'battle', 'band_amiya'),
  aug('aug_x_amiya2', 2, N_('专属强化II·阿米娅'), N_('额外：立即获得一个<寻呼模块>，下回合开始时再获得一个'), { item: 'chess_item_4_01_e_a' }, 'meta', 'band_amiya'),
  aug('aug_x_duyaoy1', 1, N_('专属强化I·杜遥夜'), N_('额外：每回合获得 {n} 次免费刷新'), { n: 2 }, 'meta', 'band_duyaoy'),
  aug('aug_x_duyaoy3', 3, N_('专属强化III·杜遥夜'), N_('额外：特殊刷新时，额外刷新出一名阶级等于当前调度中心等级的<炎>干员'), { bond: 'yanShip' }, 'meta', 'band_duyaoy'),
  aug('aug_x_goliath3', 3, N_('专属强化III·歌利亚'), N_('额外：自身每损失 {per} 点目标生命值，获得 {funds} 资金'), { per: 2, funds: 3 }, 'meta', 'band_sarkazb'),
  aug('aug_x_orchid2', 2, N_('专属强化II·梓兰'), N_('额外：特殊刷新出的 2 名同名干员购买费用 −{n}'), { n: 1 }, 'meta', 'band_orchid'),
  aug('aug_x_justin1', 1, N_('专属强化I·小贾斯汀'), N_('额外：立即获得 1 个进阶<骑士储蓄罐>'), { item: 'chess_item_3_12_e_b' }, 'meta', 'band_justin'),
  aug('aug_x_justin3', 3, N_('专属强化III·小贾斯汀'), N_('额外：本回合每使用 {step} 资金，下回合开始时获得 1 资金（至多 {max} 资金）'), { step: 8, max: 5 }, 'meta', 'band_justin'),
  aug('aug_x_ermengard1', 1, N_('专属强化I·埃芒加德'), N_('额外：被策略复活的干员，被击倒时与部署时获得的盟约层数翻倍（砾、瑕光等）'), {}, 'battle', 'band_ermengard'),
  aug('aug_x_ermengard2', 2, N_('专属强化II·埃芒加德'), N_('额外：场上我方干员被击倒时，其所属已激活盟约层数 +{layer}'), { layer: 2 }, 'battle', 'band_ermengard'),
  aug('aug_x_lmlee2', 2, N_('专属强化II·老鲤'), N_('额外：若你漏怪且联防结束后没有敌人漏过（队友兜完），你与击倒你漏的最后一个敌人的队友各获得 {funds} 资金'), { funds: 3 }, 'meta', 'band_lmlee'),
  aug('aug_x_lmlee3', 3, N_('专属强化III·老鲤'), N_('额外：获得此海克斯的回合无法进行任何操作，资金暂存至下回合发放；下回合进入休整期时获得 1 名随机 6 阶进阶干员'), { tier: 6 }, 'meta', 'band_lmlee'),
  aug('aug_x_kirara1', 1, N_('专属强化I·绮良'), N_('改为：每获得 {step} 资金，获得一名不高于当前调度中心等级的随机干员'), { step: 16 }, 'meta', 'band_kirara'),
  aug('aug_x_kirara2', 2, N_('专属强化II·绮良'), N_('额外：每获得 {step} 资金，额外获得 1 资金'), { step: 10 }, 'meta', 'band_kirara'),
  aug('aug_x_kirara3', 3, N_('专属强化III·绮良'), N_('额外：获得后每使用 1 资金，所有干员攻击力 +{atk}%、攻击速度 +{aspd}（整局累计）'), { atk: 1, aspd: 1 }, 'both', 'band_kirara'),

  // --- the second part of the table (rows 19–56, the same day). 专属强化III·克莱门莎 is left out: its operator is not in
  // this version (the table: "仅在克莱门莎加入后且未被ban，此海克斯进入刷新池子").
  aug('aug_x_sciurus1', 1, N_('专属强化I·休露丝'), N_('改为：每回合购买的首名<谢拉格>干员消耗资金为 {price}'), { price: 0 }, 'meta', 'band_sciurus'),
  aug('aug_x_emperor1', 1, N_('专属强化I·大帝'), N_('额外：我方干员首次再部署时间 −{pct}%'), { pct: 90 }, 'battle', 'band_emperor'),
  aug('aug_x_damaztic1', 1, N_('专属强化I·变形者集群'), N_('额外：每回合开始时，随机获得一件可以与<变形同构体>一起用于转职的装备'), {}, 'meta', 'band_damaztic'),
  aug('aug_x_chiave1', 1, N_('专属强化I·贾维'), N_('额外：安洁莉娜、阿罗玛因刷新而叠的层数翻倍（每回合上限也翻倍）'), { mul: 2 }, 'meta', 'band_chiave'),
  aug('aug_x_humus1', 1, N_('专属强化I·休谟斯'), N_('改为：地面干员技能开启和结束时，使周围四格随机 1 名干员获得 {sp} 点技力'), { sp: 3 }, 'battle', 'band_humus'),
  aug('aug_x_vodfox1', 1, N_('专属强化I·巫恋'), N_('额外：获得一个持续时间无限的巫毒娃娃（作战开始时自动放在敌人路线上），其周围 3×3 内的敌人攻击力、防御力 −{pct}%'), { pct: 50 }, 'battle', 'band_vodfox'),

  aug('aug_x_pepe2', 2, N_('专属强化II·佩佩'), N_('额外：每回合首次购买<萨尔贡>干员时返还 {refund} 资金；<在场6名不同【萨尔贡】干员>的攻击力加成不再有 +{cap}% 的上限'), { refund: 1, cap: 300 }, 'both', 'band_pepe'),
  aug('aug_x_sciurus2', 2, N_('专属强化II·休露丝'), N_('额外：获得<谢拉格>干员时，视为额外获得一次同名干员（只用于获得时效果和获得次数，不能用于合成精锐）'), {}, 'meta', 'band_sciurus'),
  aug('aug_x_paganini2', 2, N_('专属强化II·潘格尼尼'), N_('改为：累计花费 {coin} 资金后，从 {n} 名 4 阶及以上随机的精锐<拉特兰>干员中选择 1 名获得'), { coin: 55, n: 3 }, 'meta', 'band_paganini'),
  aug('aug_x_harold2', 2, N_('专属强化II·哈洛德'), N_('额外：从获得后开始，每 {every} 回合额外获得 1 名<维多利亚>干员'), { every: 2, bond: 'victoriaShip' }, 'meta', 'band_harold'),
  aug('aug_x_clementia2', 2, N_('专属强化II·克莱门莎'), N_('额外：场上<阿戈尔>干员战斗中叠层的特质，共享给场上所有<阿戈尔>干员'), {}, 'battle', 'band_clementia'),
  aug('aug_x_emperor2', 2, N_('专属强化II·大帝'), N_('额外：我方干员部署费用 −{pct}%'), { pct: 70 }, 'battle', 'band_emperor'),
  aug('aug_x_mberry2', 2, N_('专属强化II·桑葚'), N_('改为：战斗开始时，使所有我方单位获得效果：每次攻击有 {prob}% 的概率获得 1 层护盾（最多 1 层）'), { prob: 25 }, 'battle', 'band_mberry'),
  aug('aug_x_humus2', 2, N_('专属强化II·休谟斯'), N_('额外：干员技力每溢出 1 点，本场战斗该干员攻击力 +{atk}%（至多 +{cap}%）'), { atk: 2.5, cap: 250 }, 'battle', 'band_humus'),
  aug('aug_x_yu2', 2, N_('专属强化II·余'), N_('改为：第 {round} 回合开始时，所有已激活盟约增加 {layer} 层'), { round: 8, layer: 36 }, 'meta', 'band_yu'),
  aug('aug_x_doberm2', 2, N_('专属强化II·杜宾'), N_('额外：你使用<教鞭>添加的额外敌人也加到其余队友的下场战斗，队友自身完美作战也能获得资金'), {}, 'meta', 'band_doberm'),
  aug('aug_x_cathy2', 2, N_('专属强化II·凯瑟琳'), N_('额外：策略提供的装备更容易是 4～6 级（抽到 3 级及以下时重抽一次）'), { tier: 4 }, 'meta', 'band_cathy'),
  aug('aug_x_malkie2', 2, N_('专属强化II·马克维茨'), N_('额外：<商业包装方案>改为每出售 8 名干员后，获得 1 名装备者的普通干员'), {}, 'meta', 'band_malkie'),
  aug('aug_x_damaztic2', 2, N_('专属强化II·变形者集群'), N_('额外：立即获得一个<变形同构体>；一名干员装备两件<变形同构体>时，视为<调和>盟约成员'), { item: 'chess_item_6_09_e_a' }, 'both', 'band_damaztic'),
  aug('aug_x_dusk2', 2, N_('专属强化II·夕'), N_('额外：同名干员在计算盟约人数时分别计算'), {}, 'meta', 'band_dusk'),
  aug('aug_x_pith2', 2, N_('专属强化II·Pith'), N_('额外：休整期结束时，若 Pith 在场，场上所有已激活的阵营盟约 +{layer} 层'), { layer: 10 }, 'meta', 'band_pith'),
  aug('aug_x_cannot2', 2, N_('专属强化II·坎诺特'), N_('改为：每回合剩余的资金可以继承，剩余每 {capital} 资金，每回合额外获得 1 资金（不设上限）'), { capital: 5 }, 'meta', 'band_cannot'),
  aug('aug_x_duck2', 2, N_('专属强化II·鸭爵'), N_('额外：被替换的敌人数量翻倍，且被替换后的敌人进入保护点不扣目标生命值'), {}, 'both', 'band_ducklord'),
  aug('aug_x_lisa2', 2, N_('专属强化II·铃兰'), N_('改为：每个回合开始时，触发战场最右侧一列所有干员的获得时效果一次'), {}, 'meta', 'band_lisa'),
  aug('aug_x_vodfox2', 2, N_('专属强化II·巫恋'), N_('额外：每回合出售的第一名干员，会在下回合开始时出现在调度中心（牌库里没有了就失效一回合）'), {}, 'meta', 'band_vodfox'),
  aug('aug_x_ioleta2', 2, N_('专属强化II·伊奥莱塔·罗素'), N_('额外：回合开始时，场上每有 {per} 名精锐干员，获得 {funds} 资金'), { per: 2, funds: 2 }, 'meta', 'band_ioleta'),
  aug('aug_x_jesica2', 2, N_('专属强化II·杰西卡'), N_('额外：<寻呼模块>不再受「不高于当前调度中心等级」的限制'), {}, 'meta', 'band_jesica'),
  aug('aug_x_mlyss2', 2, N_('专属强化II·缪尔赛思'), N_('额外：立即获得一个<博士投影>；用过<博士投影>的干员被出售时，获得一个<博士投影>'), { item: 'chess_item_5_06_e_a' }, 'meta', 'band_mlyss'),
  aug('aug_x_mlynar2', 2, N_('专属强化II·玛恩纳'), N_('修改：每购买一名<卡西米尔>干员，立即获得 1 资金，下回合开始时资金 +1（两项每回合各至多 {max} 资金）'), { max: 3 }, 'meta', 'band_mlynar'),

  aug('aug_x_harold3', 3, N_('专属强化III·哈洛德'), N_('额外：立即获得 1 名维娜·维多利亚；<奇迹>每有 {step} 层，再获得 1 名'), { step: 50, chess: 'chess_char_6_07_a' }, 'meta', 'band_harold'),
  aug('aug_x_paganini3', 3, N_('专属强化III·潘格尼尼'), N_('额外：获得后累计花费 {coin} 资金时，获得 1 名随机 6 阶精锐干员、1 个<变形同构体>和 1 个<拉特兰桥夹>'), { coin: 30 }, 'meta', 'band_paganini'),
  aug('aug_x_mberry3', 3, N_('专属强化III·桑葚'), N_('改为：战斗开始时，使最右边的所有我方单位获得效果：每次攻击有 {prob}% 的概率获得 1 层护盾（最多 {max} 层）；每获得或失去 1 层护盾，攻击力、生命 +{pct}%，攻击速度 +{aspd}（至多 {cap} 次）'),
    { prob: 25, max: 2, pct: 10, aspd: 10, cap: 10 }, 'battle', 'band_mberry'),
  aug('aug_x_doberm3', 3, N_('专属强化III·杜宾'), N_('额外：每回合都获得 1 个<教鞭>；使用<教鞭>添加额外敌人时立即获得其资金，自身完美作战时不再获得'), {}, 'meta', 'band_doberm'),
  aug('aug_x_pith3', 3, N_('专属强化III·Pith'), N_('额外：休整期结束时，若 Pith 在场，场上所有已激活的非阵营盟约 +{layer} 层'), { layer: 10 }, 'meta', 'band_pith'),
  aug('aug_x_jesica3', 3, N_('专属强化III·杰西卡'), N_('额外：每次因<寻呼模块>获得干员时，额外获得一名同名干员'), {}, 'meta', 'band_jesica'),
  aug('aug_x_fang3', 3, N_('专属强化III·芬'), N_('额外：使用<信标>时，不再销毁携带的干员（仍会传递给队友）'), {}, 'meta', 'band_fang'),
  aug('aug_x_mlynar3', 3, N_('专属强化III·玛恩纳'), N_('额外：获得<卡西米尔>干员时，该干员所属盟约 +{layer} 层（无需激活）；每获得 {per} 名<卡西米尔>干员，资金 +1（不受策略每回合 3 资金的上限）'), { layer: 3, per: 3, bond: 'kazimierzShip' }, 'meta', 'band_mlynar'),
];

/**
 * Rarity of the generic augments of the first four versions (the user's six rarities, 2026-10-10): 白银 → 白 (utility,
 * economy, small) or 绿 (the plain numbers), 黄金 → 蓝 (situational) or 紫 (strong anywhere), 彩色 → 金, the two that bend a
 * rule hardest → 红. Their numbers are unchanged.
 */
const GENERIC_RARITY = Object.freeze({
  // 白
  aug_redeploy: 1, aug_shield: 1, aug_supply: 1, aug_savings: 1, aug_haggle: 1, aug_adversity: 1, aug_freezedeal: 1, aug_promo: 1,
  aug_medic: 1, aug_triangle: 1, aug_vanguard: 1, aug_speaker: 1, aug_mutual: 1, aug_bomb: 1, aug_rob: 1,
  // 绿
  aug_tough: 2, aug_sharp: 2, aug_armor: 2, aug_piggy: 2, aug_subsidy: 2, aug_gamble: 2, aug_spark: 2, aug_backbone: 2, aug_rookie: 2,
  aug_last_stand: 2, aug_stoploss: 2, aug_guardian: 2, aug_second_wind: 2, aug_execute: 2, aug_quartermaster: 2,
  // 蓝
  aug_recruit: 3, aug_loot: 3, aug_bonus: 3, aug_eye: 3, aug_hometown: 3, aug_projector: 3, aug_reclass: 3, aug_chain: 3,
  aug_skill_echo: 3, aug_drill: 3, aug_control: 3, aug_thorns: 3, aug_highground: 3, aug_refit: 3, aug_forge: 3, aug_wheel: 3,
  aug_watch: 3, aug_sync: 3, aug_vampire: 3, aug_sacrifice: 3, aug_blame: 3, aug_legacy: 3,
  // 紫
  aug_haste: 4, aug_surge: 4, aug_lifesteal: 4, aug_undying: 4, aug_glass: 4, aug_multi: 4, aug_depth: 4, aug_center: 4, aug_craft: 4,
  aug_study: 4, aug_momentum: 4, aug_dual: 4, aug_minor: 4, aug_insurance: 4,
  // 金
  aug_expand: 5, aug_command: 5, aug_greed: 5, aug_elite: 5, aug_reserve: 5, aug_resonance: 5, aug_harmony: 5, aug_first_strike: 5,
  aug_pierce: 5, aug_echo: 5, aug_armory: 5, aug_together: 5, aug_bound: 5,
  // 红
  aug_allin: 6, aug_chosen: 6,
});
/** 专属强化: the table's 品质 白 / 金 / 彩 (tiers I / II / III) → 白 / 金 / 红. 职业专精: tiers 1 / 2 / 3 → 绿 / 紫 / 金. */
const EXCLUSIVE_RARITY = Object.freeze({ 1: 1, 2: 5, 3: 6 });
const CLASS_RARITY = Object.freeze({ 1: 2, 2: 4, 3: 5 });

/** A definition with its rarity (a generic one's tier becomes its rarity's band). */
function withRarity(a) {
  a = reviseAugment(a);
  if (a.rarity) return a;
  if (a.band) return Object.freeze({ ...a, rarity: EXCLUSIVE_RARITY[a.tier] ?? 1 });
  if (a.cls) return Object.freeze({ ...a, rarity: CLASS_RARITY[a.tier] ?? 2 });
  const rarity = GENERIC_RARITY[a.id] ?? ({ 1: 2, 2: 4, 3: 5 })[a.tier] ?? 2;
  return Object.freeze({ ...a, rarity, tier: bandOf(rarity) });
}

/** The batches of the fifth version on (shared/augments5/g1…g11.js), in order. */
const BATCHES = [AUG5_G1, AUG5_G2, AUG5_G3, AUG5_G4, AUG5_G5, AUG5_G6, AUG5_G7, AUG5_G8, AUG5_G9, AUG5_G10, AUG5_G11];
/**
 * Every definition: the older ones, the batches', and the 套装 bonuses' pseudo augments (SET_DEFS, `pseudo`: never offered,
 * never in a player's `augments` — the match keeps their EffectRef while a set is on).
 */
export const AUGMENTS = Object.freeze([...BASE_AUGMENTS, ...BATCHES.flatMap((b) => b.DEFS), ...SET_DEFS, ...USER_AUGMENTS].filter(a => !REMOVED_AUGMENTS.has(a.id)).map(withRarity));
/** Bot preferences of the batches (server/match/match/augments.js merges them into its table). */
export const AUG5_BOT = Object.freeze(Object.assign({}, ...BATCHES.map((b) => b.BOT)));
/** The ids the batches define (the older lists' tests leave them out; each batch has its own test file). */
export const AUG_BATCH_IDS = Object.freeze(new Set(BATCHES.flatMap((b) => b.DEFS.map((d) => d.id))));
/** The strategies' own augments (专属强化), by strategy id. */
export const EXCLUSIVE_AUGMENTS = Object.freeze(AUGMENTS.filter((a) => a.band));
/** 职业专精 (A6000 fork, 2026-10-09): one per profession and tier. */
export const CLASS_AUGMENTS = Object.freeze(AUGMENTS.filter((a) => a.cls));
/** Operators of one profession a player fields before the roll offers its 职业专精 card. */
export const CLASS_OFFER_MIN = 2;
/** The professions' names (the class card's tag: public/js/ui/augmentOverlay.js). */
export const CLASS_NAMES = Object.freeze({
  PIONEER: N_('先锋'), WARRIOR: N_('近卫'), TANK: N_('重装'), SNIPER: N_('狙击'), CASTER: N_('术师'), MEDIC: N_('医疗'), SUPPORT: N_('辅助'), SPECIAL: N_('特种'),
});

const AUG_INDEX = new Map(AUGMENTS.map((a) => [a.id, a]));
/** An augment definition, or null (safe for any input). */
export const augmentDef = (id) => (typeof id === 'string' && AUG_INDEX.get(id)) || null;
/** The augment tier picked at the start of `round` (0 = none). */
export const augmentTierAt = (round) => AUGMENT_ROUNDS[round] ?? 0;

/**
 * Rarity weights (白 绿 蓝 紫 金 红) of each augment round, per player (the user left the odds to me, 2026-10-10). The mean
 * rarity per round 2.05 / 2.80 / 3.63 / 4.40 / 4.12: with 绿 ≈ the old 白银, 紫 ≈ 黄金, 金 ≈ 彩色 a match's sum is about the
 * old schedule's (白银 白银 黄金 彩色 黄金), with more swing and a chance of 红.
 */
export const AUGMENT_RARITY_ODDS = Object.freeze({
  // every round since 2026-10-10 evening: 13 picks, white / green early — the mean rarity 1.3 → 3.9, a match's sum about
  // 35 (twice the five picks' 17 of before; the enemies vote every second round to match)
  1: Object.freeze([70, 30, 0, 0, 0, 0]),
  2: Object.freeze([55, 40, 5, 0, 0, 0]),
  3: Object.freeze([45, 40, 15, 0, 0, 0]),
  4: Object.freeze([35, 40, 22, 3, 0, 0]),
  5: Object.freeze([25, 40, 28, 7, 0, 0]),
  6: Object.freeze([15, 40, 32, 12, 1, 0]),
  7: Object.freeze([10, 35, 35, 17, 3, 0]),
  8: Object.freeze([5, 30, 35, 22, 7, 1]),
  9: Object.freeze([0, 25, 35, 28, 10, 2]),
  10: Object.freeze([0, 20, 35, 30, 12, 3]),
  11: Object.freeze([0, 15, 30, 35, 16, 4]),
  12: Object.freeze([0, 10, 30, 35, 20, 5]),
  13: Object.freeze([0, 10, 25, 35, 23, 7]),
});
/** The pity: a player who has rolled neither 金 nor 红 before this round gets one here (金 PITY_GOLD %, else 红). */
export const RARITY_PITY_ROUND = 8;
const PITY_GOLD = 90;

/**
 * A player's rarity for the pick of `round` (one draw of `rng`). `seen`: the rarities this player rolled before (the
 * pity). Rounds without odds (other modes' schedules) fall back to their band's middle: 1 → 绿, 2 → 紫, 3 → 金.
 */
export function rollRarity(round, rng, seen = []) {
  const odds = AUGMENT_RARITY_ODDS[round];
  const x = rng();
  if (round === RARITY_PITY_ROUND && !(seen || []).some((r) => r >= 5)) return x * 100 < PITY_GOLD ? 5 : 6;
  if (!odds) return ({ 1: 2, 2: 4, 3: 5 })[augmentTierAt(round)] ?? 2;
  const total = odds.reduce((s, w) => s + w, 0);
  let y = x * total;
  for (let i = 0; i < odds.length; i++) {
    y -= odds[i];
    if (y < 0 && odds[i] > 0) return i + 1;
  }
  for (let i = odds.length - 1; i >= 0; i--) if (odds[i] > 0) return i + 1;
  return 2;
}

/** Draw `n` distinct entries of `list` with `rng` (a () → [0, 1) function); fewer when the list is shorter. */
function draw(list, n, rng) {
  const pool = list.slice();
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
}

/**
 * Three augment ids of `tier` for a player who already holds `owned` (never one of those). Falls back to the other tiers
 * when the tier runs dry. A player whose strategy (`bandId`) has an own augment of the tier gets it in the first slot [the
 * user's table names the tier of each; that it always shows is an assumption to confirm] — unless the player already holds a
 * 专属强化: "每位领袖的专属强化只能选择一项" (the table's note). `allowed(def)` may veto one (哈洛德 III with 维娜 banned, a co-op-only
 * generic one in solo — server/match/match/augments.js augmentAvailable).
 */
export function rollAugments(tier, owned, rng, n = AUGMENT_OFFERS, bandId = null, allowed = null, classCounts = null, rarity = null, strictRarity = false) {
  const skip = new Set(owned || []);
  const hasOwn = (owned || []).some((id) => AUG_INDEX.get(id)?.band);
  const own = bandId && !hasOwn
    ? AUGMENTS.find((a) => a.band === bandId && a.tier === tier && !(owned || []).includes(a.id) && (!strictRarity || a.rarity===rarity) && (!allowed || allowed(a))) : null;
  // 职业专精 (A6000 fork): the last card, for a profession the player fields CLASS_OFFER_MIN+ times (weighted by how many);
  // with a rolled rarity, of that rarity's band
  const cls = classCounts ? classCard(rarity ? bandOf(rarity) : tier, classCounts, skip, rng, d => (!strictRarity || d.rarity===rarity) && (!allowed || allowed(d))) : null;
  const generic = AUGMENTS.filter((a) => !a.band && !a.cls && !a.pseudo && (!allowed || allowed(a)));
  const k = n - (own ? 1 : 0) - (cls ? 1 : 0);
  let list;
  if (rarity) {
    // the rolled rarity; short of it (a co-op-heavy rarity in solo), the nearest rarities fill in (the lower one first)
    list = generic.filter((a) => a.rarity === rarity && !skip.has(a.id));
    for (let d = 1; !strictRarity && list.length < k && d < 6; d++) {
      for (const r of [rarity - d, rarity + d]) {
        if (r < 1 || r > 6 || list.length >= k) continue;
        const more = generic.filter((a) => a.rarity === r && !skip.has(a.id));
        list = [...list, ...draw(more, k - list.length, rng)];
      }
    }
    const first = list.filter((a) => a.rarity === rarity);
    const rest = list.filter((a) => a.rarity !== rarity);
    const out = [...draw(first, k, rng), ...rest].slice(0, k).map((a) => a.id);
    setBias(out, owned, generic, rarity, rng);
    return [...(own ? [own.id] : []), ...out, ...(cls ? [cls.id] : [])];
  }
  list = generic.filter((a) => a.tier === tier && !skip.has(a.id));
  if (list.length < k) list = [...list, ...generic.filter((a) => a.tier !== tier && !skip.has(a.id))];
  const out = draw(list, k, rng).map((a) => a.id);
  return [...(own ? [own.id] : []), ...out, ...(cls ? [cls.id] : [])];
}

/**
 * 套装 (海克斯第六版): for each set the player holds a member of (in the sets' order), SET_BIAS % that the last generic card
 * of `out` becomes another member of that set of the rolled `rarity` (not held, not offered yet, allowed) — at most one
 * swap per offer. In place. No draw of `rng` for a player without a set member, so older matches roll as before.
 */
function setBias(out, owned, generic, rarity, rng) {
  if (!out.length) return;
  const counts = setCounts(owned);
  if (!counts.size) return;
  for (const setId of counts.keys()) {
    if (!(rng() * 100 < SET_BIAS)) continue;
    const cands = generic.filter((a) => a.rarity === rarity && setOf(a.id) === setId && !(owned || []).includes(a.id) && !out.includes(a.id));
    if (!cands.length) continue;
    if (out.some((id) => setOf(id) === setId)) return;
    out[out.length - 1] = cands[Math.floor(rng() * cands.length)].id;
    return;
  }
}

/**
 * The 职业专精 card of a roll: among the professions the player fields at least CLASS_OFFER_MIN times (`counts`: a Map or
 * an object profession → operators, in the board's order) that still have an augment of `tier` the player may take,
 * one drawn weighted by its count; null when none.
 */
function classCard(tier, counts, skip, rng, allowed) {
  const cands = [];
  let total = 0;
  for (const [prof, c] of counts instanceof Map ? counts : Object.entries(counts || {})) {
    if (!(c >= CLASS_OFFER_MIN)) continue;
    const d = AUGMENTS.find((a) => a.cls === prof && a.tier === tier && !skip.has(a.id) && (!allowed || allowed(a)));
    if (!d) continue;
    cands.push([d, c]);
    total += c;
  }
  if (!cands.length) return null;
  let x = rng() * total;
  for (const [d, c] of cands) {
    x -= c;
    if (x < 0) return d;
  }
  return cands[cands.length - 1][0];
}

