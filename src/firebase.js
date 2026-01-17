// ⚠️ 아래 설정값을 본인의 Firebase Console에서 복사한 값으로 교체하세요!
// Firebase Console → 프로젝트 설정 → 일반 → 내 앱 → SDK 설정 및 구성

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

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
export const storage = getStorage(app);  // 사진 저장용
