<#ftl output_format="plainText">
Complete account setup

Your administrator requested that you complete the required account setup steps for ${realmName!"AgentryX"}.

<#if requiredActions?? && requiredActions?size gt 0>
Required actions:
<#list requiredActions as reqActionItem>
- ${msg("requiredAction.${reqActionItem}")}
</#list>

</#if>
${link}

This secure link expires within ${linkExpirationFormatter(linkExpiration)}.

If you are unaware of this request, you can ignore this email.
