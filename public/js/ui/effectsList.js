// Active effects list (m.private.effects: band / 机变 / team / item / garrison effects with counters):
// compact icon column at the right edge, rich-text tooltip per effect. `counterText` (a 悬赏's "还剩 N 场作战", user
// playtest #6 item 4) replaces the bare counter in the tooltip's kind line.

import { html, Tooltip, MicroLabel } from './components.js';
import { Img, RichText, GIcon } from './gameComponents.js';
import { effectIconUrl } from './assetUrls.js';
import { data } from '../data.js';
import { t, tName, N_ } from '../../../shared/i18n.js';
import { augmentDef, enemyBuffDef } from '../../../shared/augments.js';
import { sentText } from './lang.js';

const KIND = { band: N_('策略'), choice: N_('机变'), team: N_('团队增益'), item: N_('道具'), garrison: N_('特质'), augment: N_('海克斯'), enemyBuff: N_('敌人强化') };

/** A6000 fork: a 海克斯 / an enemy upgrade entry's definition (shared/augments.js), else null. */
const augDefOf = (e) => (e?.iconKind === 'augment' ? augmentDef(String(e.id || '').replace(/^augment:/, ''))
  : e?.iconKind === 'enemyBuff' ? enemyBuffDef(String(e.id || '').replace(/^enemyBuff:/, '')) : null);

/**
 * A6000 fork: the enemy upgrades of the match (m.public.enemyBuffs, vote order) as effect entries — one per upgrade, a
 * repeated one with its count.
 * @param {string[]|null|undefined} ids
 */
export function enemyBuffEntries(ids) {
  const n = new Map();
  for (const id of Array.isArray(ids) ? ids : []) if (enemyBuffDef(id)) n.set(id, (n.get(id) ?? 0) + 1);
  return [...n].map(([id, k]) => { const d = enemyBuffDef(id); return { id: `enemyBuff:${id}`, name: d.name, desc: d.desc, iconKind: 'enemyBuff', ...(k > 1 ? { counter: k } : {}) }; });
}

/** A6000 fork: an effects list followed by the match's enemy upgrades (the list as it was when there are none). */
export function withEnemyBuffs(list, ids) {
  const extra = enemyBuffEntries(ids);
  if (!extra.length) return list;
  return [...(Array.isArray(list) ? list : []), ...extra];
}

/**
 * A 悬赏's counter line in the current language: the battles its enemies still come for (server/match/player/views.js
 * sends the same Chinese text as `counterText` beside the count; a multi-round card has no count).
 * @param {{ counter?: number|null }} e
 */
export const bountyCounterText = (e) => (e.iconKind === 'band' && e.counterText ? e.counterText : e.counter == null ? t('之后的每场作战') : t('还剩 {left} 场作战', { left: e.counter }));

/** Data files whose records an effect entry copies its name / description from (by its id or icon id). */
const SOURCES = ['effects', 'bands', 'items', 'garrisons'];

/**
 * An effect entry's description in the current language (the server copies a record's Chinese text: an effect's, a
 * strategy's, an item's, a 特质's — sentText; a reworded one, such as a multi-round 悬赏's, stays as sent).
 * @param {{ id?: string, iconId?: string, desc?: string }} e
 */
export function effectDesc(e) {
  const ad = augDefOf(e);
  if (ad) return t(ad.desc, ad.params);
  const desc = e.desc || '';
  if (!desc) return desc;
  for (const file of SOURCES) {
    for (const id of [e.id, e.iconId]) {
      const raw = typeof id === 'string' && id ? data.lookupRaw(file, id) : null;
      if (!raw) continue;
      const loc = data.lookup(file, id) || raw;
      for (const k of ['descRaw', 'desc']) {
        const v = sentText(desc, raw[k], loc[k]);
        if (v !== desc) return v;
      }
    }
  }
  return desc;
}

/**
 * `onAugAction(id)`: the prep's click on a 海克斯 used by a click (献祭, 命运轮盘, 熔炉 — its definition's `action`; A6000
 * fork) — null while the player cannot act (another phase, ready, watching someone else).
 * @param {{ effects: any[], onAugAction?: ((id: string) => void) | null }} props
 */
export function EffectsList({ effects, onAugAction = null }) {
  const list = (Array.isArray(effects) ? effects : []).filter((e) => e && (e.name || e.desc));
  if (!list.length) return null;
  const m = data.get('assets');
  return html`<div class="effects" aria-label=${t('生效中的效果')}>
    <${MicroLabel}>EFFECTS</${MicroLabel}>
    ${list.slice(0, 16).map((e, i) => {
      const ad = augDefOf(e);
      const act = onAugAction && e.iconKind === 'augment' && ad && ad.action ? () => onAugAction(ad.id) : null;
      const icon = html`<${Img} src=${effectIconUrl(m, e)} fallback=${html`<${GIcon} name="bolt" />`} />
        ${e.counter != null && e.counter !== '' ? html`<b class="effect__n num">${e.counter}</b>` : null}`;
      return html`<${Tooltip} key=${e.id ?? i} placement="bottom" text=${html`<div class="efftip">
        <b>${ad ? t(ad.name) : tName(e.name) || t('效果')}</b><span class="efftip__kind">${t(KIND[e.iconKind] || '')}${e.counterText ? ` · ${bountyCounterText(e)}` : e.counter != null ? ` · ${e.counter}` : ''}</span>
        <${RichText} as="p" text=${effectDesc(e)} />
        ${act ? html`<span class="efftip__act">${t('点击图标发动（每回合 1 次）')}</span>` : null}
      </div>`}>
      ${act ? html`<button type="button" class=${`effect effect--${e.iconKind} effect--act`} aria-label=${t(ad.name)} onClick=${act}>${icon}</button>`
        : html`<span class=${`effect effect--${e.iconKind || 'x'}`}>${icon}</span>`}
    <//>`;
    })}
  </div>`;
}
