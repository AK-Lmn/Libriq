export function createExportPayload(snapshot, { version, exportedAt }) {
  return {
    app: 'LibriQ', version, exportedAt,
    data: {
      books: snapshot.books,
      profile: snapshot.profile,
      goals: snapshot.goals,
      streak: snapshot.streak,
      activity: snapshot.activity,
    },
  };
}

export function serializeBackup(payload) {
  return JSON.stringify(payload, null, 2);
}

export function parseBackupText(text) {
  return JSON.parse(text);
}

export function validateBackup(payload) {
  return Boolean(payload && payload.app === 'LibriQ' && payload.data && Array.isArray(payload.data.books));
}
