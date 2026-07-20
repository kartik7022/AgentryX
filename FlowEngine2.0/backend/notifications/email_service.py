"""
Centralized Email Service
Path: backend/modules/notifications/email_service.py

Loads HTML templates from notifications/templates/ and sends emails.
All email sending across the project should go through this service.
"""

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from pathlib import Path

from backend.core.config import settings

TEMPLATES_DIR = Path(__file__).parent / "templates"


def _load_template(template_name: str, context: dict) -> str:
    """
    Load an HTML template file and replace {{placeholders}} with context values.
    """
    template_path = TEMPLATES_DIR / template_name
    html = template_path.read_text(encoding="utf-8")
    for key, value in context.items():
        html = html.replace(f"{{{{{key}}}}}", str(value))
    return html


def _send(to_email: str, subject: str, html_body: str, text_body: str = "") -> None:
    """
    Core SMTP send function.
    """
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
    msg["To"]      = to_email

    if text_body:
        msg.attach(MIMEText(text_body, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
        server.ehlo()
        server.starttls()
        server.login(settings.smtp_user, settings.smtp_password)
        server.sendmail(settings.smtp_from_email, to_email, msg.as_string())
def send_metadata_confirmed_email(email: str, tenant_id: str, datasource_name: str) -> None:
    if not settings.smtp_user or not settings.smtp_password:
        print("Warning: SMTP credentials not configured, skipping metadata confirmed email.")
        return
    html_body = _load_template("metadata_confirmed.html", {
        "email":           email,
        "tenant_id":       tenant_id,
        "datasource_name": datasource_name,
        "admin_hub_url":   settings.admin_hub_url,
    })

    _send(
        to_email=email,
        subject=f"Metadata Ready: {datasource_name} — FlowEngine",
        html_body=html_body,
    )






