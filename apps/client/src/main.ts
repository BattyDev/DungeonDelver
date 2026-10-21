import './styles.css';
import { Controller } from './controller';
import { LocalStorageAdapter } from './storage/local';
const storage = new LocalStorageAdapter({
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
  removeItem: (key) => localStorage.removeItem(key),
});
async function boot() {
  const root = document.querySelector<HTMLElement>('#app')!;
  try {
    const save = await storage.load();
    new Controller(root, storage, save?.state);
  } catch (error) {
    new Controller(
      root,
      storage,
      { phase: 'classSelect' },
      error instanceof Error ? error.message : 'Storage unavailable.',
    );
  }
}
void boot();
