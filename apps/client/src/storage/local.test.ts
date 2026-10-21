import { it, expect } from 'vitest';
import { LocalStorageAdapter, SAVE_KEY } from './local';
it('saves and clears only its own versioned key', async () => {
  const data = new Map([['other-app', 'keep']]);
  const storage = new LocalStorageAdapter({
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  });
  expect(await storage.load()).toBeNull();
  await storage.save({ version: 1, state: { phase: 'classSelect' } });
  expect(data.has(SAVE_KEY)).toBe(true);
  expect((await storage.load())?.version).toBe(1);
  await storage.clear();
  expect(data.get('other-app')).toBe('keep');
  expect(await storage.load()).toBeNull();
});
it('propagates quota and permission errors, preserves corrupt data', async () => {
  const bad = '{bad';
  const storage = new LocalStorageAdapter({
    getItem: () => bad,
    setItem: () => {
      throw Error('Quota exceeded');
    },
    removeItem: () => {
      throw Error('Permission denied');
    },
  });
  await expect(storage.load()).rejects.toThrow();
  await expect(storage.save({ version: 1, state: { phase: 'classSelect' } })).rejects.toThrow(
    'Quota',
  );
  await expect(storage.clear()).rejects.toThrow('Permission');
});
