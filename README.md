# TIQO

A lightweight browser MVP for discovering local preview events, collecting organizer details, creating event ticket links in Kenya, and previewing guest checkout totals in KES. The interface discloses the 2% platform fee / 98% beneficiary split.

## Run locally

Open `index.html` in a modern browser. Events are stored only in that browser's local storage. Organizer name and phone are kept in memory only for the current page session. Search can only find events created in that same browser.

Opening the file directly gives it a `file:` URL, which is not a website link and cannot be opened on a phone. To share the app, deploy the files to a public web host and use its HTTPS URL. Even after hosting, event discovery across phones and accounts requires a shared backend and database; this static preview does not provide either.

## Publish with GitHub Pages

The `.github/workflows/deploy.yml` workflow publishes the static site whenever a commit is pushed to the repository's `main` or `master` branch.

1. Push these project files to a GitHub repository.
2. In the repository, open **Settings → Pages** and set the build/deployment source to **GitHub Actions**.
3. Push to `main` (or `master`) or manually run **Deploy TIQO to GitHub Pages** from the **Actions** tab.
4. Open the public HTTPS URL shown by the workflow and share that URL, not a local `file:` URL.

The current workspace is not connected to a GitHub repository, so the workflow cannot publish until the files are pushed to one.

## Important: preview only

This is a front-end prototype, not a production service. Organizer sign-up is a browser-only form, not secure account creation or authentication. It does not validate ticket prices on a server, receive Daraja callbacks, record transactions, or transfer funds. Dashboard collection figures are placeholders and must not be treated as live balances.

Before accepting money, implement a backend that:

- stores events and prices as authoritative server-side records and issues unguessable event links;
- keeps Daraja credentials in server-side environment/secret storage only, never browser code or source control;
- initiates and verifies M-Pesa payments server-side, validates signed/provider callbacks, and prevents duplicate processing;
- records an auditable transaction ledger, calculates the 2% fee with an explicit rounding policy, and transfers the remaining 98% only after confirmed settlement;
- adds organizer authentication, authorization, input validation, rate limits, monitoring, and reconciliation.

The Daraja values shared in the original request should be considered exposed. Revoke/rotate them in Safaricom Daraja before configuring any backend. Do not copy them into this project.
