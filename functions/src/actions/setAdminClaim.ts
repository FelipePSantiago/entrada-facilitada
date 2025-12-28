
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

/**
 * Sets the `admin` custom claim on a user account.
 * This function is callable by a client application and will only succeed
 * if the calling user's document in the 'users' collection has the `isAdmin` field set to `true`.
 *
 * @param _ - The data passed to the function (unused in this case).
 * @param context - The context of the function call, including authentication information.
 * @returns An object indicating the result of the operation.
 * @throws - Throws an error if the user is not authenticated, is not an admin, or if setting the claim fails.
 */
export const setAdminClaimAction = functions.https.onCall(async (_, context) => {
  // 1. Check if the user is authenticated.
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'A solicitação deve ser feita por um usuário autenticado.',
    );
  }

  const { uid } = context.auth;

  try {
    // 2. Check if the user is marked as an admin in the Firestore database.
    const userDoc = await admin.firestore().collection('users').doc(uid).get();

    if (!userDoc.exists || !userDoc.data()?.isAdmin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'O usuário não tem permissão para realizar esta operação.',
      );
    }

    // 3. Set the custom claim. This will overwrite any existing claims.
    await admin.auth().setCustomUserClaims(uid, { admin: true });

    // 4. Return a success message.
    return { result: `Sucesso! A permissão de administrador foi concedida para o usuário ${uid}.` };

  } catch (error) {
    console.error(`Falha ao definir a custom claim de admin para o UID: ${uid}`, error);

    if (error instanceof functions.https.HttpsError) {
      throw error; // Re-throw HttpsError exceptions directly.
    }

    throw new functions.https.HttpsError(
      'internal',
      'Ocorreu um erro interno ao tentar definir as permissões de administrador.',
    );
  }
});
