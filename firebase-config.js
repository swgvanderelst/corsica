// Firebase web config (public by design; security comes from database.rules.json).
// store.js uses the local dev server on localhost / 127.0.0.1, and Firebase everywhere else (or with ?prod=1).
export const firebaseConfig = {
  apiKey: 'AIzaSyBTnVSnmxNaMiDk-yFCBt5KwgOFuOR1zQc',
  authDomain: 'corsica-84e88.firebaseapp.com',
  databaseURL: 'https://corsica-84e88-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'corsica-84e88',
  storageBucket: 'corsica-84e88.firebasestorage.app',
  messagingSenderId: '859569912312',
  appId: '1:859569912312:web:625d1c1814a5f5b8877e0d',
};
