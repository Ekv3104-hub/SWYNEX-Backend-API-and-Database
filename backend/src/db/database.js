const fs = require('node:fs/promises');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DEFAULT_DATABASE_PATH = path.join(__dirname, '../../data/foodqueue.db');

// These records intentionally mirror the approved Task 1 frontend menu data.
const MENU_SEED_DATA = [
  ['food_1', 'Classic Burger', 'Juicy patty, fresh crisp veggies, melted cheddar & signature smoky sauce.', 'Burgers', 149, 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?q=80&w=500&auto=format&fit=crop', '["Bestseller"]'],
  ['food_2', 'Peri Peri Fries', 'Golden crisp crinkle cut potato fries dusted with zesty African bird’s eye seasoning.', 'Burgers', 99, 'https://images.unsplash.com/photo-1576107232684-1279f3908594?q=80&w=500&auto=format&fit=crop', '["Popular"]'],
  ['food_3', 'Margherita Pizza', 'San Marzano tomato base, hand-torn buffalo mozzarella and aromatic fresh basil.', 'Pizza', 199, 'https://images.unsplash.com/photo-1604382355076-af4b0eb60143?q=80&w=500&auto=format&fit=crop', '["Chef Pick"]'],
  ['food_4', 'Creamy Alfredo Pasta', 'Rich velvety parmesan sauce tossed with penne, garden herbs and cracked pepper.', 'Pasta', 179, 'https://images.unsplash.com/photo-1645112411341-6c4fd023714a?q=80&w=500&auto=format&fit=crop', '["Rich & Creamy"]'],
  ['food_5', 'Iced Coffee', 'Chilled bold cold brew espresso poured over whole milk with mild vanilla sweetness.', 'Beverages', 129, 'https://images.unsplash.com/photo-1517256064527-09c73fc73e38?q=80&w=500&auto=format&fit=crop', '["Chilled"]'],
  ['food_6', 'Paneer Tikka Roll', 'Smoky clay-oven paneer cubes wrapped in layered paratha with mint relish.', 'Indian', 139, 'https://images.unsplash.com/photo-1601050690597-df0568f70950?q=80&w=500&auto=format&fit=crop', '["Spicy"]'],
  ['food_7', 'Warm Chocolate Brownie', 'Dense Belgian chocolate fudge cake served warm with chocolate drizzle.', 'Desserts', 119, 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?q=80&w=500&auto=format&fit=crop', '["Sweet Treat"]'],
  ['food_8', 'Masala Chai Flask', 'Traditional campus style tea brewed slow with freshly crushed cardamom & ginger.', 'Beverages', 69, 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?q=80&w=500&auto=format&fit=crop', '["Campus Fav"]']
];

async function initializeDatabase(databasePath = DEFAULT_DATABASE_PATH) {
  await fs.mkdir(path.dirname(databasePath), { recursive: true });

  const database = new DatabaseSync(databasePath);
  const db = {
    exec(sql) {
      return database.exec(sql);
    },
    run(sql, ...parameters) {
      const values = parameters.length === 1 && Array.isArray(parameters[0]) ? parameters[0] : parameters;
      const result = database.prepare(sql).run(...values);
      return {
        changes: Number(result.changes),
        lastID: Number(result.lastInsertRowid)
      };
    },
    get(sql, ...parameters) {
      const values = parameters.length === 1 && Array.isArray(parameters[0]) ? parameters[0] : parameters;
      return database.prepare(sql).get(...values);
    },
    all(sql, ...parameters) {
      const values = parameters.length === 1 && Array.isArray(parameters[0]) ? parameters[0] : parameters;
      return database.prepare(sql).all(...values);
    },
    close() {
      return database.close();
    }
  };

  await db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      phone TEXT,
      role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'staff', 'admin')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS menu_items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      price INTEGER NOT NULL CHECK (price >= 0),
      image_url TEXT,
      is_available INTEGER NOT NULL DEFAULT 1 CHECK (is_available IN (0, 1)),
      prep_time_minutes INTEGER,
      ingredients TEXT NOT NULL DEFAULT '[]',
      allergens TEXT NOT NULL DEFAULT '[]',
      tags TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT UNIQUE,
      user_id INTEGER,
      customer_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      pickup_spot TEXT NOT NULL,
      pickup_time TEXT NOT NULL,
      payment_method TEXT NOT NULL CHECK (payment_method IN ('upi', 'card', 'cash')),
      subtotal INTEGER NOT NULL CHECK (subtotal >= 0),
      tax INTEGER NOT NULL CHECK (tax >= 0),
      total INTEGER NOT NULL CHECK (total >= 0),
      status TEXT NOT NULL DEFAULT 'order_placed' CHECK (status IN ('order_placed', 'preparing', 'ready_for_pickup', 'completed')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      menu_item_id TEXT NOT NULL,
      name_snapshot TEXT NOT NULL,
      price_snapshot INTEGER NOT NULL CHECK (price_snapshot >= 0),
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      line_total INTEGER NOT NULL CHECK (line_total >= 0),
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
    );

    CREATE TABLE IF NOT EXISTS user_preferences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      dietary_preference TEXT,
      allergies TEXT NOT NULL DEFAULT '[]',
      favorite_categories TEXT NOT NULL DEFAULT '[]',
      budget_range TEXT,
      preferred_pickup_times TEXT NOT NULL DEFAULT '[]',
      spice_preference TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  for (const item of MENU_SEED_DATA) {
    await db.run(
      `INSERT OR IGNORE INTO menu_items
       (id, name, description, category, price, image_url, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      item
    );
  }

  return db;
}

module.exports = {
  DEFAULT_DATABASE_PATH,
  MENU_SEED_DATA,
  initializeDatabase
};
