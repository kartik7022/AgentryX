<#import "template.ftl" as layout>
<#assign expiry = linkExpirationFormatter(linkExpiration)>
<@layout.emailLayout heading="Complete account setup" preheader="Finish the required AgentryX account steps.">
  <p>Your administrator requested that you complete the required account setup steps for ${realmName!"AgentryX"}.</p>
  <#if requiredActions?? && requiredActions?size gt 0>
    <div class="agx-email-panel">
      <p><strong>Required actions</strong></p>
      <ul class="agx-email-list">
        <#list requiredActions as reqActionItem>
          <li>${msg("requiredAction.${reqActionItem}")}</li>
        </#list>
      </ul>
    </div>
  </#if>
  <p>
    <a class="agx-email-button" href="${link}">Continue setup</a>
  </p>
  <div class="agx-email-panel">
    <p>This secure link expires within ${expiry}.</p>
    <p>If you are unaware of this request, you can ignore this email.</p>
    <p><a class="agx-email-link" href="${link}">${link}</a></p>
  </div>
</@layout.emailLayout>
