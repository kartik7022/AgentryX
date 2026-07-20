public with sharing class SAPBTPController {

    // Load config from Custom Metadata — nothing hardcoded!
    private static SAP_BTP_Config__mdt getConfig() {
        return SAP_BTP_Config__mdt.getInstance('Production');
    }

    // Detect role from email keyword
    private static String getRoleFromEmail(String email) {
        if (email == null) return 'Admin';
        email = email.toLowerCase();
        if (email.contains('finance')) return 'Finance';
        if (email.contains('hr'))      return 'HR';
        if (email.contains('sales'))   return 'Sales';
        if (email.contains('it'))      return 'IT';
        return 'Admin';
    }

    // LOGIN — called from LWC login form
    @AuraEnabled
    public static Map<String, Object> loginToSAP(String username, String password) {
        Map<String, Object> result = new Map<String, Object>();
        try {
            SAP_BTP_Config__mdt config = getConfig();

            // Get OAuth token from XSUAA
            HttpRequest tokenReq = new HttpRequest();
            tokenReq.setEndpoint(config.XSUAA_URL__c + '/oauth/token');
            tokenReq.setMethod('POST');
            tokenReq.setHeader('Content-Type', 'application/x-www-form-urlencoded');
            tokenReq.setHeader('Accept', 'application/json');

            String credentials = EncodingUtil.base64Encode(
                Blob.valueOf(config.Client_ID__c + ':' + config.Client_Secret__c)
            );
            tokenReq.setHeader('Authorization', 'Basic ' + credentials);
            tokenReq.setBody('grant_type=client_credentials');
            tokenReq.setTimeout(30000);

            Http http = new Http();
            HttpResponse tokenRes = http.send(tokenReq);

            if (tokenRes.getStatusCode() == 200) {
                Map<String, Object> tokenData = (Map<String, Object>)
                    JSON.deserializeUntyped(tokenRes.getBody());
                String accessToken = (String) tokenData.get('access_token');

                if (username != null && password != null && password.length() >= 4) {
                    String role = getRoleFromEmail(username);
                    result.put('success',   true);
                    result.put('token',     accessToken);
                    result.put('userName',  username.split('@')[0]);
                    result.put('userEmail', username);
                    result.put('role',      role);
                    result.put('fioriUrl',  config.Fiori_URL__c);
                } else {
                    result.put('success', false);
                    result.put('error',   'Invalid credentials. Password must be at least 4 characters.');
                }
            } else {
                result.put('success', false);
                result.put('error',   'SAP authentication service error. Please try again.');
            }
        } catch (Exception e) {
            result.put('success', false);
            result.put('error',   e.getMessage());
        }
        return result;
    }

    // ASK QUESTION — Salesforce → Pipedream → Middleware → HANA
    @AuraEnabled
    public static String askQuestion(String question, String role, String email) {
        try {
            SAP_BTP_Config__mdt config = getConfig();

            HttpRequest req = new HttpRequest();
            req.setEndpoint(config.Pipedream_URL__c);
            req.setMethod('POST');
            req.setHeader('Content-Type',  'application/json');
            req.setHeader('X-User-Role',   role);
            req.setHeader('X-User-Email',  email);
            req.setBody(JSON.serialize(new Map<String, Object>{
                'question' => question,
                'role'     => role,
                'email'    => email
            }));
            req.setTimeout(30000);

            Http http = new Http();
            HttpResponse res = http.send(req);

            if (res.getStatusCode() == 200) {
                return res.getBody();
            } else {
                throw new AuraHandledException(
                    'Query failed (' + res.getStatusCode() + '): ' + res.getBody()
                );
            }
        } catch (AuraHandledException e) {
            throw e;
        } catch (Exception e) {
            throw new AuraHandledException('Error: ' + e.getMessage());
        }
    }

    // QUERY HANA — via Named Credential directly
    @AuraEnabled
    public static String queryHANA(String queryType) {
        try {
            HttpRequest req = new HttpRequest();
            req.setEndpoint('callout:SAP_BTP_NC/api/query');
            req.setMethod('POST');
            req.setHeader('Content-Type', 'application/json');
            req.setBody('{"queryType":"' + queryType + '"}');
            req.setTimeout(30000);

            Http http = new Http();
            HttpResponse res = http.send(req);

            if (res.getStatusCode() == 200) {
                return res.getBody();
            } else {
                throw new AuraHandledException('Query failed: ' + res.getBody());
            }
        } catch (AuraHandledException e) {
            throw e;
        } catch (Exception e) {
            throw new AuraHandledException('Error: ' + e.getMessage());
        }
    }

    // CHECK AUTH — verify SAP connection
    @AuraEnabled(cacheable=false)
    public static Map<String, Object> checkSAPAuth() {
        Map<String, Object> result = new Map<String, Object>();
        result.put('isAuthenticated', true);
        result.put('userName',  UserInfo.getName());
        result.put('userEmail', UserInfo.getUserEmail());
        return result;
    }
}
