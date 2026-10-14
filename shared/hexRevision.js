// (the texts are msgids — N_(): their English is in public/i18n/en.json and the batches' fragments, shared/augments5/g*.en.json)
import { N_ } from './i18n.js';
const CHANGES = {
  "aug_x_justin1": {
    "desc": N_("额外：下回合开始获得 1 个进阶<骑士储蓄罐>")
  },
  "aug_lottery": {
    "desc": N_("每回合开始时自动花 1 资金买一张彩票：2% 中头奖 25 资金（每局至多 1 次），20% 中 4 资金，其余落空；资金不足时不买"),
    "params": {
      "jackpotPct": 2,
      "prizePct": 20
    }
  },
  "aug_speaker": {
    "desc": N_("敌人强化投票时，你的一票算两票；平票时以你的选择为准，你投的选项当选时，你获得1资金")
  },
  "aug_medic": {
    "desc": N_("干员的治疗量提升至 130%，干员受到治疗后，3s内受到伤害-10%")
  },
  "aug_gamble": {
    "desc": N_("每回合开始时，50% 概率获得 5 资金，否则失去 1 资金"),
    "params": {
      "win": 50
    }
  },
  "aug_spark": {
    "desc": N_("回合开始时，层数最少的两个已激活盟约 +3 层（调和、协防、独行、绝技不参与）")
  },
  "aug_q_spender": {
    "desc": N_("任务：拿到后累计花费 70 资金。完成后每回合开始时获得 3 资金"),
    "params": {
      "funds": 3
    }
  },
  "aug_subsidy": {
    "desc": N_("升级调度中心的价格 −2"),
    "params": {
      "n": 2
    }
  },
  "aug_level_gift": {
    "desc": N_("每次升级调度中心，获得与原本等级相同次数的免费刷新（存着，跨回合可用）")
  },
  "aug_last_line": {
    "name": N_("城墙之子")
  },
  "aug_c_caster1": {
    "desc": N_("术师干员攻击力 +30%，技力回复速度 +30%"),
    "params": {
      "atk": 30,
      "sp": 30
    }
  },
  "aug_c_medic1": {
    "desc": N_("医疗干员的治疗量提升至 130%；场上每有 1 名医疗，所有干员最大生命 +8%（至多 5 名）"),
    "params": {
      "pct": 8
    }
  },
  "aug_c_tank1": {
    "desc": N_("重装干员最大生命 +30%；场上每有 1 名重装，所有干员防御力 +8%（至多 5 名）"),
    "params": {
      "hp": 30,
      "pct": 8
    }
  },
  "aug_c_warrior1": {
    "desc": N_("近卫干员攻击力 +20%；场上每有 1 名近卫，近卫干员受到的伤害降低 5%（至多 5 名）"),
    "params": {
      "pct": 5
    }
  },
  "aug_freeride": {
    "desc": N_("拿到时随机绑定一名队友：他每合成一次精锐，你与其各获得 1 资金（每回合至多 2）")
  },
  "aug_hexagram": {
    "desc": N_("每回合开始时抽一卦，本回合生效（八卦各 1/8）：乾，所有干员造成的伤害提升至 125%；坤，受到的伤害降低 25%；震，所有敌人进入战斗时眩晕 2 秒；巽，攻击间隔缩短 20%；坎，获得 3 资金；离，攻击附带灼燃（每秒造成攻击者攻击力 20% 的法术伤害，持续 3 秒）；艮，本回合最多扣除 3 点目标生命；兑，本回合前 3 次主动刷新免费")
  },
  "aug_red_packet": {
    "desc": N_("每 2 回合开始时，你付 2 资金发红包，存活的队友拼手气分 存活人数+2 资金（每人至少 1）；你的资金不足时不发")
  },
  "aug_chaos_wealth": {
    "desc": N_("接下来 3 回合的收入各 −2；之后每回合收入 +3"),
    "params": {
      "loss": 2
    }
  },
  "aug_q_perfect": {
    "desc": N_("任务：拿到后累计 3 回合完美作战。完成时获得 1 名随机 6 阶干员和 6 资金"),
    "params": {
      "n": 3,
      "funds": 6
    }
  },
  "aug_double_or_nothing": {
    "desc": N_("每回合 1 次（限4次），休整期点击此海克斯押注：本回合完美作战则下回合收入翻倍，否则下回合收入为 0")
  },
  "aug_verticality": {
    "desc": N_("每名干员造成的伤害提升 5% × 场上与它同属一个盟约的其他干员数（至多提升至 135%）"),
    "params": {
      "pct": 5,
      "cap": 135
    }
  },
  "aug_gacha": {
    "desc": N_("每回合 1 次，休整期点击此海克斯发动：花 3 资金寻访，随机获得 1 名干员（6 阶 3%、5 阶 12%、4 阶 25%、3 阶 30%、1～2 阶 30%，不看调度中心等级）；连续 6 次没出 6 阶时，下一次必出 6 阶"),
    "params": {
      "miss": 6
    }
  },
  "aug_snipe": {
    "desc": N_("队友买下一名你能凑成精锐的干员（你已有 2 名同名普通干员）时，这名干员改为给你，他的资金退回（每回合至多 1 次）"),
    "params": {
      "every": 1
    }
  },
  "aug_twin_core": {
    "desc": N_("恰好有 2 个核心盟约达到 3 人档时：同时属于两者的干员造成的伤害提升至 130%，只属于其中一个的提升至 115%"),
    "params": {
      "both": 130,
      "one": 115
    }
  },
  "aug_expedition": {
    "name": N_("任务·远征"),
    "desc": N_("任务：每回合开始时，整备区最右边的干员离队去远征（还回卡池，不返还资金；整备区没有干员的回合不算）；累计远征 5 名后，获得 1 名随机 6 阶干员和 1 个<博士投影>")
  },
  "aug_race_clock": {
    "desc": N_("最终攻势的加时扣血推迟 20 秒开始（同盟时全队生效）"),
    "params": {
      "sec": 20
    }
  },
  "aug_center": {
    "desc": N_("上下左右都有己方单位的干员，攻击范围内的敌人受到的伤害提升 22%（不叠加）")
  },
  "aug_x_amiya2": {
    "rarity": 4
  },
  "aug_x_ermengard2": {
    "rarity": 4
  },
  "aug_x_damaztic2": {
    "rarity": 4
  },
  "aug_x_emperor2": {
    "rarity": 4
  },
  "aug_x_doberm2": {
    "rarity": 4
  },
  "aug_x_harold2": {
    "desc": N_("额外：从获得后开始，每 2 回合额外获得 1 名<维多利亚>干员，优先获得不高于调度中心等级的，你没有的干员"),
    "rarity": 4
  },
  "aug_x_warfarin2": {
    "rarity": 4
  },
  "aug_x_jesica2": {
    "rarity": 4
  },
  "aug_x_cathy2": {
    "rarity": 4
  },
  "aug_x_cannot2": {
    "rarity": 4
  },
  "aug_x_clementia2": {
    "rarity": 4
  },
  "aug_x_lmlee2": {
    "rarity": 4
  },
  "aug_x_lisa2": {
    "rarity": 4
  },
  "aug_x_malkie2": {
    "rarity": 4
  },
  "aug_x_mlynar2": {
    "rarity": 4
  },
  "aug_x_mlyss2": {
    "rarity": 4
  },
  "aug_x_paganini2": {
    "rarity": 4
  },
  "aug_x_pepe2": {
    "rarity": 4
  },
  "aug_x_kirara2": {
    "rarity": 4
  },
  "aug_x_mberry2": {
    "rarity": 4
  },
  "aug_x_vodfox2": {
    "rarity": 4
  },
  "aug_x_dusk2": {
    "rarity": 4
  },
  "aug_x_sciurus2": {
    "rarity": 4
  },
  "aug_x_humus2": {
    "rarity": 4
  },
  "aug_x_duck2": {
    "rarity": 4
  },
  "aug_x_ioleta2": {
    "rarity": 4
  },
  "aug_x_yu2": {
    "rarity": 4
  },
  "aug_x_orchid2": {
    "rarity": 4
  },
  "aug_x_pith2": {
    "rarity": 4
  },
  "aug_layer_raise": {
    "desc": N_("所有已激活盟约层数总和超过 300 层的部分每有 100 层，所有干员造成的伤害提升 4%（连乘，每名干员至多提升至 150%）"),
    "params": {
      "max": 150
    }
  },
  "aug_layer_power": {
    "desc": N_("最终攻势和隐秘核心中，你已激活盟约的层数总和每有 100 层，所有干员造成的伤害提升 2.5%（连乘，至多提升至 150%）"),
    "params": {
      "max": 150
    }
  }
};
export const REMOVED_AUGMENTS = new Set(["aug_reserve_dp","aug_budget","aug_x_pith3"]);
export const USER_AUGMENTS = Object.freeze([
  {
    "id": "aug_u_exchange",
    "tier": 2,
    "rarity": 4,
    "name": N_("不等价交换"),
    "desc": N_("获得后的本回合进入休整期、结算收入后，将当前资金与目标生命交换（资金不大于0时目标生命变为0）"),
    "params": {},
    "side": "meta",
    "band": null,
    "coop": false,
    "action": false
  },
  {
    "id": "aug_u_sword",
    "tier": 3,
    "rarity": 5,
    "name": N_("亮出你的剑"),
    "desc": N_("你所有干员攻击范围变为前方一格，获得24%攻击力、24%生命值、20%攻击速度、20%生命偷取"),
    "params": {},
    "side": "battle",
    "band": null,
    "coop": false,
    "action": false
  },
  {
    "id": "aug_u_deathcry",
    "tier": 1,
    "rarity": 2,
    "name": N_("亡语"),
    "desc": N_("干员被击倒时，其周围1格的敌人在5s内受到伤害+20%（不可叠加）"),
    "params": {},
    "side": "battle",
    "band": null,
    "coop": false,
    "action": false
  },
  {
    "id": "aug_u_basics",
    "tier": 3,
    "rarity": 6,
    "name": N_("回归基本功"),
    "desc": N_("你的干员无法开启技能（被动技能除外），但攻速+50，攻击力+100%"),
    "params": {},
    "side": "battle",
    "band": null,
    "coop": false,
    "action": false
  },
  {
    "id": "aug_u_burn_income",
    "tier": 2,
    "rarity": 3,
    "name": N_("炽燃利息"),
    "desc": N_("当有敌人灼燃损伤爆发时，获得1资金（每回合限3资金）"),
    "params": {"battleCoins":3},
    "side": "both",
    "band": null,
    "coop": false,
    "action": false
  },
  {
    "id": "aug_u_wind_blessing",
    "tier": 2,
    "rarity": 4,
    "name": N_("风语者的祝福"),
    "desc": N_("干员受到治疗或获得屏障时，5秒内受到的物理和法术伤害降低35%（不叠加，重复触发刷新时间）"),
    "params": {},
    "side": "battle",
    "band": null,
    "coop": false,
    "action": false
  },
  {
    "id": "aug_u_inferno",
    "tier": 2,
    "rarity": 4,
    "name": N_("炼狱导管"),
    "desc": N_("干员技能期间每次造成伤害会施加一层可无限叠加的灼烧，在3秒的持续时间里每秒造成(10+2.8%攻击力)法术伤害。"),
    "params": {},
    "side": "battle",
    "band": null,
    "coop": false,
    "action": false
  },
  {
    "id": "aug_u_choice_reroll",
    "tier": 2,
    "rarity": 3,
    "name": N_("掷投狂人"),
    "desc": N_("你后续海克斯选择时可以刷新一次（刷新不影响品质）"),
    "params": {},
    "side": "meta",
    "band": null,
    "coop": false,
    "action": false
  },
  {
    "id": "aug_u_soul_siphon",
    "tier": 2,
    "rarity": 3,
    "name": N_("灵魂虹吸"),
    "desc": N_("干员攻击时有10%概率暴击，暴击时回复等于造成伤害10%的生命值（暴击造成200%伤害）"),
    "params": {},
    "side": "battle",
    "band": null,
    "coop": false,
    "action": false
  },
  {
    "id": "aug_u_homeguard",
    "tier": 1,
    "rarity": 2,
    "name": N_("家园卫士"),
    "desc": N_("干员攻速+40，在受到伤害后失效6s"),
    "params": {},
    "side": "battle",
    "band": null,
    "coop": false,
    "action": false
  },
  {
    "id": "aug_u_redeploy_hero",
    "tier": 2,
    "rarity": 3,
    "name": N_("狂徒豪气"),
    "desc": N_("干员再部署（包括突袭的传送）后，本场战斗物抗+12%，法抗+6（每场战斗最多叠加5层）"),
    "params": {},
    "side": "battle",
    "band": null,
    "coop": false,
    "action": false
  },
  {
    "id": "aug_u_dualstrike",
    "tier": 3,
    "rarity": 5,
    "name": N_("双刀流"),
    "desc": N_("干员攻击时，对攻击范围内随机一名敌人造成40%攻击力的伤害"),
    "params": {},
    "side": "battle",
    "band": null,
    "coop": false,
    "action": false
  },
  {
    "id": "aug_u_escape",
    "tier": 1,
    "rarity": 1,
    "name": N_("逃跑计划"),
    "desc": N_("干员生命降至35%时，5s内获得30%最大生命值的屏障，屏障消失时，10s内阻挡数降为0（生命从35%以上降至不高于35%时触发）"),
    "params": {},
    "side": "battle",
    "band": null,
    "coop": false,
    "action": false
  },
  {
    "id": "aug_u_steadfast",
    "tier": 1,
    "rarity": 1,
    "name": N_("保持坚定"),
    "desc": N_("干员技能开启时，物抗+12%，法抗+5（不可叠加）"),
    "params": {},
    "side": "battle",
    "band": null,
    "coop": false,
    "action": false
  },
  {
    "id": "aug_u_infinite_sp",
    "tier": 3,
    "rarity": 6,
    "name": N_("无限循环往复"),
    "desc": N_("所有干员技力恢复速度+30%，开启技能期间击杀敌人时，自身技力恢复速度永久+3%"),
    "params": {},
    "side": "battle",
    "band": null,
    "coop": false,
    "action": false
  },
  {
    "id": "aug_u_arts_juice",
    "tier": 2,
    "rarity": 4,
    "name": N_("术士果汁盒"),
    "desc": N_("干员造成法术伤害时，恢复造成伤害3%的生命值"),
    "params": {},
    "side": "battle",
    "band": null,
    "coop": false,
    "action": false
  },
  {
    "id": "aug_u_deploy_shield",
    "tier": 1,
    "rarity": 2,
    "name": N_("快中求稳"),
    "desc": N_("干员部署时，获得持续4s的120%攻击力的护盾"),
    "params": {},
    "side": "battle",
    "band": null,
    "coop": false,
    "action": false
  },
  {
    "id": "aug_u_heavy_hit",
    "tier": 1,
    "rarity": 1,
    "name": N_("重量级打击手"),
    "desc": N_("所有干员普通攻击额外造成7%自身最大生命值物理伤害"),
    "params": {},
    "side": "battle",
    "band": null,
    "coop": false,
    "action": false
  },
  {
    "id": "aug_u_death_ring",
    "tier": 3,
    "rarity": 5,
    "name": N_("死亡之环"),
    "desc": N_("你的医疗干员治疗友军时可以选定满血干员为目标，你的治疗效果和生命恢复效果会对相邻最近的敌方英雄目标造成70%该数值的魔法伤害"),
    "params": {},
    "side": "battle",
    "band": null,
    "coop": false,
    "action": false
  }
].map(Object.freeze));
const REVISED = new WeakSet();
/** A definition with the revision's changes — once: a revised one comes back as it is (a batch's DEFS reach AUGMENTS as the same objects). */
export function reviseAugment(a) {
  if (REVISED.has(a)) return a;
  const p = CHANGES[a.id];
  const out = p ? Object.freeze({ ...a, ...p, params: Object.freeze({ ...a.params, ...p.params }) }) : a;
  REVISED.add(out);
  return out;
}
