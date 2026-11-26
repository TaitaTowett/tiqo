import { jsonResponse } from "../lib/daraja.mjs";

export default async function handler(request) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Use POST for Daraja callbacks." }, 405);
  }

  let payload;
  try {
    payload = await request.json();
  } catch (error) {
    return jsonResponse({ error: "Invalid callback JSON." }, 400);
  }

  const callback = payload?.Body?.stkCallback;
  if (
    !callback ||
    typeof callback.CheckoutRequestID !== "string" ||
    !/^[A-Za-z0-9_-]{5,160}$/.test(callback.CheckoutRequestID) ||
    callback.ResultCode === undefined ||
    callback.ResultCode === null ||
    !Number.isInteger(Number(callback.ResultCode))
  ) {
    return jsonResponse({ error: "Invalid Daraja callback payload." }, 400);
  }

  return jsonResponse({ ResultCode: 0, ResultDesc: "Accepted" });
}
