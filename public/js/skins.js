// public/js/skins.js — A6000 fork: the outfit (时装) a player picks per operator in 干员调配 / 自选编队 (ui/skinPicker.js).
// Cosmetic only: kept in this browser (pref `skins`, charId → skin id), never sent to the server and never part of a
// battle; assets.js / ui/assetUrls.js swap the avatar, the portrait and the Front / Back battle models (and the owner's
// summon models, manifest tokens[].owner) for the outfit's (data/assets.json chars[].skins, tools/fetch-skins.mjs).
// A model that fails to load falls back to the original one (spineEntry `fallback`). docs/SKINS.md.
import { createStore, loadPref, savePref } from './store.js';

const stored = loadPref('skins', {});
export const skinStore = createStore({ choices: stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {} });
const baseId = (id) => typeof id === 'string' ? id.replace(/_(1|2)$/, '') : '';

export function skinOptions(manifest, id) {
  const skins = manifest?.chars?.[baseId(id)]?.skins;
  if (!skins || typeof skins !== 'object') return [];
  return Object.entries(skins).filter(([, s]) => s && typeof s.name === 'string' &&
    typeof s.avatar === 'string' && typeof s.portrait === 'string' && s.spine?.front?.skel)
    .map(([skinId, s]) => ({ ...s, id: skinId }));
}

export function selectedSkin(manifest, id, choices = skinStore.get().choices) {
  const skinId = choices?.[baseId(id)];
  return skinId ? skinOptions(manifest, id).find((s) => s.id === skinId) || null : null;
}

export function setSkin(manifest, id, skinId) {
  const charId = baseId(id);
  if (!manifest?.chars?.[charId] || (skinId && !skinOptions(manifest, charId).some((s) => s.id === skinId))) return false;
  const choices = { ...skinStore.get().choices };
  if (skinId) choices[charId] = skinId;
  else delete choices[charId];
  savePref('skins', choices);
  skinStore.set({ choices });
  return true;
}

const fallbackEntries = new WeakMap();
export function skinSpine(manifest, id, back = false) {
  const token = manifest?.tokens?.[id];
  const skin = selectedSkin(manifest, token?.owner || id);
  const entry = token ? skin?.tokens?.[id]?.spine :
    skin && (back ? skin.spine.back || skin.spine.front : skin.spine.front);
  if (!entry) return null;
  const original = manifest?.chars?.[baseId(id)]?.spine;
  const fallback = token ? token.spine : back ? original?.back || original?.front : original?.front;
  let cached = fallbackEntries.get(entry);
  if (!cached || cached.fallback !== fallback) {
    cached = { ...entry, fallback };
    fallbackEntries.set(entry, cached);
  }
  return cached;
}
