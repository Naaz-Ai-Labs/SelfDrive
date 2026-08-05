const { DatabaseSync } = require("node:sqlite");
const path = require("node:path");

const dbPath = path.join(__dirname, "..", "data", "darshan.db");
const db = new DatabaseSync(dbPath);

console.log("Seeding historical dummy data for March, April, May, June, and July 2026 with Extra KM & Late fees...");

const months = [
  { year: 2026, month: 3, name: "March", count: 12 },
  { year: 2026, month: 4, name: "April", count: 15 },
  { year: 2026, month: 5, name: "May", count: 18 },
  { year: 2026, month: 6, name: "June", count: 16 },
  { year: 2026, month: 7, name: "July", count: 14 },
];

const customerIds = [1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 13];
const vehicleIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

let counter = 1000;

db.exec("BEGIN IMMEDIATE");
try {
  for (const m of months) {
    const monthStr = String(m.month).padStart(2, "0");

    for (let i = 1; i <= m.count; i++) {
      counter++;
      const day = Math.min(28, i * 2);
      const dayStr = String(day).padStart(2, "0");
      const bookingNo = `BK-2026-${monthStr}${dayStr}-${counter}`;
      const payNo = `PAY-2026-${monthStr}${dayStr}-${counter}`;

      const customerId = customerIds[(i - 1) % customerIds.length];
      const vehicleId = vehicleIds[(i - 1) % vehicleIds.length];

      const pickupAt = `2026-${monthStr}-${dayStr}T08:00:00`;
      const returnDay = Math.min(28, day + 2);
      const returnDayStr = String(returnDay).padStart(2, "0");
      const returnAt = `2026-${monthStr}-${returnDayStr}T08:00:00`;
      const createdAt = `2026-${monthStr}-${dayStr}T07:30:00`;

      const baseAmount = 2000 + (i % 3) * 500;
      // Extra KM charges for ~60% of bookings (e.g. ₹320, ₹640, ₹480)
      const extraKmAmount = (i % 5 !== 0) ? (i % 4 + 1) * 160 : 0;
      // Late Return penalties for ~40% of bookings (e.g. ₹250, ₹500)
      const lateFeeAmount = (i % 3 === 0) ? (i % 2 + 1) * 250 : 0;
      const gstAmount = Math.round((baseAmount + extraKmAmount + lateFeeAmount) * 0.18);
      const depositAmount = 1500;
      const totalAmount = baseAmount + extraKmAmount + lateFeeAmount + gstAmount;

      const stmtBooking = db.prepare(`
        INSERT INTO bookings (
          booking_no, customer_id, vehicle_id, branch_id, pickup_at, return_at,
          status, base_amount, extra_km_amount, late_fee_amount, gst_amount,
          discount_amount, deposit_amount, total_amount, paid_amount, created_at, updated_at
        ) VALUES (?, ?, ?, 1, ?, ?, 'Completed', ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
      `);

      stmtBooking.run(
        bookingNo, customerId, vehicleId, pickupAt, returnAt,
        baseAmount, extraKmAmount, lateFeeAmount, gstAmount,
        depositAmount, totalAmount, totalAmount, createdAt, createdAt
      );

      const stmtPay = db.prepare(`
        INSERT INTO payments (
          payment_no, booking_id, customer_id, amount, kind, method, gateway_ref, status, created_at
        ) VALUES (
          ?, (SELECT id FROM bookings WHERE booking_no = ?), ?, ?, 'full', ?, 'RZP-PAID', 'Paid', ?
        )
      `);

      stmtPay.run(
        payNo, bookingNo, customerId, totalAmount, (i % 2 === 0 ? "upi" : "cash"), createdAt
      );
    }
  }
  db.exec("COMMIT");
  console.log("Historical dummy data for March, April, May, June, July 2026 seeded successfully!");
} catch (err) {
  db.exec("ROLLBACK");
  console.error("Error seeding historical dummy data:", err);
}
