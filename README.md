# TurfBook Pro — Setup Guide

A zero-cost, mobile-friendly turf booking system powered by Firebase.

---

## 🏗️ Project Structure

```
turf-booking/
├── public/
│   ├── index.html          ← Main app
│   ├── css/style.css       ← All styles
│   └── js/
│       ├── firebase-config.js  ← 🔑 Your Firebase credentials go here
│       └── app.js              ← All app logic
├── firebase.json           ← Firebase hosting config
├── firestore.rules         ← Database security rules
├── firestore.indexes.json  ← Database indexes
└── README.md
```

---

## 🚀 Step-by-Step Deployment

### Step 1 – Create a Firebase Project (free)

1. Go to https://console.firebase.google.com
2. Click **Add project** → name it (e.g. `turf-booking`)
3. Disable Google Analytics if you want → **Create project**

### Step 2 – Enable Firestore Database

1. In your Firebase project → **Build → Firestore Database**
2. Click **Create database**
3. Choose **Start in production mode** → pick your region (e.g. `asia-south1` for India)
4. Click **Enable**

### Step 3 – Get your Firebase Config

1. In Firebase Console → ⚙️ Project Settings → **Your apps** tab
2. Click **Add app** → choose **Web** (</> icon)
3. Register the app (any nickname) → copy the `firebaseConfig` object

### Step 4 – Paste your config

Open `public/js/firebase-config.js` and replace the placeholder values:

```js
const firebaseConfig = {
  apiKey:            "AIza...",
  authDomain:        "your-project.firebaseapp.com",
  projectId:         "your-project",
  storageBucket:     "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123...:web:abc..."
};
```

### Step 5 – Install Firebase CLI

```bash
npm install -g firebase-tools
```

### Step 6 – Login & Deploy

```bash
cd turf-booking
firebase login
firebase use --add          # select your project
firebase deploy
```

That's it! Firebase gives you a live URL like:
`https://your-project.web.app`

---

## 📱 Features

| Feature | Details |
|---|---|
| Slot Grid | 24 hourly slots, colour-coded |
| Booking | Select adjacent slots, add user & amount |
| Series Booking | Daily or weekly repeat until a date |
| User Management | Unique mobile number per user |
| Conflict Check | Prevents double booking |
| Reports | Weekly / monthly / custom date range |
| CSV Export | Download report as spreadsheet |
| Mobile-first | Works great on all screen sizes |

---

## 💰 Cost Breakdown (Firebase Free Spark Plan)

| Resource | Free Limit | Your Usage |
|---|---|---|
| Firestore reads | 50,000/day | ~100–500/day ✅ |
| Firestore writes | 20,000/day | ~20–50/day ✅ |
| Hosting bandwidth | 10 GB/month | ~1 GB/month ✅ |
| **Total cost** | **₹0** | ✅ |

---

## 🔐 Security Note

The current `firestore.rules` allows open access (suitable for personal use on a private URL).
If you want to add login protection later, let me know — I can add Firebase Authentication.

---

## 🆘 Troubleshooting

- **"Firebase connection failed"** → Check your config in `firebase-config.js`
- **Blank page after deploy** → Run `firebase deploy --only hosting`
- **Firestore permission errors** → Deploy rules: `firebase deploy --only firestore:rules`
"# bails-arena-firebase" 
