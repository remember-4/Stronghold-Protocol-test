// server/sim/content/kits/shared/opChess.js — an operator kit written the 自选 way (every skill under `skills`: the
// pick chooses any — kits/ops/op-<codename>.js) as the kit of a chess of the same operator (the friend's 元素 / 萨卡兹
// rosters made 薇薇安娜, 酒神, 可露希尔, 提丰, 维什戴尔, 赫德雷, 凛视 and 克莱门莎 chess): the chess's default skill under
// `skill`, the other skills under `skills` (the chess kit shape: content/index.js selectSkillSpec, tools/kit-coverage.mjs).
// The specs are the operator kit's own; an alternate one is built only when read.

/**
 * @param {(bb: object, chess: object, def: object) => object} opKit the operator's kit builder
 * @returns {(bb: object, chess: object, def: object) => object}
 */
export function chessKitOf(opKit) {
  return (bb, chess, def) => {
    const k = opKit(bb, chess, def);
    const src = k && k.skills && typeof k.skills === 'object' ? k.skills : null;
    const id = (chess?.skills || []).find((s) => s && s.isDefault)?.skillId ?? null;
    if (!src || !id || !Object.hasOwn(src, id)) return k;
    const skills = {};
    for (const sid of Object.keys(src)) if (sid !== id) Object.defineProperty(skills, sid, { enumerable: true, get: () => src[sid] });
    return { ...k, skill: src[id], skills };
  };
}
