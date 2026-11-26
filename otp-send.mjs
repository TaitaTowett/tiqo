import {
  createOtpRecord,
  getOtpConfig,
  getOtpRecord,
  otpLimits,
  otpPhoneKey,
  otpResponse,
  readOtpPhone,
  setOtpRecord
} from "../lib/otp.mjs";

const AFRICAS_TALKING_SMS_URL = "https://api.sandbox.africastalking.com/version1/messaging";

export default async function handler(request) {
  if (request.method !== "POST") {
    return otpResponse({ error: "Use POST to request a verification code." }, 405);
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
  if (!phone) return otpResponse({ error: "Enter a valid Kenyan mobile number." }, 400);

  let config;
  try {
    config = getOtpConfig(true);
  } catch (error) {
    return otpResponse({ error: error.message }, 503);
  }

  const phoneKey = otpPhoneKey(phone, config.hashSecret);
  const now = Date.now();
  const { HOURLY_SEND_LIMIT } = otpLimits();
  let previous;
  try {
    previous = await getOtpRecord(phoneKey);
  } catch (error) {
    return otpResponse({ error: "Could not safely check the verification request limit." }, 503);
  }

  if (previous?.resendAfter > now) {
    const seconds = Math.ceil((previous.resendAfter - now) / 1000);
    return otpResponse({ error: `Wait ${seconds} seconds before requesting another code.` }, 429);
  }
  if (previous?.windowStart && now - previous.windowStart < 60 * 60 * 1000 &&
      previous.sendsInWindow >= HOURLY_SEND_LIMIT) {
    return otpResponse({ error: "Too many codes requested for this number. Try again in about an hour." }, 429);
  }

  const { code, record } = createOtpRecord(phone, config.hashSecret, previous, now);
  try {
    await setOtpRecord(phoneKey, record);
  } catch (error) {
    return otpResponse({ error: "Could not safely save the verification code. Try again shortly." }, 503);
  }

  const body = new URLSearchParams({
    username: config.username,
    to: `+${phone}`,
    bulkSMSMode: "1",
    message: `Your TIQO verification code is ${code}. It expires in 5 minutes. Do not share it.`
  });
  let result;
  try {
    const response = await fetch(AFRICAS_TALKING_SMS_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        apiKey: config.apiKey
      },
      body,
      signal: AbortSignal.timeout(15000)
    });
    result = await response.json();
    const recipients = result?.SMSMessageData?.Recipients;
    const deliveredToGateway = Array.isArray(recipients) && recipients.some((recipient) =>
      Number(recipient.statusCode) === 101 || recipient.status === "Success"
    );
    if (!response.ok || !deliveredToGateway) {
      record.status = "failed";
      record.codeHash = "";
      await setOtpRecord(phoneKey, record);
      return otpResponse({ error: "Africa's Talking could not send the SMS. Check the sandbox number and account configuration." }, 502);
    }
  } catch (error) {
    record.status = "failed";
    record.codeHash = "";
    try {
      await setOtpRecord(phoneKey, record);
    } catch (storeError) {
      return otpResponse({ error: "SMS delivery failed and the verification state could not be updated. Wait before retrying." }, 503);
    }
    return otpResponse({ error: "Could not reach Africa's Talking to send the SMS. Try again shortly." }, 502);
  }

  record.status = "sent";
  try {
    await setOtpRecord(phoneKey, record);
  } catch (error) {
    return otpResponse({ error: "The SMS may have been sent, but verification could not be saved. Wait before requesting another code." }, 503);
  }

  return otpResponse({ sent: true, expiresInSeconds: 300, resendAfterSeconds: 60 });
}
