import { BrowserRouter } from "react-router-dom";
import { TenantRouter } from "./TenantRouter";
import { ThemeProvider } from "../theme/ThemeProvider";
import { AuthProvider } from "../providers/AuthProvider";
import { BillingEventsProvider } from "../providers/BillingEventsProvider";
import { MetadataPopup } from "../components/feedback/MetadataPopup";
import { FirstLoginPopup } from "../components/feedback/FirstLoginPopup";

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BillingEventsProvider>
          <BrowserRouter>
            <TenantRouter />
            <MetadataPopup />
            <FirstLoginPopup />
          </BrowserRouter>
        </BillingEventsProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
