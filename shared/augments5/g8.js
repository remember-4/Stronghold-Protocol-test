import { reviseAugment } from '../hexRevision.js';
// shared/augments5/g8.js — A6000 fork, 海克斯第六版 (任务、成长与延迟回报（D1–D11、E1–E12）): the definitions of this batch
// (_ops/stronghold-a6000/analysis/海克斯第六版-大扩充.md: rarities, numbers, sets and ids). Built with augR
// (shared/augmentDef.js): rarity 1…6 = 白 绿 蓝 紫 金 红. The effects: server/sim/content/augments5/g8.js (battle, prep) and
// server/match/augments5/g8.js (未来规划's LP, 负重前行's hand slots).
//
// 任务 (the analysis 1.2): a goal counted from the pick on (what came before does not count); the EffectRef's counter shows
// what is left, 0 once done — the moment it is done a ticker line 「{name} 完成了{aug}」 and the reward. Number bonuses are
// the independent multipliers of the generic ones (造成的伤害提升至 — augDealtMul; 受到的伤害提升 — dmgTakenMul; 攻击间隔 —
// intervalMul; 最大生命 — hpMul); a growing one (越战越勇, 灵魂收割, 坦克引擎, 长胜将军) adds its steps inside its own
// multiplier, up to its cap. `item` (博士投影) and `tier` name what a reward is.

import { N_ } from '../i18n.js';
import { augR } from '../augmentDef.js';

/** 博士投影 (as 投影补给's). */
const PROJECTOR = 'chess_item_5_06_e_a';

export const DEFS = Object.freeze([
  // ---- D. 任务
  // D1 任务·百炼
  augR('aug_q_forge', 3, N_('任务·百炼'), N_('任务：拿到后累计合成 {n} 次精锐。完成时获得 1 个<博士投影>和 {funds} 资金'),
    { n: 4, funds: 3, item: PROJECTOR }, 'meta'),
  // D2 任务·登峰
  augR('aug_q_summit', 5, N_('任务·登峰'), N_('任务：你任一盟约达到 {layers} 层。完成后，该盟约的成员造成的伤害提升至 {dealt}%'),
    { layers: 300, dealt: 125 }, 'both'),
  // D3 任务·完美主义
  augR('aug_q_perfect', 3, N_('任务·完美主义'), N_('任务：拿到后累计 {n} 回合完美作战。完成时获得 1 名随机 {tier} 阶干员和 {funds} 资金'),
    { n: 5, tier: 6, funds: 4 }, 'meta'),
  // D4 任务·挥金如土
  augR('aug_q_spender', 2, N_('任务·挥金如土'), N_('任务：拿到后累计花费 {n} 资金。完成后每回合开始时获得 {funds} 资金'),
    { n: 70, funds: 2 }, 'meta'),
  // D5 任务·刷新狂人
  augR('aug_q_roller', 2, N_('任务·刷新狂人'), N_('任务：拿到后累计主动刷新 {n} 次。完成后每回合前 {free} 次主动刷新免费'),
    { n: 20, free: 2 }, 'meta'),
  // D6 任务·苦尽甘来
  augR('aug_q_comeback', 2, N_('任务·苦尽甘来'), N_('任务：拿到后累计扣除 {n} 点目标生命。完成时获得 1 名随机 {tier} 阶干员和 {funds} 资金'),
    { n: 8, tier: 6, funds: 6 }, 'meta'),
  // D7 任务·一夫当关
  augR('aug_q_hero', 4, N_('任务·一夫当关'), N_('任务：一场作战中单名干员击倒 {n} 个敌人。完成时该干员立即晋升精锐（已是精锐改为获得 1 个<博士投影>）'),
    { n: 20, item: PROJECTOR }, 'meta'),
  // D8 任务·广纳贤才
  augR('aug_q_recruiter', 2, N_('任务·广纳贤才'), N_('任务：拿到后累计获得过 {n} 名不同的干员。完成时获得 {funds} 资金'),
    { n: 20, funds: 10 }, 'meta'),
  // D9 任务·百花齐放
  augR('aug_q_bloom', 4, N_('任务·百花齐放'), N_('任务：同时有 {n} 个已激活盟约（调和、协防不算）。完成后每次休整期结束时，所有已激活盟约 +{layer} 层'),
    { n: 5, layer: 2 }, 'meta'),
  // D10 任务·武装到牙齿
  augR('aug_q_armed', 4, N_('任务·武装到牙齿'), N_('任务：场上干员同时携带 {n} 件装备。完成时获得 {items} 件随机 {tier} 阶装备'),
    { n: 10, items: 2, tier: 6 }, 'meta'),
  // D11 任务·速通 (never offered after round 8: augmentAvailable reads maxRound)
  augR('aug_q_speedrun', 5, N_('任务·速通'), N_('任务：第 {round} 回合结束前把调度中心升到 {level} 级。完成时获得 {chess} 名随机 {tier} 阶干员'),
    { round: 8, level: 6, chess: 2, tier: 6 }, 'meta', { maxRound: 8 }),

  // ---- E. 成长、衰减与延迟回报
  // E1 金蛋
  augR('aug_golden_egg', 4, N_('金蛋'), N_('一颗金蛋 {rounds} 回合后孵化（你每完美作战一回合，提前 1 回合）：获得 1 名随机 {tier} 阶精锐干员和 {funds} 资金'),
    { rounds: 8, tier: 6, funds: 8 }, 'meta'),
  // E2 未来规划
  augR('aug_future', 4, N_('未来规划'), N_('拿到时扣除 {lp} 点目标生命（不会低于 1 点）；{rounds} 回合后获得 {chess} 名随机 {tier} 阶干员和 1 个<博士投影>'),
    { lp: 3, rounds: 3, chess: 3, tier: 5, item: PROJECTOR }, 'meta'),
  // E3 远征
  augR('aug_expedition', 4, N_('远征'), N_('每回合开始时，整备区最右边的干员离队去远征（还回卡池，不返还资金；整备区没有干员的回合不算）；累计远征 {n} 名后，获得 1 名随机 {tier} 阶干员和 1 个<博士投影>'),
    { n: 5, tier: 6, item: PROJECTOR }, 'meta'),
  // E4 负重前行
  augR('aug_burden', 3, N_('负重前行'), N_('接下来 {rounds} 回合整备区只能使用最右边的 {slots} 格（其余格子里已有的单位不动，但不能再放入）；之后获得 {items} 件随机 {tier} 阶装备'),
    { rounds: 3, slots: 5, items: 2, tier: 5 }, 'meta'),
  // E5 爆米花
  augR('aug_popcorn', 4, N_('爆米花'), N_('拿到时所有干员造成的伤害提升至 {dealt}%，之后每过一回合降低 {drop}%（{rounds} 回合后恢复为 100%）'),
    { dealt: 140, drop: 5, rounds: 8 }, 'both'),
  // E6 越战越勇
  augR('aug_grit', 4, N_('越战越勇'), N_('拿到后每过一个回合，所有干员造成的伤害提升 {pct}%（整局累计，至多提升至 {max}%）'),
    { pct: 2, max: 124 }, 'both'),
  // E7 灵魂收割
  augR('aug_reaper', 5, N_('灵魂收割'), N_('你的干员每累计击倒 {per} 个敌人，所有干员造成的伤害永久提升 {pct}%（至多提升至 {max}%）'),
    { per: 25, pct: 1, max: 130 }, 'both'),
  // E8 坦克引擎
  augR('aug_tank_engine', 3, N_('坦克引擎'), N_('你的干员每累计击倒 {per} 个敌人，所有干员的最大生命永久提升 {pct}%（至多提升至 {max}%）'),
    { per: 25, pct: 1, max: 130 }, 'both'),
  // E9 长胜将军
  augR('aug_win_streak', 5, N_('长胜将军'), N_('每连续完美作战 1 回合，所有干员造成的伤害提升 {pct}%（至多提升至 {max}%）；有敌人漏过时清零'),
    { pct: 5, max: 130 }, 'both'),
  // E10 混沌契约·力量
  augR('aug_chaos_power', 5, N_('混沌契约·力量'), N_('接下来 {rounds} 回合（含本回合）你的干员受到的伤害提升 {taken}%；之后整局所有干员造成的伤害提升至 {dealt}%'),
    { rounds: 3, taken: 30, dealt: 130 }, 'both'),
  // E11 混沌契约·财富
  augR('aug_chaos_wealth', 3, N_('混沌契约·财富'), N_('接下来 {rounds} 回合的收入各 −{loss}；之后每回合收入 +{gain}'),
    { rounds: 3, loss: 3, gain: 3 }, 'meta'),
  // E12 混沌契约·迅捷
  augR('aug_chaos_speed', 4, N_('混沌契约·迅捷'), N_('接下来 {rounds} 回合（含本回合）所有干员的攻击间隔延长 {slow}%；之后整局所有干员的攻击间隔缩短 {fast}%'),
    { rounds: 3, slow: 20, fast: 25 }, 'both'),
].map(reviseAugment));

/**
 * Bot preference of this batch's augments (server/match/match/augments.js BOT_AUGMENT): the 任务 3–4, the steady battle
 * ones 5–6; the ones whose cost a bot cannot steer around (远征 sends its bench away, 负重前行 closes half the bench,
 * 未来规划 costs LP) low.
 */
export const BOT = Object.freeze({
  aug_q_forge: 4, aug_q_summit: 4, aug_q_perfect: 3, aug_q_spender: 4, aug_q_roller: 3, aug_q_comeback: 3, aug_q_hero: 3,
  aug_q_recruiter: 4, aug_q_bloom: 4, aug_q_armed: 3, aug_q_speedrun: 3,
  aug_golden_egg: 4, aug_future: 3, aug_expedition: 2, aug_burden: 2, aug_popcorn: 5, aug_grit: 5, aug_reaper: 6,
  aug_tank_engine: 5, aug_win_streak: 5, aug_chaos_power: 5, aug_chaos_wealth: 3, aug_chaos_speed: 5,
});
