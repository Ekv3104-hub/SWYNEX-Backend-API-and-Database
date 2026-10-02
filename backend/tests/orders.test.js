const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const request = require('supertest');

const { createApp } = require('../src/app');
const { MENU_SEED_DATA, initializeDatabase } = require('../src/db/database');
const { getAllMenuItems } = require('../src/models/menuItemModel');
const { createUser } = require('../src/models/userModel');

async function setupDatabase(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'foodqueue-api-test-'));
  const databasePath = path.join(directory, 'foodqueue-test.db');
  const db = await initializeDatabase(databasePath);

  t.after(async () => {
    await db.close();
    await fs.rm(directory, { recursive: true, force: true });
  });

  return { db, databasePath, app: createApp(db) };
}

function validOrder(overrides = {}) {
  return {
    customerName: 'Ethan Vance',
    phone: '+91 98765 43210',
    pickupSpot: 'Table 12 (Main Floor)',
    pickupTime: '12:30',
    paymentMethod: 'upi',
    items: [
      { menuItemId: 'food_1', quantity: 2 },
      { menuItemId: 'food_2', quantity: 1 }
    ],
    ...overrides
  };
}

test('seeds the eight approved Task 1 menu items', async (t) => {
  const { db } = await setupDatabase(t);
  const menuItems = await getAllMenuItems(db);

  assert.equal(menuItems.length, MENU_SEED_DATA.length);
  assert.deepEqual(
    menuItems.map((item) => [item.id, item.name, item.category, item.price, item.description, item.image_url]),
    MENU_SEED_DATA.map(([id, name, description, category, price, imageUrl]) => [id, name, category, price, description, imageUrl])
  );
});

test('creates, retrieves, and lists an order with the approved GST calculation and token format', async (t) => {
  const { db, app } = await setupDatabase(t);
  const user = await createUser(db, { name: 'Ethan Vance', email: 'ethan@example.com', phone: '+919876543210' });

  const creation = await request(app)
    .post('/api/orders')
    .send(validOrder({ userId: user.id }));

  assert.equal(creation.status, 201);
  assert.equal(creation.body.order.token, '#FQ-0001');
  assert.equal(creation.body.order.status, 'order_placed');
  assert.equal(creation.body.order.subtotal, 397);
  assert.equal(creation.body.order.tax, 20);
  assert.equal(creation.body.order.total, 417);
  assert.equal(creation.body.order.phone, '+919876543210');
  assert.equal(creation.body.order.items.length, 2);

  const lookup = await request(app).get(`/api/orders/${creation.body.order.id}`);
  assert.equal(lookup.status, 200);
  assert.equal(lookup.body.order.total, 417);
  assert.equal(lookup.body.order.items[0].name, 'Classic Burger');

  const history = await request(app).get(`/api/users/${user.id}/orders`);
  assert.equal(history.status, 200);
  assert.equal(history.body.orders.length, 1);
  assert.equal(history.body.orders[0].token, '#FQ-0001');
});

test('returns field-level validation errors for invalid order creation requests', async (t) => {
  const { app } = await setupDatabase(t);
  const invalidRequests = [
    validOrder({ customerName: '   ' }),
    validOrder({ phone: 'invalid-phone' }),
    validOrder({ pickupSpot: '' }),
    validOrder({ pickupTime: '' }),
    validOrder({ paymentMethod: 'wallet' }),
    validOrder({ items: [] }),
    validOrder({ items: [{ menuItemId: 'food_1', quantity: 0 }] })
  ];

  for (const payload of invalidRequests) {
    const response = await request(app).post('/api/orders').send(payload);
    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, 'VALIDATION_ERROR');
    assert.ok(response.body.error.details.length > 0);
  }
});

test('rejects an order that references an unknown menu item', async (t) => {
  const { app } = await setupDatabase(t);
  const response = await request(app)
    .post('/api/orders')
    .send(validOrder({ items: [{ menuItemId: 'food_404', quantity: 1 }] }));

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'VALIDATION_ERROR');
  assert.match(response.body.error.details[0].message, /valid menu item/);
});

test('enforces the approved order status progression', async (t) => {
  const { app } = await setupDatabase(t);
  const created = await request(app).post('/api/orders').send(validOrder());
  const orderId = created.body.order.id;

  const skippedStage = await request(app)
    .patch(`/api/orders/${orderId}/status`)
    .send({ status: 'ready_for_pickup' });
  assert.equal(skippedStage.status, 400);
  assert.equal(skippedStage.body.error.code, 'INVALID_STATUS_TRANSITION');

  for (const status of ['preparing', 'ready_for_pickup', 'completed']) {
    const updated = await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .send({ status });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.order.status, status);
  }

  const afterCompletion = await request(app)
    .patch(`/api/orders/${orderId}/status`)
    .send({ status: 'completed' });
  assert.equal(afterCompletion.status, 400);
  assert.equal(afterCompletion.body.error.code, 'INVALID_STATUS_TRANSITION');
});

test('returns predictable not-found errors', async (t) => {
  const { app } = await setupDatabase(t);
  const missingOrder = await request(app).get('/api/orders/999');
  const missingUser = await request(app).get('/api/users/999/orders');
  const missingRoute = await request(app).get('/api/not-a-route');

  assert.equal(missingOrder.status, 404);
  assert.equal(missingOrder.body.error.code, 'NOT_FOUND');
  assert.equal(missingUser.status, 404);
  assert.equal(missingUser.body.error.code, 'NOT_FOUND');
  assert.equal(missingRoute.status, 404);
  assert.equal(missingRoute.body.error.code, 'ROUTE_NOT_FOUND');
});

test('persists orders after the database connection is restarted', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'foodqueue-persistence-test-'));
  const databasePath = path.join(directory, 'foodqueue-test.db');

  const firstConnection = await initializeDatabase(databasePath);
  const firstApp = createApp(firstConnection);
  const creation = await request(firstApp).post('/api/orders').send(validOrder());
  await firstConnection.close();

  const secondConnection = await initializeDatabase(databasePath);
  t.after(async () => {
    await secondConnection.close();
    await fs.rm(directory, { recursive: true, force: true });
  });
  const secondApp = createApp(secondConnection);
  const lookup = await request(secondApp).get(`/api/orders/${creation.body.order.id}`);

  assert.equal(lookup.status, 200);
  assert.equal(lookup.body.order.token, '#FQ-0001');
  assert.equal(lookup.body.order.total, 417);
});
