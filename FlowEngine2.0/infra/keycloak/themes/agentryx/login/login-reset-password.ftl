<#import "agx-template.ftl" as agx>
<#assign usernameLabel>
  <#if !realm.loginWithEmailAllowed>${msg("username")}<#elseif !realm.registrationEmailAsUsername>${msg("usernameOrEmail")}<#else>${msg("email")}</#if>
</#assign>
<#assign resetInstruction>
  <#if realm.duplicateEmailsAllowed>
    ${msg("emailInstructionUsername")}
  <#else>
    ${msg("emailInstruction")}
  </#if>
</#assign>
<@agx.authLayout
  pageTitle="AgentryX | Reset password"
  cardTitle=msg("emailForgotTitle")
  eyebrow="Account recovery"
  heroTitle="Recover access without leaving the AgentryX experience."
  heroCopy="Enter the email address for your AgentryX account and Keycloak will send a secure recovery link."
  displayMessage=!messagesPerField.existsError('username')
>
  <p class="agx-card-copy">${resetInstruction}</p>

  <form id="kc-reset-password-form" class="agx-form" action="${url.loginAction}" method="post">
    <div class="agx-field">
      <label for="username">${usernameLabel}</label>
      <input
        type="text"
        id="username"
        name="username"
        autofocus
        value="${(auth.attemptedUsername!'')}"
        autocomplete="username"
        aria-invalid="<#if messagesPerField.existsError('username')>true</#if>"
        dir="ltr"
      >
      <#if messagesPerField.existsError('username')>
        <span id="input-error-username" class="agx-field-error" aria-live="polite">
          ${kcSanitize(messagesPerField.get('username'))?no_esc}
        </span>
      </#if>
    </div>

    <div class="agx-form-actions">
      <button class="agx-button agx-button-primary" id="kc-form-buttons" type="submit">
        ${msg("doSubmit")}
      </button>
      <a class="agx-button agx-button-secondary" href="${url.loginUrl}">
        ${kcSanitize(msg("backToLogin"))?no_esc}
      </a>
    </div>
  </form>
</@agx.authLayout>
