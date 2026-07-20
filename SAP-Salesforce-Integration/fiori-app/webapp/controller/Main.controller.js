sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (Controller, MessageToast, MessageBox) {
    "use strict";

    var MIDDLEWARE_URL = "https://sap-middleware.cfapps.us10-001.hana.ondemand.com";

    return Controller.extend("sapqueryapp.controller.Main", {

        onInit: function () {
            // Controller initialized
            console.log("SAP Query App initialized!");
        },

        // Ask Question → Middleware → HANA
        onAskQuestion: function () {
            var oModel   = this.getView().getModel("app");
            var sQuestion = oModel.getProperty("/query");
            var sRole     = oModel.getProperty("/role");
            var sUser     = oModel.getProperty("/user");

            if (!sQuestion || sQuestion.trim() === "") {
                MessageToast.show("Please enter a question!");
                return;
            }

            // Clear previous results
            oModel.setProperty("/results",     []);
            oModel.setProperty("/resultCount", 0);
            oModel.setProperty("/hasResults",  false);
            oModel.setProperty("/errorMsg",    "");
            oModel.setProperty("/description", "");
            oModel.setProperty("/isLoading",   true);

            console.log("[FIORI] Question: " + sQuestion + " | Role: " + sRole);

            // Call middleware /ask
            fetch(MIDDLEWARE_URL + "/ask", {
                method: "POST",
                headers: {
                    "Content-Type" : "application/json",
                    "X-User-Role"  : sRole,
                    "X-User-Email" : sUser
                },
                body: JSON.stringify({
                    question : sQuestion,
                    role     : sRole,
                    email    : sUser
                })
            })
            .then(function(res) {
                if (!res.ok) {
                    throw new Error("Server error: " + res.status);
                }
                return res.json();
            })
            .then(function(data) {
                console.log("[FIORI] Results:", data);
                oModel.setProperty("/results",     data.result      || []);
                oModel.setProperty("/resultCount", data.count       || 0);
                oModel.setProperty("/description", data.description || "");
                oModel.setProperty("/hasResults",  data.result && data.result.length > 0);
                oModel.setProperty("/isLoading",   false);

                if (!data.result || data.result.length === 0) {
                    MessageToast.show("No data found for your query.");
                }
            })
            .catch(function(err) {
                console.error("[FIORI] Error:", err);
                oModel.setProperty("/errorMsg",  "Connection error: " + err.message);
                oModel.setProperty("/isLoading", false);
            });
        },

        // Clear results
        onClear: function () {
            var oModel = this.getView().getModel("app");
            oModel.setProperty("/query",       "");
            oModel.setProperty("/results",     []);
            oModel.setProperty("/resultCount", 0);
            oModel.setProperty("/hasResults",  false);
            oModel.setProperty("/errorMsg",    "");
            oModel.setProperty("/description", "");
            MessageToast.show("Cleared!");
        },

        // Logout
        onLogout: function () {
            MessageBox.confirm("Are you sure you want to logout?", {
                onClose: function(sAction) {
                    if (sAction === "OK") {
                        window.close();
                    }
                }
            });
        }
    });
});
