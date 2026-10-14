import { useState } from '../../vendor/hooks.module.js';
import { html, Button, Modal } from './components.js';
import { t } from '../../../shared/i18n.js';
import { AUGMENTS, RARITY_NAME } from '../../../shared/augments.js';
import { AUGMENT_SETS, setOf } from '../../../shared/augmentSets.js';
import { ENEMY_BUFFS, EB_TIER_NAME, ENEMY_SET_NAMES } from '../../../shared/enemyBuffs.js';

export function catalogEntries(side='player', {rarity=0,set='',query=''}={}) {
  const q=query.trim().toLocaleLowerCase();
  return (side==='enemy'?ENEMY_BUFFS:AUGMENTS.filter(d=>!d.pseudo)).map(d=>({...d,setId:side==='enemy'?d.set:setOf(d.id)}))
    .filter(d=>(!Number(rarity)||d.rarity===Number(rarity))&&(!set||(set==='none'?!d.setId:d.setId===set))&&(!q||`${t(d.name)} ${t(d.desc,d.params)}`.toLocaleLowerCase().includes(q)))
    .sort((a,b)=>a.rarity-b.rarity||t(a.name).localeCompare(t(b.name),'zh-CN')||a.id.localeCompare(b.id));
}
export function HexCatalogView({side='player',rarity=0,set='',query='',onSide=()=>{},onRarity=()=>{},onSet=()=>{},onQuery=()=>{}}) {
  const enemy=side==='enemy', names=enemy?EB_TIER_NAME:RARITY_NAME;
  const sets=enemy?Object.entries(ENEMY_SET_NAMES).map(([id,name])=>({id,name})):AUGMENT_SETS;
  const rows=catalogEntries(side,{rarity,set,query});
  return html`<div class=${enemy?'hexcat hexcat--enemy':'hexcat'}>
    <div class="hexcat__filters" role="group" aria-label=${t('海克斯筛选')}>
      <${Button} variant=${enemy?'ghost':'primary'} onClick=${()=>onSide('player')}>${t('我方海克斯')}<//>
      <${Button} variant=${enemy?'primary':'ghost'} onClick=${()=>onSide('enemy')}>${t('敌方海克斯')}<//>
      <label>${t('品质')} <select value=${rarity} onChange=${e=>onRarity(Number(e.currentTarget.value))}>
        <option value="0">${t('全部品质')}</option>${[1,2,3,4,5,6].map(r=>html`<option value=${r}>${t(names[r])}</option>`)}</select></label>
      <label>${t('套装')} <select value=${set} onChange=${e=>onSet(e.currentTarget.value)}>
        <option value="">${t('全部套装')}</option><option value="none">${t('无套装')}</option>${sets.map(s=>html`<option value=${s.id}>${t(s.name)}</option>`)}</select></label>
      <input type="search" value=${query} placeholder=${t('搜索名称或效果')} aria-label=${t('搜索海克斯')} onInput=${e=>onQuery(e.currentTarget.value)} />
    </div>
    <p class="hexcat__note">${t('共 {n} 项',{n:rows.length})} · ${enemy?t('敌方套装为查看分类标签，不额外产生套装加成。首领选项只在首领专场出现。'):t('包含通用、职业及领袖专属；显示内容与游戏使用同一份定义。')}</p>
    <div class="hexcat__list">${rows.map(d=>html`<article key=${d.id} class=${`hexcat__card hexcat__card--r${d.rarity}`}>
      <div class="hexcat__head"><b>${t(d.name)}</b><span>${t(names[d.rarity])}${d.boss?' · '+t('首领'):d.band?' · '+t('领袖专属'):d.cls?' · '+t('职业专精'):''}</span></div>
      <p>${t(d.desc,d.params)}</p><small>${t(sets.find(s=>s.id===d.setId)?.name||'无套装')}</small>
    </article>`)}</div>
    ${!rows.length?html`<p>${t('没有符合筛选条件的海克斯')}</p>`:null}
  </div>`;
}
export function HexCatalogButton() {
  const [open,show]=useState(false),[side,setSide]=useState('player'),[rarity,setRarity]=useState(0),[set,setSet]=useState(''),[query,setQuery]=useState('');
  return html`<${Button} variant="secondary" onClick=${()=>show(true)}>${t('海克斯查看')}<//>
    <${Modal} open=${open} onClose=${()=>show(false)} title=${t('海克斯图鉴')} micro="HEXTECH CATALOG" width="11rem">
      ${open?html`<${HexCatalogView} side=${side} rarity=${rarity} set=${set} query=${query}
        onSide=${v=>{setSide(v);setSet('');}} onRarity=${setRarity} onSet=${setSet} onQuery=${setQuery} />`:null}<//>`;
}
