import { LightningElement, track } from 'lwc';
import loginToSAP   from '@salesforce/apex/SAPBTPController.loginToSAP';
import askQuestion  from '@salesforce/apex/SAPBTPController.askQuestion';

export default class SapBtpIntegration extends LightningElement {
    @track showSelection     = true;
    @track showLoginForm     = false;
    @track showDashboard     = false;
    @track isLoading         = false;
    @track errorMessage      = '';
    @track selectedSystem    = '';
    @track sapUsername       = '';
    @track sapPassword       = '';
    @track userInfo          = null;
    @track queryResults      = null;
    @track fioriUrl          = '';
    @track promptQuestion    = '';
    @track promptDescription = '';

    get systemOptions() {
        return [
            { label: '🔷 SAP BTP / HANA', value: 'SAP'   },
            { label: '☁️  Salesforce CRM', value: 'SFDC'  },
            { label: '⚙️  Other Systems',  value: 'OTHER' }
        ];
    }

    handleSystemChange(event) {
        this.selectedSystem = event.detail.value;
        this.errorMessage   = '';
    }

    handleConnect() {
        if (this.selectedSystem === 'SAP') {
            this.showSelection = false;
            this.showLoginForm = true;
        } else {
            this.errorMessage = this.selectedSystem + ' integration coming soon!';
        }
    }

    handleBack() {
        this.showSelection     = true;
        this.showLoginForm     = false;
        this.showDashboard     = false;
        this.errorMessage      = '';
        this.sapUsername       = '';
        this.sapPassword       = '';
        this.queryResults      = null;
        this.promptQuestion    = '';
        this.promptDescription = '';
        this.fioriUrl          = '';
    }

    handleLogout()              { this.handleBack(); }
    handleUsernameChange(event) { this.sapUsername     = event.detail.value; }
    handlePasswordChange(event) { this.sapPassword     = event.detail.value; }
    handlePromptChange(event)   { this.promptQuestion  = event.detail.value; }

    // SAP Login
    async handleSAPLogin() {
        if (!this.sapUsername || !this.sapPassword) {
            this.errorMessage = 'Please enter username and password.';
            return;
        }
        this.isLoading    = true;
        this.errorMessage = '';
        try {
            const result = await loginToSAP({
                username: this.sapUsername,
                password: this.sapPassword
            });
            if (result && result.success) {
                this.userInfo      = result;
                this.showLoginForm = false;
                this.showDashboard = true;
                this.fioriUrl      = `${result.fioriUrl}?role=${encodeURIComponent(result.role)}&user=${encodeURIComponent(this.sapUsername)}`;
            } else {
                this.errorMessage = result.error || 'Login failed.';
            }
        } catch (e) {
            this.errorMessage = e.body ? e.body.message : e.message;
        } finally {
            this.isLoading = false;
        }
    }

    // Ask Question → Pipedream → Middleware → HANA → Results
    async handleAskQuestion() {
        if (!this.promptQuestion) {
            this.errorMessage = 'Please enter a question.';
            return;
        }
        this.isLoading         = true;
        this.errorMessage      = '';
        this.queryResults      = null;
        this.promptDescription = '';

        try {
            const result = await askQuestion({
                question : this.promptQuestion,
                role     : this.userInfo.role,
                email    : this.userInfo.userEmail
            });
            const parsed = JSON.parse(result);
            if (parsed.result) {
                this.queryResults      = parsed.result;
                this.promptDescription = parsed.description || '';
            } else {
                this.errorMessage = parsed.error || 'No data returned';
            }
        } catch (e) {
            this.errorMessage = e.body ? e.body.message : e.message;
        } finally {
            this.isLoading = false;
        }
    }

    // Open Fiori in new tab
    openFiori() {
        window.open(this.fioriUrl, '_blank');
    }

    get hasResults()     { return this.queryResults && this.queryResults.length > 0; }
    get resultCount()    { return this.queryResults ? this.queryResults.length : 0; }
    get welcomeMessage() { return this.userInfo ? `Welcome, ${this.userInfo.userName}` : ''; }
    get userRole()       { return this.userInfo ? this.userInfo.role : ''; }
}
