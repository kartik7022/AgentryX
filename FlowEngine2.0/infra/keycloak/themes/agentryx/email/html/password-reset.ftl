<#import "template.ftl" as layout>
<#assign expiry = linkExpirationFormatter(linkExpiration)>
<@layout.emailLayout heading="Reset your password" preheader="Use this secure link to reset your AgentryX password.">
  <p>A password reset was requested for your ${realmName!"AgentryX"} account. If this was you, use the secure link below.</p>
  <p>
    <a class="agx-email-button" href="${link}">Reset password</a>
  </p>
  <div class="agx-email-panel">
    <p>This secure link expires within ${expiry}.</p>
    <p>If you did not request a reset, you can ignore this email and no change will be made.</p>
    <p><a class="agx-email-link" href="${link}">${link}</a></p>
  </div>
</@layout.emailLayout>
