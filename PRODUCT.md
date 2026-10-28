# Product

<!-- impeccable:product-schema 1 -->

## Platform

web (mobile-first PWA, also used on a laptop)

## Users

One person in India who pays by UPI many times a day (shops, cabs, food, rent) and lives with roommates and friends who split costs. Uses it on the phone in a hurry at the counter (scan, pay, note it) and on the laptop sitting down (where did the money go, who owes what, importing statements). Often shows the screen to roommates and friends: the payment QR, the "who owes you" list, a split.

## Product Purpose

A personal money log for UPI, cash and card payments that UPI apps don't give you: every payment saved with how it was paid, its reason, category, place, bill photo and split (equally or item by item), plus autopays, then turned into monthly spending charts and one shareable split link per room or trip. Success: every payment is recorded with almost no extra effort, and friends get one clear, itemised request at the start of the month.

## Positioning

MyUPI does not move money. On an Android phone it opens the user's UPI app (nothing pre-filled), they pay there, and coming back MyUPI asks how much and then the details. Splits are combined per person: a public split link shows what everyone shares equally, each person's own items, and anything unpaid carried into the next month, with a pay button and QR.

## Operating Context

- Pay flow: scan a UPI QR (or pick a saved person) in MyUPI, open PhonePe / super.money, pay there, come back, enter the amount, then the details. On a laptop or iPhone, payments are recorded directly.
- Cash and card payments recorded with the same details; history filterable by UPI, cash, card and autopay.
- Autopays and subscriptions: added once, logged on each due date, suggested from repeating payments.
- Splits: saved people and groups (Roommates), equal, custom or item-by-item shares; requests via WhatsApp, SMS, share, QR, or the room's split link.
- Monthly bank statement import (Excel/CSV) fills gaps, confirms payments, and marks friends paid when their transfer matches what they owe.
- Banks: SBI and Indian Bank. UPI apps: PhonePe, super.money.

## Capabilities and Constraints

- Next.js website; data in the browser (localStorage, bill photos in IndexedDB) and synced to Supabase when signed in (one email + password account).
- UPI apps block payments whose result is requested by another app, and pre-filled links proved unreliable, so the UPI app is only opened, never driven. No payment status comes back.
- A website can't read SMS, read other apps, or schedule notifications.
- Split links are public read-only snapshots; nothing else is exposed.

## Brand Commitments

Name: MyUPI. Not playful or childish: no cartoons, stickers or gamified badges.

## Evidence on Hand

No real user data in the repo; any sample payments shown in design work are synthetic.

## Product Principles

1. Recording must never be slower than paying: the fewest taps from scan to UPI app.
2. Every rupee has a reason: the reason, category and split are first-class, not optional extras.
3. Honest state: unconfirmed is shown as unconfirmed until the user or a statement confirms it.
4. Screens friends will see (requests, QR, who owes) must read clearly at a glance.

## Accessibility & Inclusion

Screen-reader labels, 44px+ touch targets, full keyboard use on a laptop (dropdowns, sheets close on Esc), text contrast of at least 4.5:1 on the dark theme, reduced-motion respected.
