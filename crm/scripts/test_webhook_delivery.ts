/**
 * Webhook signature isolation test.
 *
 * The handler verifies the Razorpay signature BEFORE it writes anything to
 * payment_events. So a wrong secret and a webhook that was never dispatched look
 * identical from the database: no row, no error, nothing in any log. This script
 * separates them by sending a correctly-signed request ourselves.
 *
 *   npx tsx crm/scripts/test_webhook_delivery.ts <the-secret-you-put-in-razorpay>
 *
 * Reads RAZORPAY_WEBHOOK_SECRET from the environment if no argument is given.
 *
 * Interpreting the result:
 *   200  -> the CRM side is correct. The secret you passed matches Vercel's, signature
 *           verification works, and the payment_events insert works. The fault is on the
 *           Razorpay side: it is not dispatching, or it holds a different secret.
 *   400  -> the secret you passed does NOT match the one in Vercel. This is the answer.
 *           Most often a trailing newline or space picked up while pasting.
 *   500  -> signature passed but the database write failed; the response body says why.
 *
 * SAFETY: sends `payment.authorized`, which the handler records but does not act on —
 * no branch of the if/else chain matches it. No booking, payment or refund is touched.
 * It writes one row to payment_events, which is the point: that row IS the proof.
 */
import crypto from "crypto";

const ENDPOINT = process.env.WEBHOOK_URL ?? "https://crm.selfdrive.bike/api/webhooks/razorpay";

async function main() {
  const secret = process.argv[2] ?? process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.error("Pass the webhook secret as an argument, or set RAZORPAY_WEBHOOK_SECRET.");
    process.exit(2);
  }

  // Flag the paste-error case before spending a network round trip on it.
  if (secret !== secret.trim()) {
    console.log(`WARNING: the secret has leading/trailing whitespace (raw length ${secret.length},`);
    console.log(`         trimmed ${secret.trim().length}). That alone breaks the HMAC.\n`);
  }

  const eventId = `evt_probe_${Date.now()}`;
  const body = JSON.stringify({
    entity: "event",
    account_id: "acc_probe",
    event: "payment.authorized", // deliberately inert — recorded, never acted on
    contains: ["payment"],
    payload: {
      payment: {
        entity: {
          id: `pay_probe_${Date.now()}`,
          entity: "payment",
          amount: 100,
          currency: "INR",
          status: "authorized",
          order_id: `order_probe_${Date.now()}`,
          method: "upi",
        },
      },
    },
    created_at: Math.floor(Date.now() / 1000),
  });

  const signature = crypto.createHmac("sha256", secret).update(body).digest("hex");

  console.log(`POST   ${ENDPOINT}`);
  console.log(`event  payment.authorized (inert)`);
  console.log(`secret length ${secret.length}`);
  console.log(`sig    ${signature.slice(0, 16)}…\n`);

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-razorpay-signature": signature,
      "x-razorpay-event-id": eventId,
    },
    body,
  });

  const text = await res.text();
  console.log(`HTTP ${res.status}`);
  console.log(text, "\n");

  if (res.status === 200) {
    console.log("RESULT: the CRM side is correct — signature verified and the event was recorded.");
    console.log("        Whatever is wrong is on the Razorpay side: either it is not");
    console.log("        dispatching, or the secret stored there differs from Vercel's.");
    console.log(`        Confirm with: select * from payment_events where event_id = '${eventId}'`);
  } else if (res.status === 400) {
    console.log("RESULT: this secret does NOT match the one in Vercel. That is the bug.");
    console.log("        Set the SAME value in both places and redeploy the CRM:");
    console.log("          Razorpay -> Settings -> Webhooks -> edit -> Secret");
    console.log("          Vercel   -> self-drive-crm -> Settings -> Environment Variables");
    console.log("        Watch for a trailing newline when pasting.");
  } else {
    console.log("RESULT: signature passed but processing failed — see the body above.");
  }

  process.exit(res.status === 200 ? 0 : 1);
}

main().catch((e) => {
  console.error("Request failed:", e?.message ?? e);
  process.exit(1);
});
