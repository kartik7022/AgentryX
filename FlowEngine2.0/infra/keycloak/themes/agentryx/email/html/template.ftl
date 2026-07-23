<#macro emailLayout heading=(realmName!"AgentryX") preheader="">
<!doctype html>
<html lang="${locale.language!'en'}" dir="${(ltr!true)?then('ltr','rtl')}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body {
      margin: 0;
      padding: 0;
      background: #f8fafc;
      color: #334155;
      font-family: "DM Sans", "Segoe UI", Arial, sans-serif;
      font-size: 14px;
      line-height: 1.6;
    }

    .agx-email-shell {
      width: 100%;
      padding: 32px 16px;
      background:
        radial-gradient(circle at top left, rgba(191, 219, 254, 0.7), transparent 30rem),
        linear-gradient(135deg, #ffffff 0%, #f8fafc 52%, #eef2f7 100%);
    }

    .agx-email-card {
      max-width: 560px;
      margin: 0 auto;
      border: 1px solid #e2e8f0;
      border-radius: 20px;
      background: #ffffff;
      box-shadow: 0 24px 60px rgba(15, 23, 42, 0.12);
      overflow: hidden;
    }

    .agx-email-inner {
      padding: 30px;
    }

    .agx-brand-row {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 24px;
    }

    .agx-brand-mark {
      width: 42px;
      height: 42px;
      border: 1px solid #bfdbfe;
      border-radius: 12px;
      background: #eff6ff;
      color: #0f172a;
      font-size: 13px;
      font-weight: 800;
      line-height: 42px;
      text-align: center;
    }

    .agx-brand-kicker {
      margin: 0;
      color: #3b82f6;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    h1 {
      margin: 0 0 16px;
      color: #0f172a;
      font-size: 26px;
      font-weight: 800;
      line-height: 1.15;
      letter-spacing: -0.03em;
    }

    p {
      margin: 0 0 16px;
      color: #334155;
    }

    .agx-email-panel {
      margin: 20px 0;
      padding: 16px;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      background: #fcfdfe;
    }

    .agx-email-button {
      display: inline-block;
      min-height: 44px;
      padding: 0 18px;
      border: 1px solid #60a5fa;
      border-radius: 12px;
      background: #60a5fa;
      color: #0f172a !important;
      font-size: 14px;
      font-weight: 700;
      line-height: 44px;
      text-decoration: none;
    }

    .agx-email-link {
      color: #3b82f6;
      font-weight: 700;
      word-break: break-all;
    }

    .agx-email-list {
      margin: 10px 0 0;
      padding-left: 18px;
      color: #334155;
    }

    .agx-email-footer {
      padding: 18px 30px;
      border-top: 1px solid #e2e8f0;
      background: #f1f5f9;
      color: #64748b;
      font-size: 12px;
    }

    @media (max-width: 560px) {
      .agx-email-shell {
        padding: 18px 10px;
      }

      .agx-email-inner {
        padding: 24px;
      }

      .agx-email-footer {
        padding: 16px 24px;
      }
    }
  </style>
</head>
<body>
  <div class="agx-email-shell">
    <div class="agx-email-card">
      <div class="agx-email-inner">
        <div class="agx-brand-row">
          <div class="agx-brand-mark">AX</div>
          <p class="agx-brand-kicker">AgentryX</p>
        </div>
        <#if preheader?has_content>
          <p style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</p>
        </#if>
        <h1>${heading}</h1>
        <#nested>
      </div>
      <div class="agx-email-footer">
        This message was sent by AgentryX identity services. If you did not request this, you can ignore it.
      </div>
    </div>
  </div>
</body>
</html>
</#macro>
