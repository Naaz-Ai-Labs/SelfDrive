/**
 * Pluggable OTP delivery provider.
 *
 * The owner does not yet have a WhatsApp/SMS provider account. Everything here is wired
 * so it activates the moment real credentials are added to the environment, but it must
 * never fabricate a successful send: a missing/invalid credential always resolves to
 * `{ ok: false, error }`, never `{ ok: true }`. Callers must treat every failure here as
 * non-fatal and keep using the existing demo-mode/on-screen OTP fallback.
 */

export type OtpSendResult = { ok: true } | { ok: false; error: string };

export interface OtpProvider {
  name: string;
  send(target: string, code: string, channel: "sms" | "whatsapp"): Promise<OtpSendResult>;
}

/** Default/fallback provider. Always reports failure — never pretends to send. */
export class NullOtpProvider implements OtpProvider {
  name = "null";
  async send(_target: string, _code: string, _channel: "sms" | "whatsapp"): Promise<OtpSendResult> {
    return { ok: false, error: "No OTP provider configured" };
  }
}

/**
 * MSG91 SMS OTP API.
 * Endpoint pattern: POST https://control.msg91.com/api/v5/otp
 *   headers: { authkey: MSG91_AUTH_KEY }
 *   query/body: { template_id: MSG91_TEMPLATE_ID, mobile: "<countrycode><number>", otp: code }
 * Docs: https://docs.msg91.com/reference/send-otp
 */
export class Msg91Provider implements OtpProvider {
  name = "msg91";

  async send(target: string, code: string, channel: "sms" | "whatsapp"): Promise<OtpSendResult> {
    const authKey = process.env.MSG91_AUTH_KEY;
    const templateId = process.env.MSG91_TEMPLATE_ID;
    if (!authKey || !templateId) {
      return { ok: false, error: "MSG91_AUTH_KEY or MSG91_TEMPLATE_ID is not configured" };
    }
    if (channel !== "sms") {
      return { ok: false, error: "Msg91Provider only supports the sms channel" };
    }

    const mobile = target.replace(/[^\d]/g, "");
    const url = new URL("https://control.msg91.com/api/v5/otp");
    url.searchParams.set("template_id", templateId);
    url.searchParams.set("mobile", mobile);
    url.searchParams.set("otp", code);
    url.searchParams.set("authkey", authKey);

    try {
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { authkey: authKey, "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { ok: false, error: `MSG91 request failed: ${res.status} ${body}`.trim() };
      }
      const data = await res.json().catch(() => null);
      if (data && data.type && String(data.type).toLowerCase() !== "success") {
        return { ok: false, error: `MSG91 rejected the request: ${JSON.stringify(data)}` };
      }
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: `MSG91 request threw: ${err?.message || err}` };
    }
  }
}

/**
 * Meta WhatsApp Business Cloud API (send a templated OTP message).
 * Endpoint pattern: POST https://graph.facebook.com/v20.0/{WHATSAPP_PHONE_NUMBER_ID}/messages
 *   headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}` }
 *   body: {
 *     messaging_product: "whatsapp",
 *     to: "<E.164 number without +>",
 *     type: "template",
 *     template: { name: "otp_login", language: { code: "en" }, components: [...] }
 *   }
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-message-templates
 */
export class WhatsappBusinessProvider implements OtpProvider {
  name = "whatsapp-business";

  async send(target: string, code: string, channel: "sms" | "whatsapp"): Promise<OtpSendResult> {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!accessToken || !phoneNumberId) {
      return { ok: false, error: "WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID is not configured" };
    }
    if (channel !== "whatsapp") {
      return { ok: false, error: "WhatsappBusinessProvider only supports the whatsapp channel" };
    }

    const to = target.replace(/[^\d]/g, "");
    const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: {
            name: "otp_login",
            language: { code: "en" },
            components: [
              { type: "body", parameters: [{ type: "text", text: code }] },
              { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
            ],
          },
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { ok: false, error: `WhatsApp Cloud API request failed: ${res.status} ${body}`.trim() };
      }
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: `WhatsApp Cloud API request threw: ${err?.message || err}` };
    }
  }
}

/**
 * Picks a provider based on which credentials are present in the environment.
 * WhatsApp is preferred when both are configured. Falls back to NullOtpProvider
 * (always fails, never sends) when nothing is configured.
 */
export function getOtpProvider(): OtpProvider {
  if (process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) {
    return new WhatsappBusinessProvider();
  }
  if (process.env.MSG91_AUTH_KEY && process.env.MSG91_TEMPLATE_ID) {
    return new Msg91Provider();
  }
  return new NullOtpProvider();
}
