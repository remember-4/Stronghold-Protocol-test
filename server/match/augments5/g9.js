// server/match/augments5/g9.js — A6000 fork, 海克斯第六版 batch g9: the match-side hooks of its augments (the prep /
// battle effects: server/sim/content/augments5/g9.js). The hooks: see the list in server/match/augments5/g4.js.
//
// This batch:
//   香蕉 (aug_banana)  the settlement (afterCharges — the end of a round that has one: not the Final Assault / Hidden Core):
//                     a holder's whole banana is eaten at 1/odds (幸运: badChance); eaten, a 卡文迪什 grows in its place at
//                     1/grow (幸运: goodChance), never eaten again. The state goes into the EffectRef's data
//                     { state: 'eaten' | 'cavendish', round } (the battles read it) and its counter (✗ / ★ on the icon); a
//                     ticker line each time. An eaten banana stays held (its card, its 〔赌徒〕 membership): it only does
//                     nothing more. Draws: m.rngMeta, only for a holder whose banana is still whole.

import { msg } from '../../../shared/i18n.js';
import { augmentDef } from '../../../shared/augments.js';
import { luckOf, goodChance, badChance } from '../../../shared/luck.js';
import { BANANA } from '../../sim/content/augments5/g9.js';

const BANANA_ID = 'aug_banana';
const KEY = (id) => `augment:${id}`;
/** 香蕉's marks on the icon (the EffectRef counter: shown as sent, no translation needed). */
export const BANANA_MARK = Object.freeze({ [BANANA.EATEN]: '✗', [BANANA.CAVENDISH]: '★' });

/** 香蕉: every alive holder's roll at the settlement. */
function bananaRolls(m) {
  const p = augmentDef(BANANA_ID)?.params ?? {};
  const odds = Math.max(1, Number(p.odds) || 6), grow = Math.max(1, Number(p.grow) || 3);
  for (const ps of m.alivePlayers()) {
    if (!ps.augments.includes(BANANA_ID)) continue;
    const ref = ps.effects.find((e) => e && e.key === KEY(BANANA_ID));
    const st = ref && ref.data ? ref.data.state : null;
    if (!ref || st === BANANA.EATEN || st === BANANA.CAVENDISH) continue;
    const luck = luckOf(ps.augments, m.enemyBuffs);
    if (!(m.rngMeta() < badChance(1 / odds, luck))) continue;
    const state = m.rngMeta() < goodChance(1 / grow, luck) ? BANANA.CAVENDISH : BANANA.EATEN;
    ref.data = { state, round: m.round };
    ref.counter = BANANA_MARK[state];
    ps.dirty();
    m.tickerText(state === BANANA.CAVENDISH
      ? msg('{name} 的香蕉被吃掉了，但原地长出了卡文迪什！', { name: ps.name })
      : msg('{name} 的香蕉被吃掉了', { name: ps.name }), 1);
  }
}

export const MATCH = Object.freeze({
  afterCharges(m) {
    bananaRolls(m);
  },
});
