import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec } from './helpers/battleHarness.js';
import { inElementBurst, effectiveBurstRemaining, elementBondPolicy } from '../server/sim/elementState.js';
import { burstLocked } from '../server/sim/damage.js';
import { GameData } from '../server/match/gamedata.js';
import { computeBonds } from '../server/match/bondsMeta.js';
import { getData } from '../server/data.js';

const near = (a,b) => assert.ok(Math.abs(a-b)<1e-6, `${a} != ${b}`);
function setup(layers = 0, active = true, id = 'chess_char_5_03_a', loadout = {}) {
  const h=makeBattle({ units:[{chessId:id,row:10,col:5,...loadout}], bonds:{elementShip:{active,tier:active?1:0,count:active?2:1,layers}}, defs:{enemies:{elem_dummy:enemyRec({key:'elem_dummy',hp:1e9,atk:0,speed:0})}}, autoFinish:false });
  h.step(); const u=h.unit(id); const e=h.spawn('elem_dummy',{pos:[10,6]});
  assert.equal(h.b.errors.length,0); return {h,b:h.b,u,e};
}
const fill=(b,u,e,el='apoptosis') => b.dealDamage(u,e,{type:'element',element:el,amount:e.gaugeMax});

test('2 distinct members activate; duplicate normal/elite do not count twice; traits unchanged',()=>{
 const data=getData({log:{info(){},warn(){},error(){}}}); const gd=new GameData(data,'mode_multi_funny');
 const ps={board:new Map(),hand:[],bonds:{},bondLayers:{},augments:[]};
 const add=(key,id)=>ps.board.set(key,{uid:key,kind:'chess',id,items:[]});
 add(1,'chess_char_2_05_a');add(2,'chess_char_2_05_b');
 assert.equal(computeBonds(gd,ps).elementShip.active,false);
 add(3,'chess_char_3_06_a');assert.equal(computeBonds(gd,ps).elementShip.active,true);
 for(const c of Object.values(data.chess)) if(['哈洛德','菲莱','烛煌','妮芙','余','塑心'].includes(c.name)) assert.ok(c.bonds.includes('elementShip'));
});
test('active base effect: 100 elemental HP damage becomes 125, arts and gauge damage unchanged',()=>{
 const {b,u,e}=setup();near(b.dealDamage(u,e,{type:'elemental',amount:100}),125);
 near(b.dealDamage(u,e,{type:'arts',amount:100}),100);
 near(b.dealDamage(u,e,{type:'element',element:'burn',amount:100}),100);near(e.elem.burn,100);
});
test('inactive bond has no elemental bonus; allied target unaffected',()=>{
 let {b,u,e}=setup(100,false);near(b.dealDamage(u,e,{type:'elemental',amount:100}),100);
 ({b,u,e}=setup(100));near(b.dealDamage(e,u,{type:'elemental',amount:100}),100);
 fill(b,e,u,'burn');assert.equal(inElementBurst(b,u,'neural'),false);assert.equal(u.mem.elementBondEverBurst,undefined);
});
test('39 layers do not cross types; 40 layers recognise all types only during a real allied burst',()=>{
 const {b,u,e}=setup(39);fill(b,u,e);assert.ok(inElementBurst(b,e,'apoptosis'));assert.equal(inElementBurst(b,e,'burn'),false);
 b.players[0].bonds.elementShip.layers=40;assert.ok(inElementBurst(b,e,'burn'));assert.ok(inElementBurst(b,e,'neural'));
 assert.equal(e.findBuff('neuralBurst'),null);assert.equal(e.findBuff('palsy'),null);
 b.removeBuff(e,'apoptosisBurst');assert.equal(inElementBurst(b,e,'burn'),false);assert.equal(burstLocked(e),false);
});
test('100 layers keep virtual states without locking gauges; repeat neural bursts still grant palsy',()=>{
 const {b,u,e}=setup(100);fill(b,u,e,'neural');assert.ok(e.findBuff('neuralBurst'));
 const first=e.findBuff('neuralBurst');b.removeBuff(e,first);assert.equal(burstLocked(e),false);assert.equal(e.elem.neural,0);
 assert.equal(effectiveBurstRemaining(b,e,'burn'),Infinity);
 b.removeBuff(e,'palsy');e.hp=1e9;fill(b,u,e,'neural');assert.ok(e.findBuff('neuralBurst'));assert.equal(e.findBuff('palsy').stacks,3);
 assert.equal(b.players[0].bonds.elementShip.layers,100,'no automatic layers');
});
test('real burst damage receives base 25%: burn 7000 becomes 8750; pending grants no extra real types',()=>{
 const {b,u,e}=setup(0,true,'chess_char_2_05_a');const hp=e.hp;fill(b,u,e,'burn');near(hp-e.hp,8750);assert.equal(e.findBuff('apoptosisBurst'),null);
});
test('Blaze S3 extra elemental hit activates on apoptosis at 40, and after cooldown at 100',()=>{
 for(const layers of [39,40,100]) {
  const {b,u,e}=setup(layers);fill(b,u,e);if(layers===100)b.removeBuff(e,'apoptosisBurst');
  let extra=0;const stop=b.on('hit',c=>{if(c.dmg.tags?.includes('blazeBurn'))extra++;});
  b.dealDamage(u,e,{type:'arts',amount:10,isAttack:true,isSkill:true});
  assert.equal(extra,layers>=40?1:0,`layers ${layers}`);
 }
});
test('Blaze burst talent follows real events at 40: apoptosis triggers it once, virtual checks never retrigger it',()=>{
 const {b,u,e}=setup(100);let count=0;b.on('hit',c=>{if(c.dmg.tags?.includes('blazeMelt'))count++;});
 fill(b,u,e);assert.equal(count,1);for(let i=0;i<5;i++)inElementBurst(b,e,'burn');assert.equal(count,1);
 b.removeBuff(e,'apoptosisBurst');fill(b,u,e,'burn');assert.equal(count,2);
});
test('team bond uses highest active layers and one 75% multiplier, not compounded per player',()=>{
 const {b,u,e}=setup(40);b.players.push({playerId:'p2',bonds:{elementShip:{active:true,layers:100}}});
 near(b.dealDamage(u,e,{type:'elemental',amount:100}),175);assert.equal(elementBondPolicy(b).permanent,true);
});
test('Wine S3 speeds real neural cooldown, never apoptosis or permanent virtual state',()=>{
 const {b,u,e}=setup(100,true,'chess_char_5_diy1_a',{diy:{charId:'char_1042_phatm2',skillIndex:2,uniEquipId:null}});
 assert.equal(u.name,'酒神'); const tick=u.kit.skill.onTick;assert.equal(typeof tick,'function');
 // Inside his range; directly execute the actual selected skill's cooldown handler.
 e.x=u.x+1;e.y=u.y;
 fill(b,u,e,'apoptosis'); const a=e.findBuff('apoptosisBurst');const before=a.timeLeft;
 tick({battle:b,unit:u,dt:1});near(a.timeLeft,before);
 b.removeBuff(e,a);assert.ok(inElementBurst(b,e,'neural'));assert.equal(e.findBuff('neuralBurst'),null);
 tick({battle:b,unit:u,dt:1});assert.equal(burstLocked(e),false);
 fill(b,u,e,'neural');const n=e.findBuff('neuralBurst');const nBefore=n.timeLeft;tick({battle:b,unit:u,dt:1});assert.ok(n.timeLeft<nBefore);
});
test('Nymph soul ticks after true cooldown at 100, but ends at 40 when the actual burst ends',()=>{
 for(const layers of [40,100]) {
  const {b,u,e}=setup(layers,true,'chess_char_5_22_a');fill(b,u,e,'burn');
  b.dealDamage(u,e,{type:'arts',amount:10,isAttack:true});assert.ok(e.findBuff(`nymph:soul:${u.id}`));
  b.removeBuff(e,'burnBurst'); const soul=e.findBuff(`nymph:soul:${u.id}`);const hp=e.hp;
  soul.onTick({unit:e,buff:soul});if(layers===100)assert.ok(e.hp<hp);else {near(e.hp,hp);assert.equal(e.findBuff(soul.key),null);}
 }
});
test('no fabricated neural palsy on apoptosis even when virtually neural; permanent predicate ends if bond inactive',()=>{
 const {b,u,e}=setup(100);fill(b,u,e,'apoptosis');assert.equal(e.findBuff('palsy'),null);
 b.removeBuff(e,'apoptosisBurst');assert.ok(inElementBurst(b,e));b.players[0].bonds.elementShip.active=false;assert.equal(inElementBurst(b,e),false);
});
test('Mantra selected S1 deals elemental bonus to apoptosis at 40 and after cooldown at 100',()=>{
 for(const layers of [39,40,100]) {
  const {b,u,e}=setup(layers,true,'chess_char_5_diy1_a',{diy:{charId:'char_4204_mantra',skillIndex:0,uniEquipId:null}});
  fill(b,u,e);if(layers===100)b.removeBuff(e,'apoptosisBurst');let extra=0;
  b.on('hit',c=>{if(c.source===u&&c.dmg.type==='elemental'&&c.dmg.tags?.includes('mantra'))extra++;});
  u.kit.skill.attack.onHit({battle:b,unit:u,target:e});assert.equal(extra,layers>=40?1:0);
 }
});
test('live transition: an earlier burst is remembered when layers later reach 100',()=>{
 const {b,u,e}=setup(40);fill(b,u,e);b.removeBuff(e,'apoptosisBurst');assert.equal(inElementBurst(b,e),false);
 b.players[0].bonds.elementShip.layers=100;assert.ok(inElementBurst(b,e,'erosion'));assert.equal(burstLocked(e),false);
});
