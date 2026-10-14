// public/js/ui/teamFx.js — A6000 fork, 海克斯第五版 (batch g4b): 队伍特效, the team panel's show of the team 海克斯
// (_ops/stronghold-a6000/analysis/海克斯第五版候选-联动与节目效果.md §3: 3.2 one message and one layer, 3.3 / 3.4 the look
// of each). Every client — players and spectators — gets m.teamFx { kind, round, from, to, also, amount, item, chess,
// augment } when a team 海克斯 moves something between teammates (server/match/match/augments.js teamFx); the ticker line
// comes as before, so a client that draws nothing still tells the story.
//
//   main.js      keeps the recent events (store.teamFx.list) and folds each into the match's state of them
//                (store.teamFx.state: who holds a bomb / the baton, who is bound to whom, this round's marks) — pushTeamFx
//                = orientTeamFx + reduceTeamFx.
//   TeamPanel    (ui/teamPanel.js) calls useTeamFx and draws per row: the badges on the avatar (FxBadges: what the player
//                holds now — always shown), the pops on it (FxPops), the numbers beside the LP (FxFloats: LP, funds with
//                the coin glyph, layers), 「仇 ×N」 (GrudgeTag: m.private.grudges, the player's own grudges only) and the
//                click 海克斯 used on a teammate (TEAM_ACTIONS, P8 加油 / P11 卖队友: beside 前往查看 in the prep →
//                g.augAction { id, target }); over the rows TeamFxLayer: the flights between avatars (0.4–0.8 s), the
//                lines between two rows (同生共死's chain and 打赌's VS stay; the short ones go), the two rows' swap moves;
//                above every screen (a body-level host, so the 海克斯 / 机变 overlays never hide them) the small banner of
//                the few big moments (1.5 s, one at a time, the round's 作战结束 box look, never taking a click) and P9
//                传声筒's loud emote (an m.emote with `loud`: big and translucent at the top centre for 2 s).
//   setting      队友互动效果 (ui/settings.js `teamFx`): 'all' | 'mine' (default, the user's call of 2026-10-10) | 'off'. It
//                filters the flights, pops, numbers, short lines, banners and loud emotes — never the badges or the
//                lasting links. 'mine' (fxConcerns): the player is `from`, `to` or in `also`, or the thing reaches the
//                whole team (the bomb and the baton go round it; 献祭 / 团队精神 / 遗产 give everyone something); a
//                spectator or an eliminated player — nothing can concern them any more — sees everything.
//   motion       prefers-reduced-motion: nothing flies or moves; icons appear and disappear in place.
//
// How the fields are read (the server batch g4a's calls, server/match/augments5/g4.js and match/augments.js; orientTeamFx
// turns an event around when m.public players[].augments shows the 海克斯's holder on the other side): `from` → `to` is
// the way the thing goes (who loses → who gains); a one-player event names its player in `to`; `amount` > 0, its unit per
// kind.
//   vampire from=drained to=vampire · sacrifice from=sacrificer also=teammates · bound from=holder to=mate · boundAvg the
//   pair, amount=the LP both have now · rob from=robbed to=robber · blame from=blamer to=receiver amount=LP · bomb
//   from=last holder (null when lit) to=new holder (also=its lighter) · bombDefuse / bombBoom to=the holder (from=its
//   lighter), amount=funds / LP · speaker to=the decider · legacy from=eliminated to=an heir (one event each, or also=the
//   heirs) amount=funds each, chess · mutual / watch / cover / sync to=the holder, amount=funds (cover: also=the leakers)
//   · together from=holder to=partner · swap from=holder to=mate · lifeswap from=the teammate with the most LP to=holder
//   amount=the LP moved · teamPerfect also=the team amount=funds each · bet pairing (amount null) from=holder to=rival,
//   result from=loser to=winner amount=funds, a draw amount=0 · lead from=the new leader to=the other player of the
//   field (pushTeamFx turns it into from=last leader to=new leader) · collective from=leaker to=holder amount=LP ·
//   redpacket from=sender to=receiver amount=funds (one per receiver) · cheer from=cheerer to=cheered (amount null), the
//   reward amount=funds each · baton from=last holder to=new holder amount=funds the last one got (from=null: kept) ·
//   sell from=sold to=seller amount=funds (the sold loses the 海克斯's `lp`, default 1) · absorb from=drained to=holder
//   amount=layers · pickpocket from=robbed to=thief item (no item: amount=funds) · snipe from=buyer to=sniper chess ·
//   extort / protection / credit from=payer to=holder amount=funds · possess from=victim to=holder chess · mole
//   from=the 内鬼 to=its field mate (also: more mates).
//   海克斯第六版 batch g11 (server/match/augments5/g11.js): freeride from=the bound teammate to=holder (amount null: the bond
//   — a lasting thin line; amount=funds: his merge) · copycat / snatch from=teammate to=holder chess · borrowKnife
//   from=the 联防 helper to=holder amount=funds · borrow from=lender to=borrower augment=the 海克斯 lent (borrowBack: its
//   return) · doubleAgent from=holder to=target (amount null: the bet), from=target to=holder amount=funds (the payout) ·
//   cuckoo from=teammate to=holder amount=layers · contrarian to=holder amount=funds · kickback / titForTat / splitBill
//   from=payer to=holder amount=funds · equalize from=richer to=poorer amount=funds (also=the holder) · usurp from=the old
//   captain (or null) to=the new one (amount null: the crown, lasting), from=teammate to=captain amount=the tribute.
// Styles: public/css/teamfx.css (injected on first use: the pages do not link it).

import { useEffect, useLayoutEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { render } from '../../vendor/preact.module.js';
import { PHASE } from '../../../shared/constants.js';
import { augmentDef } from '../../../shared/augments.js';
import { html } from './components.js';
import { PlayerAvatar, Img } from './gameComponents.js';
import { EmoteArt } from './emotes.js';
import { chessAvatarUrl, itemIconUrl, effectIconUrl } from './assetUrls.js';
import { reducedMotion } from './device.js';
import { act } from './gameActions.js';
import { settingsStore, teamFxMode } from './settings.js';
import { useStore, shallowEqual } from '../store.js';
import { data } from '../data.js';
import { audio } from '../audio.js';
import { t, N_ } from '../../../shared/i18n.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const pidOf = (v) => (typeof v === 'string' && v.length > 0 && v.length <= 64 ? v : null);
const strOf = (v, n = 64) => (typeof v === 'string' && v ? v.slice(0, n) : null);
const MINUS = '\u2212';

export const TEAMFX_CSS_HREF = '/css/teamfx.css';
/** Events kept in store.teamFx.list (the state keeps what lasts). */
export const TEAMFX_KEEP = 40;
/** A banner's time on screen (then 300 ms to close), the loud emote's. */
export const BANNER_MS = 1500;
export const LOUD_MS = 2000;
/** An event older than this when the panel first sees it is history: no animation. */
const FRESH_MS = 8000;
/** Banners waiting their turn (the oldest beyond go), and how old a waiting one may get. */
const BANNER_QUEUE = 3;
const BANNER_STALE_MS = 12000;
const MAX_LIVE = 60;

/** P8 加油 / P11 卖队友: the click 海克斯 used on a teammate's avatar (g.augAction { id, target }) — the server batch's ids
 * (shared/augments5/g4.js of batch g4a, 2026-10-10); change them here if they move. */
export const AUG_CHEER = 'aug_cheer';
export const AUG_SELL = 'aug_sell_out';
export const TEAM_ACTIONS = Object.freeze([
  Object.freeze({ id: AUG_CHEER, key: 'cheer', label: N_('加油') }),
  Object.freeze({ id: AUG_SELL, key: 'sell', label: N_('卖队友') }),
]);
/**
 * 还手 (the user, 2026-10-11): on the row of a teammate the player holds `cost`+ grudges against, no 海克斯 needed —
 * the same g.augAction { id, target } (server/match/match/augments.js teamRetaliate; its numbers GRUDGE_DEBT_FUNDS /
 * GRUDGE_TRIP_PCT, kept equal here).
 */
export const RV_DEBT = 'aug_rv_debt';
export const RV_TRIP = 'aug_rv_trip';
export const REVENGE_ACTIONS = Object.freeze([
  Object.freeze({ id: RV_DEBT, key: 'debt', label: N_('讨债'), cost: 1, tip: N_('花 1 点仇：从他那里拿走 {n} 资金'), params: Object.freeze({ n: 1 }) }),
  Object.freeze({ id: RV_TRIP, key: 'trip', label: N_('使绊子'), cost: 2, tip: N_('花 2 点仇：他本回合自己那场战斗里，干员造成的伤害 −{pct}%'), params: Object.freeze({ pct: 10 }) }),
]);
/** 还手·不兜底: per grudge (at most GRUDGE_COVER_MAX) a helper's damage to his leaked enemies in a 联防 (server: GRUDGE_COVER_PCT). */
const COVER_PCT = 10;
const COVER_MAX = 2;
/** 记仇的互动: the LP floor at most this much lower (server: GRUDGE_FLOOR_MAX). */
const FLOOR_MAX = 2;

// ---- icons -----------------------------------------------------------------------------------------------------------

/**
 * The team effects' icons (24 × 24, currentColor; teamfx.css colours them per tone): a path, or { d, rule: 'evenodd' }
 * for one with holes, or { d, stroke } for a line drawing. 'packet' (红包) is drawn in its own two colours (FxGlyph).
 */
export const FX_GLYPHS = Object.freeze({
  drop: 'M12 2.5c3.3 4.7 6.5 8.3 6.5 12a6.5 6.5 0 0 1-13 0c0-3.7 3.2-7.3 6.5-12z',
  fangs: 'M3 4h18v3.4H3zM5.6 7.4h4.8L8 16.5zM13.6 7.4h4.8L16 16.5z',
  chain: { d: 'M5 9h5a3 3 0 0 1 0 6H5a3 3 0 0 1 0-6zM14 9h5a3 3 0 0 1 0 6h-5a3 3 0 0 1 0-6z', stroke: 2.2, rotate: -35 },
  bag: { d: 'M7.5 2h9l-2.6 4.6h-3.8zM12 6c5 0 8.2 4.8 8.2 9.4 0 4.2-3 6.6-8.2 6.6s-8.2-2.4-8.2-6.6C3.8 10.8 7 6 12 6zM8.2 8.4h7.6v1.4H8.2zM11.2 12.4h1.6v6h-1.6z', rule: 'evenodd' },
  pot: 'M1.5 10h3v1.8h-3zM19.5 10h3v1.8h-3zM4.5 9.5h15v2.3a7.5 7.5 0 0 1-15 0zM9 6.5h6V8H9z',
  bomb: 'M10.5 7a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM13.6 7.4l2-2 2 2-2 2zM19.5 1.8l.9 1.9 1.9.9-1.9.9-.9 1.9-.9-1.9-1.9-.9 1.9-.9z',
  smoke: 'M6.5 19a4.5 4.5 0 0 1-.6-8.96A5.5 5.5 0 0 1 16.6 8.3 4.5 4.5 0 1 1 17.5 19z',
  check: 'M3.5 12.6l2.1-2.1 4.4 4.4 8.4-8.4 2.1 2.1L10 19.1z',
  crown: 'M3 7.5l4.7 4.3L12 4.5l4.3 7.3L21 7.5l-1.8 10H4.8zM4.8 18.8h14.4v1.9H4.8z',
  card: { d: 'M6 2.5h12a1 1 0 0 1 1 1v17a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-17a1 1 0 0 1 1-1zM7.5 4.5v9h9v-9zM7.5 16v1.6h9V16z', rule: 'evenodd' },
  star: 'M12 2l2.3 7.7L22 12l-7.7 2.3L12 22l-2.3-7.7L2 12l7.7-2.3z',
  shield: 'M12 2l8 3v6.5c0 4.9-3.4 8.9-8 10.5-4.6-1.6-8-5.6-8-10.5V5z',
  flag: 'M5 2h2v20H5zM8 3h11l-2.5 4.5L19 12H8z',
  baton: 'M4.6 16.6L16.6 4.6a2.4 2.4 0 0 1 3.4 3.4L8 20a2.4 2.4 0 0 1-3.4-3.4z',
  tag: { d: 'M3 3h8.4L21 12.6 12.6 21 3 11.4zM7.2 5.7a1.5 1.5 0 1 0 .01 0z', rule: 'evenodd' },
  orb: 'M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16z',
  hand: 'M8 11V5.5a1.5 1.5 0 0 1 3 0V10h.6V4a1.5 1.5 0 0 1 3 0v6h.6V5.2a1.5 1.5 0 0 1 3 0V12h.4V8.8a1.4 1.4 0 0 1 2.8 0V14c0 4.4-3.2 8-7.8 8-3.4 0-5.6-1.8-7-4.6L3.3 13a1.5 1.5 0 0 1 2.5-1.6z',
  bill: { d: 'M5.5 2h13v20l-2.2-1.6-2.1 1.6-2.2-1.6-2.2 1.6-2.1-1.6-2.2 1.6zM8 7v1.6h8V7zM8 10.8v1.6h8v-1.6zM8 14.6v1.6h5v-1.6z', rule: 'evenodd' },
  swap: 'M7.5 3.5L3 8l4.5 4.5V9.2H17V6.8H7.5zM16.5 11.5v3.3H7v2.4h9.5v3.3L21 16z',
  ghost: { d: 'M12 2.5a7 7 0 0 1 7 7V21l-2.3-1.8-2.4 1.8-2.3-1.8-2.3 1.8-2.4-1.8L5 21V9.5a7 7 0 0 1 7-7zM9.3 8.2a1.6 1.6 0 1 0 .01 0zM14.7 8.2a1.6 1.6 0 1 0 .01 0z', rule: 'evenodd' },
  hat: 'M2.5 16h19v2.4h-19zM7 16l1.3-9.5h7.4L17 16z',
  target: { d: 'M11 2h2v3.1A7 7 0 0 1 18.9 11H22v2h-3.1A7 7 0 0 1 13 18.9V22h-2v-3.1A7 7 0 0 1 5.1 13H2v-2h3.1A7 7 0 0 1 11 5.1zm1 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4z', rule: 'evenodd' },
  heart: 'M12 21s-8.5-5.3-8.5-11.1A4.7 4.7 0 0 1 12 7a4.7 4.7 0 0 1 8.5 2.9C20.5 15.7 12 21 12 21z',
  bolt: 'M13.5 2L4.5 14h6.2l-1.2 8 9-12h-6.2z',
  coin: 'M12 3.5L16.2 10H7.8zM7 11.5L11.2 18H2.8zM17 11.5L21.2 18h-8.4z',
  item: 'M12 2.2L20.5 7v10L12 21.8 3.5 17V7z',
  anger: 'M2.5 10.2c3.6 0 6.5-2.9 6.5-6.5h2.3c0 4.9-3.9 8.8-8.8 8.8zM21.5 10.2c-3.6 0-6.5-2.9-6.5-6.5h-2.3c0 4.9 3.9 8.8 8.8 8.8zM2.5 13.8c3.6 0 6.5 2.9 6.5 6.5h2.3c0-4.9-3.9-8.8-8.8-8.8zM21.5 13.8c-3.6 0-6.5 2.9-6.5 6.5h-2.3c0-4.9 3.9-8.8 8.8-8.8z',
  packet: 'M5 2.5h14v19H5z',
});

/** One of FX_GLYPHS as an inline SVG (null for an unknown name). */
export function FxGlyph({ name, class: cls }) {
  if (name === 'packet') {
    return html`<svg class=${cx('tfx-glyph', 'tfx-glyph--packet', cls)} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path class="tfx-packet__body" d="M5 2.5h14v19H5z" /><path class="tfx-packet__flap" d="M5 2.5h14v5.5l-7 4.2-7-4.2z" />
      <circle class="tfx-packet__seal" cx="12" cy="11.6" r="2.3" /></svg>`;
  }
  const g = FX_GLYPHS[name];
  if (!g) return null;
  const d = typeof g === 'string' ? g : g.d;
  const shape = typeof g === 'object' && g.stroke
    ? html`<path d=${d} fill="none" stroke="currentColor" stroke-width=${g.stroke} stroke-linejoin="round" />`
    : html`<path d=${d} fill-rule=${typeof g === 'object' && g.rule ? g.rule : 'nonzero'} />`;
  return html`<svg class=${cx('tfx-glyph', cls)} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    ${typeof g === 'object' && g.rotate ? html`<g transform=${`rotate(${g.rotate} 12 12)`}>${shape}</g>` : shape}</svg>`;
}

// ---- the kinds -------------------------------------------------------------------------------------------------------

/**
 * Per kind: `glyph` its icon, `tone` its colour (teamfx.css .tfx--<tone>), `label` the 海克斯's name (msgid), `aug` the
 * 海克斯 that sends it when the event names none (orientTeamFx, its params), `holder` which side of the event holds that
 * 海克斯 in this panel's reading (null: either / both), `everyone` it reaches the whole team (「和我有关」 for all).
 */
export const KIND_FX = Object.freeze({
  vampire: { glyph: 'fangs', tone: 'blood', label: N_('吸血鬼'), aug: 'aug_vampire', holder: 'to' },
  sacrifice: { glyph: 'heart', tone: 'blood', label: N_('献祭'), aug: 'aug_sacrifice', holder: 'from', everyone: true },
  bound: { glyph: 'chain', tone: 'chain', label: N_('同生共死'), aug: 'aug_bound', holder: 'from' },
  boundAvg: { glyph: 'chain', tone: 'chain', label: N_('同生共死'), aug: 'aug_bound', holder: null },
  rob: { glyph: 'bag', tone: 'gold', label: N_('打劫'), aug: 'aug_rob', holder: 'to' },
  blame: { glyph: 'pot', tone: 'pot', label: N_('甩锅'), aug: 'aug_blame', holder: 'from' },
  bomb: { glyph: 'bomb', tone: 'bomb', label: N_('定时炸弹'), aug: 'aug_bomb', holder: null, everyone: true },
  bombDefuse: { glyph: 'check', tone: 'mint', label: N_('定时炸弹'), aug: 'aug_bomb', holder: null, everyone: true },
  bombBoom: { glyph: 'smoke', tone: 'red', label: N_('定时炸弹'), aug: 'aug_bomb', holder: null, everyone: true },
  speaker: { glyph: 'crown', tone: 'gold', label: N_('话事人'), aug: 'aug_speaker', holder: null },
  legacy: { glyph: 'card', tone: 'gold', label: N_('遗产'), aug: 'aug_legacy', holder: 'from', everyone: true },
  mutual: { glyph: 'coin', tone: 'gold', label: N_('资源互助'), aug: 'aug_mutual', holder: null },
  watch: { glyph: 'coin', tone: 'gold', label: N_('守望相助'), aug: 'aug_watch', holder: null },
  sync: { glyph: 'bolt', tone: 'sp', label: N_('战术同步'), aug: 'aug_sync', holder: null },
  together: { glyph: 'star', tone: 'mint', label: N_('并肩作战'), aug: 'aug_together', holder: null },
  swap: { glyph: 'swap', tone: 'swap', label: N_('灵魂交换'), aug: null, holder: 'from' },
  teamPerfect: { glyph: 'star', tone: 'gold', label: N_('团队精神'), aug: null, holder: null, everyone: true },
  bet: { glyph: 'coin', tone: 'gold', label: N_('打赌'), aug: null, holder: null },
  cover: { glyph: 'shield', tone: 'blue', label: N_('我来兜底'), aug: null, holder: null },
  lead: { glyph: 'crown', tone: 'gold', label: N_('抢人头'), aug: null, holder: null },
  collective: { glyph: 'chain', tone: 'blood', label: N_('连坐'), aug: null, holder: 'to' },
  redpacket: { glyph: 'packet', tone: 'packet', label: N_('红包'), aug: null, holder: 'from' },
  cheer: { glyph: 'flag', tone: 'cheer', label: N_('加油'), aug: AUG_CHEER, holder: 'from' },
  baton: { glyph: 'baton', tone: 'gold', label: N_('接力棒'), aug: null, holder: null, everyone: true },
  sell: { glyph: 'tag', tone: 'sell', label: N_('卖队友'), aug: AUG_SELL, holder: 'to' },
  absorb: { glyph: 'orb', tone: 'purple', label: N_('吸星大法'), aug: null, holder: 'to' },
  pickpocket: { glyph: 'hand', tone: 'purple', label: N_('顺手牵羊'), aug: null, holder: 'to' },
  snipe: { glyph: 'target', tone: 'red', label: N_('截胡'), aug: null, holder: 'to' },
  extort: { glyph: 'bill', tone: 'paper', label: N_('碰瓷'), aug: null, holder: 'to' },
  protection: { glyph: 'coin', tone: 'gold', label: N_('收保护费'), aug: null, holder: 'to' },
  lifeswap: { glyph: 'swap', tone: 'blood', label: N_('偷命'), aug: null, holder: 'to' },
  possess: { glyph: 'ghost', tone: 'purple', label: N_('夺舍'), aug: null, holder: 'to' },
  mole: { glyph: 'hat', tone: 'dark', label: N_('内鬼'), aug: null, holder: 'from' },
  credit: { glyph: 'coin', tone: 'gold', label: N_('抢功'), aug: null, holder: 'to' },
  // 海克斯第六版 batch g11 (the analysis 海克斯第六版-大扩充.md, I: coins, cards, a 海克斯's icon, a layer orb, the
  // captain's crown and 搭便车's thin line). `holder` null where the 海克斯's holder sits on either side of its events (or a
  // stale m.public at the pick could turn the event round: 篡位's crown, 借来用用's icon).
  freeride: { glyph: 'hand', tone: 'ride', label: N_('搭便车'), aug: 'aug_freeride', holder: 'to' },
  copycat: { glyph: 'card', tone: 'mint', label: N_('抄作业'), aug: 'aug_copycat', holder: 'to' },
  snatch: { glyph: 'card', tone: 'red', label: N_('抢购'), aug: 'aug_snatch', holder: 'to' },
  borrowKnife: { glyph: 'coin', tone: 'gold', label: N_('借刀杀人'), aug: 'aug_borrow_knife', holder: 'to' },
  borrow: { glyph: 'bolt', tone: 'purple', label: N_('借来用用'), aug: 'aug_borrow', holder: null },
  borrowBack: { glyph: 'bolt', tone: 'purple', label: N_('借来用用'), aug: 'aug_borrow', holder: null },
  doubleAgent: { glyph: 'target', tone: 'dark', label: N_('双面间谍'), aug: 'aug_double_agent', holder: null },
  cuckoo: { glyph: 'orb', tone: 'purple', label: N_('鸠占鹊巢'), aug: 'aug_cuckoo', holder: 'to' },
  contrarian: { glyph: 'coin', tone: 'gold', label: N_('唱反调'), aug: 'aug_contrarian', holder: null },
  kickback: { glyph: 'coin', tone: 'gold', label: N_('吃回扣'), aug: 'aug_kickback', holder: 'to' },
  titForTat: { glyph: 'coin', tone: 'gold', label: N_('以牙还牙'), aug: 'aug_tit_for_tat', holder: 'to' },
  equalize: { glyph: 'coin', tone: 'gold', label: N_('均贫富'), aug: 'aug_equalize', holder: null },
  splitBill: { glyph: 'coin', tone: 'gold', label: N_('公摊'), aug: 'aug_split_bill', holder: 'to' },
  usurp: { glyph: 'crown', tone: 'gold', label: N_('篡位'), aug: 'aug_usurp', holder: null },
  // 记仇的互动 (2026-10-11): a 损人利己 take settled one of the taker's grudges (from → to), two players' 血仇 (once a pair)
  revenge: { glyph: 'anger', tone: 'red', label: N_('报复'), aug: null, holder: null },
  feud: { glyph: 'anger', tone: 'blood', label: N_('血仇'), aug: null, holder: null },
  // 还手 (2026-10-11): 讨债 from=the debtor to=the avenger amount=funds · 使绊子 from=the avenger to=the tripped amount=% ·
  // 不兜底 from=the helper to=the leaker amount=% (the 联防's start)
  debt: { glyph: 'bill', tone: 'red', label: N_('讨债'), aug: null, holder: null },
  trip: { glyph: 'anger', tone: 'red', label: N_('使绊子'), aug: null, holder: null },
  noCover: { glyph: 'shield', tone: 'dark', label: N_('不兜底'), aug: null, holder: null },
});
/** Every kind the panel draws (an unknown one is kept and ignored). */
export const TEAM_FX_KINDS = Object.freeze(Object.keys(KIND_FX));

// ---- players -----------------------------------------------------------------------------------------------------------

const playersOf = (pub) => (Array.isArray(pub?.players) ? pub.players.filter(isObj) : []);
const playerOf = (pub, pid) => (pid ? playersOf(pub).find((p) => p.playerId === pid) || null : null);
const alivePids = (pub) => playersOf(pub).filter((p) => p.alive !== false).map((p) => p.playerId);
/** Whether m.public says `pid` holds the 海克斯 `aug`. */
export const holdsAugment = (pub, pid, aug) => !!aug && Array.isArray(playerOf(pub, pid)?.augments) && playerOf(pub, pid).augments.includes(aug);
const nameOf = (pub, pid) => (pid ? playerOf(pub, pid)?.name || t('博士') : '');
const chessName = (id) => (id ? data.lookup('chess', id)?.name || '' : '');
const chessImg = (id) => (id ? chessAvatarUrl(data.get('assets'), data.lookup('chess', id)) : null);
const itemImg = (id) => (id ? itemIconUrl(data.get('assets'), data.lookup('items', id)) : null);

// ---- the message -------------------------------------------------------------------------------------------------------

/**
 * A received m.teamFx made safe (null when it has no kind): ids are short strings or null, `also` an array of ids,
 * `amount` a finite number or null.
 * @param {any} msg
 * @returns {null | { kind: string, round: number|null, from: string|null, to: string|null, also: string[], amount: number|null,
 *   item: string|null, chess: string|null, augment: string|null }}
 */
export function sanitizeTeamFx(msg) {
  if (!isObj(msg) || typeof msg.kind !== 'string' || !msg.kind) return null;
  const also = Array.isArray(msg.also) ? [...new Set(msg.also.map(pidOf).filter(Boolean))].slice(0, 8) : [];
  return {
    kind: msg.kind.slice(0, 24),
    round: Number.isFinite(msg.round) ? Math.trunc(msg.round) : null,
    from: pidOf(msg.from),
    to: pidOf(msg.to),
    also,
    amount: typeof msg.amount === 'number' && Number.isFinite(msg.amount) ? msg.amount : null,
    item: strOf(msg.item),
    chess: strOf(msg.chess),
    augment: strOf(msg.augment, 32),
  };
}

/**
 * The event in this panel's reading: when m.public shows the 海克斯's holder (`augment`, else KIND_FX[kind].aug) on the
 * side opposite to KIND_FX[kind].holder — and not on both — `from` and `to` are swapped (a sender that names the actor
 * first draws the same). Anything undecidable stays as sent.
 * @param {ReturnType<typeof sanitizeTeamFx>} ev @param {any} pub m.public
 */
export function orientTeamFx(ev, pub) {
  const spec = ev ? KIND_FX[ev.kind] : null;
  if (!spec || !spec.holder || !ev.from || !ev.to || ev.from === ev.to) return ev;
  const aug = ev.augment || spec.aug;
  const other = spec.holder === 'to' ? 'from' : 'to';
  if (holdsAugment(pub, ev[other], aug) && !holdsAugment(pub, ev[spec.holder], aug)) return { ...ev, from: ev.to, to: ev.from };
  return ev;
}

// ---- what lasts: the match's state of the team effects -----------------------------------------------------------------

/**
 * The lasting part of the team effects in a match: `bombs` the holders of the bombs going round (one entry per bomb,
 * with the round it reached them: a bomb whose lighter left stops being drawn at the next round), `baton` its holder,
 * `bonds` 同生共死's pairs, `vamp` 吸血鬼's sips per vampire, `marks` the marks of a round (pot, cheer, lead, packet, mole,
 * sus, cover, watch, swap, lifeswap, together; agent — 双面间谍's bet), `bets` 打赌's pairs, `legacy` who left an
 * inheritance, `senders` who has sent a 红包 (the banner is for the first), `round` the latest round seen; 海克斯第六版:
 * `rides` 搭便车's pairs [rider, the teammate it rides with], `captain` 篡位's captain, `loans` 借来用用's 海克斯 on loan
 * { from, to, aug }.
 */
export function emptyFxState() {
  return { round: null, bombs: [], baton: null, bonds: [], vamp: {}, marks: [], bets: [], legacy: [], senders: [], rides: [], captain: null, loans: [] };
}
const isFxState = (s) => isObj(s) && Array.isArray(s.bombs) && Array.isArray(s.marks) && Array.isArray(s.bonds);

/**
 * Fold one (oriented) event into the state; returns a new state (the input is never changed).
 * @param {any} state @param {ReturnType<typeof sanitizeTeamFx>} ev
 */
export function reduceTeamFx(state, ev) {
  const s = isFxState(state) ? state : emptyFxState();
  if (!ev || !KIND_FX[ev.kind]) return s;
  const r = Number.isFinite(ev.round) ? ev.round : s.round ?? 0;
  const top = Math.max(s.round ?? r, r);
  const n = { ...s, round: top, marks: s.marks.filter((m) => m.round >= top - 1), bets: s.bets.filter((b) => b.round >= top - 1) };
  const subj = ev.to ?? ev.from;
  const mark = (name, pid, extra = {}) => {
    if (!pid) return;
    n.marks = [...n.marks.filter((m) => !(m.mark === name && m.pid === pid && m.round === r)), { mark: name, pid, round: r, ...extra }];
  };
  const bump = (name, pid, by) => {
    const old = n.marks.find((m) => m.mark === name && m.pid === pid && m.round === r);
    mark(name, pid, { n: (old?.n ?? 0) + by });
  };
  const pair = (a, b) => (list) => list.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  switch (ev.kind) {
    case 'bomb': {
      const bombs = [...s.bombs];
      const at = ev.from && ev.from !== ev.to ? bombs.findIndex((b) => b.pid === ev.from) : -1;
      if (at >= 0) bombs.splice(at, 1);
      if (ev.to && !(ev.from === ev.to && bombs.some((b) => b.pid === ev.to && b.round === r))) bombs.push({ pid: ev.to, round: r });
      n.bombs = bombs.slice(-4);
      break;
    }
    case 'bombDefuse': case 'bombBoom':
      // a reloaded page learns where a bomb is from its settlement
      if (subj && !s.bombs.some((b) => b.pid === subj)) n.bombs = [...s.bombs, { pid: subj, round: r }].slice(-4);
      break;
    case 'baton': n.baton = ev.to ? { pid: ev.to, round: r } : null; break;
    case 'bound': case 'boundAvg':
      if (ev.from && ev.to && ev.from !== ev.to && !pair(ev.from, ev.to)(s.bonds)) n.bonds = [...s.bonds, [ev.from, ev.to]].slice(-4);
      break;
    case 'vampire': if (ev.to) n.vamp = { ...s.vamp, [ev.to]: (s.vamp[ev.to] ?? 0) + 1 }; break;
    case 'blame': mark('pot', ev.to, { by: ev.from }); break;
    case 'cheer': if (ev.amount == null) mark('cheer', ev.to, { by: ev.from }); break;
    case 'lead':
      n.marks = n.marks.filter((m) => !(m.mark === 'lead' && m.round === r));
      mark('lead', ev.to);
      break;
    case 'redpacket':
      if (ev.to) n.marks = [...n.marks, { mark: 'packet', pid: ev.to, round: r, by: ev.from, n: ev.amount ?? 0 }];
      if (ev.from && !s.senders.includes(ev.from)) n.senders = [...s.senders, ev.from].slice(-8);
      break;
    case 'mole': {
      const mole = ev.from ?? ev.to;
      mark('mole', mole);
      for (const pid of [ev.to, ...ev.also]) if (pid && pid !== mole) mark('sus', pid, { by: mole });
      break;
    }
    case 'cover': bump('cover', subj, Math.max(0, ev.amount ?? 0)); break;
    case 'watch': bump('watch', subj, Math.max(1, ev.amount ?? 1)); break;
    case 'swap': case 'lifeswap':
      mark(ev.kind, ev.from, { by: ev.to });
      mark(ev.kind, ev.to, { by: ev.from });
      break;
    case 'together': for (const pid of new Set([ev.from, ev.to, ...ev.also])) mark('together', pid, { n: ev.amount }); break;
    case 'bet':
      if (ev.amount == null && ev.from && ev.to && ev.from !== ev.to) n.bets = [...n.bets.filter((b) => !(b.round === r && pair(ev.from, ev.to)([[b.a, b.b]]))), { a: ev.from, b: ev.to, round: r }];
      break;
    case 'legacy': if (ev.from && !s.legacy.includes(ev.from)) n.legacy = [...s.legacy, ev.from]; break;
    // 海克斯第六版 (batch g11): the lasting ones
    case 'freeride': {
      const rides = Array.isArray(s.rides) ? s.rides : [];
      if (ev.amount == null && ev.from && ev.to && ev.from !== ev.to && !rides.some(([a, b]) => a === ev.to && b === ev.from)) n.rides = [...rides, [ev.to, ev.from]].slice(-4);
      break;
    }
    case 'usurp': if (ev.amount == null && ev.to) n.captain = ev.to; break;
    case 'borrow': {
      const loans = (Array.isArray(s.loans) ? s.loans : []).filter((l) => !(l.to === ev.to && l.aug === ev.augment));
      if (ev.from && ev.to && ev.augment) n.loans = [...loans, { from: ev.from, to: ev.to, aug: ev.augment, round: r }].slice(-4);
      break;
    }
    case 'borrowBack': n.loans = (Array.isArray(s.loans) ? s.loans : []).filter((l) => !(l.aug === ev.augment && l.to === ev.from)); break;
    case 'doubleAgent': if (ev.amount == null) mark('agent', ev.to, { by: ev.from }); break;
    default: break;
  }
  return n;
}

/**
 * store.teamFx after one more event (main.js m.teamFx): the event oriented (orientTeamFx; an event without its round
 * takes m.public's), stamped and kept (the last TEAMFX_KEEP), the state folded. The first 红包 of a sender is flagged
 * `first` (its banner).
 * @param {{ list?: any[], state?: any } | null} slice store.teamFx
 * @param {ReturnType<typeof sanitizeTeamFx>} ev @param {any} pub m.public @param {{ seq: number, at: number }} stamp
 */
export function pushTeamFx(slice, ev, pub, { seq, at }) {
  const prev = isObj(slice) ? slice : {};
  const list = Array.isArray(prev.list) ? prev.list : [];
  const state = isFxState(prev.state) ? prev.state : emptyFxState();
  if (!ev) return { list, state };
  let e = orientTeamFx(ev.round == null && Number.isFinite(pub?.round) ? { ...ev, round: pub.round } : ev, pub);
  if (e.kind === 'redpacket' && e.from && !state.senders.includes(e.from)) e = { ...e, first: true };
  if (e.kind === 'lead') {
    // 抢人头: from = the last leader (null the first time), to = the new one — the server batch names the new leader
    // first (`from`, the other player of the field in `to`): the leader this round so far tells the two apart
    const prev = state.marks.find((m) => m.mark === 'lead' && m.round === e.round)?.pid ?? null;
    const lead = prev && e.from === prev ? e.to : e.from ?? e.to;
    e = { ...e, from: prev && prev !== lead ? prev : null, to: lead };
  }
  return { list: [...list.slice(-(TEAMFX_KEEP - 1)), { ...e, seq, at }], state: reduceTeamFx(state, e) };
}

// ---- who sees what -------------------------------------------------------------------------------------------------------

/** Whether an event concerns the player (「和我有关」): `from`, `to`, in `also`, or a thing that reaches everyone. */
export function fxConcerns(ev, myId) {
  if (!ev || !myId) return false;
  if (ev.from === myId || ev.to === myId) return true;
  if (Array.isArray(ev.also) && ev.also.includes(myId)) return true;
  return !!KIND_FX[ev.kind]?.everyone;
}

/**
 * Whether the moving part of an event (flights, pops, numbers, short lines, banner, sound) plays for this viewer.
 * @param {any} ev @param {string} mode the setting 'all' | 'mine' | 'off'
 * @param {{ myId?: string|null, watcher?: boolean }} [o] watcher: a spectator or an eliminated player (sees all in 'mine')
 */
export function fxVisible(ev, mode, { myId = null, watcher = false } = {}) {
  const m = teamFxMode(mode);
  if (m === 'off' || !ev || !KIND_FX[ev.kind]) return false;
  if (m === 'all' || watcher) return true;
  return fxConcerns(ev, myId);
}

/** A spectator seat or an eliminated player: nothing can concern them any more. */
export function isWatcher(pub, myId) {
  const me = playerOf(pub, myId);
  return !me || me.alive === false;
}

// ---- the moving part of an event ------------------------------------------------------------------------------------------

const amt = (ev, d) => (Number.isFinite(ev.amount) && ev.amount > 0 ? ev.amount : d);
const param = (ev, key, d) => {
  const v = augmentDef(ev.augment || KIND_FX[ev.kind]?.aug)?.params?.[key];
  return Number.isFinite(v) ? v : d;
};
const fly = (from, to, glyph, tone, ms, o = {}) => ({ type: 'fly', from, to, glyph, tone, ms, delay: o.delay ?? 0, arc: !!o.arc, img: o.img ?? null, origin: o.origin ?? null });
const num = (pid, value, unit, o = {}) => ({ type: 'num', pid, value, unit, tone: o.tone ?? null, delay: o.delay ?? 0, ms: 1300 });
const tag = (pid, text, tone, o = {}) => ({ type: 'num', pid, text, unit: 'text', tone, delay: o.delay ?? 0, ms: 1300 });
const pop = (pid, glyph, tone, o = {}) => ({ type: 'pop', pid, glyph, tone, style: o.style ?? 'icon', text: o.text ?? null, delay: o.delay ?? 0, ms: o.ms ?? 900 });
const line = (a, b, style, ms = 1000, delay = 0) => ({ type: 'line', a, b, style, ms, delay });
const shift = (a, b, part, ms) => ({ type: 'shift', a, b, part, ms, delay: 0 });
const banner = (title, tone, glyph, pair = null) => ({ type: 'banner', title, tone, glyph, pair });
const sfx = (name, o = {}) => ({ type: 'sfx', name, battle: !!o.battle, volume: o.volume ?? 0.5, delay: o.delay ?? 0 });

/**
 * What one event shows (§3.3 / §3.4): a list of
 *   { type: 'fly', from, to, glyph, tone, ms, delay, arc, img, origin }   an icon flying between two avatars
 *   { type: 'num', pid, value, unit: 'lp'|'funds'|'layers', tone } / { type: 'num', pid, text, unit: 'text' }   beside the LP
 *   { type: 'pop', pid, glyph, tone, style: 'icon'|'flash'|'text'|'tag'|'packet', text, ms }   on an avatar
 *   { type: 'line', a, b, style, ms }   a short line between two rows      { type: 'shift', a, b, part: 'btn'|'lp', ms }
 *   { type: 'banner', title, tone, glyph, pair }      { type: 'sfx', name, battle, volume }
 * (`delay` ms after the event). Texts are in the current language.
 * @param {any} ev an oriented event @param {{ pub?: any, myId?: string|null }} [ctx]
 */
export function planTeamFx(ev, { pub = null, myId = null } = {}) {
  if (!ev || !KIND_FX[ev.kind]) return [];
  const name = (pid) => nameOf(pub, pid);
  const subj = ev.to ?? ev.from;
  const also = Array.isArray(ev.also) ? ev.also : [];
  const move = (glyph, tone, ms, o) => (ev.from && ev.to && ev.from !== ev.to ? [fly(ev.from, ev.to, glyph, tone, ms, o)] : []);
  switch (ev.kind) {
    case 'vampire': {
      const n = amt(ev, 1);
      return [...move('drop', 'blood', 600), num(ev.from, -n, 'lp'), num(ev.to, n, 'lp', { delay: 600 }), sfx('pick', { volume: 0.4 })];
    }
    case 'sacrifice': {
      const n = amt(ev, param(ev, 'lp', 3));
      const mates = (also.length ? also : alivePids(pub)).filter((p) => p !== subj);
      return [pop(subj, 'heart', 'blood', { style: 'flash', ms: 700 }), num(subj, -n, 'lp'), ...mates.map((p) => line(subj, p, 'blood', 1000, 250)),
        sfx('danger', { volume: 0.35 })];
    }
    case 'bound':
      return [line(ev.from, ev.to, 'chain', 900), pop(ev.from, 'chain', 'chain'), pop(ev.to, 'chain', 'chain'),
        banner(t('{a} 和 {b} 绑在了一起', { a: name(ev.from), b: name(ev.to) }), 'chain', 'chain', [ev.from, ev.to]), sfx('equip')];
    case 'boundAvg': {
      const eq = Number.isFinite(ev.amount) ? `= ${ev.amount}` : null;
      return [...[ev.from, ev.to].filter(Boolean).flatMap((p) => [pop(p, 'chain', 'chain', { style: 'flash', ms: 700 }), ...(eq ? [tag(p, eq, 'chain')] : [])]),
        sfx('equip', { volume: 0.4 })];
    }
    case 'rob': {
      const n = amt(ev, param(ev, 'funds', 3));
      return [...move('bag', 'gold', 600), num(ev.from, -n, 'funds'), num(ev.to, n, 'funds', { delay: 600 }),
        pop(ev.from, 'anger', 'angry', { style: 'text', ms: 1400 }), sfx('income')];
    }
    case 'blame': {
      const n = amt(ev, 1);
      return [...move('pot', 'pot', 600), num(ev.to, -n, 'lp', { tone: 'pot', delay: 600 }), sfx('drop', { delay: 600 })];
    }
    case 'bomb':
      return [...(ev.from && ev.to && ev.from !== ev.to ? [fly(ev.from, ev.to, 'bomb', 'bomb', 500, { arc: true })] : [pop(subj, 'bomb', 'bomb', { ms: 800 })]), sfx('timer')];
    case 'bombDefuse': {
      const n = amt(ev, param(ev, 'funds', 3));
      return [pop(subj, 'check', 'mint', { ms: 1000 }), num(subj, n, 'funds', { delay: 200 }), sfx('income')];
    }
    case 'bombBoom': {
      const n = amt(ev, param(ev, 'lp', 2));
      return [pop(subj, 'smoke', 'smoke', { ms: 1000 }), num(subj, -n, 'lp'), banner(t('炸弹在 {name} 手里炸了', { name: name(subj) }), 'red', 'bomb'),
        sfx('leak', { battle: true, volume: 0.6 })];
    }
    case 'speaker':
      return [pop(subj, 'crown', 'gold', { ms: 1000 }), banner(t('{name} 拍板了', { name: name(subj) }), 'gold', 'crown'), sfx('confirm', { volume: 0.4 })];
    case 'legacy': {
      const heirs = (also.length ? also : ev.to ? [ev.to] : alivePids(pub)).filter((p) => p !== ev.from);
      const n = amt(ev, 0);
      const img = chessImg(ev.chess);
      return [...heirs.flatMap((p) => [fly(ev.from, p, 'coin', 'gold', 700), ...(ev.chess ? [fly(ev.from, p, 'card', 'gold', 700, { delay: 160, img })] : []),
        ...(n > 0 ? [num(p, n, 'funds', { delay: 700 })] : [])]),
      banner(t('{name} 留下了遗产', { name: name(ev.from) }), 'gold', 'card'), sfx('merge')];
    }
    case 'mutual': {
      const n = amt(ev, param(ev, 'funds', 2));
      return [fly(null, subj, 'coin', 'gold', 600, { origin: 'team' }), num(subj, n, 'funds', { delay: 600 }), sfx('income', { volume: 0.4 })];
    }
    case 'watch': {
      const n = amt(ev, 1);
      return [pop(subj, 'coin', 'gold', { ms: 700 }), num(subj, n, 'funds'), sfx('income', { volume: 0.3 })];
    }
    case 'sync': return [pop(subj, 'bolt', 'sp', { style: 'flash', ms: 800 })];
    case 'together': return [...new Set([ev.from, ev.to, ...also].filter(Boolean))].map((p) => pop(p, 'star', 'mint', { style: 'flash', ms: 800 }));
    case 'swap':
      return [shift(ev.from, ev.to, 'btn', 600), pop(ev.from, 'swap', 'swap', { delay: 600 }), pop(ev.to, 'swap', 'swap', { delay: 600 }),
        banner(t('{a} 和 {b} 交换了人生', { a: name(ev.from), b: name(ev.to) }), 'swap', 'swap', [ev.from, ev.to]), sfx('merge')];
    case 'teamPerfect': {
      const all = also.length ? also : alivePids(pub);
      const n = amt(ev, 1);
      return [...all.map((p) => pop(p, 'star', 'gold', { ms: 700 })), ...all.map((p) => num(p, n, 'funds', { delay: 200 })),
        banner(t('完美配合'), 'mint', 'star'), sfx('ready')];
    }
    case 'bet':
      if (ev.amount == null) return [ev.from, ev.to].filter(Boolean).map((p) => pop(p, null, 'gold', { style: 'text', text: 'VS', ms: 900 }));
      if (ev.amount === 0) return [ev.from, ev.to].filter(Boolean).map((p) => tag(p, t('平'), 'gold'));
      return [...move('coin', 'gold', 500), num(ev.from, -ev.amount, 'funds'), num(ev.to, ev.amount, 'funds', { delay: 500 }), sfx('income')];
    case 'cover': {
      const n = amt(ev, 0);
      return [pop(subj, 'shield', 'blue', { ms: 800 }), ...(n > 0 ? [num(subj, n, 'funds')] : []), sfx('income', { volume: 0.3 })];
    }
    case 'lead':
      return ev.from && ev.to && ev.from !== ev.to ? [fly(ev.from, ev.to, 'crown', 'gold', 400, { arc: true })] : [pop(subj, 'crown', 'gold', { ms: 800 })];
    case 'collective': {
      const n = amt(ev, 1);
      return [line(ev.from, ev.to, 'chain', 1000), num(ev.to, -n, 'lp', { delay: 250 }), sfx('equip', { volume: 0.4 })];
    }
    case 'redpacket': {
      const n = amt(ev, 0);
      return [...move('packet', 'packet', 600), pop(ev.to, 'packet', 'packet', { style: 'packet', text: n > 0 ? String(n) : null, delay: 600, ms: 1000 }),
        ...(n > 0 ? [num(ev.to, n, 'funds', { delay: 700 })] : []),
        ...(ev.first ? [banner(t('{name} 发红包了', { name: name(ev.from) }), 'red', 'packet')] : []), sfx('income', { delay: 600 })];
    }
    case 'cheer':
      if (ev.amount == null) return [...move('flag', 'cheer', 500), pop(ev.to, 'flag', 'cheer', { delay: 500, ms: 800 }), sfx('ready', { volume: 0.5 })];
      return [...[ev.from, ev.to].filter(Boolean).flatMap((p) => [pop(p, 'coin', 'gold', { ms: 700 }), num(p, amt(ev, 1), 'funds')]), sfx('income')];
    case 'baton': {
      // a perfect holder gets the funds and passes it on — or keeps it when there is nobody to pass to (from = null)
      const n = amt(ev, 0);
      const moves = !!(ev.from && ev.to && ev.from !== ev.to);
      return [...(moves ? [fly(ev.from, ev.to, 'baton', 'gold', 500, { arc: true })] : [pop(subj, 'baton', 'gold', { ms: 800 })]),
        ...(n > 0 ? [num(moves ? ev.from : subj, n, 'funds')] : []), sfx('timer')];
    }
    case 'sell': {
      const n = amt(ev, 2);
      const lp = param(ev, 'lp', 1);
      return [pop(ev.from, 'tag', 'sell', { style: 'tag', text: t('已售出 ¥{n}', { n }), ms: 1100 }), num(ev.from, -lp, 'lp'),
        ...move('coin', 'gold', 500, { delay: 400 }), num(ev.to, n, 'funds', { delay: 900 }),
        ...(ev.from && ev.from === myId ? [banner(t('你被 {name} 卖了', { name: name(ev.to) }), 'red', 'tag')] : []), sfx('income', { delay: 400 })];
    }
    case 'absorb': {
      const n = amt(ev, 5);
      return [...move('orb', 'purple', 600), num(ev.from, -n, 'layers'), num(ev.to, n, 'layers', { delay: 600 }), sfx('pick', { volume: 0.4 })];
    }
    case 'pickpocket': {
      if (ev.item) return [pop(ev.from, 'hand', 'purple', { ms: 900 }), ...move('item', 'gold', 600, { img: itemImg(ev.item) }), sfx('pick', { volume: 0.45 })];
      const n = amt(ev, 1);
      return [pop(ev.from, 'hand', 'purple', { ms: 900 }), ...move('coin', 'gold', 600), num(ev.from, -n, 'funds'), num(ev.to, n, 'funds', { delay: 600 }), sfx('income')];
    }
    case 'snipe':
      return [...move('card', 'mint', 600, { img: chessImg(ev.chess) }),
        ...(ev.from && ev.from === myId ? [banner(t('{chess} 被 {name} 截胡了', { chess: chessName(ev.chess) || t('干员'), name: name(ev.to) }), 'red', 'target')] : []),
        sfx('merge')];
    case 'extort': case 'protection': case 'credit': {
      const n = amt(ev, 1);
      const payers = ev.from ? [ev.from] : also.filter((p) => p !== ev.to);
      const glyph = ev.kind === 'extort' ? 'bill' : 'coin';
      const ms = ev.kind === 'credit' ? 500 : 600;
      return [...payers.flatMap((p) => [...(ev.to && p !== ev.to ? [fly(p, ev.to, glyph, ev.kind === 'extort' ? 'paper' : 'gold', ms)] : []),
        ...(ev.kind === 'credit' ? [] : [num(p, -n, 'funds')])]),
      ...(ev.to ? [num(ev.to, n * Math.max(1, ev.kind === 'credit' ? 1 : payers.length), 'funds', { delay: ms })] : []), sfx('income', { delay: ms })];
    }
    case 'lifeswap': {
      // from = the teammate with the most LP, to = the holder; amount = the LP that changed hands
      const n = amt(ev, 0);
      return [shift(ev.from, ev.to, 'lp', 800), pop(ev.from, 'swap', 'blood', { delay: 800 }), pop(ev.to, 'swap', 'blood', { delay: 800 }),
        ...(n > 0 ? [num(ev.from, -n, 'lp', { delay: 800 }), num(ev.to, n, 'lp', { delay: 800 })] : []),
        banner(t('{a} 和 {b} 换了命', { a: name(ev.to), b: name(ev.from) }), 'red', 'swap', [ev.to, ev.from]), sfx('merge')];
    }
    case 'possess':
      return [...move('card', 'purple', 700, { img: chessImg(ev.chess) }), pop(ev.from, 'card', 'mint', { delay: 700, ms: 800 }),
        banner(t('{a} 夺舍了 {b} 的 {chess}', { a: name(ev.to), b: name(ev.from), chess: chessName(ev.chess) || t('干员') }), 'purple', 'ghost', [ev.to, ev.from]),
        sfx('merge')];
    case 'mole': {
      // from = the 内鬼, to (and also) = the teammates of its field
      const mole = ev.from ?? ev.to;
      return [pop(mole, 'hat', 'dark', { ms: 900 }),
        ...[...new Set([ev.to, ...also])].filter((p) => p && p !== mole).map((p) => pop(p, null, 'dark', { style: 'text', text: '?', ms: 900 }))];
    }
    // ---- 海克斯第六版 (batch g11)
    case 'freeride': {
      // the bond (amount null): a thin line, kept by linksFor; a merge of the bound teammate: a coin to the rider
      if (ev.amount == null) return [line(ev.from, ev.to, 'ride', 1000), pop(ev.to, 'hand', 'ride', { ms: 900 }), sfx('equip', { volume: 0.4 })];
      const n = amt(ev, param(ev, 'funds', 1));
      return [...move('coin', 'gold', 500), num(ev.to, n, 'funds', { delay: 500 }), sfx('income', { delay: 500, volume: 0.4 })];
    }
    case 'copycat':
      return [...move('card', 'mint', 600, { img: chessImg(ev.chess) }), sfx('merge', { volume: 0.4 })];
    case 'snatch':
      return [...move('card', 'red', 600, { img: chessImg(ev.chess) }),
        ...(ev.from && ev.from === myId ? [banner(t('{chess}被 {name} 抢走了', { chess: chessName(ev.chess) || t('干员'), name: name(ev.to) }), 'red', 'card')] : []),
        sfx('merge')];
    case 'borrowKnife': case 'kickback': {
      // the funds come out of nowhere (the teammate loses nothing): the coin flies from the one it was made on
      const n = amt(ev, 1);
      return [...move('coin', 'gold', 500), num(ev.to, n, 'funds', { delay: 500 }), sfx('income', { delay: 500, volume: 0.4 })];
    }
    case 'borrow': case 'borrowBack': {
      const def = augmentDef(ev.augment);
      const img = effectIconUrl(data.get('assets'), { iconKind: 'augment' });
      return [...move('bolt', 'purple', 600, { arc: true, img }), ...(def ? [tag(ev.to, t(def.name), 'purple', { delay: 600 })] : []), sfx('pick', { volume: 0.45 })];
    }
    case 'doubleAgent': {
      if (ev.amount == null) return [pop(ev.to, 'target', 'dark', { ms: 900 })];
      const n = amt(ev, 1);
      return [...move('coin', 'gold', 500), num(ev.to, n, 'funds', { delay: 500 }), sfx('income', { delay: 500, volume: 0.4 })];
    }
    case 'cuckoo': {
      const n = amt(ev, 0);
      return [...move('orb', 'purple', 700), ...(n > 0 ? [num(ev.from, -n, 'layers'), num(ev.to, n, 'layers', { delay: 700 })] : []),
        banner(t('{name} 鸠占鹊巢', { name: name(ev.to) }), 'purple', 'orb', [ev.to, ev.from]), sfx('pick', { volume: 0.45 })];
    }
    case 'contrarian': {
      const n = amt(ev, param(ev, 'funds', 2));
      return [pop(subj, 'coin', 'gold', { ms: 800 }), num(subj, n, 'funds'), sfx('income', { volume: 0.4 })];
    }
    case 'titForTat': case 'equalize': case 'splitBill': {
      const n = amt(ev, 1);
      return [...(ev.kind === 'titForTat' ? [pop(ev.to, 'anger', 'angry', { style: 'text', ms: 1000 })] : []), ...move('coin', 'gold', 500),
        num(ev.from, -n, 'funds'), num(ev.to, n, 'funds', { delay: 500 }), sfx('income', { delay: 500 })];
    }
    case 'usurp': {
      if (ev.amount == null) {
        return [...(ev.from && ev.to && ev.from !== ev.to ? [fly(ev.from, ev.to, 'crown', 'gold', 600, { arc: true })] : [pop(subj, 'crown', 'gold', { ms: 1000 })]),
          banner(t('{name} 篡位成了队长', { name: name(subj) }), 'gold', 'crown'), sfx('confirm', { volume: 0.5 })];
      }
      const n = amt(ev, param(ev, 'funds', 1));
      return [...move('coin', 'gold', 500), num(ev.from, -n, 'funds'), num(ev.to, n, 'funds', { delay: 500 }), sfx('income', { delay: 500, volume: 0.4 })];
    }
    case 'revenge':
      return [line(ev.from, ev.to, 'blood', 800), pop(ev.from, 'anger', 'angry', { style: 'text', ms: 1200 }), tag(ev.from, t('报复'), 'red', { delay: 200 })];
    case 'feud':
      return [line(ev.from, ev.to, 'blood', 1400), pop(ev.from, 'anger', 'angry', { style: 'text', ms: 1400 }), pop(ev.to, 'anger', 'angry', { style: 'text', ms: 1400 }),
        banner(t('{a} 和 {b} 结下了血仇', { a: name(ev.from), b: name(ev.to) }), 'red', 'anger', [ev.from, ev.to]), sfx('danger', { volume: 0.4 })];
    case 'debt': {
      const n = amt(ev, 2);
      return [...move('bill', 'red', 600), num(ev.from, -n, 'funds'), num(ev.to, n, 'funds', { delay: 600 }),
        pop(ev.to, 'anger', 'angry', { style: 'text', ms: 1200 }), tag(ev.to, t('讨债'), 'red', { delay: 200 }), sfx('income', { delay: 600, volume: 0.4 })];
    }
    case 'trip':
      return [line(ev.from, ev.to, 'blood', 900), pop(ev.from, 'anger', 'angry', { style: 'text', ms: 1200 }),
        tag(ev.to, t('伤害 −{pct}%', { pct: amt(ev, 15) }), 'red', { delay: 300 }), sfx('danger', { volume: 0.3 })];
    case 'noCover':
      return [line(ev.from, ev.to, 'blood', 1000), pop(ev.from, 'shield', 'dark', { ms: 1000 }), tag(ev.from, t('不兜底'), 'red', { delay: 200 })];
    default: return [];
  }
}

// ---- badges and links: what lasts, as drawn ------------------------------------------------------------------------------

const togetherMult = () => (augmentDef('aug_together')?.params?.pct ?? 145) / 100;

/** The ×N of 并肩作战 on a row's frame in a boss round (its event, else m.public: a field mate holds it), or null. */
export function frameTagFor(pid, state, pub) {
  const s = isFxState(state) ? state : null;
  const round = Number.isFinite(pub?.round) ? pub.round : null;
  const m = s?.marks.find((x) => x.mark === 'together' && x.pid === pid && (round == null || x.round === round));
  let mult = m ? (Number.isFinite(m.n) && m.n > 0 ? m.n : togetherMult()) : null;
  if (mult == null && (pub?.phase === PHASE.FINAL_ASSAULT || pub?.phase === PHASE.HIDDEN_CORE)) {
    const f = (Array.isArray(pub.fields) ? pub.fields : []).find((x) => Array.isArray(x?.players) && x.players.includes(pid));
    if (f && f.players.length > 1 && f.players.some((q) => holdsAugment(pub, q, 'aug_together'))) mult = togetherMult();
  }
  return mult == null ? null : `×${Math.round(mult * 100) / 100}`;
}

/** Whether `pid` got the best 红包 of a sender this round (ties: the first). */
function luckiest(pid, s, round) {
  const packets = s.marks.filter((m) => m.mark === 'packet' && (round == null || m.round === round));
  for (const by of new Set(packets.map((m) => m.by))) {
    let best = null;
    for (const m of packets) if (m.by === by && (!best || m.n > best.n)) best = m;
    if (best && best.pid === pid) return true;
  }
  return false;
}

/**
 * The badges on a row's avatar, most important first: { key, glyph?, text?, tone, n?, tip }. What a player holds now
 * (bombs, the baton, a crown — 抢人头's lead, 红包's luckiest, 话事人 in a vote —, 甩锅's pot, 加油's flag, the 内鬼 hat or
 * the 「?」 beside it), then the bonds (同生共死's chain), this round's counts (我来兜底, 守望相助), 灵魂交换 / 偷命's arrows
 * and 吸血鬼's fangs with the sips seen. None for an eliminated player.
 * @param {string} pid @param {any} state store.teamFx.state @param {{ pub?: any, myId?: string|null }} [o]
 */
export function badgesFor(pid, state, { pub = null, myId = null } = {}) {
  if (!pid || playerOf(pub, pid)?.alive === false) return [];
  const s = isFxState(state) ? state : emptyFxState();
  const round = Number.isFinite(pub?.round) ? pub.round : null;
  const cur = (x) => round == null || x.round === round;
  const name = (id) => nameOf(pub, id);
  const marks = s.marks.filter((m) => m.pid === pid && cur(m));
  const markOf = (k) => marks.find((m) => m.mark === k) || null;
  const out = [];
  const bombs = s.bombs.filter((b) => b.pid === pid && cur(b)).length;
  if (bombs) out.push({ key: 'bomb', glyph: 'bomb', tone: 'bomb', n: bombs > 1 ? bombs : null, tip: t('定时炸弹在 {name} 手里', { name: name(pid) }) });
  if (s.baton?.pid === pid) out.push({ key: 'baton', glyph: 'baton', tone: 'gold', tip: t('接力棒在 {name} 手里', { name: name(pid) }) });
  const crown = markOf('lead') ? t('抢人头：{name} 领先', { name: name(pid) })
    : luckiest(pid, s, round) ? t('红包：{name} 手气最佳', { name: name(pid) })
      : pub?.phase === PHASE.AUGMENT && pub?.aug?.vote && holdsAugment(pub, pid, 'aug_speaker') ? t('话事人：{name} 的一票算两票', { name: name(pid) }) : null;
  if (crown) out.push({ key: 'crown', glyph: 'crown', tone: 'gold', tip: crown });
  // 篡位's captain (its event; a reloaded page: the alive holder m.public shows)
  if (captainOf(s, pub) === pid) out.push({ key: 'captain', glyph: 'crown', tone: 'gold', tip: t('篡位：{name} 是队长', { name: name(pid) }) });
  const pot = markOf('pot');
  if (pot) out.push({ key: 'pot', glyph: 'pot', tone: 'pot', tip: t('{name} 接了 {by} 甩来的锅', { name: name(pid), by: name(pot.by) }) });
  const cheer = markOf('cheer');
  if (cheer) out.push({ key: 'cheer', glyph: 'flag', tone: 'cheer', tip: pid === myId ? t('{by} 给你加油', { by: name(cheer.by) }) : t('{by} 给 {name} 加油', { by: name(cheer.by), name: name(pid) }) });
  if (markOf('mole')) out.push({ key: 'mole', glyph: 'hat', tone: 'dark', tip: t('{name} 好像是内鬼', { name: name(pid) }) });
  if (markOf('sus')) out.push({ key: 'sus', text: '?', tone: 'dark', tip: t('和内鬼在同一战场') });
  const agent = markOf('agent');
  if (agent) out.push({ key: 'agent', glyph: 'target', tone: 'dark', tip: t('{by} 在 {name} 身上押了一注', { by: name(agent.by), name: name(pid) }) });
  for (const [a, b] of s.bonds) {
    if (a !== pid && b !== pid) continue;
    const other = a === pid ? b : a;
    if (playerOf(pub, other)?.alive === false) continue;
    out.push({ key: `chain:${other}`, glyph: 'chain', tone: 'chain', tip: t('同生共死：与 {name} 绑定', { name: name(other) }) });
  }
  for (const [rider, driver] of Array.isArray(s.rides) ? s.rides : []) {
    if (rider !== pid || playerOf(pub, driver)?.alive === false) continue;
    out.push({ key: `ride:${driver}`, glyph: 'hand', tone: 'ride', tip: t('搭便车：搭着 {name} 的便车', { name: name(driver) }) });
  }
  for (const l of Array.isArray(s.loans) ? s.loans : []) {
    const aug = augmentDef(l.aug);
    if (!aug) continue;
    if (l.to === pid) out.push({ key: `loan:${l.aug}`, glyph: 'bolt', tone: 'purple', tip: t('借来用用：借着 {name} 的{aug}', { name: name(l.from), aug: t(aug.name) }) });
    else if (l.from === pid) out.push({ key: `lent:${l.aug}`, glyph: 'bolt', tone: 'purple', tip: t('{aug}被 {name} 借走了', { aug: t(aug.name), name: name(l.to) }) });
  }
  for (const bet of s.bets) {
    if (!cur(bet) || (bet.a !== pid && bet.b !== pid)) continue;
    const other = bet.a === pid ? bet.b : bet.a;
    out.push({ key: `vs:${other}`, text: 'VS', tone: 'gold', tip: t('打赌：本回合和 {name} 比漏怪', { name: name(other) }) });
  }
  const cover = markOf('cover');
  if (cover) out.push({ key: 'cover', glyph: 'shield', tone: 'blue', text: cover.n > 0 ? `+${cover.n}` : null, tip: t('我来兜底：本回合 +{n} 资金', { n: cover.n || 0 }) });
  const watch = markOf('watch');
  if (watch) out.push({ key: 'watch', glyph: 'coin', tone: 'gold', text: `×${watch.n}`, tip: t('守望相助：本回合击倒 {n} 个敌人', { n: watch.n }) });
  const swapped = markOf('swap');
  if (swapped) out.push({ key: 'swap', glyph: 'swap', tone: 'swap', tip: t('与 {name} 交换了人生', { name: name(swapped.by) }) });
  const lives = markOf('lifeswap');
  if (lives) out.push({ key: 'lifeswap', glyph: 'swap', tone: 'blood', tip: t('与 {name} 换了命', { name: name(lives.by) }) });
  const sips = s.vamp[pid] ?? 0;
  if (sips > 0 || holdsAugment(pub, pid, 'aug_vampire')) {
    const max = augmentDef('aug_vampire')?.params?.max ?? 6;
    out.push({ key: 'fangs', glyph: 'fangs', tone: 'blood', text: sips > 0 ? `${sips}/${max}` : null, tip: t('吸血鬼：已吸 {n} 次（每局至多 {max} 次）', { n: sips, max }) });
  }
  return out;
}

/**
 * The lasting links between two rows: 同生共死's chain (both alive), 打赌's VS of this round, 搭便车's thin line (both alive).
 * { key, a, b, style }.
 * @param {any} state @param {any} pub
 */
export function linksFor(state, pub) {
  const s = isFxState(state) ? state : null;
  if (!s) return [];
  const here = (pid) => { const p = playerOf(pub, pid); return !!p && p.alive !== false; };
  const out = [];
  for (const [a, b] of s.bonds) if (here(a) && here(b)) out.push({ key: `chain:${a}:${b}`, a, b, style: 'chain' });
  for (const bet of s.bets) if ((pub?.round == null || bet.round === pub.round) && here(bet.a) && here(bet.b)) out.push({ key: `vs:${bet.a}:${bet.b}`, a: bet.a, b: bet.b, style: 'vs' });
  for (const [a, b] of Array.isArray(s.rides) ? s.rides : []) if (here(a) && here(b)) out.push({ key: `ride:${a}:${b}`, a, b, style: 'ride' });
  return out;
}

/** 篡位's captain: the last one its event crowned (while alive), else the first alive holder m.public shows; or null. */
export function captainOf(state, pub) {
  const s = isFxState(state) ? state : null;
  if (s && s.captain && playerOf(pub, s.captain) && playerOf(pub, s.captain).alive !== false) return s.captain;
  return alivePids(pub).find((pid) => holdsAugment(pub, pid, 'aug_usurp')) ?? null;
}

/** 「仇 ×N」: how often the player has a grudge against `pid` (m.private.grudges), or 0. */
export function grudgeOf(grudges, pid) {
  const n = isObj(grudges) && pid ? Number(grudges[pid]) : 0;
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

/**
 * The click 海克斯 the player may use on `target` now (TEAM_ACTIONS it holds: m.private.effects 'augment:<id>'): only in
 * the prep, alive and not ready, on a living teammate.
 * @param {any} target m.public players[] entry
 * @param {{ pub?: any, own?: { effects?: any[]|null, ready?: boolean, alive?: boolean } | null, myId?: string|null }} [o]
 */
export function teamActionsFor(target, { pub = null, own = null, myId = null } = {}) {
  if (!isObj(target) || !target.playerId || target.playerId === myId || target.alive === false) return [];
  if (pub?.phase !== PHASE.PREP || !own || own.alive === false || own.ready) return [];
  const held = new Set((Array.isArray(own.effects) ? own.effects : []).map((e) => (isObj(e) ? e.id : null)).filter(Boolean));
  // + 还手 on a teammate the player holds enough grudges against
  const g = grudgeOf(own.grudges, target.playerId);
  return [...TEAM_ACTIONS.filter((a) => held.has(`augment:${a.id}`)), ...REVENGE_ACTIONS.filter((a) => g >= a.cost)];
}

// ---- css, sound ----------------------------------------------------------------------------------------------------------

/** Link public/css/teamfx.css once (the pages do not); no-op outside a browser. */
export function ensureTeamFxCss(doc = globalThis.document) {
  if (!doc?.head || typeof doc.querySelector !== 'function') return false;
  if (doc.querySelector(`link[rel="stylesheet"][href$="${TEAMFX_CSS_HREF}"]`)) return false;
  const link = doc.createElement('link');
  link.rel = 'stylesheet';
  link.href = TEAMFX_CSS_HREF;
  doc.head.appendChild(link);
  return true;
}

const sfxAt = new Map();
/** The official UI / battle sounds the effects reuse (coins, the leak alarm, merge, ready …), one per name per 300 ms. */
function playSfx(it) {
  const go = () => {
    const now = Date.now();
    if (now - (sfxAt.get(it.name) ?? -Infinity) < 300) return;
    sfxAt.set(it.name, now);
    if (it.battle) audio.battle(it.name, { volume: it.volume });
    else audio.sfx(it.name, { volume: it.volume });
  };
  if (it.delay > 0) setTimeout(go, it.delay);
  else go();
}

const cssEsc = (s) => (globalThis.CSS?.escape ? globalThis.CSS.escape(String(s)) : String(s).replace(/["\\]/g, '\\$&'));
const rowSel = (pid) => `.team__row[data-pid="${cssEsc(pid)}"]`;
const reduceMotion = () => { try { return reducedMotion(); } catch { return false; } };

/**
 * Avatar boxes of the team panel's rows, in the panel's own (CSS px) coordinates: pid → { x, y, w, h, cx, cy } — the
 * screen boxes divided by the panel's scale, so a zoomed or scaled page still lines up.
 */
function measureRows(root) {
  const out = {};
  if (!root || typeof root.getBoundingClientRect !== 'function') return out;
  const box = root.getBoundingClientRect();
  const k = root.offsetWidth > 0 && box.width > 0 ? box.width / root.offsetWidth : 1;
  for (const row of root.querySelectorAll('.team__row[data-pid]')) {
    const av = row.querySelector('.pavatar') || row;
    const r = av.getBoundingClientRect();
    const x = (r.left - box.left) / k;
    const y = (r.top - box.top) / k;
    const w = r.width / k;
    const h = r.height / k;
    out[row.getAttribute('data-pid')] = { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
  }
  return out;
}
const sameGeo = (a, b) => {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => b[k] && ['x', 'y', 'w', 'h'].every((f) => Math.abs(a[k][f] - b[k][f]) < 0.5));
};

// ---- the hook -------------------------------------------------------------------------------------------------------------

const ownOf = (priv) => (priv ? { effects: priv.effects ?? null, ready: !!priv.ready, alive: priv.alive !== false, grudges: priv.grudges ?? null } : null);
const NONE = Object.freeze([]);
let uid = 0;

/**
 * The team panel's effects for this screen: the lasting state (badges, links, grudges) and the moving part of every new
 * event the setting shows (planTeamFx; each item lives until its time is over), the banner queue and the click 海克斯.
 * @param {any} pub m.public @param {string} myId
 */
export function useTeamFx(pub, myId) {
  useEffect(() => { ensureTeamFxCss(); }, []);
  const slice = useStore((s) => s.teamFx ?? null);
  const own = useStore((s) => ownOf(s.match?.private), shallowEqual);
  const mode = useStore((s) => teamFxMode(s.teamFx), Object.is, settingsStore);
  const [items, setItems] = useState([]);
  const [banners, setBanners] = useState([]);
  const [busy, setBusy] = useState(null);
  const used = useRef(new Map()); // click 海克斯 id → the round it was used (once a round)
  const seen = useRef(null);
  const live = useRef(null);
  const watcher = isWatcher(pub, myId);
  live.current = { pub, myId, mode, watcher };

  // the new events → what they show (history — received before this screen — is not news)
  const list = Array.isArray(slice?.list) ? slice.list : NONE;
  useEffect(() => {
    const last = list.length ? list[list.length - 1].seq : 0;
    if (seen.current == null || last < seen.current) { seen.current = last; return; }
    const now = Date.now();
    const fresh = list.filter((e) => e.seq > seen.current && now - e.at < FRESH_MS);
    seen.current = last;
    const c = live.current;
    const add = [];
    const queue = [];
    for (const ev of fresh) {
      if (!fxVisible(ev, c.mode, c)) continue;
      for (const it of planTeamFx(ev, c)) {
        if (it.type === 'sfx') playSfx(it);
        // one banner per moment: a moment sent as one event per player (遗产's heirs …) has the same line each time
        else if (it.type === 'banner') { if (!queue.some((b) => b.title === it.title)) queue.push({ ...it, id: ++uid, at: now }); }
        else add.push({ ...it, id: ++uid, until: now + (it.delay || 0) + (it.ms || 0) + 250 });
      }
    }
    if (add.length) setItems((cur) => [...cur.filter((x) => x.until > now), ...add].slice(-MAX_LIVE));
    if (queue.length) setBanners((q) => [...q, ...queue.filter((b) => !q.some((x) => x.title === b.title))].slice(-BANNER_QUEUE));
  }, [list]);

  // each moving item goes when its time is over
  useEffect(() => {
    if (!items.length) return undefined;
    const next = Math.min(...items.map((x) => x.until));
    const tm = setTimeout(() => setItems((cur) => { const n = Date.now(); const keep = cur.filter((x) => x.until > n); return keep.length === cur.length ? cur : keep; }),
      Math.max(30, next - Date.now() + 30));
    return () => clearTimeout(tm);
  }, [items]);

  // one banner at a time: BANNER_MS on screen + its close; a banner that waited too long is skipped
  const head = banners[0] || null;
  useEffect(() => {
    if (!head) return undefined;
    const tm = setTimeout(() => setBanners((q) => (q[0] === head ? q.slice(1) : q)), Date.now() - head.at > BANNER_STALE_MS ? 0 : BANNER_MS + 320);
    return () => clearTimeout(tm);
  }, [head]);

  const state = slice?.state ?? null;
  const round = Number.isFinite(pub?.round) ? pub.round : null;
  const of = (type, pid) => items.filter((x) => x.type === type && x.pid === pid);
  return {
    mode,
    state,
    badges: (pid) => badgesFor(pid, state, { pub, myId }),
    frameTag: (pid) => frameTagFor(pid, state, pub),
    legacy: (pid) => !!state?.legacy?.includes(pid),
    grudge: (pid) => (pid === myId ? 0 : grudgeOf(own?.grudges, pid)),
    floats: (pid) => of('num', pid),
    pops: (pid) => of('pop', pid),
    flights: items.filter((x) => x.type === 'fly'),
    lines: items.filter((x) => x.type === 'line'),
    shifts: items.filter((x) => x.type === 'shift'),
    links: linksFor(state, pub),
    banner: head && Date.now() - head.at <= BANNER_STALE_MS ? head : null,
    /** The click 海克斯 on a teammate's row: { id, key, label, tip, used, busy }. */
    actionsFor: (p) => teamActionsFor(p, { pub, own, myId }).map((a) => {
      const def = augmentDef(a.id);
      const done = used.current.get(a.id) === round;
      return { ...a, label: def ? t(def.name) : t(a.label), tip: done ? t('本回合已发动') : def ? t(def.desc, def.params) : a.tip ? t(a.tip, a.params) : null, used: done, busy: busy === a.id };
    }),
    /** g.augAction { id, target } (resolves true on success; a refusal is toasted). */
    runAction: async (id, target) => {
      if (busy) return false;
      setBusy(id);
      const ok = await act('g.augAction', { id, target }, { sfx: 'confirm' });
      if (ok) used.current.set(id, round);
      setBusy(null);
      return ok;
    },
  };
}

// ---- the row parts --------------------------------------------------------------------------------------------------------

/** The badges on an avatar (inside .team__btn): at most `max`, the rest folded into 「+N」. */
export function FxBadges({ list, max = 3 }) {
  if (!Array.isArray(list) || !list.length) return null;
  const shown = list.length > max ? list.slice(0, max - 1) : list;
  const rest = list.slice(shown.length);
  return html`<span class="tfx-badges">
    ${shown.map((b) => html`<span key=${b.key} class=${cx('tfx-badge', `tfx--${b.tone}`, b.text && 'has-text', b.text && !b.glyph && 'is-textonly')} title=${b.tip} aria-label=${b.tip}>
      ${b.glyph ? html`<${FxGlyph} name=${b.glyph} />` : null}${b.text ? html`<b class="tfx-badge__t">${b.text}</b>` : null}
      ${b.n ? html`<i class="tfx-badge__n num">${b.n}</i>` : null}</span>`)}
    ${rest.length ? html`<span class="tfx-badge tfx-badge--more" title=${rest.map((b) => b.tip).join('\n')} aria-label=${rest.map((b) => b.tip).join('，')}>+${rest.length}</span>` : null}
  </span>`;
}

/** 并肩作战's ×N on the frame (inside .team__btn). */
export function FxFrameTag({ text }) {
  return text ? html`<span class="tfx-frametag num" title=${t('并肩作战：造成的伤害 {mult}', { mult: text })}>${text}</span>` : null;
}

/** The pops on an avatar (inside .team__btn). */
export function FxPops({ list }) {
  if (!Array.isArray(list) || !list.length) return null;
  return html`<span class="tfx-pops" aria-hidden="true">
    ${list.map((p) => html`<span key=${p.id} class=${cx('tfx-pop', `tfx-pop--${p.style}`, `tfx--${p.tone}`)} style=${`--d:${p.delay || 0}ms;--ms:${p.ms}ms`}>
      ${p.glyph ? html`<${FxGlyph} name=${p.glyph} />` : null}${p.text ? html`<b>${p.text}</b>` : null}</span>`)}
  </span>`;
}

const numText = (f) => {
  if (f.unit === 'text') return f.text;
  const v = Math.round(Number(f.value) * 100) / 100;
  const s = `${v < 0 ? MINUS : '+'}${Math.abs(v)}`;
  return f.unit === 'layers' ? t('{n} 层', { n: s }) : s;
};

/** The numbers beside the LP (inside .team__info): LP, funds (with the coin glyph), layers, short texts. */
export function FxFloats({ list }) {
  if (!Array.isArray(list) || !list.length) return null;
  const lane = { lp: 0, text: 0, funds: 0, layers: 0 };
  return html`<span class="tfx-floats" aria-hidden="true">
    ${list.map((f) => {
      const i = lane[f.unit] ?? 0;
      lane[f.unit] = i + 1;
      return html`<span key=${f.id} class=${cx('tfx-num', `tfx-num--${f.unit}`, f.unit !== 'text' && (f.value < 0 ? 'is-loss' : 'is-gain'), f.tone && `tfx--${f.tone}`)}
        style=${`--d:${f.delay || 0}ms;--i:${i}`}>${f.unit === 'funds' ? html`<${FxGlyph} name="coin" class="tfx-num__coin" />` : null}${numText(f)}</span>`;
    })}
  </span>`;
}

/** 「仇 ×N」 beside a teammate's LP: the player's own grudge against them (m.private.grudges). */
export function GrudgeTag({ n, name }) {
  if (!(n > 0)) return null;
  // 记仇的互动 (2026-10-11; server/match/match/augments.js teamFloor / teamRevengeBonus): every 2 grudges his LP floor
  // drops 1 (at most FLOOR_MAX), from 3 a take is +1; a revenge settles one grudge
  const floor = Math.min(FLOOR_MAX, Math.floor(n / 2));
  const lines = [t('你对 {name} 记仇 {n} 次：你的损人利己海克斯优先找他，每报复一次消一点仇', { name, n })];
  if (floor > 0) lines.push(t('报复时他的目标生命底线 −{n}', { n: floor }));
  if (n >= 3) lines.push(t('报复时多拿 1 资金（吸星大法多吸 2 层）'));
  // 还手 (2026-10-11): 不兜底 by itself, 讨债 / 使绊子 on his row
  lines.push(t('不兜底：联防时你对他漏过来的敌人伤害 −{pct}%', { pct: COVER_PCT * Math.min(COVER_MAX, n) }));
  lines.push(n >= 2 ? t('点他的头像可以还手：讨债（1 点仇）、使绊子（2 点仇）') : t('点他的头像可以还手：讨债（1 点仇）'));
  return html`<span class="tfx-grudge" title=${lines.join('\n')}>${t('仇 ×{n}', { n })}</span>`;
}

// ---- the layer over the rows ----------------------------------------------------------------------------------------------

/** An icon flying from one avatar to another (an arc for what goes round the team); appears in place under reduced motion. */
function Flight({ item }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const root = el?.closest('.team');
    if (!el || !root) return undefined;
    const geo = measureRows(root);
    const b = geo[item.to];
    if (!b) { el.style.display = 'none'; return undefined; }
    let a = item.from ? geo[item.from] : null;
    if (!a && item.origin === 'team') {
      // 资源互助: from the rest of the team (the middle of the other rows), else from below
      const rest = Object.entries(geo).filter(([k]) => k !== item.to).map(([, g]) => g);
      a = rest.length ? { cx: rest.reduce((s, g) => s + g.cx, 0) / rest.length, cy: rest.reduce((s, g) => s + g.cy, 0) / rest.length } : { cx: b.cx, cy: b.cy + b.h };
    }
    const still = !a || reduceMotion() || typeof el.animate !== 'function';
    const at = still ? b : a;
    el.style.left = `${at.cx}px`;
    el.style.top = `${at.cy}px`;
    if (still) { el.classList.add('is-still'); return undefined; }
    const dx = b.cx - a.cx;
    const dy = b.cy - a.cy;
    const bulge = item.arc ? Math.max(28, Math.abs(dy) * 0.4) : Math.min(22, Math.abs(dy) * 0.18);
    const to = (x, y, s) => `translate(${x}px, ${y}px) scale(${s})`;
    const anim = el.animate([
      { transform: to(0, 0, 0.5), opacity: 0 },
      { transform: to(0, 0, 1), opacity: 1, offset: 0.12 },
      { transform: to(dx / 2 + bulge, dy / 2, 1.18), opacity: 1, offset: 0.5 },
      { transform: to(dx, dy, 1), opacity: 1, offset: 0.86 },
      { transform: to(dx, dy, 0.7), opacity: 0 },
    ], { duration: item.ms + 200, delay: item.delay || 0, easing: 'ease-in-out', fill: 'both' });
    return () => { try { anim.cancel(); } catch { /* gone */ } };
  }, []);
  return html`<span ref=${ref} class=${cx('tfx-fly', `tfx--${item.tone}`, item.img && 'has-img')} style=${`--d:${item.delay || 0}ms;--ms:${item.ms + 200}ms`}>
    ${item.img ? html`<${Img} src=${item.img} fallback=${html`<${FxGlyph} name=${item.glyph} />`} />` : html`<${FxGlyph} name=${item.glyph} />`}</span>`;
}

/** 灵魂交换 / 偷命: two rows' avatars (or LP towers) trade places and come back. Nothing under reduced motion. */
function Shift({ item }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const root = ref.current?.closest('.team');
    if (!root || reduceMotion()) return undefined;
    const part = item.part === 'lp' ? '.lp' : '.team__btn';
    const a = root.querySelector(`${rowSel(item.a)} ${part}`);
    const b = root.querySelector(`${rowSel(item.b)} ${part}`);
    if (!a || !b || typeof a.animate !== 'function') return undefined;
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    const box = root.getBoundingClientRect();
    const k = root.offsetWidth > 0 && box.width > 0 ? box.width / root.offsetWidth : 1;
    const dx = (rb.left - ra.left) / k;
    const dy = (rb.top - ra.top) / k;
    const go = (el, x, y) => el.animate([
      { transform: 'none' }, { transform: `translate(${x}px, ${y}px)`, offset: 0.42 }, { transform: `translate(${x}px, ${y}px)`, offset: 0.58 }, { transform: 'none' },
    ], { duration: item.ms, delay: item.delay || 0, easing: 'ease-in-out' });
    const anims = [go(a, dx, dy), go(b, -dx, -dy)];
    return () => anims.forEach((x) => { try { x.cancel(); } catch { /* gone */ } });
  }, []);
  return html`<span ref=${ref} class="tfx-shift" hidden></span>`;
}

/**
 * A thin bracket in the margin left of the avatars joining two rows (its stubs reach each avatar's centre line):
 * 同生共死's chain and 打赌's VS (lasting; the avatars carry their badges), 献祭 / 连坐's short ones. `lane` steps it left
 * (at most 4 lanes: the panel's margin).
 */
function Link({ link, geo, lane }) {
  const a = geo[link.a];
  const b = geo[link.b];
  if (!a || !b) return null;
  const style = `--x:${Math.min(a.x, b.x)}px;--lane:${Math.min(3, lane)};top:${Math.min(a.cy, b.cy)}px;height:${Math.max(2, Math.abs(a.cy - b.cy))}px;`
    + `--d:${link.delay || 0}ms;--ms:${link.ms || 0}ms`;
  return html`<span class=${cx('tfx-link', `tfx-link--${link.style}`, link.ms && 'is-brief')} style=${style}></span>`;
}

/**
 * The layer over the team panel's rows (the last child of .team): links, flights, swaps; and the banner and P9's loud
 * emote above every screen.
 * @param {{ fx: ReturnType<typeof useTeamFx>, pub: any }} props
 */
export function TeamFxLayer({ fx, pub }) {
  const ref = useRef(null);
  const [geo, setGeo] = useState({});
  useLayoutEffect(() => {
    const g = measureRows(ref.current?.closest('.team'));
    setGeo((cur) => (sameGeo(cur, g) ? cur : g));
  });
  useEffect(() => {
    const root = ref.current?.closest('.team');
    if (!root || typeof ResizeObserver !== 'function') return undefined;
    const ro = new ResizeObserver(() => { const g = measureRows(root); setGeo((cur) => (sameGeo(cur, g) ? cur : g)); });
    ro.observe(root);
    return () => ro.disconnect();
  }, []);
  const links = [...fx.links, ...fx.lines.map((l) => ({ ...l, key: `l${l.id}` }))];
  return html`<div class="tfx-layer" ref=${ref} aria-hidden="true">
    ${links.map((l, i) => html`<${Link} key=${l.key} link=${l} geo=${geo} lane=${i} />`)}
    ${fx.flights.map((f) => html`<${Flight} key=${f.id} item=${f} />`)}
    ${fx.shifts.map((s) => html`<${Shift} key=${s.id} item=${s} />`)}
    <${FxScreenHost} banner=${fx.banner} pub=${pub} />
  </div>`;
}

// ---- above every screen: the banner, the loud emote -----------------------------------------------------------------------

/** Renders the screen-level effects into a host of its own under <body> (above the 海克斯 / 机变 overlays; no clicks). */
function FxScreenHost({ banner, pub }) {
  const host = useRef(null);
  useLayoutEffect(() => {
    const doc = globalThis.document;
    if (!doc?.body) return undefined;
    const el = doc.createElement('div');
    el.className = 'tfx-screen';
    doc.body.appendChild(el);
    host.current = el;
    return () => { try { render(null, el); } catch { /* ignore */ } el.remove(); host.current = null; };
  }, []);
  useLayoutEffect(() => {
    if (host.current) render(html`<${FxScreen} banner=${banner} pub=${pub} />`, host.current);
  });
  return null;
}

function FxScreen({ banner, pub }) {
  return html`${banner ? html`<${FxBanner} key=${banner.id} banner=${banner} pub=${pub} />` : null}<${LoudEmote} pub=${pub} />`;
}

/** A big moment's banner: the look of the round's 作战结束 box, higher on the screen, 1.5 s, no clicks. */
function FxBanner({ banner, pub }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => { const tm = setTimeout(() => setLeaving(true), BANNER_MS); return () => clearTimeout(tm); }, []);
  const pair = Array.isArray(banner.pair) ? banner.pair.map((pid) => playerOf(pub, pid)).filter(Boolean) : [];
  return html`<div class=${cx('rdialog', 'tfx-banner', `tfx--${banner.tone}`, leaving && 'is-leaving')} role="status" aria-live="polite">
    <div class="rdialog__box tfx-banner__box">
      <span class="rdialog__tick rdialog__tick--tl"></span><span class="rdialog__tick rdialog__tick--tr"></span>
      <span class="rdialog__tick rdialog__tick--bl"></span><span class="rdialog__tick rdialog__tick--br"></span>
      <span class="rdialog__micro">ALLIANCE</span>
      <div class="rdialog__row tfx-banner__row">
        ${pair.length === 2 ? null : html`<span class="tfx-banner__icon"><${FxGlyph} name=${banner.glyph} /></span>`}
        <span class="rdialog__title tfx-banner__title">${banner.title}</span>
      </div>
      ${pair.length === 2 ? html`<span class="rdialog__sub tfx-banner__pair">
        <${PlayerAvatar} player=${pair[0]} size="sm" /><span class="tfx-banner__mid"><${FxGlyph} name=${banner.glyph} /></span><${PlayerAvatar} player=${pair[1]} size="sm" />
      </span>` : null}
    </div>
  </div>`;
}

/** The latest emote with `loud` (P9 传声筒), big and translucent at the top centre for LOUD_MS; off with the setting. */
export function LoudEmote({ pub }) {
  const emotes = useStore((s) => s.emotes);
  const mode = useStore((s) => teamFxMode(s.teamFx), Object.is, settingsStore);
  const [cur, setCur] = useState(null);
  const seen = useRef(null);
  useEffect(() => {
    const list = Array.isArray(emotes) ? emotes : [];
    const last = list.length ? list[list.length - 1].seq : 0;
    if (seen.current == null || last < seen.current) { seen.current = last; return; }
    const fresh = list.filter((e) => e && e.seq > seen.current && e.loud);
    seen.current = last;
    const e = fresh[fresh.length - 1];
    if (e && mode !== 'off' && !(Date.now() - e.at > LOUD_MS)) setCur(e);
  }, [emotes]);
  useEffect(() => {
    if (!cur) return undefined;
    const tm = setTimeout(() => setCur((c) => (c === cur ? null : c)), LOUD_MS);
    return () => clearTimeout(tm);
  }, [cur]);
  if (!cur || mode === 'off') return null;
  return html`<div key=${cur.seq} class="tfx-loud" style=${`--loud-ms:${LOUD_MS}ms`} role="img" aria-label=${t('{name} 的表情', { name: nameOf(pub, cur.playerId) })}>
    <${EmoteArt} id=${cur.id} />
  </div>`;
}
