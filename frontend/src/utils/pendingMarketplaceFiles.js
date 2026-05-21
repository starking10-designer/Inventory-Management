const DB_NAME = "inventory-pending-marketplace-files";
const UPLOAD_STORE_NAME = "files";
const CONFIRM_STORE_NAME = "confirmation_files";

const PLATFORM_KEYS = [
  "flipkart",
  "amazon",
  "ajio",
  "meesho",
  "myntra",
];

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(UPLOAD_STORE_NAME)) {
        db.createObjectStore(UPLOAD_STORE_NAME);
      }

      if (!db.objectStoreNames.contains(CONFIRM_STORE_NAME)) {
        db.createObjectStore(CONFIRM_STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(storeName, mode, action) {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    let result;

    try {
      result = action(store);
    } catch (error) {
      db.close();
      reject(error);
      return;
    }

    transaction.oncomplete = () => {
      db.close();
      resolve(result);
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

function getStoredFile(store, platform) {
  return new Promise((resolve, reject) => {
    const request = store.get(platform);

    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

async function loadMarketplaceFiles(storeName) {
  return withStore(storeName, "readonly", async (store) => {
    const files = await Promise.all(
      PLATFORM_KEYS.map(async (platform) => [
        platform,
        await getStoredFile(store, platform),
      ]),
    );

    return Object.fromEntries(files);
  });
}

async function saveMarketplaceFiles(storeName, files) {
  return withStore(storeName, "readwrite", (store) => {
    store.clear();

    for (const platform of PLATFORM_KEYS) {
      if (files[platform]) {
        store.put(files[platform], platform);
      }
    }
  });
}

export function loadPendingMarketplaceFiles() {
  return loadMarketplaceFiles(UPLOAD_STORE_NAME);
}

export function loadConfirmationMarketplaceFiles() {
  return loadMarketplaceFiles(CONFIRM_STORE_NAME);
}

export function savePendingMarketplaceFile(platform, file) {
  return withStore(UPLOAD_STORE_NAME, "readwrite", (store) =>
    store.put(file, platform)
  );
}

export function deletePendingMarketplaceFile(platform) {
  return withStore(UPLOAD_STORE_NAME, "readwrite", (store) =>
    store.delete(platform)
  );
}

export function clearPendingMarketplaceFiles() {
  return withStore(UPLOAD_STORE_NAME, "readwrite", (store) => store.clear());
}

export function saveConfirmationMarketplaceFiles(files) {
  return saveMarketplaceFiles(CONFIRM_STORE_NAME, files);
}

export function clearConfirmationMarketplaceFiles() {
  return withStore(CONFIRM_STORE_NAME, "readwrite", (store) =>
    store.clear()
  );
}
