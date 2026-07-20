// webhook-listener.js
// Drop-in webhook listener for Kill Bill events.
// Run: node webhook-listener.js
// Kill Bill will POST events here on port 4000.

const http = require("http");

const PORT = 4000;

const handlers = {
  SUBSCRIPTION_PHASE_CHANGE: (event) => {
    console.log(`[TRIAL ENDED] Account ${event.accountId}, Subscription ${event.subscriptionId}`);
    console.log(`  Phase: ${event.nextPhase} | Effective: ${event.effectiveDate}`);
    // TODO: send email "Your trial has ended. Upgrade now."
  },

  INVOICE_CREATION: (event) => {
    console.log(`[INVOICE CREATED] Account ${event.accountId}, Invoice ${event.objectId}`);
    // TODO: notify user "New invoice generated"
  },

  PAYMENT_SUCCESS: (event) => {
    console.log(`[PAYMENT OK] Account ${event.accountId}, Amount collected`);
    // TODO: send receipt
  },

  PAYMENT_FAILURE: (event) => {
    console.log(`[PAYMENT FAILED] Account ${event.accountId}`);
    // TODO: alert user to update payment method
  },

  INVOICE_ADJUSTMENT: (event) => {
    console.log(`[INVOICE ADJUSTED] Account ${event.accountId}`);
  },
};

const server = http.createServer(async (req, res) => {
  if (req.method !== "POST") {
    res.writeHead(405);
    res.end("Method not allowed");
    return;
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");

  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    console.error("[ERROR] Could not parse event body:", raw);
    res.writeHead(400);
    res.end("Bad request");
    return;
  }

  console.log(`\n[EVENT RECEIVED] ${event.eventType || "UNKNOWN"}`);
  console.log(JSON.stringify(event, null, 2));

  const handler = handlers[event.eventType];
  if (handler) {
    handler(event);
  } else {
    console.log(`  [INFO] No handler for event type: ${event.eventType}`);
  }

  // Kill Bill expects HTTP 200
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("OK");
});

server.listen(PORT, () => {
  console.log(`Kill Bill webhook listener running on http://localhost:${PORT}`);
  console.log(`Register this URL in Kill Bill tenant notification callback.`);
  console.log(`Events handled: ${Object.keys(handlers).join(", ")}\n`);
});
