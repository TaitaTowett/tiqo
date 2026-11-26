import { getStore } from "@netlify/blobs";
import {
  getAccessToken,
  getDarajaConfig,
  jsonResponse,
  nairobiTimestamp,
  normalizePhone,
  postDarajaJson,
  stkPassword
} from "../lib/daraja.mjs";

const MAX_AMOUNT_KES = 10000000;
const MAX_TICKETS = 20;
const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const payments = getStore("tiqo-sandbox-payments");

export default async function handler(request) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Use POST to start a sandbox checkout." }, 405);
  }

  let input;
  try {
    input = await request.json();
  } catch (error) {
    return jsonResponse({ error: "Request body must be valid JSON." }, 400);
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return jsonResponse({ error: "Request body must be a JSON object." }, 400);
  }

  const phone = normalizePhone(input.phone);
  const amount = Number(input.amount);
  const quantity = Number(input.quantity);
  const eventName = typeof input.eventName === "string" ? input.eventName.trim().slice(0, 70) : "";
  const requestId = typeof input.requestId === "string" ? input.requestId : "";

  if (!REQUEST_ID_PATTERN.test(requestId)) {
    return jsonResponse({ error: "Invalid checkout request. Refresh the event page and try again." }, 400);
  }
  if (!phone) {
    return jsonResponse({ error: "Enter a valid Kenyan mobile number." }, 400);
  }
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > MAX_AMOUNT_KES) {
    return jsonResponse({ error: "The sandbox amount must be a whole number between KES 1 and KES 10,000,000." }, 400);
  }
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_TICKETS || !eventName) {
    return jsonResponse({ error: "Invalid event or ticket quantity." }, 400);
  }

  let config;
  try {
    config = getDarajaConfig();
  } catch (error) {
    return jsonResponse({ error: error.message }, 503);
  }
  if (phone !== config.allowedTestPhone) {
    return jsonResponse({ error: "Use the Daraja sandbox test phone configured for this site." }, 400);
  }

  const recordKey = `request:${requestId}`;
  let record;
  try {
    const existing = await payments.get(recordKey, { type: "json" });
    if (existing) {
      return jsonResponse({
        requestId,
        status: existing.status,
        checkoutRequestId: existing.checkoutRequestId || null,
        error: existing.status === "failed" ? existing.message : undefined
      }, existing.status === "failed" ? 409 : 200);
    }

    record = {
      requestId,
      eventName,
      quantity,
      amount,
      status: "submitting",
      createdAt: new Date().toISOString(),
      queryAttempts: 0
    };
    const inserted = await payments.setJSON(recordKey, record, { onlyIfNew: true });
    if (!inserted.modified) {
      return jsonResponse({ requestId, status: "submitting" }, 202);
    }
  } catch (error) {
    return jsonResponse({ error: "Could not safely record this sandbox checkout. No payment request was sent." }, 503);
  }

  let token;
  try {
    token = await getAccessToken(config);
  } catch (error) {
    record.status = "failed";
    record.message = error.message;
    await payments.setJSON(recordKey, record);
    return jsonResponse({ error: error.message }, 502);
  }

  const timestamp = nairobiTimestamp();
  let result;
  try {
    const response = await postDarajaJson("/mpesa/stkpush/v1/processrequest", token, {
      BusinessShortCode: config.shortcode,
      Password: stkPassword(config.shortcode, config.passkey, timestamp),
      Timestamp: timestamp,
      TransactionType: config.transactionType,
      Amount: amount,
      PartyA: phone,
      PartyB: config.shortcode,
      PhoneNumber: phone,
      CallBackURL: config.callbackUrl,
      AccountReference: "TIQO",
      TransactionDesc: "Event tickets"
    });
    result = response.result;
    if (!response.ok || String(result.ResponseCode) !== "0" || typeof result.CheckoutRequestID !== "string") {
      record.status = "failed";
      record.message = String(result.errorMessage || result.ResponseDescription || "Daraja rejected the sandbox request.").slice(0, 200);
      await payments.setJSON(recordKey, record);
      return jsonResponse({ error: record.message }, 502);
    }
  } catch (error) {
    record.status = "unknown";
    record.message = "The request outcome is unknown. Do not submit a second request until you check the status.";
    await payments.setJSON(recordKey, record);
    return jsonResponse({ requestId, status: "unknown", message: record.message }, 202);
  }

  record.status = "pending";
  record.checkoutRequestId = result.CheckoutRequestID;
  record.merchantRequestId = result.MerchantRequestID || "";
  try {
    await payments.setJSON(recordKey, record);
  } catch (error) {
    return jsonResponse({
      requestId,
      status: "unknown",
      message: "Daraja accepted the sandbox request, but its status could not be saved. Do not submit another request."
    }, 202);
  }

  return jsonResponse({
    requestId,
    checkoutRequestId: record.checkoutRequestId,
    status: "pending",
    message: result.CustomerMessage || "Sandbox request accepted."
  });
}
