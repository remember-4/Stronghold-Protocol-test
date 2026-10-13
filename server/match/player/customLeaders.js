export const HODRER = 'band_custom_hodrer';
export const WISDEL = 'band_custom_wisdel';
export const THERESA = 'band_custom_theresa';
export function mercenaryBonus(ps, incoming = null, replaced = null) {
  if (ps.bandId !== HODRER) return 0;
  return [...ps.board.values(), incoming].some(p => p && p !== replaced && p.kind === 'chess' && p.meta?.mercenary) ? 1 : 0;
}
export function markMercenaryShop(ps) {
  for (const slot of ps.shop.slots) if (slot) delete slot.mercenary;
  if (ps.bandId !== HODRER) return;
  const first = ps.shop.slots.find(s => s?.kind === 'chess' && !s.sold);
  if (first) first.mercenary = true;
}
export const operatorKey = (ps, id) => ps.gd.chess(id)?.charId || ps.gd.baseIdOf(id);
export function rememberOperator(ps, id) {
  ps.leaderAcquired ??= new Set();
  ps.leaderAcquired.add(operatorKey(ps, id));
}
export function rally(ps) {
  if (ps.bandId !== WISDEL) return;
  ps.counters.wisdelRally = (ps.counters.wisdelRally || 0) + 1;
  if (ps.counters.wisdelRally >= 6) {
    ps.counters.wisdelRally -= 6;
    ps.shop.freeRefreshes++;
    ps.counters.wisdelDiscounts = (ps.counters.wisdelDiscounts || 0) + 1;
  }
}
/** Consume only a previously earned discount. A reward earned by this refresh applies to the NEXT one. */
export function applyLeaderDiscount(ps) {
  if (ps.bandId !== WISDEL) return;
  if (ps.counters.wisdelDiscounts > 0) {
    ps.counters.wisdelDiscounts--;
    for (const slot of ps.shop.slots) if (slot?.kind === 'chess' && !slot.kept) slot.leaderDiscount = 1;
  }
}
export function leaderRefresh(ps) {
  if (ps.bandId === WISDEL && ps.round.refreshes <= 3) rally(ps);
}
