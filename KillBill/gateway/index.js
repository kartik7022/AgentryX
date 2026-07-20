require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const https = require("https");
const fs2 = require("fs");
const path = require("path");
const { Server } = require("socket.io");
const Stripe = require("stripe");
const nodemailer = require("nodemailer");
const cron = require("node-cron");
const { syncPlanToCatalog } = require("./catalog-sync");

const app = express();
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:3002",
      "http://localhost:3003",
      "http://localhost:4000",
    ],
    credentials: true,
  }),
);
app.use(express.json());

const AUTH = Buffer.from(
  `${process.env.KB_USERNAME || "admin"}:${process.env.KB_PASSWORD || "password"}`,
).toString("base64");
const RAZORPAY_KEY_ID =
  process.env.RAZORPAY_KEY_ID || "";
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "";
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const stripe = STRIPE_SECRET_KEY ? Stripe(STRIPE_SECRET_KEY) : null;
const GMAIL_USER = process.env.GMAIL_USER || "";
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD || "";
const MAIL_FROM_NAME = process.env.MAIL_FROM_NAME || "AgentryX";
const MAIL_FROM_EMAIL =
  process.env.MAIL_FROM_EMAIL || GMAIL_USER || "no-reply@example.com";
const TEST_EMAIL_TO = process.env.TEST_EMAIL_TO || "";
const USAGE_FILE = path.join(__dirname, "usage-data.json");
const PLANS_FILE = path.join(__dirname, "plans.json");
const Database = require("better-sqlite3");
const trialDb = new Database(path.join(__dirname, "trial-usage.db"));
trialDb.exec(`
  CREATE TABLE IF NOT EXISTS trial_usage (
    account_id TEXT NOT NULL,
    module_key TEXT NOT NULL,
    used_at TEXT NOT NULL,
    PRIMARY KEY (account_id, module_key)
  );
`);
function tryClaimTrial(accountId, moduleKey) {
  try {
    const result = trialDb
      .prepare(
        "INSERT OR IGNORE INTO trial_usage (account_id, module_key, used_at) VALUES (?, ?, ?)",
      )
      .run(accountId, moduleKey, new Date().toISOString());
    return result.changes === 1;
  } catch (e) {
    console.error("[TrialUsage] Claim failed:", e.message);
    return false;
  }
}
function releaseTrialClaim(accountId, moduleKey) {
  try {
    trialDb
      .prepare(
        "DELETE FROM trial_usage WHERE account_id = ? AND module_key = ?",
      )
      .run(accountId, moduleKey);
  } catch (e) {
    console.error("[TrialUsage] Release failed:", e.message);
  }
}

const transporter =
  GMAIL_USER && GMAIL_APP_PASSWORD
    ? nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: GMAIL_USER,
          pass: GMAIL_APP_PASSWORD,
        },
      })
    : null;

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:3002",
      "http://localhost:3003",
      "http://localhost:4000",
    ],
    credentials: true,
  },
});

function broadcastEvent(event) {
  io.emit("billing_event", event);
}
io.on("connection", (socket) => {
  console.log("Socket.IO client connected");
  socket.emit("billing_event", {
    type: "connected",
    message: "Realtime billing events connected",
  });
  socket.on("disconnect", () => console.log("Socket.IO client disconnected"));
});

const DEFAULT_PLANS = [
  {
    id: "email-validate-basic",
    name: "Email Validate Basic",
    module: "email_validate",
    billingPeriod: "MONTHLY",
    trialDays: 14,
    price: 0,
    currency: "INR",
    description: "Free plan",
    active: true,
    usageBilling: false,
  },
  {
    id: "email-validate-standard",
    name: "Email Validate Standard",
    module: "email_validate",
    billingPeriod: "MONTHLY",
    trialDays: 10,
    price: 300,
    currency: "INR",
    description: "Standard plan",
    active: true,
    usageBilling: false,
  },
  {
    id: "email-validate-pro",
    name: "Email Validate Pro",
    module: "email_validate",
    billingPeriod: "MONTHLY",
    trialDays: 7,
    price: 500,
    currency: "INR",
    description: "Pro plan",
    active: true,
    usageBilling: false,
  },
  {
    id: "data-basic",
    name: "Data Basic",
    module: "data",
    billingPeriod: "MONTHLY",
    trialDays: 14,
    price: 0,
    currency: "INR",
    description: "Free plan",
    active: true,
    usageBilling: false,
  },
  {
    id: "data-standard",
    name: "Data Standard",
    module: "data",
    billingPeriod: "MONTHLY",
    trialDays: 10,
    price: 300,
    currency: "INR",
    description: "Standard plan",
    active: true,
    usageBilling: false,
  },
  {
    id: "data-pro",
    name: "Data Pro",
    module: "data",
    billingPeriod: "MONTHLY",
    trialDays: 7,
    price: 500,
    currency: "INR",
    description: "Pro plan",
    active: true,
    usageBilling: false,
  },
  {
    id: "sql-query-basic",
    name: "SQL Query Basic",
    module: "sql_query",
    billingPeriod: "MONTHLY",
    trialDays: 14,
    price: 0,
    currency: "INR",
    description: "Free plan",
    active: true,
    usageBilling: false,
  },
  {
    id: "sql-query-standard",
    name: "SQL Query Standard",
    module: "sql_query",
    billingPeriod: "MONTHLY",
    trialDays: 10,
    price: 300,
    currency: "INR",
    description: "Standard plan",
    active: true,
    usageBilling: false,
  },
  {
    id: "sql-query-pro",
    name: "SQL Query Pro",
    module: "sql_query",
    billingPeriod: "MONTHLY",
    trialDays: 7,
    price: 500,
    currency: "INR",
    description: "Pro plan",
    active: true,
    usageBilling: false,
  },
];
function loadPlans() {
  try {
    if (fs2.existsSync(PLANS_FILE))
      return JSON.parse(fs2.readFileSync(PLANS_FILE, "utf8"));
  } catch (e) {}
  return DEFAULT_PLANS;
}
function savePlans(plans) {
  fs2.writeFileSync(PLANS_FILE, JSON.stringify(plans, null, 2));
}
if (!fs2.existsSync(PLANS_FILE)) {
  savePlans(DEFAULT_PLANS);
  console.log("Plans file initialized");
}

// ── Kill Bill Catalog Sync ────────────────────────────────────────────────────
function generateCatalogXML(plans) {
  const activePlans = plans.filter((p) => p.active);
  const now = new Date().toISOString();
  const products = [
    ...new Set(activePlans.map((p) => p.module.replace(/ /g, ""))),
  ];

  const productXML = products
    .map(
      (prod) => `        <product name="${prod}" prettyName="${prod}">
            <category>BASE</category>
            <included/>
            <available/>
            <limits/>
        </product>`,
    )
    .join("\n");

  const planXML = activePlans
    .map((p) => {
      const prodName = p.module.replace(/ /g, "");
      const trialPhase =
        p.trialDays > 0
          ? `
                    <initialPhases>
                        <phase type="TRIAL">
                            <duration>
                                <unit>DAYS</unit>
                                <number>${p.trialDays}</number>
                            </duration>
                            <fixed type="ONE_TIME">
                                <fixedPrice>
                                    <price>
                                        <currency>${p.currency || "INR"}</currency>
                                        <value>0</value>
                                    </price>
                                </fixedPrice>
                            </fixed>
                            <usages/>
                        </phase>
                    </initialPhases>`
          : `
                    <initialPhases/>`;

      return `                <plan name="${p.id}" prettyName="${p.id}">
                    <product>${prodName}</product>
                    <recurringBillingMode>IN_ADVANCE</recurringBillingMode>${trialPhase}
                    <finalPhase type="EVERGREEN">
                        <duration>
                            <unit>UNLIMITED</unit>
                            <number>-1</number>
                        </duration>
                        <recurring>
                            <billingPeriod>MONTHLY</billingPeriod>
                            <recurringPrice>
                                <price>
                                    <currency>${p.currency || "INR"}</currency>
                                    <value>${p.price}</value>
                                </price>
                            </recurringPrice>
                        </recurring>
                        <usages/>
                    </finalPhase>
                    <plansAllowedInBundle>-1</plansAllowedInBundle>
                </plan>`;
    })
    .join("\n");

  const planListXML = activePlans
    .map((p) => `                        <plan>${p.id}</plan>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<catalog xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:noNamespaceSchemaLocation="CatalogSchema.xsd">
    <effectiveDate>${now}</effectiveDate>
    <catalogName>KillBillPortal</catalogName>
    <recurringBillingMode>IN_ADVANCE</recurringBillingMode>
    <currencies>
        <currency>INR</currency>
    </currencies>
    <units/>
    <products>
${productXML}
    </products>
    <rules>
        <changePolicy>
            <changePolicyCase>
                <policy>IMMEDIATE</policy>
            </changePolicyCase>
        </changePolicy>
        <changeAlignment>
            <changeAlignmentCase>
                <alignment>START_OF_BUNDLE</alignment>
            </changeAlignmentCase>
        </changeAlignment>
        <cancelPolicy>
            <cancelPolicyCase>
                <policy>IMMEDIATE</policy>
            </cancelPolicyCase>
        </cancelPolicy>
        <createAlignment>
            <createAlignmentCase>
                <alignment>START_OF_BUNDLE</alignment>
            </createAlignmentCase>
        </createAlignment>
        <billingAlignment>
            <billingAlignmentCase>
                <alignment>ACCOUNT</alignment>
            </billingAlignmentCase>
        </billingAlignment>
        <priceList>
            <priceListCase>
                <toPriceList>DEFAULT</toPriceList>
            </priceListCase>
        </priceList>
    </rules>
    <plans>
${planXML}
    </plans>
    <priceLists>
        <defaultPriceList name="DEFAULT" prettyName="DEFAULT">
            <plans>
${planListXML}
            </plans>
        </defaultPriceList>
    </priceLists>
</catalog>`;
}

async function syncCatalogToKillBill(plans) {
  try {
    const xml = generateCatalogXML(plans);
    const xmlBuffer = Buffer.from(xml, "utf8");
    return new Promise((resolve) => {
      const options = {
        hostname: process.env.KB_HOST || "127.0.0.1",
        port: 8080,
        path: "/1.0/kb/catalog/xml",
        method: "POST",
        headers: {
          Authorization: "Basic " + AUTH,
          "X-Killbill-ApiKey": process.env.KB_API_KEY || "admin",
          "X-Killbill-ApiSecret": process.env.KB_API_SECRET || "password",
          "X-Killbill-CreatedBy": "admin-portal",
          "Content-Type": "text/xml",
          "Content-Length": xmlBuffer.length,
        },
      };
      const req = http.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          console.log(
            "[Catalog] Sync status:",
            res.statusCode,
            data.substring(0, 200),
          );
          resolve({ status: res.statusCode, body: data });
        });
      });
      req.on("error", (err) => {
        console.error("[Catalog] Sync error:", err.message);
        resolve({ status: 500, error: err.message });
      });
      req.write(xmlBuffer);
      req.end();
    });
  } catch (err) {
    console.error("[Catalog] Generate error:", err.message);
    return { status: 500, error: err.message };
  }
}

// ── Plans API ─────────────────────────────────────────────────────────────────
app.get("/api/plans", (req, res) => {
  const plans = loadPlans();
  const { module: mod, active } = req.query;
  let filtered = plans;
  if (mod) filtered = filtered.filter((p) => p.module === mod);
  if (active === "true") filtered = filtered.filter((p) => p.active);
  res.json(filtered);
});

app.get("/api/modules/active", async (req, res) => {
  try {
    const flowRes = await new Promise((resolve) => {
      const url = new URL(
        `${process.env.FLOWENGINE_URL || "http://localhost:8000"}/admin/modules/public/list-all`,
      );
      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: "GET",
      };
      const r = http.request(options, (r2) => {
        let data = "";
        r2.on("data", (c) => (data += c));
        r2.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(null);
          }
        });
      });
      r.on("error", () => resolve(null));
      r.end();
    });
    if (!flowRes)
      return res.status(502).json({ error: "FlowEngine unreachable" });
    res.json(flowRes.modules || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.get("/api/plans/modules", async (req, res) => {
  const activeModuleNames = await new Promise((resolve) => {
    const url = new URL(
      `${process.env.FLOWENGINE_URL || "http://localhost:8000"}/admin/modules/public/list`,
    );
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: "GET",
    };
    const r = http.request(options, (r2) => {
      let data = "";
      r2.on("data", (c) => (data += c));
      r2.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          resolve((parsed.modules || []).map((m) => m.name));
        } catch (e) {
          resolve(null);
        }
      });
    });
    r.on("error", () => resolve(null));
    r.end();
  });
  if (activeModuleNames === null)
    return res.status(502).json({ error: "Could not verify active modules — try again" });

  const plans = loadPlans().filter((p) => p.active);
  const grouped = {};
  plans.forEach((p) => {
    if (!activeModuleNames.includes(p.module)) return;
    if (!grouped[p.module]) grouped[p.module] = [];
    grouped[p.module].push(p);
  });
  res.json(grouped);
});

app.post("/api/plans", async (req, res) => {
  const plans = loadPlans();
  const plan = {
    ...req.body,
    id: req.body.id || req.body.name.toLowerCase().replace(/\s+/g, "-"),
    createdAt: new Date().toISOString(),
  };
  if (plans.find((p) => p.id === plan.id))
    return res.status(409).json({ error: "Plan ID already exists" });
  plans.push(plan);
  savePlans(plans);
  broadcastEvent({ type: "plan.created", plan });
  const sync = await syncPlanToCatalog(plans, AUTH);
  console.log(
    "[Plan] Created:",
    plan.id,
    "— Catalog sync:",
    sync.status,
    sync.body || sync.reason || sync.error || "",
  );
  res.status(201).json({ ...plan, catalogSync: sync.status });
});

app.put("/api/plans/:id", async (req, res) => {
  const plans = loadPlans();
  const idx = plans.findIndex((p) => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Plan not found" });
  plans[idx] = { ...plans[idx], ...req.body, id: req.params.id };
  savePlans(plans);
  broadcastEvent({ type: "plan.updated", plan: plans[idx] });
  const sync = await syncCatalogToKillBill(plans);
  console.log(
    "[Plan] Updated and synced to KB:",
    req.params.id,
    "KB status:",
    sync.status,
  );
  res.json({ ...plans[idx], catalogSync: sync.status });
});

app.delete("/api/plans/:id", async (req, res) => {
  const plans = loadPlans();
  const filtered = plans.filter((p) => p.id !== req.params.id);
  if (filtered.length === plans.length)
    return res.status(404).json({ error: "Plan not found" });
  savePlans(filtered);
  broadcastEvent({ type: "plan.deleted", planId: req.params.id });
  const sync = await syncCatalogToKillBill(filtered);
  console.log(
    "[Plan] Deleted and synced to KB:",
    req.params.id,
    "KB status:",
    sync.status,
  );
  res.json({ success: true, catalogSync: sync.status });
});

// ── Billing Config (real backend storage, replaces localStorage) ─────────────
const CONFIG_FILE = path.join(__dirname, "billing-config.json");

const DEFAULT_BILLING_CONFIG = {
  currency: "INR",
  gracePeriodDays: 7,
  paymentRetryDays: [1, 3, 7],
  invoicePrefix: "INV",
  taxRate: 18,
  autoPayEnabled: true,
  trialReminderDays: 3,
  dunningEnabled: true,
  dunningMaxRetries: 3,
  timezone: "Asia/Kolkata",
  invoiceFooter: "Thank you for your business.",
};

function loadBillingConfig() {
  try {
    if (fs2.existsSync(CONFIG_FILE))
      return {
        ...DEFAULT_BILLING_CONFIG,
        ...JSON.parse(fs2.readFileSync(CONFIG_FILE, "utf8")),
      };
  } catch (e) {}
  return DEFAULT_BILLING_CONFIG;
}
function saveBillingConfig(config) {
  fs2.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}
if (!fs2.existsSync(CONFIG_FILE)) {
  saveBillingConfig(DEFAULT_BILLING_CONFIG);
  console.log("Billing config file initialized");
}

app.get("/api/config", (req, res) => {
  res.json(loadBillingConfig());
});

app.put("/api/config", (req, res) => {
  const updated = { ...loadBillingConfig(), ...req.body };
  saveBillingConfig(updated);
  broadcastEvent({ type: "config.updated", config: updated });
  console.log("[Config] Billing config updated");
  res.json(updated);
});

// ── Email helper ──────────────────────────────────────────────────────────────
async function sendEmail({ to, subject, html }) {
  if (!transporter || !to) {
    console.warn(
      "[Email] Skipping email; SMTP credentials or recipient are not configured.",
    );
    return { success: false, skipped: true, error: "email_not_configured" };
  }

  try {
    const info = await transporter.sendMail({
      from: `"${MAIL_FROM_NAME}" <${MAIL_FROM_EMAIL}>`,
      to,
      subject,
      html,
    });
    console.log("Email sent:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error("Email error:", err.message);
    return { success: false, error: err.message };
  }
}
const PAYMENT_RECEIPT_EMAIL = {
  subject: (planName) => `Payment receipt — ${planName}`,
  html: (name, planName, amount, currency, provider, paymentId) => `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
      <div style="background:#10B981;padding:20px;border-radius:12px 12px 0 0;text-align:center">
        <h1 style="color:white;margin:0">✓ Payment Successful</h1>
      </div>
      <div style="background:#f9fafb;padding:30px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb">
        <h2 style="color:#111827">Hi ${name},</h2>
        <p style="color:#374151">Your payment for <strong>${planName}</strong> was successful. Here's your receipt:</p>
        <div style="background:white;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:20px 0">
          <table style="width:100%;font-size:14px;color:#374151">
            <tr><td style="padding:6px 0;color:#6b7280">Plan</td><td style="padding:6px 0;text-align:right;font-weight:600">${planName}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280">Amount</td><td style="padding:6px 0;text-align:right;font-weight:600">${currency === "USD" ? "$" : "₹"}${Number(amount).toFixed(2)}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280">Payment Method</td><td style="padding:6px 0;text-align:right;font-weight:600;text-transform:capitalize">${provider}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280">Transaction ID</td><td style="padding:6px 0;text-align:right;font-family:monospace;font-size:12px">${paymentId}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280">Date</td><td style="padding:6px 0;text-align:right">${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</td></tr>
          </table>
        </div>
        <a href="http://localhost:3000/billing" style="display:block;background:#10B981;color:white;text-align:center;padding:12px;border-radius:8px;text-decoration:none;font-weight:600">View Subscription</a>
        <p style="color:#6b7280;margin-top:20px;font-size:13px">Keep this email as your payment receipt. If you didn't make this payment, please contact support immediately.</p>
        <p style="color:#6b7280;margin-top:10px">— Kill Bill Portal Team</p>
      </div>
    </div>`,
};

const BILLING_EMAILS = {
  trial_welcome: {
    subject: "Your trial has started — welcome!",
    html: (name, plan) =>
      `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px"><div style="background:#4F46E5;padding:20px;border-radius:12px 12px 0 0;text-align:center"><h1 style="color:white;margin:0">Kill Bill Portal</h1></div><div style="background:#f9fafb;padding:30px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb"><h2 style="color:#111827">Hi ${name},</h2><p style="color:#374151">Your <strong>${plan}</strong> trial is now active. You have full access for the next 14 days.</p><p style="color:#374151">No charge until your trial ends.</p><a href="http://localhost:3000" style="display:block;background:#4F46E5;color:white;text-align:center;padding:12px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:20px">Go to Dashboard</a><p style="color:#6b7280;margin-top:20px">— Kill Bill Portal Team</p></div></div>`,
  },
  trial_ending: {
    subject: "Your trial ends in 3 days — upgrade now",
    html: (name, plan) =>
      `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px"><div style="background:#F59E0B;padding:20px;border-radius:12px 12px 0 0;text-align:center"><h1 style="color:white;margin:0">Trial Ending Soon</h1></div><div style="background:#f9fafb;padding:30px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb"><h2 style="color:#111827">Hi ${name},</h2><p style="color:#374151">Your <strong>${plan}</strong> trial ends in <strong>3 days</strong>. Upgrade now to keep access.</p><a href="http://localhost:3000" style="display:block;background:#F59E0B;color:white;text-align:center;padding:12px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:20px">Upgrade Now</a><p style="color:#6b7280;margin-top:20px">— Kill Bill Portal Team</p></div></div>`,
  },
  payment_overdue: {
    subject: "Action required — payment failed for your subscription",
    html: (name, plan) =>
      `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px"><div style="background:#EF4444;padding:20px;border-radius:12px 12px 0 0;text-align:center"><h1 style="color:white;margin:0">Payment Failed</h1></div><div style="background:#f9fafb;padding:30px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb"><h2 style="color:#111827">Hi ${name},</h2><p style="color:#374151">We were unable to process your payment for <strong>${plan}</strong>. Please update your payment method.</p><a href="http://localhost:3000/payment-methods" style="display:block;background:#EF4444;color:white;text-align:center;padding:12px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:20px">Update Payment Method</a><p style="color:#6b7280;margin-top:20px">— Kill Bill Portal Team</p></div></div>`,
  },
  cancelled: {
    subject: "Your subscription has been cancelled",
    html: (name, plan) =>
      `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px"><div style="background:#6B7280;padding:20px;border-radius:12px 12px 0 0;text-align:center"><h1 style="color:white;margin:0">Subscription Cancelled</h1></div><div style="background:#f9fafb;padding:30px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb"><h2 style="color:#111827">Hi ${name},</h2><p style="color:#374151">Your <strong>${plan}</strong> subscription has been cancelled. You can reactivate anytime.</p><a href="http://localhost:3000" style="display:block;background:#4F46E5;color:white;text-align:center;padding:12px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:20px">Reactivate Subscription</a><p style="color:#6b7280;margin-top:20px">— Kill Bill Portal Team</p></div></div>`,
  },
};

async function sendBillingEmail(type, toEmail, name, plan) {
  const template = BILLING_EMAILS[type];
  if (!template) return;
  console.log(`[BillingEmail] Sending ${type} to ${toEmail}`);
  return sendEmail({
    to: toEmail,
    subject: template.subject,
    html: template.html(name, plan),
  });
}

async function getKBAccount(accountId) {
  return new Promise((resolve) => {
    const options = {
      hostname: process.env.KB_HOST || "127.0.0.1",
      port: 8080,
      path: `/1.0/kb/accounts/${accountId}`,
      method: "GET",
      headers: {
        Authorization: "Basic " + AUTH,
        "X-Killbill-ApiKey": process.env.KB_API_KEY || "admin",
        "X-Killbill-ApiSecret": process.env.KB_API_SECRET || "password",
        Accept: "application/json",
      },
    };
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(null);
        }
      });
    });
    req.on("error", () => resolve(null));
    req.end();
  });
}
async function getKBInvoice(invoiceId) {
  return new Promise((resolve) => {
    const options = {
      hostname: process.env.KB_HOST || "127.0.0.1",
      port: 8080,
      path: `/1.0/kb/invoices/${invoiceId}`,
      method: "GET",
      headers: {
        Authorization: "Basic " + AUTH,
        "X-Killbill-ApiKey": process.env.KB_API_KEY || "admin",
        "X-Killbill-ApiSecret": process.env.KB_API_SECRET || "password",
        Accept: "application/json",
      },
    };
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(null);
        }
      });
    });
    req.on("error", () => resolve(null));
    req.end();
  });
}
// ── Mautic Contact Sync ───────────────────────────────────────────────────────
// Pushes new customers into Mautic so they're ready for marketing campaigns,
// using HTTP Basic Auth (already enabled in Mautic's API settings).
const MAUTIC_URL = process.env.MAUTIC_URL || "http://localhost:3004";
const MAUTIC_USER = process.env.MAUTIC_USER || "admin";
const MAUTIC_PASS = process.env.MAUTIC_PASS || "";

async function syncContactToMautic(name, email, planName) {
  if (!email) return;
  try {
    const authHeader =
      "Basic " +
      Buffer.from(`${MAUTIC_USER}:${MAUTIC_PASS}`).toString("base64");
    const nameParts = (name || "").trim().split(" ");
    const firstname = nameParts[0] || "";
    const lastname = nameParts.slice(1).join(" ") || "";

    const body = JSON.stringify({
      firstname,
      lastname,
      email,
      tags: [planName || "subscriber"],
    });

    const result = await new Promise((resolve) => {
      const url = new URL(`${MAUTIC_URL}/api/contacts/new`);
      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      };
      const req = http.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(null);
          }
        });
      });
      req.on("error", (e) => {
        console.error("[Mautic] Sync error:", e.message);
        resolve(null);
      });
      req.write(body);
      req.end();
    });

    if (result && result.contact) {
      console.log("[Mautic] Contact synced:", email);
    } else {
      console.log(
        "[Mautic] Sync may have failed for",
        email,
        "-",
        JSON.stringify(result),
      );
    }
  } catch (err) {
    console.error("[Mautic] Sync error:", err.message);
  }
}
// ── Kill Bill Webhook ─────────────────────────────────────────────────────────
app.post("/api/webhooks/killbill", async (req, res) => {
  res.set("Connection", "close");
  try {
    const event = req.body;
    const eventType = event.eventType || event.metaData?.eventType;
    console.log("[Webhook] Kill Bill event received:", eventType);
    if (!eventType) return res.status(400).json({ error: "Missing eventType" });
    const accountId = event.accountId || event.account?.id || event.objectId;
    let email = "",
      name = "Customer",
      plan = "";
    if (accountId) {
      const acc = await getKBAccount(accountId);
      if (acc) {
        email = acc.email || "";
        name = acc.name || acc.externalKey || "Customer";
      }
    }
    plan = (
      event.planName ||
      event.metaData?.planName ||
      event.subscription?.planName ||
      ""
    )
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    if (email) {
      if (eventType === "SUBSCRIPTION_CREATION")
        await sendBillingEmail("trial_welcome", email, name, plan);
      else if (
        eventType === "SUBSCRIPTION_PHASE_TRIAL_ENDING" ||
        eventType === "TRIAL_ENDING"
      )
        await sendBillingEmail("trial_ending", email, name, plan);
      else if (
        eventType === "PAYMENT_FAILED" ||
        eventType === "INVOICE_PAYMENT_FAILED"
      )
        await sendBillingEmail("payment_overdue", email, name, plan);
      else if (
        eventType === "SUBSCRIPTION_CANCEL" ||
        eventType === "SUBSCRIPTION_CANCELLATION"
      )
        await sendBillingEmail("cancelled", email, name, plan);
    }
    io.emit("killbill_event", { eventType, accountId, plan });
    broadcastEvent({ type: "killbill_webhook", eventType, accountId });
    res.json({ received: true, eventType });
  } catch (err) {
    console.error("[Webhook] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/webhooks/register", async (req, res) => {
  return new Promise((resolve) => {
    const callbackUrl = process.env.KB_WEBHOOK_CALLBACK_URL;
    const options = {
      hostname: process.env.KB_HOST || "127.0.0.1",
      port: 8080,
      path: `/1.0/kb/tenants/registerNotificationCallback?cb=${encodeURIComponent(callbackUrl)}`,
      method: "POST",
      headers: {
        Authorization: "Basic " + AUTH,
        "X-Killbill-ApiKey": process.env.KB_API_KEY || "admin",
        "X-Killbill-ApiSecret": process.env.KB_API_SECRET || "password",
        "X-Killbill-CreatedBy": "admin",
        "Content-Type": "application/json",
        "Content-Length": 0,
      },
    };
    const kbReq = http.request(options, (kbRes) => {
      let data = "";
      kbRes.on("data", (chunk) => {
        data += chunk;
      });
      kbRes.on("end", () => {
        res.json({ status: kbRes.statusCode, body: data, callbackUrl });
        resolve();
      });
    });
    kbReq.on("error", (err) => {
      res.status(500).json({ error: err.message });
      resolve();
    });
    kbReq.end();
  });
});

app.post("/api/webhooks/test", async (req, res) => {
  const {
    type = "SUBSCRIPTION_CREATION",
    email,
    name = "Test User",
    plan = "Module A — Pro",
  } = req.body;
  if (!email) return res.status(400).json({ error: "email required" });
  await sendBillingEmail(
    type === "SUBSCRIPTION_CREATION"
      ? "trial_welcome"
      : type === "TRIAL_ENDING"
        ? "trial_ending"
        : type === "PAYMENT_FAILED"
          ? "payment_overdue"
          : "cancelled",
    email,
    name,
    plan,
  );
  res.json({ sent: true, type, to: email });
});

// ── Payment Reminder Routes ───────────────────────────────────────────────────
app.post("/api/reminders/send", async (req, res) => {
  const { to, customerName, planName, amount, dueDate, type, currency } =
    req.body;
  if (!to || !type)
    return res.status(400).json({ error: "to and type required" });
  const currencySymbol = currency === "USD" ? "$" : "₹";
  const isOverdue = type === "overdue";
  const isDueSoon = type === "due_soon";
  const subject = isOverdue
    ? `Action Required: Payment overdue for ${planName}`
    : isDueSoon
      ? `Reminder: Payment due soon for ${planName}`
      : `Invoice generated for ${planName}`;
  const color = isOverdue ? "#ef4444" : isDueSoon ? "#f59e0b" : "#6366f1";
  const icon = isOverdue ? "🚨" : isDueSoon ? "⏰" : "🧾";
  const message = isOverdue
    ? `Your payment of <strong>${currencySymbol}${amount}</strong> for <strong>${planName}</strong> is overdue.`
    : isDueSoon
      ? `Your payment of <strong>${currencySymbol}${amount}</strong> for <strong>${planName}</strong> is due on <strong>${dueDate}</strong>.`
      : `Your invoice for <strong>${planName}</strong> has been generated. Amount: <strong>${currencySymbol}${amount}</strong>. Due: <strong>${dueDate}</strong>.`;
  const html = `<div style='font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px'><div style='background:${color};padding:20px;border-radius:12px 12px 0 0;text-align:center'><h1 style='color:white;margin:0'>${icon} BillingPortal</h1></div><div style='background:#f9fafb;padding:30px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb'><h2 style='color:#111827;margin-top:0'>Hi ${customerName},</h2><p style='color:#374151'>${message}</p><a href='http://localhost:3000/invoices' style='display:block;background:${color};color:white;text-align:center;padding:12px;border-radius:8px;text-decoration:none;font-weight:600'>View Invoice & Pay Now</a></div></div>`;
  const result = await sendEmail({ to, subject, html });
  broadcastEvent({
    type: "payment_reminder",
    reminderType: type,
    customerName,
    planName,
    amount,
    dueDate,
    currency,
    message: subject,
    createdAt: new Date().toISOString(),
  });
  res.json({ ...result, subject });
});

app.post("/api/reminders/test", async (req, res) => {
  const { to } = req.body;
  const result = await sendEmail({
    to: to || TEST_EMAIL_TO,
    subject: "BillingPortal - Test Email",
    html: "<h2>Test email from BillingPortal</h2><p>Email reminders are working!</p>",
  });
  res.json(result);
});

// ── Usage Routes ──────────────────────────────────────────────────────────────
function loadUsage() {
  try {
    if (fs2.existsSync(USAGE_FILE))
      return JSON.parse(fs2.readFileSync(USAGE_FILE, "utf8"));
  } catch (e) {}
  return [];
}
function saveUsage(events) {
  fs2.writeFileSync(USAGE_FILE, JSON.stringify(events, null, 2));
}

app.post("/api/usage", (req, res) => {
  const { accountId, metricName, value, eventDate } = req.body;
  if (!accountId || !metricName || value === undefined)
    return res.status(400).json({ error: "missing fields" });
  const events = loadUsage();
  const event = {
    id: Date.now() + "_" + Math.random().toString(36).substr(2, 9),
    accountId,
    metricName,
    value: Number(value),
    eventDate: eventDate || new Date().toISOString().split("T")[0],
    createdAt: new Date().toISOString(),
  };
  events.push(event);
  saveUsage(events);
  broadcastEvent({
    type: "usage.created",
    metricName: event.metricName,
    value: event.value,
    accountId: event.accountId,
    createdAt: event.createdAt,
  });
  res.status(201).json({ status: "accepted", event });
});

app.get("/api/usage/summary", (req, res) => {
  const { accountId, days = 7 } = req.query;
  if (!accountId) return res.status(400).json({ error: "accountId required" });
  const events = loadUsage().filter((e) => e.accountId === accountId);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - Number(days));
  const filtered = events.filter((e) => new Date(e.eventDate) >= cutoff);
  const totals = {};
  filtered.forEach((e) => {
    totals[e.metricName] = (totals[e.metricName] || 0) + e.value;
  });
  res.json({
    accountId,
    days: Number(days),
    totals,
    eventCount: filtered.length,
  });
});

app.get("/api/usage/series", (req, res) => {
  const { accountId, metric, days = 7 } = req.query;
  if (!accountId || !metric)
    return res.status(400).json({ error: "accountId and metric required" });
  const events = loadUsage().filter(
    (e) => e.accountId === accountId && e.metricName === metric,
  );
  const series = {};
  for (let i = Number(days) - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    series[d.toISOString().split("T")[0]] = 0;
  }
  events.forEach((e) => {
    if (series.hasOwnProperty(e.eventDate)) series[e.eventDate] += e.value;
  });
  const result = Object.entries(series).map(([date, value]) => ({
    date: new Date(date).toLocaleDateString("en-IN", {
      month: "short",
      day: "numeric",
    }),
    value,
    rawDate: date,
  }));
  res.json({ metric, series: result });
});

// ── Payments Log (local record of all gateway-processed payments) ────────────
const PAYMENTS_FILE = path.join(__dirname, "payments.json");

function loadPayments() {
  try {
    if (fs2.existsSync(PAYMENTS_FILE))
      return JSON.parse(fs2.readFileSync(PAYMENTS_FILE, "utf8"));
  } catch (e) {}
  return [];
}
function savePayments(payments) {
  fs2.writeFileSync(PAYMENTS_FILE, JSON.stringify(payments, null, 2));
}

app.post("/api/payments/record", async (req, res) => {
  const {
    provider,
    paymentId,
    accountId,
    customerName,
    customerEmail,
    planName,
    amount,
    currency,
    status,
  } = req.body;
  if (!provider || !paymentId || !amount)
    return res
      .status(400)
      .json({ error: "provider, paymentId, amount required" });
  const payments = loadPayments();
  const payment = {
    id: paymentId,
    provider,
    accountId: accountId || null,
    customerName: customerName || "Unknown",
    customerEmail: customerEmail || "",
    planName: planName || "",
    amount: Number(amount),
    currency: currency || "INR",
    status: status || "succeeded",
    createdAt: new Date().toISOString(),
  };
  payments.unshift(payment);
  savePayments(payments);
  broadcastEvent({ type: "payment.recorded", payment });
  console.log("[Payment] Recorded:", provider, paymentId, amount, currency);

  // Send receipt email automatically on success
  if (payment.status === "succeeded" && payment.customerEmail) {
    try {
      await sendEmail({
        to: payment.customerEmail,
        subject: PAYMENT_RECEIPT_EMAIL.subject(payment.planName || "your plan"),
        html: PAYMENT_RECEIPT_EMAIL.html(
          payment.customerName,
          payment.planName || "your plan",
          payment.amount,
          payment.currency,
          payment.provider,
          payment.id,
        ),
      });
      console.log("[Payment] Receipt email sent to", payment.customerEmail);
    } catch (e) {
      console.error("[Payment] Receipt email failed:", e.message);
    }
  }

  res.status(201).json(payment);
});
app.get("/api/payments", (req, res) => {
  const payments = loadPayments();
  const { provider, status, limit } = req.query;
  let filtered = payments;
  if (provider) filtered = filtered.filter((p) => p.provider === provider);
  if (status) filtered = filtered.filter((p) => p.status === status);
  if (limit) filtered = filtered.slice(0, Number(limit));
  res.json(filtered);
});

app.get("/api/payments/summary", (req, res) => {
  const payments = loadPayments();
  const totalAmount = payments.reduce(
    (sum, p) => sum + (p.status === "succeeded" ? p.amount : 0),
    0,
  );
  const byProvider = {};
  payments.forEach((p) => {
    if (!byProvider[p.provider])
      byProvider[p.provider] = { count: 0, amount: 0 };
    byProvider[p.provider].count++;
    if (p.status === "succeeded") byProvider[p.provider].amount += p.amount;
  });
  res.json({
    totalPayments: payments.length,
    totalAmount,
    succeeded: payments.filter((p) => p.status === "succeeded").length,
    failed: payments.filter((p) => p.status === "failed").length,
    byProvider,
  });
});

// ── Razorpay ──────────────────────────────────────────────────────────────────
app.post("/api/razorpay/order", (req, res) => {
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    return res.status(503).json({ error: "Razorpay is not configured" });
  }

  const { amount, currency } = req.body;
  const rzpAuth = Buffer.from(
    RAZORPAY_KEY_ID + ":" + RAZORPAY_KEY_SECRET,
  ).toString("base64");
  const bodyStr = JSON.stringify({
    amount,
    currency: currency || "INR",
    receipt: "order_" + Date.now(),
  });
  const options = {
    hostname: "api.razorpay.com",
    port: 443,
    path: "/v1/orders",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Basic " + rzpAuth,
      "Content-Length": Buffer.byteLength(bodyStr),
    },
  };
  const orderReq = https.request(options, (orderRes) => {
    let data = "";
    orderRes.on("data", (chunk) => {
      data += chunk;
    });
    orderRes.on("end", () => {
      res.status(orderRes.statusCode).json(JSON.parse(data));
    });
  });
  orderReq.on("error", (err) => {
    res.status(500).json({ error: err.message });
  });
  orderReq.write(bodyStr);
  orderReq.end();
});

// ── Stripe ────────────────────────────────────────────────────────────────────
app.post("/api/stripe/create-payment-intent", async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ error: "Stripe is not configured" });
    }

    const { amount, currency = "usd", description } = req.body;
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: currency.toLowerCase(),
      description: description || "Subscription",
      automatic_payment_methods: { enabled: true },
    });
    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/stripe/confirm-payment", async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ error: "Stripe is not configured" });
    }

    const { paymentIntentId } = req.body;
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    res.json({ status: pi.status, id: pi.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Kill Bill proxy ───────────────────────────────────────────────────────────
app.use("/api/v1", (req, res) => {
  const kbPath = "/1.0/kb" + req.url;
  console.log(req.method + " " + kbPath);
  let body = req.body && Object.keys(req.body).length > 0 ? req.body : null;
  let trialClaim = null;
  if (req.method === "POST" && req.url === "/subscriptions" && body) {
    const plan = loadPlans().find((p) => p.id === body.planName);
    if (plan && Number(plan.price) === 0 && body.accountId) {
      if (!tryClaimTrial(body.accountId, plan.module)) {
        console.log(
          `  -> BLOCKED: account ${body.accountId} already used trial for module ${plan.module}`,
        );
        return res.status(409).json({
          error: "trial_already_used",
          message: `Trial already used for module "${plan.module}".`,
        });
      }
      trialClaim = { accountId: body.accountId, moduleKey: plan.module };
    }
  }
  if (
    req.method === "POST" &&
    req.url.includes("paymentMethods") &&
    body &&
    body.token
  ) {
    body = {
      pluginName: "killbill-payment",
      pluginInfo: { properties: [{ key: "token", value: body.token }] },
    };
  }
  const bodyStr = body ? JSON.stringify(body) : null;
  const options = {
    hostname: process.env.KB_HOST || "127.0.0.1",
    port: 8080,
    path: kbPath,
    method: req.method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: "Basic " + AUTH,
      "X-Killbill-ApiKey": process.env.KB_API_KEY || "company_a",
      "X-Killbill-ApiSecret": process.env.KB_API_SECRET || "company_a_secret",
      "X-Killbill-CreatedBy": "portal",
      "Content-Length": bodyStr ? Buffer.byteLength(bodyStr) : 0,
    },
  };
  const proxyReq = http.request(options, (proxyRes) => {
    let data = "";
    proxyRes.on("data", (chunk) => {
      data += chunk;
    });
    proxyRes.on("end", () => {
      console.log("  -> " + proxyRes.statusCode);
      if (trialClaim && proxyRes.statusCode !== 201) {
        releaseTrialClaim(trialClaim.accountId, trialClaim.moduleKey);
      }
      if (proxyRes.statusCode === 201) {
        const location = proxyRes.headers["location"] || "";
        const parts = location.split("/");
        const uuid = parts[parts.length - 1];
        res.status(200).json({ id: uuid });
      } else if (proxyRes.statusCode === 204 || !data) {
        res.status(proxyRes.statusCode).end();
      } else {
        res
          .status(proxyRes.statusCode)
          .setHeader("Content-Type", "application/json")
          .end(data);
      }
    });
  });
  proxyReq.on("error", function (err) {
    res.status(500).json({ error: err.message });
  });
  if (bodyStr) proxyReq.write(bodyStr);
  proxyReq.end();
});

// ── Auto Payment Reminders (node-cron) ───────────────────────────────────────
async function runPaymentReminderCheck() {
  console.log("[Cron] Running daily payment reminder check...");
  try {
    const res = await new Promise((resolve) => {
      const options = {
        hostname: process.env.KB_HOST || "127.0.0.1",
        port: 8080,
        path: "/1.0/kb/accounts/pagination?limit=100",
        method: "GET",
        headers: {
          Authorization: "Basic " + AUTH,
          "X-Killbill-ApiKey": process.env.KB_API_KEY || "admin",
          "X-Killbill-ApiSecret": process.env.KB_API_SECRET || "password",
          Accept: "application/json",
        },
      };
      const req = http.request(options, (r) => {
        let data = "";
        r.on("data", (chunk) => {
          data += chunk;
        });
        r.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve([]);
          }
        });
      });
      req.on("error", () => resolve([]));
      req.end();
    });
    const accounts = Array.isArray(res) ? res : [];
    const summary = {
      accountsChecked: accounts.length,
      trialRemindersSent: 0,
      overdueRemindersSent: 0,
    };
    for (const account of accounts) {
      if (!account.email) continue;
      const bundles = await new Promise((resolve) => {
        const options = {
          hostname: process.env.KB_HOST || "127.0.0.1",
          port: 8080,
          path: `/1.0/kb/accounts/${account.accountId}/bundles`,
          method: "GET",
          headers: {
            Authorization: "Basic " + AUTH,
            "X-Killbill-ApiKey": process.env.KB_API_KEY || "admin",
            "X-Killbill-ApiSecret": process.env.KB_API_SECRET || "password",
            Accept: "application/json",
          },
        };
        const req = http.request(options, (r) => {
          let data = "";
          r.on("data", (chunk) => {
            data += chunk;
          });
          r.on("end", () => {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              resolve([]);
            }
          });
        });
        req.on("error", () => resolve([]));
        req.end();
      });
      for (const bundle of Array.isArray(bundles) ? bundles : []) {
        for (const sub of bundle.subscriptions || []) {
          if (sub.state !== "ACTIVE") continue;
          const planName = (sub.planName || "")
            .replace(/-/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase());
          if (sub.phaseType === "TRIAL" && sub.chargedThroughDate) {
            const daysLeft = Math.ceil(
              (new Date(sub.chargedThroughDate) - Date.now()) / 86400000,
            );
            console.log(
              `[Cron] ${account.email} — plan: ${planName}, daysLeft: ${daysLeft}, threshold: ${loadBillingConfig().trialReminderDays}`,
            );
            if (daysLeft === loadBillingConfig().trialReminderDays) {
              await sendBillingEmail(
                "trial_ending",
                account.email,
                account.name || "Customer",
                planName,
              );
              summary.trialRemindersSent++;
            }
          }
          if (sub.chargedThroughDate) {
            const daysOverdue = Math.ceil(
              (Date.now() - new Date(sub.chargedThroughDate)) / 86400000,
            );
            // Skip free plans — there's no real charge to be "overdue" on.
            const planPrice = (sub.prices || []).find(
              (p) => p.phaseType === "EVERGREEN",
            )?.recurringPrice;
            const isFreePlan = planPrice === 0 || planPrice === null;
            if (daysOverdue > 0 && daysOverdue <= 7 && !isFreePlan) {
              await sendBillingEmail(
                "payment_overdue",
                account.email,
                account.name || "Customer",
                planName,
              );
              summary.overdueRemindersSent++;
            }
          }
        }
      }
    }
    console.log("[Cron] Daily check complete.", summary);
    return summary;
  } catch (err) {
    console.error("[Cron] Error:", err.message);
    return { error: err.message };
  }
}

cron.schedule("30 3 * * *", runPaymentReminderCheck);

app.post("/api/cron/run-reminder-check", async (req, res) => {
  const result = await runPaymentReminderCheck();
  res.json(result);
});

console.log(
  "[Cron] Payment reminder scheduler started — runs daily at 9am IST",
);

// ── Dedicated raw webhook listener (bypasses Express entirely) ───────────────
// Java's HTTP client has trouble parsing some Express/Node responses over
// keep-alive connections. This minimal raw server avoids that entirely by
// writing the exact response bytes Kill Bill expects.
const webhookServer = http.createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/api/webhooks/killbill") {
    res.writeHead(404);
    res.end();
    return;
  }
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });
  req.on("end", async () => {
    try {
      const event = JSON.parse(body || "{}");
      const eventType = event.eventType || event.metaData?.eventType;
      console.log("[Webhook-Raw] Kill Bill event received:", eventType);

      const accountId = event.accountId || event.account?.id || event.objectId;
      let email = "",
        name = "Customer",
        plan = "";

      if (accountId) {
        const acc = await getKBAccount(accountId);
        if (acc) {
          email = acc.email || "";
          name = acc.name || acc.externalKey || "Customer";
        }
      }

      plan = (
        event.planName ||
        event.metaData?.planName ||
        event.subscription?.planName ||
        ""
      )
        .replace(/-/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());

      // Parse metaData to check actionType — Kill Bill fires SUBSCRIPTION_CREATION
      // twice (REQUESTED, then EFFECTIVE). Only act on EFFECTIVE to avoid duplicates.
      let actionType = "";
      try {
        const meta =
          typeof event.metaData === "string"
            ? JSON.parse(event.metaData)
            : event.metaData;
        actionType = meta?.actionType || "";
      } catch (e) {
        /* metaData not JSON, ignore */
      }
      if (email) {
        if (
          eventType === "SUBSCRIPTION_CREATION" &&
          actionType !== "REQUESTED"
        ) {
          await sendBillingEmail("trial_welcome", email, name, plan);
          syncContactToMautic(name, email, plan); // fire-and-forget, don't block the response
        } else if (
          eventType === "SUBSCRIPTION_PHASE_TRIAL_ENDING" ||
          eventType === "TRIAL_ENDING"
        ) {
          await sendBillingEmail("trial_ending", email, name, plan);
        } else if (
          eventType === "SUBSCRIPTION_PHASE" &&
          actionType !== "REQUESTED"
        ) {
          // Real Kill Bill event fired when trial->evergreen transition completes.
          // The cron job handles the proactive "3 days before" warning separately;
          // this confirms trial has genuinely ended right now.
          console.log(
            "[Webhook-Raw] Trial ended for",
            email,
            "- evergreen phase started",
          );
        } else if (
          eventType === "PAYMENT_FAILED" ||
          eventType === "INVOICE_PAYMENT_FAILED"
        ) {
          // Only alarm the customer if the invoice actually has a balance owed.
          // Kill Bill "fails" to auto-bill $0 invoices too (no plugin installed),
          // which isn't a real payment failure worth emailing about.
          const invoiceId = event.objectId;
          let invoiceAmount = null;
          if (invoiceId) {
            const invoice = await getKBInvoice(invoiceId);
            invoiceAmount = invoice?.amount ?? invoice?.balance ?? null;
          }
          if (invoiceAmount === null || invoiceAmount > 0) {
            await sendBillingEmail("payment_overdue", email, name, plan);
          } else {
            console.log(
              "[Webhook-Raw] Skipped payment_overdue email — invoice amount is",
              invoiceAmount,
              "(free plan, not a real failure)",
            );
          }
        } else if (
          eventType === "SUBSCRIPTION_CANCEL" ||
          eventType === "SUBSCRIPTION_CANCELLATION"
        ) {
          await sendBillingEmail("cancelled", email, name, plan);
        }
      } else {
        console.log("[Webhook-Raw] No email found for account:", accountId);
      }

      io.emit("killbill_event", { eventType, accountId, plan });
      broadcastEvent({ type: "killbill_webhook", eventType, accountId });

      const responseBody = JSON.stringify({ received: true, eventType });
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(responseBody),
        Connection: "close",
      });
      res.end(responseBody);
    } catch (err) {
      console.error("[Webhook-Raw] Error:", err.message);
      const errBody = JSON.stringify({ error: err.message });
      res.writeHead(500, {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(errBody),
        Connection: "close",
      });
      res.end(errBody);
    }
  });
});
webhookServer.listen(3005, () =>
  console.log(
    "[Webhook-Raw] Dedicated webhook listener running on http://localhost:3005",
  ),
);

// ── Module Sync ────────────────────────────────────────────────────
app.post("/api/products/sync", async (req, res) => {
  const { name, free_plan, trial_weeks, api_calls_allowed } = req.body;
  if (!name) return res.status(400).json({ error: "name required" });
  const plans = loadPlans();
  const productName = name.replace(/ /g, "_");
  const alreadyExists = plans.some((p) => p.module === productName);
  if (!alreadyExists) {
    if (free_plan === true) {
      const trialDays = (trial_weeks || 2) * 7;
      plans.push({
        id: `${productName.toLowerCase().replace(/_/g, "-")}-basic`,
        name: `${name} Basic`,
        module: productName,
        billingPeriod: "MONTHLY",
        trialDays: trialDays,
        price: 0,
        currency: "INR",
        description: `Free plan — ${trial_weeks || 2} week trial`,
        active: true,
        usageBilling: false,
        api_calls_allowed: api_calls_allowed || 0,
      });
    }
  }
  if (free_plan === false || (!alreadyExists && free_plan !== true)) {
    savePlans(plans);
    console.log("[FlowEngine] Product synced (no KB plan):", productName);
    return res.status(200).json({ synced: true, product: productName });
  }
  const sync = await syncPlanToCatalog(plans, AUTH);
  console.log(
    "[FlowEngine] Product synced:",
    productName,
    "— KB status:",
    sync.status,
  );
  if (sync.status !== 201 && sync.status !== 200) {
    return res.status(500).json({
      error: "Kill Bill sync failed",
      details: sync.body || sync.error,
    });
  }
  savePlans(plans);
  res.status(200).json({ synced: true, product: productName });
});

app.post("/api/products/update", async (req, res) => {
  const { old_name, name, free_plan, trial_weeks, api_calls_allowed } =
    req.body;
  if (!old_name || !name)
    return res.status(400).json({ error: "old_name and name required" });
  const plans = loadPlans();
  const oldProductName = old_name.replace(/ /g, "_");
  const newProductName = name.replace(/ /g, "_");
  let updated = plans.map((p) =>
    p.module === oldProductName
      ? {
          ...p,
          module: newProductName,
          name: p.name.replace(oldProductName, newProductName),
        }
      : p,
  );
  const planId = `${newProductName.toLowerCase().replace(/_/g, "-")}-basic`;
  const existingPlanIdx = updated.findIndex(
    (p) => p.module === newProductName && p.id === planId,
  );
  if (free_plan === true) {
    const trialDays = (trial_weeks || 2) * 7;
    if (existingPlanIdx >= 0) {
      updated[existingPlanIdx] = {
        ...updated[existingPlanIdx],
        trialDays,
        active: true,
        api_calls_allowed: api_calls_allowed || 0,
        description: `Free plan — ${trial_weeks || 2} week trial`,
      };
    } else {
      updated.push({
        id: planId,
        name: `${name} Basic`,
        module: newProductName,
        billingPeriod: "MONTHLY",
        trialDays,
        price: 0,
        currency: "INR",
        description: `Free plan — ${trial_weeks || 2} week trial`,
        active: true,
        usageBilling: false,
        api_calls_allowed: api_calls_allowed || 0,
      });
    }
    savePlans(updated);
    const sync = await syncPlanToCatalog(updated, AUTH);
    console.log(
      "[FlowEngine] Product updated:",
      oldProductName,
      "->",
      newProductName,
      "— KB status:",
      sync.status,
    );
    if (sync.status !== 201 && sync.status !== 200) {
      savePlans(plans);
      return res.status(500).json({
        error: "Kill Bill sync failed",
        details: sync.body || sync.error,
      });
    }
  } else {
    updated = updated.map((p) =>
      p.module === newProductName ? { ...p, active: false } : p,
    );
    savePlans(updated);
    console.log("[FlowEngine] Product updated (no KB plan):", newProductName);
  }
  res.status(200).json({ synced: true, product: newProductName });
});

app.put("/api/products/:name", async (req, res) => {
  const productName = req.params.name;
  const { newName } = req.body;
  if (!newName) return res.status(400).json({ error: "newName required" });
  const plans = loadPlans();
  const newProductName = newName.replace(/ /g, "_");
  const updated = plans.map((p) =>
    p.module === productName
      ? {
          ...p,
          module: newProductName,
          name: p.name.replace(productName, newProductName),
        }
      : p,
  );
  savePlans(updated);
  const sync = await syncPlanToCatalog(updated, AUTH);
  console.log(
    "[FlowEngine] Product updated:",
    productName,
    "->",
    newProductName,
    "— KB status:",
    sync.status,
  );
  if (sync.status !== 201 && sync.status !== 200) {
    savePlans(plans);
    return res.status(500).json({
      error: "Kill Bill sync failed",
      details: sync.body || sync.error,
    });
  }
  res.status(200).json({ synced: true, product: newProductName });
});

app.delete("/api/products/:name", async (req, res) => {
  const productName = req.params.name;
  const subsResult = await new Promise((resolve) => {
    const options = {
      hostname: process.env.KB_HOST || "127.0.0.1",
      port: 8080,
      path: `/1.0/kb/accounts/pagination?limit=100`,
      method: "GET",
      headers: {
        Authorization: "Basic " + AUTH,
        "X-Killbill-ApiKey": process.env.KB_API_KEY || "company_a",
        "X-Killbill-ApiSecret": process.env.KB_API_SECRET || "company_a_secret",
        Accept: "application/json",
      },
    };
    const req2 = http.request(options, (r) => {
      let data = "";
      r.on("data", (chunk) => {
        data += chunk;
      });
      r.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve([]);
        }
      });
    });
    req2.on("error", () => resolve([]));
    req2.end();
  });
  const accounts = Array.isArray(subsResult) ? subsResult : [];
  let hasActiveSubscribers = false;
  for (const account of accounts) {
    const bundles = await new Promise((resolve) => {
      const options = {
        hostname: process.env.KB_HOST || "127.0.0.1",
        port: 8080,
        path: `/1.0/kb/accounts/${account.accountId}/bundles`,
        method: "GET",
        headers: {
          Authorization: "Basic " + AUTH,
          "X-Killbill-ApiKey": process.env.KB_API_KEY || "company_a",
          "X-Killbill-ApiSecret":
            process.env.KB_API_SECRET || "company_a_secret",
          Accept: "application/json",
        },
      };
      const req2 = http.request(options, (r) => {
        let data = "";
        r.on("data", (chunk) => {
          data += chunk;
        });
        r.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve([]);
          }
        });
      });
      req2.on("error", () => resolve([]));
      req2.end();
    });
    for (const bundle of Array.isArray(bundles) ? bundles : []) {
      for (const sub of bundle.subscriptions || []) {
        if (
          sub.state === "ACTIVE" &&
          sub.planName &&
          sub.planName.startsWith(productName.toLowerCase().replace(/_/g, "-"))
        ) {
          hasActiveSubscribers = true;
          break;
        }
      }
      if (hasActiveSubscribers) break;
    }
    if (hasActiveSubscribers) break;
  }
  if (hasActiveSubscribers) {
    return res.status(409).json({
      error: `Cannot delete — module ${productName} has active subscribers`,
    });
  }
  const plans = loadPlans();
  const updated = plans.map((p) =>
    p.module === productName ? { ...p, active: false } : p,
  );
  savePlans(updated);
  console.log("[FlowEngine] Product marked inactive:", productName);
  res
    .status(200)
    .json({ synced: true, product: productName, status: "inactive" });
});

server.listen(3002, function () {
  console.log("Gateway running on http://localhost:3002");

  const callbackUrl = process.env.KB_WEBHOOK_CALLBACK_URL;
  if (!callbackUrl) {
    console.error(
      "[Webhook] KB_WEBHOOK_CALLBACK_URL not set — skipping auto-register",
    );
    return;
  }
  const options = {
    hostname: process.env.KB_HOST || "127.0.0.1",
    port: 8080,
    path: `/1.0/kb/tenants/registerNotificationCallback?cb=${encodeURIComponent(callbackUrl)}`,
    method: "POST",
    headers: {
      Authorization: "Basic " + AUTH,
      "X-Killbill-ApiKey": process.env.KB_API_KEY || "company_a",
      "X-Killbill-ApiSecret": process.env.KB_API_SECRET || "company_a_secret",
      "X-Killbill-CreatedBy": "admin",
      "Content-Type": "application/json",
      "Content-Length": 0,
    },
  };
  const req = http.request(options, (res) => {
    let data = "";
    res.on("data", (chunk) => {
      data += chunk;
    });
    res.on("end", () =>
      console.log(
        "[Webhook] Auto-registered with Kill Bill, status:",
        res.statusCode,
      ),
    );
  });
  req.on("error", (err) =>
    console.error("[Webhook] Auto-register failed:", err.message),
  );
  req.end();
});
