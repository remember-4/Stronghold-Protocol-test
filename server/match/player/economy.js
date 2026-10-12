// server/match/player/economy.js — PlayerState methods: the economy — funds, spending (onSpend), prep-side bond layer
// gains (clamped by layerGainRoom), the shop (onPrice prices, copy-weighted rolls from the shared pool plus the player's
// own 自选 stock — player/diy.js —, freeze) and its intents: g.buy, g.refresh, g.freeze, g.levelUp, g.sell.
// Installed on PlayerState.prototype by server/match/PlayerState.js (a method container: never instantiated; `this` is
// the player state).

import { fundsFloor } from '../../../shared/sarkazCredit.js';
import { ERR, layerGainRoom } from '../../../shared/constants.js';
import { freeSlot } from '../board.js';
import { OK, fail } from './common.js';
// A6000 fork, 海克斯第六版 batch g6: the shop / funds rules of the player's own augments (none: nothing changes)
import { fundsVoided, shopLock, luckyRefresh, rollFilter, shopChessBonus } from '../augments5/g6.js';

export class PlayerEconomy {
  addFunds(n, { reason = '' } = {}) {
    if (!Number.isFinite(n) || n === 0) return 0;
    const v = Math.trunc(n);
    // 海克斯·灵质: no gain but the round income and a sale
    if (v > 0 && fundsVoided(this, v, reason)) return 0;
    const before = this.funds;
    this.funds = Math.max(fundsFloor(this), this.funds + v);
    if (v > 0) this.stats.fundsGained += v;
    if (v > 0 && String(reason).startsWith('augment:')) this.augFunds = (this.augFunds || 0) + v; // (audit.js)
    // A6000 fork: funds a 敌人强化 takes back (限流), as taken (never below 0) — audit.js counts them at the round start
    if (v < 0 && String(reason).startsWith('enemyBuff:')) this.ebFunds = (this.ebFunds || 0) + (this.funds - before);
    this.dirty();
    // A6000 fork: funds gained, for the 海克斯 that count them (专属强化·绮良; an augment's own payout is not counted again)
    if (v > 0 && !String(reason).startsWith('augment:')) this.m.dispatch(this, 'onFundsGain', { amount: v, reason }, { quiet: true });
    return this.funds - before;
  }

  spend(n) {
    const v = Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
    if (v > this.funds - fundsFloor(this)) return false;
    this.funds -= v;
    this.stats.gold += v;
    this.round.spent += v;
    this.dirty();
    return true;
  }

  /** onSpend, dispatched once a payment's action is complete (buy / refresh / levelUp / reward / effect). */
  _afterSpend(amount, reason) {
    if (!(amount > 0)) return;
    this.m.dispatch(this, 'onSpend', { amount, reason, total: this.stats.gold });
  }

  /**
   * Bond layer gain (prep-side). `requireActive` = "使已激活的【X】层数+N". Returns layers added: at most the room left
   * under BOND_LAYER_CAP (999, shared/constants.js) — a gain at the cap adds 0 and dispatches nothing.
   */
  addLayers(bondId, n, { requireActive = false, reason = '', hook = null } = {}) {
    if (!this.gd.bond(bondId) || !Number.isFinite(n) || n <= 0) return 0;
    if (requireActive && !(this.bonds[bondId] && this.bonds[bondId].active)) return 0;
    const before = this.layers[bondId] || 0;
    // A6000 fork, 敌人强化·叠层税: a 特质 gain (reason 'garrison:…') is cut (match/enemyVotes.js enemyLayerTax; as is without it)
    const want = typeof this.m.enemyLayerTax === 'function' ? this.m.enemyLayerTax(Math.floor(n), reason) : Math.floor(n);
    const add = layerGainRoom(before, want);
    if (add <= 0) return 0;
    this.layers[bondId] = before + add;
    this.recompute();
    // `hook`: the dispatch the gain came from (ctx.addLayers) — 海克斯·休整研读 reads the 进入休整期时 / 休整期结束时 ones
    this.m.dispatch(this, 'onLayers', { bondId, from: before, to: before + add, reason, hook });
    return add;
  }

  /** Effective price of a shop slot after onPrice modifiers (never negative). */
  priceOf(slot) {
    if (!slot) return 0;
    const ev = { slot, kind: slot.kind, id: slot.id, price: slot.basePrice };
    this.m.dispatch(this, 'onPrice', ev, { quiet: true });
    const p = Number(ev.price);
    return Number.isFinite(p) ? Math.max(0, Math.round(p)) : slot.basePrice;
  }

  _rollChessSlot() {
    // the slotted 自选 pieces join the draw once the 调度中心 reaches their slot's level (player/diy.js diyRollEntries)
    const opts = { maxTier: this.shop.level, extra: this.diyRollEntries() };
    // A6000 fork: 海克斯·精品店 — no tier-1 operator from its level on
    const filter = rollFilter(this);
    if (filter) opts.filter = filter;
    const id = this.m.pool.roll(this.m.rngShop, opts);
    return id ? { kind: 'chess', id, basePrice: this.gd.chessPrice(id), frozen: false, sold: false } : null;
  }

  _rollItemSlot() {
    const id = this.m.pool.rollItem(this.m.rngShop, this.shop.level);
    return id ? { kind: 'item', id, basePrice: this.gd.itemPrice(id), frozen: false, sold: false } : null;
  }

  /**
   * The shop's slot counts at its level: the data's, plus the item slots of 海克斯·武器库 and the chess slots of 海克斯·大卖场
   * while it is held (A6000 fork).
   */
  _shopLayout() {
    const { chess, item } = this.gd.shopSlots(this.shop.level);
    return { chess: chess + shopChessBonus(this), item: item + Math.max(0, Math.trunc(Number(this.shopItemBonus) || 0)) };
  }

  /** 海克斯·武器库: `n` more item slots from now on, the new ones filled at once (like a level-up's). */
  addShopItemSlots(n) {
    const v = Math.max(0, Math.trunc(Number(n) || 0));
    if (!v) return;
    this.shopItemBonus = (Number(this.shopItemBonus) || 0) + v;
    this._openLevelSlots();
    this.dirty();
  }

  /**
   * Reroll the shop. keepFrozen → frozen unsold slots survive (round start); otherwise everything is rerolled
   * (manual refresh). Slot counts follow the current level.
   */
  rollShop({ keepFrozen = false } = {}) {
    const { chess: nChess, item: nItem } = this._shopLayout();
    const old = this.shop.slots;
    const layout = this.shop.layout || { chess: old.length, item: 0 };
    const oldChess = old.slice(0, layout.chess);
    const oldItems = old.slice(layout.chess);
    // A6000 fork: `kept` marks a slot frozen over a round start (海克斯·冻结优惠 prices it)
    const keep = (s, kind) => (keepFrozen && s && s.kind === kind && !s.sold && s.frozen ? { ...s, kept: true } : null);
    // frozen slots keep their position; sold / empty / unfrozen positions are rerolled
    const slots = [];
    for (let i = 0; i < nChess; i++) slots.push(keep(oldChess[i], 'chess') ?? this._rollChessSlot());
    for (let i = 0; i < nItem; i++) slots.push(keep(oldItems[i], 'item') ?? this._rollItemSlot());
    this.shop.slots = slots;
    this.shop.layout = { chess: nChess, item: nItem };
    for (const s of slots) if (s) s.frozen = this.shop.frozen;
    this.dirty();
  }

  /**
   * The 调度中心's upgrade opens the new level's extra slots at once, each with a new card drawn at the new level; the
   * cards already shown stay where they are (chess slots keep their index, the item slot stays after them). Official: the
   * tutorial's 休整期 page 「升级：…升级后将出现更多的商品栏位、可调度干员以及新装备」; the community report of 2026-10-06
   * (item 19) 「升级商店获得新的商店位时用新卡补上，而不是空着」. Until 0.2.0 the extra slots waited for the next roll (a
   * refresh or the round start). [ASSUMED] the new card follows the freeze toggle, as a manual refresh's cards do.
   */
  _openLevelSlots() {
    const { chess: nChess, item: nItem } = this._shopLayout();
    const old = this.shop.slots;
    const layout = this.shop.layout || { chess: old.length, item: 0 };
    if (nChess <= layout.chess && nItem <= layout.item) return;
    const chess = old.slice(0, layout.chess);
    const items = old.slice(layout.chess);
    const fresh = (s) => { if (s) s.frozen = this.shop.frozen; return s; };
    while (chess.length < nChess) chess.push(fresh(this._rollChessSlot()));
    while (items.length < nItem) items.push(fresh(this._rollItemSlot()));
    this.shop.slots = [...chess, ...items];
    this.shop.layout = { chess: chess.length, item: items.length };
  }

  /** Combat start: unfrozen slots are emptied (research 01 A1). */
  clearUnfrozenShop() {
    this.shop.slots = this.shop.slots.map((s) => (s && s.frozen && !s.sold ? s : null));
    this.dirty();
  }

  /**
   * g.buy {slot}. A full regular hand refuses every purchase, also one whose copy would complete a merge at once (PRTS
   * 卫戍协议/帮助 §手牌区 "当常规手牌区全满无空位时，玩家将无法执行使手牌溢出的操作" — "例如招募/购入等通常情况下会增加手牌的
   * 操作"; BWIKI 盟约 "当整备区达到上限后将无法进行涉及到整备区的操作（购买、撤回等）"; GitHub #82: the reporter's first-hand
   * check in the official game, "哪怕是已经有了两个相同干员情况"). Until 0.1.3 such a purchase was let through.
   */
  buy(slotIdx) {
    const g = this._gate(); if (g) return g;
    if (!Number.isInteger(slotIdx) || slotIdx < 0 || slotIdx >= this.shop.slots.length) return fail(ERR.BAD_TARGET);
    const slot = this.shop.slots[slotIdx];
    if (!slot) return fail(ERR.BAD_TARGET);
    if (slot.sold) return fail(ERR.SOLD_OUT);
    // A6000 fork: 海克斯·闭关修炼 — no operator bought in its rounds
    if (slot.kind === 'chess') { const lock = shopLock(this, 'buy'); if (lock) return lock; }
    const price = this.priceOf(slot);
    if (this.funds - fundsFloor(this) < price) return fail(ERR.NO_FUNDS);
    // (A6000 fork, 海克斯第六版 负重前行: a closed hand slot is no room — player/pieces.js openHandSlot)
    const handFull = this.openHandSlot() < 0;
    // A6000 fork: 海克斯·预备队 — a full hand buys into the 临时整备区 while it has room (temp blocks Ready until resolved)
    const reserve = handFull && Array.isArray(this.augments) && this.augments.includes('aug_reserve') && freeSlot(this.temp) >= 0;
    let piece;
    if (slot.kind === 'chess') {
      const rec = this.gd.chess(slot.id);
      // a DIY slot sells only as this player's own 自选 piece (a slotted slot's record carries `diyFor`)
      if (!rec || (rec.isDiy && !rec.diyFor)) return fail(ERR.BAD_TARGET);
      const base = this.gd.baseIdOf(slot.id);
      const need = rec.isGolden ? this.gd.goldenCopies : 1;
      const pool = this.poolOf(base);
      if (pool.has(base) && pool.left(base) < need) return fail(ERR.SOLD_OUT);
      if (handFull && !reserve) return fail(ERR.HAND_FULL);
      this.spend(price);
      slot.sold = true;
      piece = this.acquireChess(slot.id, { source: 'buy', toTemp: reserve });
    } else {
      if (!this.gd.item(slot.id)) return fail(ERR.BAD_TARGET);
      if (handFull && !reserve) return fail(ERR.HAND_FULL);
      this.spend(price);
      slot.sold = true;
      piece = this.acquireItem(slot.id, { source: 'buy', toTemp: reserve });
    }
    this.stats.buys++;
    this.round.buys++;
    this.m.dispatch(this, 'onBuy', { piece, slot, price, kind: slot.kind });
    this._afterSpend(price, 'buy');
    this.recompute();
    return OK;
  }

  /** A6000 fork: a paid manual refresh's price — the data's plus 敌人强化 (match/enemyVotes.js enemyRefreshTax). */
  refreshPriceNow() {
    return this.gd.refreshPrice + Math.max(0, Math.trunc(Number(this.m.enemyRefreshTax?.(this)) || 0));
  }

  refresh() {
    const g = this._gate(); if (g) return g;
    // A6000 fork: 海克斯·闭关修炼 / 苦修 — no refresh (a free one neither)
    const lock = shopLock(this, 'refresh'); if (lock) return lock;
    const free = this.shop.freeRefreshes > 0;
    let price = free ? 0 : this.refreshPriceNow();
    if (!free && this.funds - fundsFloor(this) < price) return fail(ERR.NO_FUNDS);
    // A6000 fork: 海克斯·幸运刷新 — a paid refresh may cost nothing (drawn for a holder who can pay it)
    const lucky = !free && price > 0 && luckyRefresh(this);
    if (lucky) price = 0;
    if (free) this.shop.freeRefreshes--;
    else this.spend(price);
    this.rollShop({ keepFrozen: false });
    this.stats.refreshes++;
    this.round.refreshes++;
    this.m.dispatch(this, 'onRefresh', lucky ? { slots: this.shop.slots, free, price, lucky } : { slots: this.shop.slots, free, price });
    this._afterSpend(price, 'refresh');
    this.dirty();
    return OK;
  }

  freeze() {
    const g = this._gate(); if (g) return g;
    this.shop.frozen = !this.shop.frozen;
    for (const s of this.shop.slots) if (s && !s.sold) s.frozen = this.shop.frozen;
    this.dirty();
    return OK;
  }

  levelUp() {
    const g = this._gate(); if (g) return g;
    if (this.shop.level >= this.gd.maxShopLevel) return fail(ERR.MAX_LEVEL);
    const price = Math.max(0, this.shop.upgradePrice);
    if (this.funds - fundsFloor(this) < price) return fail(ERR.NO_FUNDS);
    this.spend(price);
    this.shop.level++;
    this.shop.upgradePrice = this.gd.upgradeBase(this.shop.level) ?? 0;
    this._openLevelSlots();
    this.m.tickerFor('SHOP_LEVEL', [this.name, String(this.shop.level)], { playerId: this.playerId, param: String(this.shop.level) });
    this.m.dispatch(this, 'onLevelUp', { level: this.shop.level, price });
    this._afterSpend(price, 'levelUp');
    this.dirty();
    return OK;
  }

  /**
   * A6000 fork (海克斯·跳级, 闭关修炼): a level-up of the 调度中心 the player does not pay for, in any phase — the new
   * level's slots, the ticker and onLevelUp (ev.free) as a paid one's. false at the top level.
   */
  freeLevelUp() {
    if (!this.alive || this.shop.level >= this.gd.maxShopLevel) return false;
    this.shop.level++;
    this.shop.upgradePrice = this.gd.upgradeBase(this.shop.level) ?? 0;
    this._openLevelSlots();
    this.m.tickerFor('SHOP_LEVEL', [this.name, String(this.shop.level)], { playerId: this.playerId, param: String(this.shop.level) });
    this.m.dispatch(this, 'onLevelUp', { level: this.shop.level, price: 0, free: true });
    this.dirty();
    return true;
  }

  sell(uid) {
    const g = this._gate(); if (g) return g;
    const loc = this.find(uid);
    if (!loc) return fail(ERR.BAD_TARGET);
    if (loc.piece.kind !== 'chess') return fail(ERR.BAD_TARGET, loc.piece.kind === 'item' ? 'items cannot be sold' : 'tokens cannot be sold');
    const piece = loc.piece;
    // its equipment returns to the hand (overflow temp): refuse rather than destroy it when there is no room (A6000 fork,
    // 负重前行: a closed hand slot takes nothing — the one the sold piece leaves included)
    const freed = loc.area === 'temp' || (loc.area === 'hand' && this.handSlotOpen(loc.idx)) ? 1 : 0;
    const room = this.freeHandCount() + this.temp.filter((x) => x == null).length + freed;
    if ((piece.items || []).length > room) return fail(ERR.HAND_FULL, 'no room for the equipment');
    this._detach(loc);
    this.removeTokensOf(piece.uid);
    for (const it of piece.items || []) {
      if (!this.stow(it, { allowTemp: true })) this.m.log.warn?.(`[match ${this.m.roomCode}] ${this.playerId}: item ${it.id} lost on sell (no space)`);
    }
    piece.items = [];
    this.returnCopies(piece);
    const ev = { piece, gain: this.gd.sellPrice(piece.id) };
    this.m.dispatch(this, 'onSold', ev);
    const gain = Number.isFinite(ev.gain) ? Math.max(0, Math.trunc(ev.gain)) : 1;
    this.addFunds(gain, { reason: 'sell' });
    this.stats.sells++;
    this.round.sells++;
    this.checkItemMerges();
    this.recompute();
    return OK;
  }
}
