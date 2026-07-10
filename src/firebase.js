import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: 'AIzaSyClRl5czPY5uujGnB-z_hL3WVVO4smfEp8',
  authDomain: 'huyen-duong-cpc1hn.firebaseapp.com',
  projectId: 'huyen-duong-cpc1hn',
  storageBucket: 'huyen-duong-cpc1hn.firebasestorage.app',
  messagingSenderId: '556128229393',
  appId: '1:556128229393:web:871608c31a3bdcf3fcb9b0',
}

export const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
export const auth = getAuth(app)
