export const initializeApp = () => ({});
export const getAuth = () => ({});
export class GoogleAuthProvider {}
export const signInWithPopup = async () => {};
export const signOut = async () => {};
export const serverTimestamp = () => 'TS';
export const getFirestore = () => ({});
export const collection = (db, name) => ({ name });
export const doc = (db, c, id) => ({ c, id });
export const setDoc = async () => {};
export const addDoc = async () => {};
export const deleteDoc = async () => {};
export const getDoc = async () => ({ exists: () => false });
export const query = (c) => c;
export const orderBy = () => ({});

export const DATA = { pos: [], receipts: [] };
export const onAuthStateChanged = (a, cb) =>
  cb({ displayName: '김용태', email: 'yt9495@gmail.com', photoURL: '' });
export const onSnapshot = (ref, cb) => {
  const rows = ref.name === 'pos' ? DATA.pos : DATA.receipts;
  cb({ docs: rows.map(r => ({ id: r.id, data: () => r })) });
  return () => {};
};
