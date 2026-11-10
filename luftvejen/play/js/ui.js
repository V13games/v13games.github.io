// DOM screens and HUD (all text in Danish). The UI never touches game
// state directly; it calls the handlers the game passes in and re-renders
// from the save data.

import { Sound } from './audio.js';
import { cleanName } from './leaderboard.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.floor(n).toLocaleString('da-DK');
// Phones and tablets steer with a finger; everything else uses the space bar.
const TOUCH = window.matchMedia?.('(pointer: coarse)').matches ?? false;

export class UI {
  constructor(h) {
    this.h = h;
    this.hudCache = {};
    this.shownScore = 0;
    this.screens = { menu: $('menu'), over: $('over'), pause: $('pause'), board: $('board') };

    const on = (id, fn) => $(id).addEventListener('click', () => { Sound.click(); fn(); });
    on('playBtn', () => h.play());
    on('boardBtn', () => h.openBoard());
    on('muteBtn', () => h.toggleMute());
    on('boardClose', () => h.backToMenu());
    on('pauseBtn', () => h.pause());
    on('resumeBtn', () => h.resume());
    on('quitBtn', () => h.quit());
    on('againBtn', () => h.play());
    on('overMenuBtn', () => h.quit());
    on('reviveCoins', () => h.reviveCoins());
    on('reviveSkip', () => h.declineRevive());
    on('modeBtn', () => h.toggleBeauty());

    // New player: type a name, then "Lav spiller" (or Enter). The menu and
    // the crash screen each have their own copy of the form and the picker.
    this.nameForms = [
      { screen: 'menu', form: $('nameForm'), input: $('nameInput'), btn: $('createBtn'), help: $('nameHelp') },
      { screen: 'over', form: $('overNameForm'), input: $('overNameInput'), btn: $('overCreateBtn'), help: null },
    ];
    for (const f of this.nameForms) {
      f.input.addEventListener('input', () => this.checkName(f));
      f.form.addEventListener('submit', (e) => {
        e.preventDefault();
        Sound.click();
        h.createPlayer(f.input.value);
      });
    }
    for (const id of ['playerSelect', 'overPlayerSelect']) {
      $(id).addEventListener('change', (e) => h.selectPlayer(e.target.value));
    }
  }

  screen(name) {
    for (const [k, el] of Object.entries(this.screens)) el.hidden = k !== name;
    document.activeElement?.blur?.();
  }

  // ------------------------------------------------------------------ menu

  showMenu(save, board) {
    this.screen('menu');
    this.renderMenu(save);
    for (const f of this.nameForms) this.checkName(f, false);
    if (board) this.renderBoards(board);
  }

  renderMenu(save) {
    const p = save.players.find((x) => x.id === save.current);
    $('menuBest').textContent = fmt(p?.best ?? 0);
    $('menuCoins').textContent = fmt(p?.coins ?? 0);
    $('menuRuns').textContent = fmt(p?.runs ?? 0);
    this.renderPlayers(save);
    $('playerPick').hidden = save.players.length === 0;
    $('playBtn').disabled = !p;
    $('playBtn').textContent = p ? `Kør som ${p.name}` : 'Kør!';
    $('playNote').hidden = !!p;
  }

  // Both player pickers, plus the "Kør igen" button that names who drives.
  renderPlayers(save) {
    const p = save.players.find((x) => x.id === save.current);
    for (const id of ['playerSelect', 'overPlayerSelect']) {
      $(id).replaceChildren(...save.players.map((pl) => {
        const o = document.createElement('option');
        o.value = pl.id;
        o.textContent = pl.name;
        o.selected = pl.id === save.current;
        return o;
      }));
    }
    $('againBtn').textContent = p ? `Kør igen som ${p.name}` : 'Kør igen';
  }

  setBeauty(on) {
    document.body.classList.toggle('beauty', on);
    $('modeBtn').setAttribute('aria-pressed', String(on));
    $('modeLabel').textContent = `Skønhedstilstand: ${on ? 'til' : 'fra'}`;
    $('overCoinsLbl').textContent = on ? 'Produkter' : 'Mønter';
  }

  checkName(f, showError = true) {
    const ok = cleanName(f.input.value).length >= 2;
    f.btn.disabled = !ok;
    if (f.help) f.help.hidden = ok || !showError || !f.input.value;
    if (ok) f.input.classList.remove('shake');
    return ok;
  }

  clearNewName() {
    for (const f of this.nameForms) {
      f.input.value = '';
      this.checkName(f, false);
    }
  }

  // Point at the name box on whichever screen is showing.
  nameError() {
    const f = this.nameForms.find((x) => !this.screens[x.screen].hidden) || this.nameForms[0];
    if (f.help) f.help.hidden = false;
    f.input.classList.remove('shake');
    void f.input.offsetWidth;
    f.input.classList.add('shake');
    f.input.focus();
  }

  setMuted(m) {
    $('muteLabel').textContent = m ? 'Lyd fra' : 'Lyd til';
    $('muteIco').src = m ? 'icons/mute.png' : 'icons/volume.png';
    $('muteBtn').setAttribute('aria-pressed', String(!m));
  }

  // ----------------------------------------------------------- leaderboard

  showBoard(board) {
    this.screen('board');
    this.renderBoards(board);
  }

  // Fill every leaderboard list on the page from the same data. Names are
  // typed by other players, so they only ever go in via textContent.
  renderBoards(board) {
    for (const el of document.querySelectorAll('[data-board]')) {
      const limit = Number(el.dataset.board) || 50;
      el.replaceChildren();
      const note = (text) => {
        const p = document.createElement('p');
        p.className = 'board-note';
        p.textContent = text;
        el.append(p);
      };
      if (board.status === 'loading') { note('Henter ranglisten …'); continue; }
      if (board.status === 'off') { note('Ranglisten kan kun vises inde på claude.ai, når du er logget ind.'); continue; }
      if (!board.rows.length) { note('Ingen scorer endnu. Bliv den første!'); continue; }
      const ol = document.createElement('ol');
      ol.className = 'board-list';
      board.rows.slice(0, limit).forEach((r, i) => {
        const li = document.createElement('li');
        const mine = board.isMine(r);
        if (mine) li.className = 'me';
        if (i < 3) li.dataset.medal = String(i + 1);
        const rank = document.createElement('span');
        rank.className = 'rank';
        rank.textContent = String(i + 1);
        const name = document.createElement('span');
        name.className = 'who';
        name.textContent = r.name + (mine ? ' (dig)' : '');
        const score = document.createElement('span');
        score.className = 'pts';
        score.textContent = fmt(r.score);
        li.append(rank, name, score);
        ol.append(li);
      });
      el.append(ol);
    }
    const warn = board.status === 'ready' && !board.canWrite;
    for (const el of document.querySelectorAll('.board-warn')) el.hidden = !warn;

    const rank = board.myRank();
    $('overRank').textContent = rank ? `Du er nr. ${rank} på ranglisten` : '';
  }

  toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { el.hidden = true; }, 1800);
  }

  // ------------------------------------------------------------------- HUD

  showHUD() {
    $('hud').hidden = false;
    this.hudCache = {};
    this.shownScore = 0;
    this.nextPop = 100;
  }

  hideHUD() {
    $('hud').hidden = true;
    $('banner').hidden = true;
    $('goText').hidden = true;
  }

  popScore() {
    const el = $('score');
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
  }

  // The big score counts up smoothly toward the real value and gives a
  // little bounce every 100 points.
  updateHUD(d, dt) {
    const c = this.hudCache;
    this.shownScore += (d.score - this.shownScore) * (1 - Math.exp(-12 * dt));
    if (d.score - this.shownScore < 0.5) this.shownScore = d.score;
    const shown = Math.round(this.shownScore);
    if (c.score !== shown) $('score').textContent = fmt(c.score = shown);
    if (shown >= this.nextPop) {
      this.nextPop = (Math.floor(shown / 100) + 1) * 100;
      this.popScore();
    }

    if (c.coins !== d.coins) {
      $('hudCoins').textContent = fmt(d.coins);
      if (c.coins !== undefined) {
        const pill = $('coinPill');
        pill.classList.remove('bump');
        void pill.offsetWidth;
        pill.classList.add('bump');
      }
      c.coins = d.coins;
    }
    const mult = d.mult.toFixed(1).replace('.', ',');
    if (c.mult !== mult) $('comboLabel').textContent = `×${(c.mult = mult)}`;
    if (c.combo !== d.combo) $('comboFill').style.transform = `scaleX(${(c.combo = d.combo)})`;

    const key = `${d.car}|${d.shield}|${d.magnet}|${d.double}`;
    if (c.buffs !== key) {
      c.buffs = key;
      const ico = (file) => `<img src="icons/${file}" alt="">`;
      const chips = [`<span class="buff car">${ico('car.png')}${d.car}</span>`];
      if (d.shield) chips.push(`<span class="buff shield">${ico('shield.svg')}Skjold</span>`);
      if (d.magnet > 0) chips.push(`<span class="buff magnet">${ico('magnet.svg')}Magnet ${d.magnet}s</span>`);
      if (d.double > 0) chips.push(`<span class="buff double">${ico('double.svg')}2× point ${d.double}s</span>`);
      $('buffs').innerHTML = chips.join('');
    }
  }

  // Banner that slides in under the score: a new world or a new car.
  showBanner(kicker, name, tip, kind) {
    const el = $('banner');
    $('bannerKicker').textContent = kicker;
    $('bannerName').textContent = name;
    $('bannerTip').textContent = tip;
    el.dataset.biome = kind;
    el.hidden = false;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => { el.hidden = true; }, 3000);
  }

  showGo() {
    const el = $('goText');
    el.hidden = false;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(this.goTimer);
    this.goTimer = setTimeout(() => { el.hidden = true; }, 1000);
  }

  showHint(kind, dir) {
    const el = $('hint');
    el.hidden = false;
    el.dataset.kind = kind;
    const key = TOUCH ? 'fingeren' : 'mellemrum';
    if (kind === 'ready') {
      $('hintBig').textContent = TOUCH ? 'Tryk for at starte' : 'Tryk på mellemrum';
      $('hintSmall').innerHTML = `<b class="hold">Hold ${key} nede</b> for at dreje til højre · <b class="release">Slip</b> for at dreje til venstre`;
    } else {
      $('hintSmall').innerHTML = dir === 'hold'
        ? `Gør dig klar til at <b class="hold">holde ${key} nede</b>`
        : 'Gør dig klar til at <b class="release">slippe</b>';
    }
  }

  setCountdown(n) {
    if (this.countN !== n) $('hintBig').textContent = String(Math.max(1, (this.countN = n)));
  }

  hideHint() {
    $('hint').hidden = true;
    this.countN = null;
  }

  // ------------------------------------------------------------- game over

  showGameOver(d, save, board) {
    this.screen('over');
    this.renderPlayers(save);
    this.clearNewName();
    $('overName').textContent = d.name;
    $('overScore').textContent = fmt(d.score);
    $('overBest').textContent = fmt(d.best);
    $('overCoins').textContent = `+${fmt(d.coins)}`;
    $('overPerfects').textContent = fmt(d.perfects);
    $('overCombo').textContent = d.bestCombo ? `×${d.bestCombo}` : '–';
    $('newBest').hidden = !d.newBest;
    this.renderBoards(board);

    $('revivePanel').hidden = !d.revive;
    if (d.revive) {
      $('reviveCost').textContent = d.revive.cost;
      $('reviveHave').textContent = fmt(d.revive.have);
      this.setReviveTimer(1);
    }
  }

  setReviveTimer(frac) {
    $('reviveFill').style.transform = `scaleX(${Math.max(0, frac)})`;
  }

  hideRevive() {
    $('revivePanel').hidden = true;
  }
}
