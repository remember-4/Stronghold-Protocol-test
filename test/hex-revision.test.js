import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeBattle,chessRec,enemyRec} from './helpers/battleHarness.js';
import {AUGMENTS,augmentDef} from '../shared/augments.js';
import {ENEMY_BUFFS,enemyBuffDef,enemyBuffSettings,isEnemyBuffSettings,rollVoteOptions,rollVoteTier} from '../shared/enemyBuffs.js';
import {Match} from '../server/match/Match.js';
import {getData} from '../server/data.js';
import {catalogEntries,HexCatalogView} from '../public/js/ui/hexCatalog.js';
import {EnemyBuffEditor} from '../public/js/ui/enemyBuffSettings.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
function setup(ids=[],opts={}){
 const rec=chessRec({id:'tester',rangeGrid:[[0,0],[0,1],[0,2]],...opts.rec});
 const h=makeBattle({units:[{chessId:'tester',row:10,col:5}],defs:{chess:{tester:rec},enemies:{e:enemyRec({key:'e',hp:1e8,speed:0,atk:opts.enemyAtk||0}),boss:enemyRec({key:'boss',rank:'BOSS',hp:1e8,speed:0})}},playerEffects:ids.map(id=>({key:`augment:${id}`,params:augmentDef(id).params})),autoFinish:false,flags:opts.flags||{}});
 h.step();const u=h.unit('tester'),e=h.spawn('e',{pos:[10,6]});return{h,b:h.b,u,e};
}
const hit=(b,s,t,n=100,type='arts',more={})=>b.dealDamage(s,t,{amount:n,type,canDodge:false,...more});
function match(settings={}){const m=new Match({data:getData(),mode:'coop',difficulty:'FUNNY',seed:77,seats:[0,1,2].map(i=>({seat:i,playerId:`p${i}`,name:`P${i}`,connected:true})),send(){},broadcast(){},onEnd(){},enemyBuffs:settings});return m;}

test('spreadsheet removes 3 cards, adds 19 and regrades all exclusive II purple',()=>{
 assert.equal(AUGMENTS.filter(d=>!d.pseudo).length,390);assert.equal(AUGMENTS.filter(d=>d.id.startsWith('aug_u_')).length,19);
 for(const id of ['aug_reserve_dp','aug_budget','aug_x_pith3'])assert.equal(augmentDef(id),null);
 assert.equal(AUGMENTS.filter(d=>d.band&&d.tier===2).length,29);assert(AUGMENTS.filter(d=>d.band&&d.tier===2).every(d=>d.rarity===4));
});
test('wind blessing: initial deployment shield, refresh not compound, expires, true damage unaffected',()=>{
 const {h,b,u,e}=setup(['aug_u_wind_blessing','aug_u_deploy_shield']);near(u.s.physTakenMul,.65);near(u.s.artsTakenMul,.65);
 b.removeBuff(u,'augment:aug_u_deploy_shield');near(hit(b,e,u,100,'true'),100);near(hit(b,e,u),65);
 h.run(3);b.heal(u,u,10);near(u.s.artsTakenMul,.65);h.run(3);near(u.s.artsTakenMul,.65);h.run(2.1);near(u.s.artsTakenMul,1);assert.deepEqual(b.errors,[]);
});
test('medic adjusted healing creates refreshed three-second damage reduction',()=>{
 const {h,b,u,e}=setup(['aug_medic']);u.hp-=500;b.heal(u,u,100);near(u.s.healingDealtMul,1.3);near(u.s.dmgTakenMul,.9);h.run(3.1);near(u.s.dmgTakenMul,1);
});
test('sword changes visible and combat range; stats, life steal; basics blocks active skill',()=>{
 const {b,u,e}=setup(['aug_u_sword']);near(u.s.atk/u.base.atk,1.24);near(u.s.maxHp/u.base.maxHp,1.24);near(u.s.aspd-u.base.aspd,20);
 assert.deepEqual(u.liveRangeGrid,[[0,1]]);assert.equal(u.rangeKeys.length,1);u.hp-=100;const hp=u.hp;hit(b,u,e);near(u.hp-hp,20);
 const x=setup(['aug_u_basics']);x.u.skill.sp=1000;assert.equal(x.u.skill.activate(),false);near(x.u.s.atk/x.u.base.atk,2);near(x.u.s.aspd-x.u.base.aspd,50);
});
test('homeguard loses ASPD after damage and refreshes six seconds from most recent hit',()=>{
 const {h,b,u,e}=setup(['aug_u_homeguard']);near(u.s.aspd-u.base.aspd,40);hit(b,e,u,10);near(u.s.aspd-u.base.aspd,0);h.run(4);hit(b,e,u,10);h.run(3);near(u.s.aspd-u.base.aspd,0);h.run(3.1);near(u.s.aspd-u.base.aspd,40);
});
test('redeploy hero ignores initial deployment, includes teleport, caps five and persists',()=>{
 const {b,u}=setup(['aug_u_redeploy_hero']);near(u.s.res,0);for(let i=0;i<8;i++)b.emit('deploy',{unit:u,initial:false});near(u.s.res,30);near(u.s.physTakenMul,.4);b.emit('deploy',{unit:u,initial:true});near(u.s.res,30);
});
test('steadfast lasts skill active time, infinite-SP kill increments only during skill',()=>{
 const {b,u,e}=setup(['aug_u_steadfast','aug_u_infinite_sp']);near(u.s.spRecovery,1.3);u.skill.active=true;b.emit('skillStart',{unit:u});near(u.s.res,5);near(u.s.physTakenMul,.88);
 b.emit('kill',{killer:u,victim:e});near(u.s.spRecovery,1.33);u.skill.active=false;b.emit('skillEnd',{unit:u});near(u.s.res,0);near(u.s.physTakenMul,1);b.emit('kill',{killer:u,victim:e});near(u.s.spRecovery,1.33);
});
test('inferno independent stacks tick exactly three times, never recursively grow',()=>{
 const {h,b,u,e}=setup(['aug_u_inferno']);b.addBuff(u,{key:'testdisarm',flags:{disarm:true},persist:true});u.skill.active=true;
 hit(b,u,e);hit(b,u,e);const hp=e.hp;h.run(3.2);near(hp-e.hp,6*(10+u.s.atk*.028));assert.equal(e.buffs.filter(x=>x.key.startsWith('augment:aug_u_inferno:')).length,0);assert.deepEqual(b.errors,[]);
});
test('heavy hit, dualstrike, crit and arts healing use actual battle damage',()=>{
 let x=setup(['aug_u_heavy_hit']);let hp=x.e.hp;x.b.emit('attack',{attacker:x.u,targets:[x.e],isSkill:false});near(hp-x.e.hp,x.u.s.maxHp*.07);hp=x.e.hp;x.b.emit('attack',{attacker:x.u,targets:[x.e],isSkill:true});near(hp-x.e.hp,0);
 x=setup(['aug_u_dualstrike']);hp=x.e.hp;x.b.emit('attack',{attacker:x.u,targets:[x.e],isSkill:false});near(hp-x.e.hp,x.u.s.atk*.4);
 x=setup(['aug_u_soul_siphon','aug_u_arts_juice']);x.u.hp-=500;x.b.rng=()=>0;hp=x.u.hp;near(hit(x.b,x.u,x.e,100,'arts',{isAttack:true}),200);near(x.u.hp-hp,26);assert.deepEqual(x.b.errors,[]);
});
// (A6000 fork review, 2026-10-14: 阻挡数 0 is the operator's noBlock — `unblockable` is an enemy's 不可阻挡, inert on an operator)
test('escape triggers on threshold crossing: depletion/expiry unblock, healing above threshold rearms',()=>{
 for(const deplete of [false,true]){const {h,b,u,e}=setup(['aug_u_escape']);u.hp=u.s.maxHp*.35+1;hit(b,e,u,2,'true');assert(u.findBuff('augment:aug_u_escape'));
 if(deplete)hit(b,e,u,u.s.maxHp*.3,'true');else h.run(5.1);
 assert(u.s.flags.noBlock);h.run(10.1);assert(!u.s.flags.noBlock);assert(!u.findBuff('augment:aug_u_escape'));u.hp=u.s.maxHp*.5;hit(b,e,u,u.s.maxHp*.2,'true');assert(u.findBuff('augment:aug_u_escape'));assert.deepEqual(b.errors,[]);}
});
test('death cry does not stack when several allies fall; new incoming enemies do not inherit it',()=>{
 const {h,b,u,e}=setup(['aug_u_deathcry']);b.emit('death',{unit:u,reason:'killed'});b.emit('death',{unit:u,reason:'killed'});near(e.s.dmgTakenMul,1.2);const e2=h.spawn('e',{pos:[10,6]});near(e2.s.dmgTakenMul,1);
});
test('death ring permits full HP healing; damage-linked old life steal cannot loop',()=>{
 const {b,u,e}=setup(['aug_u_death_ring','aug_lifesteal'],{rec:{profession:'MEDIC',attackKind:'heal'}});assert(b.injuredAlliesInKeys(u.rangeKeys,u).includes(u));const hp=e.hp;b.heal(u,u,100);near(hp-e.hp,70);assert.deepEqual(b.errors,[]);
});
test('burn income only real burn events, capped at three; result carries awarded coin source',()=>{
 const {b,u,e}=setup(['aug_u_burn_income']);for(let i=0;i<5;i++){b.removeBuff(e,'burnBurst');hit(b,u,e,e.gaugeMax,'element',{element:'burn'});}near(b._pp('p1').coins,3);near(b._pp('p1').hexBurnCoins,3);near(compactResult(b.result()).perPlayer.p1.hexBurnCoins,3);
});
test('new enemy stats, damage types, shield punisher and player attack interval apply',()=>{
 const {b,u,e}=setup([],{enemyAtk:100,flags:{enemyBuffs:['eb_n_health','eb_n_power','eb_n_arts','eb_n_shatter','eb_n_slow','eb_n_element']}});
 near(e.s.maxHp/e.base.maxHp,1.1);near(e.s.atk/e.base.atk,1.08);near(e.s.artsTakenMul,.82);near(e.s.elemTakenMul,.7);near(u.s.interval/u.base.bat,1.15);
 near(hit(b,u,e,100,'element',{element:'burn'}),70);near(hit(b,u,e),82);
 b.addBuff(u,{key:'shield',shield:1});const hp=u.hp;hit(b,e,u,100,'true');near(hp-u.hp,134);assert.deepEqual(b.errors,[]);
});
test('six enemy rarities have three legal distinct options in general and boss pools',()=>{
 assert.equal(ENEMY_BUFFS.length,104);for(let r=1;r<=6;r++)for(const boss of [false,true]){
 const ids=rollVoteOptions([],()=>.31,{tier:r,boss,strict:true,allowed:d=>!d.coop&&!d.faction});assert.equal(ids.length,3);assert.equal(new Set(ids).size,3);assert(ids.every(id=>enemyBuffDef(id).rarity===r));}
 near(rollVoteTier([0,0,0,0,0,100],()=>.5),6);assert.notEqual(rollVoteTier([0,0,0,0,0,100],()=>.5,{noPrism:true}),6);
 assert.deepEqual(enemyBuffSettings({weights:[60,30,10]}).weights,[30,30,15,15,7,3]);assert(!isEnemyBuffSettings({sameBothQuality:true}));assert(!enemyBuffSettings({sameBothQuality:true}).sameBothQuality);
});
test('same-player and same-both enforce actual card qualities for all seats including vouchers',()=>{
 for(const both of [false,true]){const m=match({samePlayerQuality:true,sameBothQuality:both,firstNoPrism:false});try{for(const r of [1,2,6,8,10,13,14]){m.round=r;for(const p of m.alivePlayers()){p.augVoucher=1;p.augRarities=[1];}m.opts.enemyBuffs; m.enterAugment();if(!m.aug)continue;const q=m.aug.commonRarity;for(const p of m.alivePlayers()){const offers=m.aug.offers[p.playerId];if(!offers)continue;assert(offers.every(id=>augmentDef(id).rarity===q));m._applyAugment(p,offers[0]);assert(m.aug.offers[p.playerId].every(id=>augmentDef(id).rarity===q));}if(both&&m.aug.vote)assert(m.aug.vote.options.every(id=>enemyBuffDef(id).rarity===q));}}finally{m.dispose();}}
});
test('reroll rejects unowned, is future-only and once, replaces cards at exact original quality',()=>{
 const m=match({samePlayerQuality:true});try{m.round=3;m.enterAugment();const p=m.alivePlayers()[0];assert(m.rerollAugment(p).error);m.grantAugment(p,'aug_u_choice_reroll');assert(m.rerollAugment(p).error);
 m.round=4;m.enterAugment();const before=m.aug.offers[p.playerId].slice(),q=m.aug.rarity[p.playerId],n=p.augRarities.length;
 assert.deepEqual(m.rerollAugment(p),{ok:true});assert(m.aug.offers[p.playerId].every(id=>augmentDef(id).rarity===q&&!before.includes(id)));assert.equal(p.augRarities.length,n);assert(m.rerollAugment(p).error);assert(!m.augmentPrivateView(p).canReroll);
 }finally{m.dispose();}
});
test('exchange waits until CURRENT round prep after income, exactly once',()=>{
 const m=match();try{m.round=3;m.phase='AUGMENT';const p=m.alivePlayers()[0];p.funds=8;p.lp=28;m.grantAugment(p,'aug_u_exchange');near(p.funds,8);p.funds+=4;m.enterPrep();near(p.funds,28);near(p.lp,12);m.dispatch(p,'onPrepStart',{round:3});near(p.funds,28);near(p.lp,12);}finally{m.dispose();}
});
test('exchange zero life eliminates before prep actions; frequency card schedule condition',()=>{
 const m=match();try{m.round=2;m.phase='AUGMENT';for(const p of m.alivePlayers()){p.funds=0;m.grantAugment(p,'aug_u_exchange');}m.enterPrep();assert.equal(m.alivePlayers().length,0);
 }finally{m.dispose();}
 const n=match();try{const p=n.alivePlayers()[0],d=augmentDef('aug_vs_times');n.factions=['FLY'];assert(!n.augmentAvailable(p,d));n.factions=['TIMES'];assert(n.augmentAvailable(p,d));}finally{n.dispose();}
});
test('catalog quality/set/search filters and room dependency are wired into rendered controls',()=>{
 assert.equal(catalogEntries().length,390);assert.equal(catalogEntries('enemy').length,104);for(let r=1;r<=6;r++){assert(catalogEntries('enemy',{rarity:r}).every(d=>d.rarity===r));assert(catalogEntries('player',{rarity:r}).every(d=>d.rarity===r));}
 assert(catalogEntries('player',{query:'风语者'}).some(d=>d.id==='aug_u_wind_blessing'));assert(catalogEntries('enemy',{set:'boss'}).every(d=>d.boss));
 const inputs=[];const visit=node=>{if(Array.isArray(node))return node.forEach(visit);if(!node||typeof node!=='object')return;if(node.type==='input'||node.type==='select'||typeof node.type==='function'&&node.props.label?.includes('品质相同'))inputs.push(node);visit(node.props?.children);};
 let next;visit(EnemyBuffEditor({value:{samePlayerQuality:false},onChange:v=>next=v}));const b=inputs.find(n=>n.props.label==='双方海克斯品质相同');assert.equal(b.props.disabled,true);const a=inputs.find(n=>n.props.label==='我方所有人海克斯品质相同');a.props.onChange(true);assert.equal(next.samePlayerQuality,true);
 inputs.length=0;visit(HexCatalogView({}));assert.equal(inputs.filter(n=>n.type==='select').length,2);
});

import {compactResult,resultDigest} from '../server/sim/spec.js';
import {validateClientResult,emptyPerPlayer} from '../server/match/fields.js';
import {validateC2S} from '../shared/protocol.js';
test('burn rewards survive compact/wire/result validation; cannot claim rewards without owning the augment',()=>{
 const player={playerId:'p1',units:[],playerEffects:[{key:'augment:aug_u_burn_income',params:{battleCoins:3}}]};
 const spec={kind:'normal',timeLimit:60,spawns:[],players:[player]};
 const raw={time:1,reason:'forced',perPlayer:{p1:{...emptyPerPlayer(),coins:3,hexBurnCoins:3}}};
 const wire=compactResult(raw);near(wire.perPlayer.p1.hexBurnCoins,3);const checked=validateClientResult(spec,wire);assert(checked.ok,checked.reason);near(checked.result.perPlayer.p1.hexBurnCoins,3);
 assert.notEqual(resultDigest(wire).hash,resultDigest({...wire,perPlayer:{p1:{...wire.perPlayer.p1,hexBurnCoins:2}}}).hash);
 player.playerEffects=[{key:'augment:aug_lucky_cat',params:{battleCoins:3}}];assert(!validateClientResult(spec,wire).ok);
 assert.equal(validateC2S({t:'g.augReroll',rid:1}),null);
});
test('edited caster/medic/tank/warrior class numbers affect live stats',()=>{
 let x=setup(['aug_c_caster1'],{rec:{profession:'CASTER'}});near(x.u.s.atk/x.u.base.atk,1.3);near(x.u.s.spRecovery/x.u.base.spRecovery,1.3);
 x=setup(['aug_c_medic1'],{rec:{profession:'MEDIC'}});near(x.u.s.maxHp/x.u.base.maxHp,1.08);near(x.u.s.healingDealtMul,1.3);
 x=setup(['aug_c_tank1'],{rec:{profession:'TANK'}});near(x.u.s.maxHp/x.u.base.maxHp,1.3);near(x.u.s.def/x.u.base.def,1.08);
 x=setup(['aug_c_warrior1']);near(x.u.s.dmgTakenMul,.95);
});
test('layer raise uses the SUM of active bonds and applies even to a nonmember, capped at150%',()=>{
 const h=makeBattle({units:[{chessId:'tester',row:10,col:5}],defs:{chess:{tester:chessRec({id:'tester'})}},bonds:{sarkazShip:{active:true,layers:200},steadShip:{active:true,layers:200}},playerEffects:[{key:'augment:aug_layer_raise',params:augmentDef('aug_layer_raise').params}],autoFinish:false});h.step();near(h.unit('tester').s.augDealtMul,1.04);
 h.b.addLayers('p1','sarkazShip',9800,'test');h.b.addLayers('p1','steadShip',9800,'test');h.run(.6);near(h.unit('tester').s.augDealtMul,1.5);assert.deepEqual(h.b.errors,[]);
});
test('normal plus unite burn rewards share the three-fund round cap while ordinary bounties remain',()=>{
 const m=match();try{m.round=3;for(const p of m.alivePlayers())p.lp=28;const p=m.alivePlayers()[0];m.grantAugment(p,'aug_u_burn_income');m.lastResults.set(p.playerId,{...emptyPerPlayer(),coins:5,hexBurnCoins:3});
 const before=p.pendingFunds;m.settle({helpers:[p],leakers:[],notReentered:[]},{perPlayer:{[p.playerId]:{...emptyPerPlayer(),coins:3,hexBurnCoins:3}}});near(p.pendingFunds-before,5);
 }finally{m.dispose();}
});
test('first-vote prism ban constrains both sides together; per-player sync does not require enemy master switch',()=>{
 const m=match({samePlayerQuality:true,sameBothQuality:true,enemyRounds:[8],playerRounds:[8],firstNoPrism:true});try{m.round=8;m.rngAug=()=>.999;m.enterAugment();assert.equal(m.aug.commonRarity,5);assert.equal(m.aug.vote.tier,5);assert(Object.values(m.aug.offers).flat().every(id=>augmentDef(id).rarity===5));}finally{m.dispose();}
 const n=match({on:false,samePlayerQuality:true,playerRounds:[3]});try{n.round=3;n.enterAugment();assert(!n.aug.vote);assert(Object.values(n.aug.rarity).every(q=>q===n.aug.commonRarity));}finally{n.dispose();}
});
