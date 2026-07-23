<#import "agx-template.ftl" as agx>
<@agx.authLayout
  pageTitle="AgentryX | Authentication issue"
  cardTitle=msg("errorTitle")
  eyebrow="Authentication issue"
  centered=true
  displayMessage=false
>
  <div id="kc-error-message" class="agx-notice agx-notice-error" role="alert">
    ${kcSanitize(message.summary)?no_esc}
  </div>

  <#if !skipLink?? && client?? && client.baseUrl?has_content>
    <a id="backToApplication" class="agx-button agx-button-secondary" href="${client.baseUrl}">
      ${kcSanitize(msg("backToApplication"))?no_esc}
    </a>
  </#if>
</@agx.authLayout>
