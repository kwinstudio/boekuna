export function shiftHours(start,end,breakMinutes=0){return Math.max(0,(new Date(end)-new Date(start))/3600000-breakMinutes/60);}
export function shiftCost({start,end,breakMinutes=0,hourlyWage=0,employerFactor=1.28,surchargePct=0}){const hours=shiftHours(start,end,breakMinutes);const base=hours*Number(hourlyWage);const surcharge=base*Number(surchargePct)/100;return Math.round((base+surcharge)*Number(employerFactor)*100)/100;}
export function labourPercentage(cost,revenue){if(!revenue)return null;return Math.round((Number(cost)/Number(revenue))*1000)/10;}
