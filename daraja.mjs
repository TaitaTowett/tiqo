const DARAJA_BASE_URL = "https://sandbox.safaricom.co.ke";
const PHONE_PATTERN = /^254[17]\d{8}$/;
let cachedAccessToken = "";
let tokenExpiresAt = 0;

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

export function normalizePhone(value) {
  if (typeof value !== "string") return null;
  const compact = value.replace(/[\s()-]/g, "");
  const normalized = compact.startsWith("+")
    ? compact.slice(1)
    : compact.startsWith("0")
      ? `254${compact.slice(1)}`
      : compact;
  return PHONE_PATTERN.test(normalized) ? normalized : null;
}

export function getDarajaConfig() {
  if (process.env.DARAJA_ENV !== "sandbox") {
    throw new Error("DARAJA_ENV must be set to sandbox.");
  }

  const consumerKey = process.env.DARAJA_CONSUMER_KEY;
  const consumerSecret = process.env.DARAJA_CONSUMER_SECRET;
  const passkey = process.env.DARAJA_PASSKEY;
  const shortcode = process.env.DARAJA_SHORTCODE;
  const allowedTestPhone = normalizePhone(process.env.DARAJA_TEST_MSISDN || "");
  const siteUrl = process.env.URL;
  const transactionType = process.env.DARAJA_TRANSACTION_TYPE || "CustomerPayBillOnline";

  if (!consumerKey || !consumerSecret || !passkey || !shortcode || !allowedTestPhone || !siteUrl) {
    throw new Error("Sandbox payment configuration is incomplete. Check the Netlify environment variables.");
  }
  if (!/^\d{5,12}$/.test(shortcode)) {
    throw new Error("DARAJA_SHORTCODE must contain 5 to 12 digits.");
  }
  if (!["CustomerPayBillOnline", "CustomerBuyGoodsOnline"].includes(transactionType)) {
    throw new Error("DARAJA_TRANSACTION_TYPE is not supported.");
  }

  const site = new URL(siteUrl);
  if (site.protocol !== "https:") {
    throw new Error("The Daraja callback requires the public HTTPS Netlify site URL.");
  }

  return {
    consumerKey,
    consumerSecret,
    passkey,
    shortcode,
    allowedTestPhone,
    transactionType,
    callbackUrl: new URL("/.netlify/functions/stk-callback", site).toString()
  };
}

export function nairobiTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}${values.month}${values.day}${values.hour}${values.minute}${values.second}`;
}

export function stkPassword(shortcode, passkey, timestamp) {
  return Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");
}

export async function getAccessToken(config) {
  if (cachedAccessToken && Date.now() < tokenExpiresAt) return cachedAccessToken;

  const credentials = Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString("base64");
  const response = await fetch(
    `${DARAJA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
    {
      headers: { Authorization: `Basic ${credentials}` },
      signal: AbortSignal.timeout(15000)
    }
  );
  const result = await response.json();
  if (!response.ok || typeof result.access_token !== "string") {
    throw new Error("Daraja sandbox authentication failed. Check the server-side sandbox credentials.");
  }

  const expiresIn = Number(result.expires_in) || 300;
  cachedAccessToken = result.access_token;
  tokenExpiresAt = Date.now() + Math.max(30, expiresIn - 30) * 1000;
  return cachedAccessToken;
}

export async function postDarajaJson(path, token, body) {
  const response = await fetch(`${DARAJA_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000)
  });
  const result = await response.json();
  return { ok: response.ok, result };
}
