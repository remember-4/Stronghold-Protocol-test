// shared/augmentDef.js — A6000 fork: the 海克斯 definition helpers and the six rarities (白 绿 蓝 紫 金 红, the user's call
// of 2026-10-10: 「多做一些海克斯，稀有度从白绿蓝紫金红不等，概率你看着来」). Its own module so the batch files of the fifth
// version (shared/augments5/*.js) and shared/augments.js can both build definitions without importing each other.

import { N_ } from './i18n.js';

/** Rarity 1…6 = 白 绿 蓝 紫 金 红. */
export const RARITY_NAME = Object.freeze({ 1: N_('白'), 2: N_('绿'), 3: N_('蓝'), 4: N_('紫'), 5: N_('金'), 6: N_('红') });
export const RARITIES = Object.freeze([1, 2, 3, 4, 5, 6]);
/**
 * The three bands of the older tiers (白银 / 黄金 / 彩色): 白 绿 → 1, 蓝 紫 → 2, 金 红 → 3. A generic definition's `tier`
 * is its rarity's band (tools and the balance runs still speak in tiers); 职业专精 picks its tier by the rolled band.
 */
export const bandOf = (rarity) => (rarity <= 2 ? 1 : rarity <= 4 ? 2 : 3);

/** 职业专精's extra: the profession (the operators' `profession`) the augment is about. */
export const CLS = (cls) => ({ cls });

/**
 * A definition by tier (the generic augments of the first four versions, 专属强化, 职业专精 — their rarity is set by
 * shared/augments.js). `side`: 'battle' (server/sim/content/augments.js), 'meta' (prep only), 'both'.
 */
export const aug = (id, tier, name, desc, params, side, band = null, extra = null) => Object.freeze({
  id, tier, name, desc, params: Object.freeze(params), side, band, coop: false, action: false, ...(extra || {}),
});

/** A definition by rarity (the fifth version on): its tier is the rarity's band. */
export const augR = (id, rarity, name, desc, params, side, extra = null) => Object.freeze({
  id, tier: bandOf(rarity), rarity, name, desc, params: Object.freeze(params), side, band: null, coop: false, action: false, ...(extra || {}),
});
