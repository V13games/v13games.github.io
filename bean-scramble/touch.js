/* Touch controls for Bean Scramble. Website only: build.js copies this next to the game,
   so updating the game from its chat does not lose it. It plugs into window.__game, the same
   Input object the keyboard uses, and changes nothing for players on a computer.

   Left thumb: floating joystick. Right thumb: drag to look around.
   Buttons: JUMP, DIVE, pause, and fast-forward once you are finished or spectating. */
(function () {
  'use strict';

  var JOY_RADIUS = 56;     // px the knob can travel
  var JOY_DEAD = 0.12;     // ignore tiny thumb wobble
  var JOY_FULL = 0.85;     // full running speed before the very edge
  var LOOK_SPEED = 2.2;    // touch drags cover less distance than a mouse does

  var root = document.documentElement;
  var enabled = false, api = null, layer, joyEl, knobEl, jumpEl, diveEl;
  var joy = { id: null, cx: 0, cy: 0, f: 0, r: 0 };
  var look = { id: null, x: 0, y: 0 };
  var fastDown = false;

  var css = [
    'html.touch-play,html.touch-play body{touch-action:none;overscroll-behavior:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent}',
    'html.touch-play #hud-help,html.touch-play #hud-level,html.touch-play #hud-code{display:none}',
    'html.touch-play #hud:not(.hidden)~#mute{top:16px}',
    '.t-help{display:none}',
    'html.touch-play .t-help{display:grid}',
    'html.touch-play #s-howto .grid2:not(.t-help){display:none}',
    '@media (max-height:620px){html.touch-play #s-menu .panel,html.touch-play #s-lobby .panel p.muted{display:none}}',
    '@media (max-height:500px){html.touch-play #s-menu .logo,html.touch-play #lobby-list{display:none}html.touch-play #s-round .panel>.row:last-child{position:sticky;bottom:-4px;background:var(--paper);padding:6px 0 4px}}',
    // Small screens put these panels right under the sound button, which would cover Leave and Back.
    'html.touch-play #s-party:not(.hidden)~#mute,html.touch-play #s-lobby:not(.hidden)~#mute,html.touch-play #s-locker:not(.hidden)~#mute,html.touch-play #s-howto:not(.hidden)~#mute{display:none}',
    '#touch{position:fixed;inset:0;display:none;touch-action:none;-webkit-user-select:none;user-select:none}',
    '#touch.on{display:block}',
    '#t-joy{position:absolute;left:24px;bottom:24px;width:124px;height:124px;margin:0;border-radius:50%;background:rgba(255,255,255,.16);border:3px solid rgba(38,33,74,.55);opacity:.7;pointer-events:none}',
    '#t-joy.active{left:0;top:0;bottom:auto;opacity:1}',
    '#t-knob{position:absolute;left:50%;top:50%;width:58px;height:58px;margin:-29px 0 0 -29px;border-radius:50%;background:rgba(255,255,255,.85);border:3px solid #26214a}',
    '.t-btn{position:absolute;display:flex;align-items:center;justify-content:center;padding:0;border-radius:50%;border:3px solid #26214a;background:rgba(255,255,255,.8);color:#26214a;font-family:inherit;font-weight:900;font-size:15px;line-height:1;touch-action:none;box-shadow:0 4px 0 #26214a}',
    '.t-btn.down{transform:translateY(3px);box-shadow:0 1px 0 #26214a;background:#fff}',
    '#t-jump{right:22px;bottom:26px;width:92px;height:92px;background:rgba(255,197,49,.9);font-size:18px}',
    '#t-dive{right:124px;bottom:30px;width:70px;height:70px}',
    '#t-pause{right:16px;top:60px;width:44px;height:44px;font-size:14px;border-radius:12px}',
    '#t-fast{right:22px;bottom:100px;width:74px;height:74px;font-size:17px;letter-spacing:-2px;display:none}',
    '#touch.done #t-joy,#touch.done #t-jump,#touch.done #t-dive{display:none}',
    '#touch.done #t-fast{display:flex}',
    '@media (max-height:440px){#t-jump{width:80px;height:80px;bottom:18px}#t-dive{width:62px;height:62px;right:112px;bottom:18px}#t-joy{bottom:14px}}'
  ].join('\n');

  function enable() {
    if (enabled) return;
    enabled = true;
    root.classList.add('touch-play');
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    var wait = setInterval(function () {
      if (window.__game && window.__booted) { clearInterval(wait); api = window.__game; build(); }
    }, 100);
  }

  function button(id, text, label) {
    var b = document.createElement('button');
    b.id = id; b.type = 'button'; b.className = 't-btn'; b.textContent = text; b.setAttribute('aria-label', label);
    layer.appendChild(b);
    return b;
  }

  /* A held button: react on finger down, so it feels instant. */
  function hold(el, down, up) {
    el.addEventListener('pointerdown', function (e) { e.preventDefault(); e.stopPropagation(); el.classList.add('down'); down(); });
    var end = function (e) { e.stopPropagation(); el.classList.remove('down'); if (up) up(); };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('pointerleave', end);
  }

  function setFast(on) {
    if (fastDown === on) return;
    fastDown = on;
    if (on) api.Input.keys.add('KeyF'); else api.Input.keys.delete('KeyF');
  }

  function placeKnob(dx, dy) { knobEl.style.transform = 'translate(' + dx + 'px,' + dy + 'px)'; }

  function placeBase() { joyEl.style.transform = 'translate(' + (joy.cx - 62) + 'px,' + (joy.cy - 62) + 'px)'; }

  function joyMove(x, y) {
    var dx = x - joy.cx, dy = y - joy.cy, d = Math.hypot(dx, dy);
    // The base follows a thumb that overshoots, so changing direction never needs a long swipe back.
    if (d > JOY_RADIUS) {
      var pull = d - JOY_RADIUS;
      joy.cx += dx / d * pull; joy.cy += dy / d * pull;
      dx = x - joy.cx; dy = y - joy.cy; d = JOY_RADIUS;
      placeBase();
    }
    placeKnob(dx, dy);
    if (d / JOY_RADIUS < JOY_DEAD) { joy.f = 0; joy.r = 0; return; }
    var power = Math.min(1, d / (JOY_RADIUS * JOY_FULL));
    joy.f = -dy / d * power;
    joy.r = dx / d * power;
  }

  function joyEnd() {
    joy.id = null; joy.f = 0; joy.r = 0;
    joyEl.classList.remove('active');
    joyEl.style.transform = '';
    placeKnob(0, 0);
  }

  function onDown(e) {
    e.preventDefault();
    var canMove = !layer.classList.contains('done');
    if (canMove && joy.id === null && e.clientX < innerWidth / 2) {
      joy.id = e.pointerId; joy.cx = e.clientX; joy.cy = e.clientY;
      joyEl.classList.add('active');
      placeBase();
      joyMove(e.clientX, e.clientY);
    } else if (look.id === null) {
      look.id = e.pointerId; look.x = e.clientX; look.y = e.clientY;
    } else return;
    try { layer.setPointerCapture(e.pointerId); } catch (err) { /* the finger already left */ }
  }

  function onMove(e) {
    if (e.pointerId === joy.id) { joyMove(e.clientX, e.clientY); return; }
    if (e.pointerId === look.id) {
      api.Input.mdx += (e.clientX - look.x) * LOOK_SPEED;
      api.Input.mdy += (e.clientY - look.y) * LOOK_SPEED;
      look.x = e.clientX; look.y = e.clientY;
    }
  }

  function onUp(e) {
    if (e.pointerId === joy.id) joyEnd();
    if (e.pointerId === look.id) look.id = null;
  }

  function releaseAll() {
    if (joy.id !== null) joyEnd();
    look.id = null;
    setFast(false);
    var held = layer.querySelectorAll('.down');
    for (var i = 0; i < held.length; i++) held[i].classList.remove('down');
  }

  /* Follow the game: controls only exist while a race is on screen and no menu covers it. */
  function sync() {
    var G = api.Game;
    var covered = !!document.querySelector('#ui > section.screen:not(.hidden)');
    var on = !!(G.inRace() && G.race && !G.paused && !covered);
    var you = on ? G.player() : null;
    var done = !you || you.finished || you.out || !!G.spectating;
    if (!on) releaseAll();
    else if (done && joy.id !== null) joyEnd();
    if (!done) setFast(false);
    layer.classList.toggle('on', on);
    layer.classList.toggle('done', done);
    requestAnimationFrame(sync);
  }

  function build() {
    var Input = api.Input, canvas = document.getElementById('c');

    layer = document.createElement('div');
    layer.id = 'touch';
    joyEl = document.createElement('div'); joyEl.id = 't-joy';
    knobEl = document.createElement('div'); knobEl.id = 't-knob';
    joyEl.appendChild(knobEl);
    layer.appendChild(joyEl);
    diveEl = button('t-dive', 'DIVE', 'Dive');
    jumpEl = button('t-jump', 'JUMP', 'Jump');
    var pauseEl = button('t-pause', 'II', 'Pause');
    var fastEl = button('t-fast', '▶▶', 'Hold to fast-forward');
    // Right after the canvas: above the 3D view, under the game's own HUD and menus.
    canvas.parentNode.insertBefore(layer, canvas.nextSibling);

    hold(jumpEl, function () { Input.jump = true; });
    hold(diveEl, function () { Input.dive = true; });
    hold(fastEl, function () { setFast(true); }, function () { setFast(false); });
    // Not a click: a phone sends no click for a second finger while a thumb holds the joystick.
    hold(pauseEl, function () { api.Game.pause(); });

    layer.addEventListener('pointerdown', onDown);
    layer.addEventListener('pointermove', onMove);
    layer.addEventListener('pointerup', onUp);
    layer.addEventListener('pointercancel', onUp);
    layer.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    // The joystick stands in for the arrow keys. A plugged-in keyboard keeps working.
    var keyAxis = Input.axis.bind(Input);
    Input.axis = function () { return joy.id !== null ? { f: joy.f, r: joy.r } : keyAxis(); };

    // Phones have no mouse to lock, and a failed lock must never pause the race.
    canvas.requestPointerLock = function () { return Promise.resolve(); };

    var grid = document.querySelector('#s-howto .grid2');
    if (grid) {
      var help = document.createElement('div');
      help.className = 'grid2 t-help';
      help.innerHTML = '<div><b>Left thumb:</b> drag anywhere to run</div><div><b>Right thumb:</b> drag to look around</div>' +
        '<div><b>JUMP</b> and <b>DIVE:</b> the buttons on the right</div><div><b>II:</b> pause</div>' +
        '<div><b>▶▶</b> held: fast-forward once you are done</div><div><b>◀ ▶:</b> next bean while spectating</div>';
      grid.parentNode.insertBefore(help, grid);
    }

    requestAnimationFrame(sync);
  }

  // Phones and tablets get the controls straight away. A touchscreen laptop gets them on its first touch.
  if (matchMedia('(pointer: coarse)').matches) enable();
  else addEventListener('touchstart', enable, { once: true, passive: true });
})();
