const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const sourcePng = path.join(__dirname, "../../web/public/ChatGPT Image Aug 4, 2026, 05_58_27 PM.png");
const destPng = path.join(__dirname, "../../web/public/vehicles/tvs-ntorq.png");
const destWebp = path.join(__dirname, "../../web/public/vehicles/tvs-ntorq.webp");

console.log("Source PNG exists:", fs.existsSync(sourcePng));

if (fs.existsSync(sourcePng)) {
  fs.copyFileSync(sourcePng, destPng);
  fs.copyFileSync(sourcePng, destWebp);
  console.log("Copied source PNG to dest PNG and WebP files successfully!");
}

const dbPath = path.join(__dirname, "../data/darshan.db");
const db = new DatabaseSync(dbPath);

// Set photo URL to /vehicles/tvs-ntorq.png
db.prepare("UPDATE vehicle_photos SET url = '/vehicles/tvs-ntorq.png' WHERE vehicle_id = 5").run();
console.log("DB vehicle_photos updated to /vehicles/tvs-ntorq.png!");
