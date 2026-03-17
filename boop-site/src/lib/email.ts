/**
 * Email sending — supports two providers via EMAIL_PROVIDER env var:
 *
 *   EMAIL_PROVIDER=resend   → uses Resend REST API (recommended)
 *                             set RESEND_API_KEY
 *
 *   EMAIL_PROVIDER=smtp     → uses any SMTP server via nodemailer
 *                             works with Gmail App Passwords
 *                             set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
 *
 * EMAIL_FROM controls the sender address, e.g. noreply@boop.fish
 */

interface SendOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

async function sendViaResend(opts: SendOptions): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "noreply@boop.fish",
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend error ${res.status}: ${body}`);
  }
}

async function sendViaSMTP(opts: SendOptions): Promise<void> {
  // Dynamically import nodemailer so it's only loaded when actually used.
  // Run: bun add nodemailer @types/nodemailer
  const nodemailer = await import("nodemailer");

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: false,   // STARTTLS on port 587
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,  // Gmail: use an App Password, not your real password
    },
  });

  await transporter.sendMail({
    from: process.env.EMAIL_FROM ?? process.env.SMTP_USER,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  });
}

export async function sendEmail(opts: SendOptions): Promise<void> {
  const provider = process.env.EMAIL_PROVIDER ?? "resend";
  if (provider === "smtp") {
    await sendViaSMTP(opts);
  } else {
    await sendViaResend(opts);
  }
}

// ── Templates ─────────────────────────────────────────────────────────────────

export function passwordResetEmail(username: string, resetUrl: string) {
  return {
    subject: "Reset your boop.fish password",
    text: `Hi ${username},\n\nReset your password here (expires in 1 hour):\n${resetUrl}\n\nIf you didn't request this, ignore this email.`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#0f172a;color:#e2e8f0;border-radius:12px">
        <h2 style="margin:0 0 8px;color:#fff">boop<span style="color:#7c3aed">.fish</span></h2>
        <p style="color:#94a3b8;margin:0 0 24px">Password reset request</p>
        <p>Hi <strong>${username}</strong>,</p>
        <p>Click the button below to reset your password. This link expires in <strong>1 hour</strong>.</p>
        <a href="${resetUrl}"
           style="display:inline-block;margin:16px 0;padding:12px 24px;background:#7c3aed;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold">
          Reset Password
        </a>
        <p style="color:#64748b;font-size:13px">Or copy this URL:<br>${resetUrl}</p>
        <p style="color:#64748b;font-size:12px;margin-top:24px">If you didn't request a password reset, you can safely ignore this email.</p>
      </div>
    `,
  };
}
