export class Keyboard {
  held = new Set<string>();
  constructor(
    private interact: () => void,
    private close: () => void,
    private toggleMap: () => void = () => undefined,
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
        if (['e', 'enter', ' '].includes(key) && !(e.target as HTMLElement).closest('button'))
          this.interact();
        if (key === 'm') this.toggleMap();
      }
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.held.clear());
  }
  direction(): [number, number] | undefined {
    const held = (a: string, b: string) => Number(this.held.has(a) || this.held.has(b));
    const dx = held('d', 'arrowright') - held('a', 'arrowleft');
    const dz = held('s', 'arrowdown') - held('w', 'arrowup');
    const length = Math.hypot(dx, dz);
    return length ? [dx / length, dz / length] : undefined;
  }
}
