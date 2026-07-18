/**
 * TrayPhysics — movimiento + rebote dentro de la bandeja (solo UI)
 * Responsabilidades:
 * - Posicionar dados en modo absoluto durante la tirada
 * - Simular rebote contra bordes por un tiempo fijo
 */
(function () {
  'use strict';

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  function rand(min, max) {
    return Math.random() * (max - min) + min;
  }

  function now() {
    return (window.performance && performance.now) ? performance.now() : Date.now();
  }

  function rectRelTo(rect, baseRect) {
    return {
      x: rect.left - baseRect.left,
      y: rect.top - baseRect.top,
      w: rect.width,
      h: rect.height,
    };
  }

  function applyFlipSettle(trayEl, nodes, settleMs) {
    const duration = clamp(Number(settleMs || 420), 120, 2000);
    const trayRect = trayEl.getBoundingClientRect();

    const first = nodes.map(function (n) {
      return rectRelTo(n.getBoundingClientRect(), trayRect);
    });

    // volver al layout normal (grid)
    trayEl.classList.remove('rd-tray--physics');

    // IMPORTANTE: limpiar transforms de física antes de medir "last"
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      n.style.transition = 'transform 0ms';
      n.style.transform = 'none';
    }

    // forzar layout para obtener posiciones finales reales (sin transforms)
    // eslint-disable-next-line no-unused-expressions
    trayEl.offsetHeight;
    const trayRect2 = trayEl.getBoundingClientRect();
    const last = nodes.map(function (n) {
      return rectRelTo(n.getBoundingClientRect(), trayRect2);
    });

    // aplicar transform invertido (sin transición) y luego animar a 0
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const dx = first[i].x - last[i].x;
      const dy = first[i].y - last[i].y;
      n.style.willChange = 'transform';
      n.style.transition = 'transform 0ms';
      n.style.transform = 'translate3d(' + dx + 'px,' + dy + 'px,0)';
    }

    window.requestAnimationFrame(function () {
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        n.style.transition = 'transform ' + duration + 'ms ease';
        n.style.transform = 'translate3d(0,0,0)';

        const cleanup = function () {
          n.style.transition = '';
          n.style.transform = '';
          n.style.willChange = '';
          n.removeEventListener('transitionend', cleanup);
        };
        n.addEventListener('transitionend', cleanup);
        // fallback por si no dispara transitionend
        window.setTimeout(cleanup, duration + 80);
      }
    });
  }

  function run(options) {
    options = options || {};
    const trayEl = options.trayEl;
    const diceNodes = options.diceNodes || [];
    const durationMs = clamp(Number(options.durationMs || 1800), 200, 12000);

    if (!trayEl || !diceNodes.length) return { stop: function () {} };

    // Preparar modo physics (CSS cambia a display:block y los dados a absolute)
    trayEl.classList.add('rd-tray--physics-prep');
    trayEl.classList.add('rd-tray--physics');

    const trayRect = trayEl.getBoundingClientRect();
    const pad = 6;
    const w = Math.max(80, trayRect.width) - pad * 2;
    const h = Math.max(80, trayRect.height) - pad * 2;

    const placed = [];
    function placeNonOverlapping(bw, bh, r) {
      const maxX = Math.max(0, w - bw);
      const maxY = Math.max(0, h - bh);
      const attempts = 90;
      for (let a = 0; a < attempts; a++) {
        const x = rand(0, maxX);
        const y = rand(0, maxY);
        const cx = x + bw / 2;
        const cy = y + bh / 2;
        let ok = true;
        for (let i = 0; i < placed.length; i++) {
          const p = placed[i];
          const dx = cx - p.cx;
          const dy = cy - p.cy;
          const min = (r + p.r) * 1.02;
          if ((dx * dx + dy * dy) < (min * min)) { ok = false; break; }
        }
        if (ok) {
          placed.push({ cx: cx, cy: cy, r: r });
          return { x: x, y: y };
        }
      }
      // fallback (si hay muchos dados grandes): permitir solape mínimo
      const x = rand(0, maxX);
      const y = rand(0, maxY);
      placed.push({ cx: x + bw / 2, cy: y + bh / 2, r: r });
      return { x: x, y: y };
    }

    const bodies = diceNodes.map(function (node) {
      const r = node.getBoundingClientRect();
      const bw = Math.max(30, r.width);
      const bh = Math.max(30, r.height);
      const radius = Math.max(14, Math.min(bw, bh) / 2);

      // posiciones iniciales aleatorias SIN solapar (reintentos)
      const p0 = placeNonOverlapping(bw, bh, radius);
      const x = p0.x;
      const y = p0.y;

      // velocidades (px/ms)
      const vx = rand(-0.18, 0.18) || 0.12;
      const vy = rand(-0.14, 0.14) || -0.10;

      node.style.willChange = 'transform';
      // MUY IMPORTANTE: aplicar posición inicial ya, para que no se vean superpuestos en (0,0)
      node.style.transform = 'translate3d(' + (pad + x) + 'px,' + (pad + y) + 'px,0)';

      return {
        node: node,
        bw: bw,
        bh: bh,
        r: radius,
        x: x,
        y: y,
        vx: vx,
        vy: vy,
      };
    });

    // mostrar después de haber posicionado
    window.requestAnimationFrame(function () {
      trayEl.classList.remove('rd-tray--physics-prep');
    });

    let raf = 0;
    let stopped = false;
    let loopEnded = false;
    let last = now();
    const start = last;

    function tick() {
      if (stopped) return;
      const t = now();
      const dt = clamp(t - last, 0, 40); // evita saltos grandes
      last = t;

      // integrar movimiento + colisión con paredes
      for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i];

        // amortiguación suave
        b.vx *= 0.998;
        b.vy *= 0.998;

        b.x += b.vx * dt;
        b.y += b.vy * dt;

        const maxX = Math.max(0, w - b.bw);
        const maxY = Math.max(0, h - b.bh);

        if (b.x <= 0) { b.x = 0; b.vx = Math.abs(b.vx); }
        if (b.x >= maxX) { b.x = maxX; b.vx = -Math.abs(b.vx); }
        if (b.y <= 0) { b.y = 0; b.vy = Math.abs(b.vy); }
        if (b.y >= maxY) { b.y = maxY; b.vy = -Math.abs(b.vy); }
      }

      // colisiones entre dados (aprox. círculos, O(n^2) pero n es pequeño)
      const restitution = 0.86; // “elasticidad”
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          const a = bodies[i];
          const b = bodies[j];

          const ax = a.x + a.bw / 2;
          const ay = a.y + a.bh / 2;
          const bx = b.x + b.bw / 2;
          const by = b.y + b.bh / 2;

          const dx = bx - ax;
          const dy = by - ay;
          const dist2 = dx * dx + dy * dy;
          const minDist = (a.r + b.r) * 0.96;
          if (dist2 <= 0.0001) continue;
          if (dist2 >= minDist * minDist) continue;

          const dist = Math.sqrt(dist2);
          const nx = dx / dist;
          const ny = dy / dist;

          // separar solapamiento
          const overlap = (minDist - dist);
          a.x -= nx * overlap * 0.5;
          a.y -= ny * overlap * 0.5;
          b.x += nx * overlap * 0.5;
          b.y += ny * overlap * 0.5;

          // resolver impulso si vienen acercándose
          const rvx = b.vx - a.vx;
          const rvy = b.vy - a.vy;
          const velAlong = rvx * nx + rvy * ny;
          if (velAlong > 0) continue;

          const jImpulse = -(1 + restitution) * velAlong / 2;
          const ix = jImpulse * nx;
          const iy = jImpulse * ny;
          a.vx -= ix;
          a.vy -= iy;
          b.vx += ix;
          b.vy += iy;
        }
      }

      // renderizar posiciones con translate (no left/top) para poder hacer FLIP al final
      for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i];
        b.node.style.transform = 'translate3d(' + (pad + b.x) + 'px,' + (pad + b.y) + 'px,0)';
      }

      if (t - start >= durationMs) {
        // Detener la simulación, pero NO hacer settle aquí; la UI decide cuándo asentar al grid
        loopEnded = true;
        if (raf) window.cancelAnimationFrame(raf);
        return;
      }
      raf = window.requestAnimationFrame(tick);
    }

    function stop(stopOptions) {
      if (stopped) return;
      stopped = true;
      if (raf) window.cancelAnimationFrame(raf);

      const opts = stopOptions || {};
      const settle = opts.settle !== false;
      const settleMs = clamp(Number(opts.settleMs || 460), 120, 2000);

      // limpiar squash pero mantener posición actual hasta hacer FLIP
      const nodes = bodies.map(function (b) {
        b.node.style.willChange = 'transform';
        return b.node;
      });

      if (settle) {
        // FLIP: animar desde la posición actual (absolute/transform) al grid final
        applyFlipSettle(trayEl, nodes, settleMs);
      } else {
        trayEl.classList.remove('rd-tray--physics');
        for (let i = 0; i < nodes.length; i++) {
          nodes[i].style.transform = '';
          nodes[i].style.willChange = '';
        }
      }
    }

    raf = window.requestAnimationFrame(tick);
    return { stop: stop };
  }

  window.TrayPhysics = { run: run };
})();

