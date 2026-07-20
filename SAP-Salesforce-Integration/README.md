# SAP BTP + Salesforce Integration

## Folder Structure
```
SAP-Salesforce-Integration/
├── sap-middleware/
│   ├── server.js          → Main middleware (Node.js)
│   ├── manifest.yml       → CF deployment config
│   ├── xs-security.json   → XSUAA roles and scopes
│   ├── package.json       → Node dependencies
│   └── .env               → HANA connection (fill your values)
└── salesforce/
    └── force-app/main/default/
        ├── lwc/sapBtpIntegration/
        │   ├── sapBtpIntegration.html
        │   ├── sapBtpIntegration.js
        │   └── sapBtpIntegration.js-meta.xml
        └── classes/
            ├── SAPBTPController.cls
            └── SAPBTPController.cls-meta.xml
```

---

## STEP 1 — Fill .env file
```
HANA_HOST=your-hana-host.hanacloud.ondemand.com
HANA_PORT=443
HANA_USER=DBADMIN
HANA_PASSWORD=your-password
```

## STEP 2 — Deploy to SAP BTP
```bash
cd sap-middleware
cf login -a https://api.cf.us10-001.hana.ondemand.com
cf create-service xsuaa application sapqueryapp-xsuaa -c xs-security.json
cf push sap-middleware
cf create-service-key sapqueryapp-xsuaa salesforce-key
cf service-key sapqueryapp-xsuaa salesforce-key
```

## STEP 3 — Deploy to Salesforce
```bash
cd salesforce
sf project deploy start --source-dir force-app
```

## STEP 4 — Salesforce Setup (one time)
1. Custom Metadata → SAP_BTP_Config → Production record:
   - XSUAA_URL__c    = https://YOUR-SUBDOMAIN.authentication.us10.hana.ondemand.com
   - Client_ID__c    = sb-sapqueryapp!tXXXXXX
   - Client_Secret__c = your-client-secret
   - Pipedream_URL__c = https://your-pipedream-url.m.pipedream.net
   - Fiori_URL__c     = https://sapqueryapp.cfapps.us10-001.hana.ondemand.com

2. Remote Site Settings → Add:
   - SAP_Middleware → https://sap-middleware.cfapps.us10-001.hana.ondemand.com
   - SAP_Fiori      → https://sapqueryapp.cfapps.us10-001.hana.ondemand.com
   - SAP_Auth       → https://YOUR-SUBDOMAIN.authentication.us10.hana.ondemand.com
   - Pipedream      → https://your-pipedream-url.m.pipedream.net

3. Auth Provider → SAP_BTP_XSUAA (OpenID Connect)
4. External Credential → SAP_BTP_External
5. Named Credential → SAP_BTP_NC

## Role Based Access
| Email contains | Role    | Sees                        |
|----------------|---------|-----------------------------|
| finance        | Finance | Only Finance dept + salary  |
| hr             | HR      | All employees, no salary    |
| sales          | Sales   | Only Sales dept             |
| it             | IT      | Only IT dept                |
| anything else  | Admin   | Everything                  |

## Flow
Salesforce LWC → Login → Role detected
→ User types prompt
→ Apex → Pipedream → Middleware → SAP HANA
→ Role filtered data → Salesforce UI table
→ Open Fiori button → SAP Fiori in new tab
