import fs from "node:fs";
import assert from "node:assert/strict";

const html=fs.readFileSync(new URL("../kwinest/index.html",import.meta.url),"utf8");
const emailConnection=fs.readFileSync(new URL("../supabase/functions/email-connection/index.ts",import.meta.url),"utf8");
const sendInvoice=fs.readFileSync(new URL("../supabase/functions/send-invoice/index.ts",import.meta.url),"utf8");
const googleCallback=fs.readFileSync(new URL("../public/oauth/google/callback/index.html",import.meta.url),"utf8");

assert.ok(html.includes("Doorgaan met Google"),"Login/register must expose Google sign-in");
assert.ok(html.includes("async function loginWithGoogle()"),"Google sign-in handler must exist");
assert.ok(html.includes("auth.signInWithOAuth({provider:'google'"),"Google sign-in must use Supabase Auth");
assert.ok(html.includes("scopes:'openid email profile'"),"Google login must request only identity scopes");

const googleLogin=html.slice(html.indexOf("async function loginWithGoogle()"),html.indexOf("async function registerUser(e)"));
assert.ok(!googleLogin.includes("gmail.send"),"Google login must never request Gmail send permission");
assert.ok(!googleLogin.includes("gmail.read"),"Google login must never request Gmail read permission");
assert.ok(!googleLogin.includes("gmail.modify"),"Google login must never request Gmail modify permission");

assert.ok(emailConnection.includes("https://www.googleapis.com/auth/gmail.send"),"Mailbox connection must request gmail.send");
assert.ok(!emailConnection.includes("https://www.googleapis.com/auth/gmail.readonly"),"Mailbox connection must not request inbox read scope");
assert.ok(!emailConnection.includes("https://www.googleapis.com/auth/gmail.modify"),"Mailbox connection must not request modify scope");
assert.ok(emailConnection.includes("access_type","offline")||emailConnection.includes("access_type:'offline'")||emailConnection.includes('access_type:"offline"'),"Mailbox OAuth must request offline access");
assert.ok(emailConnection.includes("prompt","consent")||emailConnection.includes("prompt:'consent'")||emailConnection.includes('prompt:"consent"'),"Mailbox OAuth must explicitly request consent for refresh token");
assert.ok(emailConnection.includes("https://boekuna.nl/oauth/google/callback"),"Gmail OAuth must use the production Boekuna callback");

assert.ok(sendInvoice.includes("https://gmail.googleapis.com/gmail/v1/users/me/messages/send"),"Invoice sender must use Gmail messages.send");
assert.ok(sendInvoice.includes("refresh_token"),"Invoice sender must refresh Google access tokens server-side");
assert.ok(sendInvoice.includes("GMAIL_NOT_CONNECTED"),"Invoice send must fail closed without a mailbox connection");

assert.ok(googleCallback.includes("email-connection"),"Google callback must complete through the secure email connection function");

console.log("Google Auth / Gmail scope separation: PASS");
