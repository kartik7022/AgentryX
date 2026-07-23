<#import "agx-template.ftl" as agx>
<@agx.authLayout
  pageTitle="AgentryX | Verify email"
  cardTitle=msg("emailVerifyTitle")
  eyebrow="Email confirmation"
  centered=true
>
  <div class="agx-info-panel">
    <p>
      <#if verifyEmail??>
        ${msg("emailVerifyInstruction1", verifyEmail)}
      <#else>
        ${msg("emailVerifyInstruction4", user.email)}
      </#if>
    </p>
  </div>

  <#if isAppInitiatedAction??>
    <form id="kc-verify-email-form" class="agx-form" action="${url.loginAction}" method="post">
      <div class="agx-form-actions agx-form-actions-inline">
        <#if verifyEmail??>
          <button class="agx-button agx-button-primary" type="submit">
            ${msg("emailVerifyResend")}
          </button>
        <#else>
          <button class="agx-button agx-button-primary" type="submit">
            ${msg("emailVerifySend")}
          </button>
        </#if>
        <button class="agx-button agx-button-secondary" type="submit" name="cancel-aia" value="true" formnovalidate>
          ${msg("doCancel")}
        </button>
      </div>
    </form>
  <#else>
    <div class="agx-info-panel agx-info-panel-muted">
      <p>
        ${msg("emailVerifyInstruction2")}
        <a href="${url.loginAction}">${msg("doClickHere")}</a>
        ${msg("emailVerifyInstruction3")}
      </p>
    </div>
  </#if>
</@agx.authLayout>
