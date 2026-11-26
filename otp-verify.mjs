import {
  getOtpConfig,
  getOtpRecord,
  matchesOtp,
  otpLimits,
  otpPhoneKey,
  otpResponse,
  readOtpPhone,
  setOtpRecord
} from "../lib/otp.mjs";

export default async function handler(request) {
  if (request.method !== "POST") {
    return otpResponse({ error: "Use POST to verify a code." }, 405);
  }

  let input;
  try {
    input = await request.json();
  } catch (error) {
    return otpResponse({ error: "Request body must be valid JSON." }, 400);
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return otpResponse({ error: "Request body must be a JSON object." }, 400);
  }

  const phone = readOtpPhone(input.phone);
  const code = typeof input.code === "string" ? input.code.trim() : "";
  if (!phone || !/^\d{6}$/.test(code)) {
    return otpResponse({ error: "Enter a valid Kenyan mobile number and 6-digit code." }, 400);
  }

  let config;
  try {
    config = getOtpConfig();
  } catch (error) {
    return otpResponse({ error: error.message }, 503);
  }

  const phoneKey = otpPhoneKey(phone, config.hashSecret);
  let record;
  try {
    record = await getOtpRecord(phoneKey);
  } catch (error) {
    return otpResponse({ error: "Could not safely read the verification request." }, 503);
  }
  if (!record || record.status !== "sent") {
    return otpResponse({ error: "Request a fresh verification code first." }, 400);
  }

  const now = Date.now();
  if (record.expiresAt <= now) {
    record.status = "expired";
    record.codeHash = "";
    try {
      await setOtpRecord(phoneKey, record);
    } catch (error) {
      return otpResponse({ error: "The expired verification code could not be cleared. Request another code shortly." }, 503);
    }
    return otpResponse({ error: "That code has expired. Request a new one." }, 400);
  }

  const { MAX_VERIFY_ATTEMPTS } = otpLimits();
  if (record.attempts >= MAX_VERIFY_ATTEMPTS) {
    return otpResponse({ error: "Too many incorrect attempts. Request a new verification code." }, 429);
  }

  if (!matchesOtp(phone, code, record.codeHash, config.hashSecret)) {
    record.attempts += 1;
    if (record.attempts >= MAX_VERIFY_ATTEMPTS) {
      record.status = "locked";
      record.codeHash = "";
    }
    try {
      await setOtpRecord(phoneKey, record);
    } catch (error) {
      return otpResponse({ error: "The verification attempt could not be safely recorded. Try again shortly." }, 503);
    }
    return otpResponse({
      error: record.status === "locked"
        ? "Too many incorrect attempts. Request a new verification code."
        : "That code is not correct. Check it and try again."
    }, record.status === "locked" ? 429 : 400);
  }

  record.status = "verified";
  record.codeHash = "";
  record.verifiedAt = new Date(now).toISOString();
  record.expiresAt = now + 15 * 60 * 1000;
  try {
    await setOtpRecord(phoneKey, record);
  } catch (error) {
    return otpResponse({ error: "The code matched, but verification could not be saved. Try again shortly." }, 503);
  }

  return otpResponse({ verified: true });
}
