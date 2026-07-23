<#import "agx-template.ftl" as agx>
<#assign infoTitle = (messageHeader??)?then(msg(messageHeader), message.summary)>
<@agx.authLayout
  pageTitle="AgentryX | Account status"
  cardTitle=infoTitle
  eyebrow="Account status"
  centered=true
  displayMessage=false
>
  <div id="kc-info-message" class="agx-info-panel">
    <p>
      ${message.summary}
      <#if requiredActions??>
        <#list requiredActions>
          <strong>
            <#items as reqActionItem>
              ${kcSanitize(msg("requiredAction.${reqActionItem}"))?no_esc}<#sep>, </#sep>
            </#items>
          </strong>
        </#list>
      </#if>
    </p>
  </div>

  <#if !skipLink??>
    <#if pageRedirectUri?has_content>
      <a class="agx-button agx-button-primary" href="${pageRedirectUri}">
        ${kcSanitize(msg("backToApplication"))?no_esc}
      </a>
    <#elseif actionUri?has_content>
      <a class="agx-button agx-button-primary" href="${actionUri}">
        ${kcSanitize(msg("proceedWithAction"))?no_esc}
      </a>
    <#elseif (client.baseUrl)?has_content>
      <a class="agx-button agx-button-primary" href="${client.baseUrl}">
        ${kcSanitize(msg("backToApplication"))?no_esc}
      </a>
    </#if>
  </#if>
</@agx.authLayout>
