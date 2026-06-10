/**
 * Minimal transactional-email sender via the Resend HTTP API. Uses fetch (no
 * SDK dependency). A no-op when RESEND_API_KEY is unset, so local/dev and CI
 * never attempt to send. Never throws — email failures must not break the
 * mutation that triggered them.
 */
const FROM = process.env.EMAIL_FROM || "Barn Raise <notifications@barnraise.app>";

export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
        ...(opts.html ? { html: opts.html } : {}),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
