// shared/enemyBuffs.js — A6000 fork: 敌人强化 (the enemies' upgrades), second version: by tier (the user's design of
// 2026-10-09, _ops/stronghold-a6000/analysis/敌人强化候选.md 第二版). On the vote rounds every alive player votes on one
// of three upgrades that every enemy of the match takes from then on, for good and stacking (a leader at LEADER_SHARE;
// the 首领 options only on leaders, at full value). Each vote first rolls a tier — 白银 / 黄金 / 彩色 — by the room's
// weights (enemyBuffSettings: the host's choice when the room is created, 60 / 30 / 10 and 「第 4 回合不出彩色」 by
// default; a switch turns the votes off), then draws three options of that tier that hit different groups of builds
// (`group`) when the tier allows. The vote right before the Final Assault (round 13) is the 首领专场: its options come
// from the 首领 pool (`boss`), with the same tier roll. shared/augments.js re-exports the names of the first version
// for older callers. The match side: server/match/match/enemyVotes.js; the battle side: server/sim/content/enemyBuffs.js.
// Third version (2026-10-10, _ops/stronghold-a6000/analysis/敌人强化第三版-随海克斯加强.md): the numbers of the first
// two ×~1.15, and 29 new ones (白银 10, 黄金 8, 彩色 3, 首领 8) — limits on our side (部署费用, 再部署, 技力, 治疗, 攻击间隔)
// and a poison for each build the fifth and sixth 海克斯 brought (叠层, 幸运, 召唤, 单核). 霉运 / 叠层税 act in the prep too
// (shared/luck.js, PlayerState.addLayers): never one of 盲盒 / 血月's one-round upgrades.
// Imported by the server, the sim and the client (no Node API here).
//
// A definition: { id, tier 1–3, group, name, desc (msgids, {param} placeholders filled from `params`), params, boss (the
// 首领 pool), coop (co-op only: never offered in solo or with one player alive), show (节目效果: a ticker line when it
// triggers), econ (经济: it only ever takes funds — never gives any), faction (特训加强: offered only while the match's
// schedule still has a round of that special type), noTemp (never one of 盲盒 / 血月's one-round upgrades) }.

import { N_ } from './i18n.js';

/**
 * The vote rounds: every second round, and 13 (the 首领专场) — the user, 2026-10-10 evening: 「海克斯每回合一次，然后敌人
 * 频率也变高」 (was 4 7 10 13). A vote shares its round's 海克斯 phase.
 */
export const VOTE_ROUNDS = Object.freeze([2, 4, 6, 8, 10, 12, 13]);
export const VOTE_OPTIONS = 3;
/** Seconds of a timed vote (solo and single-human matches are untimed). */
export const VOTE_SECONDS = 25;
/** A leader (BOSS rank) takes this share of a generic enemy upgrade's numbers (the 首领 options: all of theirs). */
export const LEADER_SHARE = 0.5;
/** The tiers, as the 海克斯': 1 白银, 2 黄金, 3 彩色 (TIER_NAME: the same msgids as shared/augments.js). */
export const EB_TIERS = Object.freeze([1, 2, 3, 4, 5, 6]);
export const EB_TIER_NAME = Object.freeze({ 1: N_('白'), 2: N_('绿'), 3: N_('蓝'), 4: N_('紫'), 5: N_('金'), 6: N_('彩') });

// Six visible rarities; tier stays the legacy strength band used by blind-box temporary pools.
export const ENEMY_SET_NAMES = Object.freeze({guard:'坚壁', swift:'突进', assault:'强攻', control:'压制', disruption:'干扰', special:'特训', boss:'首领'});
const RARITY_GROUPS = [
 ['eb_swift','eb_range','eb_revenge','eb_trueres','eb_dash','eb_logistics','eb_inflation','eb_jinx','eb_layertax','eb_antisummon'],
 ['eb_vigor','eb_res','eb_evasion','eb_armor','eb_fury','eb_enrage','eb_regen','eb_backup','eb_blink','eb_purify','eb_elitebreak','eb_thief','eb_standin','eb_reverse','eb_redeploy','eb_jam','eb_noheal','eb_artsward'],
 ['eb_vanrush','eb_stealth','eb_blindbox','eb_tariff','eb_flood','eb_spdrain','eb_diminish','eb_steadfast','eb_t_fly','eb_t_times','eb_t_element','eb_t_dot','eb_t_invis','eb_t_refl'],
 ['eb_bulwark','eb_elite','eb_reinforce','eb_shield','eb_adapt','eb_blunt','eb_charge','eb_sunder','eb_medic','eb_mark','eb_potato','eb_wanted','eb_learn','eb_promote','eb_link','eb_bondsap','eb_rush','eb_assassin','eb_bomber'],
 ['eb_command','eb_frenzy','eb_calamity','eb_bloodmoon','eb_throttle','eb_rift'],
 ['eb_surge','eb_steel','eb_split','eb_twins','eb_undying','eb_evolve','eb_legion'],
];
const BOSS_RARITIES = {eb_b_physward:1,eb_b_artsward:1,eb_b_dread:1,eb_b_awe:2,eb_b_guard:2,eb_b_rage:3,eb_b_clock:3,eb_b_escort:3,eb_b_wall:4,eb_b_summon:4,eb_b_barrier:4,eb_b_cap:5,eb_b_resonance:5,eb_b_revive:5,eb_b_tough:6,eb_b_fury:6};
function enemyRarity(id,tier){return BOSS_RARITIES[id] || RARITY_GROUPS.findIndex(a=>a.includes(id))+1 || ({1:2,2:4,3:6})[tier];}
function enemySet(group,boss){if(boss)return 'boss';if(group.startsWith('train'))return 'special';if(['all','phys','arts','chip','burst','mono'].includes(group))return 'guard';if(['nonblock','early','late','count','leak','coverage'].includes(group))return 'swift';if(['front','back','fragile','carry','summon','focus'].includes(group))return 'assault';if(['control','block','stall'].includes(group))return 'control';return 'disruption';}
const eb = (id, tier, group, name, desc, params, extra = null) => Object.freeze({
  id, tier, rarity: enemyRarity(id,tier), set: extra?.faction ? 'special' : enemySet(group,extra?.boss), group, name, desc, params: Object.freeze(params), boss: false, coop: false, show: false, econ: false, faction: null, noTemp: false,
  ...(extra || {}),
});
const SHOW = { show: true };
const COOP_SHOW = { show: true, coop: true, noTemp: true };
const ECON = { econ: true, noTemp: true };
const FACTION = (type) => ({ faction: type, noTemp: true });
const BOSS = { boss: true, noTemp: true };

/**
 * Every enemy upgrade, by tier (the design's §五: A 白银, B 黄金, C 彩色, D 首领专场). `group` = what it mainly hits (the
 * design's 「主要打谁」): a vote's three options avoid sharing one when the tier allows. Battle effects:
 * server/sim/content/enemyBuffs.js; spawns, LP, funds, votes: server/match/match/enemyVotes.js.
 */
export const ENEMY_BUFFS = Object.freeze([
  // --- 白银 (A1–A26): about +12–17 % effective HP against the builds it hits (third version, 2026-10-10: every number
  // of the first two ×~1.15, with the 海克斯 of the fifth and sixth versions — _ops/.../敌人强化第三版-随海克斯加强.md)
  eb('eb_vigor', 1, 'all', N_('强壮'), N_('所有敌人生命 +{hp}%（对领袖无效：领袖的生命是共享血池）'), { hp: 21 }),
  eb('eb_swift', 1, 'nonblock', N_('疾行'), N_('所有敌人移动速度 +{move}%'), { move: 21 }),
  eb('eb_res', 1, 'arts', N_('法抗'), N_('所有敌人法术抗性 +{res}'), { res: 17 }),
  eb('eb_evasion', 1, 'phys', N_('闪避'), N_('敌人有 {pct}% 概率闪避物理攻击'), { pct: 17 }),
  // A5 甲胄 replaces 厚甲 (DEF +30 %, diluted as the operators' ATK grows): an independent multiplier instead
  eb('eb_armor', 1, 'phys', N_('甲胄'), N_('敌人受到的物理伤害 −{pct}%'), { pct: 17 }),
  eb('eb_trueres', 1, 'true', N_('真伤抗性'), N_('敌人受到的真实伤害 −{pct}%'), { pct: 35 }),
  eb('eb_fury', 1, 'front', N_('狂暴'), N_('所有敌人攻击 +{atk}%'), { atk: 43 }),
  eb('eb_enrage', 1, 'front', N_('狂怒'), N_('敌人生命低于 {hpPct}% 时攻击速度 +{aspd}'), { hpPct: 50, aspd: 52 }),
  eb('eb_revenge', 1, 'melee', N_('复仇'), N_('敌人被击倒时，对周围 1 格内的干员造成相当于其攻击力 {pct}% 的物理伤害'), { pct: 85 }),
  eb('eb_regen', 1, 'stall', N_('再生'), N_('敌人每秒回复 {pct}% 最大生命（对领袖无效：共享血池不回复）'), { pct: 1.7 }),
  eb('eb_backup', 1, 'slow', N_('后援'), N_('开战 {sec} 秒后出场的敌人生命 +{hp}%'), { sec: 60, hp: 43 }),
  eb('eb_range', 1, 'back', N_('远射'), N_('远程敌人的攻击范围 +{tiles} 格'), { tiles: 1 }),
  eb('eb_dash', 1, 'chip', N_('冲刺'), N_('敌人生命低于 {hpPct}% 时移动速度 +{move}%'), { hpPct: 50, move: 52 }),
  eb('eb_blink', 1, 'coverage', N_('跃迁'), N_('敌人生命第一次低于 {hpPct}% 时，沿路线向终点瞬移 {tiles} 格（领袖除外）'), { hpPct: 30, tiles: 2 }),
  eb('eb_purify', 1, 'debuff', N_('净化'), N_('敌人身上的脆弱、法术脆弱、减防、减抗和灼燃损伤的减抗持续时间 −{pct}%'), { pct: 70 }),
  eb('eb_elitebreak', 1, 'leak', N_('精英突破'), N_('精英敌人漏过去时扣除 {lp} 点目标生命（仍受每回合扣除上限限制）'), { lp: 3 }),
  eb('eb_thief', 1, 'leak', N_('窃贼'), N_('每回合每个战场出现 1 名窃贼（移动速度 +{move}%，生命减半）：漏掉它不扣目标生命，改为下回合开始时资金 −{funds}'),
    { move: 50, hp: 50, funds: 3 }, SHOW),
  eb('eb_standin', 1, 'single', N_('替身'), N_('每波 1 名敌人生命 ×{hp} 并带嘲讽（干员优先攻击它）'), { hp: 4.5 }, SHOW),
  eb('eb_reverse', 1, 'vote', N_('逆反'), N_('下一次敌人强化投票改为票数最少的选项获胜（平票随机）'), {}, COOP_SHOW),
  eb('eb_t_fly', 1, 'faction', N_('特训加强·制空'), N_('飞行敌人生命 +{hp}%、移动速度 +{move}%'), { hp: 86, move: 35 }, FACTION('FLY')),
  eb('eb_t_times', 1, 'faction', N_('特训加强·繁衍'), N_('频次敌人被击倒后多生成 {n} 个小单位'), { n: 1 }, FACTION('TIMES')),
  eb('eb_t_element', 1, 'faction', N_('特训加强·元素过载'), N_('敌人造成的元素损伤 +{pct}%'), { pct: 86 }, FACTION('ELEMENT')),
  eb('eb_t_dot', 1, 'faction', N_('特训加强·蚀骨'), N_('持续伤害敌人造成的持续伤害 +{pct}%'), { pct: 86 }, FACTION('DOT')),
  eb('eb_t_invis', 1, 'faction', N_('特训加强·匿踪'), N_('隐匿敌人生命 +{hp}%，隐匿时移动速度 +{move}%'), { hp: 69, move: 43 }, FACTION('INVISIBLE')),
  eb('eb_t_refl', 1, 'faction', N_('特训加强·强折射'), N_('折射敌人的折射生效时，法术抗性再 +{res}'), { res: 35 }, FACTION('REFLECTION')),
  eb('eb_inflation', 1, 'econ', N_('通胀'), N_('每回合第 {from} 次及以后的主动刷新价格 +{funds}'), { from: 5, funds: 1 }, ECON),
  // third version (A1–A10 of 敌人强化第三版 §二): limits on our side (危机合约), one poison each for the new builds
  eb('eb_logistics', 1, 'deploy', N_('后勤不足'), N_('我方干员的部署费用 +{cost}'), { cost: 2 }),
  eb('eb_redeploy', 1, 'redeploy', N_('补给延误'), N_('我方干员的再部署时间 +{pct}%'), { pct: 40 }),
  eb('eb_jam', 1, 'skill', N_('信号干扰'), N_('我方干员的技力自然回复速度 −{pct}%'), { pct: 15 }),
  eb('eb_noheal', 1, 'heal', N_('医疗短缺'), N_('我方干员受到的治疗 −{pct}%'), { pct: 30 }),
  eb('eb_artsward', 1, 'arts', N_('法术屏障'), N_('敌人受到的法术伤害 −{pct}%'), { pct: 17 }),
  eb('eb_vanrush', 1, 'early', N_('先锋突击'), N_('每波最先出场的 {n} 名敌人生命 +{hp}%、移动速度 +{move}%'), { n: 3, hp: 40, move: 40 }),
  eb('eb_stealth', 1, 'detect', N_('隐秘行动'), N_('每波随机 {n} 名敌人出场后隐匿 {sec} 秒'), { n: 2, sec: 10 }),
  eb('eb_antisummon', 1, 'summon', N_('召唤克星'), N_('敌人对召唤物造成的伤害 +{pct}%'), { pct: 70 }),
  eb('eb_jinx', 1, 'gamble', N_('霉运'), N_('你的海克斯的幸运 ÷{div}：好结果的概率 ×{good}，坏结果的概率 ×{div}'), { div: 1.25, good: 0.8 }, { noTemp: true }),
  eb('eb_layertax', 1, 'stack', N_('叠层税'), N_('你通过特质获得的盟约层数 −{pct}%（向下取整，每次至少保留 1 层）'), { pct: 10 }, { noTemp: true }),
  // --- 黄金 (B1–B17): about +21–29 %
  eb('eb_bulwark', 2, 'all', N_('坚壁'), N_('所有敌人受到的伤害 −{pct}%（领袖减半）'), { pct: 25 }),
  eb('eb_elite', 2, 'late', N_('精英强化'), N_('精英敌人生命 +{hp}%、攻击 +{atk}%'), { hp: 60, atk: 35 }),
  eb('eb_reinforce', 2, 'count', N_('增援'), N_('敌人数量 +{pct}%（分摊到各出怪批次）'), { pct: 35 }),
  eb('eb_shield', 2, 'all', N_('护盾'), N_('敌人出场时获得 {pct}% 最大生命的护盾；领袖按共享血池的 {leaderPct}% 获得，每场领袖战只给一份（多个战场平分）'),
    { pct: 35, leaderPct: 17 }),
  eb('eb_adapt', 2, 'mono', N_('适应'), N_('你上回合造成最多的伤害类型（物理 / 法术 / 真实），本回合你战场里的敌人受到该类伤害 −{pct}%'), { pct: 35 }),
  eb('eb_blunt', 2, 'burst', N_('钝化'), N_('敌人受到的单次伤害超过其最大生命 {pct}% 的部分减半（领袖不适用）'), { pct: 17 }),
  eb('eb_charge', 2, 'block', N_('冲撞'), N_('敌人被同一名干员阻挡 {sec} 秒后，推开它继续前进（每个敌人每场一次）'), { sec: 3.5 }),
  eb('eb_steadfast', 2, 'control', N_('坚定'), N_('敌人受到的晕眩、冻结、沉睡、束缚、浮空、恐惧、寒冷等控制时间 −{pct}%'), { pct: 80 }),
  eb('eb_diminish', 2, 'control', N_('控制递减'), N_('敌人的一次控制结束后 {sec} 秒内，再受到的控制时间 −{pct}%'), { sec: 7, pct: 80 }),
  eb('eb_sunder', 2, 'front', N_('破甲'), N_('敌人每次攻击使目标防御 −{pct}%，可叠加 {max} 层，持续 {sec} 秒'), { pct: 8, max: 10, sec: 10 }),
  eb('eb_medic', 2, 'chip', N_('医疗兵'), N_('每波随机 {n} 名非领袖敌人成为医疗兵：每 {sec} 秒为周围 {range} 格内的其他敌人回复 {pct}% 最大生命'),
    { n: 3, sec: 3, range: 1.5, pct: 7 }),
  eb('eb_flood', 2, 'leak', N_('决堤'), N_('每回合最多扣除的目标生命 +{n}'), { n: 8 }),
  eb('eb_mark', 2, 'show', N_('点名'), N_('每回合随机点名一名博士，他战场里的敌人生命 +{hp}%'), { hp: 70 }, COOP_SHOW),
  eb('eb_potato', 2, 'show', N_('烫手山芋'), N_('每回合有一个「山芋」敌人（生命 ×{hp}）：漏掉它的博士扣除 {lp} 点目标生命，下回合它带着 ×{grow} 的生命出现在下一名队友的战场；击倒它即结束传递'),
    { hp: 4.5, lp: 3, grow: 1.5 }, COOP_SHOW),
  eb('eb_wanted', 2, 'carry', N_('通缉令'), N_('每名博士上回合造成伤害最多的干员被通缉：敌人优先攻击它，对它造成的伤害 +{pct}%'), { pct: 85 }, SHOW),
  eb('eb_blindbox', 2, 'luck', N_('盲盒'), N_('每回合开战时，敌人随机获得一项白/绿/蓝档基础强化，只在本回合有效'), {}, { show: true, noTemp: true }),
  eb('eb_tariff', 2, 'econ', N_('关税'), N_('每回合第 {from} 名及以后购买的干员价格 +{funds}'), { from: 4, funds: 1 }, ECON),
  // third version (B1–B8)
  eb('eb_spdrain', 2, 'skill', N_('精神污染'), N_('我方干员每受到 1 次攻击失去 {sp} 点技力'), { sp: 1 }),
  eb('eb_learn', 2, 'carry', N_('学习'), N_('同一名干员对同一个敌人的攻击，每 {per} 次使该敌人受到它的伤害 −{pct}%（至多 −{max}%）'), { per: 10, pct: 10, max: 30 }),
  eb('eb_promote', 2, 'early', N_('精英晋升'), N_('每波随机 {n} 名普通敌人晋升为精英：生命 ×{hp}、攻击 ×{atk}'), { n: 2, hp: 2, atk: 1.5 }),
  eb('eb_link', 2, 'burst', N_('连结'), N_('每波的敌人两两连结：一方受到的伤害由两者平分（领袖不参与）'), {}),
  eb('eb_bondsap', 2, 'stack', N_('削弱盟约'), N_('作战中，你层数最高的盟约按少 {pct}% 的层数计算（只影响战斗，真实层数和里程碑不变）'), { pct: 15 }),
  eb('eb_rush', 2, 'stall', N_('时限压缩'), N_('普通回合的作战时限 −{pct}%'), { pct: 15 }),
  eb('eb_assassin', 2, 'back', N_('刺客'), N_('每波 {n} 名敌人成为刺客：不可阻挡，优先攻击我方远程干员'), { n: 2 }),
  eb('eb_bomber', 2, 'block', N_('自爆兵'), N_('每波随机 {n} 名敌人成为自爆兵：被阻挡 {sec} 秒后爆炸，对周围 1 格的干员造成其最大生命 {pct}% 的物理伤害'), { n: 3, sec: 3, pct: 40 }),
  // --- 彩色 (C1–C10): about +35–46 %, every one a mechanism with a counter
  eb('eb_surge', 3, 'count', N_('狂潮'), N_('敌人数量 +{pct}%（分摊到各出怪批次）'), { pct: 70 }),
  eb('eb_steel', 3, 'all', N_('钢铁之躯'), N_('所有敌人受到的伤害 −{pct}%（领袖减半）'), { pct: 43 }),
  eb('eb_split', 3, 'single', N_('分裂'), N_('普通敌人被击倒时分裂成 {n} 个 {hp}% 生命的小号（漏掉也扣目标生命）'), { n: 2, hp: 52 }),
  eb('eb_command', 3, 'focus', N_('统帅'), N_('每波随机 1 名精英成为统帅：周围 {range} 格内的其他敌人受到的伤害 −{pct}%、移动速度 +{move}%；统帅被击倒后效果消失'),
    { range: 2, pct: 52, move: 35 }),
  eb('eb_twins', 3, 'late', N_('精英双生'), N_('精英敌人成对出现'), {}),
  eb('eb_undying', 3, 'all', N_('不灭'), N_('非领袖敌人第一次被击倒时，有 {prob}% 概率以 {hp}% 生命原地复活'), { prob: 85, hp: 50 }),
  eb('eb_frenzy', 3, 'front', N_('狂热'), N_('所有敌人移动速度 +{move}%、攻击速度 +{aspd}'), { move: 35, aspd: 52 }),
  eb('eb_calamity', 3, 'fragile', N_('天灾'), N_('每 {sec} 秒，随机 {n} 名干员受到其最大生命 {pct}% 的真实伤害'), { sec: 30, n: 3, pct: 52 }),
  eb('eb_bloodmoon', 3, 'luck', N_('血月'), N_('从现在起，每回合开战时敌人随机获得一项蓝/紫档进阶强化，只在本回合有效'), {}, { show: true, noTemp: true }),
  eb('eb_throttle', 3, 'econ', N_('限流'), N_('每回合因效果获得的资金超过 {cap} 时，超出部分减半'), { cap: 6 }, ECON),
  // third version (C1–C3)
  eb('eb_evolve', 3, 'stall', N_('进化'), N_('敌人在场每 {sec} 秒，受到的伤害 −{pct}%（至多 −{max}%）'), { sec: 10, pct: 8, max: 40 }),
  eb('eb_legion', 3, 'count', N_('军团'), N_('你的战场上每同时有 {per} 名敌人，所有敌人受到的伤害 −{pct}%（至多 −{max}%）'), { per: 5, pct: 8, max: 40 }),
  eb('eb_rift', 3, 'coverage', N_('时空裂隙'), N_('每 {sec} 秒，随机 {n} 名敌人沿路线向终点瞬移 {tiles} 格（领袖除外）'), { sec: 20, n: 2, tiles: 3 }),
  // --- 首领专场 (D1–D8): the vote before the Final Assault; on leaders and the leader fights only, at full value
  eb('eb_b_rage', 1, 'boss_atk', N_('首领·狂暴'), N_('领袖攻击 +{atk}%、攻击速度 +{aspd}'), { atk: 52, aspd: 52 }, BOSS),
  eb('eb_b_awe', 1, 'boss_sp', N_('首领·威压'), N_('领袖战开场 {sec} 秒内，我方干员的技力不回复'), { sec: 25 }, BOSS),
  eb('eb_b_guard', 1, 'boss_count', N_('首领·亲卫'), N_('领袖战每个战场多 {n} 名精英护卫'), { n: 1 }, BOSS),
  eb('eb_b_wall', 2, 'boss_hp', N_('首领·铁壁'), N_('领袖受到的伤害 −{pct}%'), { pct: 25 }, BOSS),
  eb('eb_b_clock', 2, 'boss_time', N_('首领·倒计时'), N_('领袖战的加时扣血提前 {sec} 秒开始'), { sec: 35 }, BOSS),
  eb('eb_b_escort', 2, 'boss_count', N_('首领·护卫'), N_('领袖战每个战场多 {n} 名精英护卫'), { n: 3 }, BOSS),
  eb('eb_b_tough', 3, 'boss_hp', N_('首领·坚韧'), N_('领袖的共享血池 +{pct}%'), { pct: 43 }, BOSS),
  eb('eb_b_fury', 3, 'boss_atk', N_('首领·狂怒'), N_('领袖生命低于 {hpPct}% 后受到的伤害 −{pct}%、攻击速度 +{aspd}'), { hpPct: 50, pct: 52, aspd: 86 }, BOSS),
  // third version (D1–D8)
  eb('eb_b_physward', 1, 'boss_phys', N_('首领·物理屏障'), N_('领袖受到的物理伤害 −{pct}%'), { pct: 17 }, BOSS),
  eb('eb_b_artsward', 1, 'boss_arts', N_('首领·法术屏障'), N_('领袖受到的法术伤害 −{pct}%'), { pct: 17 }, BOSS),
  eb('eb_b_dread', 1, 'boss_aspd', N_('首领·威慑'), N_('领袖战中我方干员的攻击间隔 +{pct}%'), { pct: 15 }, BOSS),
  eb('eb_b_summon', 2, 'boss_count', N_('首领·召唤'), N_('领袖战中领袖每 {sec} 秒为每个战场召唤 {n} 名精英护卫'), { sec: 30, n: 2 }, BOSS),
  eb('eb_b_barrier', 2, 'boss_shield', N_('首领·护盾'), N_('领袖生命每降低 {step}%，获得共享血池 {pct}% 的护盾（每场至多 {max} 次）'), { step: 25, pct: 5, max: 3 }, BOSS),
  eb('eb_b_cap', 2, 'boss_burst', N_('首领·限伤'), N_('领袖战的限伤线从 {from} 万降到 {to} 万：单次伤害达到 {to} 万就整次作废（破限按 {brk} 万计算）'), { from: 30, to: 20, brk: 10 }, BOSS),
  eb('eb_b_resonance', 2, 'boss_guard', N_('首领·共鸣'), N_('每有 1 名护卫存活，领袖受到的伤害 −{pct}%（至多 −{max}%）'), { pct: 8, max: 40 }, BOSS),
  eb('eb_b_revive', 3, 'boss_revive', N_('首领·复苏'), N_('领袖第一次降到 {hpPct}% 生命时，回复共享血池的 {pct}%（每场一次）'), { hpPct: 30, pct: 10 }, BOSS),
  eb('eb_n_health',1,'all',N_('预备体能'),N_('非领袖敌人生命 +10%（领袖无效）'),{},{rarity:1,noTemp:true,boss:false,revisionMods:{"hpMul": 1.1}}),
  eb('eb_n_power',1,'front',N_('武器维护'),N_('敌人攻击 +8%（领袖减半）'),{},{rarity:1,noTemp:true,boss:false,revisionMods:{"atkMul": 1.08}}),
  eb('eb_n_speed',1,'nonblock',N_('轻装行军'),N_('敌人移动速度 +15%（领袖减半）'),{},{rarity:2,noTemp:true,boss:false,revisionMods:{"moveMul": 1.15}}),
  eb('eb_n_defense',1,'all',N_('加固装甲'),N_('敌人防御 +25%（领袖减半）'),{},{rarity:2,noTemp:true,boss:false,revisionMods:{"defMul": 1.25}}),
  eb('eb_n_arts',2,'all',N_('抗法涂层'),N_('敌人受到的法术伤害降低18%（领袖减半）'),{},{rarity:3,noTemp:true,boss:false,revisionMods:{"artsTakenMul": 0.82}}),
  eb('eb_n_phys',2,'all',N_('缓冲结构'),N_('敌人受到的物理伤害降低18%（领袖减半）'),{},{rarity:3,noTemp:true,boss:false,revisionMods:{"physTakenMul": 0.82}}),
  eb('eb_n_regen',2,'all',N_('修复组织'),N_('非领袖敌人每秒回复1%最大生命（领袖无效）'),{},{rarity:4,noTemp:true,boss:false,revisionMods:{"hpRegenRatio": 0.01}}),
  eb('eb_n_shatter',2,'front',N_('破盾武装'),N_('敌人对持有护盾的干员造成的伤害增加35%（领袖减半）'),{},{rarity:4,noTemp:true,boss:false,revisionMods:{}}),
  eb('eb_n_element',3,'element',N_('元素隔离'),N_('敌人受到的元素损伤积累降低30%（领袖减半；不改变敌方对我方的损伤）'),{},{rarity:5,noTemp:true,boss:false,revisionMods:{"elemTakenMul": 0.7}}),
  eb('eb_n_slow',3,'control',N_('沉重空气'),N_('我方干员攻击间隔增加15%'),{},{rarity:5,noTemp:true,boss:false,revisionMods:{}}),
  eb('eb_n_wall',3,'all',N_('绝境壁垒'),N_('敌人受到的物理、法术、真实伤害降低25%（领袖减半）'),{},{rarity:6,noTemp:true,boss:false,revisionMods:{"dmgTakenMul": 0.75}}),
  eb('eb_n_hunter',3,'front',N_('乘虚追猎'),N_('敌人对晕眩、冻结、沉睡、束缚、恐惧或浮空中的干员造成伤害增加40%（领袖减半）'),{},{rarity:6,noTemp:true,boss:false,revisionMods:{}}),
  eb('eb_n_b_guard',1,'boss',N_('首领·战术装甲'),N_('领袖防御 +30%'),{},{rarity:2,noTemp:true,boss:true,revisionMods:{"defMul": 1.3}}),
  eb('eb_n_b_doom',3,'boss',N_('首领·终局攻势'),N_('领袖攻击 +50%、攻击间隔缩短25%'),{},{rarity:6,noTemp:true,boss:true,revisionMods:{"atkMul": 1.5, "intervalMul": 0.75}}),
]);

const EB_INDEX = new Map(ENEMY_BUFFS.map((b) => [b.id, b]));
/** An enemy upgrade definition, or null. */
export const enemyBuffDef = (id) => (typeof id === 'string' && EB_INDEX.get(id)) || null;
/** Whether the enemies' upgrade is voted at the start of `round`. */
export const isVoteRound = (round) => VOTE_ROUNDS.includes(round);
/**
 * Whether the vote of `round` is the 首领专场: the vote right before the Final Assault (round 13 of the 14-round modes;
 * solo 标准, whose Final Assault is round 9, has none — its last vote, round 7, is two rounds before it).
 */
export const isBossVoteRound = (round, bossRound) => isVoteRound(round) && Number.isInteger(bossRound) && round + 1 === bossRound;

// ---------------------------------------------------------------------------------------------------------------
// room settings (the host's, when the room is created: server/lobby.js, the lobby / room screens)

/** Tier weights are whole numbers 0–EB_WEIGHT_MAX (at least one above 0). */
export const EB_WEIGHT_MAX = 100;
/** The defaults: votes on, 白银 60 / 黄金 30 / 彩色 10, no 彩色 on the first vote (round 4). */
export const CONFIGURABLE_ROUNDS = Object.freeze(Array.from({ length: 15 }, (_, i) => i + 1));
export const EB_SETTINGS_DEFAULT = Object.freeze({ on: true, weights: Object.freeze([30, 30, 15, 15, 7, 3]), firstNoPrism: true, samePlayerQuality: false, sameBothQuality: false,
  playerRounds: Object.freeze(CONFIGURABLE_ROUNDS.slice(0, 13)), enemyRounds: VOTE_ROUNDS });
const isRounds = (v) => Array.isArray(v) && v.every((r) => Number.isInteger(r) && CONFIGURABLE_ROUNDS.includes(r)) && new Set(v).size === v.length;
const rounds = (v, fallback) => Object.freeze((isRounds(v) ? v : fallback).slice().sort((a, b) => a - b));

const isWeight = (v) => Number.isInteger(v) && v >= 0 && v <= EB_WEIGHT_MAX;
const isWeights = (w) => Array.isArray(w) && [3, EB_TIERS.length].includes(w.length) && w.every(isWeight) && w.reduce((a, b) => a + b, 0) > 0;

export function normalizeEnemyWeights(w) {
  if(!isWeights(w))return EB_SETTINGS_DEFAULT.weights.slice();
  if(w.length===6)return w.slice();
  const split=(v,p)=>[Math.round(v*p),v-Math.round(v*p)];
  return [...split(w[0],.5),...split(w[1],.5),...split(w[2],.7)];
}
/**
 * Strict check of a settings object a client sends (room.create / room.setEnemyBuffs, shared/protocol.js): every field
 * optional, but a present one well-formed — `on` / `firstNoPrism` booleans, `weights` [白银, 黄金, 彩色] whole numbers
 * 0–100, not all 0. Unknown keys are ignored (as anywhere in the protocol).
 */
export function isEnemyBuffSettings(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  if (v.samePlayerQuality !== undefined && typeof v.samePlayerQuality !== 'boolean') return false;
  if (v.sameBothQuality !== undefined && typeof v.sameBothQuality !== 'boolean') return false;
  if (v.sameBothQuality === true && v.samePlayerQuality !== true) return false;
  if (v.on !== undefined && typeof v.on !== 'boolean') return false;
  if (v.firstNoPrism !== undefined && typeof v.firstNoPrism !== 'boolean') return false;
  if (v.weights !== undefined && !isWeights(v.weights)) return false;
  if (v.playerRounds !== undefined && !isRounds(v.playerRounds)) return false;
  if (v.enemyRounds !== undefined && !isRounds(v.enemyRounds)) return false;
  return true;
}

/** The settings with the defaults filled in (anything missing or malformed takes its default): a fresh frozen object. */
export function enemyBuffSettings(v) {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  const d = EB_SETTINGS_DEFAULT;
  return Object.freeze({
    on: typeof o.on === 'boolean' ? o.on : d.on,
    weights: Object.freeze(normalizeEnemyWeights(o.weights)),
    samePlayerQuality: o.samePlayerQuality === true,
    sameBothQuality: o.samePlayerQuality === true && o.sameBothQuality === true,
    playerRounds: rounds(o.playerRounds, d.playerRounds),
    enemyRounds: rounds(o.enemyRounds, d.enemyRounds),
    firstNoPrism: typeof o.firstNoPrism === 'boolean' ? o.firstNoPrism : d.firstNoPrism,
  });
}

/** Whether two settings objects mean the same (after the defaults). */
export function sameEnemyBuffSettings(a, b) {
  const x = enemyBuffSettings(a), y = enemyBuffSettings(b);
  return x.samePlayerQuality === y.samePlayerQuality && x.sameBothQuality === y.sameBothQuality && x.on === y.on && x.firstNoPrism === y.firstNoPrism && x.weights.every((w, i) => w === y.weights[i]) && ['playerRounds', 'enemyRounds'].every((k) => x[k].length === y[k].length && x[k].every((r, i) => r === y[k][i]));
}

// ---------------------------------------------------------------------------------------------------------------
// the vote

/**
 * The tier of a vote, by `weights` ([白银, 黄金, 彩色]) with `rng` (one draw); `noPrism` takes 彩色 out (第 4 回合不出彩色).
 * Nothing left to draw (only 彩色 had weight) → 白银.
 */
export function rollVoteTier(weights, rng, { noPrism = false } = {}) {
  const normalized=normalizeEnemyWeights(weights);
  const w = EB_TIERS.map((t,i)=>t===6&&noPrism?0:normalized[i]);
  const sum = w.reduce((a, b) => a + b, 0);
  if (!(sum > 0)) return 1;
  let r = rng() * sum;
  for (let i = 0; i < w.length; i++) {
    r -= w[i];
    if (r < 0 && w[i] > 0) return EB_TIERS[i];
  }
  for (let i = w.length - 1; i >= 0; i--) if (w[i] > 0) return EB_TIERS[i];
  return 1;
}

/** Draw one entry of `list` with `rng`, or null. */
const drawOne = (list, rng) => (list.length ? list[Math.floor(rng() * list.length)] : null);

/**
 * The options of a vote (ids). opts: { tier (absent: every tier), boss (the 首领 pool instead of the generic one),
 * allowed(def) (the match's veto: co-op only in solo, 特训加强 without its type …), n }. A third argument that is a
 * number is `n` (the first version's signature). One at a time, from the tier: an option whose `group` none of the
 * drawn ones has first — one not chosen yet before one chosen already (they stack) —, then the rest the same way; when
 * the tier runs short, the nearest other tier fills in.
 */
export function rollVoteOptions(chosen, rng, opts = VOTE_OPTIONS) {
  const o = typeof opts === 'number' ? { n: opts } : (opts || {});
  const n = Number.isInteger(o.n) && o.n > 0 ? o.n : VOTE_OPTIONS;
  const have = new Set(chosen || []);
  const pool = ENEMY_BUFFS.filter((d) => !!d.boss === !!o.boss && (!o.allowed || o.allowed(d)));
  const tiers = o.tier ? [o.tier, ...(o.strict ? [] : EB_TIERS.filter((t) => t !== o.tier).sort((a, b) => Math.abs(a - o.tier) - Math.abs(b - o.tier) || a - b))] : [null];
  const out = [];
  for (const t of tiers) {
    const left = pool.filter((d) => (t == null || d.rarity === t) && !out.includes(d));
    while (out.length < n && left.length) {
      const groups = new Set(out.map((d) => d.group));
      const fresh = (d) => !have.has(d.id);
      const newGroup = (d) => !groups.has(d.group);
      const pick = drawOne(left.filter((d) => newGroup(d) && fresh(d)), rng) ?? drawOne(left.filter(newGroup), rng)
        ?? drawOne(left.filter(fresh), rng) ?? drawOne(left, rng);
      out.push(pick);
      left.splice(left.indexOf(pick), 1);
    }
    if (out.length >= n) break;
  }
  return out.map((d) => d.id);
}

/**
 * The winner of a vote: the option with the most votes (a voter of `weights` counts that many times — 海克斯·话事人
 * counts twice); a tie between several (or no vote at all) goes to the vote of `prefer` when it is among them (话事人
 * "平票时以你的选择为准"), else it is broken by `rng`. `reverse` (敌人强化·逆反): the option with the FEWEST votes wins, ties
 * the same way.
 * @param {string[]} options @param {Record<string, string>} votes voter → option @param {() => number} rng
 * @param {{ weights?: Record<string, number>|null, prefer?: string|null, reverse?: boolean }} [opts]
 */
export function tallyVote(options, votes, rng, { weights = null, prefer = null, reverse = false } = {}) {
  const count = new Map(options.map((o) => [o, 0]));
  for (const [voter, v] of Object.entries(votes || {})) {
    if (!count.has(v)) continue;
    const w = weights && Number.isFinite(weights[voter]) && weights[voter] > 0 ? weights[voter] : 1;
    count.set(v, count.get(v) + w);
  }
  const best = reverse ? Math.min(...count.values()) : Math.max(...count.values());
  const top = options.filter((o) => count.get(o) === best);
  if (top.length === 1) return top[0];
  const pref = prefer != null && votes ? votes[prefer] : null;
  if (pref != null && top.includes(pref)) return pref;
  return top[Math.floor(rng() * top.length)];
}

/**
 * The stacked numbers of the chosen enemy upgrades (a buff chosen twice counts twice): id → times. The sim reads it
 * from the battle flags (`flags.enemyBuffs`, an id list in vote order, plus the round's 盲盒 / 血月 upgrades).
 */
export function enemyBuffCounts(ids) {
  const out = new Map();
  for (const id of ids || []) if (EB_INDEX.has(id)) out.set(id, (out.get(id) ?? 0) + 1);
  return out;
}

/**
 * The upgrades 盲盒 (tier 1) / 血月 (tier 2) may draw for one round: of that tier, generic, battle-side — no 经济, no co-op
 * 节目, no 特训加强, neither of the two themselves (`noTemp`).
 */
export function tempBuffPool(tier) {
  return ENEMY_BUFFS.filter((d) => d.tier === tier && !d.boss && !d.noTemp && !d.coop && !d.econ && !d.faction).map((d) => d.id);
}

/**
 * 叠层税 (third version): what a 特质 gain of `n` layers keeps with the upgrade chosen `k` times — ⌊n × (1 − pct)^k⌋, at
 * least 1 (n itself when n < 1 or k = 0). The prep (PlayerState.addLayers) and the battle (content/enemyBuffs.js) share it.
 */
export function layerTaxKeep(n, k) {
  const v = Math.floor(Number(n) || 0);
  if (!(v > 0) || !(k > 0)) return v;
  const keep = (1 - (Number(enemyBuffDef('eb_layertax')?.params?.pct) || 0) / 100) ** k;
  return Math.max(1, Math.floor(v * keep + 1e-9));
}
