import type { SaveData } from '@delver/rules';
export interface Storage {
  load(): Promise<SaveData | null>;
  save(data: SaveData): Promise<void>;
  clear(): Promise<void>;
}
