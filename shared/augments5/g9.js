// shared/augments5/g9.js — A6000 fork, 海克斯第六版 (战斗：伤害与条件（F1–F20）): the definitions of this batch
// (_ops/stronghold-a6000/analysis/海克斯第六版-大扩充.md: rarities, numbers, sets and ids). Built with augR
// (shared/augmentDef.js): rarity 1…6 = 白 绿 蓝 紫 金 红. The effects: server/sim/content/augments5/g9.js (battle, prep)
// and server/match/augments5/g9.js (香蕉's roll at the settlement).
//
// The analysis writes the multipliers as ×1.25; the texts say them the way every older 海克斯 does (造成的伤害提升至 125%:
// augDealtMul; 受到的伤害降低: dmgTakenMul; 攻击间隔缩短: intervalMul). The 套装 of the members (开局冲锋, 绝地反击, 香蕉, 乱码,
// 今日之星, 处刑人, 巨人杀手, 狂热, 战争机器, 同仇敌忾, 无限火力) are in shared/augmentSets.js. `battleCoins` (今日之星): the most
// coins the augment adds in one battle — a client result's coin bound counts it (server/match/fields.js specBounds).

import { N_ } from '../i18n.js';
import { augR } from '../augmentDef.js';

export const DEFS = Object.freeze([
  // F1 开局冲锋 〔疾风〕
  augR('aug_opening', 2, N_('开局冲锋'), N_('开战后 {sec} 秒内，所有干员造成的伤害提升至 {dealt}%'), { sec: 20, dealt: 125 }, 'battle'),
  // F2 绝地反击 〔铁壁〕
  augR('aug_comeback', 3, N_('绝地反击'), N_('目标生命每比初始值少 1 点，所有干员造成的伤害提升 {pct}%（连乘，至多提升至 {cap}%）'),
    { pct: 1, cap: 125 }, 'both'),
  // F3 香蕉 〔赌徒〕
  augR('aug_banana', 3, N_('香蕉'), N_('所有干员造成的伤害提升至 {dealt}%；每回合结束时有 1/{odds} 的概率被吃掉（失效）；被吃掉时有 1/{grow} 的概率长出「卡文迪什」：造成的伤害改为提升至 {cavendish}%，不会再被吃掉'),
    { dealt: 115, odds: 6, grow: 3, cavendish: 125 }, 'both'),
  // F4 乱码 〔赌徒〕
  augR('aug_misprint', 2, N_('乱码'), N_('每场作战开始时随机决定：所有干员造成的伤害变为 {low}%～{high}%（均匀分布，平均 {avg}%）'),
    { low: 85, high: 135, avg: 110 }, 'battle'),
  // F5 今日之星 〔赌徒〕
  augR('aug_star_of_day', 4, N_('今日之星'), N_('每回合随机选你场上一名能造成伤害的干员当「今日之星」：本回合它造成的伤害提升至 {dealt}%，受到的伤害降低 {taken}%，每击倒一个敌人有 {pct}% 的概率掉落 1 资金（下回合发放；每回合至多 {battleCoins}，联防中不掉落）'),
    { dealt: 180, taken: 35, pct: 5, battleCoins: 2 }, 'both'),
  // F6 玻璃心
  augR('aug_glass_heart', 3, N_('玻璃心'), N_('所有干员造成的伤害提升至 {dealt}%；本场作战有干员被击倒后失效（下一场恢复）'), { dealt: 125 }, 'battle'),
  // F7 剑锤
  augR('aug_sword_hammer', 4, N_('剑锤'), N_('所有干员的部署费用 +{cost}，造成的伤害提升至 {dealt}%，受到的伤害降低 {taken}%'),
    { cost: 3, dealt: 120, taken: 15 }, 'battle'),
  // F8 珍贵的玻璃
  augR('aug_shaped_glass', 5, N_('珍贵的玻璃'), N_('所有干员造成的伤害提升至 {dealt}%，但最大生命 −{hp}%'), { dealt: 160, hp: 40 }, 'battle'),
  // F9 大静谧
  augR('aug_silence', 3, N_('大静谧'), N_('你战场上的非领袖敌人生命 −{pct}%'), { pct: 15 }, 'battle'),
  // F10 趁虚而入
  augR('aug_exploit', 3, N_('趁虚而入'), N_('被晕眩、冻结、沉睡或束缚的敌人受到你造成的伤害提升 {pct}%'), { pct: 30 }, 'battle'),
  // F11 处刑人 〔斩首〕
  augR('aug_executioner', 3, N_('处刑人'), N_('对生命低于 {below}% 的敌人造成的伤害提升至 {pct}%（领袖也算）'), { below: 35, pct: 130 }, 'battle'),
  // F12 巨人杀手 〔斩首〕
  augR('aug_giant_slayer', 4, N_('巨人杀手'), N_('对精英敌人和领袖造成的伤害提升至 {pct}%'), { pct: 120 }, 'battle'),
  // F13 腐蚀
  augR('aug_corrosion', 3, N_('腐蚀'), N_('你的干员每命中一次，目标的防御力和法术抗性 −{pct}%（叠加，至多 −{max}%；领袖至多 −{boss}%）'),
    { pct: 1.5, max: 30, boss: 15 }, 'battle'),
  // F14 双发
  augR('aug_double_shot', 4, N_('双发'), N_('远程干员每次普通攻击额外对攻击范围内另一名敌人造成 {pct}% 的伤害（多段攻击只算一次，治疗不算）'),
    { pct: 35 }, 'battle'),
  // F15 狂热 〔疾风〕
  augR('aug_frenzy', 4, N_('狂热'), N_('开战后每 {every} 秒，所有干员攻击间隔缩短 {pct}%（至多缩短 {max}%）'), { every: 5, pct: 3, max: 30 }, 'battle'),
  // F16 定时震荡
  augR('aug_pulse', 4, N_('定时震荡'), N_('开战第 {t1}、{t2}、{t3} 秒，晕眩你战场上所有敌人 {sec} 秒（领袖 {boss} 秒）'),
    { t1: 15, t2: 35, t3: 55, sec: 1.5, boss: 0.5 }, 'battle'),
  // F17 战争机器 〔疾风〕
  augR('aug_war_machine', 5, N_('战争机器'), N_('所有干员造成的伤害提升至 {dealt}%，受到的伤害降低 {taken}%，攻击间隔缩短 {interval}%，技力回复速度 +{sp}%'),
    { dealt: 110, taken: 10, interval: 10, sp: 10 }, 'battle'),
  // F18 同仇敌忾 〔叠层〕
  augR('aug_verticality', 3, N_('同仇敌忾'), N_('每名干员造成的伤害提升 {pct}% × 场上与它同属一个盟约的其他干员数（至多提升至 {cap}%）'),
    { pct: 2, cap: 114 }, 'battle'),
  // F19 天火
  augR('aug_skyfire', 6, N_('天火'), N_('作战中每 {every} 秒，对你战场上所有敌人造成你干员最高攻击力 {pct}% 的法术伤害（领袖受到一半）'),
    { every: 20, pct: 150 }, 'battle'),
  // F20 无限火力 〔疾风〕
  augR('aug_urf', 6, N_('无限火力'), N_('所有技能的技力消耗 −{cost}%、持续时间 −{dur}%（弹药类技能的弹药数同样减少）；所有干员攻击间隔缩短 {interval}%'),
    { cost: 35, dur: 15, interval: 10 }, 'battle'),
]);

/**
 * Bot preference of this batch's augments (server/match/match/augments.js BOT_AUGMENT): the plain battle numbers a bot's
 * board always uses mid-to-high, the conditional ones (control, ranged operators, LP lost, a knock-out) lower, the gambles
 * low.
 */
export const BOT = Object.freeze({
  aug_war_machine: 7, aug_urf: 7, aug_sword_hammer: 6, aug_shaped_glass: 6, aug_frenzy: 6, aug_skyfire: 6,
  aug_opening: 5, aug_silence: 5, aug_executioner: 5, aug_giant_slayer: 5, aug_corrosion: 5, aug_double_shot: 5, aug_pulse: 5,
  aug_verticality: 5, aug_comeback: 4, aug_glass_heart: 4, aug_banana: 4,
  aug_exploit: 3, aug_misprint: 3, aug_star_of_day: 3,
});
