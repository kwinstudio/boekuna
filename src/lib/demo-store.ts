import { randomUUID } from "crypto";

type DemoState = {
  organisation:{id:string;name:string;timezone:string};
  locations:any[]; roles:any[]; employees:any[]; contracts:any[]; employeeRoles:any[];
  forecasts:any[]; revenues:any[]; shifts:any[]; assignments:any[]; leave:any[]; timeEntries:any[];
};

const g=globalThis as unknown as {__wfmDemoState?:DemoState};

function ymd(d:Date){return d.toISOString().slice(0,10)}
function isoAt(date:string,hour:number,minute=0){return new Date(`${date}T${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}:00+02:00`).toISOString()}
function todayOffset(days:number){const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+days);return ymd(d)}

function createState():DemoState{
  const organisation={id:"demo-org",name:"Workforce Demo Hospitality",timezone:"Europe/Amsterdam"};
  const locations=[
    {id:"loc-centrum",organisation_id:organisation.id,name:"Rotterdam Centrum",timezone:"Europe/Amsterdam",created_at:new Date().toISOString()},
    {id:"loc-kop",organisation_id:organisation.id,name:"Kop van Zuid",timezone:"Europe/Amsterdam",created_at:new Date().toISOString()},
    {id:"loc-schiedam",organisation_id:organisation.id,name:"Schiedam Haven",timezone:"Europe/Amsterdam",created_at:new Date().toISOString()}
  ];
  const roleNames=["Bediening","Bartender","Runner","Keuken","Keukenhulp","Supervisor","Host","Afwas"];
  const roles=roleNames.map((name,i)=>({id:`role-${i+1}`,organisation_id:organisation.id,name}));
  const first=["Noah","Liam","Sem","Lucas","Daan","Finn","Milan","Levi","Mees","Sam","Sophie","Emma","Julia","Mila","Tess","Sara","Liv","Nora","Lotte","Yara","Amir","Youssef","Adam","Omar","Bilal","Nour","Aya","Lina","Sara","Meryem","Jayden","Jason","Ryan","Dylan","Jamie","Bo","Fleur","Isa","Lynn","Eva","Nina","Zoë","Max","Bram","Jesse","Thijs","Thomas","Ruben","Tim","Stijn"];
  const last=["de Jong","Jansen","de Vries","van Dijk","Bakker","Visser","Smit","Meijer","de Boer","Mulder","Vos","Bos","Peters","Hendriks","Dekker","Brouwer","de Wit","Dijkstra","Smits","de Graaf","El Amrani","Ait Said","Benali","Haddad","Aksoy","Yilmaz","Demir","Kaya","Öztürk","Aydin","Nguyen","Tran","Pham","Chen","Wang","Khan","Singh","Patel","Garcia","Martinez"];
  const hours=[12,16,20,24,28,32,36,38];
  const wageBase:Record<string,number>={Bediening:14.75,Bartender:15.5,Runner:14.25,Keuken:16.25,Keukenhulp:14.5,Supervisor:19.5,Host:15,Afwas:14.25};
  const employees:any[]=[]; const contracts:any[]=[]; const employeeRoles:any[]=[];
  for(let i=0;i<100;i++){
    const role=roles[(i*3+i%5)%roles.length];
    const name=`${first[i%first.length]} ${last[(i*7)%last.length]}`;
    const id=`emp-${String(i+1).padStart(3,"0")}`;
    const loc=locations[(i*5+i)%locations.length];
    const contractHours=hours[(i*3)%hours.length];
    const wage=Math.round((wageBase[role.name]+((i%7)*.22))*100)/100;
    employees.push({id,organisation_id:organisation.id,name,email:`${name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,".")}.${i+1}@demo-hospitality.nl`,primary_role_id:role.id,location_ids:[loc.id],desired_hours:contractHours,experience_level:1+(i%4),status:i%23===0?"inactive":"active",created_at:new Date().toISOString(),updated_at:new Date().toISOString()});
    contracts.push({id:`contract-${i+1}`,organisation_id:organisation.id,employee_id:id,contract_type:contractHours>=32?"fulltime":"parttime",contract_hours:contractHours,hourly_wage:wage,employer_factor:1.28,active:true,version:1});
    employeeRoles.push({id:`er-${i+1}`,organisation_id:organisation.id,employee_id:id,role_id:role.id});
  }
  const revenues:any[]=[];
  for(let i=1;i<=42;i++){const date=todayOffset(-i);const dow=new Date(`${date}T12:00:00`).getDay();const base=[11000,12500,13800,15100,17500,24500,27800][dow];revenues.push({id:`rev-${i}`,organisation_id:organisation.id,location_id:locations[i%3].id,revenue_date:date,amount:Math.round(base*(.88+((i*17)%25)/100)),source:"demo"});}
  revenues.push({id:"rev-today",organisation_id:organisation.id,location_id:locations[0].id,revenue_date:todayOffset(0),amount:12480,source:"demo-live"});
  const forecasts:any[]=[];
  for(let i=0;i<14;i++){const date=todayOffset(i);const dow=new Date(`${date}T12:00:00`).getDay();const base=[12200,13600,14900,16400,18900,25800,28900][dow];forecasts.push({id:`fc-${i}`,organisation_id:organisation.id,forecast_date:date,forecast_amount:base,low_amount:Math.round(base*.89),high_amount:Math.round(base*1.12),confidence:78+(i%10),factors:["Historische omzet","Dagpatroon","Demo druktefactor"],source:"system",created_at:new Date().toISOString()});}
  const shifts:any[]=[]; const assignments:any[]=[];
  for(let day=0;day<7;day++){
    const date=todayOffset(day);
    for(let j=0;j<26;j++){
      const e=employees[(day*13+j*3)%employees.length]; if(e.status!=="active")continue;
      const role=roles.find(r=>r.id===e.primary_role_id)!;
      const startHour=role.name==="Keuken"||role.name==="Keukenhulp"?14+(j%3):16+(j%3);
      const shiftId=`shift-${day}-${j}`;
      shifts.push({id:shiftId,organisation_id:organisation.id,location_id:e.location_ids[0],role_id:role.id,start_at:isoAt(date,startHour),end_at:isoAt(date,Math.min(23,startHour+6)),break_minutes:30,status:day===0&&j%11===0?"open":"draft",source:j%2?"manual":"auto",explanation:{strategy:"balanced",score:82,reasons:["beschikbaar","functie passend","uren in balans"]},created_at:new Date().toISOString(),updated_at:new Date().toISOString()});
      assignments.push({id:`as-${day}-${j}`,organisation_id:organisation.id,shift_id:shiftId,employee_id:e.id,status:"assigned"});
    }
  }
  const leave:any[]=[];
  for(let i=0;i<10;i++){leave.push({id:`leave-${i}`,organisation_id:organisation.id,employee_id:employees[(i*9)%employees.length].id,start_date:todayOffset(2+i),end_date:todayOffset(3+i),leave_type:i%3===0?"special":"vacation",status:i%4===0?"approved":"pending",created_at:new Date().toISOString()});}
  return {organisation,locations,roles,employees,contracts,employeeRoles,forecasts,revenues,shifts,assignments,leave,timeEntries:[]};
}

export function demoState(){if(!g.__wfmDemoState)g.__wfmDemoState=createState();return g.__wfmDemoState}
export function isDemoMode(){return process.env.DEMO_MODE==="true"||!process.env.DATABASE_URL}

function result(rows:any[]=[]){return {rows,rowCount:rows.length,command:"SELECT",oid:0,fields:[]}}

export async function demoQuery(sql:string,params:any[]=[]):Promise<any>{
  const s=demoState(); const q=sql.replace(/\s+/g," ").trim().toLowerCase();

  if(q.startsWith("select 1 from memberships")) return result([{one:1}]);
  if(q.startsWith("select name from organisations")) return result([{name:s.organisation.name}]);

  if(q.includes("count(*)::int c from employee_profiles")) return result([{c:s.employees.filter(e=>e.status==="active").length}]);
  if(q.includes("from shifts sh where sh.organisation_id")&&q.includes("current_date")){
    const date=todayOffset(0); const xs=s.shifts.filter(x=>String(x.start_at).slice(0,10)===date); const hours=xs.reduce((a,x)=>a+(new Date(x.end_at).getTime()-new Date(x.start_at).getTime())/3600000,0);return result([{c:xs.length,hours}]);
  }
  if(q.includes("from revenue_forecasts")&&q.includes("forecast_date=current_date")){const r=s.forecasts.find(x=>x.forecast_date===todayOffset(0));return result(r?[{forecast_amount:r.forecast_amount,confidence:r.confidence}]:[])}
  if(q.includes("sum(amount)")&&q.includes("revenues")&&q.includes("revenue_date=current_date")) return result([{amount:s.revenues.filter(x=>x.revenue_date===todayOffset(0)).reduce((a,x)=>a+Number(x.amount),0)}]);
  if(q.includes("count(*)::int c from shifts")&&q.includes("status='open'")) return result([{c:s.shifts.filter(x=>x.status==="open"&&new Date(x.start_at)>=new Date()).length}]);

  if(q.includes("from revenue_forecasts")&&q.includes("forecast_date>=current_date")) return result(s.forecasts.slice(0,14).map(x=>({...x})));
  if(q.startsWith("select amount::float from revenues")){const dow=Number(params[1]);const before=String(params[2]);const rows=s.revenues.filter(x=>new Date(`${x.revenue_date}T12:00:00`).getDay()===dow&&x.revenue_date<before).sort((a,b)=>b.revenue_date.localeCompare(a.revenue_date)).slice(0,8).map(x=>({amount:Number(x.amount)}));return result(rows)}

  if(q.includes("select ep.id,ep.name,ep.location_ids")&&q.includes("array_agg")){
    return result(s.employees.filter(e=>e.status==="active").map(e=>{const c=s.contracts.find(c=>c.employee_id===e.id&&c.active);return {id:e.id,name:e.name,location_ids:e.location_ids,desired_hours:e.desired_hours,experience_level:e.experience_level,contract_hours:c?.contract_hours,hourly_wage:c?.hourly_wage,roles:s.employeeRoles.filter(er=>er.employee_id===e.id).map(er=>s.roles.find(r=>r.id===er.role_id)?.name).filter(Boolean)}}));
  }
  if(q.includes("select ep.id,ep.name,coalesce(r.name,'medewerker') role_name")) return result(s.employees.filter(e=>e.status==="active").sort((a,b)=>a.name.localeCompare(b.name)).map(e=>({id:e.id,name:e.name,role_name:s.roles.find(r=>r.id===e.primary_role_id)?.name||"Medewerker"})));
  if(q.includes("select ep.id,ep.name,ep.email,ep.status")) return result(s.employees.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(e=>{const c=s.contracts.find(c=>c.employee_id===e.id&&c.active);return {id:e.id,name:e.name,email:e.email,status:e.status,role_name:s.roles.find(r=>r.id===e.primary_role_id)?.name,contract_hours:c?.contract_hours,hourly_wage:c?.hourly_wage,primary_role_id:e.primary_role_id,location_id:e.location_ids?.[0]}}));
  if(q.startsWith("select id,name from employee_profiles")) return result(s.employees.filter(e=>e.status==="active").sort((a,b)=>a.name.localeCompare(b.name)).map(e=>({id:e.id,name:e.name})));
  if(q.startsWith("select 1 from employee_profiles")) return result(s.employees.some(e=>e.id===params[0])?[{one:1}]:[]);

  if(q.includes("from time_entries te join employee_profiles")) return result(s.timeEntries.slice().sort((a,b)=>String(b.started_at).localeCompare(String(a.started_at))).slice(0,30).map(t=>({...t,name:s.employees.find(e=>e.id===t.employee_id)?.name||"Onbekend"})));
  if(q.includes("select 1 from time_entries")&&q.includes("ended_at is null")) return result(s.timeEntries.some(t=>t.employee_id===params[1]&&!t.ended_at)?[{one:1}]:[]);
  if(q.includes("select id from time_entries")&&q.includes("ended_at is null")){const t=s.timeEntries.slice().reverse().find(t=>t.employee_id===params[1]&&!t.ended_at);return result(t?[{id:t.id}]:[])}

  if(q.includes("from leave_requests lr join employee_profiles")) return result(s.leave.slice().sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))).map(l=>({...l,name:s.employees.find(e=>e.id===l.employee_id)?.name||"Onbekend"})));

  if(q.startsWith("select id from locations")) return result(s.locations.slice(0,1).map(x=>({id:x.id})));
  if(q.startsWith("select id,name from locations")) return result(s.locations.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(x=>({id:x.id,name:x.name})));
  if(q.startsWith("select id,name from roles")) return result(s.roles.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(x=>({id:x.id,name:x.name})));

  if(q.includes("select sh.id,sh.start_at,sh.end_at,sa.employee_id,r.name role_name")){
    const from=String(params[1]),to=String(params[2]);return result(s.shifts.filter(x=>String(x.start_at).slice(0,10)>=from&&String(x.start_at).slice(0,10)<=to).map(sh=>({...sh,employee_id:s.assignments.find(a=>a.shift_id===sh.id)?.employee_id,role_name:s.roles.find(r=>r.id===sh.role_id)?.name})).sort((a,b)=>String(a.start_at).localeCompare(String(b.start_at))));
  }
  if(q.includes("select sh.*,sa.employee_id from shifts sh")){const sh=s.shifts.find(x=>x.id===params[0]);return result(sh?[{...sh,employee_id:s.assignments.find(a=>a.shift_id===sh.id)?.employee_id}]:[])}
  if(q.includes("select 1 from shift_assignments sa join shifts sh")){const [,employeeId,shiftId,start,end]=params;const conflict=s.assignments.some(a=>a.employee_id===employeeId&&a.shift_id!==shiftId&&(()=>{const sh=s.shifts.find(x=>x.id===a.shift_id);return sh?new Date(sh.start_at)<new Date(end)&&new Date(sh.end_at)>new Date(start):false})());return result(conflict?[{one:1}]:[])}

  if(q.includes("select rf.forecast_date")) return result(s.forecasts.slice(0,14).map(f=>({forecast_date:f.forecast_date,forecast_amount:f.forecast_amount,actual:s.revenues.filter(r=>r.revenue_date===f.forecast_date).reduce((a,r)=>a+Number(r.amount),0)})).sort((a,b)=>b.forecast_date.localeCompare(a.forecast_date)));

  if(q.startsWith("insert into locations")){const [id,,name]=params;s.locations.push({id,organisation_id:s.organisation.id,name,timezone:"Europe/Amsterdam",created_at:new Date().toISOString()});return result([])}
  if(q.startsWith("insert into roles")){const [id,,name]=params;s.roles.push({id,organisation_id:s.organisation.id,name,created_at:new Date().toISOString()});return result([])}
  if(q.startsWith("insert into employee_profiles")){const [id,,name,email,roleId,locArr]=params;const locationIds=typeof locArr==="string"?locArr.replace(/[{}]/g,"").split(",").filter(Boolean):[];s.employees.push({id,organisation_id:s.organisation.id,name,email,primary_role_id:roleId,location_ids:locationIds,desired_hours:24,experience_level:1,status:"active",created_at:new Date().toISOString(),updated_at:new Date().toISOString()});return result([])}
  if(q.startsWith("insert into contracts")){const [, ,employeeId,hours,wage]=params;s.contracts.push({id:randomUUID(),organisation_id:s.organisation.id,employee_id:employeeId,contract_type:"parttime",contract_hours:Number(hours),hourly_wage:Number(wage),employer_factor:1.28,active:true,version:1});return result([])}
  if(q.startsWith("insert into employee_roles")){const [, ,employeeId,roleId]=params;s.employeeRoles.push({id:randomUUID(),organisation_id:s.organisation.id,employee_id:employeeId,role_id:roleId});return result([])}
  if(q.startsWith("insert into leave_requests")){const [id,,employeeId,start,end,type]=params;s.leave.push({id,organisation_id:s.organisation.id,employee_id:employeeId,start_date:start,end_date:end,leave_type:type,status:"pending",created_at:new Date().toISOString()});return result([])}
  if(q.startsWith("insert into revenue_forecasts")){const [id,,date,forecast,low,high,confidence,factors]=params;const found=s.forecasts.find(x=>x.forecast_date===date);const data={id,organisation_id:s.organisation.id,forecast_date:date,forecast_amount:Number(forecast),low_amount:Number(low),high_amount:Number(high),confidence:Number(confidence),factors:JSON.parse(String(factors)),source:"system",created_at:new Date().toISOString()};if(found)Object.assign(found,data);else s.forecasts.push(data);return result([])}
  if(q.startsWith("insert into shifts")){const [id,,locationId,roleId,start,end,explanation]=params;s.shifts.push({id,organisation_id:s.organisation.id,location_id:locationId,role_id:roleId,start_at:start,end_at:end,status:"draft",source:"auto",explanation:JSON.parse(String(explanation)),created_at:new Date().toISOString(),updated_at:new Date().toISOString()});return result([])}
  if(q.startsWith("insert into shift_assignments")){const employeeId=params[3]??params[2];const shiftId=params[2]??params[1];s.assignments.push({id:randomUUID(),organisation_id:s.organisation.id,shift_id:shiftId,employee_id:employeeId,status:"assigned"});return result([])}
  if(q.startsWith("delete from shift_assignments")){s.assignments=s.assignments.filter(a=>a.shift_id!==params[0]);return result([])}
  if(q.startsWith("update shifts set start_at")){const sh=s.shifts.find(x=>x.id===params[2]);if(sh){sh.start_at=params[0];sh.end_at=params[1];sh.updated_at=new Date().toISOString()}return result([])}
  if(q.startsWith("insert into time_entries")){const [id,,employeeId]=params;s.timeEntries.push({id,organisation_id:s.organisation.id,employee_id:employeeId,started_at:new Date().toISOString(),ended_at:null,source:"kiosk",status:"open",created_at:new Date().toISOString()});return result([])}
  if(q.startsWith("update time_entries set ended_at")){const t=s.timeEntries.find(x=>x.id===params[0]);if(t){t.ended_at=new Date().toISOString();t.status="pending_approval"}return result([])}
  if(q.startsWith("insert into audit_logs")) return result([]);

  if(q.startsWith("insert into users")||q.startsWith("insert into organisations")||q.startsWith("insert into memberships")) return result([]);

  return result([]);
}

export function updateDemoEmployee(id:string,patch:any){
  const s=demoState(); const e=s.employees.find(x=>x.id===id); if(!e)return null;
  if(typeof patch.name==="string"&&patch.name.trim())e.name=patch.name.trim();
  if(typeof patch.email==="string")e.email=patch.email.trim();
  if(typeof patch.roleId==="string"&&s.roles.some(r=>r.id===patch.roleId)){e.primary_role_id=patch.roleId;const er=s.employeeRoles.find(x=>x.employee_id===id);if(er)er.role_id=patch.roleId;else s.employeeRoles.push({id:randomUUID(),organisation_id:s.organisation.id,employee_id:id,role_id:patch.roleId});}
  if(typeof patch.locationId==="string"&&s.locations.some(l=>l.id===patch.locationId))e.location_ids=[patch.locationId];
  if(typeof patch.status==="string"&&["active","inactive"].includes(patch.status))e.status=patch.status;
  const c=s.contracts.find(x=>x.employee_id===id&&x.active);
  if(c){if(Number.isFinite(Number(patch.contractHours)))c.contract_hours=Math.max(0,Math.min(80,Number(patch.contractHours)));if(Number.isFinite(Number(patch.hourlyWage)))c.hourly_wage=Math.max(0,Number(patch.hourlyWage));}
  e.updated_at=new Date().toISOString(); return e;
}
