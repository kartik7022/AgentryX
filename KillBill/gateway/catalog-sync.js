// ============================================================
// catalog-sync.js — Additive Kill Bill catalog sync (v2, fixed splicing)
// ============================================================

const http = require("http");
const fs = require("fs");
const path = require("path");

function kbRequest(options, bodyBuffer) {
  return new Promise((resolve) => {
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    });
    req.on("error", (err) => resolve({ status: 500, error: err.message }));
    if (bodyBuffer) req.write(bodyBuffer);
    req.end();
  });
}

async function fetchCurrentCatalogXML(AUTH) {
  const options = {
    hostname: process.env.KB_HOST || "127.0.0.1",
    port: 8080,
    path: "/1.0/kb/catalog/xml",
    method: "GET",
    headers: {
      Authorization: "Basic " + AUTH,
      "X-Killbill-ApiKey": process.env.KB_API_KEY || "admin",
      "X-Killbill-ApiSecret": process.env.KB_API_SECRET || "password",
    },
  };
  const result = await kbRequest(options);
  return result.status === 200 ? result.body : null;
}

function buildPlanXML(p) {
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
}

function buildProductXML(productName) {
  return `                <product name="${productName}" prettyName="${productName}">
                    <category>BASE</category>
                    <included/>
                    <available/>
                    <limits/>
                </product>`;
}

function appendPlansToCatalog(currentCatalogXML, allPlans) {
  if (!currentCatalogXML) return null;

  const versionStart = currentCatalogXML.lastIndexOf("<version>");
  const versionEnd = currentCatalogXML.lastIndexOf("</version>");
  if (versionStart === -1 || versionEnd === -1) return null;

  let inner = currentCatalogXML.slice(
    versionStart + "<version>".length,
    versionEnd,
  );

  const activePlans = allPlans.filter((p) => p.active);
  const existingPlanIds = [...inner.matchAll(/<plan name="([^"]+)"/g)].map(
    (m) => m[1],
  );
  const existingProductNames = [
    ...inner.matchAll(/<product name="([^"]+)"/g),
  ].map((m) => m[1]);

  const newPlans = activePlans.filter((p) => !existingPlanIds.includes(p.id));
  const neededProducts = [
    ...new Set(activePlans.map((p) => p.module.replace(/ /g, ""))),
  ];
  const newProducts = neededProducts.filter(
    (p) => !existingProductNames.includes(p),
  );

  // 1. Insert new products before </products>
  if (newProducts.length > 0) {
    const productsCloseIdx = inner.indexOf("</products>");
    if (productsCloseIdx === -1) return null;
    const productXML =
      newProducts.map(buildProductXML).join("\n") + "\n            ";
    inner =
      inner.slice(0, productsCloseIdx) +
      productXML +
      inner.slice(productsCloseIdx);
  }

  // 2. Find top-level <plans>...</plans> (child of version, before priceLists)
  const priceListsIdx = inner.indexOf("<priceLists>");
  if (priceListsIdx === -1) return null;

  const beforePriceLists = inner.slice(0, priceListsIdx);
  const topPlansCloseIdx = beforePriceLists.lastIndexOf("</plans>");
  if (topPlansCloseIdx === -1) return null;

  if (newPlans.length > 0) {
    const planXML = "\n" + newPlans.map(buildPlanXML).join("\n");
    inner =
      inner.slice(0, topPlansCloseIdx) +
      planXML +
      "\n            " +
      inner.slice(topPlansCloseIdx);
  }

  const newPriceListsIdx = inner.indexOf("<priceLists>");
  const afterPriceLists = inner.slice(newPriceListsIdx);

  // 3. Inside defaultPriceList, append new plan ids
  if (newPlans.length > 0) {
    const defaultPriceListMatch = afterPriceLists.match(
      /<defaultPriceList[^>]*>\s*<plans>/,
    );
    if (defaultPriceListMatch) {
      const matchIdx =
        newPriceListsIdx +
        afterPriceLists.indexOf(defaultPriceListMatch[0]) +
        defaultPriceListMatch[0].length;
      const planListXML =
        "\n" +
        newPlans
          .map((p) => `                        <plan>${p.id}</plan>`)
          .join("\n");
      inner = inner.slice(0, matchIdx) + planListXML + inner.slice(matchIdx);
    }
  }

  // 4. Bump effective date
  const newEffectiveDate = new Date().toISOString();
  inner = inner.replace(
    /<effectiveDate>[^<]*<\/effectiveDate>/,
    `<effectiveDate>${newEffectiveDate}</effectiveDate>`,
  );

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<catalog xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="CatalogSchema.xsd">${inner}</catalog>`;
}

async function syncPlanToCatalog(allPlans, AUTH) {
  try {
    const currentXML = await fetchCurrentCatalogXML(AUTH);
    if (!currentXML) {
      return {
        status: "skipped",
        reason: "Could not fetch current Kill Bill catalog",
      };
    }

    const mergedXML = appendPlansToCatalog(currentXML, allPlans);
    if (!mergedXML) {
      return {
        status: "skipped",
        reason: "Could not parse current catalog structure",
      };
    }

    try {
      fs.writeFileSync(
        path.join(__dirname, "debug-merged-catalog.xml"),
        mergedXML,
      );
    } catch (e) {}

    const xmlBuffer = Buffer.from(mergedXML, "utf8");
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
    const result = await kbRequest(options, xmlBuffer);
    return { status: result.status, body: result.body };
  } catch (err) {
    return { status: "error", error: err.message };
  }
}

module.exports = { syncPlanToCatalog };
