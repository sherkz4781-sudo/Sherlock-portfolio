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

  // Below 1024px every service row shows its body permanently (see the
  // matching @media block in style.css) — the + button is hidden and
  // clicking the header is a no-op there, so aria-expanded should just
  // read true rather than tracking a toggle nobody can reach.
  var svcNarrowQuery = window.matchMedia('(max-width: 1023px)');
  document.querySelectorAll('[data-svc]').forEach(function (row) {
    var button = row.querySelector('[data-svc-toggle]');
    button.addEventListener('click', function () {
      if (svcNarrowQuery.matches) return;
      var isOpen = row.classList.toggle('is-open');
      button.setAttribute('aria-expanded', String(isOpen));
    });
  });
  function svcSyncAccordionAria() {
    if (!svcNarrowQuery.matches) return;
    document.querySelectorAll('[data-svc] [data-svc-toggle]').forEach(function (button) {
      button.setAttribute('aria-expanded', 'true');
    });
  }
  svcSyncAccordionAria();
  svcNarrowQuery.addEventListener('change', svcSyncAccordionAria);

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
    // Rest keyframes carry an invisible, non-inset placeholder shadow in the
    // same list slot the glow occupies at peak. Without it, the browser has
    // to interpolate an `inset` rest shadow into a non-inset glow shadow at
    // the same position — box-shadow can't blend across that inset/non-inset
    // mismatch, so it falls back to a hard discrete flip (glow snaps fully on
    // around the segment's halfway point, then snaps fully off) instead of
    // fading like the raised circle tiles do, whose rest shadow is already
    // non-inset and blends with the glow with no such mismatch.
    var SVC_ICON_GLOW_OFF = '0 0 0px 0px rgba(0, 0, 0, 0)';
    var SVC_ICON_FLASH = [
      { transform: 'scale(1)', boxShadow: SVC_ICON_GLOW_OFF + ', ' + SVC_ICON_REST, offset: 0 },
      { transform: 'scale(1.14)', boxShadow: '0 0 18px 5px var(--accent), ' + SVC_ICON_REST, offset: 0.35 },
      { transform: 'scale(1)', boxShadow: SVC_ICON_GLOW_OFF + ', ' + SVC_ICON_REST, offset: 1 }
    ];
    // The chain's circles, the wheel's circles, the brain avatar, and the AI
    // chip all render at a different size in compact mode than in the
    // desktop layout (see the .is-compact CSS overrides), so their resting
    // box-shadow differs by mode too. Baking a fixed REST string into these
    // keyframes (as the hub's icon tiles above do, since those genuinely
    // are the same size in both layouts) means every single flash — and
    // these loop continuously — snaps from whatever the CSS rest shadow
    // actually is to this hardcoded value and back, a visible "harsh" pop
    // on top of the intended glow. svcRestFlash reads the tile's live
    // computed box-shadow immediately before each flash instead, so it's
    // always correct for whatever mode/size is currently in effect.
    function svcRestFlash(tile, glowLayer, withScale) {
      var rest = getComputedStyle(tile).boxShadow;
      return withScale ? [
        { transform: 'scale(1)', boxShadow: rest, offset: 0 },
        { transform: 'scale(1.14)', boxShadow: glowLayer + ', ' + rest, offset: 0.35 },
        { transform: 'scale(1)', boxShadow: rest, offset: 1 }
      ] : [
        { boxShadow: rest, offset: 0 },
        { boxShadow: glowLayer + ', ' + rest, offset: 0.35 },
        { boxShadow: rest, offset: 1 }
      ];
    }
    var SVC_CIRCLE_GLOW = '0 0 18px 5px var(--accent)';
    var SVC_BRAIN_GLOW = '0 0 26px 7px hsl(200, 80%, 48%)';
    var SVC_CHIP_GLOW = '0 0 16px 4px hsl(200, 80%, 48%)';

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

    // Same S-curve as svcCurve but bowed through a midpoint Y instead of X —
    // used by the hub diagram's stacked (top-to-bottom) narrow layout, where
    // nodes connect top/bottom rather than left/right.
    function svcCurveV(a, b) {
      var midY = (a.y + b.y) / 2;
      return 'M ' + a.x + ' ' + a.y + ' C ' + a.x + ' ' + midY + ', ' + b.x + ' ' + midY + ', ' + b.x + ' ' + b.y;
    }

    // Matches the @container (max-width: 650px) breakpoint in style.css that
    // switches the hub and CRM-wheel diagrams to their stacked layouts.
    var SVC_STACK_WIDTH = 650;

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

      var stacked = canvasRect.width < SVC_STACK_WIDTH;
      var inSide = stacked ? 'top' : 'left';
      var outSide = stacked ? 'bottom' : 'right';
      var curve = stacked ? svcCurveV : svcCurve;

      var hubIn = svcPoint(hub, inSide, canvasRect);
      var hubOut = svcPoint(hub, outSide, canvasRect);
      var triggerOut = svcPoint(trigger, outSide, canvasRect);

      var triggerBeam = svcMakeBeam(svg, curve(triggerOut, hubIn));
      var outputBeams = outputs.map(function (out) {
        return svcMakeBeam(svg, curve(hubOut, svcPoint(out, inSide, canvasRect)));
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
    var SVC_GLOW_MS = 860;
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
      var chip = canvas.querySelector('.ai-chip');
      var nodes = Array.prototype.slice.call(canvas.querySelectorAll('.wheel-node'));
      if (!viewport || !wrap || !hub || !nodes.length) return;

      // Below SVC_STACK_WIDTH the desktop wheel's 1000x515 design would need
      // to shrink past the point its node labels stay legible. Rather than
      // dropping to a flat icon grid (the old behavior), it switches to a
      // "compact" mode: a smaller, taller design (see the .is-compact rules
      // in style.css for the matching hub/circle/label sizes) with nodes
      // arranged on an oval instead of a circle — the extra vertical room an
      // oval gives keeps same-side labels from colliding at this width,
      // while everything still reads as the same wheel-around-a-hub shape.
      // Mode is tracked separately from _svcWheelBuilt so a device rotation
      // crossing the threshold tears down whichever mode was built and lets
      // the other one start clean.
      var mode = canvas.getBoundingClientRect().width < SVC_STACK_WIDTH ? 'compact' : 'wheel';
      if (canvas._svcWheelMode !== mode) {
        if (canvas._svcRelayToken) canvas._svcRelayToken.cancelled = true;
        wrap.style.cssText = '';
        viewport.style.cssText = '';
        nodes.forEach(function (n) { n.style.cssText = ''; n.removeAttribute('data-side'); });
        svg.innerHTML = '';
        canvas._svcWheelBuilt = false;
        canvas._svcWheelMode = mode;
      }
      canvas.classList.toggle('is-compact', mode === 'compact');

      var DESIGN_W = mode === 'compact' ? 420 : 1000;
      var DESIGN_H = mode === 'compact' ? 330 : 515;
      var scale = Math.min(1, viewport.getBoundingClientRect().width / DESIGN_W);
      wrap.style.transform = 'translateX(-50%) scale(' + scale + ')';
      viewport.style.height = (DESIGN_H * scale) + 'px';

      if (canvas._svcWheelBuilt) return;
      canvas._svcWheelBuilt = true;

      svg.setAttribute('width', DESIGN_W);
      svg.setAttribute('height', DESIGN_H);
      svg.setAttribute('viewBox', '0 0 ' + DESIGN_W + ' ' + DESIGN_H);

      var CENTER_X = DESIGN_W / 2, CENTER_Y = DESIGN_H / 2;
      // HUB_R/CIRCLE_R must match the compact CSS's .brain-avatar/.circle
      // pixel sizes (halved) — they're only used here for connector math,
      // the visual sizes themselves live in style.css's .is-compact rules.
      var HUB_R = mode === 'compact' ? 76 : 101;
      var CIRCLE_R = mode === 'compact' ? 34 : 48;
      var NODE_RX = mode === 'compact' ? 122 : 190;
      var NODE_RY = mode === 'compact' ? 122 : 190;
      var LINE_INNER = HUB_R + 8;

      var beams = nodes.map(function (node, i) {
        var angle = (i / nodes.length) * 2 * Math.PI - Math.PI / 2;
        var dx = NODE_RX * Math.cos(angle);
        var dy = NODE_RY * Math.sin(angle);
        var dist = Math.sqrt(dx * dx + dy * dy);
        var ux = dx / dist, uy = dy / dist;
        node.style.left = (CENTER_X + dx) + 'px';
        node.style.top = (CENTER_Y + dy) + 'px';
        node.setAttribute('data-side', dx >= 0 ? 'right' : 'left');

        var lineOuter = dist - CIRCLE_R - 8;
        var p1 = { x: CENTER_X + LINE_INNER * ux, y: CENTER_Y + LINE_INNER * uy };
        var p2 = { x: CENTER_X + lineOuter * ux, y: CENTER_Y + lineOuter * uy };
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
            await Promise.all([
              svcFlashOnce(hub, svcRestFlash(hub, SVC_BRAIN_GLOW, false)),
              chip ? svcFlashOnce(chip, svcRestFlash(chip, SVC_CHIP_GLOW, false)) : Promise.resolve()
            ]);
            await new Promise(function (r) { setTimeout(r, SVC_PAUSE_MS); });
            await svcTravelSegment(beams[idx]);
            var wheelCircle = nodes[idx].querySelector('.circle');
            await svcFlashOnce(wheelCircle, svcRestFlash(wheelCircle, SVC_CIRCLE_GLOW, true));
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
          var chainCircle = nodes[i].querySelector('.circle');
          await svcFlashOnce(chainCircle, svcRestFlash(chainCircle, SVC_CIRCLE_GLOW, true));
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

  // Water ripple cursor trail: a canvas ring system. Ripples spawn as the
  // cursor moves and expand outward like disturbances on a water surface —
  // a bright crest ring plus a fainter trailing ring — easing out fast then
  // slow, and fading as they grow.
  var canvas = document.querySelector('.ripple-cursor');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  if (canvas && !reduceMotion && !coarsePointer && canvas.getContext) {
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var ripples = [];
    var lastSpawnX = null, lastSpawnY = null;
    var MAX_RIPPLES = 40;
    var SPAWN_SPACING = 26;

    function resize() {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    function spawn(x, y) {
      ripples.push({
        x: x,
        y: y,
        hue: 197 + Math.random() * 12,
        maxR: 44 + Math.random() * 24,
        age: 0,
        life: 2000 + Math.random() * 900
      });
      if (ripples.length > MAX_RIPPLES) {
        ripples.splice(0, ripples.length - MAX_RIPPLES);
      }
    }

    document.addEventListener('mousemove', function (e) {
      if (lastSpawnX === null) {
        spawn(e.clientX, e.clientY);
        lastSpawnX = e.clientX;
        lastSpawnY = e.clientY;
        return;
      }
      var dx = e.clientX - lastSpawnX, dy = e.clientY - lastSpawnY;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist >= SPAWN_SPACING) {
        var steps = Math.min(Math.floor(dist / SPAWN_SPACING), 4);
        for (var s = 1; s <= steps; s++) {
          spawn(lastSpawnX + (dx * s) / steps, lastSpawnY + (dy * s) / steps);
        }
        lastSpawnX = e.clientX;
        lastSpawnY = e.clientY;
      }
    }, { passive: true });

    document.addEventListener('mouseleave', function () {
      lastSpawnX = null;
      lastSpawnY = null;
    });

    function tick() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'lighter';

      var lastTime = tick._last || performance.now();
      var now = performance.now();
      var dt = Math.min(now - lastTime, 48);
      tick._last = now;

      for (var i = ripples.length - 1; i >= 0; i--) {
        var r = ripples[i];
        r.age += dt;
        var t = r.age / r.life;
        if (t >= 1) {
          ripples.splice(i, 1);
          continue;
        }
        var ease = 1 - Math.pow(1 - t, 3);
        var radius = 3 + r.maxR * ease;
        var alpha = (1 - t) * (1 - t) * 0.32;

        ctx.beginPath();
        ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
        ctx.lineWidth = Math.max(0.6, 2.2 * (1 - ease));
        ctx.strokeStyle = 'hsla(' + r.hue + ', 65%, 58%, ' + alpha + ')';
        ctx.stroke();

        var innerR = radius * 0.88;
        if (innerR > 2) {
          ctx.beginPath();
          ctx.arc(r.x, r.y, innerR, 0, Math.PI * 2);
          ctx.lineWidth = Math.max(0.4, 1.1 * (1 - ease));
          ctx.strokeStyle = 'hsla(' + (r.hue + 10) + ', 45%, 90%, ' + (alpha * 0.65) + ')';
          ctx.stroke();
        }
      }

      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
})();
