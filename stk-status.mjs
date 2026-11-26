import { getStore } from "@netlify/blobs";
import {
  getAccessToken,
  getDarajaConfig,
  jsonResponse,
  nairobiTimestamp,
  postDarajaJson,
  stkPassword
} from "../lib/daraja.mjs";

const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_STATUS_CHECKS = 20;
const payments = getStore("tiqo-sandbox-payments");

export default async function handler(request) {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Use GET to check sandbox payment status." }, 405);
  }

  const requestId = new URL(request.url).searchParams.get("requestId") || "";
  if (!REQUEST_ID_PATTERN.test(requestId)) {
    return jsonResponse({ error: "Invalid payment status request." }, 400);
  }

  const recordKey = `request:${requestId}`;
  let record;
  try {
    record = await payments.get(recordKey, { type: "json" });
  } catch (error) {
    return jsonResponse({ error: "Could not read the sandbox payment status." }, 503);
  }
  if (!record) return jsonResponse({ error: "Sandbox payment request not found." }, 404);
  if (["succeeded", "failed"].includes(record.status)) {
    return jsonResponse({ status: record.status, message: record.message || "" });
  }
  if (!record.checkoutRequestId) {
    return jsonResponse({ status: record.status, message: record.message || "Waiting for the Daraja response." });
  }
  if (record.queryAttempts >= MAX_STATUS_CHECKS) {
    return jsonResponse({
      status: "pending",
      message: "Still waiting for Daraja. Check again later; do not start a duplicate checkout."
    });
  }

  let config;
  let token;
  try {
    config = getDarajaConfig();
    token = await getAccessToken(config);
  } catch (error) {
    return jsonResponse({ error: error.message }, 503);
  }

  const timestamp = nairobiTimestamp();
  let result;
  try {
    const response = await postDarajaJson("/mpesa/stkpushquery/v1/query", token, {
      BusinessShortCode: config.shortcode,
      Password: stkPassword(config.shortcode, config.passkey, timestamp),
      Timestamp: timestamp,
      CheckoutRequestID: record.checkoutRequestId
    });
    result = response.result;
    if (!response.ok || !result || typeof result !== "object") {
      return jsonResponse({ error: "Daraja could not check this sandbox payment yet." }, 502);
    }
  } catch (error) {
    return jsonResponse({ error: "Could not reach the Daraja sandbox to check payment status." }, 502);
  }

  record.queryAttempts += 1;
  if (result.ResultCode !== undefined && result.ResultCode !== null) {
    record.status = Number(result.ResultCode) === 0 ? "succeeded" : "failed";
    record.message = String(result.ResultDesc || (record.status === "succeeded" ? "Sandbox payment confirmed." : "Sandbox payment was not completed.")).slice(0, 200);
  } else {
    record.status = "pending";
  }

  try {
    await payments.setJSON(recordKey, record);
  } catch (error) {
    return jsonResponse({ error: "Daraja responded, but the status could not be saved. Check again shortly." }, 503);
  }

  return jsonResponse({
    status: record.status,
    message: record.message || "Waiting for the Daraja sandbox result."
  });
}
