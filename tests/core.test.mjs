import test from "node:test";
import assert from "node:assert/strict";
import { overlap, hoursBetween, hardConstraintReasons, scoreEmployee, generateSchedule } from "../src/lib/scheduler-core.mjs";
import { weightedAverage, mean, stddev, forecastRevenue, workloadFromRevenue } from "../src/lib/forecast-core.mjs";
import { shiftHours, shiftCost, labourPercentage } from "../src/lib/labour-core.mjs";

const iso=(d,h,m=0)=>`2026-10-${String(d).padStart(2,"0")}T${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:00+02:00`;
const emp=(id="e1",x={})=>({id,name:id,roles:["Bartender"],locationIds:["l1"],skills:["bar"],contractHours:24,desiredHours:24,maxHours:32,hourlyWage:16,experienceLevel:2,availability:[],leave:[],preferences:["evening"],...x});
const req=(id="r1",x={})=>({id,role:"Bartender",locationId:"l1",start:iso(10,18),end:iso(10,23),breakMinutes:0,count:1,skills:["bar"],period:"evening",...x});
let n=0; const qa=(name,fn)=>test(`T${String(++n).padStart(3,"0")} ${name}`,fn);

const overlapCases=[
 [18,22,18,22,true],[18,22,17,19,true],[18,22,21,23,true],[18,22,19,20,true],[19,20,18,22,true],
 [18,22,22,23,false],[18,22,17,18,false],[18,22,23,24,false]
];
for(const [a,b,c,d,want] of overlapCases) qa(`overlap ${a}-${b} vs ${c}-${d}`,()=>assert.equal(overlap(iso(10,a),iso(a===23?11:10,b===24?0:b),iso(10,c),iso(c===23?11:10,d===24?0:d)),want));
for(const [mins,want] of [[0,5],[30,4.5],[60,4],[90,3.5]]) qa(`hours break ${mins}`,()=>assert.equal(hoursBetween(iso(10,18),iso(10,23),mins),want));
qa("hours cross midnight",()=>assert.equal(hoursBetween(iso(10,22),iso(11,4)),6));
qa("hours cross midnight break",()=>assert.equal(hoursBetween(iso(10,22),iso(11,4),30),5.5));
qa("hours negative clamps",()=>assert.equal(hoursBetween(iso(10,23),iso(10,18)),0));
qa("hours quarter",()=>assert.equal(hoursBetween(iso(10,18),iso(10,18,15)),.25));
qa("hours half",()=>assert.equal(hoursBetween(iso(10,18),iso(10,18,30)),.5));
qa("hours 90 minutes",()=>assert.equal(hoursBetween(iso(10,18),iso(10,19,30)),1.5));
qa("break equals shift",()=>assert.equal(hoursBetween(iso(10,18),iso(10,19),60),0));
qa("break exceeds shift",()=>assert.equal(hoursBetween(iso(10,18),iso(10,19),90),0));
qa("cross-midnight overlap",()=>assert.equal(overlap(iso(10,22),iso(11,4),iso(11,3),iso(11,5)),true));

qa("eligible base",()=>assert.equal(scoreEmployee(emp(),req(),{},"balanced").eligible,true));
qa("blocked wrong role",()=>assert.ok(hardConstraintReasons(emp("e",{roles:["Runner"]}),req(),{}).includes("functie ontbreekt")));
qa("blocked wrong location",()=>assert.ok(hardConstraintReasons(emp("e",{locationIds:["l2"]}),req(),{}).includes("locatie niet toegestaan")));
qa("blocked missing skill",()=>assert.ok(hardConstraintReasons(emp("e",{skills:[]}),req(),{}).some(x=>x.startsWith("ontbrekende skill"))));
qa("blocked overlap",()=>assert.ok(hardConstraintReasons(emp(),req(),{existingAssignments:[{employeeId:"e1",start:iso(10,17),end:iso(10,19)}]}).includes("reeds ingepland")));
qa("blocked max hours",()=>assert.ok(hardConstraintReasons(emp("e1",{maxHours:25}),req(),{hoursByEmployee:{e1:22}}).includes("maximale uren bereikt")));
qa("blocked leave",()=>assert.ok(hardConstraintReasons(emp("e1",{leave:[{start:iso(10,17),end:iso(10,23)}]}),req(),{}).includes("verlof")));
qa("availability covered",()=>assert.equal(hardConstraintReasons(emp("e1",{availability:[{start:iso(10,17),end:iso(11,1),available:true}]}),req(),{}).length,0));
qa("availability short",()=>assert.ok(hardConstraintReasons(emp("e1",{availability:[{start:iso(10,19),end:iso(10,23),available:true}]}),req(),{}).includes("niet beschikbaar")));
qa("availability false",()=>assert.ok(hardConstraintReasons(emp("e1",{availability:[{start:iso(10,17),end:iso(11,1),available:false}]}),req(),{}).includes("niet beschikbaar")));
for(const strategy of ["balanced","cost","service"]) qa(`score range ${strategy}`,()=>{const s=scoreEmployee(emp(),req(),{},strategy).score;assert.ok(s>=0&&s<=100)});
qa("cost prefers cheaper",()=>assert.ok(scoreEmployee(emp("a",{hourlyWage:14}),req(),{},"cost").score>scoreEmployee(emp("b",{hourlyWage:24}),req(),{},"cost").score));
qa("service prefers experience",()=>assert.ok(scoreEmployee(emp("a",{experienceLevel:4}),req(),{},"service").score>scoreEmployee(emp("b",{experienceLevel:1}),req(),{},"service").score));
qa("balanced preference match",()=>assert.ok(scoreEmployee(emp("a"),req(),{},"balanced").score>scoreEmployee(emp("b",{preferences:[]}),req(),{},"balanced").score));
qa("fairness rewards target closeness",()=>assert.ok(scoreEmployee(emp("a"),req(),{hoursByEmployee:{a:20}},"balanced").breakdown.fairness>scoreEmployee(emp("b"),req(),{hoursByEmployee:{b:2}},"balanced").breakdown.fairness));
qa("no skills required gives full coverage",()=>assert.equal(scoreEmployee(emp("e",{skills:[]}),req("r",{skills:[]}),{}).breakdown.skillCoverage,100));
qa("blocked score is minus infinity",()=>assert.equal(scoreEmployee(emp("e",{roles:[]}),req(),{}).score,-Infinity));
for(const prefix of ["beschikbaar","functie:","fairness","kostenfit"]) qa(`explain reason ${prefix}`,()=>assert.ok(scoreEmployee(emp(),req(),{}).reasons.some(x=>x.startsWith(prefix))));
qa("max hours exact allowed",()=>assert.equal(hardConstraintReasons(emp("e1",{maxHours:27}),req(),{hoursByEmployee:{e1:22}}).includes("maximale uren bereikt"),false));
qa("max hours decimal over blocks",()=>assert.equal(hardConstraintReasons(emp("e1",{maxHours:26.9}),req(),{hoursByEmployee:{e1:22}}).includes("maximale uren bereikt"),true));
qa("leave touching start allowed",()=>assert.equal(hardConstraintReasons(emp("e1",{leave:[{start:iso(10,14),end:iso(10,18)}]}),req(),{}).includes("verlof"),false));
qa("existing touching start allowed",()=>assert.equal(hardConstraintReasons(emp(),req(),{existingAssignments:[{employeeId:"e1",start:iso(10,12),end:iso(10,18)}]}).includes("reeds ingepland"),false));
qa("missing specific skill named",()=>assert.ok(hardConstraintReasons(emp("e",{skills:["bar"]}),req("r",{skills:["bar","wine"]}),{}).join(" ").includes("wine")));
qa("strategy weights differ",()=>{const e=emp("e",{hourlyWage:24,experienceLevel:4});assert.notEqual(scoreEmployee(e,req(),{},"service").score,scoreEmployee(e,req(),{},"cost").score)});

qa("mean basic",()=>assert.equal(mean([10,20,30]),20));
qa("mean empty",()=>assert.equal(mean([]),0));
qa("weighted single",()=>assert.equal(weightedAverage([100]),100));
qa("weighted trend up",()=>assert.ok(weightedAverage([100,200,300])>mean([100,200,300])));
qa("stddev zero",()=>assert.equal(stddev([10,10,10]),0));
qa("stddev empty",()=>assert.equal(stddev([]),0));
qa("forecast empty",()=>assert.equal(forecastRevenue([]).forecast,0));
qa("forecast positive",()=>assert.ok(forecastRevenue([100,110,120,130]).forecast>0));
qa("forecast band order",()=>{const f=forecastRevenue([100,110,120,130]);assert.ok(f.low<=f.forecast&&f.high>=f.forecast)});
qa("forecast confidence range",()=>{const f=forecastRevenue([100,110,120,130]);assert.ok(f.confidence>=35&&f.confidence<=95)});
qa("forecast positive adjustment",()=>assert.ok(forecastRevenue([100,100,100],10).forecast>forecastRevenue([100,100,100]).forecast));
qa("forecast negative adjustment",()=>assert.ok(forecastRevenue([100,100,100],-10).forecast<forecastRevenue([100,100,100]).forecast));
qa("forecast ignores negative",()=>assert.equal(forecastRevenue([-100,100]).forecast,100));
qa("forecast ignores NaN",()=>assert.equal(forecastRevenue([100,Number.NaN]).forecast,100));
qa("forecast minimum margin",()=>{const f=forecastRevenue([100,100,100]);assert.ok(f.high-f.forecast>=6)});
for(const [rev,ratio,want] of [[950,95,10],[1000,95,11],[0,95,0],[1000,0,0]]) qa(`workload ${rev}/${ratio}`,()=>assert.equal(workloadFromRevenue(rev,{revenuePerLabourHour:ratio}).totalLabourHours,want));
qa("forecast factors exist",()=>assert.ok(forecastRevenue([100,110]).factors.length>=2));

qa("shift hours basic",()=>assert.equal(shiftHours(iso(10,18),iso(10,23)),5));
qa("shift hours break",()=>assert.equal(shiftHours(iso(10,18),iso(10,23),30),4.5));
qa("shift hours overnight",()=>assert.equal(shiftHours(iso(10,22),iso(11,4)),6));
qa("cost base",()=>assert.equal(shiftCost({start:iso(10,18),end:iso(10,23),hourlyWage:10,employerFactor:1}),50));
qa("cost employer factor",()=>assert.equal(shiftCost({start:iso(10,18),end:iso(10,23),hourlyWage:10,employerFactor:1.2}),60));
qa("cost surcharge",()=>assert.equal(shiftCost({start:iso(10,18),end:iso(10,23),hourlyWage:10,employerFactor:1,surchargePct:20}),60));
qa("cost break",()=>assert.equal(shiftCost({start:iso(10,18),end:iso(10,23),breakMinutes:60,hourlyWage:10,employerFactor:1}),40));
qa("cost rounding",()=>assert.equal(shiftCost({start:iso(10,18),end:iso(10,19),hourlyWage:10.555,employerFactor:1}),10.56));
qa("labour percentage basic",()=>assert.equal(labourPercentage(250,1000),25));
qa("labour percentage decimal",()=>assert.equal(labourPercentage(263.5,1000),26.4));
qa("labour zero revenue",()=>assert.equal(labourPercentage(100,0),null));
qa("labour over 100",()=>assert.equal(labourPercentage(1200,1000),120));
qa("zero wage zero cost",()=>assert.equal(shiftCost({start:iso(10,18),end:iso(10,23),hourlyWage:0}),0));
qa("zero hours zero cost",()=>assert.equal(shiftCost({start:iso(10,18),end:iso(10,18),hourlyWage:20}),0));
qa("negative shift clamps",()=>assert.equal(shiftHours(iso(10,23),iso(10,18)),0));

qa("schedule one",()=>assert.equal(generateSchedule([req()],[emp()]).assignments.length,1));
qa("schedule two slots",()=>assert.equal(generateSchedule([req("r",{count:2})],[emp("a"),emp("b")]).assignments.length,2));
qa("schedule no employees unfilled",()=>assert.equal(generateSchedule([req()],[]).unfilled.length,1));
qa("schedule wrong role unfilled",()=>assert.equal(generateSchedule([req()],[emp("a",{roles:["Runner"]})]).unfilled.length,1));
qa("schedule cost chooses cheap",()=>assert.equal(generateSchedule([req()],[emp("a",{hourlyWage:14}),emp("b",{hourlyWage:30})],"cost").assignments[0].employeeId,"a"));
qa("schedule service chooses experienced",()=>assert.equal(generateSchedule([req()],[emp("a",{experienceLevel:1}),emp("b",{experienceLevel:4})],"service").assignments[0].employeeId,"b"));
qa("schedule avoids overlap",()=>{const g=generateSchedule([req("r",{count:2})],[emp("a"),emp("b")]);assert.notEqual(g.assignments[0].employeeId,g.assignments[1].employeeId)});
qa("schedule deterministic tie",()=>assert.equal(generateSchedule([req()],[emp("b"),emp("a")]).assignments[0].employeeId,"a"));
qa("schedule updates hours",()=>assert.equal(generateSchedule([req()],[emp("a")]).hoursByEmployee.a,5));
qa("schedule strategy label",()=>assert.equal(generateSchedule([req()],[emp("a")],"service").strategy,"service"));
qa("schedule reasons present",()=>assert.ok(generateSchedule([req()],[emp("a")]).assignments[0].reasons.length>0));
qa("schedule breakdown present",()=>assert.equal(typeof generateSchedule([req()],[emp("a")]).assignments[0].breakdown.fairness,"number"));
qa("schedule nonoverlap same employee",()=>assert.equal(generateSchedule([req("r1",{start:iso(10,12),end:iso(10,16)}),req("r2",{start:iso(10,18),end:iso(10,22)})],[emp("a",{maxHours:40})]).assignments.length,2));
qa("schedule max hours leaves one",()=>assert.equal(generateSchedule([req("r1",{start:iso(10,12),end:iso(10,17)}),req("r2",{start:iso(10,18),end:iso(10,23)})],[emp("a",{maxHours:5})]).unfilled.length,1));
qa("schedule impossible does not crash",()=>assert.doesNotThrow(()=>generateSchedule([req("r",{count:5})],[emp("a")])));

assert.equal(n,100,"QA suite must contain exactly 100 scenarios");
