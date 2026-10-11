// shared/augments5/g3.js — A6000 fork, 海克斯第五版 (单人节目效果（O1–O10、O12、O13、O15–O18）): the definitions of this batch
// (_ops/stronghold-a6000/analysis/海克斯第五版候选-联动与节目效果.md). Built with augR (shared/augmentDef.js): rarity 1…6
// = 白 绿 蓝 紫 金 红. The effects: server/sim/content/augments5/g3.js.

import { N_ } from '../i18n.js'; // eslint-disable-line no-unused-vars
import { augR } from '../augmentDef.js'; // eslint-disable-line no-unused-vars

/**
 * Single-player show pieces (the analysis' O list, 「这一稿」 numbers). Number bonuses are the independent multipliers of
 * the generic ones (造成的伤害提升至 X% — augDealtMul; 受到的伤害降低 — dmgTakenMul; the giant's ×1.6 / ×1.3 are written as
 * 提升至 160% / 130%: hpMul / atkMul). `battleCoins` (招财猫): the most coins the augment adds in one battle — a client
 * result's coin bound counts it (server/match/fields.js specBounds).
 */
export const DEFS = Object.freeze([
  // O1 巨人化
  augR('aug_giant', 4, N_('巨人化'), N_('每场作战开始时，你阶级最高的干员（同阶取攻击力最高）变成巨人：体型放大，最大生命提升至 {hp}%，攻击力提升至 {atk}%，阻挡数 +{block}，攻击间隔延长 {interval}%'),
    { hp: 160, atk: 130, block: 1, interval: 15, scale: 160 }, 'battle'),
  // O2 影分身
  augR('aug_shadow_clone', 6, N_('影分身'), N_('每场作战开始 {delay} 秒后，你攻击力最高的干员在身边空位召唤 {n} 个影分身：最大生命和攻击力为本体的 {pct}%，持续 {sec} 秒'),
    { delay: 10, n: 2, pct: 30, sec: 25 }, 'battle'),
  // O3 天降正义
  augR('aug_meteor', 4, N_('天降正义'), N_('每 {every} 秒，一颗陨石砸向敌人最密集处：对半径 {radius} 格内的敌人造成你最高攻击力 {pct}% 的法术伤害并晕眩 {stun} 秒（领袖只受伤害）'),
    { every: 15, radius: 1.5, pct: 200, stun: 0.5 }, 'battle'),
  // O4 时间停止
  augR('aug_time_stop', 6, N_('时间停止'), N_('每场作战中第一次有敌人走到离保护点 {dist} 格以内时，所有敌人停止行动 {sec} 秒（领袖也会停止，期间仍会受到伤害）'),
    { dist: 2, sec: 3 }, 'battle'),
  // O5 艺术就是爆炸
  augR('aug_art_blast', 4, N_('艺术就是爆炸'), N_('你的干员被击倒时爆炸：对周围 {radius} 格内的敌人造成该干员最大生命 {pct}% 的物理伤害（领袖受到一半）'),
    { radius: 1.5, pct: 30 }, 'battle'),
  // O6 连锁闪电
  augR('aug_chain_lightning', 3, N_('连锁闪电'), N_('干员每第 {n} 次攻击放出闪电，在 {jumps} 名敌人之间弹跳，各造成该干员攻击力 {pct}% 的法术伤害'),
    { n: 5, jumps: 3, pct: 50 }, 'battle'),
  // O7 俄罗斯轮盘
  augR('aug_roulette', 3, N_('俄罗斯轮盘'), N_('每回合作战前转动一次：1/{odds} 的概率随机一名场上干员中弹，本回合无法部署；否则本回合所有干员造成的伤害提升至 {dealt}%'),
    { odds: 6, dealt: 115 }, 'both'),
  // O8 命运骰子
  augR('aug_fate_dice', 1, N_('命运骰子'), N_('每回合作战前掷一次骰子：1 点本回合干员造成的伤害降低至 {low}%；2～5 点提升至 {mid}%；6 点提升至 {high}%，并在敌人出现时晕眩场上所有敌人 {stun} 秒'),
    { low: 90, mid: 105, high: 125, stun: 1 }, 'both'),
  // O9 彩票站
  augR('aug_lottery', 1, N_('彩票站'), N_('每回合开始时自动花 {cost} 资金买一张彩票：{jackpotPct}% 中头奖 {jackpot} 资金（每局至多 1 次），{prizePct}% 中 {prize} 资金，其余落空；资金不足时不买'),
    { cost: 1, jackpotPct: 1, jackpot: 25, prizePct: 10, prize: 4 }, 'meta'),
  // O10 双倍或归零
  augR('aug_double_or_nothing', 3, N_('双倍或归零'), N_('每回合 1 次，休整期点击此海克斯押注：本回合完美作战则下回合收入翻倍，否则下回合收入为 0'),
    { mul: 2 }, 'meta', { action: true }),
  // O12 复仇者
  augR('aug_avenger', 2, N_('复仇者'), N_('你的干员被击倒时，场上攻击力最高的其他干员下一次攻击造成的伤害提升至 {pct}%'),
    { pct: 200 }, 'battle'),
  // O13 六星连珠
  augR('aug_six_stars', 5, N_('六星连珠'), N_('场上同时有 1～6 阶干员各至少 1 名时，所有干员造成的伤害提升至 {dealt}%，技力回复速度 +{sp}%'),
    { dealt: 120, sp: 20 }, 'battle'),
  // O15 偷袭
  augR('aug_sneak_attack', 2, N_('偷袭'), N_('最终攻势开始时，立即对领袖造成其生命上限 {pct}% 的伤害（不算攻击，不受限伤影响）'),
    { pct: 2 }, 'both'),
  // O16 招财猫
  augR('aug_lucky_cat', 1, N_('招财猫'), N_('你的干员每击倒一名敌人，有 {pct}% 的概率掉落 1 资金（下回合发放；每回合至多 {battleCoins}，联防中不掉落）'),
    { pct: 5, battleCoins: 2 }, 'battle'),
  // O17 回光返照
  augR('aug_last_light', 6, N_('回光返照'), N_('每局一次：目标生命降到 {below} 点以下时（包括降到 0 以下），在淘汰前立即回到 {to} 点，之后 {rounds} 回合所有干员造成的伤害提升至 {dealt}%'),
    { below: 5, to: 8, rounds: 2, dealt: 120 }, 'both'),
  // O18 嘲讽大师
  augR('aug_taunt_master', 3, N_('嘲讽大师'), N_('每场作战中，敌人第一次靠近你生命上限最高的干员时，它嘲讽周围敌人 {sec} 秒，期间受到的伤害降低 {taken}%'),
    { sec: 8, taken: 30 }, 'battle'),
]);

/**
 * Bot preference of this batch's augments (server/match/match/augments.js BOT_AUGMENT): the steady battle ones mid-table,
 * the gambles and the economy ones low, the click one (双倍或归零: a bot never bets) lowest.
 */
export const BOT = Object.freeze({
  aug_giant: 5, aug_shadow_clone: 4, aug_meteor: 5, aug_time_stop: 4, aug_art_blast: 3, aug_chain_lightning: 5,
  aug_roulette: 2, aug_fate_dice: 2, aug_lottery: 1, aug_double_or_nothing: 1, aug_avenger: 3, aug_six_stars: 3,
  aug_sneak_attack: 3, aug_lucky_cat: 2, aug_last_light: 4, aug_taunt_master: 4,
});
