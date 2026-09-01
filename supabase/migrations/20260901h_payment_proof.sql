-- Staff collecting a counter payment (UPI/card/bank transfer) had nowhere to attach the
-- transaction screenshot as proof — cash has no digital receipt, but the other methods
-- do, and nothing captured it. addPayment()/createManualBooking() now require and store
-- it here for non-cash counter payments.
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS proof_url TEXT NULL;
COMMENT ON COLUMN public.payments.proof_url IS 'Staff-uploaded payment proof (UPI/card/bank-transfer screenshot) for counter-collected payments — cash payments have none.';
