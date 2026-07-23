<#import "template.ftl" as layout>
<#assign expiry = linkExpirationFormatter(linkExpiration)>
<@layout.emailLayout heading="Verify your new email" preheader="Confirm the email update for your AgentryX account.">
  <p>To update your ${realmName!"AgentryX"} account email address to ${newEmail}, confirm the change using the secure link below.</p>
  <p>
    <a class="agx-email-button" href="${link}">Verify new email</a>
  </p>
  <div class="agx-email-panel">
    <p>This secure link expires within ${expiry}.</p>
    <p>If you do not want to make this change, you can ignore this email.</p>
    <p><a class="agx-email-link" href="${link}">${link}</a></p>
  </div>
</@layout.emailLayout>
