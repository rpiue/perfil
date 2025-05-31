// firebase-db-data.js
const { initializeApp, getApps, getApp } = require("firebase/app");
const { getFirestore } = require("firebase/firestore/lite");

// 🔵 Proyecto 1 - apppagos
const firebaseConfig1 = {
  apiKey: "AIzaSyAImehLPFTGMupcVxuzNNyWkrkkB6utx34",
  authDomain: "apppagos-1ec3f.firebaseapp.com",
  projectId: "apppagos-1ec3f",
  storageBucket: "apppagos-1ec3f.appspot.com",
  messagingSenderId: "296133590526",
  appId: "1:296133590526:web:a47a8e69d5e9bfa26bd4af",
  measurementId: "G-5QZSJN2S1Z"
};

// 🟠 Proyecto 2 - controller
const firebaseConfig2 = {
  apiKey: "AIzaSyDCpa3Pg4hcwxrnWl3-Fb4IhqqsDPO1wbg",
  authDomain: "controller-b0871.firebaseapp.com",
  projectId: "controller-b0871",
  storageBucket: "controller-b0871.firebasestorage.app",
  messagingSenderId: "664100615717",
  appId: "1:664100615717:web:4837b6cad282940a4031cc",
  measurementId: "G-H5705PFPCW"
};

// Inicializar apps con nombres únicos
const app1 = getApps().find(a => a.name === 'apppagos') || initializeApp(firebaseConfig1, 'apppagos');
const app2 = getApps().find(a => a.name === 'controller') || initializeApp(firebaseConfig2, 'controller');

// Obtener instancias de Firestore
const db1 = getFirestore(app1);
const db2 = getFirestore(app2);

module.exports = {
  db1,
  db2
};
