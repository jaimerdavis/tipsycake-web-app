# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-03-07

### Fixed

- **Order linking on My Account** — Guest orders (placed without being signed in) now appear on the My Account page when the customer signs in, as long as the order's `contactEmail` matches their sign-in email.
  - Requires Clerk JWT template for Convex with claims: `aud: "convex"` and `email: "{{user.primary_email_address}}"` (create in Clerk Dashboard → JWT Templates → Convex).
  - Requires `CLERK_JWT_ISSUER_DOMAIN` set in Convex Dashboard (Settings → Environment Variables) to your Clerk Frontend API URL (e.g. `https://xxx.clerk.accounts.dev`).
