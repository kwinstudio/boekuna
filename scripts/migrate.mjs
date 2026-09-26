import pg from "pg"; import fs from "node:fs/promises"; import path from "node:path";
const {Client}=pg; if(!process.env.DATABASE_URL) throw new Error("DATABASE_URL missing");
const client=new Client({connectionString:process.env.DATABASE_URL,ssl:process.env.NODE_ENV==="production"?{rejectUnauthorized:false}:undefined});
await client.connect();
try{
 await client.query(`create table if not exists schema_migrations(name text primary key,applied_at timestamptz not null default now())`);
 const dir=path.resolve("db/migrations"); const names=(await fs.readdir(dir)).filter(x=>x.endsWith(".sql")).sort();
 for(const name of names){const exists=await client.query(`select 1 from schema_migrations where name=$1`,[name]);if(exists.rowCount)continue;const sql=await fs.readFile(path.join(dir,name),"utf8");await client.query("begin");try{await client.query(sql);await client.query(`insert into schema_migrations(name) values($1)`,[name]);await client.query("commit");console.log("Applied",name);}catch(e){await client.query("rollback");throw e;}}
}finally{await client.end();}
