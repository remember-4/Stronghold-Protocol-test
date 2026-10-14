import { reviseAugment } from '../hexRevision.js';
// shared/augments5/g10.js — A6000 fork, 海克斯第六版 (技能、防御、站位、克制（G1–G25）): the definitions of this batch
// (_ops/stronghold-a6000/analysis/海克斯第六版-大扩充.md: rarities, numbers, sets and ids). Built with augR
// (shared/augmentDef.js): rarity 1…6 = 白 绿 蓝 紫 金 红. The effects: server/sim/content/augments5/g10.js (battle) and
// server/match/augments5/g10.js (风水宝地's tiles). The sets (〔疾风〕 〔铁壁〕 〔赌徒〕) are shared/augmentSets.js's.
//
// Number bonuses are the independent multipliers of the generic ones: 造成的伤害提升至 / 提升 X%（连乘） — augDealtMul;
// 受到的伤害降低 — dmgTakenMul; 攻击间隔 — intervalMul; 技力回复速度 — spRecoveryMul (units.js).

import { N_ } from '../i18n.js';
import { augR } from '../augmentDef.js';

export const DEFS = Object.freeze([
  // ---- 技能
  // G1 雷针 〔疾风〕
  augR('aug_lightning_rod', 3, N_('雷针'), N_('作战中，你的干员每开启一次技能，本场所有干员的技力回复速度 +{pct}%（至多 +{max}%）'),
    { pct: 2, max: 30 }, 'battle'),
  // G2 熟能生巧 〔疾风〕
  augR('aug_practice', 4, N_('熟能生巧'), N_('干员每开启一次技能，本场作战中自身造成的伤害提升 {pct}%（连乘，至多提升至 {max}%）'),
    { pct: 3, max: 130 }, 'battle'),
  // G3 技能冲击
  augR('aug_skill_burst', 3, N_('技能冲击'), N_('干员开启技能时，对攻击范围内的敌人造成自身攻击力 {pct}% 的法术伤害（每名干员每 {cd} 秒至多 1 次）'),
    { pct: 80, cd: 5 }, 'battle'),
  // G4 回响 〔疾风〕
  augR('aug_echo_sp', 4, N_('回响'), N_('干员的技能结束时，返还该技能技力消耗的 {pct}%'), { pct: 20 }, 'battle'),
  // G5 充能 〔疾风〕
  augR('aug_charge', 2, N_('充能'), N_('所有干员的技力回复速度 +{pct}%'), { pct: 15 }, 'battle'),
  // G6 起手式 〔疾风〕
  augR('aug_opener_sp', 2, N_('起手式'), N_('干员每次部署时技力 +{sp}'), { sp: 10 }, 'battle'),
  // G7 终极形态
  augR('aug_final_form', 4, N_('终极形态'), N_('每名干员每次部署后第一次开启技能时，获得最大生命 {shield}% 的护盾（持续 {sec} 秒），且本场作战中攻击间隔缩短 {interval}%'),
    { shield: 30, sec: 10, interval: 15 }, 'battle'),
  // ---- 防御
  // G8 镜中境 〔铁壁〕
  augR('aug_mirror', 2, N_('镜中境'), N_('每名敌人对你的干员造成的第一次伤害降低 {pct}%'), { pct: 80 }, 'battle'),
  // G9 墙眼 〔铁壁〕
  augR('aug_wall_eye', 3, N_('墙眼'), N_('干员受到来自自身攻击范围以外的敌人的伤害降低 {pct}%'), { pct: 45 }, 'battle'),
  // G10 老兵 〔铁壁〕
  augR('aug_veteran', 2, N_('老兵'), N_('干员部署 {sec} 秒后，受到的伤害降低 {pct}%'), { sec: 40, pct: 30 }, 'battle'),
  // G11 长明灯
  augR('aug_lamp', 3, N_('长明灯'), N_('每场作战第一名部署的干员造成的伤害提升至 {dealt}%，受到的伤害降低 {taken}%，直到它被击倒'),
    { dealt: 150, taken: 20 }, 'battle'),
  // G12 冬日余晖
  augR('aug_winter_glow', 2, N_('冬日余晖'), N_('敌人被你的干员击倒时，周围 {radius} 格内的敌人获得 {sec} 秒寒冷'), { sec: 3, radius: 1 }, 'battle'),
  // G13 燃油
  augR('aug_gasoline', 3, N_('燃油'), N_('敌人被你的干员击倒时，点燃周围 {radius} 格内的敌人：每秒受到击倒者攻击力 {pct}% 的法术伤害，持续 {sec} 秒'),
    { pct: 30, sec: 4, radius: 1 }, 'battle'),
  // G14 萤火
  augR('aug_firefly', 1, N_('萤火'), N_('敌人被你的干员击倒时，周围 {radius} 格内的干员回复最大生命 {pct}% 的生命'), { pct: 5, radius: 1 }, 'battle'),
  // G15 流弹 〔赌徒〕 (a chance: 幸运)
  augR('aug_stray', 2, N_('流弹'), N_('远程干员每次攻击有 {prob}% 的概率对另一名随机敌人造成攻击力 {pct}% 的伤害'), { prob: 20, pct: 60 }, 'battle'),
  // ---- 站位
  // G16 孤狼
  augR('aug_lone_wolf', 4, N_('孤狼'), N_('周围 8 格内没有其他干员的干员，造成的伤害提升至 {dealt}%，受到的伤害降低 {taken}%'),
    { dealt: 125, taken: 20 }, 'battle'),
  // G17 双璧 〔铁壁〕
  augR('aug_twin_wall', 2, N_('双璧'), N_('你最右一列的干员恰好有 {n} 名时，它们受到的伤害降低 {taken}%，造成的伤害提升至 {dealt}%'),
    { n: 2, taken: 35, dealt: 115 }, 'battle'),
  // G18 前排掩护
  augR('aug_cover', 3, N_('前排掩护'), N_('你最右两列的干员每有 1 名，其余干员造成的伤害提升 {pct}%（连乘，至多算 {max} 名）'), { pct: 3, max: 4 }, 'battle'),
  // G19 最后防线 〔铁壁〕
  augR('aug_last_line', 2, N_('最后防线'), N_('蓝门（保护点）周围 {dist} 格内的干员阻挡数 +{block}，受到的伤害降低 {taken}%'),
    { dist: 2, block: 1, taken: 25 }, 'battle'),
  // G20 风水宝地 (the tiles: server/match/augments5/g10.js; the prep board's gold frame: public/js/screens/game.js)
  augR('aug_feng_shui', 3, N_('风水宝地'), N_('每回合开始时随机标出 {n} 个可部署的格子（休整期在棋盘上描金边）：本回合站在上面的干员造成的伤害提升至 {dealt}%'),
    { n: 2, dealt: 135 }, 'battle'),
  // G21 寒冰之心 〔铁壁〕
  augR('aug_frozen_heart', 2, N_('寒冰之心'), N_('被你的干员阻挡的敌人攻击间隔延长 {pct}%'), { pct: 25 }, 'battle'),
  // ---- 克制 (特训敌人: 频次 TIMES, 元素 ELEMENT, 持续 DOT, 折射 REFLECTION)
  // G22 连击专家
  augR('aug_vs_times', 1, N_('连击专家'), N_('你的干员对「频次」敌人（要打一定次数才能击破）造成的每次伤害算作 {n} 次'), { n: 2 }, 'battle'),
  // G23 元素抗性
  augR('aug_vs_element', 1, N_('元素抗性'), N_('干员受到的元素损伤降低 {pct}%'), { pct: 40 }, 'battle'),
  // G24 净化
  augR('aug_vs_dot', 1, N_('净化'), N_('干员受到的持续伤害（燃烧、中毒、流血等）降低 {pct}%'), { pct: 40 }, 'battle'),
  // G25 防反光: 折射 here is "生效时，法术抗性+70" (ba.refraction; content/enemies/archetypes.js refraction) — no enemy
  // reflects damage, so the counter is to that RES (强折射's +RES included)
  augR('aug_vs_reflect', 1, N_('防反光'), N_('你的干员攻击「折射」敌人时，无视折射提供的法术抗性的 {pct}%'), { pct: 60 }, 'battle'),
].map(reviseAugment));

/**
 * Bot preference of this batch's augments (server/match/match/augments.js BOT_AUGMENT): the plain battle numbers a bot's
 * board uses without a plan mid-table; the positional ones (a bot does not arrange for them) lower; the four counters
 * (worth something only against their enemy type) lowest.
 */
export const BOT = Object.freeze({
  aug_lightning_rod: 5, aug_practice: 5, aug_skill_burst: 5, aug_echo_sp: 5, aug_charge: 5, aug_opener_sp: 4, aug_final_form: 6,
  aug_mirror: 4, aug_wall_eye: 5, aug_veteran: 5, aug_lamp: 4, aug_winter_glow: 4, aug_gasoline: 5, aug_firefly: 3, aug_stray: 4,
  aug_lone_wolf: 3, aug_twin_wall: 3, aug_cover: 4, aug_last_line: 4, aug_feng_shui: 3, aug_frozen_heart: 4,
  aug_vs_times: 2, aug_vs_element: 2, aug_vs_dot: 2, aug_vs_reflect: 2,
});
