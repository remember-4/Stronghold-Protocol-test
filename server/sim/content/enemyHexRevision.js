// Extra enemy options: visible rarity is separate from the legacy temporary-pool band.
import { ENEMY_BUFFS, LEADER_SHARE } from '../../../shared/enemyBuffs.js';
import { playerOps, passiveBuff } from './support/index.js';
const boss = e => e.isBoss || e.def?.rank === 'BOSS' || e.def?.raw?.rank === 'BOSS';
export function installEnemyHexRevision(b,counts) {
  const n=id=>counts.get(id)||0;
  b.on('enemySpawn',({enemy:e})=>{
    if(!e?.alive)return;
    for(const d of ENEMY_BUFFS){const k=n(d.id);if(!k||!d.revisionMods||d.boss&&!boss(e))continue;
      const share=d.boss?1:boss(e)?LEADER_SHARE:1, mods={};
      for(const [prop,value] of Object.entries(d.revisionMods)){
        if((prop==='hpMul'||prop==='hpRegenRatio')&&(boss(e)||e.bossPool))continue;
        mods[prop]=prop==='hpRegenRatio'?value*k*share:Math.pow(1+(value-1)*share,k);
      }
      passiveBuff(b,e,`enemyBuff:${d.id}`,mods);
    }
  });
  if(n('eb_n_slow'))for(const p of b.players)for(const u of playerOps(b,p.playerId))passiveBuff(b,u,'enemyBuff:eb_n_slow',{intervalMul:1.15**n('eb_n_slow')});
  if(n('eb_n_shatter')||n('eb_n_hunter'))b.on('hit',c=>{
    if(c.source?.side!=='enemy'||c.target?.side!=='ally')return;
    const f=c.target.s.flags, share=boss(c.source)?LEADER_SHARE:1;
    if(c.target.buffs.some(v=>v.shield>0||v.shieldHits>0))c.dmg.mul*=Math.pow(1+.35*share,n('eb_n_shatter'));
    if(['stun','freeze','sleep','bind','fear','levitate'].some(k=>f[k]))c.dmg.mul*=Math.pow(1+.4*share,n('eb_n_hunter'));
  });
}
