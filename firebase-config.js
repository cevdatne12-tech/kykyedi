// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// TODO: Replace the following with your app's Firebase project configuration
// See: https://firebase.google.com/docs/web/learn-more#config-object
const firebaseConfig = {
  apiKey: "AIzaSyDE-TdOeRarzVd-rCX5SgL9To1YIR96HL4",
  authDomain: "kykyedi.firebaseapp.com",
  projectId: "kykyedi",
  storageBucket: "kykyedi.firebasestorage.app",
  messagingSenderId: "535940057146",
  appId: "1:535940057146:web:3f0533225469bba60ccd03"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };