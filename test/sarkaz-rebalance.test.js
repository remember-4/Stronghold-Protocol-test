import {test} from 'node:test';import assert from 'node:assert/strict';
import {getData} from '../server/data.js';import {GameData} from '../server/match/gamedata.js';import {drawDisabledBonds,SharedPool} from '../server/match/pool.js';import {createRng} from '../server/sim/rng.js';
import {Match} from '../server/match/Match.js';import {makeBattle,enemyRec} from './helpers/battleHarness.js';
import {formatBondEffect} from '../public/js/ui/richText.js';import {shopBlockReason} from '../public/js/ui/gameLogic/shop.js';
const d=getData(),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const state=(active=true,layers=0,tier=1)=>({active,tier:active?tier:0,count:active?(tier===2?6:3):0,layers});
function field(ids,{active={},tier=1,layers=0}={}){const h=makeBattle({units:ids.map((chessId,i)=>({chessId,row:10,col:3+i*2})),bonds:{sarkazShip:state(active.sarkazShip!==false,layers,tier),steadShip:state(active.steadShip!==false),sargonShip:state(active.sargonShip!==false),elementShip:state(active.elementShip!==false)},defs:{enemies:{e:enemyRec({key:'e',hp:100,atk:0,speed:0})}},autoFinish:false});h.step();return {h,b:h.b,us:h.b.allyUnits.filter(u=>u.kind==='op')};}

test('Philae normal/elite skills independently add active Sargon6/12 and Element3/6 every cast',()=>{
 for(const suf of ['_a','_b'])for(const active of [{},{elementShip:false},{sargonShip:false}]){
  const {b,us}=field(['chess_char_3_06'+suf],{active});const n=suf==='_a'?1:2;
  b.emit('skillStart',{unit:us[0]});b.emit('skillStart',{unit:us[0]});
  near(b.players[0].bonds.sargonShip.layers,active.sargonShip===false?0:12*n);near(b.players[0].bonds.elementShip.layers,active.elementShip===false?0:6*n);assert.equal(b.errors.length,0);
 }
});
test('Hodrer adds each active bond6/12 only on first cast, including after redeployment',()=>{
 for(const suf of ['_a','_b'])for(const active of [{},{steadShip:false},{sarkazShip:false}]){
  const {b,us}=field(['chess_char_3_sarkaz_hodrer'+suf],{active}),u=us[0],n=suf==='_a'?6:12;
  b.emit('skillStart',{unit:u});b.emit('skillStart',{unit:u});b.loseHp(u,u.hp+1,{source:null});assert(b.redeploy(u));b.emit('skillStart',{unit:u});
  near(b.players[0].bonds.sarkazShip.layers,active.sarkazShip===false?0:n);near(b.players[0].bonds.steadShip.layers,active.steadShip===false?0:n);assert.equal(b.errors.length,0);
 }
});
test('Will gives one fixed RES per stack, fractional inheritance, retains on real redeployment, resets between battles',()=>{
 for(const tier of [1,2]){
  const {h,b,us}=field(['chess_char_1_05_a','chess_char_2_sarkaz_threye_a','chess_char_3_sarkaz_hodrer_a'],{tier,layers:100}),u=us[0];
  b.gainSarkazWill(u,3);const n=u.mem.sarkazWill;near(u.s.res-u.base.res,n);near(u.s.def/u.base.def,1+n*.035*(tier===2?2:1));
  b.loseHp(u,u.hp+1,{source:null});near(u.mem.sarkazWill,n);assert(b.redeploy(u));near(u.mem.sarkazWill,n+(tier===2?1:0));near(u.s.res-u.base.res,u.mem.sarkazWill);
  h.run(1.1);near(u.s.res-u.base.res,u.mem.sarkazWill);assert.equal(b.errors.length,0);
 }
 const fresh=field(['chess_char_1_05_a']);near(fresh.us[0].mem.sarkazWill||0,0);
});
test('Sarkaz tooltip resolves live layer coefficient and contains fixed RES/revival description',()=>{
 const b=d.bonds.sarkazShip;for(const [layers,pct] of [[0,'2.000%'],[1,'2.015%'],[100,'3.500%']]){const txt=formatBondEffect(b,layers);assert(txt.includes(pct));assert(!txt.includes('{0'));assert(!txt.includes('0.015×'));assert(txt.includes('1点法术抗性'));assert(txt.includes('复活或再部署保留'));}
});
test('Surtr actual credited enemy kills add +1/+2 active Sarkaz and Will; other killers do not',()=>{
 for(const suf of ['_a','_b']){
  const {h,b,us}=field(['chess_char_5_07'+suf,'chess_char_1_05_a']),u=us[0],n=suf==='_a'?1:2;
  assert.equal(u.def.raw.garrisonIds.length,2);
  for(let i=0;i<2;i++){const e=h.spawn('e',{pos:[12,9]});b.loseHp(e,e.hp+1,{source:u});}
  near(b.players[0].bonds.sarkazShip.layers,2*n);near(u.mem.sarkazWill,2);
  const e=h.spawn('e',{pos:[12,9]});b.loseHp(e,e.hp+1,{source:us[1]});near(b.players[0].bonds.sarkazShip.layers,2*n);assert.equal(b.errors.length,0);
 }
});
test('Wisdel both defaults are S2 and execute S2 kit correctly',()=>{
 for(const suf of ['_a','_b']){const c=d.chess['chess_char_6_sarkaz_wisdel'+suf];assert.equal(c.skill.index,1);assert.equal(c.skill.skillId,'skchr_wisdel_2');assert(c.skills.find(s=>s.index===1).isDefault);
  const {h,b,us}=field([c.chessId]);h.spawn('e',{pos:[10,5]});assert(us[0].skill.activate('test',{free:true}));h.run(2);assert.equal(b.errors.length,0);
 }
});
test('real merge reward remains free at -2 credit and UI matches server; paid insufficient rewards keep the offer',()=>{
 const m=new Match({data:d,mode:'solo',difficulty:'FUNNY',seed:16,seats:[{seat:0,playerId:'p',name:'P',connected:true}],send(){},broadcast(){},onEnd(){}});
 try{
  const ps=m.players.get('p');m.phase='PREP';ps.ready=false;
  ps.acquireChess('chess_char_3_sarkaz_closur_b',{fromPool:false});ps.funds=-2;
  const target=m.gd.visibleChess.find(id=>m.pool.has(id)&&m.gd.chess(id).tier===1);
  for(let i=0;i<3;i++)assert(ps.acquireChess(target));assert(ps.offers.length>0);const slot=ps.offers[0].slots[0];assert.equal(slot.price,0);
  assert.equal(shopBlockReason('reward',{priv:{alive:true,funds:-2,fundsFloor:-2,hand:[],handCap:8},editable:true,slot}),null);
  assert.deepEqual(ps.pickReward(0),{ok:true});assert.equal(ps.funds,-2);
  ps.offers=[{source:'test',slots:[{kind:'chess',id:target,price:1,sold:false}]}];assert.equal(ps.pickReward(0).error,'NO_FUNDS');assert.equal(ps.offers[0].slots[0].sold,false);
 }finally{m.dispose();}
});
test('ban draws add main/addon and two extra default operators; shared pool and seed stay consistent',()=>{
 for(const [difficulty,core,addon] of [['FUNNY',1,2],['NORMAL',4,5],['HARD',4,5],['ABYSS',4,5],['TRAINING',1,1]]){
  const gd=new GameData(d,'mode_multi_funny');gd.mode={...gd.mode,difficulty};
  const x=drawDisabledBonds(gd,createRng(1));assert.equal(x.drawn.filter(id=>gd.bond(id).isCore).length,core);assert.equal(x.drawn.filter(id=>!gd.bond(id).isCore).length,addon);
  const off=new Set([...x.drawn,...x.staticOff]);const natural=gd.visibleChess.filter(id=>gd.chess(id).bonds.length&&gd.chess(id).bonds.every(id=>off.has(id)));
  assert.equal(x.banned.length,natural.length+2);assert.equal(new Set(x.banned).size,x.banned.length);assert.deepEqual(x,drawDisabledBonds(gd,createRng(1)));
  const pool=new SharedPool(gd,{banned:x.banned});for(const id of x.banned){assert(!gd.chess(id).isDiy);assert(!pool.has(id));}
 }
});

import {ChessDetail} from '../public/js/ui/detailPanel.js';import {data as uiData} from '../public/js/data.js';
test('Surtr live detail includes both original and additional garrison blocks',()=>{
 const lookup=uiData.lookup,get=uiData.get;
 uiData.lookup=(name,id)=>d[name]?.[id]??null;uiData.get=name=>d[name]??null;
 try{for(const suf of ['_a','_b']){
  const c=d.chess['chess_char_5_07'+suf],root=ChessDetail({chess:c}),seen=[];
  function visit(n){if(Array.isArray(n)){n.forEach(visit);return;}if(!n||typeof n!=='object')return;if(n.props?.garrison)seen.push(n.props.garrison.garrisonId);visit(n.props?.children);}visit(root);
  assert(seen.includes('garrison_107'+suf));assert(seen.includes('garrison_sarkaz_surtr'+suf));
 }}finally{uiData.lookup=lookup;uiData.get=get;}
});
