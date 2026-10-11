// public/js/screens/game/marks.js — class-name join and the field highlight styles the match screen passes to the view.

export const cx = (...p) => p.flat().filter(Boolean).join(' ');

export const HUD_HZ_MS = 200;

/** Range tiles of the selected unit (its own highlight group: the wheel's 'facing' group may be up at the same time). */
export const SEL_RANGE = Object.freeze({ group: 'selRange', color: 0xff9c33, fill: 0.3, line: 0.95 });

/** The tile an armed merge-completing card's elite will take (its own group; gold like the promotion cue, render/fx.js). */
export const MERGE_HL = Object.freeze({ group: 'mergeTile', color: 0xffd45a, fill: 0.34, line: 1 });

/** 海克斯·风水宝地: the board tiles the own effects mark this round (its own group; the merge tile's gold). */
export const BOARD_MARK_HL = Object.freeze({ group: 'boardMarks', color: 0xffd45a, fill: 0.34, line: 1 });

/**
 * The board tiles ([row, col], no repeats) the own effects mark this round — m.private effects[].boardTiles (server
 * player/views.js effectsView: 风水宝地's tiles, server/match/augments5/g10.js); [] without any.
 */
export function effectBoardTiles(priv) {
  const out = [];
  const seen = new Set();
  for (const e of Array.isArray(priv?.effects) ? priv.effects : []) {
    for (const t of Array.isArray(e?.boardTiles) ? e.boardTiles : []) {
      if (!Array.isArray(t) || !Number.isInteger(t[0]) || !Number.isInteger(t[1]) || seen.has(`${t[0]},${t[1]}`)) continue;
      seen.add(`${t[0]},${t[1]}`);
      out.push([t[0], t[1]]);
    }
  }
  return out;
}
