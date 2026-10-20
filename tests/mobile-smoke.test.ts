// Source-backed smoke assertions for both mobile entry points.
// These tests check the implementation's critical guards, not a real device.
const assert = (value: unknown, message: string) => { if (!value) throw Error(message); };
for (const file of ['index.html','login.html']) {
 Deno.test(file + ': mobile week, positions, role selection and update controls', async () => {
  const html=await Deno.readTextFile(new URL('../'+file,import.meta.url));
  const section=(a:string,b:string)=>{
   const start=html.indexOf(a),end=html.indexOf(b,start+a.length);
   assert(start>=0&&end>start,'Missing function '+a);
   return html.slice(start,end);
  };
  const enter=section('function enter(r){','function fill(){');
  assert(enter.includes("E('mobileDays').dataset.week=''"),'Login does not reset expanded week');
  assert(enter.includes("E('mobileDays').innerHTML=''"),'Login does not clear old day cards');
  const draw=section('function draw(){','function payrollData(){');
  assert(draw.includes("root.querySelectorAll('details[open]')"),'Refresh loses expanded-day tracking');
  assert(draw.includes('previous===from?opened.has(d):false'),'New week should start collapsed');
  assert(draw.includes('Array.from({length:s.config.positions}'),'Missing second mobile position');
  assert(draw.includes('dayRows.find(v=>v.position===p)'),'Positions are not rendered separately');
  const role=section('function renderRoleSelect(reset=false){','function showRoleRate(');
  assert(role.includes('rememberedEmployeeRole(who)'),'Employee job role not automatically selected');
  assert(html.includes("E('employee').addEventListener('change',()=>renderRoleSelect(true))"),
    'Switching employees does not refresh role');
  const update=section('async function checkAppUpdate(force=false){','function updateAppNow(){');
  assert(update.includes("data.build!==CURRENT_BUILD"),'Update notice not based on build comparison');
  assert(update.includes("notice.hidden=!"),'Update notice cannot hide when version matches');
  const apply=section('function updateAppNow(){',"window.addEventListener('pageshow'");
  assert(apply.includes('notice.hidden=true'),'Update notice not hidden on click');
  assert(apply.includes('location.replace('),'Update does not reload the app');
 });
}
