// server/match/augments5/g5.js — A6000 fork, 海克斯第六版 batch g5: the match-side hooks of its augments (the prep / battle
// effects: server/sim/content/augments5/g5.js). The hooks: see the list in server/match/augments5/g4.js.
//
// This batch:
//   onPick       the picks that act on the AUGMENT phase itself (server/match/match/augments.js _augmentOffersFor reads the
//                levers): 增幅 / 预支 ps.augRarityShift ±n (预支: +funds now), 加购 ps.augExtraOffers, 预约券 ps.augVoucher;
//                盲盒 (a random generic augment of its rarity — allowed, not held, no 盲盒; else the nearest rarity, the
//                lower first — granted with its immediate part, and funds; a ticker line), 炼金术 (the earliest generic
//                augment held → a random generic one `steps` rarities higher, 红 at most, granted with its immediate
//                part; nothing changes when none can come), 献祭之刃 (the earliest generic augment held is removed; its
//                rarity on the blade's EffectRef: data.rarity for the battle, counter = the damage %). "Generic": not a
//                专属强化, 职业专精 or pseudo augment, nor the card itself. A removed 加购 takes its extra card along.
//                After every pick (any batch's): 收藏家's rarity count, and 〔生财〕 3's free refresh when the third member
//                comes after the round start (once a round, as the prep side's)
//   lpCap        〔铁壁〕 3: the round's LP cap −lp3
//   onTake       〔坏人〕 2: the taker of a 损人利己 海克斯 +funds2, once a round — at once while it can still spend them this
//                round (ROUND_START … PREP), else at the next round start (pending funds)
//   grudgeImmune 〔坏人〕 3: no grudge priority on the holder when someone's 损人利己 海克斯 picks a victim
// Random draws (盲盒, 炼金术): m.rngAug (the augment stream).

import { augmentDef, AUGMENTS } from '../../../shared/augments.js';
import { PHASE } from '../../../shared/constants.js';
import { msg, tn } from '../../../shared/i18n.js';
import { IDS, BOXES, SET, WEALTH_FREE_AT, setLevelOf, daggerMul, noteKinds } from '../../sim/content/augments5/g5.js';

const KEY = (id) => `augment:${id}`;
const int = (v, d = 0) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : d);
const refOf = (ps, id) => (ps && Array.isArray(ps.effects) ? ps.effects.find((e) => e && e.key === KEY(id)) || null : null);
const nameOf = (id) => tn(augmentDef(id)?.name || id);

/** The phases whose funds a player still spends this round (later ones pay at the next round start). */
const SPEND_PHASES = new Set([PHASE.ROUND_START, PHASE.AUGMENT, PHASE.SP_DRAFT, PHASE.PREP]);
/** 〔坏人〕 2: the round its extra fund was paid (player counter). */
const VILLAIN_PAID_AT = 'aug:setVillain:r';

/** Rarities nearest `r` first: r, r − 1, r + 1, r − 2, r + 2 … within 1…6 (the lower one first). */
function nearRarities(r) {
  const out = [r];
  for (let d = 1; d < 6; d++) for (const x of [r - d, r + d]) if (x >= 1 && x <= 6) out.push(x);
  return out;
}

/**
 * A random generic augment `ps` may take (the AUGMENT phase's rule: augmentAvailable), does not hold and `ok` accepts, of
 * `rarity` — else of the nearest rarity that has one. null when none at all.
 */
function drawGeneric(m, ps, rarity, ok = () => true) {
  const fits = (d) => !d.band && !d.cls && !d.pseudo && !ps.augments.includes(d.id) && ok(d) && m.augmentAvailable(ps, d);
  for (const r of nearRarities(rarity)) {
    const list = AUGMENTS.filter((d) => d.rarity === r && fits(d));
    if (list.length) return list[Math.floor(m.rngAug() * list.length)];
  }
  return null;
}

/** 炼金术 / 献祭之刃: the earliest generic augment `ps` holds (no 专属强化, 职业专精 or pseudo one; never `self`), or null. */
function earliestGeneric(ps, self) {
  for (const id of ps.augments) {
    if (id === self) continue;
    const d = augmentDef(id);
    if (d && !d.band && !d.cls && !d.pseudo) return id;
  }
  return null;
}

/** `id` was taken away from `ps` (炼金术, 献祭之刃): a lever of the AUGMENT phase it kept goes with it. */
function removed(m, ps, id) {
  if (id === IDS.extra) ps.augExtraOffers = 0;
}

/** A3–A6 盲盒: a random generic augment of its rarity (no 盲盒), granted as a pick; then its funds. */
function openBox(m, ps, def) {
  const got = drawGeneric(m, ps, def.rarity, (d) => !BOXES.has(d.id));
  if (got) {
    m.tickerText(msg('{name} 开出了 {aug}', { name: ps.name, aug: tn(got.name) }), 1);
    m.grantAugment(ps, got.id);
  } else {
    m.toast(ps, 'info', msg('盲盒：没有可以开出的海克斯'));
  }
  const funds = Math.max(0, int(def.params.funds));
  if (funds > 0) ps.addFunds(funds, { reason: KEY(def.id) });
}

/** A9 炼金术: the earliest generic augment → a random generic one `steps` rarities higher (红 at most). */
function alchemy(m, ps, def) {
  const old = earliestGeneric(ps, def.id);
  const from = old ? augmentDef(old) : null;
  const got = from ? drawGeneric(m, ps, Math.min(6, from.rarity + Math.max(1, int(def.params.steps, 2))), (d) => d.id !== old) : null;
  if (!got) {
    m.toast(ps, 'info', msg('炼金术：没有可以转化的海克斯'));
    return;
  }
  m.revokeAugment(ps, old);
  removed(m, ps, old);
  m.tickerText(msg('{name} 开出了 {aug}', { name: ps.name, aug: tn(got.name) }), 1);
  m.toast(ps, 'info', msg('炼金术：{from} 变成了 {to}', { from: tn(from.name), to: tn(got.name) }));
  m.grantAugment(ps, got.id);
}

/** A10 献祭之刃: the earliest generic augment goes; its rarity sets the blade's multiplier (data.rarity, counter = %). */
function dagger(m, ps, def) {
  const old = earliestGeneric(ps, def.id);
  const rarity = old ? augmentDef(old).rarity : 0;
  if (old) {
    m.revokeAugment(ps, old);
    removed(m, ps, old);
  }
  const n = Math.round(daggerMul(def.params, rarity) * 100);
  const ref = refOf(ps, def.id);
  if (ref) {
    ref.data = { rarity };
    ref.counter = n;
    ps.dirty();
  }
  m.toast(ps, 'info', old
    ? msg('献祭之刃：献祭了 {aug}，所有干员造成的伤害提升至 {pct}%', { aug: nameOf(old), pct: n })
    : msg('献祭之刃：没有可以献祭的海克斯，所有干员造成的伤害提升至 {pct}%', { pct: n }));
}

/** 〔生财〕 3 reached after this round's start: the round's free refresh now (once a round, as the prep side's). */
function wealthFree(m, ps) {
  if (setLevelOf(refOf(ps, SET.wealth)) < 3 || ps.counters[WEALTH_FREE_AT] === m.round) return;
  ps.shop.freeRefreshes += 1;
  ps.counters[WEALTH_FREE_AT] = m.round;
  ps.dirty();
}

export const MATCH = Object.freeze({
  onPick(m, ps, id) {
    const def = augmentDef(id);
    const p = (def && def.params) || {};
    switch (id) {
      case IDS.amplify: ps.augRarityShift = int(ps.augRarityShift) + Math.max(1, int(p.n, 1)); break;
      case IDS.advance:
        ps.addFunds(Math.max(0, int(p.funds, 8)), { reason: KEY(id) });
        ps.augRarityShift = int(ps.augRarityShift) - Math.max(1, int(p.n, 1));
        break;
      case IDS.mystery1: case IDS.mystery3: case IDS.mystery5: case IDS.mystery6: openBox(m, ps, def); break;
      case IDS.extra: ps.augExtraOffers = Math.max(int(ps.augExtraOffers), Math.max(1, int(p.n, 1))); break;
      case IDS.voucher: ps.augVoucher = int(ps.augVoucher) + Math.max(1, int(p.n, 1)); break;
      case IDS.alchemy: alchemy(m, ps, def); break;
      case IDS.dagger: dagger(m, ps, def); break;
      default: break;
    }
    // after any pick (a 盲盒's or 炼金术's included): the set reached, the rarities held
    wealthFree(m, ps);
    if (noteKinds(refOf(ps, IDS.collector), ps.augments)) ps.dirty();
  },

  // 〔铁壁〕 3: the round's LP cap −lp3 (lpCapFor keeps it ≥ 1)
  lpCap(m, ps, cap) {
    if (setLevelOf(refOf(ps, SET.guard)) < 3) return cap;
    return cap - Math.max(0, int(augmentDef(SET.guard)?.params.lp3, 1));
  },

  // 〔坏人〕 2: a take of the holder's 损人利己 海克斯 — +funds2, once a round
  onTake(m, victim, taker) {
    if (!taker || !taker.alive || setLevelOf(refOf(taker, SET.villain)) < 2 || taker.counters[VILLAIN_PAID_AT] === m.round) return;
    const def = augmentDef(SET.villain);
    const n = Math.max(0, int(def?.params.funds2, 1));
    if (!(n > 0)) return;
    taker.counters[VILLAIN_PAID_AT] = m.round;
    if (SPEND_PHASES.has(m.phase)) taker.addFunds(n, { reason: KEY(SET.villain) });
    else {
      taker.pendingFunds += n;
      taker.dirty();
    }
    m.toast(taker, 'info', msg('{set}：额外 +{n} 资金', { set: tn(def.name), n }));
  },

  // 〔坏人〕 3: 记仇 no longer points at the holder
  grudgeImmune(m, ps) {
    return setLevelOf(refOf(ps, SET.villain)) >= 3;
  },
});
