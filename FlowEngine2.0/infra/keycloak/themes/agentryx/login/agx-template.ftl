<#macro authLayout pageTitle cardTitle eyebrow="AgentryX identity" heroTitle="Secure access for tenant operations." heroCopy="Manage datasource access, credential safety, module subscriptions, and workspace identity from a consistent AgentryX experience." centered=false displayMessage=true>
<!doctype html>
<html lang="${lang}"<#if realm.internationalizationEnabled> dir="${(locale.rtl)?then('rtl','ltr')}"</#if>>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>${pageTitle}</title>
  <#if properties.styles?has_content>
    <#list properties.styles?split(' ') as style>
      <link href="${url.resourcesPath}/${style}" rel="stylesheet">
    </#list>
  </#if>
</head>
<body class="agx-auth-page">
  <main class="agx-auth-shell<#if centered> agx-auth-shell-centered</#if>">
    <#if !centered>
      <section class="agx-auth-hero" aria-label="AgentryX platform overview">
        <div class="agx-brand-kicker">AgentryX</div>
        <h1>${heroTitle}</h1>
        <p>${heroCopy}</p>
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
    </#if>

    <section class="agx-auth-card<#if centered> agx-logout-card</#if>">
      <div class="agx-brand-mark">AX</div>
      <p class="agx-eyebrow">${eyebrow}</p>
      <h1>${cardTitle}</h1>

      <#if displayMessage && message?has_content && (message.type != 'warning' || !isAppInitiatedAction??)>
        <div class="agx-notice agx-notice-${message.type}" role="alert">
          ${kcSanitize(message.summary)?no_esc}
        </div>
      </#if>

      <#nested>
    </section>
  </main>
</body>
</html>
</#macro>
