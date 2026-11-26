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

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 4200);
}

function formatKes(amount) {
  return `KES ${new Intl.NumberFormat("en-KE", { maximumFractionDigits: 0 }).format(amount)}`;
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
  url.search = new URLSearchParams({ name: event.name, price: String(event.price) }).toString();
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
    art.setAttribute("aria-hidden", "true");
    art.textContent = "✳";
    const body = document.createElement("div");
    body.className = "discover-card-body";
    const label = document.createElement("span");
    label.className = "discover-card-label";
    label.textContent = "EVENT · KENYA";
    const name = document.createElement("h3");
    name.textContent = event.name;
    const price = document.createElement("p");
    price.textContent = `${formatKes(event.price)} per ticket`;
    const action = document.createElement("button");
    action.className = "button button-dark";
    action.type = "button";
    action.textContent = "View event";
    action.addEventListener("click", () => {
      window.history.pushState({}, "", buildGuestUrl(event));
      loadGuestView(new URLSearchParams(window.location.search));
    });
    body.append(label, name, price, action);
    card.append(art, body);
    list.append(card);
  }
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
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "✳";

    const meta = document.createElement("div");
    meta.className = "event-meta";
    const name = document.createElement("h3");
    name.textContent = event.name;
    const price = document.createElement("p");
    price.textContent = `${formatKes(event.price)} per ticket`;
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
    showToast("Event link copied. Payments are not enabled in this preview.");
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
  currentGuestEvent = { name, price };
  ticketQuantity = 1;
  document.getElementById("guest-event-name").textContent = name;
  document.getElementById("guest-unit-price").textContent = `${formatKes(price)} per ticket`;
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
  const formData = new FormData(event.currentTarget);
  const fullName = String(formData.get("fullName") || "").trim().replace(/\s+/g, " ");
  const phone = String(formData.get("phone") || "").trim().replace(/[\s()-]/g, "");
  const nameParts = fullName.split(" ").filter(Boolean);
  if (nameParts.length < 2) {
    showToast("Please enter your full name, including at least your first and last name.");
    return;
  }
  if (!/^(?:\+?254|0)?[17]\d{8}$/.test(phone)) {
    showToast("Enter a valid Kenyan mobile number, such as 0712345678 or +254712345678.");
    return;
  }
  saveProfile({ fullName, phone });
  signupForm.classList.add("hidden");
  eventForm.classList.remove("hidden");
  document.getElementById("organizer-greeting").textContent = `Creating as ${fullName}`;
});

eventForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const name = String(formData.get("name") || "").trim();
  const price = Number(formData.get("price"));
  if (!name || !Number.isSafeInteger(price) || price < 1 || price > 10000000) {
    showToast("Enter an event name and a whole-number ticket price from KES 1 to KES 10,000,000.");
    return;
  }

  const events = readEvents();
  const newEvent = { id: window.crypto.randomUUID(), name, price };
  if (!saveEvents([newEvent, ...events])) return;

  eventForm.reset();
  window.history.pushState({}, "", window.location.pathname);
  renderEvents();
  renderDiscoverEvents(document.getElementById("event-search").value);
  showView("dashboard");
  showToast("Preview ready. Host TIQO on HTTPS to share across devices; payment setup is still required.");
});

document.getElementById("quantity-minus").addEventListener("click", () => {
  if (ticketQuantity > 1) {
    ticketQuantity -= 1;
    updateGuestTotal();
  }
});
document.getElementById("quantity-plus").addEventListener("click", () => {
  if (ticketQuantity < 20) {
    ticketQuantity += 1;
    updateGuestTotal();
  } else {
    showToast("You can select up to 20 tickets per checkout.");
  }
});
document.getElementById("pay-button").addEventListener("click", () => {
  showToast("M-Pesa checkout isn't connected yet. No payment has been made.");
});

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
const initialParams = new URLSearchParams(window.location.search);
if (initialParams.has("name") || initialParams.has("price")) {
  if (!loadGuestView(initialParams)) renderEvents();
} else {
  showView("discover");
  renderDiscoverEvents();
  renderEvents();
}
