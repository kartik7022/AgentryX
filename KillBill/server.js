const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const KILLBILL_URL = process.env.KILLBILL_URL || "http://localhost:8080";
const KAUI_URL = process.env.KAUI_URL || "http://localhost:9090";
const KILLBILL_ADMIN_USER = process.env.KILLBILL_ADMIN_USER || "admin";
const KILLBILL_ADMIN_PASSWORD = process.env.KILLBILL_ADMIN_PASSWORD || "password";
const DB_PATH = path.join(__dirname, "app-db.json");

async function readDb() {
  try { return JSON.parse(await fs.readFile(DB_PATH, "utf8")); }
  catch (e) { if (e.code === "ENOENT") return { users: [] }; throw e; }
}

async function writeDb(db) {
  await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2));
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, expectedHash] = stored.split(":");
  const actualHash = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHash, "hex");
  return expected.length === actualHash.length && crypto.timingSafeEqual(expected, actualHash);
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
}

async function createKillBillTenant(companyName) {
  const apiKey = `${slugify(companyName) || "tenant"}_${crypto.randomBytes(4).toString("hex")}`;
  const apiSecret = crypto.randomBytes(18).toString("base64url");
  const auth = Buffer.from(`${KILLBILL_ADMIN_USER}:${KILLBILL_ADMIN_PASSWORD}`).toString("base64");

  const response = await fetch(`${KILLBILL_URL}/1.0/kb/tenants?useGlobalDefault=true`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Killbill-CreatedBy": "demo-app",
    },
    body: JSON.stringify({ apiKey, apiSecret }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Kill Bill tenant creation failed (${response.status}): ${body}`);
  }

  const location = response.headers.get("location") || "";
  const tenantId = location.split("/").pop() || null;
  return { tenantId, apiKey, apiSecret };
}

async function registerTenantInKaui(companyName, apiKey, apiSecret) {
  const auth = Buffer.from(`${KILLBILL_ADMIN_USER}:${KILLBILL_ADMIN_PASSWORD}`).toString("base64");
  try {
    await fetch(`${KAUI_URL}/kaui/tenants`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `tenant[name]=${encodeURIComponent(companyName)}&tenant[api_key]=${encodeURIComponent(apiKey)}&tenant[api_secret]=${encodeURIComponent(apiSecret)}`,
    });
  } catch (e) {
    console.log("KAUI registration note:", e.message);
  }
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(body));
}

function sendHtml(res, html) {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

const HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>BillFlow — Multi-Tenant Billing</title>
  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:ital,wght@0,300;0,400;0,500;1,300&display=swap" rel="stylesheet"/>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #0a0a0f; --surface: #13131a; --surface2: #1c1c26;
      --border: #2a2a3a; --accent: #7c6af7; --accent2: #f7a26a;
      --green: #4ade80; --red: #f87171; --text: #f0f0f8; --muted: #7070a0;
      --font-head: 'Syne', sans-serif; --font-body: 'DM Sans', sans-serif;
    }
    body { background: var(--bg); color: var(--text); font-family: var(--font-body); min-height: 100vh; display: flex; align-items: center; justify-content: center; overflow-x: hidden; }
    body::before { content: ''; position: fixed; inset: 0; background-image: linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px); background-size: 40px 40px; opacity: 0.3; pointer-events: none; }
    body::after { content: ''; position: fixed; width: 600px; height: 600px; background: radial-gradient(circle, rgba(124,106,247,0.15) 0%, transparent 70%); top: -200px; left: -200px; pointer-events: none; }
    .orb2 { position: fixed; width: 500px; height: 500px; background: radial-gradient(circle, rgba(247,162,106,0.1) 0%, transparent 70%); bottom: -200px; right: -100px; pointer-events: none; }
    .container { width: 100%; max-width: 480px; padding: 24px; position: relative; z-index: 1; animation: fadeUp 0.6s ease both; }
    @keyframes fadeUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
    .logo { display: flex; align-items: center; gap: 10px; margin-bottom: 36px; }
    .logo-icon { width: 40px; height: 40px; background: linear-gradient(135deg, var(--accent), var(--accent2)); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 18px; }
    .logo-text { font-family: var(--font-head); font-size: 22px; font-weight: 800; letter-spacing: -0.5px; }
    .logo-text span { color: var(--accent); }
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: 20px; padding: 36px; }
    .tabs { display: flex; background: var(--surface2); border-radius: 10px; padding: 4px; margin-bottom: 32px; }
    .tab { flex: 1; padding: 10px; border: none; background: none; color: var(--muted); font-family: var(--font-body); font-size: 14px; font-weight: 500; cursor: pointer; border-radius: 7px; transition: all 0.2s; }
    .tab.active { background: var(--accent); color: white; }
    .form-title { font-family: var(--font-head); font-size: 24px; font-weight: 700; margin-bottom: 6px; }
    .form-subtitle { color: var(--muted); font-size: 14px; margin-bottom: 28px; line-height: 1.5; }
    .field { margin-bottom: 16px; }
    .field label { display: block; font-size: 13px; font-weight: 500; color: var(--muted); margin-bottom: 8px; letter-spacing: 0.3px; }
    .field input { width: 100%; padding: 13px 16px; background: var(--surface2); border: 1px solid var(--border); border-radius: 10px; color: var(--text); font-family: var(--font-body); font-size: 15px; outline: none; transition: border-color 0.2s, box-shadow 0.2s; }
    .field input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(124,106,247,0.15); }
    .field input::placeholder { color: var(--muted); }
    .btn { width: 100%; padding: 14px; background: linear-gradient(135deg, var(--accent), #9b8cf9); border: none; border-radius: 10px; color: white; font-family: var(--font-head); font-size: 16px; font-weight: 700; cursor: pointer; margin-top: 8px; transition: opacity 0.2s, transform 0.1s; }
    .btn:hover { opacity: 0.9; } .btn:active { transform: scale(0.99); } .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .result { margin-top: 20px; padding: 16px; border-radius: 10px; font-size: 13px; line-height: 1.7; display: none; }
    .result.success { background: rgba(74,222,128,0.08); border: 1px solid rgba(74,222,128,0.25); display: block; }
    .result.error { background: rgba(248,113,113,0.08); border: 1px solid rgba(248,113,113,0.25); display: block; }
    .result-label { font-weight: 600; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; }
    .result.success .result-label { color: var(--green); } .result.error .result-label { color: var(--red); }
    .result-row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
    .result-row:last-child { border-bottom: none; }
    .result-key { color: var(--muted); } .result-val { color: var(--text); font-weight: 500; word-break: break-all; text-align: right; max-width: 60%; }
    .kb-badge { margin-top: 20px; padding: 12px 16px; background: rgba(124,106,247,0.08); border: 1px solid rgba(124,106,247,0.2); border-radius: 10px; font-size: 12px; color: var(--muted); display: flex; align-items: center; gap: 8px; }
    .kb-badge strong { color: var(--accent); }
    .spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 0.7s linear infinite; vertical-align: middle; margin-right: 6px; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .panel { display: none; } .panel.active { display: block; }
  </style>
</head>
<body>
<div class="orb2"></div>
<div class="container">
  <div class="logo">
    <div class="logo-icon">:zap:</div>
    <div class="logo-text">Bill<span>Flow</span></div>
  </div>
  <div class="card">
    <div class="tabs">
      <button class="tab active" onclick="switchTab('signup')">Create Account</button>
      <button class="tab" onclick="switchTab('login')">Sign In</button>
    </div>
    <div id="panel-signup" class="panel active">
      <div class="form-title">Start your free trial</div>
      <div class="form-subtitle">Your company gets a dedicated billing workspace in Kill Bill — automatically.</div>
      <div class="field"><label>COMPANY NAME</label><input id="s-company" type="text" placeholder="Acme Corp"/></div>
      <div class="field"><label>WORK EMAIL</label><input id="s-email" type="email" placeholder="you@company.com"/></div>
      <div class="field"><label>PASSWORD</label><input id="s-password" type="password" placeholder="Min. 8 characters"/></div>
      <button class="btn" id="signup-btn" onclick="signup()">Create Account & Workspace</button>
      <div id="signup-result" class="result"></div>
      <div class="kb-badge">:zap: A <strong>Kill Bill tenant</strong> is automatically created for your company when you sign up.</div>
    </div>
    <div id="panel-login" class="panel">
      <div class="form-title">Welcome back</div>
      <div class="form-subtitle">Sign in to access your company billing dashboard.</div>
      <div class="field"><label>WORK EMAIL</label><input id="l-email" type="email" placeholder="you@company.com"/></div>
      <div class="field"><label>PASSWORD</label><input id="l-password" type="password" placeholder="Your password"/></div>
      <button class="btn" id="login-btn" onclick="login()">Sign In</button>
      <div id="login-result" class="result"></div>
    </div>
  </div>
</div>
<script>
function switchTab(tab) {
  document.querySelectorAll('.tab').forEach((t,i) => t.classList.toggle('active',(i===0&&tab==='signup')||(i===1&&tab==='login')));
  document.getElementById('panel-signup').classList.toggle('active',tab==='signup');
  document.getElementById('panel-login').classList.toggle('active',tab==='login');
}
function setLoading(btn,loading,text){ btn.disabled=loading; btn.innerHTML=loading?'<span class="spinner"></span>'+text:text; }
function showResult(id,type,data){
  const el=document.getElementById(id); el.className='result '+type;
  if(type==='error'){ el.innerHTML='<div class="result-label">:x: '+(data.error||'Something went wrong')+'</div>'; return; }
  let rows='';
  if(data.user){
    rows+=row('Company',data.user.companyName);
    rows+=row('Email',data.user.email);
    rows+=row('Role',data.user.role);
    if(data.user.killbillTenant){
      rows+=row('KB Tenant ID',data.user.killbillTenant.tenantId?.slice(0,18)+'...');
      rows+=row('KB API Key',data.user.killbillTenant.apiKey);
    }
  }
  el.innerHTML='<div class="result-label">:white_check_mark: '+data.message+'</div>'+rows;
}
function row(k,v){ return '<div class="result-row"><span class="result-key">'+k+'</span><span class="result-val">'+v+'</span></div>'; }
async function signup(){
  const btn=document.getElementById('signup-btn');
  const company=document.getElementById('s-company').value.trim();
  const email=document.getElementById('s-email').value.trim();
  const password=document.getElementById('s-password').value;
  if(!company||!email||!password){ showResult('signup-result','error',{error:'Please fill in all fields'}); return; }
  setLoading(btn,true,'Creating workspace...');
  try{
    const r=await fetch('/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({companyName:company,email,password})});
    const data=await r.json();
    showResult('signup-result',r.ok?'success':'error',data);
  }catch(e){ showResult('signup-result','error',{error:'Could not reach server'}); }
  setLoading(btn,false,'Create Account & Workspace');
}
async function login(){
  const btn=document.getElementById('login-btn');
  const email=document.getElementById('l-email').value.trim();
  const password=document.getElementById('l-password').value;
  if(!email||!password){ showResult('login-result','error',{error:'Please fill in all fields'}); return; }
  setLoading(btn,true,'Signing in...');
  try{
    const r=await fetch('/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
    const data=await r.json();
    showResult('login-result',r.ok?'success':'error',data);
  }catch(e){ showResult('login-result','error',{error:'Could not reach server'}); }
  setLoading(btn,false,'Sign In');
}
</script>
</body>
</html>`;

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/") { sendHtml(res, HTML); return; }

    if (req.method === "POST" && req.url === "/signup") {
      const { companyName, email, password } = await readJson(req);
      if (!companyName || !email || !password) { sendJson(res, 400, { error: "All fields required" }); return; }
      const db = await readDb();
      if (db.users.some(u => u.email.toLowerCase() === email.toLowerCase())) { sendJson(res, 409, { error: "Email already registered. Please sign in." }); return; }
      const tenant = await createKillBillTenant(companyName);
      await registerTenantInKaui(companyName, tenant.apiKey, tenant.apiSecret);
      const user = { id: crypto.randomUUID(), email, companyName, passwordHash: hashPassword(password), killbillTenant: tenant, role: "owner", createdAt: new Date().toISOString() };
      db.users.push(user);
      await writeDb(db);
      sendJson(res, 201, { message: "Account created! Kill Bill workspace is ready.", user: { id: user.id, email, companyName, role: "owner", killbillTenant: tenant } });
      return;
    }

    if (req.method === "POST" && req.url === "/login") {
      const { email, password } = await readJson(req);
      const db = await readDb();
      const user = db.users.find(u => u.email.toLowerCase() === String(email||"").toLowerCase());
      if (!user || !verifyPassword(password||"", user.passwordHash)) { sendJson(res, 401, { error: "Invalid email or password" }); return; }
      sendJson(res, 200, { message: "Login successful! Your Kill Bill workspace is active.", user: { id: user.id, email: user.email, companyName: user.companyName, role: user.role, killbillTenant: user.killbillTenant } });
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
});

server.listen(PORT, () => console.log(`BillFlow demo running at http://localhost:${PORT}`));