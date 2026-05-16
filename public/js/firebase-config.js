// Replace values with your Firebase project config:
// Firebase Console → Project Settings → Your Apps

import { initializeApp }  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore }   from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth }        from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyA7pC_-qWNdodzbGiRLD7UIIFJDQ8lbznw",
  authDomain: "bails-arena-oval-turf.firebaseapp.com",
  projectId: "bails-arena-oval-turf",
  storageBucket: "bails-arena-oval-turf.firebasestorage.app",
  messagingSenderId: "128409338004",
  appId: "1:128409338004:web:c574eeba93ca73cd1cf481",
  measurementId: "G-31EVQPX4ZJ"
};

const app = initializeApp(firebaseConfig);
export const db   = getFirestore(app);
export const auth = getAuth(app);
