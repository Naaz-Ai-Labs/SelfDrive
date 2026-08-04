import { getDb } from "./db";
import { ensureDefaultSettings } from "./settings";
import { hashPassword, createSession } from "./auth";
import { slugify, nextNumber, normalizePhone } from "./utils";
import { createBooking } from "./bookings";

type Category = {
  name: string;
  kind: "bike" | "scooter" | "car" | "van";
  icon: string;
  image: string;
  short_desc: string;
  description: string;
  sort: number;
};

const CATEGORIES: Category[] = [
  {
    name: "Cars",
    kind: "car",
    icon: "M5 17h14M5 17a2 2 0 104 0M5 17V9l2-4h10l2 4v8M15 17a2 2 0 104 0",
    image: "/vehicles/mahindra-thar.avif",
    short_desc: "Self-drive hatchbacks, sedans, SUVs and 7-seaters — fixed daily pricing, 100 km included.",
    description:
      "Our self-drive car fleet is well maintained and inspected before every handover. Every car comes with a 100 km/day allowance, a refundable security deposit and fixed pricing — no bargaining, no hidden charges.",
    sort: 1,
  },
  {
    name: "Bikes",
    kind: "bike",
    icon: "M6 17a2 2 0 104 0 2 2 0 00-4 0zm10 0a2 2 0 104 0 2 2 0 00-4 0zM8 17l8-10M8 17h8M13 10h3",
    image: "/vehicles/tvs-ronin.avif",
    short_desc: "Cruisers and commuter bikes for solo rides and weekend getaways around Sakleshpura.",
    description: "Well-serviced bikes for solo travellers and short getaways, with the same fixed, transparent pricing as the rest of our fleet.",
    sort: 2,
  },
  {
    name: "Scooters",
    kind: "scooter",
    icon: "M6 17a2 2 0 104 0 2 2 0 00-4 0zm10 0a2 2 0 104 0 2 2 0 00-4 0zM8 17l8-10M8 17h8M13 10h3",
    image: "/vehicles/category-scooters.jpg",
    short_desc: "Easy, fuel-efficient scooters for getting around town.",
    description: "Automatic scooters that are simple to ride and easy to park — ideal for quick local trips.",
    sort: 3,
  },
  {
    name: "Tempo Traveller",
    kind: "van",
    icon: "M3 16h1m16 0h1M5 16V9a1 1 0 011-1h9l4 4v4M5 16a2 2 0 104 0M15 16a2 2 0 104 0M5 12h13M9 8V5h3v3",
    image: "/vehicles/tempo-traveller.jpg",
    short_desc: "Chauffeur-driven tempo traveller for Sakleshpura & Chikmagalur sightseeing plans.",
    description: "Our tempo traveller comes with a driver for group sightseeing trips around Sakleshpura and Chikmagalur — priced as a package, not per kilometre.",
    sort: 4,
  },
];

type VehicleSeed = {
  name: string;
  brand: string;
  model: string;
  year: number;
  category: string;
  cc: number;
  fuel_type: string;
  transmission: string;
  seats: number;
  mileage: string;
  included_km: number;
  extra_km_rate: number;
  rate_24h: number;
  weekend_rate_24h?: number;
  deposit: number;
  late_fee_per_hour: number;
  description: string;
  image: string;
};

const VEHICLES: VehicleSeed[] = [
  // ---- Scooters ----
  {
    name: "Honda Dio", brand: "Honda", model: "Dio", year: 2023, category: "Scooters",
    cc: 110, fuel_type: "Petrol", transmission: "Automatic", seats: 2, mileage: "45 km/l",
    included_km: 100, extra_km_rate: 8, rate_24h: 900, weekend_rate_24h: 950, deposit: 1000, late_fee_per_hour: 100,
    description: "Light, easy-to-ride scooter — the simplest way to get around Sakleshpura.",
    image: "/vehicles/honda-dio.avif",
  },
  {
    name: "Honda Activa", brand: "Honda", model: "Activa 6G", year: 2023, category: "Scooters",
    cc: 110, fuel_type: "Petrol", transmission: "Automatic", seats: 2, mileage: "50 km/l",
    included_km: 100, extra_km_rate: 8, rate_24h: 900, weekend_rate_24h: 950, deposit: 1000, late_fee_per_hour: 100,
    description: "The most popular scooter on Indian roads — automatic, light and simple to ride.",
    image: "/vehicles/honda-activa.webp",
  },
  {
    name: "TVS Jupiter", brand: "TVS", model: "Jupiter", year: 2023, category: "Scooters",
    cc: 110, fuel_type: "Petrol", transmission: "Automatic", seats: 2, mileage: "48 km/l",
    included_km: 100, extra_km_rate: 8, rate_24h: 900, weekend_rate_24h: 950, deposit: 1000, late_fee_per_hour: 100,
    description: "Comfortable commuter scooter with a smooth ride and good boot space.",
    image: "/vehicles/tvs-jupiter.webp",
  },
  {
    name: "Yamaha RayZR", brand: "Yamaha", model: "RayZR", year: 2023, category: "Scooters",
    cc: 125, fuel_type: "Petrol", transmission: "Automatic", seats: 2, mileage: "46 km/l",
    included_km: 100, extra_km_rate: 8, rate_24h: 1000, weekend_rate_24h: 1100, deposit: 1000, late_fee_per_hour: 100,
    description: "Sportier styling with a punchier 125cc engine — still automatic and easy to ride.",
    image: "/vehicles/yamaha-rayzr.avif",
  },
  {
    name: "TVS NTorq", brand: "TVS", model: "NTorq 125", year: 2023, category: "Scooters",
    cc: 125, fuel_type: "Petrol", transmission: "Automatic", seats: 2, mileage: "44 km/l",
    included_km: 100, extra_km_rate: 8, rate_24h: 1100, weekend_rate_24h: 1200, deposit: 1000, late_fee_per_hour: 100,
    description: "Sportiest scooter in the fleet, simple to handle on hill roads.",
    image: "/vehicles/tvs-ntorq.png",
  },
  // ---- Bikes ----
  {
    name: "TVS Radar", brand: "TVS", model: "Radar", year: 2023, category: "Bikes",
    cc: 160, fuel_type: "Petrol", transmission: "Manual", seats: 2, mileage: "40 km/l",
    included_km: 100, extra_km_rate: 8, rate_24h: 1400, weekend_rate_24h: 1500, deposit: 1000, late_fee_per_hour: 100,
    description: "Modern neo-retro commuter bike with a confident, upright riding position.",
    image: "/vehicles/tvs-radar.avif",
  },
  {
    name: "Bajaj Pulsar NS", brand: "Bajaj", model: "Pulsar NS200", year: 2023, category: "Bikes",
    cc: 200, fuel_type: "Petrol", transmission: "Manual", seats: 2, mileage: "35 km/l",
    included_km: 100, extra_km_rate: 8, rate_24h: 1300, weekend_rate_24h: 1400, deposit: 1000, late_fee_per_hour: 100,
    description: "Naked street bike with real power for the Sakleshpura–Chikmagalur ghat roads.",
    image: "/vehicles/bajaj-pulsar-ns.png",
  },
  {
    name: "TVS Ronin", brand: "TVS", model: "Ronin", year: 2023, category: "Bikes",
    cc: 225, fuel_type: "Petrol", transmission: "Manual", seats: 2, mileage: "35 km/l",
    included_km: 100, extra_km_rate: 8, rate_24h: 1800, weekend_rate_24h: 1800, deposit: 1000, late_fee_per_hour: 120,
    description: "Modern cruiser styling, comfortable for day trips around the Western Ghats.",
    image: "/vehicles/tvs-ronin.avif",
  },
  {
    name: "Honda CB200X", brand: "Honda", model: "CB200X", year: 2023, category: "Bikes",
    cc: 184, fuel_type: "Petrol", transmission: "Manual", seats: 2, mileage: "38 km/l",
    included_km: 100, extra_km_rate: 8, rate_24h: 1800, weekend_rate_24h: 1800, deposit: 1000, late_fee_per_hour: 120,
    description: "Adventure-styled bike with a taller stance — built for the ghat road curves.",
    image: "/vehicles/honda-cb200x.jpg",
  },
  {
    name: "Honda Shine", brand: "Honda", model: "Shine", year: 2022, category: "Bikes",
    cc: 125, fuel_type: "Petrol", transmission: "Manual", seats: 2, mileage: "50 km/l",
    included_km: 100, extra_km_rate: 8, rate_24h: 1000, weekend_rate_24h: 1000, deposit: 1000, late_fee_per_hour: 100,
    description: "Reliable, fuel-efficient commuter bike — the easiest bike in the fleet to ride.",
    image: "/vehicles/honda-shine.avif",
  },
  // ---- Cars (flat daily rate) ----
  {
    name: "Maruti Baleno Manual", brand: "Maruti Suzuki", model: "Baleno", year: 2023, category: "Cars",
    cc: 1197, fuel_type: "Petrol", transmission: "Manual", seats: 5, mileage: "21 km/l",
    included_km: 300, extra_km_rate: 8, rate_24h: 3500, deposit: 2000, late_fee_per_hour: 150,
    description: "Comfortable premium hatchback, ideal for city drives and weekend road trips.",
    image: "/vehicles/baleno-manual.avif",
  },
  {
    name: "Maruti Baleno Automatic", brand: "Maruti Suzuki", model: "Baleno", year: 2023, category: "Cars",
    cc: 1197, fuel_type: "Petrol", transmission: "Automatic", seats: 5, mileage: "19 km/l",
    included_km: 300, extra_km_rate: 8, rate_24h: 3600, deposit: 2000, late_fee_per_hour: 150,
    description: "Automatic transmission Baleno — relaxed driving for hill roads and long highways.",
    image: "/vehicles/baleno-automatic.avif",
  },
  {
    name: "Maruti Dzire", brand: "Maruti Suzuki", model: "Dzire", year: 2022, category: "Cars",
    cc: 1197, fuel_type: "Petrol", transmission: "Manual", seats: 5, mileage: "22 km/l",
    included_km: 300, extra_km_rate: 8, rate_24h: 3500, deposit: 2000, late_fee_per_hour: 150,
    description: "Spacious sedan with a large boot — a favourite for family trips.",
    image: "/vehicles/maruti-dzire.avif",
  },
  {
    name: "Maruti Ciaz", brand: "Maruti Suzuki", model: "Ciaz", year: 2022, category: "Cars",
    cc: 1462, fuel_type: "Petrol", transmission: "Manual", seats: 5, mileage: "20 km/l",
    included_km: 300, extra_km_rate: 8, rate_24h: 4000, deposit: 2000, late_fee_per_hour: 150,
    description: "Executive sedan with extra legroom and a smoother ride for longer journeys.",
    image: "/vehicles/maruti-ciaz.jpg",
  },
  {
    name: "Maruti Ertiga 7 Seater", brand: "Maruti Suzuki", model: "Ertiga", year: 2023, category: "Cars",
    cc: 1462, fuel_type: "Petrol", transmission: "Manual", seats: 7, mileage: "18 km/l",
    included_km: 300, extra_km_rate: 8, rate_24h: 4500, deposit: 2000, late_fee_per_hour: 150,
    description: "7-seater MPV — the right pick for bigger families and groups.",
    image: "/vehicles/maruti-ertiga.avif",
  },
  {
    name: "Mahindra Thar", brand: "Mahindra", model: "Thar", year: 2023, category: "Cars",
    cc: 2184, fuel_type: "Diesel", transmission: "Manual", seats: 4, mileage: "15 km/l",
    included_km: 300, extra_km_rate: 8, rate_24h: 5000, deposit: 2000, late_fee_per_hour: 200,
    description: "4x4 off-roader — built for the Sakleshpura and Chikmagalur ghat roads.",
    image: "/vehicles/mahindra-thar.avif",
  },
  // ---- Tempo Traveller (chauffeur-driven package pricing) ----
  {
    name: "Tempo Traveller — Sakleshpura Sightseeing", brand: "Force", model: "Traveller 12-seater", year: 2022, category: "Tempo Traveller",
    cc: 2596, fuel_type: "Diesel", transmission: "Manual", seats: 12, mileage: "—",
    included_km: 999, extra_km_rate: 0, rate_24h: 12000, deposit: 2000, late_fee_per_hour: 250,
    description: "Chauffeur-driven tempo traveller for a full day of Sakleshpura sightseeing. Package pricing — fuel and driver included.",
    image: "/vehicles/tempo-traveller.jpg",
  },
  {
    name: "Tempo Traveller — Sakleshpura & Chikmagalur (2 Days)", brand: "Force", model: "Traveller 12-seater", year: 2022, category: "Tempo Traveller",
    cc: 2596, fuel_type: "Diesel", transmission: "Manual", seats: 12, mileage: "—",
    included_km: 999, extra_km_rate: 0, rate_24h: 18000, deposit: 2000, late_fee_per_hour: 250,
    description: "Two-day chauffeur-driven sightseeing plan covering Sakleshpura and Chikmagalur. Package pricing — fuel and driver included.",
    image: "/vehicles/tempo-traveller.jpg",
  },
];

const TEMPLATES = [
  { key: "enquiry_confirmation", name: "Enquiry confirmation (customer)", channel: "whatsapp", body: "Hi {name}, thanks for your enquiry with {business}. Your enquiry number is {enquiry_no}. We'll confirm your vehicle and get back to you shortly. — {business}" },
  { key: "booking_submitted", name: "Booking submitted", channel: "whatsapp", body: "Hi {name}, your booking request {booking_no} for {vehicle} has been received. Pickup: {pickup_at}. We'll confirm once documents and payment are verified." },
  { key: "documents_pending", name: "Documents pending", channel: "whatsapp", body: "Hi {name}, we still need your driving licence and ID proof to confirm booking {booking_no}. Please upload them to continue." },
  { key: "payment_pending", name: "Payment pending", channel: "whatsapp", body: "Hi {name}, booking {booking_no} is awaiting payment of {amount}. Please complete payment to confirm your {vehicle}." },
  { key: "booking_confirmation", name: "Booking confirmed", channel: "whatsapp", body: "You're all set, {name}! Booking {booking_no} for {vehicle} is confirmed. Pickup: {pickup_at} at {location}. — {business}" },
  { key: "pickup_reminder", name: "Pickup reminder", channel: "whatsapp", body: "Reminder: your {vehicle} pickup is today at {pickup_at}. Please bring your original driving licence and ID. — {business}" },
  { key: "return_reminder", name: "Return reminder", channel: "whatsapp", body: "Hi {name}, your {vehicle} is due for return at {return_at}. Please plan to return on time to avoid late fees." },
  { key: "late_return_alert", name: "Late return alert", channel: "internal", body: "Booking {booking_no} is overdue for return. Vehicle: {vehicle}. Customer: {name}, {phone}." },
  { key: "invoice_generated", name: "Invoice generated", channel: "whatsapp", body: "Hi {name}, your invoice {invoice_no} for booking {booking_no} is ready. Total: {total}. Thank you for choosing {business}." },
  { key: "deposit_refund_initiated", name: "Deposit refund initiated", channel: "whatsapp", body: "Hi {name}, your deposit refund of {amount} for booking {booking_no} has been initiated and should reflect in 3-5 business days." },
  { key: "refund_completed", name: "Refund completed", channel: "whatsapp", body: "Hi {name}, your refund of {amount} for booking {booking_no} has been completed. Ref: {transaction_ref}." },
  { key: "problem_ticket_created", name: "Problem ticket created", channel: "whatsapp", body: "Hi {name}, we've received your report about {category} on booking {booking_no}. Our team will contact you shortly." },
  { key: "problem_ticket_resolved", name: "Problem ticket resolved", channel: "whatsapp", body: "Hi {name}, your reported issue ({ticket_no}) on booking {booking_no} has been resolved. {notes} If anything's still not right, just reply here." },
  { key: "booking_completed", name: "Booking completed", channel: "whatsapp", body: "Thanks for riding with {business}, {name}! Your booking {booking_no} is now complete. We'd love your feedback." },
  { key: "review_request", name: "Review request", channel: "whatsapp", body: "Hi {name}, hope you enjoyed your trip! Please share a quick review of your experience with {business} — it really helps us." },
];

const FAQS = [
  { question: "What documents do I need to rent a vehicle?", answer: "A valid driving licence, a government photo ID (Aadhaar/passport/voter ID) and a refundable security deposit. For two-wheelers, a valid licence with the correct vehicle class is required." },
  { question: "Is fuel included in the rental?", answer: "No — all our vehicles are rented without fuel. Please return the vehicle with the same fuel level you received it at." },
  { question: "What is the kilometre limit?", answer: "All vehicles include 100 km per rental day. Extra kilometres driven beyond this limit are charged at ₹500/km." },
  { question: "What is your rental timing?", answer: "Standard rental day is 8:00 AM to 8:00 AM (24 hours complete cycle). Pickup before 8:00 AM or drop after 8:00 AM incurs an extra ₹250 fee." },
  { question: "Is the deposit refundable?", answer: "Yes, the security deposit is fully refundable after the vehicle is returned and inspected, minus any approved deductions for damage, late return or extra kilometres." },
  { question: "Do you negotiate on price?", answer: "No — we run a fixed, no-bargaining pricing policy so every customer gets the same transparent rate." },
  { question: "Can I book in advance?", answer: "Yes, we only accept pre-bookings. Please book at least a few hours ahead so we can prepare and inspect your vehicle." },
];

const TESTIMONIALS = [
  { name: "Kiran Gowda", vehicle: "Mahindra Thar", location: "Sakleshpura", rating: 5, quote: "Took the Thar for the Sakleshpura ghat roads — clean, well-maintained, and the deposit was returned the same day without any fuss." },
  { name: "Ananya Rao", vehicle: "Maruti Ertiga", location: "Chikmagalur", rating: 5, quote: "Booked the Ertiga for a family trip. Fixed pricing, no last-minute surprises. Exactly as quoted." },
  { name: "Suhas Shetty", vehicle: "Bajaj Pulsar NS", location: "Sakleshpura", rating: 4, quote: "Good condition bike, fair per-km rate. Would rent again for weekend rides." },
];

const BLOG_POSTS = [
  {
    slug: "sakleshpura-to-chikmagalur-self-drive-guide",
    title: "Sakleshpura to Chikmagalur: A Self-Drive Road Trip Guide",
    excerpt: "Ghat roads, coffee estates and waterfalls — what to expect on the drive, and how to plan it well.",
    author: "Darshh Holiday Team",
    content: `The Sakleshpura–Chikmagalur stretch is one of the most rewarding short drives in the Western Ghats — coffee estates on both sides of the road, mist-covered hills for most of the year, and enough waterfalls and viewpoints to fill a full day without rushing.

Budget half a day for the drive alone if you're stopping along the way, longer if you're planning a proper detour to Mullayanagiri or Baba Budangiri. The ghat sections have sharp curves and sudden weather changes, especially during monsoon (June–September), so a vehicle with good tyres and brakes matters more than horsepower here.

A few practical notes for anyone planning this on a rented vehicle: fuel up before you start, since stations thin out once you're properly into the ghat stretches. Carry your driving licence and ID with you at all times — these routes do see checkpoints. And if you're on a two-wheeler, start early; the light through the estates is best in the first few hours after sunrise, and afternoon fog can roll in fast during the wetter months.

Whether you need a nimble scooter for winding roads or a proper SUV for the whole family, book with a fixed price upfront and know exactly what your kilometre allowance covers before you leave — no surprises at the end of the trip.`,
  },
  {
    slug: "hassan-district-weekend-getaways",
    title: "Hassan District Weekend Getaways You Can Reach in a Day",
    excerpt: "Belur, Halebidu, Shravanabelagola and the Sakleshpura ghats — a practical weekend circuit.",
    author: "Darshh Holiday Team",
    content: `Hassan district packs an unusual amount into a small area — centuries-old temple towns, a hilltop Jain monolith, and some of the greenest ghat roads in Karnataka, all within a couple of hours of each other.

Belur and Halebidu are the classic pairing — Hoysala-era temple architecture, roughly 40 minutes apart, both worth a couple of unhurried hours each. Shravanabelagola, home to the Gommateshwara statue, adds another hour or so of driving but is a genuinely different kind of stop — expect some walking (and stairs) once you arrive.

If you'd rather trade temples for hills, Sakleshpura and the road toward Chikmagalur cover the other end of the district's character — coffee country, waterfalls, and long stretches where the road itself is the reason for the trip.

Either circuit works comfortably as a single day out and back, or a relaxed overnight if you want to split the driving. A compact car or scooter is enough for the temple circuit; if the ghat roads are part of your plan, a vehicle with a bit more ground clearance makes for a smoother ride.`,
  },
  {
    slug: "documents-needed-self-drive-rental-karnataka",
    title: "What Documents Do You Need to Rent a Self-Drive Vehicle?",
    excerpt: "A quick, practical checklist so pickup takes five minutes, not fifty.",
    author: "Darshh Holiday Team",
    content: `Nothing slows down a pickup more than missing paperwork, so here's the short version of what to carry.

You'll need a valid driving licence appropriate to the vehicle class — a two-wheeler licence for bikes and scooters, a valid car licence for four-wheelers. Learner's licences aren't accepted. Alongside that, bring one government-issued photo ID: Aadhaar, passport or voter ID all work.

A refundable security deposit is collected at pickup and returned after the vehicle is inspected on return, minus any deductions for damage, late return or excess kilometres — each of which is itemised, never guessed at.

A couple of things that trip people up: make sure the name on your licence matches your ID exactly, and if you're booking for someone else, the person picking up the vehicle needs to be the one whose documents are on file. Bring physical copies where possible — a photo on your phone works in a pinch, but a printed or physical ID makes verification faster.

Get this sorted before you arrive and pickup genuinely takes a few minutes — inspect the vehicle together, sign, and you're on the road.`,
  },
];

export async function seed() {
  const db = getDb();
  ensureDefaultSettings();

  const userCount = db.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number };
  if (userCount.c === 0) {
    db.prepare("INSERT INTO users (name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)").run(
      "Administrator", "admin@darshhrentals.in", "+917676875595", hashPassword("Admin@123"), "admin"
    );
    db.prepare("INSERT INTO users (name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)").run(
      "Branch Manager", "manager@darshhrentals.in", "+917676875596", hashPassword("Manager@123"), "manager"
    );
    db.prepare("INSERT INTO users (name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)").run(
      "Handover Staff", "staff@darshhrentals.in", "+917676875597", hashPassword("Staff@123"), "staff"
    );
    db.prepare("INSERT INTO users (name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)").run(
      "Accounts", "finance@darshhrentals.in", "+917676875598", hashPassword("Finance@123"), "finance"
    );
    console.log("Seeded users. Admin login: admin@darshhrentals.in / Admin@123");
  }

  const branchCount = db.prepare("SELECT COUNT(*) AS c FROM branches").get() as { c: number };
  if (branchCount.c === 0) {
    // Addresses verified via the client's own JustDial listing.
    db.prepare("INSERT INTO branches (name, city, address, phone) VALUES (?, ?, ?, ?)").run(
      "Sakleshpura Branch", "Sakleshpura", "Lakshmipooram Badavane, Railway Station Road, Sakleshpura, Karnataka", "+917676875595"
    );
    db.prepare("INSERT INTO branches (name, city, address, phone) VALUES (?, ?, ?, ?)").run(
      "Hassan Branch", "Hassan", "BM Road, Karigowda Colony, Rangoli Halla, Hassan, Karnataka", "+918088283908"
    );
  }
  const branchId = (db.prepare("SELECT id FROM branches LIMIT 1").get() as { id: number } | undefined)?.id ?? null;

  const catCount = db.prepare("SELECT COUNT(*) AS c FROM vehicle_categories").get() as { c: number };
  if (catCount.c === 0) {
    for (const c of CATEGORIES) {
      db.prepare(
        `INSERT INTO vehicle_categories (slug, name, kind, icon, image, short_desc, description, sort)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(slugify(c.name), c.name, c.kind, c.icon, c.image, c.short_desc, c.description, c.sort);
    }
  }

  const vehicleCount = db.prepare("SELECT COUNT(*) AS c FROM vehicles").get() as { c: number };
  if (vehicleCount.c === 0) {
    const catId = (name: string) =>
      (db.prepare("SELECT id FROM vehicle_categories WHERE slug = ?").get(slugify(name)) as { id: number } | undefined)?.id ?? null;
    for (const v of VEHICLES) {
      const slug = slugify(v.name);
      const reg = `KA-13-${Math.floor(1000 + Math.random() * 8999)}`;
      const info = db
        .prepare(
          `INSERT INTO vehicles (slug, name, brand, model, year, category_id, branch_id, registration_no, cc, fuel_type, transmission, seats, mileage, included_km, extra_km_rate, rate_12h, rate_24h, weekend_rate_24h, hourly_rate, deposit, late_fee_per_hour, description, terms, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'available')`
        )
        .run(
          slug, v.name, v.brand, v.model, v.year, catId(v.category), branchId, reg, v.cc ?? null, v.fuel_type, v.transmission, v.seats,
          v.mileage ?? null, v.included_km, v.extra_km_rate, v.rate_24h, v.rate_24h, v.weekend_rate_24h ?? v.rate_24h, 0, v.deposit, v.late_fee_per_hour, v.description,
          "Fixed rental — no bargaining. Vehicle rented without fuel; return with the same fuel level. Valid driving licence and government ID required."
        );
      const vehicleId = Number(info.lastInsertRowid);
      db.prepare("INSERT INTO vehicle_photos (vehicle_id, url, is_primary, sort) VALUES (?, ?, 1, 0)").run(vehicleId, v.image);
    }
  }

  const tmplCount = db.prepare("SELECT COUNT(*) AS c FROM message_templates").get() as { c: number };
  if (tmplCount.c === 0) {
    for (const t of TEMPLATES) {
      db.prepare("INSERT INTO message_templates (key, name, channel, body) VALUES (?, ?, ?, ?)").run(t.key, t.name, t.channel, t.body);
    }
  }

  const faqCount = db.prepare("SELECT COUNT(*) AS c FROM faqs").get() as { c: number };
  if (faqCount.c === 0) {
    for (const [i, f] of FAQS.entries()) {
      db.prepare("INSERT INTO faqs (question, answer, sort) VALUES (?, ?, ?)").run(f.question, f.answer, i + 1);
    }
  }

  const testCount = db.prepare("SELECT COUNT(*) AS c FROM testimonials").get() as { c: number };
  if (testCount.c === 0) {
    for (const [i, t] of TESTIMONIALS.entries()) {
      db.prepare("INSERT INTO testimonials (name, vehicle, location, rating, quote, sort) VALUES (?, ?, ?, ?, ?, ?)").run(
        t.name, t.vehicle, t.location, t.rating, t.quote, i + 1
      );
    }
  }

  const blogCount = db.prepare("SELECT COUNT(*) AS c FROM blog_posts").get() as { c: number };
  if (blogCount.c === 0) {
    for (const p of BLOG_POSTS) {
      db.prepare("INSERT INTO blog_posts (slug, title, excerpt, content, author, published) VALUES (?, ?, ?, ?, ?, 1)").run(
        p.slug, p.title, p.excerpt, p.content, p.author
      );
    }
  }

  const termsCount = db.prepare("SELECT COUNT(*) AS c FROM terms_versions").get() as { c: number };
  if (termsCount.c === 0) {
    db.prepare("INSERT INTO terms_versions (version, content, active) VALUES (1, ?, 1)").run(
      JSON.stringify([
        "A valid driving licence and government photo ID are required at pickup.",
        "Minimum customer age: 21 years for two-wheelers, 23 years for cars.",
        "Security deposit is fully refundable after inspection, minus approved deductions.",
        "Vehicles are rented without fuel — return with the same fuel level received.",
        "Standard rental period is 24 hours (8:00 AM to 8:00 AM). A 30-minute grace period applies before late fees.",
        "Extra kilometres beyond the included allowance are charged at the vehicle's listed rate.",
        "The customer is responsible for traffic fines, tolls and challans incurred during the rental.",
        "This is a fixed-price rental — no bargaining on listed rates.",
        "Sub-letting the vehicle to a third party is strictly prohibited.",
        "Cancellations made more than 24 hours before pickup are eligible for a full refund minus a small processing fee; later cancellations may forfeit part of the advance.",
        "In case of breakdown or accident, contact us immediately — do not attempt repairs without approval.",
      ])
    );
  }

  await seedDemoActivity();

  console.log("Seed complete.");
}

/** Demo transactional data — bookings, payments, refunds and tickets spanning every
 * status, so the CRM shows a working dashboard on first login instead of every
 * section being empty. Real customer names/phones would replace this over time. */
async function seedDemoActivity() {
  const db = getDb();
  const bookingCount = db.prepare("SELECT COUNT(*) AS c FROM bookings").get() as { c: number };
  if (bookingCount.c > 0) return;

  const vehId = (name: string) => (db.prepare("SELECT id FROM vehicles WHERE slug = ?").get(slugify(name)) as { id: number } | undefined)?.id;
  const iso = (daysOffset: number, hour = 8) => {
    const d = new Date();
    d.setHours(hour, 0, 0, 0);
    d.setDate(d.getDate() + daysOffset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00`;
  };

  type DemoBooking = {
    vehicle: string; days: number; pickupOffset: number;
    customer: { name: string; phone: string; email: string };
    status: "Completed" | "Active rental" | "Confirmed" | "Pending verification" | "Cancelled";
    paid: "full" | "none";
    feedback?: { rating: number; review: string };
    ticket?: { category: string; description: string; resolved: boolean };
  };

  const DEMO: DemoBooking[] = [
    { vehicle: "Honda Activa", days: 2, pickupOffset: -3, customer: { name: "Ramesh Kumar", phone: "9845210001", email: "ramesh.kumar@example.com" }, status: "Completed", paid: "full", feedback: { rating: 5, review: "Smooth pickup, bike was in great shape. Deposit came back the same evening." } },
    { vehicle: "Maruti Dzire", days: 2, pickupOffset: -2, customer: { name: "Priya Nagaraj", phone: "9845210002", email: "priya.nagaraj@example.com" }, status: "Active rental", paid: "full" },
    { vehicle: "TVS NTorq", days: 2, pickupOffset: 0, customer: { name: "Arjun Shetty", phone: "9845210003", email: "arjun.shetty@example.com" }, status: "Confirmed", paid: "full" },
    { vehicle: "Mahindra Thar", days: 3, pickupOffset: 3, customer: { name: "Deepak Rao", phone: "9845210004", email: "deepak.rao@example.com" }, status: "Confirmed", paid: "full" },
    { vehicle: "Honda Shine", days: 1, pickupOffset: 5, customer: { name: "Sneha Murthy", phone: "9845210005", email: "sneha.murthy@example.com" }, status: "Pending verification", paid: "none" },
    { vehicle: "Maruti Ertiga 7 Seater", days: 2, pickupOffset: 1, customer: { name: "Vikram Jain", phone: "9845210006", email: "vikram.jain@example.com" }, status: "Cancelled", paid: "full" },
    { vehicle: "TVS Radar", days: 3, pickupOffset: -8, customer: { name: "Kavya Poojary", phone: "9845210007", email: "kavya.poojary@example.com" }, status: "Completed", paid: "full", feedback: { rating: 4, review: "Good bike for the ghat roads. Had a minor tyre issue, sorted quickly." }, ticket: { category: "tyre", description: "Rear tyre felt low on pressure on day 2 of the rental.", resolved: true } },
    { vehicle: "Maruti Baleno Manual", days: 2, pickupOffset: -1, customer: { name: "Manoj Bhat", phone: "9845210008", email: "manoj.bhat@example.com" }, status: "Active rental", paid: "full", ticket: { category: "battery", description: "Car battery seemed weak on cold start this morning.", resolved: false } },
  ];

  const staffRow = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get() as { id: number } | undefined;
  const staffId = staffRow?.id ?? 1;

  for (const d of DEMO) {
    const vehicleId = vehId(d.vehicle);
    if (!vehicleId) continue;
    const pickupAt = iso(d.pickupOffset);
    const returnAt = iso(d.pickupOffset + d.days);

    let bookingId: number;
    let bookingNo: string;
    try {
      const result = createBooking({
        vehicleId, pickupAt, returnAt,
        location: "Sakleshpura Branch",
        customer: d.customer,
      });
      bookingId = result.bookingId;
      bookingNo = result.bookingNo;
    } catch {
      continue;
    }

    const booking = db.prepare("SELECT * FROM bookings WHERE id = ?").get(bookingId) as Record<string, unknown>;
    const customerId = booking.customer_id as number | null;
    const totalDue = Number(booking.total_amount) + Number(booking.deposit_amount);

    if (d.status !== "Pending verification") {
      db.prepare("UPDATE bookings SET status = ? WHERE id = ?").run(d.status, bookingId);
    }
    if (d.status === "Cancelled") {
      db.prepare("UPDATE bookings SET notes = COALESCE(notes || char(10), '') || ? WHERE id = ?").run("Customer requested cancellation — change of plans.", bookingId);
    }

    if (d.paid === "full") {
      const paymentNo = nextNumber("PY", null);
      db.prepare(
        "INSERT INTO payments (payment_no, booking_id, customer_id, amount, kind, method, status, paid_at, notes, receipt_no) VALUES (?, ?, ?, ?, 'full', 'UPI', 'Paid', datetime('now'), ?, ?)"
      ).run(paymentNo, bookingId, customerId, totalDue, `Demo payment for ${bookingNo}`, nextNumber("RC", null));
      db.prepare("UPDATE bookings SET paid_amount = ? WHERE id = ?").run(totalDue, bookingId);
    }

    if (d.status === "Cancelled") {
      const refundNo = nextNumber("RF", null);
      const refundAmount = Math.round(totalDue * 0.5);
      db.prepare(
        "INSERT INTO refunds (refund_no, booking_id, customer_id, reason, requested_amount, approved_amount, status, admin_notes, approved_at) VALUES (?, ?, ?, ?, ?, ?, 'Approved', ?, datetime('now'))"
      ).run(refundNo, bookingId, customerId, "Customer cancellation", totalDue, refundAmount, "50% refund per cancellation policy (6-24h notice).");
    }

    if (d.ticket) {
      const ticketNo = nextNumber("PT", null);
      db.prepare(
        "INSERT INTO problem_tickets (ticket_no, booking_id, vehicle_id, customer_id, category, description, status, assigned_to, resolution_notes, resolved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(
        ticketNo, bookingId, vehicleId, customerId, d.ticket.category, d.ticket.description,
        d.ticket.resolved ? "Resolved" : "Open", d.ticket.resolved ? staffId : null,
        d.ticket.resolved ? "Checked and topped up before customer continued the trip." : null,
        d.ticket.resolved ? new Date().toISOString() : null
      );
    }

    if (d.feedback) {
      db.prepare("INSERT INTO feedback (booking_id, customer_id, rating, review, is_public) VALUES (?, ?, ?, ?, 1)").run(
        bookingId, customerId, d.feedback.rating, d.feedback.review
      );
    }
  }

  const DEMO_ENQUIRIES = [
    { name: "Anitha Reddy", phone: "9845210009", stage: "New", source: "Website", notes: "Asked about weekend car availability for a family trip to Chikmagalur." },
    { name: "Farhan Sheikh", phone: "9845210010", stage: "Contacted", source: "WhatsApp", notes: "Wants a scooter for 3 days next week, quoted pricing over WhatsApp." },
    { name: "Lakshmi Iyer", phone: "9845210011", stage: "Follow-up", source: "Instagram", notes: "Interested in the tempo traveller for a group trip, waiting on final headcount." },
    { name: "Rahul Verma", phone: "9845210012", stage: "Lost", source: "Website", notes: "Went with a different provider closer to his pickup point." },
    { name: "Divya Shastri", phone: "9845210013", stage: "New", source: "Walk-in", notes: "Walked into the Sakleshpura branch asking about car rates for next weekend." },
    { name: "Imran Pasha", phone: "9845210014", stage: "Contacted", source: "Referral", notes: "Referred by an earlier customer, wants a bike for a 2-day trip." },
  ];
  for (const e of DEMO_ENQUIRIES) {
    const enquiryNo = nextNumber("ENQ", null);
    db.prepare(
      "INSERT INTO enquiries (enquiry_no, name, phone, source, notes, status, stage, submitted_at) VALUES (?, ?, ?, ?, ?, 'submitted', ?, datetime('now'))"
    ).run(enquiryNo, e.name, normalizePhone(e.phone), e.source, e.notes, e.stage);
  }
}

seed()
  .then(() => {
    const token = createSession(1);
    console.log(`Session token for admin: ${token}`);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
