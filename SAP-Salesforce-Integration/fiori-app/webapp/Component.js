sap.ui.define([
    "sap/ui/core/UIComponent",
    "sap/ui/model/json/JSONModel"
], function (UIComponent, JSONModel) {
    "use strict";

    return UIComponent.extend("sapqueryapp.Component", {
        metadata: {
            manifest: "json"
        },

        init: function () {
            UIComponent.prototype.init.apply(this, arguments);

            // Get URL params (role, user, query passed from Salesforce)
            var oParams = new URLSearchParams(window.location.search);
            var sRole   = oParams.get("role")  || "Admin";
            var sUser   = oParams.get("user")  || "User";
            var sQuery  = oParams.get("query") || "";

            // Set app model
            var oModel = new JSONModel({
                role        : sRole,
                user        : sUser,
                query       : sQuery,
                results     : [],
                resultCount : 0,
                isLoading   : false,
                errorMsg    : "",
                description : "",
                hasResults  : false,
                welcomeMsg  : "Welcome, " + sUser + " (" + sRole + ")"
            });
            this.setModel(oModel, "app");

            this.getRouter().initialize();

            // Auto-run query if passed from Salesforce
            if (sQuery) {
                this._autoQuery(sQuery, sRole, sUser);
            }
        },

        _autoQuery: function(sQuery, sRole, sUser) {
            var oModel = this.getModel("app");
            oModel.setProperty("/isLoading", true);

            var sMiddlewareUrl = "https://sap-middleware.cfapps.us10-001.hana.ondemand.com/ask";

            fetch(sMiddlewareUrl, {
                method: "POST",
                headers: {
                    "Content-Type"  : "application/json",
                    "X-User-Role"   : sRole,
                    "X-User-Email"  : sUser
                },
                body: JSON.stringify({
                    question : sQuery,
                    role     : sRole,
                    email    : sUser
                })
            })
            .then(function(res) { return res.json(); })
            .then(function(data) {
                oModel.setProperty("/results",     data.result     || []);
                oModel.setProperty("/resultCount", data.count      || 0);
                oModel.setProperty("/description", data.description || "");
                oModel.setProperty("/hasResults",  (data.result && data.result.length > 0));
                oModel.setProperty("/isLoading",   false);
            })
            .catch(function(err) {
                oModel.setProperty("/errorMsg",  "Error: " + err.message);
                oModel.setProperty("/isLoading", false);
            });
        }
    });
});
