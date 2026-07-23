<#import "agx-template.ftl" as agx>
<@agx.authLayout
  pageTitle="AgentryX | Set password"
  cardTitle=msg("updatePasswordTitle")
  eyebrow="Secure password"
  heroTitle="Set a strong password for your AgentryX workspace."
  heroCopy="This step protects tenant operations, datasource metadata, billing access, and administrative workflows."
  displayMessage=!messagesPerField.existsError('password','password-confirm')
>
  <p class="agx-card-copy">Create a new password to continue into AgentryX.</p>

  <form id="kc-passwd-update-form" class="agx-form" action="${url.loginAction}" method="post" novalidate="novalidate">
    <div class="agx-field">
      <label for="password-new">${msg("passwordNew")}</label>
      <div class="agx-password-wrap" dir="ltr">
        <input
          type="password"
          id="password-new"
          name="password-new"
          autofocus
          autocomplete="new-password"
          aria-invalid="<#if messagesPerField.existsError('password','password-confirm')>true</#if>"
        >
        <button class="agx-password-toggle" type="button" aria-label="${msg("showPassword")}" data-password-toggle aria-controls="password-new">
          Show
        </button>
      </div>
      <#if messagesPerField.existsError('password')>
        <span id="input-error-password" class="agx-field-error" aria-live="polite">
          ${kcSanitize(messagesPerField.get('password'))?no_esc}
        </span>
      </#if>
    </div>

    <div class="agx-field">
      <label for="password-confirm">${msg("passwordConfirm")}</label>
      <div class="agx-password-wrap" dir="ltr">
        <input
          type="password"
          id="password-confirm"
          name="password-confirm"
          autocomplete="new-password"
          aria-invalid="<#if messagesPerField.existsError('password-confirm')>true</#if>"
        >
        <button class="agx-password-toggle" type="button" aria-label="${msg("showPassword")}" data-password-toggle aria-controls="password-confirm">
          Show
        </button>
      </div>
      <#if messagesPerField.existsError('password-confirm')>
        <span id="input-error-password-confirm" class="agx-field-error" aria-live="polite">
          ${kcSanitize(messagesPerField.get('password-confirm'))?no_esc}
        </span>
      </#if>
    </div>

    <label class="agx-check">
      <input type="checkbox" id="logout-sessions" name="logout-sessions" value="on" checked>
      <span>${msg("logoutOtherSessions")}</span>
    </label>

    <div class="agx-form-actions agx-form-actions-inline">
      <button class="agx-button agx-button-primary" type="submit">
        ${msg("doSubmit")}
      </button>
      <#if isAppInitiatedAction??>
        <button class="agx-button agx-button-secondary" type="submit" name="cancel-aia" value="true" formnovalidate>
          ${msg("doCancel")}
        </button>
      </#if>
    </div>
  </form>

  <script>
    document.querySelectorAll("[data-password-toggle]").forEach(function (button) {
      button.addEventListener("click", function () {
        const password = document.getElementById(this.getAttribute("aria-controls"));
        if (!password) return;
        const showing = password.type === "text";
        password.type = showing ? "password" : "text";
        this.textContent = showing ? "Show" : "Hide";
      });
    });
  </script>
</@agx.authLayout>
