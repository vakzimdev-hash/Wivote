import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { 
  getFirestore, 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  memoryLocalCache,
  setLogLevel
} from 'firebase/firestore';
import './utils/safeStorage';
import jsonFirebaseConfig from './firebase-applet-config.json';

// --- Production Firebase Configuration ---
// Prioritize jsonFirebaseConfig directly to ensure consistent multi-device synchronization
export const firebaseConfig = {
  apiKey: jsonFirebaseConfig.apiKey || import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: jsonFirebaseConfig.authDomain || import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: jsonFirebaseConfig.projectId || import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: jsonFirebaseConfig.storageBucket || import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: jsonFirebaseConfig.messagingSenderId || import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: jsonFirebaseConfig.appId || import.meta.env.VITE_FIREBASE_APP_ID,
};

const config = firebaseConfig;

// Silence Firestore SDK connection retry warnings in offline/sandboxed environments
setLogLevel('silent');

export const isFirebasePlaceholder = !config.apiKey || config.apiKey === 'placeholder-api-key';

console.log(`[WiVoTe] Connecting to global production Firebase project: "${config.projectId}"`);

const app = initializeApp(config);

export const firestoreDatabaseId = jsonFirebaseConfig.firestoreDatabaseId || import.meta.env.VITE_FIREBASE_DATABASE_ID;

console.log(`[WiVoTe] Targeting cloud Firestore database: "${firestoreDatabaseId || '(default)'}"`);

let firestoreInstance;
try {
  firestoreInstance = initializeFirestore(
    app,
    {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      })
    },
    firestoreDatabaseId && firestoreDatabaseId !== '(default)' ? firestoreDatabaseId : undefined
  );
} catch (e) {
  try {
    firestoreInstance = initializeFirestore(
      app,
      { localCache: memoryLocalCache() },
      firestoreDatabaseId && firestoreDatabaseId !== '(default)' ? firestoreDatabaseId : undefined
    );
  } catch (memErr) {
    firestoreInstance = getFirestore(
      app,
      firestoreDatabaseId && firestoreDatabaseId !== '(default)' ? firestoreDatabaseId : undefined
    );
  }
}

export const db = firestoreInstance;
export const auth = getAuth(app);

// Enforce browser persistence explicitly for persistent active sessions across tabs
if (!isFirebasePlaceholder) {
  setPersistence(auth, browserLocalPersistence)
    .then(() => {
      console.log("[WiVoTe] Browser local session persistence active.");
    })
    .catch(err => {
      console.warn("[WiVoTe] Could not establish browser local persistence:", err);
    });
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errMsg = error instanceof Error ? error.message : String(error);
  const errInfo: FirestoreErrorInfo = {
    error: errMsg,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.warn('Firestore Operation Notice: ', JSON.stringify(errInfo));
}

