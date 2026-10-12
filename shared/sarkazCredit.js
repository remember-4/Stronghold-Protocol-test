// The elite Closure credit survives until repayment even after selling Closure.
export function closureCredit(ps){
 const all=[...ps.board.values(),...ps.hand];
 return all.some(p=>p?.kind==='chess'&&ps.gd.chess(p.id)?.isGolden&&ps.gd.chess(p.id)?.charId==='char_4228_closur');
}
export function fundsFloor(ps){return closureCredit(ps)?-2:Math.max(-2,Math.min(0,ps.funds));}
export function settleClosureCredit(ps){if(ps.funds<0){ps.counters.closureDebt=(ps.counters.closureDebt||0)-2*ps.funds;ps.funds=0;ps.dirty();}}
export function repayClosureCredit(ps){const debt=Math.max(0,ps.counters.closureDebt||0),paid=Math.min(debt,Math.max(0,ps.funds));ps.funds-=paid;ps.counters.closureDebt=debt-paid;ps.dirty();}
