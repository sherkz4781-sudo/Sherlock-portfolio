(function () {
  var root = document.documentElement;
  var themeToggle = document.getElementById('theme-toggle');
  var stored = localStorage.getItem('theme');

  if (stored === 'dark') root.setAttribute('data-theme', 'dark');

  themeToggle.addEventListener('click', function () {
    var isDark = root.getAttribute('data-theme') === 'dark';
    if (isDark) {
      root.removeAttribute('data-theme');
      localStorage.setItem('theme', 'light');
    } else {
      root.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
    }
  });

  var menuToggle = document.getElementById('menu-toggle');
  var mobileNav = document.getElementById('mobile-nav');

  menuToggle.addEventListener('click', function () {
    var isOpen = mobileNav.classList.toggle('is-open');
    menuToggle.setAttribute('aria-expanded', String(isOpen));
  });

  mobileNav.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', function () {
      mobileNav.classList.remove('is-open');
      menuToggle.setAttribute('aria-expanded', 'false');
    });
  });

  document.querySelectorAll('[data-svc]').forEach(function (row) {
    var button = row.querySelector('[data-svc-toggle]');
    button.addEventListener('click', function () {
      var isOpen = row.classList.toggle('is-open');
      button.setAttribute('aria-expanded', String(isOpen));
    });
  });

  document.querySelectorAll('[data-reveal-group]').forEach(function (group) {
    var items = group.querySelectorAll(':scope > .reveal-drop, :scope > .reveal-left, :scope > .reveal-right, :scope > .reveal-pop');
    items.forEach(function (el, i) {
      el.style.transitionDelay = (i * 0.3) + 's';
    });
  });

  var revealEls = document.querySelectorAll('.reveal-drop, .reveal-left, .reveal-right, .reveal-pop');
  if ('IntersectionObserver' in window) {
    // A reveal's own transform (translateX/Y) shifts its bounding box while
    // animating, which can make the observer re-fire mid-transition and
    // report a false "left the viewport" — toggling the element back off
    // and leaving it stuck invisible. Debounce the "remove" side only, so a
    // momentary flicker during the reveal doesn't cancel it, while a real
    // scroll-away (which stays non-intersecting well past the debounce
    // window) still clears it for replay.
    var pendingHide = new WeakMap();
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var el = entry.target;
        var pending = pendingHide.get(el);
        if (pending) clearTimeout(pending);
        if (entry.isIntersecting) {
          pendingHide.delete(el);
          el.classList.add('in-view');
        } else {
          pendingHide.set(el, setTimeout(function () {
            el.classList.remove('in-view');
            pendingHide.delete(el);
          }, 200));
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -5% 0px' });
    revealEls.forEach(function (el) { revealObserver.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('in-view'); });
  }

  // Sync each workflow dot's pulse to the moment the traveling glow passes it.
  // Uses offsetLeft (layout position) rather than getBoundingClientRect (painted
  // position), because the .reveal-left/.reveal-right labels carry a pre-reveal
  // translateX transform that would otherwise throw off the measured order.
  // Note: that same transform makes each label its dot's offsetParent, so a
  // dot's own offsetLeft is only its position *within* the label (constant
  // across pills) — the label's offsetLeft (its position within .workflow-items)
  // has to be added back in to get the dot's true position along the track.
  function syncWorkflowPulses() {
    document.querySelectorAll('.workflow').forEach(function (track) {
      var duration = parseFloat(getComputedStyle(track).getPropertyValue('--flow-duration')) || 12;
      var trackWidth = track.offsetWidth;
      var items = track.querySelector('.workflow-items');
      var itemsOffset = items ? items.offsetLeft : 0;
      track.querySelectorAll('.workflow-dot').forEach(function (dot) {
        var label = dot.parentElement;
        var centerX = itemsOffset + label.offsetLeft + dot.offsetLeft + dot.offsetWidth / 2;
        var centerPercent = (centerX / trackWidth) * 100;
        var delay = duration * (centerPercent + 12.5) / 125;
        dot.classList.add('pulse-sync');
        dot.style.animationDuration = duration + 's';
        dot.style.animationDelay = delay + 's';
      });
    });
  }
  syncWorkflowPulses();
  // Web fonts swap in after this script runs, shifting pill widths slightly;
  // recompute once they're actually loaded so the sync stays accurate.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(syncWorkflowPulses);
  }

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(syncWorkflowPulses, 200);
  });

  // Service-card illustrations: an SVG connector line (+ traveling glow/beam)
  // drawn between measured node positions. Two shapes share the same drawing
  // helpers — a trigger->hub->parallel-outputs diagram (Workflow Automation)
  // and a single-row chain of circular nodes (Lead Generation).
  (function () {
    var svcReduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var SVGNS = 'http://www.w3.org/2000/svg';

    // Both diagrams are strict relays now (flash a tile once its incoming
    // beam arrives, then the outgoing beam departs) — each just needs its own
    // one-shot flash keyframes matching its tile's own rest box-shadow style
    // (the hub's square icons are inset; the chain's circles are raised).
    var SVC_ICON_REST = 'inset 3px 3px 6px var(--shadow-dark), inset -3px -3px 6px var(--shadow-light)';
    var SVC_ICON_FLASH = [
      { transform: 'scale(1)', boxShadow: SVC_ICON_REST, offset: 0 },
      { transform: 'scale(1.14)', boxShadow: '0 0 18px 5px var(--accent), ' + SVC_ICON_REST, offset: 0.35 },
      { transform: 'scale(1)', boxShadow: SVC_ICON_REST, offset: 1 }
    ];
    var SVC_CIRCLE_REST = '7px 7px 14px var(--shadow-dark), -7px -7px 14px var(--shadow-light)';
    var SVC_CIRCLE_FLASH = [
      { transform: 'scale(1)', boxShadow: SVC_CIRCLE_REST, offset: 0 },
      { transform: 'scale(1.14)', boxShadow: '0 0 18px 5px var(--accent), ' + SVC_CIRCLE_REST, offset: 0.35 },
      { transform: 'scale(1)', boxShadow: SVC_CIRCLE_REST, offset: 1 }
    ];
    // The CRM wheel's circles are a different (bigger, 96px) size than the
    // chain's 52px circles, so they rest at a deeper shadow — reusing
    // SVC_CIRCLE_FLASH's rest value here would make the flash settle back to
    // the wrong shadow depth every time.
    var SVC_WHEEL_CIRCLE_REST = '9px 9px 20px var(--shadow-dark), -9px -9px 20px var(--shadow-light)';
    var SVC_WHEEL_CIRCLE_FLASH = [
      { transform: 'scale(1)', boxShadow: SVC_WHEEL_CIRCLE_REST, offset: 0 },
      { transform: 'scale(1.14)', boxShadow: '0 0 18px 5px var(--accent), ' + SVC_WHEEL_CIRCLE_REST, offset: 0.35 },
      { transform: 'scale(1)', boxShadow: SVC_WHEEL_CIRCLE_REST, offset: 1 }
    ];
    // The brain avatar's glow deliberately has no transform — any scale reads
    // as the whole hub "moving," which was tried and explicitly rejected in
    // favor of a stationary hub that only glows (box-shadow only, teal to
    // match the AI chip's own border/text color, which itself stays fully
    // inert — the chip was also asked to be made stationary).
    var SVC_BRAIN_REST = '13px 13px 27px var(--shadow-dark), -13px -13px 27px var(--shadow-light)';
    var SVC_BRAIN_FLASH = [
      { boxShadow: SVC_BRAIN_REST, offset: 0 },
      { boxShadow: '0 0 26px 7px hsl(200, 80%, 48%), ' + SVC_BRAIN_REST, offset: 0.35 },
      { boxShadow: SVC_BRAIN_REST, offset: 1 }
    ];

    function svcPoint(el, side, canvasRect) {
      var r = el.getBoundingClientRect();
      var x, y;
      if (side === 'top' || side === 'bottom') {
        x = r.left + r.width / 2;
        y = side === 'bottom' ? r.bottom : r.top;
      } else {
        x = side === 'right' ? r.right : r.left;
        y = r.top + r.height / 2;
      }
      return { x: x - canvasRect.left, y: y - canvasRect.top };
    }

    function svcCurve(a, b) {
      var midX = (a.x + b.x) / 2;
      return 'M ' + a.x + ' ' + a.y + ' C ' + midX + ' ' + a.y + ', ' + midX + ' ' + b.y + ', ' + b.x + ' ' + b.y;
    }

    // Draws a static background line plus a beam path (the one svcTravelSegment
    // animates) along the same curve. Shared by every diagram type so the beam
    // always looks and behaves identically regardless of the layout shape.
    function svcMakeBeam(svg, d) {
      var line = document.createElementNS(SVGNS, 'path');
      line.setAttribute('d', d);
      line.setAttribute('class', 'connector-line');
      svg.appendChild(line);

      var beam = document.createElementNS(SVGNS, 'path');
      beam.setAttribute('d', d);
      beam.setAttribute('class', 'connector-beam');
      beam.style.opacity = '0';
      svg.appendChild(beam);
      return beam;
    }

    // A small static dot at a connector's bend/midpoint (used by the CRM
    // wheel, echoing its original reference image's joint-dot detail).
    function svcMakeJoint(svg, a, b) {
      var dot = document.createElementNS(SVGNS, 'circle');
      dot.setAttribute('cx', (a.x + b.x) / 2);
      dot.setAttribute('cy', (a.y + b.y) / 2);
      dot.setAttribute('r', 3.5);
      dot.setAttribute('class', 'connector-joint');
      svg.appendChild(dot);
    }

    function svcChainCurve(pts) {
      var d = 'M ' + pts[0].x + ' ' + pts[0].y;
      for (var i = 0; i < pts.length - 1; i++) {
        var a = pts[i], b = pts[i + 1];
        var midX = (a.x + b.x) / 2;
        d += ' C ' + midX + ' ' + a.y + ', ' + midX + ' ' + b.y + ', ' + b.x + ' ' + b.y;
      }
      return d;
    }

    function svcPrepSvg(canvas, svg) {
      var canvasRect = canvas.getBoundingClientRect();
      svg.setAttribute('width', canvasRect.width);
      svg.setAttribute('height', canvasRect.height);
      svg.setAttribute('viewBox', '0 0 ' + canvasRect.width + ' ' + canvasRect.height);
      svg.innerHTML = '';
      return canvasRect;
    }

    function svcLayoutHub(canvas) {
      var svg = canvas.querySelector('svg.connectors');
      if (!svg || getComputedStyle(svg).display === 'none') return;
      var canvasRect = svcPrepSvg(canvas, svg);

      var trigger = canvas.querySelector('.node--trigger');
      var hub = canvas.querySelector('.node--hub');
      var outputs = Array.prototype.slice.call(canvas.querySelectorAll('.node--output'));
      if (!trigger || !hub) return;

      var hubIn = svcPoint(hub, 'left', canvasRect);
      var hubOut = svcPoint(hub, 'right', canvasRect);
      var triggerOut = svcPoint(trigger, 'right', canvasRect);

      var triggerBeam = svcMakeBeam(svg, svcCurve(triggerOut, hubIn));
      var outputBeams = outputs.map(function (out) {
        return svcMakeBeam(svg, svcCurve(hubOut, svcPoint(out, 'left', canvasRect)));
      });

      if (svcReduceMotion) return;

      // Same strict-relay pattern as the Lead Generation chain (flash a tile,
      // then its outgoing beam departs, and the next tile only flashes once
      // that beam actually arrives) — adapted for the hub's branching shape:
      // trigger->hub is one hop, but hub->outputs fans out to three beams at
      // once, each flashing its own output the moment it individually lands.
      if (canvas._svcRelayToken) canvas._svcRelayToken.cancelled = true;
      var token = { cancelled: false };
      canvas._svcRelayToken = token;

      (async function relay() {
        while (!token.cancelled) {
          await svcFlashOnce(trigger.querySelector('.icon'), SVC_ICON_FLASH);
          if (token.cancelled) return;
          await new Promise(function (r) { setTimeout(r, SVC_PAUSE_MS); });
          if (token.cancelled) return;
          await svcTravelSegment(triggerBeam);
          if (token.cancelled) return;

          await svcFlashOnce(hub.querySelector('.icon'), SVC_ICON_FLASH);
          if (token.cancelled) return;
          await new Promise(function (r) { setTimeout(r, SVC_PAUSE_MS); });
          if (token.cancelled) return;
          await Promise.all(outputBeams.map(function (beam, idx) {
            return svcTravelSegment(beam).then(function () {
              if (token.cancelled) return;
              return svcFlashOnce(outputs[idx].querySelector('.icon'), SVC_ICON_FLASH);
            });
          }));
          if (token.cancelled) return;

          // Wrapped past the outputs — pause, then restart from the trigger.
          await new Promise(function (r) { setTimeout(r, SVC_GLOW_MS); });
          if (token.cancelled) return;
        }
      })();
    }

    // Lead Generation is a strict relay, not one continuous sweep: glow node 0,
    // THEN travel to node 1, THEN glow node 1 (only once the travel finishes),
    // THEN travel to node 2, and so on back around to node 0. Each step waits
    // for the previous one to actually finish (via Animation.onfinish), rather
    // than everything being pre-scheduled against a fixed total duration.
    // Scaled so one full 10-node relay loop takes ~16s total (sped up from
    // the prior ~20s pass, per user preference — measured the real ~24s-era
    // total via 10*glow + 9*pause + 9*travel + wrapPause = 23985ms, then
    // scaled glow, pause, and the travel floor+multiplier all by the same
    // 16000/23985 factor together — see the comment on svcTravelSegment for
    // the travel side of that scaling).
    var SVC_GLOW_MS = 751;
    var SVC_PAUSE_MS = 250; // brief hold after a glow before the beam departs

    function svcFlashOnce(tile, keyframes) {
      return new Promise(function (resolve) {
        if (tile._svcPulse) tile._svcPulse.cancel();
        var anim = tile.animate(keyframes, { duration: SVC_GLOW_MS, easing: 'ease-out' });
        tile._svcPulse = anim;
        anim.onfinish = function () { resolve(); };
      });
    }

    function svcTravelSegment(segEl) {
      return new Promise(function (resolve) {
        var len = segEl.getTotalLength();
        var dash = Math.max(28, len * 0.4);
        // Floor+multiplier scaled by the same 16000/23985 factor as
        // SVC_GLOW_MS/SVC_PAUSE_MS to hit the ~16s-total-loop target.
        var travelDuration = Math.max(610, len * 1.5);
        segEl.style.strokeDasharray = dash + ' ' + Math.max(len, 1);
        segEl.style.opacity = '1';
        if (segEl._svcTravel) segEl._svcTravel.cancel();
        // Offset only needs to reach -len: once the dash's leading edge hits
        // the path end, the whole dash has already exited (it started fully
        // visible from the head, and the gap is >= len so nothing wraps back
        // in). Animating past -len to -(len + dash) used to burn the last
        // ~dash/(len+dash) of travelDuration on a fully invisible tail while
        // the relay sat there awaiting onfinish before letting the
        // destination node flash — a real, visible stutter between the beam
        // arriving and the next glow starting. Stopping exactly at -len keeps
        // travelDuration (and therefore the calibrated ~24s loop total)
        // unchanged, it just spends all of it on visible motion.
        var anim = segEl.animate(
          [{ strokeDashoffset: 0 }, { strokeDashoffset: -len }],
          { duration: travelDuration, easing: 'linear' }
        );
        segEl._svcTravel = anim;
        anim.onfinish = function () {
          segEl.style.opacity = '0';
          resolve();
        };
      });
    }

    // CRM wheel (CRM Setup): a Brain Avatar hub with 9 circle nodes on a ring
    // around it. Unlike the other two diagrams, this one is authored at a
    // fixed design size (1000x760) and made responsive by scaling the whole
    // thing down via CSS transform rather than recomputing every position —
    // simpler and correct here specifically because every element is already
    // positioned in fixed design-space pixels (trig, not CSS flow), so a
    // uniform scale keeps every relationship intact. Positions/connectors are
    // built once (canvas._svcWheelBuilt guards against rebuilding on every
    // resize/fonts-ready/toggle call); only the scale is recomputed each time.
    function svcLayoutWheel(canvas) {
      var svg = canvas.querySelector('svg.connectors');
      if (!svg || getComputedStyle(svg).display === 'none') return;
      var viewport = canvas.querySelector('.wheel-viewport');
      var wrap = canvas.querySelector('.wheel-wrap');
      var hub = canvas.querySelector('.brain-avatar');
      var nodes = Array.prototype.slice.call(canvas.querySelectorAll('.wheel-node'));
      if (!viewport || !wrap || !hub || !nodes.length) return;

      var DESIGN_W = 1000, DESIGN_H = 760;
      var scale = Math.min(1, canvas.getBoundingClientRect().width / DESIGN_W);
      wrap.style.transform = 'translateX(-50%) scale(' + scale + ')';
      viewport.style.height = (DESIGN_H * scale) + 'px';

      if (canvas._svcWheelBuilt) return;
      canvas._svcWheelBuilt = true;

      svg.setAttribute('width', DESIGN_W);
      svg.setAttribute('height', DESIGN_H);
      svg.setAttribute('viewBox', '0 0 ' + DESIGN_W + ' ' + DESIGN_H);

      var CENTER_X = DESIGN_W / 2, CENTER_Y = DESIGN_H / 2;
      var HUB_R = 101, CIRCLE_R = 48, NODE_R = 190;
      var LINE_INNER = HUB_R + 8;
      var LINE_OUTER = NODE_R - CIRCLE_R - 8;

      var beams = nodes.map(function (node, i) {
        var angle = (i / nodes.length) * 2 * Math.PI - Math.PI / 2;
        var dx = NODE_R * Math.cos(angle);
        var dy = NODE_R * Math.sin(angle);
        node.style.left = (CENTER_X + dx) + 'px';
        node.style.top = (CENTER_Y + dy) + 'px';
        node.setAttribute('data-side', dx >= 0 ? 'right' : 'left');

        var p1 = { x: CENTER_X + LINE_INNER * Math.cos(angle), y: CENTER_Y + LINE_INNER * Math.sin(angle) };
        var p2 = { x: CENTER_X + LINE_OUTER * Math.cos(angle), y: CENTER_Y + LINE_OUTER * Math.sin(angle) };
        var beam = svcMakeBeam(svg, 'M ' + p1.x + ' ' + p1.y + ' L ' + p2.x + ' ' + p2.y);
        svcMakeJoint(svg, p1, p2);
        return beam;
      });

      if (svcReduceMotion) return;

      function shuffledOrder(n) {
        var a = [];
        for (var i = 0; i < n; i++) a.push(i);
        for (var i = a.length - 1; i > 0; i--) {
          var j = Math.floor(Math.random() * (i + 1));
          var t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
      }

      // Every node connects straight to the hub (no node-to-node adjacency
      // like the chain diagram), so there's no natural fixed order to relay
      // through — a fresh shuffled visiting order each lap fits this shape
      // specifically, unlike the other two diagrams' deliberate fixed order.
      (async function relay() {
        while (true) {
          var order = shuffledOrder(nodes.length);
          for (var k = 0; k < order.length; k++) {
            var idx = order[k];
            await svcFlashOnce(hub, SVC_BRAIN_FLASH);
            await new Promise(function (r) { setTimeout(r, SVC_PAUSE_MS); });
            await svcTravelSegment(beams[idx]);
            await svcFlashOnce(nodes[idx].querySelector('.circle'), SVC_WHEEL_CIRCLE_FLASH);
            await new Promise(function (r) { setTimeout(r, SVC_PAUSE_MS); });
          }
        }
      })();
    }

    function svcLayoutChain(canvas) {
      var svg = canvas.querySelector('svg.connectors');
      if (!svg || getComputedStyle(svg).display === 'none') return;
      var canvasRect = svcPrepSvg(canvas, svg);

      var nodes = Array.prototype.slice.call(canvas.querySelectorAll('.circle-node'));
      if (!nodes.length) return;
      var pts = nodes.map(function (el) {
        var r = el.querySelector('.circle').getBoundingClientRect();
        return { x: r.left + r.width / 2 - canvasRect.left, y: r.top + r.height / 2 - canvasRect.top };
      });

      var segEls = [];
      for (var i = 0; i < pts.length - 1; i++) {
        segEls.push(svcMakeBeam(svg, svcCurve(pts[i], pts[i + 1])));
      }

      if (svcReduceMotion) return;

      // A previous svcLayoutChain call on this same canvas (resize, accordion
      // toggle, fonts-ready) left a relay loop running against now-detached
      // path elements — stop it so two relays never run concurrently and
      // double-flash the (still-shared) node circles.
      if (canvas._svcRelayToken) canvas._svcRelayToken.cancelled = true;
      var token = { cancelled: false };
      canvas._svcRelayToken = token;

      (async function relay() {
        var i = 0;
        while (!token.cancelled) {
          await svcFlashOnce(nodes[i].querySelector('.circle'), SVC_CIRCLE_FLASH);
          if (token.cancelled) return;
          var nextIndex = (i + 1) % nodes.length;
          if (nextIndex !== 0) {
            await new Promise(function (r) { setTimeout(r, SVC_PAUSE_MS); });
            if (token.cancelled) return;
            await svcTravelSegment(segEls[i]);
            if (token.cancelled) return;
          } else {
            // Wrapped past the last node — pause, then restart the whole
            // relay from Lead Source (no connector to travel back along).
            await new Promise(function (r) { setTimeout(r, SVC_GLOW_MS); });
            if (token.cancelled) return;
          }
          i = nextIndex;
        }
      })();
    }

    function svcLayoutAll() {
      document.querySelectorAll('.svc-diagram .canvas--zigzag').forEach(svcLayoutChain);
      document.querySelectorAll('.svc-diagram .canvas--wheel').forEach(svcLayoutWheel);
      document.querySelectorAll('.svc-diagram .canvas:not(.canvas--zigzag):not(.canvas--wheel)').forEach(svcLayoutHub);
    }

    if (document.querySelector('.svc-diagram')) {
      svcLayoutAll();
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(svcLayoutAll);
      var svcResizeTimer;
      window.addEventListener('resize', function () {
        clearTimeout(svcResizeTimer);
        svcResizeTimer = setTimeout(svcLayoutAll, 150);
      });
      // A collapsed accordion row still lays out its content at full size
      // (overflow:hidden clips paint, not layout), so the initial call above
      // already measures correctly — this just re-confirms after the
      // max-height transition in case a browser's timing differs.
      document.querySelectorAll('.svc-acc-row.has-diagram [data-svc-toggle]').forEach(function (btn) {
        btn.addEventListener('click', function () { setTimeout(svcLayoutAll, 320); });
      });
    }
  })();

  // Colorful smoke cursor trail: a canvas particle system. Puffs spawn on
  // mouse movement, drift upward, expand, and fade like smoke, in a cool
  // cyan/teal/blue palette.
  var canvas = document.querySelector('.smoke-cursor');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  if (canvas && !reduceMotion && !coarsePointer && canvas.getContext) {
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var particles = [];
    var lastX = null, lastY = null;
    var MAX_PARTICLES = 220;

    function resize() {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    function spawn(x, y) {
      var count = 2 + Math.floor(Math.random() * 2);
      for (var i = 0; i < count; i++) {
        var angle = Math.random() * Math.PI * 2;
        var speed = 0.3 + Math.random() * 0.8;
        particles.push({
          x: x + (Math.random() - 0.5) * 10,
          y: y + (Math.random() - 0.5) * 10,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 0.4,
          r: 30 + Math.random() * 30,
          maxR: 102 + Math.random() * 90,
          hue: 185 + Math.random() * 30,
          sat: 70 + Math.random() * 20,
          light: 45 + Math.random() * 25,
          age: 0,
          life: 900 + Math.random() * 500
        });
      }
      if (particles.length > MAX_PARTICLES) {
        particles.splice(0, particles.length - MAX_PARTICLES);
      }
    }

    document.addEventListener('mousemove', function (e) {
      if (lastX === null) {
        spawn(e.clientX, e.clientY);
      } else {
        var dx = e.clientX - lastX, dy = e.clientY - lastY;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var steps = Math.min(Math.ceil(dist / 14), 6);
        for (var s = 1; s <= steps; s++) {
          spawn(lastX + (dx * s) / steps, lastY + (dy * s) / steps);
        }
      }
      lastX = e.clientX;
      lastY = e.clientY;
    }, { passive: true });

    document.addEventListener('mouseleave', function () {
      lastX = null;
      lastY = null;
    });

    var lastTime = performance.now();
    function tick(now) {
      var dt = Math.min(now - lastTime, 48);
      lastTime = now;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'lighter';

      for (var i = particles.length - 1; i >= 0; i--) {
        var p = particles[i];
        p.age += dt;
        var t = p.age / p.life;
        if (t >= 1) {
          particles.splice(i, 1);
          continue;
        }
        p.x += p.vx * (dt / 16);
        p.y += p.vy * (dt / 16);
        p.vx *= 0.985;
        p.vy = p.vy * 0.985 - 0.006 * (dt / 16);
        var radius = p.r + (p.maxR - p.r) * t;
        var alpha = 0.05 * (1 - t) * (1 - t);

        var grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
        grd.addColorStop(0, 'hsla(' + p.hue + ', ' + p.sat + '%, ' + p.light + '%, ' + alpha + ')');
        grd.addColorStop(1, 'hsla(' + p.hue + ', ' + p.sat + '%, ' + p.light + '%, 0)');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
})();
