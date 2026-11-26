# TIQO

A lightweight browser MVP for discovering local preview events, collecting organizer details, creating event ticket links in Kenya, and previewing guest checkout totals in KES. The interface discloses the 2% platform fee / 98% beneficiary split.

## Run locally

Open `index.html` in a modern browser. Events are stored only in that browser's local storage. Organizer name and phone are kept in memory only for the current page session. Search can only find events created in that same browser. SMS verification and payment functions require a deployed Netlify site.

Opening the file directly gives it a `file:` URL, which is not a website link and cannot be opened on a phone. To share the app, deploy the files to a public web host and use its HTTPS URL. Even after hosting, event discovery across phones and accounts requires a shared backend and database; this static preview does not provide either.

## Publish with GitHub Pages

The `.github/workflows/deploy.yml` workflow publishes the static site whenever a commit is pushed to the repository's `main` or `master` branch.

1. Push these project files to a GitHub repository.
2. In the repository, open **Settings → Pages** and set the build/deployment source to **GitHub Actions**.
3. Push to `main` (or `master`) or manually run **Deploy TIQO to GitHub Pages** from the **Actions** tab.
4. Open the public HTTPS URL shown by the workflow and share that URL, not a local `file:` URL.

The current workspace is not connected to a GitHub repository, so the workflow cannot publish until the files are pushed to one.

## Publish with Netlify

1. Sign in to Netlify and choose **Add new site → Import an existing project**.
2. Connect GitHub and select `TaitaTowett/tiqo`.
3. Use the `main` branch. The `netlify.toml` file builds the static site into `public` and deploys functions from `netlify/functions`.
4. Deploy the site and open the HTTPS `*.netlify.app` URL Netlify assigns.

## Daraja sandbox checkout

The guest checkout can initiate a sandbox STK Push through a Netlify Function. It is sandbox-only and does not issue tickets, transfer funds, or update organizer totals. Event prices and listings are still browser-provided preview data, so do not use this as a production payment service.

After deploying the project to Netlify, set these under **Site configuration → Environment variables** (function scope) and redeploy:

- `DARAJA_ENV`: `sandbox`
- `DARAJA_CONSUMER_KEY`: the sandbox app consumer key
- `DARAJA_CONSUMER_SECRET`: the sandbox app consumer secret
- `DARAJA_PASSKEY`: the sandbox STK passkey
- `DARAJA_SHORTCODE`: the shortcode associated with that sandbox app
- `DARAJA_TEST_MSISDN`: the one Kenyan test number permitted to initiate checkout
- `DARAJA_TRANSACTION_TYPE`: `CustomerPayBillOnline` for a Paybill (optional; this is the default)

The callback URL is generated from Netlify's `URL` environment variable. The buyer must enter the configured test phone number. Daraja credentials must only be entered in Netlify environment settings, never in the browser or a committed file. The values previously shared in chat should be replaced with fresh sandbox credentials before testing.

## Organizer phone verification

Organizer signup requests a six-digit SMS code from Africa's Talking sandbox. Configure these as Netlify function environment variables, then redeploy:

- `AFRICASTALKING_ENV`: `sandbox`
- `AFRICASTALKING_USERNAME`: `sandbox`
- `AFRICASTALKING_API_KEY`: the API key from the Africa's Talking sandbox dashboard
- `OTP_HASH_SECRET`: a randomly generated secret with at least 32 characters, used only to hash codes and phone lookup keys

The code expires after 5 minutes. Resends have a 60-second cooldown and are limited to five per phone number per hour; verification locks after five incorrect attempts. Netlify Blobs must be available to the functions. Sandbox SMS is only for numbers enabled in the Africa's Talking sandbox; no WhatsApp OTP is configured.

Verification currently gates the browser UI only. Organizer profiles and events are not persisted to a shared account database, so this is not production authentication and must not be used to protect real organizer data or payouts.

## Event details and listing carousel

Event creation requires a future date/time in East Africa Time and a JPG or PNG cover photo no larger than 8 MB. Photos are resized and compressed in the browser. The discover list scrolls automatically, supports manual previous/next controls and pause, and respects reduced-motion settings. The TIQO logo is in `logo.svg`.

Events and their compressed cover photos remain in the creating browser's local storage. A share link carries the event name, price, and date, but the photo and searchable listing are not shared across devices until a shared database and image storage are added.

## Important: preview only

This is a prototype, not a production service. Organizer sign-up is browser-only, event prices are not authoritative server records, and dashboard collection figures remain placeholders. The sandbox payment status is stored for the checkout session; there is no production ledger, ticket issuance, beneficiary payout, or live organizer reporting.

Before accepting money, implement a backend that:

- stores events and prices as authoritative server-side records and issues unguessable event links;
- keeps Daraja credentials in server-side environment/secret storage only, never browser code or source control;
- initiates and verifies M-Pesa payments server-side, checks callbacks against Daraja, and prevents duplicate processing;
- records an auditable transaction ledger, calculates the 2% fee with an explicit rounding policy, and transfers the remaining 98% only after confirmed settlement;
- adds organizer authentication, authorization, input validation, rate limits, monitoring, and reconciliation.

The Daraja values shared in the original request should be considered exposed. Replace them in Safaricom Daraja before configuring the sandbox environment. Do not copy them into this project.
