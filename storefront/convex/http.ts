import { httpRouter } from "convex/server";

import { handlePayPalEvent, handleStripeEvent } from "./webhooks";

const http = httpRouter();

http.route({
  path: "/webhooks/stripe",
  method: "POST",
  handler: handleStripeEvent,
});

http.route({
  path: "/webhooks/paypal",
  method: "POST",
  handler: handlePayPalEvent,
});

export default http;
