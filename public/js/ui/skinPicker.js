// public/js/ui/skinPicker.js — A6000 fork: the outfit (时装) row of an operator — in 干员调配's detail (screens/loadout.js)
// and in the 自选编队 picker (screens/diy.js). The original look and every outfit data/assets.json lists for the charId
// (chars[].skins, tools/fetch-skins.mjs); a pick is kept in this browser only (skins.js) and shows at once. Nothing
// when the operator has no outfit.

import { html, MicroLabel } from './components.js';
import { Img } from './gameComponents.js';
import { useStore } from '../store.js';
import { skinStore, skinOptions, selectedSkin, setSkin } from '../skins.js';
import { t } from '../../../shared/i18n.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');

/** @param {{ m: any, charId: string|null|undefined }} props */
export function SkinPicker({ m, charId }) {
  useStore((s) => s.choices, Object.is, skinStore);
  const options = charId ? skinOptions(m, charId) : [];
  if (!options.length) return null;
  const selected = selectedSkin(m, charId)?.id || '';
  const original = m?.chars?.[charId];
  return html`<section class="lo-sec lo-sec--skins" aria-label=${t('干员皮肤')} data-testid="skin-picker">
    <header class="lo-sec__head"><h3>${t('皮肤')}<${MicroLabel}>OUTFIT<//></h3></header>
    <p class="lo-sec__note">${t('头像、立绘与战斗模型同步更换 · 仅本机显示 · 开局前选择')}</p>
    <div class="lo-skins" role="radiogroup" aria-label=${t('选择皮肤')}>
      ${[{ id: '', name: t('原始外观'), avatar: original?.avatar }, ...options].map((skin) => html`<button
        key=${skin.id} type="button" role="radio" aria-checked=${selected === skin.id ? 'true' : 'false'}
        class=${cx('lo-skin', selected === skin.id && 'is-on')} data-skin=${skin.id}
        onClick=${() => setSkin(m, charId, skin.id)}>
        <${Img} src=${skin.avatar} /><span>${skin.name}</span>
      </button>`)}
    </div>
  </section>`;
}
