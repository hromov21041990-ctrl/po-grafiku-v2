// Regression tests for the exact shift-removal handlers in both mobile entry files.
// All accounts, shifts and API results are synthetic. No Supabase calls are made.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function harness(path){
 const html=fs.readFileSync(path,'utf8');
 for(const snippet of [
  /<button type="button" class="remove-btn" onclick="removeShift\\\('/,
  /#previewConfirmation\{z-index:400\}/,
  /onclick="settleConfirmation\(true\)"/,
 ])assert.match(html,snippet,'Missing modal or button wiring: '+path);
 const a=html.indexOf('async function mutate(action,p){');
 const b=html.indexOf('function showAssignmentError(message){',a);
 const c=html.indexOf('async function removeShift(id){',b);
 const d=html.indexOf('function settings(){',c);
 assert.ok(a>=0&&b>a&&c>b&&d>c,'Handlers missing: '+path);
 const shift={id:'sample-shift',employee:'Тестовый сотрудник',date:'2026-10-22',start:'10:00',end:'15:00',position:0};
 const point={role:'admin',version:3,schedule:[shift]};
 const notices=[], calls=[], confirms=[];
 const context={
  s:point,token:'synthetic-session',mutateBusy:false,
  appNotice:(s)=>{notices.push(s)},
  appConfirm:async(text)=>{confirms.push(text);return context.accept},
  accept:true,
  api:async(action,p)=>{calls.push({action,p});if(context.apiError)throw context.apiError;
    return {company:{...context.s,version:context.s.version+1,schedule:context.s.schedule.filter(x=>x.id!==p.id)}}},
  normalize:v=>v,draw:()=>{context.draws++},draws:0,
  syncLabel:()=>{},syncClock:()=> '00:00',
  E:(id)=>{if(id==='status')return context.status;if(id==='assignmentError')return context.error;throw Error('Unexpected DOM id '+id)},
  status:{textContent:''},error:{textContent:''},
  syncNow:async()=>{context.refreshes++},refreshes:0,
  showAssignmentError:()=>{},closeAssignment:()=>{},renderMemberAccess:()=>{},
  console
 };
 vm.createContext(context);
 vm.runInContext(html.slice(a,b)+'\n'+html.slice(c,d)+'\nthis.removeShiftTest=removeShift;',context);
 return {context,notices,calls,confirms};
}

async function check(path){
 let v=harness(path);
 await v.context.removeShiftTest('sample-shift');
 assert.equal(v.calls.length,1);
 assert.equal(v.calls[0].action,'remove');
 assert.equal(v.calls[0].p.id,'sample-shift');
 assert.equal(v.calls[0].p.expectedVersion,3);
 assert.equal(v.context.s.schedule.length,0);
 assert.equal(v.context.draws,1);
 assert.match(v.confirms[0],/Тестовый сотрудник.*2026-10-22/);
 assert.ok(v.notices.some(x=>/Смена снята/.test(x)));
 assert.equal(v.context.mutateBusy,false);

 v=harness(path);v.context.accept=false;
 await v.context.removeShiftTest('sample-shift');
 assert.equal(v.calls.length,0,'Cancel must not reach API');

 v=harness(path);v.context.s.role='staff';
 await v.context.removeShiftTest('sample-shift');
 assert.equal(v.calls.length,0,'Ordinary staff must not remove shifts');
 assert.match(v.notices.at(-1),/владелец и администратор/);

 v=harness(path);v.context.mutateBusy=true;
 await v.context.removeShiftTest('sample-shift');
 assert.equal(v.calls.length,0);
 assert.match(v.notices.at(-1),/Другое изменение/);

 v=harness(path);v.context.apiError=Error('График изменился на другом устройстве. Обновите страницу');
 await v.context.removeShiftTest('sample-shift');
 assert.equal(v.context.s.schedule.length,1,'Failed save must not delete local record');
 assert.equal(v.context.refreshes,1,'Conflict must refresh schedule');
 assert.ok(v.notices.some(x=>/Не удалось снять смену/.test(x)));
 assert.equal(v.context.mutateBusy,false);

 v=harness(path);v.context.apiError=Error('Сервер временно недоступен');
 await v.context.removeShiftTest('sample-shift');
 assert.equal(v.context.refreshes,0);
 assert.equal(v.context.s.schedule.length,1);
 assert.ok(v.notices.some(x=>/Не удалось снять смену/.test(x)));
 assert.equal(v.context.mutateBusy,false);

 v=harness(path);
 await v.context.removeShiftTest('stale-shift');
 assert.equal(v.calls.length,0);
 assert.equal(v.context.refreshes,1);
 console.log(path+': admin/remove confirmation, save, cancel, conflicts, staff access PASS');
}
(async()=>{for(const path of ['index.html','login.html'])await check(path)})().catch(e=>{console.error(e);process.exitCode=1});
