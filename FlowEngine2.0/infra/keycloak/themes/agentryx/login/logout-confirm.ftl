<!doctype html>
<html lang="${lang}"<#if realm.internationalizationEnabled> dir="${(locale.rtl)?then('rtl','ltr')}"</#if>>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>AgentryX | Log out</title>
  <#if properties.styles?has_content>
    <#list properties.styles?split(' ') as style>
      <link href="${url.resourcesPath}/${style}" rel="stylesheet">
    </#list>
  </#if>
</head>
<body class="agx-auth-page">
  <main class="agx-auth-shell agx-auth-shell-centered">
    <section class="agx-auth-card agx-logout-card" aria-labelledby="agx-logout-title">
      <div class="agx-brand-mark">AX</div>
      <p class="agx-eyebrow">Secure session</p>
      <h1 id="agx-logout-title">${msg("logoutConfirmTitle")}</h1>
      <p class="agx-card-copy">${msg("logoutConfirmHeader")}</p>

      <form class="agx-form" action="${url.logoutConfirmAction}" onsubmit="confirmLogout.disabled = true; return true;" method="post">
        <input type="hidden" name="session_code" value="${logoutConfirm.code}">
        <button tabindex="1" class="agx-button agx-button-primary" name="confirmLogout" id="kc-logout" type="submit">
          ${msg("doLogout")}
        </button>
      </form>

      <#if !logoutConfirm.skipLink && (client.baseUrl)?has_content>
        <a class="agx-button agx-button-secondary" href="${client.baseUrl}">
          ${kcSanitize(msg("backToApplication"))?no_esc}
        </a>
      </#if>
    </section>
  </main>
</body>
</html>
