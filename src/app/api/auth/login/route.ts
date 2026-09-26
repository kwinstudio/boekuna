import { NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { query } from "@/lib/db";
import { createSession } from "@/lib/auth";
export async function POST(request:Request){const form=await request.formData();const email=String(form.get("email")||"").trim().toLowerCase();const password=String(form.get("password")||"");const result=await query<any>(`select u.id,u.email,u.password_hash,m.organisation_id,m.role from users u join memberships m on m.user_id=u.id where u.email=$1 and m.status='active' order by m.created_at asc limit 1`,[email]);const user=result.rows[0];if(!user||!(await compare(password,user.password_hash)))return NextResponse.redirect(new URL("/login?error=invalid",request.url),303);await createSession({userId:user.id,organisationId:user.organisation_id,role:user.role,email:user.email});return NextResponse.redirect(new URL("/app",request.url),303);}
