/**
 * @fileOverview Firebase Admin SDK Initialization for Server-Side Operations.
 * This module initializes the Firebase Admin SDK, which is essential for
 * server-side logic (like in Server Actions) to interact with Firebase services
 * with elevated privileges, bypassing client-side security rules.
 * This file should ONLY be imported in server-side code.
 */

import admin from 'firebase-admin';

/**
 * Singleton pattern to initialize and get Firebase Admin app, safe for Next.js environments.
 * Uses a global cache to prevent re-initialization during hot-reloads in development.
 * When deployed to Firebase/Google Cloud, it automatically uses the environment's
 * service account credentials.
 */
function getAdminApp() {
  const existingApp = admin.apps.find((app: admin.app.App | null) => app?.name === 'admin');
  if (existingApp) {
    return existingApp;
  }

  // When running in a Google Cloud environment (like Firebase Hosting for Next.js),
  // initializeApp() with no arguments will automatically use the default service account credentials.
  // This avoids the need for a local service-account-key.json file in production.
  return admin.initializeApp({}, 'admin');
}

const adminApp = getAdminApp();
const adminDb = admin.firestore(adminApp);
const adminAuth = admin.auth(adminApp);

export { adminApp, adminDb, adminAuth };
