// Spreadsheet revision: hooks are installed per owner, and generated damage cannot recursively proc itself.
import { playerOps, passiveBuff, bodyDist, inRange } from '../support/index.js';
const own = (u, pid) => u?.kind === 'op' && u.ownerId === pid;
const key = id => `augment:${id}`;
const proc = d => d?.tags?.includes('hexRevisionProc');
const damage = (b,s,t,amount,type='arts') => b.dealDamage(s,t,{amount,type,tags:['hexRevisionProc'],isSkill:true});
const healSelf = (b,u,n) => { if(u?.alive && n>0) b.heal(u,u,n,{self:true,hexProc:true}); };
const buffAll = (b,pid,id,mods,extra) => {for(const u of playerOps(b,pid)) passiveBuff(b,u,key(id),mods,extra);};
const timed = (b,u,k,mods,duration) => b.addBuff(u,{key:k,mods,duration,refresh:'replace'});
const BATTLE = {
  aug_u_sword(b,ps,id) {
    buffAll(b,ps.playerId,id,{atkMul:1.24,hpMul:1.24,aspd:20},{flags:{hexMeleeRange:true}});
    b.on('damaged',c=>{if(own(c.source,ps.playerId)&&c.target?.side==='enemy'&&c.type!=='element') healSelf(b,c.source,c.amount*.2);});
  },
  aug_u_deathcry(b,ps,id) {
    b.on('death',({unit:u,reason,dying})=>{if(!own(u,ps.playerId)||(reason!=='killed'&&!dying))return;for(const e of b.enemies) if(e.alive&&bodyDist(e,u.x,u.y)<=1.5) timed(b,e,key(id),{dmgTakenMul:1.2},5);});
  },
  aug_u_basics(b,ps,id) {buffAll(b,ps.playerId,id,{atkMul:2,aspd:50},{flags:{hexNoSkill:true}});},
  aug_u_burn_income(b,ps) {
    let n=0;
    b.on('elementBurst',({source,target,element})=>{
      if(element!=='burn'||target?.side!=='enemy'||n>=3)return;
      n++;b.addCoins(ps.playerId,1);const pp=b._pp(ps.playerId);if(pp)pp.hexBurnCoins=(pp.hexBurnCoins||0)+1;
    });
  },
  aug_u_wind_blessing(b,ps,id) {
    const grant=u=>{if(own(u,ps.playerId))timed(b,u,key(id),{physTakenMul:.65,artsTakenMul:.65},5);};
    b.on('heal',c=>{if(c.amount>0)grant(c.target);}); b.on('shieldGain',c=>grant(c.unit));
  },
  aug_u_inferno(b,ps,id) {
    let serial=0;
    b.on('damaged',c=>{
      const s=c.source,t=c.target;
      if(!own(s,ps.playerId)||!s.skill?.active||t?.side!=='enemy'||!t.alive||!(c.amount>0)||c.type==='element'||proc(c.dmg))return;
      const amount=10+s.s.atk*.028;
      b.addBuff(t,{key:`${key(id)}:${serial++}`,duration:3.01,interval:1,source:s,
        onTick:()=>{if(t.alive)damage(b,s,t,amount);}});
    });
  },
  aug_u_soul_siphon(b,ps,id) {
    b.on('hit',c=>{if(own(c.source,ps.playerId)&&c.dmg.isAttack&&!proc(c.dmg)&&b.rng()<.1){c.dmg.mul*=2;c.dmg.tags=[...c.dmg.tags,key(id)];}});
    b.on('damaged',c=>{if(own(c.source,ps.playerId)&&c.dmg?.tags?.includes(key(id)))healSelf(b,c.source,c.amount*.1);});
  },
  aug_u_homeguard(b,ps,id) {
    const until=new Map();buffAll(b,ps.playerId,id,{aspd:40});
    b.on('damaged',c=>{if(own(c.target,ps.playerId)&&c.amount>0&&c.type!=='element'){until.set(c.target,b.time+6);b.removeBuff(c.target,key(id));}});
    b.on('tick',()=>{for(const [u,t] of until)if(b.time>=t){passiveBuff(b,u,key(id),{aspd:40});until.delete(u);}});
  },
  aug_u_redeploy_hero(b,ps,id) {
    const counts=new Map();b.on('deploy',({unit:u,initial})=>{if(!own(u,ps.playerId)||initial)return;
      const n=Math.min(5,(counts.get(u)||0)+1);counts.set(u,n);passiveBuff(b,u,key(id),{physTakenMul:1-.12*n,resFlat:6*n});});
  },
  aug_u_dualstrike(b,ps) {
    b.on('attack',({attacker:u})=>{if(!own(u,ps.playerId))return;
      const es=b.enemies.filter(e=>e.alive&&!e.hidden&&inRange(u,e));if(es.length)damage(b,u,es[Math.floor(b.rng()*es.length)],u.s.atk*.4,u.dmgType||'phys');});
  },
  aug_u_escape(b,ps,id) {
    b.on('damaged',({target:u,amount,type})=>{
      if(!own(u,ps.playerId)||type==='element'||!u.alive||u.hp<=0||u.hp/u.s.maxHp>.35||u.hp+amount<=u.s.maxHp*.35)return;
      const unblock=()=>{if(u.alive&&u.deployed)b.addBuff(u,{key:`${key(id)}:unblock`,flags:{unblockable:true},duration:10,refresh:'replace'});};
      b.addBuff(u,{key:key(id),shield:u.s.maxHp*.3,duration:5,onRemove:unblock,onExpire:unblock});
    });
  },
  aug_u_steadfast(b,ps,id) {
    const add=u=>{if(own(u,ps.playerId))passiveBuff(b,u,key(id),{physTakenMul:.88,resFlat:5});};
    b.on('skillStart',({unit:u})=>add(u));b.on('skillEnd',({unit:u})=>{if(own(u,ps.playerId))b.removeBuff(u,key(id));});
  },
  aug_u_infinite_sp(b,ps,id) {
    const counts=new Map();buffAll(b,ps.playerId,id,{spRecoveryMul:1.3});
    b.on('kill',({killer:u,victim})=>{if(!own(u,ps.playerId)||!u.skill?.active||victim?.side!=='enemy')return;
      const n=(counts.get(u)||0)+1;counts.set(u,n);passiveBuff(b,u,key(id),{spRecoveryMul:1.3+.03*n});});
  },
  aug_u_arts_juice(b,ps) {b.on('damaged',c=>{if(own(c.source,ps.playerId)&&c.target?.side==='enemy'&&c.type==='arts')healSelf(b,c.source,c.amount*.03);});},
  aug_u_deploy_shield(b,ps,id) {b.on('deploy',({unit:u})=>{if(own(u,ps.playerId))b.addBuff(u,{key:key(id),shield:u.s.atk*1.2,duration:4,refresh:'replace'});});},
  aug_u_heavy_hit(b,ps) {b.on('attack',({attacker:u,targets,isSkill})=>{if(!own(u,ps.playerId)||isSkill)return;for(const t of targets||[])if(t.side==='enemy')damage(b,u,t,u.s.maxHp*.07,'phys');});},
  aug_u_death_ring(b,ps,id) {
    for(const u of playerOps(b,ps.playerId))if(u.def?.profession==='MEDIC'||u.def?.raw?.profession==='MEDIC')passiveBuff(b,u,key(id),null,{flags:{hexFullHeal:true}});
    let reflecting=false;
    b.on('heal',c=>{
      if(reflecting||c.opts?.hexProc||!(c.amount>0))return;
      const s=c.source||c.target;if(s?.ownerId!==ps.playerId)return;
      const es=b.enemies.filter(e=>e.alive&&!e.hidden&&bodyDist(e,c.target.x,c.target.y)<=1.5).sort((a,z)=>bodyDist(a,c.target.x,c.target.y)-bodyDist(z,c.target.x,c.target.y)||String(a.id).localeCompare(String(z.id)));
      if(es.length){reflecting=true;try{damage(b,s,es[0],c.amount*.7);}finally{reflecting=false;}}
    });
  },
};
export function install(b,ps,id) {if(BATTLE[id]){BATTLE[id](b,ps,id);return true;}return id==='aug_u_exchange'||id==='aug_u_choice_reroll';}
export function installMedic(b,ps) {b.on('heal',c=>{if(own(c.target,ps.playerId)&&c.amount>0)timed(b,c.target,'augment:aug_medic:protection',{dmgTakenMul:.9},3);});}
function exchange(ctx){const k='aug:user:exchange:done';if(ctx.counter(k)||ctx.phase!=='PREP')return;ctx.setCounter(k,1);ctx.exchangeFundsLife();}
export const META=Object.freeze({aug_u_exchange:()=>({onAugmentPick:exchange,onPrepStart:exchange})});
