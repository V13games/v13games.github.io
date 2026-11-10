// One-button input: the space bar drives the single `down` flag. Mouse
// clicks don't steer. Phones have no space bar, so a finger on the play
// surface works there instead; a release counts anywhere, so a finger that
// slides off the canvas still lets go.

const KEYS = new Set(['Space']);

export class Input {
  constructor(surface) {
    this.down = false;
    this.enabled = false;
    this.onPress = null;
    this.onRelease = null;

    const press = () => {
      if (!this.enabled || this.down) return;
      this.down = true;
      this.onPress?.();
    };
    const release = () => {
      if (!this.down) return;
      this.down = false;
      this.onRelease?.();
    };

    surface.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      e.preventDefault();
      press();
    });
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    window.addEventListener('keydown', (e) => {
      if (!KEYS.has(e.code) || !this.enabled) return;
      e.preventDefault();
      if (!e.repeat) press();
    });
    window.addEventListener('keyup', (e) => {
      if (KEYS.has(e.code)) release();
    });
    window.addEventListener('blur', () => { this.down = false; });
    surface.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}
