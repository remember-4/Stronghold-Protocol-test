// tools/custom/chess-token.mjs — a 自选 operator's summon (data/backups.json `tokens`) made a chess owner's summon
// (data/tokens.json) when the custom rosters (element-roster.mjs, sarkaz-roster.mjs) turn the operator into a chess.
// The 自选 variant (keyed by the owner form `<charId>@<statusKey>`, tools/build-data.mjs buildDiyTokens) is the token
// under the form's FIRST skill and no module, `bySkill` per other skill, `byModule` per module of the form; a chess
// owner's (keyed by the chess id, buildTokens — DESIGN §16, DATA.md §14) is the token under the chess's DEFAULT skill and
// module, `bySkill` per other skill, `byModule` per other module and 'none'. Same numbers, re-based.

/** The chess-owner variant of a 自选 variant `v` for the chess record `chess`. */
export function chessTokenVariant(v, chess) {
  const idx = (chess.skills || []).map((s) => s.index);
  const def = (chess.skills || []).find((s) => s.isDefault)?.index ?? idx[0];
  const first = idx.find((i) => !Object.hasOwn(v.bySkill || {}, String(i))) ?? def;
  const part = (i) => (i === first ? { skill: v.skill, count: v.count, sources: v.sources } : v.bySkill?.[i] ?? null);
  const out = { ...v, ...(part(def) || {}) };
  delete out.bySkill;
  delete out.byModule;
  const alts = idx.filter((i) => i !== def && part(i));
  if (alts.length) out.bySkill = Object.fromEntries(alts.map((i) => [i, part(i)]));
  const mod = chess.isGolden && chess.module?.active ? chess.module.id : null;
  if (mod && v.byModule?.[mod]) {
    const none = { stats: v.stats, immunities: v.immunities, trait: v.trait, talents: v.talents };
    Object.assign(out, v.byModule[mod]);
    out.byModule = {};
    for (const m of chess.modules || []) if (!m.isDefault && v.byModule[m.uniEquipId]) out.byModule[m.uniEquipId] = v.byModule[m.uniEquipId];
    out.byModule.none = none;
  }
  return structuredClone(out);
}

/**
 * Give `tokens[tokenId]` (data/tokens.json) the variant of the chess `chess` from the 自选 record `diyTokens[tokenId]`
 * (its owner form `formKey`): the record starts as a copy of the 自选 one without its 自选 owners, `owners` = the chess
 * ids of its variants, the record defaults = its first owner's variant (tools/build-data.mjs summonRecord). False when
 * the 自选 data has no such variant.
 */
export function addChessToken(tokens, diyTokens, tokenId, chess, formKey) {
  const src = diyTokens?.[tokenId], v = src?.variants?.[formKey];
  if (!v) return false;
  const rec = tokens[tokenId] ??= structuredClone(src);
  rec.variants = Object.fromEntries(Object.entries(rec.variants || {}).filter(([k]) => !k.includes('@')));
  rec.variants[chess.chessId] = chessTokenVariant(v, chess);
  rec.owners = Object.keys(rec.variants);
  const f = rec.variants[rec.owners[0]];
  Object.assign(rec, {
    stats: f.stats, rangeGrid: f.rangeGrid, dmgType: f.dmgType, attackKind: f.attackKind, projectile: f.projectile, canHitFly: f.canHitFly,
    skill: f.skill ? { skillId: f.skill.skillId, bb: f.skill.bb } : null, deployLimit: f.stats?.deployLimit ?? 1, count: f.count,
  });
  return true;
}
