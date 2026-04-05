import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, getDoc, updateDoc, onSnapshot, query, where, getDocs, deleteDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

export { collection, doc, setDoc, getDoc, updateDoc, onSnapshot, query, where, getDocs, deleteDoc, addDoc, serverTimestamp };
