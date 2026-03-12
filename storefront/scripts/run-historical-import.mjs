#!/usr/bin/env node
/**
 * Run historical order import from a CSV file.
 * Parses locally and calls importSingleOrder per order (avoids CLI arg length limits).
 *
 * Prerequisites:
 *   npx convex run seed:seedImportProducts
 *   seed:seedModifiers, seed:seedCakes
 *
 * Usage:
 *   node scripts/run-historical-import.mjs [path/to/orders.csv] [--dry-run]
 */

import { readFileSync } from "fs";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const storefrontRoot = join(__dirname, "..");

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (inQuotes) {
      current += c;
    } else if (c === ",") {
      result.push(current.trim());
      current = "";
    } else {
      current += c;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCsv(csvContent) {
  const lines = csvContent.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const header = parseCsvLine(lines[0]);
  const idx = (name) => {
    const i = header.findIndex((h) => h.toLowerCase().includes(name.toLowerCase()));
    return i >= 0 ? i : -1;
  };

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const get = (name) => {
      const i = idx(name);
      return i >= 0 && cells[i] !== undefined ? cells[i] : "";
    };
    const num = (name) => {
      const s = get(name).replace(/[^0-9.-]/g, "");
      return parseFloat(s) || 0;
    };

    const billingFirst = get("First Name (Billing)").trim();
    const billingLast = get("Last Name (Billing)").trim();
    const contactName = [billingFirst, billingLast].filter(Boolean).join(" ").trim() || undefined;

    const delAddr = (get("Address 1&2 (Delivery)") || get("Address 1 (Delivery)") || "").replace(/&/g, " ").trim();
    const bilAddr = (get("Address 1&2 (Billing)") || get("Address 1 (Billing)") || "").replace(/&/g, " ").trim();
    rows.push({
      orderNumber: get("Order Number"),
      orderDate: get("Order Date"),
      email: get("Email (Billing)").trim(),
      phone: get("Phone (Billing)").trim(),
      contactName,
      deliveryAddress: delAddr,
      deliveryAddress2: (get("Address 2 (Delivery)") || "").trim(),
      deliveryCity: get("City (Delivery)"),
      deliveryState: get("State Code (Delivery)"),
      deliveryZip: get("Postcode (Delivery)"),
      billingAddress: bilAddr,
      billingAddress2: (get("Address 2 (Billing)") || "").trim(),
      billingCity: get("City (Billing)"),
      billingState: get("State Code (Billing)"),
      billingZip: get("Postcode (Billing)"),
      cartDiscountAmount: num("Cart Discount Amount"),
      orderSubtotal: num("Order Subtotal Amount"),
      orderDeliveryAmount: num("Order Delivery Amount"),
      orderTotal: num("Order Total Amount"),
      itemName: get("Item Name").replace(/^"|"$/g, ""),
      quantity: Math.max(1, Math.round(num("Quantity (- Refund)"))),
      itemCost: num("Item Cost"),
      couponCode: get("Coupon Code").trim(),
    });
  }
  return rows;
}

function groupByOrder(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!row.orderNumber) continue;
    if (!map.has(row.orderNumber)) {
      map.set(row.orderNumber, {
        order: {
          orderNumber: row.orderNumber,
          orderDate: row.orderDate,
          email: row.email,
          phone: row.phone,
          contactName: row.contactName,
          deliveryAddress: row.deliveryAddress,
          deliveryAddress2: row.deliveryAddress2,
          deliveryCity: row.deliveryCity,
          deliveryState: row.deliveryState,
          deliveryZip: row.deliveryZip,
          billingAddress: row.billingAddress,
          billingAddress2: row.billingAddress2,
          billingCity: row.billingCity,
          billingState: row.billingState,
          billingZip: row.billingZip,
          cartDiscountAmount: row.cartDiscountAmount,
          orderDeliveryAmount: row.orderDeliveryAmount,
          orderTotal: row.orderTotal,
        },
        items: [],
      });
    }
    map.get(row.orderNumber).items.push({
      itemName: row.itemName,
      quantity: row.quantity,
      itemCost: row.itemCost,
      couponCode: row.couponCode,
    });
  }
  return map;
}

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const csvPath = argv.find((a) => !a.startsWith("--")) || "orders.csv";
const resolvedPath = resolve(process.cwd(), csvPath);

let csv;
try {
  csv = readFileSync(resolvedPath, "utf8");
} catch (err) {
  console.error(`Failed to read CSV: ${resolvedPath}`);
  console.error(err.message);
  process.exit(1);
}

const rows = parseCsv(csv);
const groups = groupByOrder(rows);
const orderNumbers = [...groups.keys()].sort((a, b) => {
  const da = groups.get(a).order.orderDate;
  const db = groups.get(b).order.orderDate;
  const parse = (s) => {
    const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    return m ? new Date(m[3], parseInt(m[1], 10) - 1, m[2]).getTime() : 0;
  };
  return parse(da) - parse(db);
});

const skipZeroTotal = true;
let imported = 0;
let skipped = 0;
let errors = 0;

console.log(`Importing ${orderNumbers.length} orders${dryRun ? " (dry run)" : ""}...`);

for (const orderNumber of orderNumbers) {
  const group = groups.get(orderNumber);
  if (skipZeroTotal && group.order.orderTotal <= 0) {
    console.log(`  ${orderNumber}: skipped (zero total)`);
    skipped++;
    continue;
  }

  const payload = { order: group.order, items: group.items };
  const payloadBase64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
  const argsJson = JSON.stringify({ payloadBase64, dryRun });

  // Use node to run convex CLI directly to avoid npx/Windows arg splitting
  const convexCli = join(storefrontRoot, "node_modules", "convex", "bin", "main.js");
  const result = spawnSync(
    process.execPath,
    [convexCli, "run", "importHistoricalOrders:importSingleOrder", argsJson],
    { encoding: "utf8", cwd: storefrontRoot, shell: false }
  );

  const out = (result.stdout || "").trim();
  const err = (result.stderr || "").trim();
  if (result.status !== 0) {
    console.error(`  ${orderNumber}: error - ${err || out}`);
    errors++;
    continue;
  }

  let data;
  try {
    data = JSON.parse(out);
  } catch {
    console.error(`  ${orderNumber}: invalid response`);
    errors++;
    continue;
  }

  if (data.ok) {
    if (data.skipped) {
      console.log(`  ${orderNumber}: skipped (${data.reason})`);
      skipped++;
    } else {
      console.log(`  ${orderNumber}: imported`);
      imported++;
    }
  } else {
    console.error(`  ${orderNumber}: ${data.error}`);
    errors++;
  }
}

console.log(`\nDone: ${imported} imported, ${skipped} skipped, ${errors} errors`);
