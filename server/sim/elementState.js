// Element bond: effective burst predicates never lock gauges or manufacture real burst effects.
export const ELEMENT_BOND = 'elementShip';
export const ELEMENT_DEFAULTS = Object.freeze({ base_damage_scale_show: 0.25, damage_scale_per_stack: 0.005, all_burst_layers: 40, permanent_burst_layers: 100 });
const finite = (v, fallback) => Number.isFinite(v) ? v : fallback;
export function elementBondPolicy(battle) {
  const p = { ...ELEMENT_DEFAULTS, ...battle?.elementBondParams };
  let active = false, layers = 0;
  for (const ps of battle?.players ?? []) {
    const b = ps.bonds?.[ELEMENT_BOND];
    if (!b?.active) continue;
    active = true; layers = Math.max(layers, finite(b.layers, 0));
  }
  return { active, layers, multiplier: active ? 1 + Math.max(0, finite(p.base_damage_scale_show, 0.25) + finite(p.damage_scale_per_stack, 0) * layers) : 1,
    all: active && layers >= finite(p.all_burst_layers, 40), permanent: active && layers >= finite(p.permanent_burst_layers, 100) };
}
export function realBurstRemaining(target, element = null) {
  let left = 0;
  for (const buff of target?.buffs ?? []) if (buff.flags?.burstLock && (!element || buff.key === `${element}Burst`)) left = Math.max(left, buff.timeLeft ?? 0);
  for (const [el, pending] of Object.entries(target?.burstPending ?? {})) if (pending && (!element || element === el)) left = Math.max(left, 0.1);
  return left;
}
// Keep this history on the enemy even below 100 layers: reaching 100 can recognise an earlier allied burst.
export function recordAlliedBurst(source, target, element) {
  if (target?.side !== 'enemy') return;
  target.mem.elementBondLastAllied = source?.side === 'ally';
  if (!target.mem.elementBondLastAllied) return;
  target.mem.elementBondEverBurst = true;
  target.mem.elementBondLastBurst = element;
}
export function effectiveBurstRemaining(battle, target, element = null) {
  const real = realBurstRemaining(target, element);
  if (target?.side !== 'enemy') return real;
  const p = elementBondPolicy(battle);
  if (p.permanent && target.mem?.elementBondEverBurst) return Infinity;
  if (p.all && target.mem?.elementBondLastAllied && realBurstRemaining(target, target.mem.elementBondLastBurst) > 0) return Math.max(real, realBurstRemaining(target));
  return real;
}
export const inElementBurst = (battle, target, element = null) => effectiveBurstRemaining(battle, target, element) > 0;
// One real event; type-dependent offensive rewards may recognise it as all types at 40. Duration modifiers do not.
export function burstEventMatches(battle, event, element) {
  return event.element === element || (event.source?.side === 'ally' && event.target?.side === 'enemy' && elementBondPolicy(battle).all);
}
