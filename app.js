const STORAGE_KEY = "tiqo.events.v1";
const discoverView = document.getElementById("discover-view");
const dashboardView = document.getElementById("dashboard-view");
const createView = document.getElementById("create-view");
const guestView = document.getElementById("guest-view");
const toast = document.getElementById("toast");
const signupForm = document.getElementById("signup-form");
const eventForm = document.getElementById("event-form");
let toastTimer;
let currentGuestEvent = null;
let ticketQuantity = 1;
let organizerProfile = null;
let pendingOrganizer = null;
let selectedCoverDataUrl = "";
let activePaymentRequestId = null;
let paymentCompleted = false;
let slideshowTimer;
let slideshowPaused = false;
const payButton = document.getElementById("pay-button");
const paymentStatus = document.getElementById("payment-status");
const originalPayButtonHtml = payButton.innerHTML;
const eventDateInput = document.getElementById("event-date");
const coverInput = document.getElementById("event-cover");
const coverPreviewWrap = document.getElementById("cover-preview-wrap");
const coverPreview = document.getElementById("cover-preview");

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 4200);
}

function formatKes(amount) {
  return `KES ${new Intl.NumberFormat("en-KE", { maximumFractionDigits: 0 }).format(amount)}`;
}

function dateTimeToIso(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00+03:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatNairobiDate(value) {
  if (typeof value !== "string") return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-KE", {
    timeZone: "Africa/Nairobi",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function setEventDateMinimum() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  eventDateInput.min = `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

function optimizeCoverPhoto(file) {
  return new Promise((resolve, reject) => {
    if (!file || !["image/jpeg", "image/png"].includes(file.type)) {
      reject(new Error("Choose a JPG or PNG image."));
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      reject(new Error("That image is larger than 8 MB. Choose a smaller JPG or PNG."));
      return;
    }

    const imageUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(imageUrl);
      if (!image.naturalWidth || !image.naturalHeight) {
        reject(new Error("We couldn't read that image. Choose a different JPG or PNG."));
        return;
      }

      const scale = Math.min(1, 1400 / image.naturalWidth, 1000 / image.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.naturalWidth * scale);
      canvas.height = Math.round(image.naturalHeight * scale);
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("This browser can't optimize the selected image."));
        return;
      }
      context.fillStyle = "#241710";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      let optimized = "";
      for (let attempt = 0; attempt < 4; attempt += 1) {
        optimized = canvas.toDataURL("image/jpeg", 0.82 - attempt * 0.1);
        if (optimized.length <= 700000) break;
        const reducedWidth = Math.max(1, Math.round(canvas.width * 0.75));
        const reducedHeight = Math.max(1, Math.round(canvas.height * 0.75));
        const reducedCanvas = document.createElement("canvas");
        reducedCanvas.width = reducedWidth;
        reducedCanvas.height = reducedHeight;
        const reducedContext = reducedCanvas.getContext("2d");
        if (!reducedContext) break;
        reducedContext.drawImage(canvas, 0, 0, reducedWidth, reducedHeight);
        canvas.width = reducedWidth;
        canvas.height = reducedHeight;
        const resizedContext = canvas.getContext("2d");
        if (!resizedContext) break;
        resizedContext.drawImage(reducedCanvas, 0, 0);
      }
      if (optimized.length > 700000) {
        reject(new Error("We couldn't reduce the image enough. Try a smaller cover photo."));
        return;
      }
      resolve(optimized);
    };
    image.onerror = () => {
      URL.revokeObjectURL(imageUrl);
      reject(new Error("We couldn't read that image. Choose a different JPG or PNG."));
    };
    image.src = imageUrl;
  });
}

function normalizeKenyanPhone(phone) {
  const compact = phone.replace(/[\s()-]/g, "");
  if (/^0[17]\d{8}$/.test(compact)) return `254${compact.slice(1)}`;
  if (/^\+?254[17]\d{8}$/.test(compact)) return compact.replace(/^\+/, "");
  return null;
}

function setPaymentStatus(message, state = "pending") {
  paymentStatus.textContent = message;
  paymentStatus.dataset.state = state;
}

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function readApiResponse(response) {
  try {
    const result = await response.json();
    if (!result || typeof result !== "object") throw new Error("Invalid payment response.");
    return result;
  } catch (error) {
    throw new Error("The service response was not valid JSON. Confirm the Netlify Functions deployment.");
  }
}

async function requestOrganizerCode() {
  const fullName = document.getElementById("organizer-name").value.trim().replace(/\s+/g, " ");
  const phone = normalizeKenyanPhone(document.getElementById("organizer-phone").value.trim());
  if (fullName.split(" ").filter(Boolean).length < 2) {
    showToast("Please enter your full name, including at least your first and last name.");
    return;
  }
  if (!phone) {
    showToast("Enter a valid Kenyan mobile number, such as 0712345678 or +254712345678.");
    return;
  }
  if (window.location.protocol !== "https:") {
    showToast("Phone verification needs the public HTTPS TIQO website.");
    return;
  }

  const button = document.getElementById("send-code-button");
  const resendButton = document.getElementById("resend-code-button");
  button.disabled = true;
  resendButton.disabled = true;
  button.textContent = "Sending SMS code…";
  try {
    const response = await fetch("/.netlify/functions/otp-send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: `+${phone}` })
    });
    const result = await readApiResponse(response);
    if (!response.ok) throw new Error(result.error || "We couldn't send a verification code.");
    pendingOrganizer = { fullName, phone };
    document.getElementById("organizer-phone").readOnly = true;
    document.getElementById("otp-entry").classList.remove("hidden");
    document.getElementById("organizer-code").focus();
    showToast("Verification code sent by SMS. Check your phone.");
  } catch (error) {
    showToast(error.message || "We couldn't send a verification code.");
  } finally {
    button.disabled = false;
    resendButton.disabled = false;
    button.innerHTML = 'Send verification code <span aria-hidden="true">→</span>';
  }
}

async function verifyOrganizerCode() {
  if (!pendingOrganizer) {
    showToast("Request a new verification code first.");
    return;
  }
  const codeInput = document.getElementById("organizer-code");
  const code = codeInput.value.trim();
  if (!/^\d{6}$/.test(code)) {
    showToast("Enter the 6-digit code sent to your phone.");
    codeInput.focus();
    return;
  }

  const button = document.getElementById("verify-code-button");
  button.disabled = true;
  button.textContent = "Verifying…";
  try {
    const response = await fetch("/.netlify/functions/otp-verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: `+${pendingOrganizer.phone}`, code })
    });
    const result = await readApiResponse(response);
    if (!response.ok) throw new Error(result.error || "We couldn't verify that code.");
    saveProfile({ fullName: pendingOrganizer.fullName, phone: `+${pendingOrganizer.phone}` });
    signupForm.classList.add("hidden");
    eventForm.classList.remove("hidden");
    document.getElementById("organizer-greeting").textContent = `Creating as ${pendingOrganizer.fullName}`;
    showToast("Phone number verified. Add your event details.");
    pendingOrganizer = null;
  } catch (error) {
    showToast(error.message || "We couldn't verify that code.");
  } finally {
    button.disabled = false;
    button.innerHTML = 'Verify &amp; continue <span aria-hidden="true">→</span>';
  }
}

async function checkSandboxPayment(requestId) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (attempt > 0) await wait(4000);
    setPaymentStatus("Waiting for the Daraja sandbox payment result…");

    const url = new URL("/.netlify/functions/stk-status", window.location.origin);
    url.searchParams.set("requestId", requestId);
    const response = await fetch(url);
    if (response.status === 404) activePaymentRequestId = null;
    const result = await readApiResponse(response);
    if (!response.ok) {
      if (response.status === 404) activePaymentRequestId = null;
      throw new Error(result.error || "Could not check the sandbox payment status.");
    }

    if (result.status === "succeeded") {
      activePaymentRequestId = null;
      paymentCompleted = true;
      setPaymentStatus("Sandbox payment confirmed. No real money was charged; ticket issuing and organizer totals are not connected yet.", "success");
      return;
    }
    if (result.status === "failed") {
      activePaymentRequestId = null;
      setPaymentStatus(result.message || "The sandbox payment was not completed. You can try again.", "error");
      return;
    }
    if (result.status === "unknown") {
      setPaymentStatus(result.message || "The sandbox result is uncertain. Do not start another payment yet.", "error");
      return;
    }
  }

  setPaymentStatus("The request is still pending. You can check again without starting another payment.");
}

async function submitSandboxPayment() {
  if (paymentCompleted) return;

  if (activePaymentRequestId) {
    payButton.disabled = true;
    payButton.textContent = "Checking status…";
    try {
      await checkSandboxPayment(activePaymentRequestId);
    } catch (error) {
      setPaymentStatus(error.message, "error");
    } finally {
      payButton.disabled = paymentCompleted;
      payButton.textContent = paymentCompleted ? "Sandbox payment confirmed" : activePaymentRequestId ? "Check payment status" : "Pay with M-Pesa";
    }
    return;
  }

  const phone = normalizeKenyanPhone(document.getElementById("buyer-phone").value.trim());
  if (!phone) {
    setPaymentStatus("Enter a valid Kenyan M-Pesa number, such as 0712345678.", "error");
    document.getElementById("buyer-phone").focus();
    return;
  }
  if (window.location.protocol !== "https:") {
    setPaymentStatus("Sandbox checkout requires the public HTTPS TIQO site.", "error");
    return;
  }

  const amount = currentGuestEvent.price * ticketQuantity;
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 10000000) {
    setPaymentStatus("This sandbox checkout amount is outside the allowed range.", "error");
    return;
  }

  payButton.disabled = true;
  payButton.textContent = "Sending sandbox request…";
  setPaymentStatus("Contacting the Daraja sandbox. No real money is charged.");
  const requestId = window.crypto.randomUUID();
  activePaymentRequestId = requestId;

  try {
    const response = await fetch("/.netlify/functions/stk-push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId,
        phone,
        amount,
        eventName: currentGuestEvent.name,
        quantity: ticketQuantity
      })
    });
    const result = await readApiResponse(response);
    if (!response.ok) throw new Error(result.error || "Could not start sandbox checkout.");

    setPaymentStatus("Sandbox request accepted. Complete the test payment, then wait for Daraja confirmation.");
    await checkSandboxPayment(requestId);
  } catch (error) {
    setPaymentStatus(error.message || "Could not reach the Daraja sandbox.", "error");
  } finally {
    payButton.disabled = paymentCompleted;
    payButton.textContent = paymentCompleted ? "Sandbox payment confirmed" : activePaymentRequestId ? "Check payment status" : "Pay with M-Pesa";
  }
}

function readEvents() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(stored)) throw new Error("Saved event data is not a list.");
    return stored.filter((event) =>
      event &&
      typeof event.id === "string" &&
      typeof event.name === "string" &&
      Number.isSafeInteger(event.price) &&
      event.price > 0
    );
  } catch (error) {
    showToast("We couldn't read saved events in this browser. You can still create an event; try clearing this site's saved data if the issue continues.");
    return [];
  }
}

function saveEvents(events) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
    return true;
  } catch (error) {
    showToast("This browser couldn't save your event. Check available storage and try again.");
    return false;
  }
}

function readProfile() {
  return organizerProfile;
}

function saveProfile(profile) {
  organizerProfile = profile;
  return true;
}

function buildGuestUrl(event) {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("name", event.name);
  url.searchParams.set("price", String(event.price));
  if (event.id) url.searchParams.set("id", event.id);
  if (event.dateTime) url.searchParams.set("dateTime", event.dateTime);
  url.hash = "";
  return url.toString();
}

function showView(viewName) {
  discoverView.classList.toggle("hidden", viewName !== "discover");
  dashboardView.classList.toggle("hidden", viewName !== "dashboard");
  createView.classList.toggle("hidden", viewName !== "create");
  guestView.classList.toggle("hidden", viewName !== "guest");
  document.getElementById("discover-nav").classList.toggle("active", viewName === "discover");
  document.getElementById("dashboard-nav").classList.toggle("active", viewName === "dashboard");
  document.getElementById("create-nav").classList.toggle("active", viewName === "create");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderDiscoverEvents(searchTerm = "") {
  const events = readEvents();
  const query = searchTerm.trim().toLocaleLowerCase();
  const matches = events.filter((event) => event.name.toLocaleLowerCase().includes(query));
  const list = document.getElementById("discover-events");
  const emptyState = document.getElementById("discover-empty");
  window.clearInterval(slideshowTimer);
  list.replaceChildren();
  emptyState.classList.toggle("hidden", matches.length > 0);

  if (query && matches.length === 0) {
    document.getElementById("discover-empty-title").textContent = "No matches this time.";
    document.getElementById("discover-empty-copy").textContent = "Try another event name, or come back when a new moment is listed.";
    document.getElementById("discover-create-button").classList.add("hidden");
    return;
  }

  document.getElementById("discover-empty-title").textContent = "The next big thing could be yours.";
  document.getElementById("discover-empty-copy").textContent = "No events to show just yet. Start one and invite your people.";
  document.getElementById("discover-create-button").classList.remove("hidden");

  for (const event of matches) {
    const card = document.createElement("article");
    card.className = "discover-card glass-panel";
    const art = document.createElement("div");
    art.className = "discover-card-art";
    if (event.coverImage) {
      const image = document.createElement("img");
      image.src = event.coverImage;
      image.alt = "";
      image.loading = "lazy";
      art.append(image);
    } else {
      art.setAttribute("aria-hidden", "true");
      art.textContent = "✳";
    }
    const body = document.createElement("div");
    body.className = "discover-card-body";
    const label = document.createElement("span");
    label.className = "discover-card-label";
    label.textContent = "EVENT · KENYA";
    const name = document.createElement("h3");
    name.textContent = event.name;
    const price = document.createElement("p");
    price.textContent = `${formatKes(event.price)} per ticket`;
    const date = document.createElement("p");
    date.className = "discover-card-date";
    date.textContent = formatNairobiDate(event.dateTime) || "Date to be announced";
    const action = document.createElement("button");
    action.className = "button button-dark";
    action.type = "button";
    action.textContent = "View event";
    action.addEventListener("click", () => {
      window.history.pushState({}, "", buildGuestUrl(event));
      loadGuestView(new URLSearchParams(window.location.search));
    });
    body.append(label, name, date, price, action);
    card.append(art, body);
    list.append(card);
  }

  startSlideshow();
}

function scrollEvents(direction) {
  const list = document.getElementById("discover-events");
  const cards = list.querySelectorAll(".discover-card");
  if (cards.length < 2) return;
  const gap = Number.parseFloat(window.getComputedStyle(list).columnGap) || 0;
  const step = cards[0].getBoundingClientRect().width + gap;
  const visibleCount = Math.max(1, Math.floor((list.clientWidth + gap) / step));
  const maxStartIndex = Math.max(0, cards.length - visibleCount);
  const currentIndex = Math.min(maxStartIndex, Math.max(0, Math.round(list.scrollLeft / step)));
  const targetIndex = (currentIndex + direction + maxStartIndex + 1) % (maxStartIndex + 1);
  const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  list.scrollTo({ left: targetIndex * step, behavior });
}

function startSlideshow() {
  window.clearInterval(slideshowTimer);
  const cards = document.querySelectorAll("#discover-events .discover-card");
  if (slideshowPaused || cards.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  slideshowTimer = window.setInterval(() => scrollEvents(1), 5500);
}

function renderEvents() {
  const events = readEvents();
  const list = document.getElementById("events-list");
  const emptyState = document.getElementById("empty-state");
  list.replaceChildren();
  emptyState.classList.toggle("hidden", events.length > 0);
  document.getElementById("active-events").textContent = String(events.length);

  for (const event of events) {
    const card = document.createElement("article");
    card.className = "event-card";

    const icon = document.createElement("div");
    icon.className = "event-icon";
    if (event.coverImage) {
      const image = document.createElement("img");
      image.src = event.coverImage;
      image.alt = "";
      image.loading = "lazy";
      icon.append(image);
    } else {
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = "✳";
    }

    const meta = document.createElement("div");
    meta.className = "event-meta";
    const name = document.createElement("h3");
    name.textContent = event.name;
    const price = document.createElement("p");
    const dateText = formatNairobiDate(event.dateTime);
    price.textContent = dateText ? `${formatKes(event.price)} per ticket · ${dateText}` : `${formatKes(event.price)} per ticket`;
    meta.append(name, price);

    const count = document.createElement("div");
    count.className = "event-stat";
    const countLabel = document.createElement("span");
    countLabel.textContent = "TICKETS SOLD";
    const countValue = document.createElement("strong");
    countValue.textContent = "0";
    count.append(countLabel, countValue);

    const collection = document.createElement("div");
    collection.className = "event-stat";
    const collectionLabel = document.createElement("span");
    collectionLabel.textContent = "COLLECTED";
    const collectionValue = document.createElement("strong");
    collectionValue.textContent = formatKes(0);
    collection.append(collectionLabel, collectionValue);

    const actions = document.createElement("div");
    actions.className = "event-actions";
    const copyButton = document.createElement("button");
    copyButton.className = "small-button";
    copyButton.type = "button";
    copyButton.textContent = "Copy link";
    copyButton.addEventListener("click", () => copyEventLink(event));
    const previewButton = document.createElement("button");
    previewButton.className = "small-button";
    previewButton.type = "button";
    previewButton.textContent = "Preview";
    previewButton.addEventListener("click", () => {
      window.history.pushState({}, "", buildGuestUrl(event));
      loadGuestView(new URLSearchParams(window.location.search));
    });
    actions.append(copyButton, previewButton);
    card.append(icon, meta, count, collection, actions);
    list.append(card);
  }
}

async function copyEventLink(event) {
  const link = buildGuestUrl(event);
  if (new URL(link).protocol === "file:") {
    showToast("This is a local file link and won't open on your phone. Host TIQO on an HTTPS website first.");
    return;
  }
  try {
    await navigator.clipboard.writeText(link);
    showToast("Event link copied. Sandbox payments only; no real money is charged.");
  } catch (error) {
    showToast(`Copy wasn't available. You can copy this link from the address bar: ${link}`);
  }
}

function loadGuestView(params) {
  const name = params.get("name");
  const price = Number(params.get("price"));
  if (!name || !Number.isSafeInteger(price) || price < 1 || price > 10000000) {
    window.history.replaceState({}, "", window.location.pathname);
    showView("dashboard");
    renderEvents();
    return false;
  }
  const eventId = params.get("id");
  const localEvent = eventId ? readEvents().find((event) => event.id === eventId) : null;
  const dateTime = params.get("dateTime") || localEvent?.dateTime || "";
  const coverImage = localEvent?.coverImage || "";
  currentGuestEvent = { id: eventId || "", name, price, dateTime, coverImage };
  ticketQuantity = 1;
  document.getElementById("guest-event-name").textContent = name;
  document.getElementById("guest-unit-price").textContent = `${formatKes(price)} per ticket`;
  const cover = document.getElementById("guest-cover");
  cover.classList.toggle("hidden", !coverImage);
  if (coverImage) {
    cover.src = coverImage;
    cover.alt = `${name} event cover`;
  } else {
    cover.removeAttribute("src");
    cover.alt = "";
  }
  const date = formatNairobiDate(dateTime);
  document.getElementById("guest-event-date").classList.toggle("hidden", !date);
  document.getElementById("guest-date-text").textContent = date ? `${date} · East Africa Time` : "";
  updateGuestTotal();
  showView("guest");
  return true;
}

function updateGuestTotal() {
  document.getElementById("quantity-value").textContent = String(ticketQuantity);
  document.getElementById("guest-total").textContent = formatKes(currentGuestEvent.price * ticketQuantity);
}

document.getElementById("dashboard-nav").addEventListener("click", () => {
  window.history.pushState({}, "", window.location.pathname);
  showView("dashboard");
  renderEvents();
});
document.getElementById("discover-nav").addEventListener("click", () => {
  window.history.pushState({}, "", window.location.pathname);
  showView("discover");
  renderDiscoverEvents(document.getElementById("event-search").value);
});
function openCreateView() {
  const profile = readProfile();
  signupForm.classList.toggle("hidden", Boolean(profile));
  eventForm.classList.toggle("hidden", !profile);
  if (profile) {
    document.getElementById("organizer-greeting").textContent = `Creating as ${profile.fullName}`;
  }
  showView("create");
}
document.getElementById("create-nav").addEventListener("click", openCreateView);
document.getElementById("new-event-button").addEventListener("click", openCreateView);
document.getElementById("empty-create-button").addEventListener("click", openCreateView);
document.getElementById("hero-create-button").addEventListener("click", openCreateView);
document.getElementById("discover-create-button").addEventListener("click", openCreateView);
document.getElementById("event-search").addEventListener("input", (event) => {
  renderDiscoverEvents(event.currentTarget.value);
});
document.getElementById("events-previous").addEventListener("click", () => scrollEvents(-1));
document.getElementById("events-next").addEventListener("click", () => scrollEvents(1));
document.getElementById("events-pause").addEventListener("click", (event) => {
  slideshowPaused = !slideshowPaused;
  event.currentTarget.textContent = slideshowPaused ? "▶" : "Ⅱ";
  event.currentTarget.setAttribute("aria-label", slideshowPaused ? "Play event slideshow" : "Pause event slideshow");
  startSlideshow();
});
const discoverEventsList = document.getElementById("discover-events");
discoverEventsList.addEventListener("mouseenter", () => {
  window.clearInterval(slideshowTimer);
});
discoverEventsList.addEventListener("mouseleave", startSlideshow);
discoverEventsList.addEventListener("focusin", () => {
  window.clearInterval(slideshowTimer);
});
discoverEventsList.addEventListener("focusout", startSlideshow);

coverInput.addEventListener("change", async () => {
  const file = coverInput.files && coverInput.files[0];
  selectedCoverDataUrl = "";
  coverPreviewWrap.classList.add("hidden");
  if (!file) return;
  try {
    const optimizedImage = await optimizeCoverPhoto(file);
    if (!coverInput.files || coverInput.files[0] !== file) return;
    selectedCoverDataUrl = optimizedImage;
    coverPreview.src = optimizedImage;
    coverPreviewWrap.classList.remove("hidden");
  } catch (error) {
    coverInput.value = "";
    showToast(error.message || "We couldn't use that cover photo.");
  }
});
document.getElementById("remove-cover").addEventListener("click", () => {
  coverInput.value = "";
  selectedCoverDataUrl = "";
  coverPreview.removeAttribute("src");
  coverPreviewWrap.classList.add("hidden");
});
document.addEventListener("keydown", (event) => {
  if (event.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
    event.preventDefault();
    document.getElementById("event-search").focus();
  }
});
document.getElementById("back-to-dashboard").addEventListener("click", () => {
  window.history.pushState({}, "", window.location.pathname);
  showView("dashboard");
  renderEvents();
});

signupForm.addEventListener("submit", (event) => {
  event.preventDefault();
  requestOrganizerCode();
});

document.getElementById("resend-code-button").addEventListener("click", requestOrganizerCode);
document.getElementById("verify-code-button").addEventListener("click", verifyOrganizerCode);
document.getElementById("change-number-button").addEventListener("click", () => {
  pendingOrganizer = null;
  document.getElementById("organizer-phone").readOnly = false;
  document.getElementById("organizer-code").value = "";
  document.getElementById("otp-entry").classList.add("hidden");
  document.getElementById("organizer-phone").focus();
});

eventForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const name = String(formData.get("name") || "").trim();
  const price = Number(formData.get("price"));
  const dateTime = dateTimeToIso(String(formData.get("dateTime") || ""));
  if (!name || !dateTime || new Date(dateTime).getTime() <= Date.now() ||
      !Number.isSafeInteger(price) || price < 1 || price > 10000000) {
    showToast("Enter an event name, a future date and time, and a whole-number ticket price from KES 1 to KES 10,000,000.");
    return;
  }
  if (!selectedCoverDataUrl) {
    showToast("Choose a JPG or PNG cover photo before creating the event.");
    return;
  }

  const submitButton = eventForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = "Creating event…";
  const events = readEvents();
  const newEvent = { id: window.crypto.randomUUID(), name, price, dateTime, coverImage: selectedCoverDataUrl };
  try {
    if (!saveEvents([newEvent, ...events])) return;
    eventForm.reset();
    selectedCoverDataUrl = "";
    coverPreview.removeAttribute("src");
    coverPreviewWrap.classList.add("hidden");
    setEventDateMinimum();
    window.history.pushState({}, "", window.location.pathname);
    renderEvents();
    renderDiscoverEvents(document.getElementById("event-search").value);
    showView("dashboard");
    showToast("Event created in this browser. Shared event storage and live payment setup are still needed.");
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = 'Create event link <span aria-hidden="true">→</span>';
  }
});

document.getElementById("quantity-minus").addEventListener("click", () => {
  if (paymentCompleted) return;
  if (activePaymentRequestId) {
    showToast("Check the current sandbox payment before changing ticket quantity.");
    return;
  }
  if (ticketQuantity > 1) {
    ticketQuantity -= 1;
    setPaymentStatus("");
    payButton.innerHTML = originalPayButtonHtml;
    updateGuestTotal();
  }
});
document.getElementById("quantity-plus").addEventListener("click", () => {
  if (paymentCompleted) return;
  if (activePaymentRequestId) {
    showToast("Check the current sandbox payment before changing ticket quantity.");
    return;
  }
  if (ticketQuantity < 20) {
    ticketQuantity += 1;
    setPaymentStatus("");
    payButton.innerHTML = originalPayButtonHtml;
    updateGuestTotal();
  } else {
    showToast("You can select up to 20 tickets per checkout.");
  }
});
payButton.addEventListener("click", submitSandboxPayment);

window.addEventListener("popstate", () => {
  const params = new URLSearchParams(window.location.search);
  if (params.has("name") || params.has("price")) loadGuestView(params);
  else {
    showView("discover");
    renderDiscoverEvents(document.getElementById("event-search").value);
    renderEvents();
  }
});

document.getElementById("total-collected").textContent = formatKes(0);
document.getElementById("transaction-count").textContent = "0";
setEventDateMinimum();
const initialParams = new URLSearchParams(window.location.search);
if (initialParams.has("name") || initialParams.has("price")) {
  if (!loadGuestView(initialParams)) renderEvents();
} else {
  showView("discover");
  renderDiscoverEvents();
  renderEvents();
}
