// server/sim/content/augments5/g7.js — A6000 fork, 海克斯第六版 (招募、精锐与装备（C1–C21）): the effects of
// shared/augments5/g7.js. server/sim/content/augments.js calls `install` for every augment a battle player holds (true =
// handled here) and merges `META` (augment id → prep-side handler factory, as its own META).
//
// Battle side (number bonuses are the independent multipliers: augDealtMul 造成的伤害提升):
//   博物馆  aug_museum   (1 + pct)^n on every operator of the player, n = the items its operators of the battle carry
//                       (≤ max); counted once at the install (a battle never changes what an operator carries)
// Prep side (META). A gain names the 海克斯 in a toast ('{who}：获得{name}', effectsMeta grantChess's own words); an offer
// is a free pick-one (shop.rewardOffer) under the 海克斯's name. Draws: ctx.rng / rollChess (the match's meta stream).
//   精锐速递 C2   a <博士投影> at the pick, one more every `every` rounds after it
//   复制许可 C5 / 突变 C7 / 天马座 C8 / 人事调动 C9 / 夕的画卷 C11 / 教鞭 C21   their items at the pick (夕的画卷: + funds)
//   军火商 C6     an offer of n different random shop items of tiers minTier…maxTier (the shop's: no special item)
//   维式全家桶 C10  one of the special 维式重锤 (items.json family 'hammer': 战栗, 坚固, 加速, 灼燃), normal quality
//   群星 C12      an offer of n different random tier-6 operators at the pick and every `every` rounds after it
//   神谕 C13      every round start: an offer of n different random operators of a bond the board's operators have
//                 (pieceBonds: 变形同构体's too; the mode's switched-off bonds left out), tier ≤ the dispatch level + up
//   补货 C14      every round start: a random operator of such a bond, tier ≤ min(maxTier, the dispatch level)
//   快递 C15      n random operators of tiers 1–maxTier at the pick; `after` rounds later `later` of tier laterTier
//   猎头合同 C16   at the pick and every `every` rounds after it: an offer of n different operators of the core bond
//                 with the most board members (同乡会's rule: augments5/g2.js topCoreOnBoard) the player owns no copy of,
//                 tier ≤ the dispatch level
//   装备补给箱 C18  n random shop items of tiers minTier…maxTier (independent draws: a pair merges as any gain)
//   自动化工厂 C19  every `every` rounds after the pick: a random shop item of tiers minTier…min(maxTier, level + up)
//                 (minTier at least)
// "Every N rounds" counts from the pick (军需's way): the rounds pick + k·N, k ≥ 1; the EffectRef's counter shows the
// rounds left to the next one (快递: to its second delivery, then none). The operator draws are copy-weighted from the
// pool and the player's 自选 stock (ctx.rollChess); a grant needs a free copy (ctx.grantChess), an offer reserves none.
// 双子合成 C1, 晋升跳级 C4: the engine (server/match/player/acquire.js mergeNeed / pushRewardOffer); 克隆大作战 C3,
// 双子合成's catch-up merges and 回收站 C17's click: server/match/augments5/g7.js.

import { num, playerOps, passiveBuff, itemsOf } from '../support/index.js';
import { topCoreOnBoard, isBondMember } from './g2.js';
import { DEFS } from '../../../../shared/augments5/g7.js';
import { msg, dn, tn } from '../../../../shared/i18n.js';

const KEY = (id) => `augment:${id}`;
const pct = (v) => num(v) / 100;
const int = (v, d) => Math.trunc(num(v, d));
/** The batch's names (msgids): a toast's speaker, an offer's label. */
const NAME = Object.freeze(Object.fromEntries(DEFS.map((d) => [d.id, d.name])));

/** The items this batch gives (data/items.json). */
export const ITEM = Object.freeze({
  projector: 'chess_item_5_06_e_a', // 博士投影
  mimic: 'chess_item_5_05_e_a', // 拟态物质
  mutation: 'chess_item_5_08_e_a', // 突变细胞
  helm: 'chess_item_5_09_e_a', // 天马之盔
  lance: 'chess_item_6_01_e_a', // 天马之枪
  hr: 'chess_item_6_08_e_a', // 人事部文档
  scroll: 'chess_item_6_02_m', // 画卷
  whip: 'chess_item_6_03_m', // 教鞭
});
/** items.json `family` of the special 维式重锤 (never sold: gamedata shopItemsByTier leaves them out). */
const HAMMER_FAMILY = 'hammer';

// =====================================================================================================================
// battle side

/** C20 博物馆: (1 + pct)^(the items the player's operators carry, ≤ max) on every operator of the player. */
function museum(battle, ps, id, p) {
  const ops = playerOps(battle, ps.playerId);
  let n = 0;
  for (const u of ops) n += itemsOf(u).length;
  n = Math.min(n, Math.max(0, int(p.max, 16)));
  if (!(n > 0)) return;
  const mul = (1 + pct(p.pct)) ** n;
  for (const u of ops) passiveBuff(battle, u, KEY(id), { augDealtMul: mul });
}

const BATTLE = Object.freeze({ aug_museum: museum });
/** This batch's prep-only ids: nothing to install in a battle (they never reach one: side 'meta'). */
const PREP_ONLY = new Set(DEFS.filter((d) => d.side === 'meta').map((d) => d.id));

/**
 * Battle side: install augment `id` (definition `def`) of player `ps` (the battle's player input) on `battle`.
 * @returns {boolean} whether this batch handles the id
 */
export function install(battle, ps, id, def) {
  const fn = BATTLE[id];
  if (!fn) return PREP_ONLY.has(id);
  fn(battle, ps, id, (def && def.params) || {});
  return true;
}

// =====================================================================================================================
// prep side

/** '{who}：获得{name}' with the 海克斯's name as the speaker. */
const gained = (ctx, id, name) => ctx.toast(msg('{who}：获得{name}', { who: tn(NAME[id]), name: dn(name) }));

/** An item for the holder of `id` (hand, overflow temp, merges as any gain), named in a toast. */
function grantItemTo(ctx, id, itemId) {
  if (!itemId) return null;
  const v = ctx.grantItem(itemId, { source: KEY(id) });
  if (v) gained(ctx, id, ctx.gd.item(itemId)?.name || '');
  return v;
}

/** A chess for the holder of `id` (needs a free copy), named in a toast. */
function grantChessTo(ctx, id, chessId) {
  if (!chessId) return null;
  const v = ctx.grantChess(chessId, { source: KEY(id), toast: false });
  if (v) gained(ctx, id, ctx.chessRecord(v.id)?.name || '');
  return v;
}

/** A free pick-one offer of chess / items under the 海克斯's name (`tier`: the highest it draws, the offer's note). */
const offerChess = (ctx, id, ids, tier) => ids.length > 0 && ctx.offerChess(ids, { source: KEY(id), label: NAME[id], tier });
const offerItems = (ctx, id, ids, tier) => ids.length > 0 && ctx.offerItems(ids, { source: KEY(id), label: NAME[id], tier });

/** Up to n different chess ids (rollChess: copy-weighted from the pool and the player's 自选 stock) passing `opts`. */
function drawChess(ctx, n, opts = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const id = ctx.rollChess({ ...opts, filter: (x) => !out.includes(x) && (!opts.filter || opts.filter(x)) });
    if (!id) break;
    out.push(id);
  }
  return out;
}

/** The shop's items of tiers lo…hi (gamedata shopItemsByTier: normal equipment, no special item), the data's order. */
function shopItems(ctx, lo, hi) {
  const out = [];
  for (let t = Math.max(1, lo); t <= Math.min(6, hi); t++) out.push(...(ctx.gd.shopItemsByTier[t] || []));
  return out;
}

/** Up to n different entries of `list` (ctx.rng). */
function sample(ctx, list, n) {
  const left = list.slice();
  const out = [];
  while (out.length < n && left.length) out.push(left.splice(Math.floor(ctx.rng() * left.length), 1)[0]);
  return out;
}

/** The bonds of the player's board operators (pieceBonds: 变形同构体's too), the mode's switched-off ones left out. */
function boardBonds(ctx) {
  const off = ctx.gd.modeInactiveBonds instanceof Set ? ctx.gd.modeInactiveBonds : null;
  const out = new Set();
  for (const v of ctx.board()) {
    if (!v || v.kind !== 'chess') continue;
    for (const b of ctx.pieceBonds(v.uid)) if (!off || !off.has(b)) out.add(b);
  }
  return out;
}
/** Whether chess `id` has one of `bonds` (the player's data view). */
const ofBonds = (ctx, bonds) => (id) => (ctx.chessRecord(id)?.bonds || []).some((b) => bonds.has(b));

/** The base ids the player owns a copy of (board, hand, temp; normal or elite). */
function ownedBases(ctx) {
  const out = new Set();
  for (const v of [...ctx.board(), ...ctx.hand(), ...ctx.temp()]) if (v && v.kind === 'chess') out.add(ctx.gd.baseIdOf(v.id));
  return out;
}

// ---- "every N rounds" (from the pick, 军需's way): the pick round in a counter, the rounds left on the EffectRef

const FROM = (id) => `aug6:${id}:from`;

/** The pick of a periodic one: its round noted, `every` rounds to the next on its icon. */
function startEvery(ctx, id, every) {
  ctx.setCounter(FROM(id), ctx.round);
  ctx.setEffectCounter(KEY(id), every);
}

/** Round start of a periodic one: whether this round is pick + k·every (k ≥ 1); the icon's countdown follows. */
function everyDue(ctx, id, every) {
  const from = ctx.counter(FROM(id));
  if (!(from > 0) || ctx.round <= from) return false;
  const k = (ctx.round - from) % every;
  ctx.setEffectCounter(KEY(id), every - k);
  return k === 0;
}

/** A periodic handler: `run(ctx)` at the pick when `atPick`, then every `every` rounds after it. */
function periodic(id, every, run, atPick = true) {
  return {
    onAugmentPick(ctx) {
      startEvery(ctx, id, every);
      if (atPick) run(ctx);
    },
    onRoundStart(ctx) { if (everyDue(ctx, id, every)) run(ctx); },
  };
}

/** Prep side: augment id → (params) => handler object (onRoundStart, onBuy, onSpend, onPrepEnd, …). */
export const META = Object.freeze({
  // C2 精锐速递: a <博士投影> now and every `every` rounds after the pick
  aug_golden_express: (p) => periodic('aug_golden_express', Math.max(1, int(p.every, 3)), (ctx) => grantItemTo(ctx, 'aug_golden_express', ITEM.projector)),

  // C5 复制许可
  aug_mimic: (p) => ({
    onAugmentPick(ctx) { for (let i = 0; i < Math.max(0, int(p.n, 2)); i++) grantItemTo(ctx, 'aug_mimic', ITEM.mimic); },
  }),

  // C6 军火商: n different random shop items of tiers minTier…maxTier, pick one for free
  aug_arms_dealer: (p) => ({
    onAugmentPick(ctx) {
      const hi = int(p.maxTier, 6);
      const ids = sample(ctx, shopItems(ctx, int(p.minTier, 5), hi), Math.max(1, int(p.n, 4)));
      offerItems(ctx, 'aug_arms_dealer', ids, hi);
    },
  }),

  // C7 突变 / C8 天马座 / C9 人事调动 / C21 教鞭: their items
  aug_mutation: () => ({ onAugmentPick(ctx) { grantItemTo(ctx, 'aug_mutation', ITEM.mutation); } }),
  aug_pegasus: () => ({
    onAugmentPick(ctx) {
      grantItemTo(ctx, 'aug_pegasus', ITEM.helm);
      grantItemTo(ctx, 'aug_pegasus', ITEM.lance);
    },
  }),
  aug_hr: () => ({ onAugmentPick(ctx) { grantItemTo(ctx, 'aug_hr', ITEM.hr); } }),
  aug_whip: () => ({ onAugmentPick(ctx) { grantItemTo(ctx, 'aug_whip', ITEM.whip); } }),

  // C10 维式全家桶: one of the special hammers (normal quality), uniformly
  aug_hammer_box: () => ({
    onAugmentPick(ctx) {
      const items = ctx.data && ctx.data.items && typeof ctx.data.items === 'object' ? Object.entries(ctx.data.items) : [];
      const list = items.filter(([, r]) => r && r.family === HAMMER_FAMILY && !r.isGolden && r.itemType === 'EQUIP').map(([id]) => id).sort();
      grantItemTo(ctx, 'aug_hammer_box', sample(ctx, list, 1)[0]);
    },
  }),

  // C11 夕的画卷: a <画卷> and funds (once: no loop)
  aug_scroll: (p) => ({
    onAugmentPick(ctx) {
      grantItemTo(ctx, 'aug_scroll', ITEM.scroll);
      const funds = Math.max(0, int(p.funds, 4));
      if (funds > 0) ctx.addFunds(funds, KEY('aug_scroll'));
    },
  }),

  // C12 群星: n different random tier-6 operators, pick one for free — now and every `every` rounds after
  aug_stars: (p) => periodic('aug_stars', Math.max(1, int(p.every, 3)),
    (ctx) => offerChess(ctx, 'aug_stars', drawChess(ctx, Math.max(1, int(p.n, 3)), { tier: 6 }), 6)),

  // C13 神谕: every round start, n different random operators of the board's bonds (tier ≤ level + up), pick one
  aug_oracle: (p) => ({
    onRoundStart(ctx) {
      const bonds = boardBonds(ctx);
      if (!bonds.size) return;
      const maxTier = Math.max(1, Math.min(6, (Number(ctx.shopLevel()) || 1) + int(p.up, 1)));
      offerChess(ctx, 'aug_oracle', drawChess(ctx, Math.max(1, int(p.n, 3)), { maxTier, filter: ofBonds(ctx, bonds) }), maxTier);
    },
  }),

  // C14 补货: every round start, a random operator of the board's bonds, tier ≤ min(maxTier, the dispatch level)
  aug_restock: (p) => ({
    onRoundStart(ctx) {
      const bonds = boardBonds(ctx);
      if (!bonds.size) return;
      const maxTier = Math.max(1, Math.min(int(p.maxTier, 3), Number(ctx.shopLevel()) || 1));
      grantChessTo(ctx, 'aug_restock', ctx.rollChess({ maxTier, filter: ofBonds(ctx, bonds) }));
    },
  }),

  // C15 快递: n operators of tiers 1–maxTier now; `after` rounds later `later` of tier laterTier (the icon counts down)
  aug_delivery: (p) => {
    const AT = 'aug6:aug_delivery:at';
    return {
      onAugmentPick(ctx) {
        for (let i = 0; i < Math.max(0, int(p.n, 3)); i++) grantChessTo(ctx, 'aug_delivery', ctx.rollChess({ maxTier: Math.max(1, int(p.maxTier, 2)) }));
        const after = Math.max(1, int(p.after, 3));
        ctx.setCounter(AT, ctx.round + after);
        ctx.setEffectCounter(KEY('aug_delivery'), after);
      },
      onRoundStart(ctx) {
        const at = ctx.counter(AT);
        if (!(at > 0)) return;
        if (ctx.round < at) { ctx.setEffectCounter(KEY('aug_delivery'), at - ctx.round); return; }
        ctx.setCounter(AT, 0);
        ctx.setEffectCounter(KEY('aug_delivery'), null);
        for (let i = 0; i < Math.max(0, int(p.later, 2)); i++) grantChessTo(ctx, 'aug_delivery', ctx.rollChess({ tier: Math.max(1, int(p.laterTier, 3)) }));
      },
    };
  },

  // C16 猎头合同: the top core bond's operators the player has no copy of (tier ≤ the dispatch level), n different, pick one
  // — now and every `every` rounds after (nothing that time when the board has no core bond / none is left)
  aug_hunt_contract: (p) => periodic('aug_hunt_contract', Math.max(1, int(p.every, 3)), (ctx) => {
    const bond = topCoreOnBoard(ctx);
    if (!bond) return;
    const have = ownedBases(ctx);
    const filter = (id) => isBondMember(ctx, id, bond) && !have.has(ctx.gd.baseIdOf(id));
    const maxTier = Math.max(1, Math.min(6, Number(ctx.shopLevel()) || 1));
    offerChess(ctx, 'aug_hunt_contract', drawChess(ctx, Math.max(1, int(p.n, 3)), { maxTier, filter }), maxTier);
  }),

  // C18 装备补给箱: n random shop items of tiers minTier…maxTier
  aug_crate: (p) => ({
    onAugmentPick(ctx) {
      const list = shopItems(ctx, int(p.minTier, 2), int(p.maxTier, 3));
      for (let i = 0; i < Math.max(0, int(p.n, 2)); i++) grantItemTo(ctx, 'aug_crate', sample(ctx, list, 1)[0]);
    },
  }),

  // C19 自动化工厂: every `every` rounds after the pick, a random shop item of tiers minTier…min(maxTier, level + up)
  aug_factory: (p) => periodic('aug_factory', Math.max(1, int(p.every, 2)), (ctx) => {
    const lo = int(p.minTier, 3);
    const hi = Math.max(lo, Math.min(int(p.maxTier, 5), (Number(ctx.shopLevel()) || 1) + int(p.up, 1)));
    grantItemTo(ctx, 'aug_factory', sample(ctx, shopItems(ctx, lo, hi), 1)[0]);
  }, false),
});
