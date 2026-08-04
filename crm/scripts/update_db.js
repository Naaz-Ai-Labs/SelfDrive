const path = require("path");
const fs = require("fs");

const dbPath = path.join(__dirname, "../data/darshan.db");
const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync(dbPath);

// 1. Update business setting JSON in SQLite DB
const bizRow = db.prepare("SELECT value FROM settings WHERE key = 'business'").get();
if (bizRow && bizRow.value) {
  try {
    const biz = JSON.parse(bizRow.value);
    biz.hours = "Pre-booking only · Mon–Sun, 8:00 AM – 8:00 AM";
    db.prepare("UPDATE settings SET value = ? WHERE key = 'business'").run(JSON.stringify(biz));
    console.log("Updated business hours in DB settings table!");
  } catch (err) {
    console.error("Error updating business JSON:", err);
  }
}

// 2. Update TVS NTorq photos in vehicle_photos table
const ntorqPhotoUrl = "/vehicles/tvs-ntorq.webp";
db.prepare("UPDATE vehicle_photos SET url = ? WHERE vehicle_id IN (SELECT id FROM vehicles WHERE slug = 'tvs-ntorq')").run(ntorqPhotoUrl);
console.log("Updated TVS NTorq photo URL in DB vehicle_photos table!");

// Verify updates
const updatedBiz = JSON.parse(db.prepare("SELECT value FROM settings WHERE key = 'business'").get().value);
console.log("Verified hours in DB:", updatedBiz.hours);

const updatedPhoto = db.prepare("SELECT * FROM vehicle_photos WHERE vehicle_id IN (SELECT id FROM vehicles WHERE slug = 'tvs-ntorq')").all();
console.log("Verified NTorq photos in DB:", updatedPhoto);
