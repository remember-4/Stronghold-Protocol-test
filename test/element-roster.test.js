import {test} from 'node:test';import assert from 'node:assert/strict';
import {getData} from '../server/data.js';import {GameData} from '../server/match/gamedata.js';import {SharedPool} from '../server/match/pool.js';
import {makeBattle,enemyRec} from './helpers/battleHarness.js';import {HANDLERS} from '../server/sim/content/garrisons/meta.js';
import {inElementBurst,elementBondPolicy} from '../server/sim/elementState.js';
const d=getData({log:{info(){},warn(){},error(){}}});const gd=new GameData(d,'mode_multi_funny');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const state=(layers=0,active=true)=>({active,layers,tier:active?1:0,count:active?3:0});
function battle(id,layers=0,extra={}){const h=makeBattle({units:[{chessId:id,row:10,col:5}],bonds:{elementShip:state(layers),victoriaShip:state(0),swiftShip:state(0),...extra},defs:{enemies:{e:enemyRec({key:'e',hp:1e9,def:9999,res:90,speed:0})}},autoFinish:false});h.step();return {h,b:h.b,u:h.unit(id),e:h.spawn('e',{pos:[10,6]})};}
function meta(gid,hand=3,swift=true){const g=d.garrisons[gid];const layers={};const source={bb:g.bb,bbStr:g.bbStr,garrison:g,piece:{id:g.owners[0]}};const ctx={source,gd,chessRecord:id=>d.chess[id],hand:()=>Array.from({length:hand},()=>({kind:'chess'})),addLayers:(id,n,{requireActive}={})=>{if(requireActive&&id==='swiftShip'&&!swift)return 0;layers[id]=(layers[id]||0)+n;return n;},piece:()=>null};return {ctx,layers};}
test('new normal cards are in shared pool at tier 4/6; elite comes from merge; S3 and burn module resolve',()=>{
 const p=new SharedPool(gd);for(const [stem,tier] of [['chess_char_4_vvana',4],['chess_char_6_phatm2',6]]){
  assert.ok(p.has(stem+'_a'));assert.equal(p.entries.get(stem+'_a').tier,tier);assert.equal(p.has(stem+'_b'),false);assert.equal(gd.mergeCount(stem+'_a'),3);
  for(const suf of ['_a','_b']){const {b,u}=battle(stem+suf);assert.equal(b.errors.length,0);assert.ok(u.skill.id.endsWith('_3'));assert.deepEqual(d.chess[stem+suf].bonds,['victoriaShip','elementShip']);}
 }
 for(const suf of ['_a','_b']){const r=d.chess['chess_char_4_vvana'+suf];assert.equal(r.module.id,'uniequip_002_vvana');assert.ok(r.module.active);}
});
test('25+0.5*L percent: L0=125%, L40=145%, L100=175%; bars unchanged',()=>{
 for(const [l,m] of [[0,1.25],[40,1.45],[100,1.75]]){const {b,u,e}=battle('chess_char_2_05_a',l);near(b.dealDamage(u,e,{type:'elemental',amount:100}),100*m);near(b.dealDamage(u,e,{type:'element',element:'burn',amount:100}),100);}
});
test('Vivi attacks attach 15% ATK burn gauge, including normal and elite, not recursive module hits',()=>{
 for(const suf of ['_a','_b']){const {b,u,e}=battle('chess_char_4_vvana'+suf);const own=[];b.on('elementHit',c=>{if(c.dmg.tags?.includes('element:vvan'))own.push(c.dmg.amount);});b.dealDamage(u,e,{type:'arts',amount:10,isAttack:true});assert.equal(own.length,1);near(own[0],u.s.atk*.15);assert.ok(e.elem.burn>=own[0]);b.dealDamage(u,e,{type:'arts',amount:10,isAttack:false});assert.equal(own.length,1);}
});
test('Vivi gains +2/4 on real burn, caps each bond at 8/16; 40-layer cross-type event still obeys caps',()=>{
 for(const suf of ['_a','_b']){const {b,u,e}=battle('chess_char_4_vvana'+suf,40);const initial=40;const n=suf==='_a'?2:4;
  for(let i=0;i<8;i++)b.emit('elementBurst',{source:u,target:e,element:'apoptosis'});
  assert.equal(b.players[0].bonds.victoriaShip.layers,n*4);assert.equal(b.players[0].bonds.elementShip.layers,initial+n*4);
 }
 const {b,u,e}=battle('chess_char_4_vvana_a',0);b.emit('elementBurst',{source:u,target:e,element:'apoptosis'});assert.equal(b.players[0].bonds.elementShip.layers,0);
 b.emit('elementBurst',{source:u,target:e,element:'burn'});assert.equal(b.players[0].bonds.elementShip.layers,2);
});
test('Nymph original successful swift gain mirrors half into element; inactive swift grants neither',()=>{
 for(const [gid,swiftN,elementN] of [['garrison_56_a',6,3],['garrison_56_b',12,6]]){
  let {ctx,layers}=meta(gid);HANDLERS.SERVER_ADD_BOND_METHOD.run(ctx);assert.equal(layers.swiftShip,swiftN);assert.equal(layers.elementShip,elementN);
  ({ctx,layers}=meta(gid,3,false));HANDLERS.SERVER_ADD_BOND_METHOD.run(ctx);assert.deepEqual(layers,{});
 }
});
test('Blaze gain preserves original Yan/Victoria and adds +5/10 element, even inactive',()=>{
 for(const [gid,n] of [['garrison_35_a',5],['garrison_35_b',10]]){const {ctx,layers}=meta(gid);HANDLERS.SERVER_ADD_BOND.run(ctx);assert.deepEqual(layers,{yanShip:n,victoriaShip:n,elementShip:n});}
});
test('Virtuosa bonus +2 has exactly original successful trigger count and stops at original cap',()=>{
 for(const suf of ['_a','_b']){const {b,u}=battle('chess_char_6_09'+suf,0,{swiftShip:state(50),victoriaShip:state(0)});
  // One row member => original +1/+2, 10 successful starts => original +10/+20, extra element +20.
  for(let i=0;i<15;i++)b.emit('skillStart',{unit:u});
  assert.equal(b.players[0].bonds.swiftShip.layers,50+(suf==='_a'?10:20));assert.equal(b.players[0].bonds.elementShip.layers,20);
 }
});
test('Wine sums full pairs of each bond; normal 1%, elite 2%, and updates live after layers gained',()=>{
 for(const suf of ['_a','_b']){const {h,b,u}=battle('chess_char_6_phatm2'+suf,3,{victoriaShip:state(3)});const base=u.base.atk;const pct=suf==='_a'?.01:.02;near(u.s.atk,base*(1+2*pct));
  b.addLayers('p1','elementShip',1,'test');h.step();near(u.s.atk,base*(1+3*pct));
 }
});
test('Wine converts physical/arts/true HP damage before mitigation, preserves neural bar filling',()=>{
 const {b,u,e}=battle('chess_char_6_phatm2_a',0);
 for(const type of ['phys','arts','true'])near(b.dealDamage(u,e,{type,amount:100}),125);
 const before=e.elem.neural;near(b.dealDamage(u,e,{type:'element',element:'neural',amount:100}),100);near(e.elem.neural-before,100);
});
test('Wine fixed-card summon variants exist and resolve normal/elite stats',()=>{
 for(const suf of ['_a','_b']){const {b,u}=battle('chess_char_6_phatm2'+suf);for(const tk of u.def.raw.tokens){assert.ok(b.data.getToken(tk,u.def.id,u.def.loadout),tk);}}
});
test('new fixed-card S3 casts run real simulation, including Wine cages, without content errors',()=>{
 for(const id of ['chess_char_4_vvana_a','chess_char_4_vvana_b','chess_char_6_phatm2_a','chess_char_6_phatm2_b']){
  const {h,b,u,e}=battle(id,40);b.dealDamage(u,e,{type:'element',element:'neural',amount:e.gaugeMax});
  assert.ok(u.skill.activate('test',{free:true}),id);h.run(2);assert.equal(b.errors.length,0,id);
  if(id.includes('phatm2'))assert.ok(b.allyUnits.some(t=>t.kind==='token'&&t.defId==='token_10055_phatm2_mndclv'),id);
 }
});
test('Vivi cap is reached by repeated actual burn bursts as well as cross-type events',()=>{
 const {b,u,e}=battle('chess_char_4_vvana_a',0);
 for(let i=0;i<6;i++){if(e.findBuff('burnBurst'))b.removeBuff(e,'burnBurst');b.dealDamage(u,e,{type:'element',element:'burn',amount:e.gaugeMax});}
 assert.equal(b.players[0].bonds.elementShip.layers,8);assert.equal(b.players[0].bonds.victoriaShip.layers,8);
});
test('Clementia normal/elite are tier6 Egir/Element S3 cards; real erosion triggers three bombardments',()=>{
 const p=new SharedPool(gd);assert.ok(p.has('chess_char_6_clemnt_a'));assert.equal(p.entries.get('chess_char_6_clemnt_a').tier,6);
 for(const suf of ['_a','_b']){const {h,b,u,e}=battle('chess_char_6_clemnt'+suf,0);assert.deepEqual(u.def.raw.bonds,['egirShip','elementShip']);assert.equal(u.skill.id,'skchr_clemnt_3');const hits=[];b.on('damaged',c=>{if(c.dmg.tags?.includes('clemnt:bomb'))hits.push(c);});assert.ok(u.skill.activate('test',{free:true}));b.dealDamage(u,e,{type:'element',element:'erosion',amount:e.gaugeMax});h.run(2.7);assert.equal(b.errors.length,0);assert.equal(hits.filter(c=>c.type==='elemental').length,3);}
});
test('Clementia S3 also marks other real burst types at 40, but not below 40',()=>{
 for(const layers of [39,40]){const {h,b,u,e}=battle('chess_char_6_clemnt_a',layers);assert.ok(u.skill.activate('test',{free:true}));b.dealDamage(u,e,{type:'element',element:'neural',amount:e.gaugeMax});h.step();assert.equal(u.skill.ammoLeft,layers===40?9:10);assert.equal(b.errors.length,0);}
});
test('Clementia trait counts actual Egir knockouts including devour HP loss and own knockout, ignores non-Egir',()=>{
 for(const suf of ['_a','_b']){const h=makeBattle({units:[{chessId:'chess_char_6_clemnt'+suf,row:10,col:3},{chessId:'chess_char_6_04_a',row:10,col:5},{chessId:'chess_char_2_05_a',row:10,col:7}],bonds:{elementShip:state(0),egirShip:state(0,false)},autoFinish:false});h.step();const b=h.b,u=h.unit('chess_char_6_clemnt'+suf);const other=b.allyUnits.find(x=>x!==u&&x.def.raw.bonds.includes('egirShip'));assert.ok(other);b.loseHp(other,other.hp+1,{source:u,tags:['bond:egir:devour']});assert.equal(b.players[0].bonds.elementShip.layers,1);assert.equal(b.players[0].bonds.egirShip.layers,1);const non=b.allyUnits.find(x=>x.defId==='chess_char_2_05_a');b.loseHp(non,non.hp+1,{source:u});assert.equal(b.players[0].bonds.elementShip.layers,1);b.loseHp(u,u.hp+1,{source:u});assert.equal(b.players[0].bonds.elementShip.layers,2);assert.equal(b.errors.length,0);}
});
