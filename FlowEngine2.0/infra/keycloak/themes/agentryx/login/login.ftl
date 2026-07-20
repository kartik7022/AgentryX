<!doctype html>
<html lang="${lang}"<#if realm.internationalizationEnabled> dir="${(locale.rtl)?then('rtl','ltr')}"</#if>>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>AgentryX | Sign in</title>
  <#if properties.styles?has_content>
    <#list properties.styles?split(' ') as style>
      <link href="${url.resourcesPath}/${style}" rel="stylesheet">
    </#list>
  </#if>
</head>
<body class="agx-auth-page">
  <main class="agx-auth-shell">
    <section class="agx-auth-hero" aria-label="AgentryX platform overview">
      <div class="agx-brand-kicker">AgentryX</div>
      <h1>Secure access for tenant operations.</h1>
      <p>Sign in to manage datasources, credentials, users, intents, validation rules, and billing from one unified workspace.</p>
      <div class="agx-hero-grid" aria-hidden="true">
        <div>
          <span>Identity</span>
          <strong>Keycloak SSO</strong>
        </div>
        <div>
          <span>Vault</span>
          <strong>Credential safety</strong>
        </div>
        <div>
          <span>Billing</span>
          <strong>Module access</strong>
        </div>
      </div>
    </section>

    <section class="agx-auth-card" aria-labelledby="agx-login-title">
      <div class="agx-auth-card-header">
        <div>
          <div class="agx-brand-mark">AX</div>
          <p class="agx-eyebrow">Tenant portal</p>
          <h2 id="agx-login-title">${msg("loginAccountTitle")}</h2>
        </div>
        <a class="agx-muted-link" href="${properties.agentryxHomeUrl!'http://localhost:3000/'}">Home</a>
      </div>

      <#if message?has_content && (message.type != 'warning' || !isAppInitiatedAction??)>
        <div class="agx-notice agx-notice-${message.type}" role="alert">
          ${kcSanitize(message.summary)?no_esc}
        </div>
      </#if>

      <#if realm.password>
        <form id="kc-form-login" class="agx-form" onsubmit="login.disabled = true; return true;" action="${url.loginAction}" method="post">
          <#if !usernameHidden??>
            <div class="agx-field">
              <label for="username">
                <#if !realm.loginWithEmailAllowed>
                  ${msg("username")}
                <#elseif !realm.registrationEmailAsUsername>
                  ${msg("usernameOrEmail")}
                <#else>
                  ${msg("email")}
                </#if>
              </label>
              <input
                tabindex="1"
                id="username"
                name="username"
                value="${(login.username!'')}"
                type="text"
                autofocus
                autocomplete="username"
                aria-invalid="<#if messagesPerField.existsError('username','password')>true</#if>"
                dir="ltr"
              >
              <#if messagesPerField.existsError('username','password')>
                <span class="agx-field-error" id="input-error" aria-live="polite">
                  ${kcSanitize(messagesPerField.getFirstError('username','password'))?no_esc}
                </span>
              </#if>
            </div>
          </#if>

          <div class="agx-field">
            <div class="agx-label-row">
              <label for="password">${msg("password")}</label>
              <#if realm.resetPasswordAllowed>
                <a tabindex="4" href="${url.loginResetCredentialsUrl}">${msg("doForgotPassword")}</a>
              </#if>
            </div>
            <div class="agx-password-wrap" dir="ltr">
              <input
                tabindex="2"
                id="password"
                name="password"
                type="password"
                autocomplete="current-password"
                aria-invalid="<#if messagesPerField.existsError('username','password')>true</#if>"
              >
              <button class="agx-password-toggle" type="button" aria-label="${msg("showPassword")}" data-password-toggle>
                Show
              </button>
            </div>
            <#if usernameHidden?? && messagesPerField.existsError('username','password')>
              <span class="agx-field-error" id="input-error" aria-live="polite">
                ${kcSanitize(messagesPerField.getFirstError('username','password'))?no_esc}
              </span>
            </#if>
          </div>

          <#if realm.rememberMe && !usernameHidden??>
            <label class="agx-check">
              <#if login.rememberMe??>
                <input tabindex="3" id="rememberMe" name="rememberMe" type="checkbox" checked>
              <#else>
                <input tabindex="3" id="rememberMe" name="rememberMe" type="checkbox">
              </#if>
              <span>${msg("rememberMe")}</span>
            </label>
          </#if>

          <input type="hidden" id="id-hidden-input" name="credentialId" <#if auth?has_content && auth.selectedCredential?has_content>value="${auth.selectedCredential}"</#if>>
          <button tabindex="5" class="agx-button agx-button-primary" name="login" id="kc-login" type="submit">
            ${msg("doLogIn")}
          </button>
        </form>
      <#else>
        <div class="agx-notice agx-notice-warning" role="status">
          Password login is not enabled for this realm.
        </div>
      </#if>

      <#if realm.password && social?? && social.providers?has_content>
        <div class="agx-divider"><span>or continue with</span></div>
        <div class="agx-social-list">
          <#list social.providers as p>
            <a data-once-link class="agx-button agx-button-secondary" id="social-${p.alias}" href="${p.loginUrl}">
              ${p.displayName!}
            </a>
          </#list>
        </div>
      </#if>

      <#if realm.password && realm.registrationAllowed && !registrationDisabled??>
        <p class="agx-register-link">
          ${msg("noAccount")} <a href="${properties.agentryxRegistrationUrl!'http://localhost:3000/register'}">${msg("doRegister")}</a>
        </p>
      </#if>
    </section>
  </main>

  <script>
    document.querySelector("[data-password-toggle]")?.addEventListener("click", function () {
      const password = document.getElementById("password");
      if (!password) return;
      const showing = password.type === "text";
      password.type = showing ? "password" : "text";
      this.textContent = showing ? "Show" : "Hide";
    });
  </script>
</body>
</html>
