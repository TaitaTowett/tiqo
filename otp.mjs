import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { getStore } from "@netlify/blobs";
import { normalizePhone } from "./daraja.mjs";

const otpStore = getStore("tiqo-organizer-otp");
const OTP_LIFETIME_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const HOURLY_SEND_LIMIT = 5;
const MAX_VERIFY_ATTEMPTS = 5;

export function otpResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

export function getOtpConfig(requireSms = false) {
  const hashSecret = process.env.OTP_HASH_SECRET;
  if (!hashSecret || hashSecret.length < 32) {
    throw new Error("OTP_HASH_SECRET must be set to a random secret of at least 32 characters.");
  }
  if (!requireSms) return { hashSecret };

  const environment = process.env.AFRICASTALKING_ENV;
  const username = process.env.AFRICASTALKING_USERNAME;
  const apiKey = process.env.AFRICASTALKING_API_KEY;
  if (environment !== "sandbox" || username !== "sandbox" || !apiKey) {
    throw new Error("Configure Africa's Talking sandbox credentials in Netlify environment variables.");
  }
  return { hashSecret, username, apiKey };
}

export function otpPhoneKey(phone, secret) {
  return createHmac("sha256", secret).update(`phone:${phone}`).digest("hex");
}

export function otpCodeHash(phone, code, secret) {
  return createHmac("sha256", secret).update(`${phone}:${code}`).digest();
}

export function readOtpPhone(value) {
  return normalizePhone(value);
}

export async function getOtpRecord(phoneKey) {
  return otpStore.get(`phone:${phoneKey}`, { type: "json" });
}

export async function setOtpRecord(phoneKey, record) {
  return otpStore.setJSON(`phone:${phoneKey}`, record);
}

export function createOtpRecord(phone, secret, previous, now = Date.now()) {
  const code = String(randomInt(100000, 1000000));
  const withinWindow = previous && now - previous.windowStart < 60 * 60 * 1000;
  return {
    code,
    record: {
      codeHash: otpCodeHash(phone, code, secret).toString("hex"),
      status: "sending",
      attempts: 0,
      expiresAt: now + OTP_LIFETIME_MS,
      resendAfter: now + RESEND_COOLDOWN_MS,
      windowStart: withinWindow ? previous.windowStart : now,
      sendsInWindow: withinWindow ? previous.sendsInWindow + 1 : 1
    }
  };
}

export function otpLimits() {
  return { OTP_LIFETIME_MS, RESEND_COOLDOWN_MS, HOURLY_SEND_LIMIT, MAX_VERIFY_ATTEMPTS };
}

export function matchesOtp(phone, code, storedHash, secret) {
  if (typeof storedHash !== "string" || !/^[a-f0-9]{64}$/i.test(storedHash)) return false;
  const expected = otpCodeHash(phone, code, secret);
  const actual = Buffer.from(storedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
