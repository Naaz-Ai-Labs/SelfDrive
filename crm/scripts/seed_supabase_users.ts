import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";

function loadEnv(envPath: string) {
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnv(path.join(process.cwd(), ".env"));
loadEnv(path.join(process.cwd(), ".env.local"));

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SECRET_KEY!");
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const DB_PATH = path.join(process.cwd(), "data", "darshan.db");
const sqlite = fs.existsSync(DB_PATH) ? new DatabaseSync(DB_PATH) : null;

const SAMPLE_USERS = [
  {
    name: "Darshan Admin",
    email: "admin@darshh.com",
    password: "AdminPassword123!",
    role: "admin",
    phone: "+91 98765 00001",
    branch: "Main HQ",
  },
  {
    name: "Rahul Sharma",
    email: "rahul.staff@darshh.com",
    password: "StaffPassword123!",
    role: "staff",
    phone: "+91 98765 00002",
    branch: "North Branch",
  },
  {
    name: "Priya Patel",
    email: "priya.staff@darshh.com",
    password: "StaffPassword123!",
    role: "staff",
    phone: "+91 98765 00003",
    branch: "Airport Branch",
  },
  {
    name: "Amit Kumar",
    email: "amit.staff@darshh.com",
    password: "StaffPassword123!",
    role: "staff",
    phone: "+91 98765 00004",
    branch: "Central Branch",
  },
  {
    name: "Neha Singh",
    email: "neha.staff@darshh.com",
    password: "StaffPassword123!",
    role: "staff",
    phone: "+91 98765 00005",
    branch: "South Branch",
  },
];

async function seedUsers() {
  console.log("🚀 Starting Supabase & CRM User Registration...\n");

  for (const u of SAMPLE_USERS) {
    console.log(`👤 Processing user: ${u.name} (${u.email}) [${u.role.toUpperCase()}]`);

    // 1. Create or Update user in Supabase Auth
    try {
      const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: u.email,
        password: u.password,
        email_confirm: true,
        user_metadata: {
          name: u.name,
          role: u.role,
          branch: u.branch,
        },
      });

      if (authError) {
        if (authError.message.includes("already registered") || authError.message.includes("already exists")) {
          console.log(`   ℹ️ Supabase Auth: User already exists in Supabase Auth. Updating password...`);
          const { data: list } = await supabaseAdmin.auth.admin.listUsers();
          const existing = list?.users.find((usr) => usr.email === u.email);
          if (existing) {
            await supabaseAdmin.auth.admin.updateUserById(existing.id, {
              password: u.password,
              user_metadata: { name: u.name, role: u.role, branch: u.branch },
            });
          }
        } else {
          console.error(`   ❌ Supabase Auth Error: ${authError.message}`);
        }
      } else {
        console.log(`   ✅ Supabase Auth: Successfully registered user.`);
      }
    } catch (err: any) {
      console.error(`   ❌ Supabase Auth Exception: ${err?.message || err}`);
    }

    // 2. Insert/Upsert into Supabase DB 'users' table by matching email
    const passwordHash = bcrypt.hashSync(u.password, 10);
    const { data: existingDbUser } = await supabaseAdmin.from("users").select("id").eq("email", u.email).single();

    if (existingDbUser) {
      const { error: updateErr } = await supabaseAdmin
        .from("users")
        .update({
          name: u.name,
          phone: u.phone,
          password_hash: passwordHash,
          role: u.role,
          branch: u.branch,
          is_active: 1,
        })
        .eq("email", u.email);

      if (updateErr) {
        console.error(`   ❌ Supabase Table Update Error: ${updateErr.message}`);
      } else {
        console.log(`   ✅ Supabase Table: Updated user in 'users' table.`);
      }
    } else {
      const { error: insertErr } = await supabaseAdmin.from("users").insert({
        name: u.name,
        email: u.email,
        phone: u.phone,
        password_hash: passwordHash,
        role: u.role,
        branch: u.branch,
        is_active: 1,
      });

      if (insertErr) {
        console.error(`   ❌ Supabase Table Insert Error: ${insertErr.message}`);
      } else {
        console.log(`   ✅ Supabase Table: Inserted user into 'users' table.`);
      }
    }

    // 3. Sync to local SQLite 'darshan.db'
    if (sqlite) {
      try {
        const existing = sqlite.prepare("SELECT id FROM users WHERE email = ?").get(u.email);
        if (existing) {
          sqlite
            .prepare("UPDATE users SET name = ?, password_hash = ?, role = ?, branch = ?, phone = ?, is_active = 1 WHERE email = ?")
            .run(u.name, passwordHash, u.role, u.branch, u.phone, u.email);
        } else {
          sqlite
            .prepare("INSERT INTO users (name, email, password_hash, role, branch, phone, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)")
            .run(u.name, u.email, passwordHash, u.role, u.branch, u.phone);
        }
        console.log(`   ✅ SQLite DB: Synced to local database.`);
      } catch (err: any) {
        console.error(`   ❌ SQLite Error: ${err?.message || err}`);
      }
    }

    console.log("");
  }

  console.log("==========================================");
  console.log("🎉 User Registration Complete!");
  console.log("==========================================\n");
}

seedUsers().catch(console.error);
