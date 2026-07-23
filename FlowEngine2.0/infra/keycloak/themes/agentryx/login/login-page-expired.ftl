<#import "agx-template.ftl" as agx>
<@agx.authLayout
  pageTitle="AgentryX | Page expired"
  cardTitle=msg("pageExpiredTitle")
  eyebrow="Session expired"
  centered=true
  displayMessage=false
>
  <div class="agx-info-panel">
    <p id="instruction1">
      ${msg("pageExpiredMsg1")}
      <a id="loginRestartLink" href="${url.loginRestartFlowUrl}">${msg("doClickHere")}</a>.
      <br>
      ${msg("pageExpiredMsg2")}
      <a id="loginContinueLink" href="${url.loginAction}">${msg("doClickHere")}</a>.
    </p>
  </div>
</@agx.authLayout>
