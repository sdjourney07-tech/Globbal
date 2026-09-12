"use strict";

/**
 * Outbound email for password resets.
 * Uses Resend when RESEND_API_KEY is set; otherwise logs the link (local/dev).
 */

function isPasswordResetEmailConfigured() {
  return Boolean(String(process.env.RESEND_API_KEY || "").trim());
}

/**
 * Whether the API may return a raw reset URL in the JSON body (local/dev only).
 * Never trusts X-Forwarded-* / Host spoofing for this decision.
 */
function allowDevResetLinkInResponse(req) {
  if (String(process.env.ALLOW_DEV_RESET_LINKS || "").trim() === "1") {
    return true;
  }
  if (isPasswordResetEmailConfigured()) {
    return false;
  }
  const addr = String(req?.socket?.remoteAddress || "");
  const loopback =
    addr === "127.0.0.1" ||
    addr === "::1" ||
    addr === "::ffff:127.0.0.1";
  if (!loopback) {
    return false;
  }
  // If a proxy forwarded this request, do not treat it as a safe local console session.
  if (req?.headers?.["x-forwarded-for"] || req?.headers?.["x-forwarded-host"]) {
    return false;
  }
  return true;
}

async function sendPasswordResetEmail({ to, resetUrl, username }) {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  const from =
    String(process.env.EMAIL_FROM || "").trim() || "Globbal <onboarding@resend.dev>";
  const subject = "Reset your Globbal password";
  const text =
    `Hi ${username},\n\n` +
    `Use this link to reset your Globbal password (expires in 1 hour):\n\n` +
    `${resetUrl}\n\n` +
    `If you did not ask for this, you can ignore this email.\n`;
  const html =
    `<p>Hi <strong>${escapeHtml(username)}</strong>,</p>` +
    `<p>Use this link to reset your Globbal password (expires in 1 hour):</p>` +
    `<p><a href="${escapeHtml(resetUrl)}">${escapeHtml(resetUrl)}</a></p>` +
    `<p>If you did not ask for this, you can ignore this email.</p>`;

  if (!apiKey) {
    process.stdout.write(
      `[mailer] RESEND_API_KEY not set — password reset link for ${to}:\n${resetUrl}\n`
    );
    return { ok: true, mode: "log" };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text,
      html
    })
  });

  if (!response.ok) {
    const body = await response.text();
    const err = new Error(`Email send failed (${response.status}): ${body.slice(0, 200)}`);
    err.code = "EMAIL_SEND_FAILED";
    throw err;
  }

  return { ok: true, mode: "resend" };
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function appPublicBaseUrl(req) {
  const configured = String(process.env.APP_PUBLIC_URL || "").trim().replace(/\/$/, "");
  if (configured) {
    return configured;
  }
  const host = req.headers["x-forwarded-host"] || req.headers.host || "127.0.0.1:8080";
  const proto =
    req.headers["x-forwarded-proto"] ||
    (String(host).includes("localhost") || String(host).startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

module.exports = {
  sendPasswordResetEmail,
  appPublicBaseUrl,
  isPasswordResetEmailConfigured,
  allowDevResetLinkInResponse
};
