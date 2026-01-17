// Firebase 설정 파일
// 아래 설정값을 Firebase Console에서 복사한 값으로 교체하세요

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
 apiKey: "AIzaSyBLLxtneauLtkdIEtasOcaUT0bP-5KJ1yg",
  authDomain: "planit-clinic.firebaseapp.com",
  projectId: "planit-clinic",
  storageBucket: "planit-clinic.firebasestorage.app",
  messagingSenderId: "939910101185",
  appId: "1:939910101185:web:9e45988397fcdaf07a7c40"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
