/**
 * @fileOverview Firebase Admin SDK Initialization for Server-Side Operations.
 * This module initializes the Firebase Admin SDK, which is essential for
 * server-side logic to interact with Firebase services with elevated privileges.
 */

import admin from 'firebase-admin';

// Check if the app is already initialized to prevent errors during hot-reloads
// or multiple function initializations in the same runtime.
if (!admin.apps.length) {
    // When deployed to a Google Cloud environment (like Cloud Functions),
    // initializeApp() with no arguments automatically uses the environment's
    // service account credentials. This is the standard and correct way.
    admin.initializeApp();
}

// Get the services from the default app instance.
const adminApp = admin.app();
const adminDb = admin.firestore();
const adminAuth = admin.auth();

export { adminApp, adminDb, adminAuth };
