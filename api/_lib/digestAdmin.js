// The three reads the weekly digest needs, on top of Firebase Admin's auth
// and Firestore clients. Kept apart from the route so the Firestore and Auth
// emulators can exercise them (tests-emulator/weekly-digest.emulator.test.mjs).
export function createDigestAdmin({ auth, db }) {
  return {
    async listAuthUsers(pageToken) {
      const page = await auth.listUsers(1000, pageToken);
      return {
        users: page.users.map(user => ({ uid: user.uid, email: user.email || '', emailVerified: Boolean(user.emailVerified), displayName: user.displayName || '' })),
        nextPageToken: page.pageToken,
      };
    },
    // One users/{uid}/prefs/email read per account, 300 at a time.
    async readDigestOptIns(uids) {
      const optedIn = new Set();
      for (let i = 0; i < uids.length; i += 300) {
        const group = uids.slice(i, i + 300);
        if (!group.length) continue;
        const snaps = await db.getAll(...group.map(uid => db.doc(`users/${uid}/prefs/email`)));
        snaps.forEach((snap, index) => { if (snap.exists && snap.get('weeklyDigest') === true) optedIn.add(group[index]); });
      }
      return optedIn;
    },
    async readReaderData(uid) {
      const [books, streak, goals] = await Promise.all([
        db.collection(`users/${uid}/sync/v1/books`).select('title', 'author', 'status', 'dateFinished', 'currentPage', 'pageCount').get(),
        db.doc(`users/${uid}/streak/current`).get(),
        db.doc(`users/${uid}/goals/current`).get(),
      ]);
      return { books: books.docs.map(doc => doc.data()), streak: streak.data() || null, goals: goals.data() || null };
    },
  };
}
