import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { query } from "./db";

export type Session = { userId:string; organisationId:string; role:"owner"|"area_manager"|"location_manager"|"planner"|"team_lead"|"hr"|"finance"|"employee"; email:string; };
function secret(){const value=process.env.AUTH_SECRET;if(!value||value.length<32)throw new Error("AUTH_SECRET must contain at least 32 characters.");return new TextEncoder().encode(value);}
export async function createSession(session:Session){const token=await new SignJWT(session).setProtectedHeader({alg:"HS256"}).setIssuedAt().setExpirationTime("7d").sign(secret());const store=await cookies();store.set("wfm_session",token,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/",maxAge:60*60*24*7});}
export async function clearSession(){const store=await cookies();store.delete("wfm_session");}
export async function getSession():Promise<Session|null>{const store=await cookies();const token=store.get("wfm_session")?.value;if(!token)return null;try{const {payload}=await jwtVerify(token,secret());return payload as unknown as Session;}catch{return null;}}
export async function requireSession(){const session=await getSession();if(!session)redirect("/login");return session;}
export async function requireApiSession(){const session=await getSession();if(!session)return null;const membership=await query(`select 1 from memberships where user_id=$1 and organisation_id=$2 and status='active' limit 1`,[session.userId,session.organisationId]);return membership.rowCount?session:null;}
export function canManage(role:Session["role"]){return ["owner","area_manager","location_manager","planner","team_lead","hr","finance"].includes(role);}
export function canManagePlanning(role:Session["role"]){return ["owner","area_manager","location_manager","planner","team_lead"].includes(role);}
