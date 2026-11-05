// Website version of Luftvejen's leaderboard. build.js copies this over the
// original file for the site only.
//
// The Claude version keeps scores in a shared database that only exists on
// claude.ai. A plain website has no database, so this board lists the players
// saved in this browser instead. It has the same interface as the original,
// so the rest of the game does not need to change.

import { loadSave } from './storage.js';

const MAX_ROWS = 50;
const NAME_MAX = 16;

export function cleanName(raw) {
  return String(raw ?? '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}

export class Leaderboard {
  constructor(onChange) {
    this.onChange = onChange;
    this.rows = [];
    this.status = 'ready';
    this.canWrite = true;
    this.myId = 'local';
    this.season = null;
    this.mine = {};
    this.currentPid = null;
    this.refresh();
    // The game finishes setting itself up before it hears from the board.
    setTimeout(() => this.onChange?.(this));
  }

  refresh() {
    this.rows = loadSave().players
      .filter((p) => p.best > 0)
      .map((p) => ({ uid: 'local', pid: p.id, name: p.name, score: p.best }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_ROWS);
  }

  isMine(row) {
    return row.pid === this.currentPid;
  }

  // The game has already saved the player's new best by the time this runs.
  submit() {
    this.refresh();
    return Promise.resolve(true);
  }

  myRank() {
    return this.rows.findIndex((r) => this.isMine(r)) + 1;
  }
}
