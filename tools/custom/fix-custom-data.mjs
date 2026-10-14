// tools/custom/fix-custom-data.mjs — fixes to the data the custom rosters wrote (element-roster.mjs, then
// sarkaz-roster.mjs), applied when the friend's packages were merged into a6000; idempotent, run after those two:
//   node tools/custom/fix-custom-data.mjs
// - 凛视 (char_4102_threye, tools/custom/threye-unit.json): attackKind 'single' / projectile null are no data values
//   (melee / ranged / heal / none; arrow / bolt / orb / none): a 祭仪师 shoots arts bolts like 塑心 and 酒神 — ranged, bolt.
//   Her S2 strategy is the basic one (DEFAULT): ACTIVE_RANGE is only for a MANUAL skill whose attack range grows while
//   it runs (the owner's rule of 2026-10-05, server/sim/skills.js), and S2 keeps her y-2.
// - The summons of the operators the rosters made chess (酒神, 可露希尔, 维什戴尔): data/tokens.json keeps the chess
//   owners' variants only (chess-token.mjs); the 自选 owner forms stay in data/backups.json `tokens`.
// - 隐德来希's garrison_10 ("<进入休整期时>使自身已激活盟约层数+6"): on the board only, like 赫默's garrison_80 of the same
//   wording (bbStr conditionkey character_target_inboard; no "此干员在整备区时也有效") — it fired from the 整备区.
// - data/effects.json gets the effect records of the custom bonds, items and strategies (【元素】, 【萨卡兹】, 黑冠; the
//   萨卡兹 leaders 赫德雷 / 维什戴尔 / 特雷西娅 of the friend's 86ef19f2), in the shape the official ones have
//   (tools/build-data.mjs: a bond's effectName / effectDesc / buffs, bb ∪ bbStr as params; an item's own fields; a
//   strategy's BAND_INITIAL record with its desc), so every effectId resolves; a bond's record keeps the bond's text when
//   a package changes it (遗志's full-stack refresh, 86ef19f2) — every official record already matches its bond.
// - data/assets.json `stats` counts the entries the custom assets added (克莱门莎, 凛视 and their skill icons, the bonds).
// - data/bonds.json members: every non-golden chess of the bond, the hidden ones too (地灵, 锡人, 华法琳, ...), in natural
//   id order — the rule of tools/build-data.mjs (visibleMembers is the shop's subset); sarkaz-roster.mjs dropped the hidden.
// - An elite card is as visible as its normal card, as every official one is: the rosters left the elites of the chess
//   they added or showed (红豆, 5 本魔王, 6 本妮芙, the 元素 / 萨卡兹 additions) invisible.
import fs from 'node:fs';
import { statusKey } from '../../shared/standIn.js';
import { addChessToken } from './chess-token.mjs';

const read = (n) => JSON.parse(fs.readFileSync(new URL(`../../data/${n}.json`, import.meta.url)));
const write = (n, v) => fs.writeFileSync(new URL(`../../data/${n}.json`, import.meta.url), JSON.stringify(v) + '\n');
const chess = read('chess'), backups = read('backups'), tokens = read('tokens'), gars = read('garrisons');
const bonds = read('bonds'), items = read('items'), effects = read('effects'), assets = read('assets'), bands = read('bands');

const unitFile = new URL('./threye-unit.json', import.meta.url);
const unit = JSON.parse(fs.readFileSync(unitFile));
const fixThreye = (rec) => {
  rec.attackKind = 'ranged';
  rec.projectile = 'bolt';
  for (const s of [...(rec.skills || []), rec.skill].filter(Boolean)) {
    if (s.skillId === 'skchr_threye_2') s.trigger = { rule: 'DEFAULT', rawRule: 'DEFAULT', customRangeGrid: null };
  }
};
for (const form of Object.values(unit.forms)) fixThreye(form);
fs.writeFileSync(unitFile, JSON.stringify(unit) + '\n');
backups.units.char_4102_threye = unit;
for (const rec of Object.values(chess)) if (rec.charId === 'char_4102_threye') fixThreye(rec);

for (const [id, t] of Object.entries(tokens)) {
  if (![...(t.owners || []), ...Object.keys(t.variants || {})].some((k) => k.includes('@'))) continue;
  delete tokens[id];
  for (const rec of Object.values(chess)) {
    if ((rec.tokens || []).includes(id)) addChessToken(tokens, backups.tokens, id, rec, `${rec.charId}@${statusKey(rec.status)}`);
  }
  if (!tokens[id]) throw new Error(`${id}: no chess owner variant`);
}
for (const id of ['garrison_10_a', 'garrison_10_b']) gars[id].bbStr = { ...gars[id].bbStr, conditionkey: 'character_target_inboard' };
for (const rec of Object.values(chess)) if (rec.isGolden && chess[rec.baseId]) rec.visible = chess[rec.baseId].visible;
const naturalCmp = (a, b) => String(a).localeCompare(String(b), 'en', { numeric: true });
for (const [bid, b] of Object.entries(bonds)) {
  b.members = Object.values(chess).filter((c) => !c.isGolden && !c.isDiy && (c.bonds || []).includes(bid)).map((c) => c.chessId).sort(naturalCmp);
  b.visibleMembers = b.members.filter((id) => chess[id].visible);
}
write('chess', chess);
write('backups', backups);
write('tokens', tokens);
write('garrisons', gars);
write('bonds', bonds);

const buffsOf = (list) => (list || []).map((x) => ({ key: x.key, countType: x.countType ?? 'NONE', bb: x.bb ?? {}, bbStr: x.bbStr ?? {} }));
for (const b of Object.values(bonds)) {
  if (!b.effectId) continue;
  if (effects[b.effectId]) {
    Object.assign(effects[b.effectId], { name: b.effectName ?? b.name, desc: b.effectDesc ?? b.desc, descRaw: b.effectDescRaw ?? b.descRaw });
    continue;
  }
  effects[b.effectId] = {
    effectId: b.effectId, effectType: 'BOND', name: b.effectName ?? b.name, desc: b.effectDesc ?? b.desc, descRaw: b.effectDescRaw ?? b.descRaw,
    counterType: 'NONE', continuedRound: -1, decoIconId: null, enemyPrice: 0, buffs: buffsOf(b.buffs), params: { ...(b.bb || {}), ...(b.bbStr || {}) },
  };
}
for (const b of Object.values(bands)) {
  if (!b.effectId || effects[b.effectId]) continue;
  effects[b.effectId] = {
    effectId: b.effectId, effectType: 'BAND_INITIAL', name: b.effectName ?? b.name, desc: b.desc, descRaw: b.descRaw,
    counterType: 'NONE', continuedRound: -1, decoIconId: null, enemyPrice: 0, buffs: buffsOf(b.buffs), params: b.params ?? {},
  };
}
for (const it of Object.values(items)) {
  if (!it.effectId || effects[it.effectId]) continue;
  effects[it.effectId] = {
    effectId: it.effectId, effectType: it.itemType, name: it.effectName ?? it.name, desc: it.desc, descRaw: it.descRaw,
    counterType: 'NONE', continuedRound: it.duration ?? -1, decoIconId: null, enemyPrice: 0, buffs: buffsOf(it.buffs), params: it.params ?? {},
  };
}
fs.writeFileSync(new URL('../../data/effects.json', import.meta.url), JSON.stringify(effects)); // (as tools/build-data.mjs writes it: no final newline)

// (tools/fetch-assets.mjs countStats, the entries only: files / bytes are what was fetched)
const size = (o) => Object.keys(o || {}).length;
const spines = new Set();
for (const c of Object.values(assets.chars || {})) for (const sp of Object.values(c.spine || {})) spines.add(sp.skel);
for (const e of Object.values(assets.enemies || {})) if (e.spine) spines.add(e.spine.skel);
for (const t of Object.values(assets.tokens || {})) if (t.spine) spines.add(t.spine.skel);
Object.assign(assets.stats, {
  chars: size(assets.chars), charsWithBack: Object.values(assets.chars || {}).filter((c) => c.spine?.back).length,
  enemies: size(assets.enemies), enemiesWithSpine: Object.values(assets.enemies || {}).filter((e) => e.spine).length,
  tokens: size(assets.tokens), tokensWithSpine: Object.values(assets.tokens || {}).filter((t) => t.spine).length,
  spineModels: spines.size, bonds: size(assets.bonds), items: size(assets.items), bands: size(assets.bands), skills: size(assets.skills),
  modules: size(assets.modules), ui: size(assets.ui), sfxUnits: size(assets.audio?.sfx?.units), voiceChars: size(assets.audio?.voice),
});
fs.writeFileSync(new URL('../../data/assets.json', import.meta.url), JSON.stringify(assets, null, 1) + '\n');
