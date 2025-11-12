
import {
  onSnapshot,
  Unsubscribe,
  doc,
  type Firestore
} from "firebase/firestore";
import type { AppUser } from "@/types";

/**
 * Subscribes to real-time updates for a single user's data.
 * @param db The Firestore instance.
 * @param uid The user's unique ID.
 * @param callback The function to call with the user's data.
 * @returns An unsubscribe function.
 */
export const onUserSnapshot = (
    db: Firestore, // <<< db é recebido como parâmetro
    uid: string, 
    callback: (user: AppUser | null) => void
): Unsubscribe => {
    const userRef = doc(db, "users", uid);
    return onSnapshot(userRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            callback({
                uid: docSnap.id,
                email: data.email,
                emailLower: data.emailLower,
                isAdmin: data.isAdmin ?? false,
            } as AppUser);
        } else {
            callback(null);
        }
    }, (error) => {
        console.error("Failed to subscribe to user data:", error);
        callback(null);
    });
};
