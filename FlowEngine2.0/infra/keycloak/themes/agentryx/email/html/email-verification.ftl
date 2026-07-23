<#import "template.ftl" as layout>
<#assign expiry = linkExpirationFormatter(linkExpiration)>
<@layout.emailLayout heading="Verify your email" preheader="Confirm your AgentryX email address.">
  <p>Someone created a ${realmName!"AgentryX"} account using this email address. If this was you, confirm the address to finish account setup.</p>
  <p>
    <a class="agx-email-button" href="${link}">Verify email</a>
  </p>
  <div class="agx-email-panel">
    <p>This secure link expires within ${expiry}.</p>
    <p>If the button does not work, open this link in your browser:</p>
    <p><a class="agx-email-link" href="${link}">${link}</a></p>
  </div>
</@layout.emailLayout>
