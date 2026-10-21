/** Rules state is JSON data, so this also works in browser and Edge runtimes. */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
