-- Make duplicate bookings and duplicate payment rows structurally impossible.
--
-- Background
-- ----------
-- Once the Razorpay webhook started delivering, Razorpay fired both order.paid and
-- payment.captured for the same payment. They arrived as two separate lambda
-- invocations ~400ms apart, both read the payments row as Pending, and both created a
-- booking from the same draft enquiry (bookings 1786539649 and 1786539650, enquiry 226).
--
-- The application now performs an atomic compare-and-swap on payments.status before
-- acting. That closes the observed path, but application guards only protect the paths
-- that remember to use them — a future code path, a script, or a manual fix can bypass
-- them. payment_events.event_id already has a UNIQUE index, which is precisely why
-- event-level dedupe has never failed. These indexes extend that same guarantee to the
-- rows that actually matter.
--
-- Postgres enforces these regardless of how many lambdas run concurrently: the second
-- writer gets a unique_violation and its transaction aborts.

-- ---------------------------------------------------------------------------
-- 1. One booking per enquiry
-- ---------------------------------------------------------------------------
-- This is the invariant the duplicate broke. Partial on two counts:
--
--   * enquiry_id IS NOT NULL — bookings created by staff in the CRM have no enquiry,
--     and several of them legitimately share NULL.
--
--   * status <> 'Rejected' — a rejected booking must not permanently consume its
--     enquiry. If a customer's booking is voided and they rebook against the same
--     enquiry, that has to remain possible. Only one LIVE booking per enquiry.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_active_enquiry
  ON public.bookings (enquiry_id)
  WHERE enquiry_id IS NOT NULL AND status <> 'Rejected';

-- ---------------------------------------------------------------------------
-- 2. One payments row per Razorpay payment
-- ---------------------------------------------------------------------------
-- razorpay_payment_id was indexed but not unique, so the fallback insert in
-- verifyBookingPayment could create a second row for a payment that already had one.
-- Nothing legitimate ever wants two rows for a single Razorpay payment id.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_razorpay_payment_id
  ON public.payments (razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. One payments row per Razorpay order
-- ---------------------------------------------------------------------------
-- createBookingPaymentOrder pre-inserts exactly one Pending row per order it creates,
-- and CASE A of verifyBookingPayment looks that row up by order id expecting one match.
-- A retried checkout produces a NEW order id and therefore a new row, so this does not
-- constrain re-attempts.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_razorpay_order_id
  ON public.payments (razorpay_order_id)
  WHERE razorpay_order_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. Supporting index
-- ---------------------------------------------------------------------------
-- enquiry_id had no index at all; the auto-link path and the constraint above both
-- benefit from one.
CREATE INDEX IF NOT EXISTS idx_bookings_enquiry_id
  ON public.bookings (enquiry_id)
  WHERE enquiry_id IS NOT NULL;
