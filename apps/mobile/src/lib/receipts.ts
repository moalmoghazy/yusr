import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'yusr.receipts';
const MAX = 50;

/**
 * A donation made from this device: its id and the receipt token the API returned, enough to
 * reopen the receipt later without an account. The token only lets its holder view that receipt.
 */
export interface SavedReceipt {
  donationId: string;
  receiptToken: string;
  savedAt: string;
}

function isSavedReceipt(value: unknown): value is SavedReceipt {
  const entry = value as Partial<SavedReceipt> | null;
  return typeof entry?.donationId === 'string' && typeof entry.receiptToken === 'string' && typeof entry.savedAt === 'string';
}

/** Newest first. Never throws: a storage failure reads as "no donations on this device yet". */
export async function savedReceipts(): Promise<SavedReceipt[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter(isSavedReceipt) : [];
  } catch {
    return [];
  }
}

export async function saveReceipt(donationId: string, receiptToken: string): Promise<void> {
  const list = (await savedReceipts()).filter((entry) => entry.donationId !== donationId);
  list.unshift({ donationId, receiptToken, savedAt: new Date().toISOString() });
  await AsyncStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))).catch(() => undefined);
}
