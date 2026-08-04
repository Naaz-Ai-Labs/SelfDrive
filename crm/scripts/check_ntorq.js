const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const dbPath = path.join(__dirname, "../data/darshan.db");
const db = new DatabaseSync(dbPath);

const ntorq = db.prepare("SELECT * FROM vehicles WHERE slug = 'tvs-ntorq'").get();
console.log("NTorq vehicle row:", ntorq);

const photos = db.prepare("SELECT * FROM vehicle_photos WHERE vehicle_id = 5").all();
console.log("NTorq photos:", photos);
