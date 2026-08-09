import { getDb } from '../src/lib/db';
const db = getDb();
const cars = db.prepare("SELECT v.id, v.name, v.category_id, c.kind, v.active, v.status FROM vehicles v JOIN vehicle_categories c ON v.category_id = c.id WHERE c.kind = 'car'").all();
console.log('Cars in SQLite:', JSON.stringify(cars, null, 2));
const allCategories = db.prepare('SELECT * FROM vehicle_categories').all();
console.log('Categories:', JSON.stringify(allCategories, null, 2));
const allVehicles = db.prepare("SELECT v.id, v.name, v.category_id, c.kind as category_kind, v.active, v.status FROM vehicles v LEFT JOIN vehicle_categories c ON v.category_id = c.id ORDER BY v.category_id, v.id").all();
console.log('All vehicles:', JSON.stringify(allVehicles, null, 2));
