# FoodQueue Backend API and Database

This repository implements SWYNEX Task 2 for the existing FoodQueue campus cafeteria application. It provides a Node.js, Express, and SQLite backend for the approved order flow:

```text
Browse Menu -> Select Food -> Add to Cart -> Checkout -> Place Order -> Token -> Order Tracking
```

Task 1 remains the source of truth for the FoodQueue menu, 5% GST calculation, `#FQ-...` token style, and order-tracking stages. This repository does not modify or depend on the Task 1 frontend at runtime.

## Included Scope

- Persistent SQLite database at `data/foodqueue.db`
- Seeded menu records matching Task 1's eight FoodQueue items
- Complete Orders resource with creation, lookup, user history, and status updates
- Server-side validation, pricing, token generation, and JSON error responses
- Automated API, persistence, validation, GST, seed-data, and status-transition tests

## Not Implemented

- Frontend integration (Task 3)
- Authentication and authorization
- Payment gateway integration
- Real-time updates, notifications, or staff dashboard
- Berlin AI, recommendations, and personalization

Berlin AI remains a documented future extension only. No AI API, key, model, or training workflow is included here.

## Requirements

- Node.js 22.5 or newer (uses Node's built-in `node:sqlite` driver)
- pnpm

## Run Locally

From the `backend` directory:

```bash
pnpm install
pnpm start
```

The API starts at `http://localhost:3000`. On first start, it creates `data/foodqueue.db`, initializes the schema, and seeds the approved menu. The database file is ignored by Git but remains on disk between server restarts.

To run the automated tests:

```bash
pnpm test
```

## API

### Create an order

`POST /api/orders`

```json
{
  "customerName": "Ethan Vance",
  "phone": "+91 98765 43210",
  "pickupSpot": "Table 12 (Main Floor)",
  "pickupTime": "12:30",
  "paymentMethod": "upi",
  "items": [
    { "menuItemId": "food_1", "quantity": 2 },
    { "menuItemId": "food_2", "quantity": 1 }
  ]
}
```

`userId` is optional because Task 1 supports orders before authentication. When supplied, it must reference an existing user record.

The server looks up menu prices itself. For the example above, the subtotal is `397`, GST is `20` (5%, rounded), and the total is `417`. The first order token is `#FQ-0001`.

### Get an order

`GET /api/orders/:id`

### Get a user's order history

`GET /api/users/:userId/orders`

### Advance order tracking status

`PATCH /api/orders/:id/status`

```json
{ "status": "preparing" }
```

The permitted sequence is:

```text
order_placed -> preparing -> ready_for_pickup -> completed
```

Only the next stage is accepted. This maps to Task 1's Order Placed, Kitchen Preparing, Ready for Pickup, and Completed UI timeline.

## Validation

Order creation requires:

- non-empty `customerName`
- valid `phone` (spaces and hyphens are normalized)
- non-empty `pickupSpot` and `pickupTime`
- `paymentMethod` of `upi`, `card`, or `cash`
- at least one item
- valid, available `menuItemId` values
- positive integer item quantities

Invalid requests return `400` with field-level details. Missing orders or users return `404`. Unexpected errors return a `500` response in this format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable explanation"
  }
}
```

## Database Model

- `users`: planned FoodQueue users and roles
- `menu_items`: approved Task 1 menu data
- `orders`: customer, pickup, payment, totals, token, and tracking status
- `order_items`: order line items with price/name snapshots
- `user_preferences`: planned future preference profile, one per user

`users` to `orders` is one-to-many. `users` to `user_preferences` is one-to-one. `orders` to `order_items` is one-to-many, and each order item references a menu item.
