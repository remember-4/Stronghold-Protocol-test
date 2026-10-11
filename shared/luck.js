// shared/luck.js — A6000 fork, 海克斯第六版: 幸运 (the analysis 海克斯第六版-大扩充.md 1.3). Every augment with a chance
// reads one multiplier from the holder's augments: 幸运星 ×2, the 〔赌徒〕 set ×1.25 (2 members) / ×1.5 (3+), multiplied.
// A good outcome's chance is multiplied by it, a bad outcome's divided (at most 100%); a die or a random multiplier is
// drawn twice keeping the better one at luck ≥ 2, and with probability (luck − 1) below that. Pure functions: the match
// passes a player's `augments` (luckOf), a battle its player's `playerEffects` (luckOfRefs). 幸运星 acts in both (side
// 'both'); the 〔赌徒〕 set's pseudo augment aug_set_gamble too.
// A6000 fork, 敌人强化第三版: 霉运 (eb_jinx) divides the luck by its `div` per time chosen — the match's `enemyBuffs` (the
// prep) or the battle's `flags.enemyBuffs` (a battle), passed as the optional second argument: without it (or without
// 霉运) the luck is as before. Below 1 a lucky draw keeps the worse of two draws with probability 1 / luck − 1.

import { setCounts, setLevel } from './augmentSets.js';
import { enemyBuffDef } from './enemyBuffs.js';

export const LUCKY_STAR = 'aug_lucky_star';
const GAMBLE_LUCK = Object.freeze({ 0: 1, 2: 1.25, 3: 1.5 });

export const JINX = 'eb_jinx';

/** 敌人强化·霉运's factor of the match's enemy upgrade ids (1 without it): 1 / div per time chosen. */
export function jinxOf(enemyBuffs) {
  if (!Array.isArray(enemyBuffs) || !enemyBuffs.length) return 1;
  let n = 0;
  for (const id of enemyBuffs) if (id === JINX) n++;
  if (!n) return 1;
  const div = Number(enemyBuffDef(JINX)?.params?.div);
  return div > 1 ? div ** -n : 1;
}

/**
 * The luck multiplier of a player's augment ids (the match: `ps.augments`, members counted; 1 = none); `enemyBuffs`: the
 * match's enemy upgrades (霉运).
 */
export function luckOf(ids, enemyBuffs = null) {
  const list = ids || [];
  let luck = list.includes(LUCKY_STAR) ? 2 : 1;
  luck *= GAMBLE_LUCK[setLevel(setCounts(list).get('gamble') || 0)];
  return luck * jinxOf(enemyBuffs);
}

/**
 * The same from a battle player's EffectRefs (`playerEffects`): a battle carries only the refs that act in battle, so the
 * 〔赌徒〕 level comes from the set's pseudo augment (key 'augment:aug_set_gamble', params.n), not from counting members.
 */
export function luckOfRefs(refs, enemyBuffs = null) {
  let luck = jinxOf(enemyBuffs);
  for (const ref of refs || []) {
    if (!ref || typeof ref.key !== 'string') continue;
    if (ref.key === `augment:${LUCKY_STAR}`) luck *= 2;
    else if (ref.key === 'augment:aug_set_gamble') luck *= GAMBLE_LUCK[setLevel(Number(ref.params?.n) || 0)];
  }
  return luck;
}

/** A good outcome's chance under `luck` (0…1 in, 0…1 out). */
export const goodChance = (p, luck = 1) => Math.max(0, Math.min(1, (Number(p) || 0) * (luck > 0 ? luck : 1)));

/** A bad outcome's chance under `luck`. */
export const badChance = (p, luck = 1) => Math.max(0, Math.min(1, (Number(p) || 0) / (luck > 0 ? luck : 1)));

/**
 * One lucky draw: `draw()` once, or twice keeping the better (`better(a, b)` true when a is at least as good as b) — always
 * at luck ≥ 2, with probability luck − 1 between 1 and 2. `rng` decides the second draw only when luck is in (1, 2), so a
 * player without luck draws exactly as before. Below 1 (霉运) the mirror: twice keeping the worse, with probability
 * 1 / luck − 1 (always at luck ≤ ½).
 */
export function luckyDraw(rng, draw, luck = 1, better = (a, b) => a >= b) {
  const first = draw();
  if (luck > 0 && luck < 1) {
    const p = 1 / luck - 1;
    if (p < 1 && !(rng() < p)) return first;
    const second = draw();
    return better(first, second) ? second : first;
  }
  if (!(luck > 1)) return first;
  if (luck < 2 && !(rng() < luck - 1)) return first;
  const second = draw();
  return better(first, second) ? first : second;
}
