// Entry point.

import { Game } from './game.js';
import { Sound } from './audio.js';

// Browsers only allow audio after a user gesture, so wake it on the first one.
document.addEventListener('pointerdown', () => Sound.unlock(), { capture: true });
document.addEventListener('keydown', () => Sound.unlock(), { capture: true });

new Game(document.getElementById('game'));
