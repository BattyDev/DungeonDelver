export class Keyboard {
  held = new Set<string>();
  constructor(
    private interact: () => void,
    private close: () => void,
    private move: (dx: number, dz: number) => void,
  ) {
    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      if (key === 'escape') {
        this.close();
        return;
      }
      if ((e.target as HTMLElement).matches('input,select,textarea')) return;
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key))
        e.preventDefault();
      this.held.add(key);
      if (!e.repeat) {
        const direction: Record<string, [number, number]> = {
          w: [0, -1],
          arrowup: [0, -1],
          s: [0, 1],
          arrowdown: [0, 1],
          a: [-1, 0],
          arrowleft: [-1, 0],
          d: [1, 0],
          arrowright: [1, 0],
        };
        if (direction[key]) this.move(...direction[key]);
        if (['e', 'enter', ' '].includes(key) && !(e.target as HTMLElement).closest('button'))
          this.interact();
      }
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.held.clear());
  }
  direction(): [number, number] | undefined {
    if (this.held.has('w') || this.held.has('arrowup')) return [0, -1];
    if (this.held.has('s') || this.held.has('arrowdown')) return [0, 1];
    if (this.held.has('a') || this.held.has('arrowleft')) return [-1, 0];
    if (this.held.has('d') || this.held.has('arrowright')) return [1, 0];
    return undefined;
  }
}
