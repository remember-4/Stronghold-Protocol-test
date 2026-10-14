import { inElementBurst, effectiveBurstRemaining, burstEventMatches } from '../../../elementState.js';
// server/sim/content/kits/ops/chess_char_6_10-nymph.js — 妮芙 (char_4146_nymph) kit, tier 6.
// Conventions of the tier-6 kits: ../shared/tier6.js; kit contract and rules: ../README.md.

import { bodyInKeys } from '../../../body.js';
import { hasHp } from '../../../damage.js';
import { num, tbb, moduleBb, live, selectedSkill, skillGridOf, elementDmg, aura } from '../shared/tier6.js';

// ------------------------------------------------------------------------------------------------------------------
// 妮芙 chess_char_6_10 (本源术师; the tier-6 妮芙 of the shop since the 萨卡兹 update, docs/SARKAZ-UPDATE.md — the tier-5
// chess_char_5_22 is hidden) — S2 怵然震爆 (default); 失魂; 窥心钥; module 心声 (PRI-X) / 烦恼问诊匣 (PRI-Y).
// S1 笞心击 and S3 心防溃决 (loadouts, `skills`) are the tier-5 kit's (chess_char_5_22-nymph.js) with this record's numbers:
// S1 (duration, no attack override: her attacks while it runs): ATK +atk; each attack adds attack@ep_damage_ratio of its
// damage as 凋亡损伤 and, on a target in an apoptosis burst, attack@extra_ep_damage_scale × ATK 元素伤害. S3 (duration):
// skill range, ATK +atk, ASPD +attack_speed, attack@max_target targets at attack@split_atk_scale; an attack on a target in
// an apoptosis burst becomes 元素伤害 (no arts part: attack@magic_atk_scale 0).
// PRI-Y (uniequip_003_nymph, elite): SP +sp_recovery_per_sec while an enemy in range is in an element burst (module-only
// talent part); at stage 3 失魂 ticks every nymph_t_1[ep_damage].interval s (talent 1 blackboard; 1 s otherwise).

function nymph(bb, chess, def) {
  const t0 = tbb(def, 0), t1 = tbb(def, 1), tb = def?.traitBb || {};
  const sid = selectedSkill(chess, def);
  const soulIv = num(t0['nymph_t_1[ep_damage].interval'], 1) > 0 ? num(t0['nymph_t_1[ep_damage].interval'], 1) : 1;
  const soul = (battle, unit, t, scale) => {
    const left = effectiveBurstRemaining(battle, t, 'apoptosis');
    if (!(left > 0) || !(scale > 0)) return;
    const key = `nymph:soul:${unit.id}`;
    const cur = t.findBuff(key);
    if (cur) { cur.data.scale = Math.max(cur.data.scale, scale); cur.timeLeft = Math.max(cur.timeLeft, left); return; }
    battle.addBuff(t, {
      key, duration: Math.max(0.1, left), interval: soulIv, source: unit, data: { scale },
      // 元素伤害 = the 'elemental' damage type (no DEF/RES, × elementalTakenMul)
      onTick: ({ unit: e, buff }) => { if (inElementBurst(battle, e, 'apoptosis')) battle.dealDamage(unit, e, { amount: unit.s.atk * buff.data.scale, type: 'elemental', element: 'apoptosis', canDodge: false, tags: ['talent', 'elementDmg'] }); },
    });
  };
  const skillGrid = skillGridOf(def);
  const skills = {
    skchr_nymph_1: { kind: 'duration', mods: { atkPct: num(bb.atk) } },
    skchr_nymph_3: {
      kind: 'duration',
      mods: { atkPct: num(bb.atk), aspd: num(bb.attack_speed) },
      targeting: { ...(skillGrid ? { rangeGrid: skillGrid } : {}), maxTargets: Math.max(1, num(bb['attack@max_target'], 2)) },
      attack: { atkScale: num(bb['attack@split_atk_scale'], 1) },
    },
  };
  return {
    skills,
    skill: {
      kind: 'charges',
      attack: {
        atkScale: num(bb.atk_scale, 1),
        splashRadius: num(bb.projectile_range, 1.5),
        splashScale: 1,
        onHit({ battle, unit, target }) {
          if (target && target.alive && num(bb.fear) > 0) battle.applyStatus(target, 'fear', { duration: num(bb.fear), source: unit });
          battle.fx('shockBlast', { x: target ? target.x : unit.x, y: target ? target.y : unit.y, id: unit.id });
        },
      },
    },
    talents: [
      { install(battle, unit) { // skill apoptosis (per damaged target) + 失魂
        battle.on('damaged', (ctx) => {
          const t = ctx.target;
          if (ctx.source !== unit || !t || t.side !== 'enemy' || ctx.type === 'element' || !ctx.dmg?.isAttack) return;
          const skillHit = !!ctx.dmg.isSkill;
          if (t.alive) soul(battle, unit, t, skillHit ? num(bb.element_atk_scale, num(t0.element_atk_scale)) : num(t0.element_atk_scale));
          if (skillHit && t.alive) elementDmg(battle, unit, t, 'apoptosis', ctx.amount * num(bb.ep_damage_ratio));
        }, { owner: unit });
      } },
      { install(battle, unit) { // 窥心钥 (elite module: field-wide, +ASPD at max stacks)
        const atk = num(t1.atk), max = Math.max(1, Math.floor(num(t1.max_stack_cnt, 10)));
        const fieldWide = t1.stack_cnt_check != null, as = num(t1.attack_speed);
        battle.on('deploy', ({ unit: u }) => { if (u === unit) unit.mem.nymphKey = 0; }, { owner: unit });
        battle.on('elementBurst', ({ target, element, source }) => {
          if (!burstEventMatches(battle, { target, element, source }, 'apoptosis') || !live(unit) || !target || target.side !== 'enemy') return;
          if (!fieldWide && !bodyInKeys(target, unit.rangeKeySet)) return;
          unit.mem.nymphKey = Math.min(max, (unit.mem.nymphKey || 0) + 1);
          const n = unit.mem.nymphKey;
          battle.addBuff(unit, { key: 'nymph:key', mods: { atkPct: atk * n, aspd: fieldWide && n >= max ? as : 0 } });
        }, { owner: unit });
      } },
      { install(battle, unit) { // elite module: ×1.1 vs targets in an element burst
        const ds = num(tb.damage_scale, 1);
        if (ds > 1) battle.on('hit', (ctx) => { if (ctx.source === unit && inElementBurst(battle, ctx.target)) ctx.dmg.mul *= ds; }, { owner: unit });
      } },
    ],
    install(battle, unit) {
      // PRI-Y 烦恼问诊匣: SP +X/s while an enemy in her range is in an element burst (the burstSpUp of the tier-5 kits)
      const sp = num(moduleBb(chess).sp_recovery_per_sec);
      if (sp > 0) {
        aura(battle, unit, 0.25, () => {
          if (battle.enemiesInKeys(unit.rangeKeys, unit, { canHitFly: true }).some((e) => inElementBurst(battle, e))) {
            battle.addBuff(unit, { key: 'nymph:module', duration: 0.5, mods: { spRecoveryFlat: sp } });
          }
        });
      }
      if (sid === 'skchr_nymph_1') { // S1: the 凋亡 rider and the extra 元素伤害 on a bursting target, while it runs
        const ep = num(bb['attack@ep_damage_ratio']), extra = num(bb['attack@extra_ep_damage_scale']);
        battle.on('damaged', (c) => {
          const e = c.target;
          if (c.source !== unit || !unit.skill?.active || !c.dmg?.isAttack || c.type === 'element' || c.type === 'elemental') return;
          if (!e || e.side !== 'enemy' || !e.alive) return;
          // (not on a killing blow: the target is at 0 HP here — no burst on the corpse)
          if (ep > 0 && c.amount > 0 && hasHp(e)) elementDmg(battle, unit, e, 'apoptosis', c.amount * ep, ['skill', 'nymph']);
          if (extra > 0 && e.alive && inElementBurst(battle, e, 'apoptosis')) {
            battle.dealDamage(unit, e, { amount: unit.s.atk * extra, type: 'elemental', element: 'apoptosis', canDodge: false, tags: ['element', 'nymphLash'] });
          }
        }, { owner: unit });
      }
      if (sid === 'skchr_nymph_3') { // S3: attacks on a target in an apoptosis burst become 元素伤害
        battle.on('hit', (c) => {
          if (c.source !== unit || !unit.skill?.active || !c.dmg.isAttack || !c.target || !inElementBurst(battle, c.target, 'apoptosis')) return;
          if (c.dmg.type !== 'arts' && c.dmg.type !== 'phys') return;
          c.dmg.type = 'elemental';
          c.dmg.element = 'apoptosis';
          c.dmg.canDodge = false;
          (c.dmg.tags ||= []).push('nymphBreak');
        }, { owner: unit, priority: -10 });
      }
    },
  };
}

export default {
  chess_char_6_10_a: nymph,
};
