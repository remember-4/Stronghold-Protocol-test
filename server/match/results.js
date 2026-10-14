// server/match/results.js — settlement (RESULT): per-player results, titles (评语), trophies and rewards
// (DESIGN §6.1, research 06 §10.4–§10.6, data/config.json titles/titleRule/trophies/rewards).
//
// roundsPassed (per player): eliminated in round k ⇒ k − 1; alive at the end ⇒ bossRound on a win (+1 when the
// Hidden Core was cleared), bossRound − 1 when the Final Assault was lost. Rewards and trophies follow each player's
// OWN rounds passed (research 06 §6 / §10.4): the Hidden-Core trophy row and a row's `victory` only for the players
// still in at the end — a teammate eliminated (or departed) earlier keeps the table value of its own rounds.
// Titles: every config.titles entry (with data/tuning.json `titles` overrides, gamedata.js) has { stat, rule:
// 'max'|'min', onlyOnWin? }. 'max' titles: candidates are the players with a positive stat, ranked high → low.
// 'min' titles (坚若磐石 "目标生命值损失最少" = least LP lost): every player still alive at the end is a candidate,
// ranked low → high (the eliminated lost everything). Candidates are ranked by the player's rank for that stat
// (0 = best), then by closeness to the best value, then title order, then seat; greedy assignment gives each player
// ≤ 1 title and uses each title ≤ once (config.titleRule [ASSUMED]).
// A6000 fork: the 节目称号 of the team 海克斯 (SHOW_TITLES, assignShowTitles) come after them, under the same rule, and
// only for the 海克斯 someone took this match.

import { bondList } from './bondsMeta.js';
import { boardOrder } from './board.js';
import { N_ } from '../../shared/i18n.js';

const STAT_OF = {
  bossDamage: (ps) => ps.stats.bossDamage,
  activatedLayers: (ps) => ps.activatedLayers(),
  lpRemaining: (ps) => (ps.alive ? Math.max(0, ps.lpAtFinal ?? ps.lp) : 0),
  lpLost: (ps) => Math.max(0, Number(ps.stats.lpLost) || 0),
  merges: (ps) => ps.stats.merges,
  itemsEquipped: (ps) => ps.stats.itemsEquipped,
  fundsSpent: (ps) => ps.stats.gold,
};

export function assignTitles(gd, players, victory) {
  const titles = Array.isArray(gd.titles) ? gd.titles : Array.isArray(gd.config.titles) ? gd.config.titles : [];
  const cands = [];
  titles.forEach((t, ti) => {
    if (!t || typeof t.stat !== 'string' || !Object.hasOwn(STAT_OF, t.stat)) return;
    if (t.onlyOnWin && !victory) return;
    if (t.rule === 'min') {
      const vals = players.filter((ps) => ps.alive).map((ps) => ({ ps, v: Math.max(0, Number(STAT_OF[t.stat](ps)) || 0) }));
      if (!vals.length) return;
      const best = Math.min(...vals.map((x) => x.v));
      const sorted = vals.slice().sort((a, b) => a.v - b.v);
      for (const { ps, v } of vals) cands.push({ ps, t, ti, rank: sorted.findIndex((x) => x.v === v), rel: (best + 1) / (v + 1) });
      return;
    }
    const vals = players.map((ps) => ({ ps, v: Number(STAT_OF[t.stat](ps)) || 0 }));
    const best = Math.max(0, ...vals.map((x) => x.v));
    if (best <= 0) return;
    const sorted = vals.slice().sort((a, b) => b.v - a.v);
    for (const { ps, v } of vals) {
      if (v <= 0) continue;
      const rank = sorted.findIndex((x) => x.v === v);
      cands.push({ ps, t, ti, rank, rel: v / best });
    }
  });
  cands.sort((a, b) => a.rank - b.rank || b.rel - a.rel || a.ti - b.ti || a.ps.seat - b.ps.seat);
  const out = new Map();
  const used = new Set();
  for (const c of cands) {
    if (out.has(c.ps.playerId) || used.has(c.t.id)) continue;
    out.set(c.ps.playerId, { id: c.t.id, name: c.t.name, picId: c.t.picId, text: c.t.text });
    used.add(c.t.id);
  }
  return out;
}

/**
 * A6000 fork, 节目称号 (海克斯第五版, the analysis §3.3 / §3.4 「称号」, §3.5): judged only when a player of the match took the
 * augment; each counts the player's `show:<key>` counter (match/augments.js teamShow, server/match/augments5/g4.js).
 * `name` / `text` are msgids (the result screen translates them; there is no config record).
 */
export const SHOW_TITLES = Object.freeze([
  { id: 'show_vampire', augment: 'aug_vampire', key: 'vampire', name: N_('吸血鬼'), text: N_('吸血次数最多') },
  { id: 'show_martyr', augment: 'aug_sacrifice', key: 'sacrifice', name: N_('烈士'), text: N_('献祭次数最多') },
  { id: 'show_robber', augment: 'aug_rob', key: 'rob', name: N_('劫匪'), text: N_('打劫次数最多') },
  { id: 'show_scapegoat', augment: 'aug_blame', key: 'blamed', name: N_('背锅侠'), text: N_('接锅最多') },
  { id: 'show_defuser', augment: 'aug_bomb', key: 'defuse', name: N_('拆弹专家'), text: N_('拆弹次数最多') },
  { id: 'show_human_bomb', augment: 'aug_bomb', key: 'boom', name: N_('人肉炸弹'), text: N_('炸弹在手里炸开次数最多') },
  { id: 'show_soul_swap', augment: 'aug_soul_swap', key: 'swap', name: N_('交换人生'), text: N_('和队友交换了人生') },
  { id: 'show_gambler', augment: 'aug_bet', key: 'bet', name: N_('赌神'), text: N_('打赌赢得最多') },
  { id: 'show_cover', augment: 'aug_cover_me', key: 'cover', name: N_('兜底王'), text: N_('联防兜底获得的资金最多') },
  { id: 'show_red_packet', augment: 'aug_red_packet', key: 'redpacket', name: N_('散财童子'), text: N_('发红包最多') },
  { id: 'show_cheer', augment: 'aug_cheer', key: 'cheer', name: N_('啦啦队长'), text: N_('给队友加油最多') },
  { id: 'show_relay', augment: 'aug_baton', key: 'baton', name: N_('最佳接力'), text: N_('持棒完美作战最多') },
  { id: 'show_dealer', augment: 'aug_sell_out', key: 'sellout', name: N_('奸商'), text: N_('卖队友最多') },
  { id: 'show_absorb', augment: 'aug_absorb', key: 'absorb', name: N_('吸功大师'), text: N_('吸走队友盟约层数次数最多') },
  { id: 'show_thief', augment: 'aug_pickpocket', key: 'pickpocket', name: N_('神偷'), text: N_('顺手牵羊最多') },
  { id: 'show_snipe', augment: 'aug_snipe', key: 'snipe', name: N_('截胡王'), text: N_('截胡最多') },
  { id: 'show_extort', augment: 'aug_extort', key: 'extort', name: N_('碰瓷专业户'), text: N_('碰瓷最多') },
  { id: 'show_racketeer', augment: 'aug_protection', key: 'protection', name: N_('地头蛇'), text: N_('收的保护费最多') },
  { id: 'show_life_swap', augment: 'aug_life_swap', key: 'lifeswap', name: N_('偷天换日'), text: N_('和队友换了命') },
  { id: 'show_mole', augment: 'aug_mole', key: 'mole', name: N_('内鬼'), text: N_('当了内鬼') },
  { id: 'show_steal_credit', augment: 'aug_steal_credit', key: 'credit', name: N_('抢功王'), text: N_('抢走队友的悬赏资金最多') },
  // 记仇的互动 (2026-10-11): whoever settled the most grudges — any 损人利己 海克斯 can (no single augment)
  { id: 'show_avenger', augment: null, key: 'revenge', name: N_('复仇者'), text: N_('报复队友次数最多') },
]);

/**
 * The 节目称号 after the official ones (`titles`: playerId → title, filled in place): a player with a title keeps it (the
 * official first), each 节目称号 goes to one player at most — the same greedy order as assignTitles (rank, closeness to
 * the best, the list's order, seat). A 节目称号 carries `show: true`.
 */
export function assignShowTitles(players, titles) {
  const held = new Set(players.flatMap((ps) => (Array.isArray(ps.augments) ? ps.augments : [])));
  const cands = [];
  SHOW_TITLES.forEach((t, ti) => {
    if (t.augment && !held.has(t.augment)) return;
    const vals = players.map((ps) => ({ ps, v: Number(ps.counters && ps.counters[`show:${t.key}`]) || 0 })).filter((x) => x.v > 0);
    if (!vals.length) return;
    const best = Math.max(...vals.map((x) => x.v));
    const sorted = vals.slice().sort((a, b) => b.v - a.v);
    for (const { ps, v } of vals) cands.push({ ps, t, ti, rank: sorted.findIndex((x) => x.v === v), rel: v / best });
  });
  cands.sort((a, b) => a.rank - b.rank || b.rel - a.rel || a.ti - b.ti || a.ps.seat - b.ps.seat);
  const used = new Set();
  for (const c of cands) {
    if (titles.has(c.ps.playerId) || used.has(c.t.id)) continue;
    titles.set(c.ps.playerId, { id: c.t.id, name: c.t.name, picId: null, text: c.t.text, show: true });
    used.add(c.t.id);
  }
  return titles;
}

function trophiesFor(gd, roundsPassed, hiddenCleared) {
  const tr = gd.config.trophies;
  if (!tr || gd.isSolo) return 0;
  let n = 0;
  if (Array.isArray(tr.byRoundsPassed)) {
    for (const row of tr.byRoundsPassed) {
      if (roundsPassed <= row.maxRound) { n = Number(row[gd.difficulty]) || 0; break; }
    }
  }
  if (hiddenCleared && tr.hiddenCore && Number.isFinite(tr.hiddenCore[gd.difficulty])) n = tr.hiddenCore[gd.difficulty];
  return n;
}

function rewardFor(gd, roundsPassed) {
  const rw = gd.config.rewards;
  if (!rw || !Array.isArray(rw.baseByRoundsPassed)) return 0;
  const row = rw.baseByRoundsPassed.filter((r) => r.round <= roundsPassed).pop();
  if (!row) return 0;
  const df = (rw.difficultyFactor && rw.difficultyFactor[gd.difficulty]) || 1;
  const mf = (rw.modeFactor && rw.modeFactor[gd.isSolo ? 'SINGLE' : 'MULTI']) || 1;
  return Math.round(row.count * df * mf);
}

/**
 * @param {import('./Match.js').Match} m
 * @param {{ victory: boolean, hiddenReached: boolean, hiddenCleared: boolean, reason: string }} outcome
 */
export function buildResult(m, outcome) {
  const gd = m.gd;
  const { victory, hiddenReached, hiddenCleared } = outcome;
  const players = [...m.players.values()].sort((a, b) => a.seat - b.seat);
  // the official titles, then the 节目称号 of the team 海克斯 taken this match (A6000 fork)
  const titles = assignShowTitles(players, assignTitles(gd, players, victory));
  const teamRounds = victory ? gd.bossRound + (hiddenCleared ? 1 : 0) : Math.max(0, Math.min(m.round, gd.bossRound) - 1);
  const rows = players.map((ps) => {
    const roundsPassed = !ps.alive && ps.eliminatedRound != null ? Math.max(0, ps.eliminatedRound - 1) : teamRounds;
    const lineup = boardOrder(ps.board).filter((x) => x.piece.kind === 'chess').map(({ r, c, piece }) => {
      const e = { id: piece.id, golden: gd.isGolden(piece.id), tier: gd.tierOf(piece.id), row: r, col: c, items: (piece.items || []).map((i) => i.id) };
      // 0.2.0 自选编队: a DIY slot's pick — the result screen names and draws the operator (shared/diy.js diyRecord)
      const pick = typeof ps.diyPickOf === 'function' ? ps.diyPickOf(piece.id) : null;
      if (pick) e.diy = { charId: pick.charId, skillIndex: pick.skillIndex, uniEquipId: pick.uniEquipId };
      // 0.2.0 补位: a chess this player fielded as its stand-in — the result screen draws the stand-in (the owner's recall
      // of the official mode, 2026-10-06); `standInFor` = the replaced operator's charId, like the sim's UnitInfo
      const si = typeof ps.fieldsStandIn === 'function' && ps.fieldsStandIn(piece.id) ? gd.standIn(piece.id) : null;
      if (si && si.standInFor) e.standInFor = si.standInFor;
      return e;
    });
    // the team's clear counts for the players still in; an eliminated / departed teammate did not pass the boss round
    const cleared = victory && ps.alive;
    return {
      playerId: ps.playerId,
      seat: ps.seat,
      name: ps.name,
      isBot: ps.isBot,
      left: ps.left,
      alive: ps.alive,
      victory: cleared,
      roundsPassed,
      eliminatedRound: ps.eliminatedRound,
      lp: Math.max(0, ps.lp),
      bandId: ps.bandId,
      lineup,
      bonds: bondList(gd, ps.bonds).filter((b) => b.active || b.layers > 0),
      stats: {
        dmgDealt: Math.round(ps.stats.dmgDealt), kills: ps.stats.kills, leaks: ps.stats.leaks, gold: ps.stats.gold,
        refreshes: ps.stats.refreshes, merges: ps.stats.merges, itemsEquipped: ps.stats.itemsEquipped,
        bossDamage: Math.round(ps.stats.bossDamage), activatedLayers: ps.activatedLayers(), lpLost: ps.stats.lpLost,
        perfectRounds: ps.stats.perfectRounds,
      },
      title: titles.get(ps.playerId) ?? null,
      trophies: trophiesFor(gd, roundsPassed, cleared && hiddenCleared),
      reward: rewardFor(gd, roundsPassed),
    };
  });
  return {
    t: 'm.result',
    victory,
    roundsPassed: teamRounds,
    hiddenReached,
    hiddenCleared,
    reason: outcome.reason,
    // the merged Final Assault pool (null before round 14); players[].lp are the alive players' shares of it
    teamLp: m.teamLp != null ? Math.max(0, Math.round(m.teamLp)) : null,
    modeId: m.modeId,
    difficulty: m.difficulty,
    stageId: m.stageId,
    bossId: m.bossId,
    hiddenBossId: m.hiddenBossId,
    seed: m.seed,
    durationMs: Math.max(0, m.sched.now() - m.startedAt),
    players: rows,
  };
}
