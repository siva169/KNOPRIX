"""Transactional Email Service for Knoprix.

Supports:
- Resend API (when RESEND_API_KEY is configured).
- Fallback outbox (for development / local testing).
Never leaks credentials, recipient files, or sensitive document content.
"""
from __future__ import annotations

import json
import logging
import urllib.request
import urllib.error

from ..config import cfg

logger = logging.getLogger("knoprix.email")

# In-memory outbox for testing/dev inspection
OUTBOX: list[dict] = []


def send_email(to_email: str, subject: str, html_content: str, text_content: str = "") -> bool:
    """Send transactional email via configured provider or fallback outbox."""
    to_email = to_email.strip().lower()
    msg = {
        "to": to_email,
        "from": cfg.EMAIL_FROM,
        "subject": subject,
        "html": html_content,
        "text": text_content or subject,
    }

    if not cfg.RESEND_API_KEY:
        OUTBOX.append(msg)
        logger.info("[EMAIL OUTBOX] To: %s | Subject: %s", to_email, subject)
        return True

    try:
        req = urllib.request.Request(
            "https://api.resend.com/emails",
            data=json.dumps(msg).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {cfg.RESEND_API_KEY}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status in (200, 201)
    except Exception as exc:
        logger.error("Failed to send email via Resend to %s: %s", to_email, exc)
        OUTBOX.append(msg)
        return False


def send_password_reset_email(to_email: str, reset_token: str, app_url: str = "http://127.0.0.1:5173") -> bool:
    reset_link = f"{app_url}/reset-password?token={reset_token}"
    subject = "Knoprix — Password Reset Request"
    html = f"""
    <div style="background-color: #090a0c; color: #f7f3ea; padding: 32px; font-family: sans-serif;">
        <h2 style="color: #c5a15a;">Knoprix Password Recovery</h2>
        <p>A password reset was requested for your Knoprix account.</p>
        <p>Click the link below to set a new password. This link expires in 1 hour:</p>
        <p style="margin: 24px 0;">
            <a href="{reset_link}" style="background-color: #c5a15a; color: #090a0c; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                Reset Password
            </a>
        </p>
        <p style="color: #888; font-size: 13px;">If you did not request this, you can safely ignore this email.</p>
    </div>
    """
    text = f"Reset your Knoprix password: {reset_link}\nThis link expires in 1 hour."
    return send_email(to_email, subject, html, text)
