// A6000 fork: the room's 敌人强化 settings (shared/enemyBuffs.js) — the votes on / off, the tier weights 白银 / 黄金 / 彩色
// (0–100 each: a vote's tier is drawn by them) and 「第 4 回合不出彩色」. The lobby's create box offers them for the new room
// (remembered in the prefs as `lobby.enemyBuffs`, sent with room.create); the room screen shows them to every member and
// lets the host change them before the match (room.setEnemyBuffs, server/lobby.js). EnemyBuffStrip: the summary line
// and, for whoever may edit, the button that opens the editor (EnemyBuffEditor in a modal; 确定 applies). Texts go
// through t() (docs/I18N.md).

import { useState } from '../../vendor/hooks.module.js';
import { html, Button, Icon, MicroLabel, Modal } from './components.js';
import { t, tc } from '../../../shared/i18n.js';
import { EB_TIERS, EB_TIER_NAME, EB_WEIGHT_MAX, CONFIGURABLE_ROUNDS, EB_SETTINGS_DEFAULT, enemyBuffSettings } from '../../../shared/enemyBuffs.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');

/**
 * Each tier's chance per vote in % (whole numbers, summing to 100 unless every weight is 0), from the settings' weights;
 * `noPrism`: the first vote's when 彩色 is left out there (the server then gives the other two their share — and 白银
 * everything when only 彩色 had weight: shared/enemyBuffs.js rollVoteTier).
 * @returns {number[]} [白银, 黄金, 彩色]
 */
export function tierChances(settings, { noPrism = false } = {}) {
  const s = enemyBuffSettings(settings);
  const w = s.weights.map((v, i) => (noPrism && EB_TIERS[i] === 6 ? 0 : v));
  const sum = w.reduce((a, b) => a + b, 0);
  if (!(sum > 0)) return EB_TIERS.map((tier) => (tier === 1 ? 100 : 0));
  const raw = w.map((v) => (v * 100) / sum);
  const out = raw.map(Math.floor);
  // largest remainders get the points the flooring lost, so the line adds up to 100
  const order = raw.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]);
  for (let k = 100 - out.reduce((a, b) => a + b, 0), j = 0; k > 0; k--, j++) out[order[j % order.length][1]]++;
  return out;
}

/** The settings as one line of text: '关闭', or '白银 60% · 黄金 30% · 彩色 10%（第 4 回合不出彩色）'. */
export function enemyBuffSummary(settings) {
  const s = enemyBuffSettings(settings);
  if (!s.on) return t('关闭');
  const line = tierChances(s).map((p, i) => `${t(EB_TIER_NAME[EB_TIERS[i]])} ${p}%`).join(' · ');
  return s.firstNoPrism ? t('{line}（第 {r} 回合不出彩色）', { line, r: s.enemyRounds[0] ?? 2 }) : line;
}

function Toggle({ value, onChange, disabled, label }) {
  return html`<button type="button" class=${cx('set-toggle', 'ebset__toggle', value && 'is-on')} role="switch" aria-checked=${value ? 'true' : 'false'}
      aria-label=${label} disabled=${disabled} onClick=${() => onChange(!value)}><i></i><span>${value ? tc('toggle', '开启') : tc('toggle', '关闭')}</span></button>`;
}

/**
 * The editor (controlled): `value` settings, `onChange(next)` with the whole new settings object.
 * @param {{ value: any, onChange: (v: { on: boolean, weights: number[], firstNoPrism: boolean }) => void, disabled?: boolean }} props
 */
export function EnemyBuffEditor({ value, onChange, disabled = false }) {
  const s = enemyBuffSettings(value);
  const set = (patch) => onChange({ ...s, ...patch });
  const setWeight = (i, v) => {
    const w = s.weights.slice();
    w[i] = Math.max(0, Math.min(EB_WEIGHT_MAX, Math.round(Number(v) || 0)));
    // at least one tier keeps a weight (the server refuses all 0): the moved one stays at 1 then
    if (!w.some((x) => x > 0)) w[i] = 1;
    set({ weights: w });
  };
  const chances = tierChances(s);
  const first = tierChances(s, { noPrism: s.firstNoPrism });
  const off = disabled || !s.on;
  return html`<div class=${cx('ebset', !s.on && 'is-off')}>
    <div class="ebset__row">
      <span class="ebset__label"><${Icon} name="sword" />${t('敌人强化')}<${MicroLabel}>ENEMY UPGRADES<//></span>
      <${Toggle} value=${s.on} disabled=${disabled} label=${t('敌人强化')} onChange=${(on) => set({ on })} />
    </div>
    <p class="ebset__note">${t('第 {rounds} 回合全队投票，所有敌人从此获得投中的强化。每次投票先按下面的权重抽一个品质，三个选项都是这个品质。', { rounds: s.enemyRounds.join('、') || '—' })}</p>
    <div class="ebset__row"><span class="ebset__label">${t('我方所有人海克斯品质相同')}</span>
      <${Toggle} value=${s.samePlayerQuality} disabled=${disabled} label=${t('我方所有人海克斯品质相同')}
        onChange=${v=>set({samePlayerQuality:v,sameBothQuality:v&&s.sameBothQuality})} /></div>
    <div class="ebset__row"><span class="ebset__label">${t('双方海克斯品质相同')}</span>
      <${Toggle} value=${s.sameBothQuality} disabled=${disabled||!s.samePlayerQuality} label=${t('双方海克斯品质相同')}
        onChange=${v=>set({sameBothQuality:v})} /></div>
    <p class="ebset__note">${t('双方同步需要先开启我方同步。同一轮按同一品质生成候选；最高档我方红对应敌方彩。双方同步时使用我方品质概率，敌方权重不参与；首次禁彩会把共同最高档降为金。')}</p>
    <p class="ebset__note">${t('逐回合选择是否新增强化；关闭某回合不会移除之前获得的强化。第14、15回合仅在进入对应战斗时生效。')}</p>
    <div class="ebset__presets">
      ${[['默认安排', { playerRounds: EB_SETTINGS_DEFAULT.playerRounds, enemyRounds: EB_SETTINGS_DEFAULT.enemyRounds, on: true }],
        ['每回合双方', { playerRounds: CONFIGURABLE_ROUNDS, enemyRounds: CONFIGURABLE_ROUNDS, on: true }],
        ['仅我方', { playerRounds: CONFIGURABLE_ROUNDS, enemyRounds: [] }],
        ['全部关闭', { playerRounds: [], enemyRounds: [] }]].map(([label, patch]) => html`<${Button} variant="ghost" size="sm" disabled=${disabled} onClick=${() => set(patch)}>${t(label)}<//>`)}
    </div>
    <div class="ebset__schedule" role="group" aria-label=${t('每回合强化安排')}>
      <b>${t('回合')}</b><b>${t('我方海克斯')}</b><b>${t('敌方强化')}</b>
      ${CONFIGURABLE_ROUNDS.map((r) => html`<span key=${'r'+r}>${r}</span>
        <input key=${'p'+r} type="checkbox" checked=${s.playerRounds.includes(r)} disabled=${disabled} aria-label=${t('第 {r} 回合我方海克斯', { r })}
          onChange=${(e) => set({ playerRounds: e.currentTarget.checked ? [...s.playerRounds, r] : s.playerRounds.filter((x) => x !== r) })} />
        <input key=${'e'+r} type="checkbox" checked=${s.enemyRounds.includes(r)} disabled=${off} aria-label=${t('第 {r} 回合敌方强化', { r })}
          onChange=${(e) => set({ enemyRounds: e.currentTarget.checked ? [...s.enemyRounds, r] : s.enemyRounds.filter((x) => x !== r) })} />`)}
    </div>
    ${EB_TIERS.map((tier, i) => {
      const pct = Math.round((s.weights[i] / EB_WEIGHT_MAX) * 100);
      return html`<label key=${tier} class=${cx('ebset__row', 'ebset__tier', `ebset__tier--t${tier}`)}>
        <span class="ebset__name">${t(EB_TIER_NAME[tier])}</span>
        <input class="set-range ebset__range" type="range" min="0" max=${EB_WEIGHT_MAX} step="5" value=${s.weights[i]} disabled=${off}
          style=${`--pct:${pct}%`} aria-label=${t('{tier}的权重', { tier: t(EB_TIER_NAME[tier]) })}
          onInput=${(e) => setWeight(i, e.currentTarget.value)} />
        <span class="ebset__val num">${s.weights[i]}</span>
        <span class="ebset__chance num">${chances[i]}%</span>
      </label>`;
    })}
    <div class="ebset__row">
      <span class="ebset__label">${t('首次敌方强化不出彩色')}</span>
      <${Toggle} value=${s.firstNoPrism} disabled=${off} label=${t('首次敌方强化不出彩色')} onChange=${(firstNoPrism) => set({ firstNoPrism })} />
    </div>
    <p class="ebset__note">${s.on
      ? t('每次投票的品质概率：{line}；第 {r} 回合：{first}', {
        line: chances.map((p, i) => `${t(EB_TIER_NAME[EB_TIERS[i]])} ${p}%`).join(' · '), r: s.enemyRounds[0] ?? 2,
        first: first.map((p, i) => `${t(EB_TIER_NAME[EB_TIERS[i]])} ${p}%`).join(' · '),
      })
      : t('关闭后不再新增敌方强化，我方海克斯按回合设置执行')}</p>
  </div>`;
}

/**
 * The summary line of the settings, with an edit button for whoever may change them (`editable`): it opens the editor
 * in a modal on a copy; 确定 hands the copy to `onSave` (a promise is awaited: the modal closes when it resolves).
 * @param {{ value: any, editable?: boolean, busy?: boolean, onSave?: (v: any) => any, class?: string }} props
 */
export function EnemyBuffStrip({ value, editable = false, busy = false, onSave = () => {}, class: cls }) {
  const [draft, setDraft] = useState(null);
  const s = enemyBuffSettings(value);
  const save = async () => {
    const next = draft;
    try { await onSave(next); setDraft(null); } catch { /* the caller toasts its own error; the editor stays open */ }
  };
  return html`<div class=${cx('ebstrip', !s.on && 'is-off', cls)}>
    <span class="ebstrip__label"><${Icon} name="sword" />${t('海克斯与敌方强化')}</span>
    <span class="ebstrip__sum"><small>${t('我方海克斯')}：${s.playerRounds.join('、') || '—'}<br/>${t('敌方强化')}：${s.on ? s.enemyRounds.join('、') || '—' : t('关闭')}</small>${s.on ? tierChances(s).map((p, i) => html`<b key=${i} class=${`ebstrip__tier ebset__tier--t${EB_TIERS[i]}`}>${t(EB_TIER_NAME[EB_TIERS[i]])} <span class="num">${p}%</span></b>`) : html`<b class="ebstrip__off">${t('关闭')}</b>`}
      ${s.samePlayerQuality ? html`<small>${t('我方同品质')}${s.sameBothQuality ? ' · '+t('双方同品质') : ''}</small>` : null}
      ${s.on && s.firstNoPrism ? html`<small>${t('首次敌方强化不出彩色')}</small>` : null}</span>
    ${editable ? html`<${Button} variant="ghost" size="sm" icon="edit" class="ebstrip__edit" loading=${busy} onClick=${() => setDraft({ ...s })}>${t('调整')}<//>` : null}
    <${Modal} open=${!!draft} onClose=${() => setDraft(null)} title=${t('海克斯与敌方强化')} micro="ENEMY UPGRADES" width="7.2rem"
      actions=${html`<${Button} variant="secondary" onClick=${() => setDraft(null)}>${t('取消')}<//>
        <${Button} variant="primary" icon="check" loading=${busy} onClick=${save}>${t('确定')}<//>`}>
      ${draft ? html`<${EnemyBuffEditor} value=${draft} onChange=${setDraft} disabled=${busy} />` : null}
    <//>
  </div>`;
}
