import { EB_TIER_NAME } from '../../../shared/enemyBuffs.js';
// A6000 fork: the AUGMENT phase overlay — 海克斯 (three offers of the round's tier, a two-tap pick like
// the 机变 cards) and the 敌人强化 vote (three upgrades, one tap votes and can be changed until the phase ends; each card
// shows who voted for it; A6000 fork: the vote's tier — and its 首领专场 / 逆反 — above the cards, each card coloured by
// its tier like the 海克斯'). Both on one screen when a round has both. The data: shared/augments.js; the server:
// server/match/match/augments.js (m.public.aug, m.private.aug). Reuses the 机变 overlay's look (spov / spcard).
import { useEffect, useState } from '../../vendor/hooks.module.js';
import { html, Icon, Countdown, MicroLabel, Button } from './components.js';
import { Img, PlayerAvatar, GIcon } from './gameComponents.js';
import { uiUrl } from './assetUrls.js';
import { sortedPlayers } from './gameLogic.js';
import { data } from '../data.js';
import { t } from '../../../shared/i18n.js';
import { augmentDef, enemyBuffDef, TIER_NAME, CLASS_NAMES, RARITY_NAME } from '../../../shared/augments.js';
import { augmentSet, setOf, setCounts } from '../../../shared/augmentSets.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');

/**
 * Display fields of an augment id (current language). `owned`: the player's augments — the 套装 tag counts the members
 * already held (海克斯第六版).
 */
export function augmentView(id, owned = null) {
  const d = augmentDef(id);
  if (!d) return null;
  // A6000 fork: a 职业专精's profession (its card's tag); the six rarities (2026-10-10: 白 绿 蓝 紫 金 红) colour the card
  const rarity = d.rarity || ({ 1: 2, 2: 4, 3: 5 })[d.tier] || 2;
  const setId = setOf(id);
  const set = setId ? { id: setId, name: t(augmentSet(setId).name), have: setCounts(owned || []).get(setId) || 0 } : null;
  return { id, tier: d.tier, rarity, name: t(d.name), desc: t(d.desc, d.params), tierName: t(RARITY_NAME[rarity] || ''), cls: d.cls ? t(CLASS_NAMES[d.cls] || '') : null, set };
}

/** Display fields of an enemy upgrade id (A6000 fork, second version: + its tier, as the 海克斯'). */
export function enemyBuffView(id) {
  const d = enemyBuffDef(id);
  return d ? { id, tier: d.rarity, name: t(d.name), desc: t(d.desc, d.params), tierName: t(EB_TIER_NAME[d.rarity] || '') } : null;
}

/**
 * The overlay: keeps the two-tap selection of an augment and renders AugmentView.
 * @param {{ pub: any, priv: any, myId: string, solo: boolean, onPick: (id: string) => void,
 *   onVote: (id: string) => void, busy?: boolean, total?: number|null }} props
 */
export function AugmentOverlay(props) {
  const { priv, onPick } = props;
  const mine = priv?.aug || null;
  const [armed, setArmed] = useState(null);
  const offers = mine?.offers || [];
  const valid = armed && offers.includes(armed) && !mine?.picked ? armed : null;
  useEffect(() => { if (armed && !valid) setArmed(null); }, [armed, valid]);
  useEffect(() => {
    if (!valid) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setArmed(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [valid]);
  const tap = (id) => {
    if (mine?.picked || !offers.includes(id)) return;
    if (valid === id) { setArmed(null); onPick(id); } else setArmed(id);
  };
  return html`<${AugmentView} ...${props} armed=${valid} onTap=${tap} onDisarm=${() => setArmed(null)} />`;
}

/**
 * The overlay's view (pure: no hooks).
 * @param {{ pub: any, priv: any, myId: string, solo: boolean, busy?: boolean, total?: number|null, armed?: string|null,
 *   onTap?: (id: string) => void, onDisarm?: () => void, onVote?: (id: string) => void }} props
 */
export function AugmentView({ pub, priv, myId, solo, busy = false, total = null, armed = null, onTap = () => {}, onDisarm = () => {}, onVote = () => {}, onReroll = () => {} }) {
  const aug = pub?.aug;
  if (!aug) return null;
  const mine = priv?.aug || null;
  const m = data.get('assets');
  const players = new Map(sortedPlayers(pub).map((p) => [p.playerId, p]));
  const timed = !aug.untimed && !solo;
  const vote = aug.vote || null;
  const myVote = vote ? vote.votes?.[myId] ?? null : null;
  const pickDone = !mine || mine.picked != null;
  const voteDone = !vote || myVote != null;
  const onDown = (e) => {
    if (!armed) return;
    const tg = e.target;
    if (tg && typeof tg.closest === 'function' && tg.closest('.augcard')) return;
    onDisarm();
  };
  const waiting = [...players.values()].filter((p) => p.alive && (aug.picked?.[p.playerId] === false || (vote && vote.votes?.[p.playerId] == null)));
  // R4 / R10 (海克斯 every second round): a pick and the vote on one screen — compact cards (game-panels.css .augov--both)
  return html`<div class=${cx('spov', 'augov', mine && vote && 'augov--both', armed && 'has-armed')} role="dialog" aria-label=${t('海克斯')} onPointerDown=${onDown}>
    <div class="spov__veil" aria-hidden="true"></div>
    <div class="spov__inner">
      <header class="spov__head">
        <div class="spov__titles">
          <${MicroLabel} tone="mint">${t('AUGMENT // 海克斯')}</${MicroLabel}>
          <h2 class="spov__title">${mine ? (mine.rarity ? html`<span class=${cx('augov__rar', `augcard__rar--r${mine.rarity}`)}>${t(RARITY_NAME[mine.rarity] || '')}</span>${t('海克斯')}` : t('{tier}海克斯', { tier: t(TIER_NAME[aug.tier] || '') })) : t('敌人强化投票')}</h2>
          <p class="spov__sub">${mine && vote ? t('选择一个海克斯，并投票决定敌人获得的强化') : mine ? t('选择一个海克斯，整局生效') : t('票数最多的强化生效；平票随机；可以改票')}${timed ? t(' · 倒计时结束后未选的随机分配') : ''}</p>
        </div>
        <div class="spov__turn">
          ${pickDone && voteDone ? html`<span class="spov__turntxt is-done"><${Icon} name="check" />${t('已完成，等待队友')}</span>` : html`<span class="spov__turntxt is-mine">${t('请选择')}</span>`}
          ${timed ? html`<${Countdown} deadline=${pub?.deadline} total=${total ?? undefined} size="sm" />` : null}
        </div>
      </header>
      ${!solo && waiting.length ? html`<div class="spov__order" aria-label=${t('尚未完成')}>
        ${waiting.map((p) => html`<div key=${p.playerId} class=${cx('spov__who', p.playerId === myId && 'is-self')}>
          <${PlayerAvatar} player=${p} size="sm" self=${p.playerId === myId} /><span class="spov__wname">${p.name}</span>
          <span class="spov__wstate"><${Icon} name="hourglass" /></span></div>`)}
      </div>` : null}
      ${mine ? html`<section class="augov__sec" aria-label=${t('海克斯')}>
        <div class="spov__grid spov__grid--3">
          ${mine.offers.map((id) => {
            const v = augmentView(id, priv?.augments);
            if (!v) return null;
            const chosen = mine.picked === id;
            const isArmed = armed === id;
            const can = mine.picked == null && !busy;
            return html`<button key=${id} type="button" data-aug=${id} class=${cx('spcard', 'augcard', `augcard--r${v.rarity}`, can && 'is-pickable', isArmed && 'is-armed', chosen && 'is-mine', mine.picked != null && !chosen && 'is-taken')}
                disabled=${!can} aria-pressed=${can ? String(isArmed) : undefined} onClick=${() => can && onTap(id)}
                aria-label=${isArmed ? t('{name}，已选中，再次点击确认', { name: v.name }) : v.name} title=${`${v.name}\n${v.desc}`}>
              <span class="spcard__glow" aria-hidden="true"></span>
              <span class="spcard__head">
                <span class="spcard__icon"><${Img} src=${uiUrl(m, 'buffIcon/icon_player_buff')} fallback=${html`<${GIcon} name="bolt" />`} /></span>
                <span class="spcard__title"><b class="spcard__name">${v.name}</b><span class="spcard__tags"><span class=${cx('spcard__tag', `augcard__rar--r${v.rarity}`)}>${v.tierName}</span>${v.cls ? html`<span class="spcard__tag augcard__cls">${t('职业专精·{cls}', { cls: v.cls })}</span>` : null}${v.set ? html`<span class=${cx('spcard__tag', 'augcard__set', `augcard__set--${v.set.id}`, v.set.have > 0 && 'is-started')}>${v.set.have > 0 ? t('〔{name}〕已有 {n} 件', { name: v.set.name, n: v.set.have }) : t('〔{name}〕', { name: v.set.name })}</span>` : null}</span></span>
              </span>
              <p class="spcard__desc">${v.desc}</p>
              ${isArmed ? html`<span class="spcard__confirm" role="status"><b>${t('确认选择')}</b><small>${t('再次点击')}</small></span>` : null}
              ${chosen ? html`<span class="spcard__confirm" role="status"><b>${t('已选择')}</b></span>` : null}
            </button>`;
          })}
        </div>
        ${mine.picked == null ? html`<div class="augov__bar">
          ${mine.canReroll ? html`<${Button} variant="secondary" size="sm" icon="refresh" disabled=${busy} onClick=${onReroll}>${t('刷新候选（同品质，本轮1次）')}<//>` : null}
          <${Button} variant="primary" size="sm" icon="check" data-testid="aug-confirm" disabled=${!armed || busy} onClick=${() => armed && onTap(armed)}>${t('确认选择')}<//>
        </div>` : null}
      </section>` : null}
      ${vote ? html`<section class="augov__sec augov__vote" aria-label=${t('敌人强化投票')}>
        ${mine ? html`<h3 class="augov__h">${t('敌人强化投票')}<small>${t('票数最多的强化生效；平票随机；可以改票')}</small></h3>` : null}
        <div class="ebvote__meta">
          ${vote.tier ? html`<span class=${cx('spcard__tag', `augcard__rar--r${vote.tier}`)}>${t('本次投票：{tier}', { tier: t(EB_TIER_NAME[vote.tier] || '') })}</span>` : null}
          ${vote.boss ? html`<span class="spcard__tag">${t('首领专场：只作用于领袖和领袖战，全额生效')}</span>` : null}
          ${vote.reverse ? html`<span class="spcard__tag ebvote__reverse">${t('逆反：本次票数最少的选项获胜')}</span>` : null}
        </div>
        <div class="spov__grid spov__grid--3">
          ${vote.options.map((id) => {
            const v = enemyBuffView(id);
            if (!v) return null;
            const voters = Object.entries(vote.votes || {}).filter(([, o]) => o === id).map(([pid]) => players.get(pid)).filter(Boolean);
            const mineVote = myVote === id;
            return html`<button key=${id} type="button" data-eb=${id} class=${cx('spcard', 'augcard', 'ebcard', `augcard--r${v.tier}`, 'is-pickable', mineVote && 'is-mine')}
                disabled=${busy} aria-pressed=${String(mineVote)} onClick=${() => onVote(id)} title=${`${v.name}\n${v.desc}`}>
              <span class="spcard__glow" aria-hidden="true"></span>
              <span class="spcard__head">
                <span class="spcard__icon"><${Img} src=${uiUrl(m, 'buffIcon/icon_enemy_debuff')} fallback=${html`<${GIcon} name="target" />`} /></span>
                <span class="spcard__title"><b class="spcard__name">${v.name}</b><span class="spcard__tags"><span class=${cx('spcard__tag', `augcard__rar--r${v.tier}`)}>${v.tierName}</span><span class="spcard__tag">${t('{n} 票', { n: voters.length })}</span></span></span>
              </span>
              <p class="spcard__desc">${v.desc}</p>
              ${voters.length ? html`<span class="ebcard__voters">${voters.map((p) => html`<${PlayerAvatar} key=${p.playerId} player=${p} size="sm" self=${p.playerId === myId} />`)}</span>` : null}
            </button>`;
          })}
        </div>
      </section>` : null}
      ${pub?.enemyBuffs?.length ? html`<p class="augov__now">${t('敌人已有的强化：')}${pub.enemyBuffs.map((id) => enemyBuffView(id)?.name).filter(Boolean).join('、')}</p>` : null}
    </div>
  </div>`;
}
