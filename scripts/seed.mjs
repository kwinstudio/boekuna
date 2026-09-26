import pg from "pg"; import bcrypt from "bcryptjs"; import { randomUUID } from "node:crypto";
const {Client}=pg; const {hash}=bcrypt; if(!process.env.DATABASE_URL)throw new Error("DATABASE_URL missing");
const email=process.env.DEMO_ADMIN_EMAIL||"demo@example.com"; const password=process.env.DEMO_ADMIN_PASSWORD||"Demo-Change-1234";
const c=new Client({connectionString:process.env.DATABASE_URL,ssl:process.env.NODE_ENV==="production"?{rejectUnauthorized:false}:undefined}); await c.connect();
try{
 const existing=await c.query(`select id from users where email=$1`,[email]); if(existing.rowCount){console.log("Demo already exists");process.exit(0);}
 const userId=randomUUID(),orgId=randomUUID(),locId=randomUUID();
 await c.query("begin");
 await c.query(`insert into users(id,email,name,password_hash) values($1,$2,'Demo Manager',$3)`,[userId,email,await hash(password,12)]);
 await c.query(`insert into organisations(id,name,timezone) values($1,'Demo Hospitality Group','Europe/Amsterdam')`,[orgId]);
 await c.query(`insert into memberships(id,user_id,organisation_id,role,status) values($1,$2,$3,'owner','active')`,[randomUUID(),userId,orgId]);
 await c.query(`insert into locations(id,organisation_id,name,timezone) values($1,$2,'Rotterdam Centrum','Europe/Amsterdam')`,[locId,orgId]);
 const roleNames=["Bartender","Bediening","Runner","Keuken"]; const roles={};
 for(const n of roleNames){const id=randomUUID();roles[n]=id;await c.query(`insert into roles(id,organisation_id,name) values($1,$2,$3)`,[id,orgId,n]);}
 for(let i=1;i<=18;i++){const id=randomUUID();const role=roleNames[i%roleNames.length];await c.query(`insert into employee_profiles(id,organisation_id,name,email,primary_role_id,location_ids,desired_hours,experience_level,status) values($1,$2,$3,$4,$5,$6::uuid[],$7,$8,'active')`,[id,orgId,`Medewerker ${i}`,`employee${i}@demo.local`,roles[role],`{${locId}}`,i%3===0?32:24,(i%4)+1]);await c.query(`insert into contracts(id,organisation_id,employee_id,contract_type,contract_hours,hourly_wage,active) values($1,$2,$3,'parttime',$4,$5,true)`,[randomUUID(),orgId,i%3===0?32:24,14+(i%6)]);await c.query(`insert into employee_roles(id,organisation_id,employee_id,role_id) values($1,$2,$3,$4)`,[randomUUID(),orgId,id,roles[role]]);}
 for(let i=1;i<=42;i++){const d=new Date();d.setDate(d.getDate()-i);const dow=d.getDay();const base=[9500,11500,13000,14200,16800,23500,26000][dow];const amount=Math.round(base*(.9+((i*37)%21)/100));await c.query(`insert into revenues(id,organisation_id,location_id,revenue_date,amount,source) values($1,$2,$3,$4,$5,'demo')`,[randomUUID(),orgId,locId,d.toISOString().slice(0,10),amount]);}
 await c.query("commit"); console.log(`Seeded demo login ${email}`);
}catch(e){await c.query("rollback").catch(()=>{});throw e;}finally{await c.end();}
