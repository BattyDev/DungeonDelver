import { parseSave } from '@delver/rules';
import type { SaveData } from '@delver/rules';
import type { Storage } from './storage';
export const SAVE_KEY = 'dungeon-delver.save';
/** Inject the browser key-value store so failures can be tested without a DOM. */
export class LocalStorageAdapter implements Storage {
  constructor(private backend: Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>) {}
  async load(): Promise<SaveData | null> {
    const raw = this.backend.getItem(SAVE_KEY);
    return raw === null ? null : parseSave(raw);
  }
  async save(data: SaveData): Promise<void> {
    this.backend.setItem(SAVE_KEY, JSON.stringify(data));
  }
  async clear(): Promise<void> {
    this.backend.removeItem(SAVE_KEY);
  }
}
