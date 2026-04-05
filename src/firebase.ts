import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, getDoc, updateDoc, onSnapshot, query, where, getDocs, deleteDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const signIn = () => signInAnonymously(auth);

export { collection, doc, setDoc, getDoc, updateDoc, onSnapshot, query, where, getDocs, deleteDoc, addDoc, serverTimestamp, onAuthStateChanged };

