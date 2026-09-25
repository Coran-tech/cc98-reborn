const questionAdminKeyStore = (() => {
  const DATABASE = "cc98-question-admin";
  const STORE = "keys";

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function load() {
    const db = await openDatabase();
    try {
      return await new Promise((resolve, reject) => {
        const request = db.transaction(STORE, "readonly").objectStore(STORE).get("owner");
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  }

  async function enroll() {
    const existing = await load();
    if (existing) return existing;
    const pair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]);
    const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
    const record = { privateKey: pair.privateKey, publicJwk };
    const db = await openDatabase();
    try {
      await new Promise((resolve, reject) => {
        const request = db.transaction(STORE, "readwrite").objectStore(STORE).put(record, "owner");
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
    return record;
  }

  return { load, enroll };
})();
