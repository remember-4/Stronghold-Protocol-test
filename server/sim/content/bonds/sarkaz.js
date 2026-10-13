// Battle-only Will. Overflow refreshes doubling but is not emitted as an accepted stack gain.
import * as S from '../support/index.js';
const THERESA = 'band_custom_theresa';
export const SARKAZ = 'sarkazShip';
export function install(battle) {
  const unlimited = u => battle.getPlayer(u.ownerId)?.bandId === THERESA;
  const member = u => S.isOp(u) && u.side === 'ally' && S.isMember(battle, u, SARKAZ) && S.bondActive(battle, u.ownerId, SARKAZ);
  const living = pid => battle.allyUnits.filter(u => u.ownerId === pid && member(u) && S.onField(u));
  const limit = u => unlimited(u) ? Infinity : 30;
  const update = u => {
    const m = u.mem, stacks = Math.min(limit(u), m.sarkazWill || 0);
    const doubled = (m.sarkazDoubleUntil || 0) > battle.time;
    const pct = stacks * (.02 + .00015 * S.bondLayers(battle, u.ownerId, SARKAZ)) * (doubled ? 2 : 1);
    S.passiveBuff(battle, u, 'bond:sarkaz:will', S.directMods({ atk: pct, def: pct }, { resFlat: stacks }));
  };
  const queue = []; let draining = false, emittingPath = [];
  const gain = (u, n, reason = 'bond') => {
    if (!(n > 0) || !Number.isFinite(n) || !member(u) || !S.onField(u)) return;
    // An uncapped Crown network must not send its own derived gain back around a cycle.
    if (unlimited(u) && reason === 'blackCrown' && emittingPath.includes(u)) return;
    queue.push({ u, n, reason, path: [...emittingPath, u] });
    if (draining) return;
    draining = true;
    try {
      for (let i = 0; i < queue.length; i++) {
        const { u, n, reason, path } = queue[i];
        if (!member(u) || !S.onField(u)) continue;
        const before = u.mem.sarkazWill || 0, added = Math.max(0, Math.min(n, limit(u) - before));
        if (S.bondTier(battle, u.ownerId, SARKAZ) >= 2) u.mem.sarkazDoubleUntil = battle.time + 1;
        if (added > 1e-9) u.mem.sarkazWill = before + added;
        update(u);
        if (added > 1e-9) {
          emittingPath = path;
          battle.emit('sarkazWillGain', { unit: u, amount: added, reason });
          emittingPath = [];
        }
      }
    } finally { queue.length = 0; draining = false; emittingPath = []; }
  };
  battle.gainSarkazWill = gain;
  battle.on('tick', ({ dt }) => {
    for (const u of battle.allyUnits) {
      if (!member(u) || !S.onField(u)) continue;
      u.mem.sarkazAliveTime = (u.mem.sarkazAliveTime || 0) + dt;
      while (u.mem.sarkazAliveTime >= 5 - 1e-9) { u.mem.sarkazAliveTime -= 5; gain(u, 1, 'survival'); }
      update(u);
    }
  });
  battle.on('kill', ({ killer, victim }) => { if (member(killer) && S.onField(killer) && victim?.side === 'enemy') gain(killer, 1, 'kill'); });
  battle.on('deploy', ({ unit: u }) => {
    if (!member(u)) return;
    u.mem.sarkazAliveTime = 0; update(u);
    if (S.bondTier(battle, u.ownerId, SARKAZ) >= 2) for (const a of living(u.ownerId)) gain(a, 1, 'deploy');
  });
  battle.on('death', ({ unit: u, reason }) => {
    if (reason !== 'killed' || !S.isOp(u) || u.side !== 'ally') return;
    if (unlimited(u) && S.isMember(battle, u, SARKAZ)) S.gainLayers(battle, { playerId: u.ownerId, bonds: [SARKAZ], n: 1, requireActive: false, source: u, reason: 'band' });
    if (!member(u)) return;
    const allies = living(u.ownerId).filter(a => a !== u);
    if (S.bondTier(battle, u.ownerId, SARKAZ) >= 2) for (const a of allies) gain(a, 1, 'death');
    const n = u.mem.sarkazWill || 0;
    u.mem.sarkazAliveTime = 0; u.mem.sarkazDoubleUntil = 0; update(u);
    if (allies.length && n > 0) for (const a of allies) gain(a, n / allies.length, 'inherit');
  }, { priority: 30 });
}
