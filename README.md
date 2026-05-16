# Bails Arena — Admin Booking Portal

A zero-cost, mobile-friendly football turf booking system for admins. Built with vanilla JS and Firebase (no build step required).

---

## Project Structure

```
bails-arena-firebase/
├── public/
│   ├── index.html               ← Main app (login + all pages)
│   ├── css/style.css            ← All styles
│   └── js/
│       ├── firebase-config.js   ← 🔑 Your Firebase credentials go here
│       └── app.js               ← All app logic
├── firebase.json                ← Firebase hosting config
├── firestore.rules              ← Database security rules (auth-gated)
├── firestore.indexes.json       ← Database indexes
└── README.md
```

---

## Getting It Live — Step by Step

### Step 1 — Create a Firebase Project (free)

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add project** → name it (e.g. `bails-arena`)
3. Disable Google Analytics if you prefer → **Create project**

---

### Step 2 — Enable Firestore Database

1. In your Firebase project → **Build → Firestore Database**
2. Click **Create database**
3. Choose **Start in production mode**
4. Pick your region — use `asia-south1` for India
5. Click **Enable**

---

### Step 3 — Enable Firebase Authentication

1. In your Firebase project → **Build → Authentication**
2. Click **Get started**
3. Under **Sign-in method**, enable **Email/Password**
4. Click **Save**

---

### Step 4 — Create Your Admin User

1. Still in **Authentication** → go to the **Users** tab
2. Click **Add user**
3. Enter your admin email and a strong password
4. Click **Add user** — this is the login you'll use to access the portal

> You can add more admin users the same way later.

---

### Step 5 — Get Your Firebase Config

1. In Firebase Console → ⚙️ **Project Settings** (gear icon, top-left)
2. Scroll to **Your apps** → click **Add app** → choose **Web** (`</>` icon)
3. Register the app with any nickname (e.g. `bails-arena-web`)
4. Copy the `firebaseConfig` object shown

---

### Step 6 — Paste Your Config

Open `public/js/firebase-config.js` and replace the placeholder values:

```js
const firebaseConfig = {
  apiKey:            "AIzaSy...",
  authDomain:        "bails-arena.firebaseapp.com",
  projectId:         "bails-arena",
  storageBucket:     "bails-arena.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123...:web:abc..."
};
```

---

### Step 7 — Install Firebase CLI

If you haven't already:

```bash
npm install -g firebase-tools
```

---

### Step 8 — Login and Link Your Project

```bash
firebase login
firebase use --add
```

When prompted, select the Firebase project you created in Step 1 and give it an alias (e.g. `default`).

---

### Step 9 — Deploy

```bash
firebase deploy
```

This deploys everything in one shot — hosting, Firestore security rules, and indexes.

Firebase will give you a live URL like:
```
https://bails-arena.web.app
```

Open it, sign in with the admin email from Step 4, and you're live.

---

### Deploying individual parts (optional)

| Command | What it deploys |
|---|---|
| `firebase deploy --only hosting` | Just the web app |
| `firebase deploy --only firestore:rules` | Just the security rules |
| `firebase deploy --only firestore:indexes` | Just the indexes |

---

## Features

| Feature | Details |
|---|---|
| Admin login | Firebase Auth email/password gate |
| Date strip | Scrollable 7-day row with month navigation |
| Slot grid | 24 hourly tiles, colour-coded |
| End-time picker | Tap a slot → pick duration via bottom sheet |
| Slot colours | Green = available, Red = booked, Orange = blocked |
| Blocked slots | Block with reason (Tournament / Maintenance / Private Event) |
| Payment tracking | UPI / Cash / Combo; mark paid from booking detail |
| Payment badge | Paid/Unpaid badge visible on each booked tile |
| WhatsApp | One-tap deep-link with pre-filled booking message |
| Auto-pricing | Weekday/weekend rates; auto-fills on booking |
| Series booking | Daily or weekly repeat until a date |
| Reports | Weekly / monthly / custom date range |
| Excel export | `.xlsx` via SheetJS |
| CSV export | Fallback spreadsheet download |
| Customers | Searchable list, add inline during booking or from page |
| Settings | Pricing, weekend days, turf name, admin phone |

---

## Cost (Firebase Free Spark Plan)

| Resource | Free limit | Expected usage |
|---|---|---|
| Firestore reads | 50,000 / day | ~200–500 / day ✅ |
| Firestore writes | 20,000 / day | ~20–50 / day ✅ |
| Hosting bandwidth | 10 GB / month | ~1 GB / month ✅ |
| Authentication | Unlimited | ✅ |
| **Total cost** | | **₹0** |

---

## Firestore Collections

| Collection | Purpose |
|---|---|
| `bookings` | All booking records |
| `blockedSlots` | Admin-blocked time slots |
| `users` | Customer records |
| `settings/pricing` | Pricing config and turf info |

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "Firebase connection failed" | Check `firebase-config.js` — all 6 values must be filled |
| Login fails | Verify Email/Password auth is enabled and the user exists in Firebase Console → Authentication |
| Firestore permission denied | Re-deploy rules: `firebase deploy --only firestore:rules` |
| Blank page after deploy | Run `firebase deploy --only hosting` |
| Indexes not ready | Wait 1–2 minutes after first deploy; Firestore builds indexes in the background |
