// shared/augments5/g5.js — A6000 fork, 海克斯第六版 (海克斯本身、套装效果、幸运（A1–A12、7 个套装）): the definitions of this batch
// (_ops/stronghold-a6000/analysis/海克斯第六版-大扩充.md: rarities, numbers, sets and ids). Built with augR
// (shared/augmentDef.js): rarity 1…6 = 白 绿 蓝 紫 金 红. The effects: server/sim/content/augments5/g5.js (the battle parts,
// the prep parts and the 套装 bonuses — the pseudo augments of shared/augmentSets.js SET_DEFS) and
// server/match/augments5/g5.js (the picks that act on the AUGMENT phase itself or on the augments held, 〔铁壁〕's LP cap,
// 〔坏人〕). Their sets: shared/augmentSets.js (增幅, 盲盒, 炼金术, 幸运星 〔赌徒〕; 预支 〔生财〕).

import { N_ } from '../i18n.js';
import { augR } from '../augmentDef.js';

/**
 * A card about "your next augment" (增幅, 预支, 加购, 预约券) is offered up to this round only: the last AUGMENT round
 * (shared/augments.js AUGMENT_ROUNDS: every round 1–13 — not imported here, it imports this file) has no next one, so
 * there it would do nothing (预支: be 8 free funds).
 */
const BEFORE_LAST = 12;
const NEXT = Object.freeze({ maxRound: BEFORE_LAST });

export const DEFS = Object.freeze([
  // A1 增幅 (TFT 增幅之力)
  augR('aug_amplify', 1, N_('增幅'), N_('你下一次海克斯的稀有度 +{n}（红色不再升）'), { n: 1 }, 'meta', NEXT),
  // A2 预支 (TFT 预付贷款)
  augR('aug_advance', 2, N_('预支'), N_('立即获得 {funds} 资金；你下一次海克斯的稀有度 −{n}（白色不再降）'), { funds: 8, n: 1 }, 'meta', NEXT),
  // A3–A6 盲盒 (TFT 白银命运; 海克斯大乱斗 为王加冕)
  augR('aug_mystery1', 1, N_('盲盒·白'), N_('立即获得一个随机的白色海克斯（不会是盲盒，也不会是你已有的），并获得 {funds} 资金'), { funds: 2 }, 'meta'),
  augR('aug_mystery3', 3, N_('盲盒·蓝'), N_('立即获得一个随机的蓝色海克斯（不会是盲盒，也不会是你已有的），并获得 {funds} 资金'), { funds: 3 }, 'meta'),
  augR('aug_mystery5', 5, N_('盲盒·金'), N_('立即获得一个随机的金色海克斯（不会是盲盒，也不会是你已有的），并获得 {funds} 资金'), { funds: 4 }, 'meta'),
  augR('aug_mystery6', 6, N_('盲盒·红'), N_('立即获得一个随机的红色海克斯（不会是盲盒，也不会是你已有的），并获得 {funds} 资金'), { funds: 5 }, 'meta'),
  // A7 加购
  augR('aug_extra_card', 2, N_('加购'), N_('之后每次海克斯多 {n} 张同稀有度的通用卡（3 选 1 变成 4 选 1）'), { n: 1 }, 'meta', NEXT),
  // A8 预约券 (炉石酒馆 旅行券)
  augR('aug_voucher', 5, N_('预约券'), N_('下一次海克斯时你选两次：选完第一组，再抽一次稀有度、再给一组'), { n: 1 }, 'meta', NEXT),
  // A9 炼金术 (海克斯大乱斗 转化)
  augR('aug_alchemy', 3, N_('炼金术'), N_('拿到时，你最早获得的一个通用海克斯换成随机的、高 {steps} 档的通用海克斯（白→蓝、绿→紫、蓝→金、紫及以上→红）；它已经发生过的一次性效果不退'),
    { steps: 2 }, 'meta'),
  // A10 献祭之刃 (小丑牌 仪式匕首): ×(base + per × the removed one's rarity) % — r1…r6 are those sums (the text's list)
  augR('aug_dagger', 5, N_('献祭之刃'), N_('拿到时移除你最早获得的一个通用海克斯；之后所有干员造成的伤害按它的稀有度提升至：白 {r1}%、绿 {r2}%、蓝 {r3}%、紫 {r4}%、金 {r5}%、红 {r6}%（没有可移除的为 {base}%）'),
    { base: 110, per: 4, r1: 114, r2: 118, r3: 122, r4: 126, r5: 130, r6: 134 }, 'both'),
  // A11 收藏家 (小丑牌 棒球卡): (1 + pct %)^(the rarities held) — `five` is the text's example
  augR('aug_collector', 5, N_('收藏家'), N_('你的海克斯（专属强化、职业专精和这张都算）每有一种不同的稀有度，所有干员造成的伤害提升 {pct}%（连乘，5 种约提升至 {five}%）'),
    { pct: 4.5, five: 125 }, 'both'),
  // A12 幸运星 (小丑牌 全是 6！): shared/luck.js reads it (×2 — `mul` is the text's), in the prep and in battle
  augR('aug_lucky_star', 4, N_('幸运星'), N_('幸运 ×{mul}（带概率的海克斯：好结果的概率乘以幸运，坏结果的概率除以幸运；掷骰和随机倍率掷两次取好的）'),
    { mul: 2 }, 'both'),
]);

/**
 * Bot preference of this batch's augments (server/match/match/augments.js BOT_AUGMENT): what the AUGMENT phase gives a bot
 * anyway (盲盒: a card of its rarity and funds; 预约券: one more pick) mid-table, the levers a bot cannot plan with
 * (增幅, 加购) lower, 幸运星 (worth something only beside the chance augments) low.
 */
export const BOT = Object.freeze({
  aug_amplify: 3, aug_advance: 4, aug_mystery1: 3, aug_mystery3: 4, aug_mystery5: 5, aug_mystery6: 6, aug_extra_card: 3,
  aug_voucher: 5, aug_alchemy: 4, aug_dagger: 5, aug_collector: 5, aug_lucky_star: 2,
});
