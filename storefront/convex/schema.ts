import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const timeWindowValidator = v.object({
  start: v.string(),
  end: v.string(),
});

const storeHoursValidator = v.record(
  v.string(),
  v.array(timeWindowValidator)
);

const cutoffTimesValidator = v.record(
  v.string(),
  v.record(v.string(), v.string())
);

const leadTimeOverridesValidator = v.record(v.string(), v.number());

const geoJsonPolygonValidator = v.object({
  type: v.string(),
  coordinates: v.array(v.array(v.array(v.number()))),
});

const productSnapshotValidator = v.object({
  productId: v.id("products"),
  name: v.optional(v.string()),
});

const variantSnapshotValidator = v.object({
  variantId: v.id("productVariants"),
  label: v.string(),
  priceDeltaCents: v.number(),
});

const modifierSnapshotValidator = v.object({
  groupId: v.id("modifierGroups"),
  optionId: v.id("modifierOptions"),
  groupName: v.optional(v.string()),
  optionName: v.optional(v.string()),
  priceDeltaCents: v.number(),
});

const roleValidator = v.union(
  v.literal("admin"),
  v.literal("manager"),
  v.literal("kitchen"),
  v.literal("dispatcher"),
  v.literal("driver"),
  v.literal("customer")
);

export default defineSchema({
  products: defineTable({
    productCode: v.optional(v.string()),
    name: v.string(),
    slug: v.string(),
    /** Brief teaser for cards/listing (e.g. ~4–8 words). Falls back to start of description if blank. */
    shortDescription: v.optional(v.string()),
    description: v.string(),
    images: v.array(v.string()),
    shapeImages: v.optional(
      v.object({
        mixed: v.optional(v.array(v.string())),
        even20: v.optional(v.array(v.string())),
        rose: v.optional(v.array(v.string())),
        blossom: v.optional(v.array(v.string())),
      })
    ),
    status: v.union(v.literal("active"), v.literal("hidden")),
    categories: v.array(v.string()),
    tags: v.array(v.string()),
    basePriceCents: v.number(),
    fulfillmentFlags: v.object({
      pickup: v.boolean(),
      delivery: v.boolean(),
      shipping: v.boolean(),
    }),
    leadTimeHoursOverride: v.optional(v.number()),
    inStockToday: v.boolean(),
    maxQtyPerOrder: v.optional(v.number()),
    /** Fun badges: "popular" (light green), "new_flavor" (yellow), "best_seller" (red) */
    badges: v.optional(
      v.array(v.union(v.literal("popular"), v.literal("new_flavor"), v.literal("best_seller")))
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_status", ["status"])
    .index("by_productCode", ["productCode"]),

  productVariants: defineTable({
    productId: v.id("products"),
    label: v.string(),
    priceDeltaCents: v.number(),
    sku: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_product", ["productId"])
    .index("by_product_label", ["productId", "label"]),

  modifierGroups: defineTable({
    /** When undefined, group is global (applies to all products). */
    productId: v.optional(v.id("products")),
    name: v.string(),
    description: v.optional(v.string()),
    required: v.boolean(),
    minSelect: v.number(),
    maxSelect: v.number(),
    sortOrder: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_product", ["productId"])
    .index("by_product_sort", ["productId", "sortOrder"]),

  modifierOptions: defineTable({
    groupId: v.id("modifierGroups"),
    name: v.string(),
    priceDeltaCents: v.number(),
    sortOrder: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_group", ["groupId"])
    .index("by_group_sort", ["groupId", "sortOrder"]),

  carts: defineTable({
    ownerType: v.union(v.literal("guest"), v.literal("user")),
    ownerId: v.string(),
    status: v.union(v.literal("active"), v.literal("converted"), v.literal("abandoned")),
    contactEmail: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    fulfillmentMode: v.optional(
      v.union(v.literal("pickup"), v.literal("delivery"), v.literal("shipping"))
    ),
    addressId: v.optional(v.string()),
    tipCents: v.number(),
    appliedCouponId: v.optional(v.string()),
    appliedCouponCode: v.optional(v.string()),
    appliedLoyaltyPoints: v.optional(v.number()),
    slotHoldId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner_status", ["ownerType", "ownerId", "status"])
    .index("by_status", ["status"]),

  cartItems: defineTable({
    cartId: v.id("carts"),
    productId: v.id("products"),
    variantId: v.optional(v.id("productVariants")),
    qty: v.number(),
    modifiers: v.array(
      v.object({
        groupId: v.id("modifierGroups"),
        optionId: v.id("modifierOptions"),
      })
    ),
    itemNote: v.optional(v.string()),
    unitPriceSnapshotCents: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_cart", ["cartId"])
    .index("by_cart_product_variant", ["cartId", "productId", "variantId"]),

  addresses: defineTable({
    ownerId: v.optional(v.string()),
    formatted: v.string(),
    line1: v.string(),
    line2: v.optional(v.string()),
    city: v.string(),
    state: v.string(),
    zip: v.string(),
    lat: v.number(),
    lng: v.number(),
    placeId: v.optional(v.string()),
    notes: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_zip", ["zip"]),

  deliveryTiers: defineTable({
    minMiles: v.number(),
    maxMiles: v.number(),
    feeCents: v.number(),
    enabled: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_enabled", ["enabled"]),

  deliveryZones: defineTable({
    name: v.string(),
    polygonGeoJson: v.union(geoJsonPolygonValidator, v.null()),
    feeCents: v.number(),
    enabled: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_enabled", ["enabled"]),

  addressCache: defineTable({
    addressId: v.id("addresses"),
    distanceMiles: v.number(),
    zoneId: v.optional(v.id("deliveryZones")),
    eligibleDelivery: v.boolean(),
    eligibleShipping: v.boolean(),
    computedAt: v.number(),
  })
    .index("by_address", ["addressId"])
    .index("by_zone", ["zoneId"]),

  availabilityRules: defineTable({
    version: v.number(),
    timezone: v.string(),
    storeHours: storeHoursValidator,
    cutoffTimes: cutoffTimesValidator,
    globalLeadTimeHours: v.number(),
    categoryLeadTimeHours: v.optional(leadTimeOverridesValidator),
    productLeadTimeHours: v.optional(leadTimeOverridesValidator),
    slotDurationMinutesByMode: v.object({
      pickup: v.number(),
      delivery: v.number(),
      shipping: v.number(),
    }),
    holdMinutes: v.number(),
    enabled: v.boolean(),
    effectiveFrom: v.string(),
    createdAt: v.number(),
    /** Optional: static slot start times (HH:mm). When set, these override storeHours for slot generation. */
    slotTimes: v.optional(v.array(v.string())),
    /** Default max orders per slot when not in slotCapacities. */
    defaultMaxOrdersPerSlot: v.optional(v.number()),
    /** If current time >= this (HH:mm), next-day earliest slot is nextDayMinSlotStart. E.g. "16:00" = after 4pm. */
    nextDayCutoffAfterHm: v.optional(v.string()),
    /** When nextDayCutoffAfterHm applies, earliest slot for tomorrow. E.g. "15:00" = 3pm. */
    nextDayMinSlotStart: v.optional(v.string()),
    /** When true, always hide tomorrow's morning slots (ignore current time). Useful for testing. */
    nextDayCutoffAlwaysApply: v.optional(v.boolean()),
  })
    .index("by_enabled", ["enabled"])
    .index("by_effectiveFrom", ["effectiveFrom"]),

  blackoutDates: defineTable({
    date: v.string(),
    modes: v.optional(
      v.array(v.union(v.literal("pickup"), v.literal("delivery"), v.literal("shipping")))
    ),
    note: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_date", ["date"]),

  slotCapacities: defineTable({
    slotKey: v.string(),
    mode: v.union(v.literal("pickup"), v.literal("delivery"), v.literal("shipping")),
    date: v.string(),
    startTime: v.string(),
    endTime: v.string(),
    maxOrders: v.number(),
    categoryCaps: v.optional(v.record(v.string(), v.number())),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slotKey", ["slotKey"])
    .index("by_date_mode", ["date", "mode"]),

  slotHolds: defineTable({
    cartId: v.id("carts"),
    slotKey: v.string(),
    expiresAt: v.number(),
    status: v.union(
      v.literal("held"),
      v.literal("converted"),
      v.literal("expired"),
      v.literal("released")
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slotKey", ["slotKey"])
    .index("by_cartId", ["cartId"])
    .index("by_status_expiresAt", ["status", "expiresAt"]),

  slotBookings: defineTable({
    orderId: v.id("orders"),
    cartId: v.id("carts"),
    slotKey: v.string(),
    mode: v.union(v.literal("pickup"), v.literal("delivery"), v.literal("shipping")),
    createdAt: v.number(),
  })
    .index("by_slotKey", ["slotKey"])
    .index("by_orderId", ["orderId"])
    .index("by_cartId", ["cartId"]),

  users: defineTable({
    tokenIdentifier: v.string(),
    email: v.string(),
    name: v.string(),
    image: v.optional(v.string()),
    role: roleValidator,
    isActive: v.boolean(),
    stripeCustomerId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_token", ["tokenIdentifier"])
    .index("by_email", ["email"])
    .index("by_role", ["role"]),

  auditLogs: defineTable({
    actorType: v.union(v.literal("admin"), v.literal("system")),
    actorId: v.string(),
    action: v.string(),
    entityType: v.string(),
    entityId: v.string(),
    diff: v.optional(v.any()), // intentionally unstructured: arbitrary before/after JSON for audit trail
    createdAt: v.number(),
  })
    .index("by_entity", ["entityType", "entityId"])
    .index("by_createdAt", ["createdAt"])
    .index("by_entityType_createdAt", ["entityType", "createdAt"]),

  orderEvents: defineTable({
    orderId: v.id("orders"),
    status: v.string(),
    note: v.optional(v.string()),
    actorType: v.union(v.literal("system"), v.literal("admin"), v.literal("driver")),
    actorId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_order", ["orderId"])
    .index("by_status", ["status"]),

  orders: defineTable({
    orderNumber: v.string(),
    cartId: v.optional(v.id("carts")),
    userId: v.optional(v.id("users")),
    guestToken: v.string(),
    status: v.string(),
    contactEmail: v.optional(v.string()),
    contactName: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    fulfillmentMode: v.union(v.literal("pickup"), v.literal("delivery"), v.literal("shipping")),
    addressId: v.optional(v.id("addresses")),
    scheduledSlotKey: v.optional(v.string()),
    pricingSnapshot: v.object({
      subtotalCents: v.number(),
      discountCents: v.number(),
      deliveryFeeCents: v.number(),
      shippingFeeCents: v.number(),
      tipCents: v.number(),
      taxCents: v.number(),
      totalCents: v.number(),
    }),
    appliedCouponCode: v.optional(v.string()),
    loyaltyPointsEarned: v.optional(v.number()),
    loyaltyPointsRedeemed: v.optional(v.number()),
    paymentProvider: v.optional(v.string()),
    paymentIntentId: v.optional(v.string()),
    paypalOrderId: v.optional(v.string()),
    carrier: v.optional(v.string()),
    trackingNumber: v.optional(v.string()),
    /** 0=none, 1=sent 1hr reminder, 2=sent 2hr reminder. Reset when status changes. */
    lastReminderLevel: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_orderNumber", ["orderNumber"])
    .index("by_cartId", ["cartId"])
    .index("by_guestToken", ["guestToken"])
    .index("by_userId", ["userId"])
    .index("by_contactEmail", ["contactEmail"])
    .index("by_contactEmail_createdAt", ["contactEmail", "createdAt"])
    .index("by_status", ["status"])
    .index("by_paymentIntentId", ["paymentIntentId"])
    .index("by_paypalOrderId", ["paypalOrderId"])
    .index("by_createdAt", ["createdAt"])
    .index("by_status_createdAt", ["status", "createdAt"])
    .index("by_fulfillmentMode_createdAt", ["fulfillmentMode", "createdAt"])
    .index("by_status_fulfillmentMode_createdAt", ["status", "fulfillmentMode", "createdAt"])
    .index("by_status_updatedAt", ["status", "updatedAt"]),

  orderItems: defineTable({
    orderId: v.id("orders"),
    productSnapshot: productSnapshotValidator,
    variantSnapshot: v.optional(variantSnapshotValidator),
    modifiersSnapshot: v.array(modifierSnapshotValidator),
    qty: v.number(),
    unitPriceCents: v.number(),
    itemNote: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_order", ["orderId"]),

  webhookEvents: defineTable({
    provider: v.union(v.literal("stripe"), v.literal("paypal")),
    eventId: v.string(),
    payloadHash: v.string(),
    processedAt: v.optional(v.number()),
    status: v.union(
      v.literal("received"),
      v.literal("processed"),
      v.literal("ignored"),
      v.literal("failed")
    ),
    error: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_provider_eventId", ["provider", "eventId"])
    .index("by_status", ["status"]),

  paymentAttempts: defineTable({
    cartId: v.id("carts"),
    provider: v.union(v.literal("stripe"), v.literal("paypal")),
    status: v.union(
      v.literal("started"),
      v.literal("succeeded"),
      v.literal("failed"),
      v.literal("canceled")
    ),
    referenceId: v.optional(v.string()),
    error: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_cart", ["cartId"])
    .index("by_provider", ["provider"])
    .index("by_referenceId", ["referenceId"]),

  coupons: defineTable({
    code: v.string(),
    type: v.union(v.literal("percent"), v.literal("fixed"), v.literal("free_delivery")),
    value: v.number(),
    minSubtotalCents: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    maxRedemptions: v.optional(v.number()),
    maxRedemptionsPerCustomer: v.optional(v.number()),
    includeProductIds: v.optional(v.array(v.id("products"))),
    includeCategoryTags: v.optional(v.array(v.string())),
    excludeProductIds: v.optional(v.array(v.id("products"))),
    excludeCategoryTags: v.optional(v.array(v.string())),
    stackable: v.boolean(),
    enabled: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_enabled", ["enabled"]),

  couponRedemptions: defineTable({
    couponId: v.id("coupons"),
    code: v.string(),
    orderId: v.id("orders"),
    userId: v.optional(v.id("users")),
    contactEmail: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_coupon", ["couponId"])
    .index("by_user_coupon", ["userId", "couponId"])
    .index("by_contactEmail_coupon", ["contactEmail", "couponId"])
    .index("by_orderId", ["orderId"]),

  /** Coupons issued to customers via email blast or direct assignment. Used for "Available Rewards". */
  couponIssuances: defineTable({
    couponId: v.id("coupons"),
    recipientEmail: v.string(),
    source: v.union(v.literal("email_blast"), v.literal("direct")),
    blastId: v.optional(v.id("emailBlasts")),
    createdAt: v.number(),
  })
    .index("by_recipient", ["recipientEmail"])
    .index("by_coupon", ["couponId"]),

  loyaltyAccounts: defineTable({
    userId: v.id("users"),
    pointsBalance: v.number(),
    tier: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  pointsLedger: defineTable({
    accountId: v.id("loyaltyAccounts"),
    type: v.union(v.literal("earn"), v.literal("redeem"), v.literal("adjust")),
    points: v.number(),
    orderId: v.optional(v.id("orders")),
    note: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_account", ["accountId"])
    .index("by_order", ["orderId"]),

  bonusClaims: defineTable({
    userId: v.id("users"),
    bonusType: v.union(v.literal("signup"), v.literal("share")),
    claimedAt: v.number(),
  }).index("by_user_type", ["userId", "bonusType"]),

  triviaDailyCompletions: defineTable({
    userId: v.id("users"),
    completionDate: v.string(),
    pointsEarned: v.number(),
    createdAt: v.number(),
  })
    .index("by_user_date", ["userId", "completionDate"]),

  drivers: defineTable({
    userId: v.optional(v.id("users")),
    name: v.string(),
    phone: v.string(),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_active", ["active"])
    .index("by_userId", ["userId"]),

  driverAssignments: defineTable({
    orderId: v.id("orders"),
    driverId: v.id("drivers"),
    status: v.union(v.literal("assigned"), v.literal("en_route"), v.literal("delivered")),
    eta: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_order", ["orderId"])
    .index("by_driver", ["driverId"]),

  driverLocations: defineTable({
    assignmentId: v.id("driverAssignments"),
    lat: v.number(),
    lng: v.number(),
    createdAt: v.number(),
  }).index("by_assignment", ["assignmentId"]),

  proofOfDeliveryFiles: defineTable({
    assignmentId: v.id("driverAssignments"),
    storageId: v.string(),
    createdAt: v.number(),
  }).index("by_assignment", ["assignmentId"]),

  siteSettings: defineTable({
    key: v.string(),
    value: v.string(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  emailBlasts: defineTable({
    subject: v.string(),
    bodyHtml: v.string(),
    lastOrderWithinDays: v.optional(v.number()),
    isTest: v.optional(v.boolean()),
    status: v.union(
      v.literal("pending"),
      v.literal("sending"),
      v.literal("completed"),
      v.literal("failed")
    ),
    totalRecipients: v.number(),
    sentCount: v.number(),
    actorId: v.string(),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_createdAt", ["createdAt"])
    .index("by_status", ["status"]),

  notificationLogs: defineTable({
    channel: v.union(v.literal("email"), v.literal("sms")),
    to: v.string(),
    subject: v.optional(v.string()),
    template: v.optional(v.string()),
    bodyPreview: v.optional(v.string()),
    status: v.union(v.literal("sent"), v.literal("skipped"), v.literal("error")),
    errorMessage: v.optional(v.string()),
    externalId: v.optional(v.string()),
    orderId: v.optional(v.id("orders")),
    orderNumber: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_createdAt", ["createdAt"])
    .index("by_channel", ["channel"])
    .index("by_channel_createdAt", ["channel", "createdAt"])
    .index("by_to", ["to"])
    .index("by_orderId", ["orderId"]),

  mediaLibrary: defineTable({
    storageId: v.string(),
    filename: v.string(),
    contentType: v.string(),
    size: v.number(),
    createdAt: v.number(),
  })
    .index("by_createdAt", ["createdAt"])
    .index("by_storageId", ["storageId"]),

  chatConversations: defineTable({
    orderId: v.optional(v.id("orders")),
    userId: v.optional(v.id("users")),
    guestToken: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    contactName: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    accessToken: v.optional(v.string()),
    status: v.union(v.literal("open"), v.literal("closed")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_orderId", ["orderId"])
    .index("by_userId", ["userId"])
    .index("by_guestToken", ["guestToken"])
    .index("by_contactEmail", ["contactEmail"])
    .index("by_status_updatedAt", ["status", "updatedAt"]),

  chatMessages: defineTable({
    conversationId: v.id("chatConversations"),
    authorType: v.union(v.literal("customer"), v.literal("staff")),
    authorId: v.optional(v.id("users")),
    body: v.string(),
    createdAt: v.number(),
  }).index("by_conversation_createdAt", ["conversationId", "createdAt"]),
});
