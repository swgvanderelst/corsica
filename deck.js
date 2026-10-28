// Swipe deck: drag with physics (rotation, velocity, spring-back), buttons, undo. DOM only; the app decides what a swipe means.
// cards: [{id, ...}], render(card) -> inner HTML of a card, onSwipe(card, value), onUndo(card, value), onChange(index)
const FLY_MS = 300;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

export function createDeck(root, { cards, render, onSwipe, onUndo, onChange, start = 0 }) {
  let index = start;
  const history = []; // [{card, value}] swipes of this session, for undo
  let busy = false, drag = null, dead = false;

  const cardEl = (card, pos) => {
    const el = document.createElement('div');
    el.className = 'swcard';
    el.dataset.id = card.id;
    el.dataset.pos = String(pos);
    el.innerHTML = render(card) + '<div class="stamp like">LEUK</div><div class="stamp nope">NIET</div><div class="stamp sup">SUPER</div>';
    return el;
  };
  function paint() {
    root.innerHTML = '';
    const visible = cards.slice(index, index + 3);
    if (!visible.length) { root.innerHTML = '<div class="deck-empty"></div>'; return; }
    // back to front: the first card is on top
    for (let i = visible.length - 1; i >= 0; i--) root.appendChild(cardEl(visible[i], i));
    attach(top());
  }
  const top = () => root.querySelector('.swcard[data-pos="0"]');
  const stamps = (el, x, y) => {
    const up = -y > Math.abs(x) * 1.2;
    el.querySelector('.like').style.opacity = up ? 0 : clamp(x / 110, 0, 1);
    el.querySelector('.nope').style.opacity = up ? 0 : clamp(-x / 110, 0, 1);
    el.querySelector('.sup').style.opacity = up ? clamp(-y / 110, 0, 1) : 0;
  };
  const pose = (el, x, y, anim) => {
    el.style.transition = anim || 'none';
    el.style.transform = `translate(${x}px, ${y}px) rotate(${x / 18}deg)`;
    stamps(el, x, y);
  };
  const promote = () => { // the cards behind move up one place
    root.querySelectorAll('.swcard').forEach(e => { const p = +e.dataset.pos; if (p > 0) e.dataset.pos = String(p - 1); });
  };

  function attach(el) {
    if (!el) return;
    el.addEventListener('pointerdown', e => {
      if (busy || dead || e.button > 0) return;
      el.setPointerCapture(e.pointerId);
      drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: 0, y: 0, samples: [[e.timeStamp, 0, 0]] };
      el.classList.add('dragging');
      el.style.transition = 'none';
    });
    el.addEventListener('pointermove', e => {
      if (!drag || drag.id !== e.pointerId) return;
      drag.x = e.clientX - drag.x0; drag.y = e.clientY - drag.y0;
      drag.samples.push([e.timeStamp, drag.x, drag.y]);
      if (drag.samples.length > 5) drag.samples.shift();
      pose(el, drag.x, drag.y);
    });
    const end = e => {
      if (!drag || drag.id !== e.pointerId) return;
      const d = drag; drag = null;
      el.classList.remove('dragging');
      const a = d.samples[0], b = d.samples[d.samples.length - 1];
      const dt = Math.max(1, b[0] - a[0]);
      const vx = (b[1] - a[1]) / dt, vy = (b[2] - a[2]) / dt; // px per ms
      const w = root.clientWidth || 360;
      const sup = (d.y < -110 && -d.y > Math.abs(d.x) * 1.2) || (vy < -0.8 && d.y < -50 && -d.y > Math.abs(d.x));
      if (sup) return fly(el, 2, d.x, d.y, vx, vy);
      if (d.x > w * 0.28 || (vx > 0.6 && d.x > 40)) return fly(el, 1, d.x, d.y, vx, vy);
      if (d.x < -w * 0.28 || (vx < -0.6 && d.x < -40)) return fly(el, -1, d.x, d.y, vx, vy);
      pose(el, 0, 0, 'transform .38s cubic-bezier(.2, 1.5, .4, 1)'); // spring back with a little overshoot
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  function fly(el, value, x, y, vx = 0, vy = 0) {
    if (busy) return;
    busy = true;
    const w = root.clientWidth || 360, h = root.clientHeight || 480;
    const card = cards[index];
    const tx = value === 2 ? x + vx * 200 : (value > 0 ? 1 : -1) * w * 1.4;
    const ty = value === 2 ? -h * 1.3 : y + vy * 200 + 30;
    el.style.transition = `transform ${FLY_MS}ms cubic-bezier(.3, .6, .5, 1), opacity ${FLY_MS}ms`;
    el.style.transform = `translate(${tx}px, ${ty}px) rotate(${value === 2 ? 0 : tx / 18}deg)`;
    el.querySelector(value === 1 ? '.like' : value === -1 ? '.nope' : '.sup').style.opacity = 1;
    el.dataset.pos = 'out';
    promote();
    history.push({ card, value });
    index++;
    let done = false;
    const finish = () => {
      if (done) return; done = true;
      el.remove();
      busy = false;
      if (dead) return;
      const nextTop = top();
      if (nextTop) attach(nextTop);
      const next = cards[index + 2]; // keep three cards in the stack
      if (next) root.insertBefore(cardEl(next, 2), root.firstChild);
      onSwipe && onSwipe(card, value);
      onChange && onChange(index);
    };
    el.addEventListener('transitionend', finish, { once: true });
    setTimeout(finish, FLY_MS + 80);
  }

  paint();
  return {
    get index() { return index; },
    get canUndo() { return history.length > 0 && !busy; },
    get busy() { return busy; },
    swipe(value) { const el = top(); if (el && !busy && !dead) fly(el, value, 0, 0); },
    undo() {
      if (busy || dead || !history.length) return false;
      const { card, value } = history.pop();
      index--;
      // the undone card comes back from the side it left
      root.querySelectorAll('.swcard').forEach(e => { e.dataset.pos = String(+e.dataset.pos + 1); });
      const back = root.querySelectorAll('.swcard[data-pos="3"]'); back.forEach(e => e.remove());
      const el = cardEl(card, 0);
      root.appendChild(el);
      pose(el, value === 2 ? 0 : value * 320, value === 2 ? -400 : 0);
      el.getBoundingClientRect(); // commit the start pose
      pose(el, 0, 0, 'transform .35s cubic-bezier(.2, .9, .3, 1)');
      attach(el);
      onUndo && onUndo(card, value);
      onChange && onChange(index);
      return true;
    },
    destroy() { dead = true; root.innerHTML = ''; },
  };
}
