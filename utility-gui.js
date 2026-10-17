/* Utility.Gui bookmarklet - readable source.
   Click the bookmarklet again to close the panel and undo everything. */
(function () {
  var NAME = 'Utility.Gui';
  var ID = 'utility-gui-host';
  if (window.__utilityGui) { window.__utilityGui.destroy(); return; }

  var SCALE = 1.2;   /* default panel size: 1 = original, 1.2 = 20% bigger (also a slider in Settings) */

  var html = document.documentElement;
  var timers = [];
  var cleanups = [];
  var extras = [];
  var fx = {};
  var uid = 0;
  var scrollSpeed = 0;
  var scrollRaf = null;
  var refreshId = null;
  var delStack = [];
  var dd = null;
  var origZoom = document.body.style.zoom;

  /* filter state (body filter built from CSS variables) */
  var F = { b: 100, c: 100, s: 100, sp: 0, bl: 0, h: 0, g: 0 };
  var rainbowOn = false;
  /* layout / typography state */
  var T = { mw: 0, op: 100, lh: 0, ls: 0, ws: 0 };
  /* misc settings driven by sliders */
  var cfg = { mskip: 3, snow: 120, trail: 5, confetti: 160, shake: 12, rate: 1 };
  var snowFlakes = [];

  var ACCENTS = {
    Emerald: ['#146c4b', '#2cc38b', '#4fe0aa', '44,195,139'],
    Ocean: ['#1d4f91', '#3b9cf5', '#6db8ff', '59,156,245'],
    Violet: ['#5b2fa8', '#9a6cf5', '#b79bff', '154,108,245'],
    Rose: ['#9b2c4a', '#f0587f', '#ff8aa6', '240,88,127'],
    Amber: ['#9a5a0b', '#f0a020', '#ffc457', '240,160,32']
  };

  function later(fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; }

  /* ---------- page-level styles (toggled with ug- classes on <html>) ---------- */
  var pageStyle = document.createElement('style');
  var X = ':not(#' + ID + ')';
  pageStyle.textContent =
    '@property --ug-h{syntax:"<angle>";inherits:true;initial-value:0deg}' +
    'html.ug-dark{filter:invert(1) hue-rotate(180deg)}' +
    'html.ug-dark img,html.ug-dark video,html.ug-dark picture,html.ug-dark canvas[id^=ug-],html.ug-dark #' + ID +
      '{filter:invert(1) hue-rotate(180deg)}' +
    'html.ug-reader body{background:#fbf6ec!important;color:#433422!important}' +
    'html.ug-reader body *' + X + '{background:transparent!important;color:inherit!important;font-family:Georgia,serif!important}' +
    'html.ug-noimg img,html.ug-noimg picture,html.ug-noimg video{visibility:hidden!important}' +
    'html.ug-filt body{filter:brightness(var(--ug-b,1)) contrast(var(--ug-c,1)) saturate(var(--ug-s,1)) ' +
      'grayscale(var(--ug-g,0)) sepia(var(--ug-sp,0)) hue-rotate(var(--ug-h)) blur(var(--ug-bl,0px))}' +
    '@keyframes ug-rainbow{from{--ug-h:0deg}to{--ug-h:360deg}}' +
    'html.ug-rainbow body{animation:ug-rainbow var(--ug-rs,6s) linear infinite}' +
    'html.ug-still body *' + X + '{animation:none!important;transition:none!important;scroll-behavior:auto!important}' +
    'html.ug-outline body *' + X + '{outline:1px solid rgba(37,99,235,.45)!important}' +
    'html.ug-links a' + X + '{background:#fde68a!important;color:#000!important;outline:2px solid #f59e0b!important}' +
    'html.ug-unlock *' + X + '{-webkit-user-select:text!important;user-select:text!important}' +
    'html.ug-del body *' + X + ':hover{outline:2px solid #ef4444!important;cursor:crosshair!important}' +
    'html.ug-unscroll,html.ug-unscroll body{overflow:auto!important}' +
    '.ug-hidefix,.ug-gone{display:none!important}' +
    '@keyframes ug-roll{to{transform:rotate(360deg)}}' +
    'html.ug-roll body{animation:ug-roll 1.2s ease-in-out}';
  document.head.appendChild(pageStyle);

  var fontStyle = document.createElement('style');
  document.head.appendChild(fontStyle);
  var adjStyle = document.createElement('style');
  document.head.appendChild(adjStyle);

  function updateFilt() {
    var st = html.style;
    st.setProperty('--ug-b', F.b / 100);
    st.setProperty('--ug-c', F.c / 100);
    st.setProperty('--ug-s', F.s / 100);
    st.setProperty('--ug-sp', F.sp / 100);
    st.setProperty('--ug-g', F.g);
    st.setProperty('--ug-bl', F.bl + 'px');
    st.setProperty('--ug-h', F.h + 'deg');
    var on = rainbowOn || F.b !== 100 || F.c !== 100 || F.s !== 100 || F.sp || F.bl || F.h || F.g;
    html.classList.toggle('ug-filt', !!on);
  }

  function updateAdj() {
    var c = '';
    if (T.mw) c += 'body{max-width:' + T.mw + 'px!important;margin-left:auto!important;margin-right:auto!important}';
    if (T.op < 100) c += 'body{opacity:' + (T.op / 100) + '}';
    var t = '';
    if (T.lh) t += 'line-height:' + T.lh + '!important;';
    if (T.ls) t += 'letter-spacing:' + T.ls + 'px!important;';
    if (T.ws) t += 'word-spacing:' + T.ws + 'px!important;';
    if (t) c += 'body *' + X + '{' + t + '}';
    adjStyle.textContent = c;
  }

  /* ---------- host + shadow root (keeps the panel isolated from page CSS) ---------- */
  var host = document.createElement('div');
  host.id = ID;
  host.style.cssText = 'all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;';
  html.appendChild(host);
  var root = host.attachShadow({ mode: 'open' });

  function applyAccent(name) {
    var a = ACCENTS[name] || ACCENTS.Emerald;
    host.style.setProperty('--a1', a[0]);
    host.style.setProperty('--a2', a[1]);
    host.style.setProperty('--at', a[2]);
    host.style.setProperty('--ar', a[3]);
  }
  applyAccent('Emerald');

  var SHADOW_CSS =
    ':host{all:initial}' +
    '*{box-sizing:border-box;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}' +
    '#hud{position:fixed;top:20px;right:20px;width:' + (360 * SCALE) + 'px;max-height:' + (520 * SCALE) + 'px;' +
      'display:flex;flex-direction:column;background:rgba(17,17,17,.97);backdrop-filter:blur(16px);' +
      '-webkit-backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.07);border-radius:24px;' +
      'box-shadow:0 30px 70px rgba(0,0,0,.55);color:#f2f2f2;user-select:none;overflow:hidden}' +
    '#inner{zoom:' + SCALE + ';width:360px;max-height:520px;flex:none;display:flex;flex-direction:column;min-height:0}' +
    '#hdr{padding:18px 20px 8px;display:flex;justify-content:space-between;align-items:flex-start;cursor:move;touch-action:none}' +
    '#hdr h3{margin:0;font-size:17px;font-weight:600;color:#fff;letter-spacing:-.01em}' +
    '#hdr small{display:block;margin-top:2px;font-size:11px;color:#6f6f6f}' +
    '.hbtns{display:flex;gap:2px;align-items:center;margin-top:-2px}' +
    '.ico{background:none;border:none;color:#a3a3a3;cursor:pointer;padding:6px;border-radius:9px;display:flex}' +
    '.ico:hover{color:#fff;background:rgba(255,255,255,.08)}' +
    'svg{width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}' +
    '#hdr,#searchbar,#tabs,#grip{flex:none}' +
    '#hud.collapsed #hdr{padding:12px 16px;align-items:center}' +
    '#hud.collapsed #hdr small,#hud.collapsed .hmore,#hud.collapsed #tabs,#hud.collapsed #searchbar,' +
      '#hud.collapsed #body,#hud.collapsed #grip{display:none}' +
    '#searchbar{display:none;padding:2px 20px 8px}#searchbar.open{display:block}' +
    '#tabs{display:flex;gap:8px;padding:6px 20px 10px;overflow-x:auto;scrollbar-width:none}' +
    '#tabs::-webkit-scrollbar{display:none}' +
    '.tab{flex:none;display:flex;align-items:center;gap:7px;background:rgba(255,255,255,.025);' +
      'border:1px solid rgba(255,255,255,.05);color:#8f8f8f;padding:7px 14px 7px 12px;font-size:13px;font-weight:500;' +
      'cursor:pointer;border-radius:999px}' +
    '.tab svg{width:15px;height:15px}' +
    '.tab:hover{color:#ddd}' +
    '.tab.active{color:#fff;background:#2b2b2b;border-color:rgba(255,255,255,.1)}' +
    '#body{padding:2px 18px 0;overflow-y:auto;flex:1;min-height:0;scrollbar-width:none;' +
      '-webkit-mask-image:linear-gradient(to bottom,#000 calc(100% - 34px),transparent);' +
      'mask-image:linear-gradient(to bottom,#000 calc(100% - 34px),transparent)}' +
    '#body::-webkit-scrollbar{display:none}' +
    '.pane{display:none;flex-direction:column;gap:8px;padding-bottom:40px}.pane.active{display:flex}' +
    '#body.searching .pane{display:flex}' +
    '#body.searching .sec,#body.searching .desc,#body.searching .stat,#body.searching #out{display:none}' +
    '.sec{font-size:13px;color:#7d7d7d;font-weight:500;margin:10px 4px 0}' +
    '.desc{font-size:11px;color:#707070;margin:-3px 6px 4px;line-height:1.4}' +
    '.row{display:flex;align-items:center;justify-content:space-between;background:#1f1f1f;' +
      'border:1px solid rgba(255,255,255,.04);border-radius:13px;padding:0 16px;min-height:42px;font-size:13.5px;' +
      'color:#f0f0f0;gap:12px}' +
    '.row.sl{padding:13px 16px;min-height:64px}' +
    '.lbl{display:flex;flex-direction:column;gap:4px;flex:none;max-width:48%}' +
    '.lbl small{font-size:12px;color:#9a9a9a}' +
    '.row.sl input[type=range]{width:50%;flex:none}' +
    '.btn{display:flex;align-items:center;justify-content:space-between;width:100%;text-align:left;cursor:pointer;' +
      'background:#1f1f1f;border:1px solid rgba(255,255,255,.04);border-radius:13px;padding:0 16px;min-height:42px;' +
      'font-size:13.5px;color:#f0f0f0}' +
    '.btn:hover,.row:hover{background:#262626}' +
    '.sw{position:relative;display:inline-block;width:46px;height:24px;flex:none}' +
    '.sw input{opacity:0;width:0;height:0;position:absolute}' +
    '.knob{position:absolute;inset:0;cursor:pointer;background:#2a2a2a;border:1px solid #3b3b3b;transition:.2s;border-radius:14px}' +
    '.knob:before{content:"";position:absolute;height:16px;width:16px;left:3px;top:3px;background:#7a7a7a;' +
      'transition:.2s;border-radius:50%}' +
    '.sw input:checked+.knob{background:linear-gradient(90deg,var(--a1),var(--a2));border-color:var(--a2)}' +
    '.sw input:checked+.knob:before{transform:translateX(22px);background:var(--at)}' +
    '.sw input:focus-visible+.knob{outline:2px solid var(--at)}' +
    'input[type=range]{-webkit-appearance:none;appearance:none;height:16px;border-radius:9px;cursor:pointer;outline:none;' +
      'background:linear-gradient(90deg,var(--a1),var(--a2)) 0 0/calc(17px + (100% - 34px) * var(--f,0)) 100% no-repeat,#2b2b2b}' +
    'input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:34px;height:20px;border-radius:10px;background:#fff;' +
      'box-shadow:0 1px 5px rgba(0,0,0,.6);border:none}' +
    'input[type=range]::-moz-range-thumb{width:34px;height:20px;border-radius:10px;background:#fff;border:none;' +
      'box-shadow:0 1px 5px rgba(0,0,0,.6)}' +
    'input[type=text]{background:#2b2b2b;border:1px solid rgba(255,255,255,.06);border-radius:9px;color:#f3f3f3;' +
      'padding:6px 12px;font-size:12.5px;width:54%;user-select:text;outline:none}' +
    'input[type=text]:focus{border-color:var(--a2)}' +
    '#q{width:100%;padding:9px 14px;border-radius:12px;font-size:13px}' +
    'input[type=color]{width:34px;height:22px;padding:0;border:none;background:none;cursor:pointer;margin-left:8px;vertical-align:middle}' +
    '.selw{position:relative;display:flex;align-items:center}' +
    '.selw select{-webkit-appearance:none;appearance:none;background:transparent;border:none;color:#a8a8a8;font-size:13px;' +
      'padding:6px 20px 6px 8px;cursor:pointer;outline:none;text-align:right}' +
    '.selw option{background:#1f1f1f;color:#eee}' +
    '.selw svg{position:absolute;right:0;width:14px;height:14px;pointer-events:none;color:#a8a8a8}' +
    '.keybtn{background:#2b2b2b;border:1px solid rgba(255,255,255,.06);border-radius:9px;color:#d8d8d8;padding:6px 14px;' +
      'font-size:12.5px;cursor:pointer}' +
    '.keybtn:hover{background:#333}' +
    '.stat{background:linear-gradient(135deg,rgba(var(--ar),.28),rgba(24,24,24,.9) 75%);' +
      'border:1px solid rgba(var(--ar),.4);border-radius:18px;padding:16px 18px;margin-bottom:4px}' +
    '.st-top{display:flex;align-items:center;gap:10px;font-size:15px;font-weight:600;color:#fff}' +
    '.st-top svg{width:20px;height:20px}' +
    '.st-bot{display:flex;justify-content:space-between;align-items:baseline;margin-top:12px;font-size:19px;font-weight:500}' +
    '.st-chg{font-size:12px;font-weight:700;color:var(--at)}' +
    '#out{display:none;white-space:pre-wrap;word-break:break-all;font:11px ui-monospace,Menlo,Consolas,monospace;' +
      'background:#181818;border:1px solid rgba(255,255,255,.04);border-radius:13px;padding:12px;max-height:150px;' +
      'overflow:auto;user-select:text;color:#c7c7c7}' +
    '#grip{padding:8px 0 12px;display:flex;justify-content:center;cursor:move;touch-action:none}' +
    '#grip span{width:100px;height:4px;border-radius:4px;background:rgba(255,255,255,.3)}' +
    '#toast{position:fixed;bottom:20px;left:50%;transform:translate(-50%,100px);background:rgba(20,20,20,.96);' +
      'backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.12);padding:14px 24px;border-radius:30px;color:#fff;' +
      'font-size:14px;font-weight:600;display:flex;align-items:center;gap:12px;max-width:90vw;' +
      'box-shadow:0 10px 30px rgba(0,0,0,.5);transition:transform .4s cubic-bezier(.175,.885,.32,1.275)}' +
    '#toast.show{transform:translate(-50%,0)}' +
    '#spin{width:16px;height:16px;border:2px solid rgba(255,255,255,.2);border-top-color:var(--a2,#2cc38b);border-radius:50%;' +
      'animation:spin .8s linear infinite;flex:none}' +
    '@keyframes spin{to{transform:rotate(360deg)}}';

  root.innerHTML =
    '<style>' + SHADOW_CSS + '</style>' +
    '<div id="toast" role="status" aria-live="polite"><span id="spin"></span><span id="tt">Loading GUI...</span></div>';

  var toast = root.querySelector('#toast');
  var tt = root.querySelector('#tt');
  var spin = root.querySelector('#spin');
  var toastTimer;

  function say(msg, ms) {
    spin.style.display = 'none';
    tt.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('show'); }, ms || 2200);
    timers.push(toastTimer);
  }

  /* ---------- fake loading animation, then build the GUI ---------- */
  tt.textContent = 'Loading ' + NAME + '...';
  later(function () { toast.classList.add('show'); }, 50);
  later(function () {
    spin.style.display = 'none';
    tt.textContent = '\u2705 Loaded ' + NAME + '!';
    later(function () { toast.classList.remove('show'); }, 1000);
    try { buildGUI(); } catch (err) {
      console.error(NAME, err);
      say(NAME + ' failed to build: ' + err.message, 8000);
    }
  }, 1500);

  window.__utilityGui = { destroy: destroy };

  /* =====================================================================
     GUI
     ===================================================================== */
  function buildGUI() {
    var ICON = {
      search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
      gear: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8" stroke-dasharray="3.1 2.5"/>',
      min: '<path d="M5 12h14"/>',
      expand: '<rect x="5.5" y="5.5" width="13" height="13" rx="2.5"/>',
      close: '<path d="M6 6l12 12M18 6L6 18"/>',
      layout: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M3 9.5h18M9.5 9.5V20"/>',
      sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
      bars: '<path d="M5 20v-8M12 20V5M19 20v-5"/>',
      pen: '<path d="M14 5l5 5L9 20H4v-5z"/><path d="M12 7l5 5"/>',
      tools: '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>',
      spark: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 16v4M17 18h4"/>',
      chev: '<path d="M6 9l6 6 6-6"/>'
    };
    function ic(n) { return '<svg viewBox="0 0 24 24">' + ICON[n] + '</svg>'; }

    function lc(s) { return String(s).toLowerCase().replace(/"/g, ''); }
    function SEC(t) { return '<div class="sec">' + t + '</div>'; }
    function D(t) { return '<div class="desc">' + t + '</div>'; }
    function S(id, label, extra) {
      return '<div class="row" data-s="' + lc(label) + '"><span>' + label + (extra || '') + '</span><label class="sw"><input type="checkbox" id="' + id +
        '"><span class="knob"></span></label></div>';
    }
    function B(id, label) { return '<button class="btn" id="' + id + '" data-s="' + lc(label) + '">' + label + '</button>'; }
    function R(id, label, min, max, val, step) {
      return '<div class="row sl" data-s="' + lc(label) + '"><div class="lbl"><span>' + label + '</span><small id="' + id + 'v"></small></div>' +
        '<input type="range" id="' + id + '" min="' + min + '" max="' + max + '" value="' + val + '" step="' + (step || 1) + '"></div>';
    }
    function DD(id, label, opts) {
      return '<div class="row" data-s="' + lc(label) + '"><span>' + label + '</span><span class="selw"><select id="' + id + '">' + opts + '</select>' + ic('chev') + '</span></div>';
    }

    var GUI =
      '<div id="hud"><div id="inner">' +
        '<div id="hdr"><div><h3>' + NAME + '</h3><small>Bookmarklet toolkit</small></div><div class="hbtns">' +
          '<button class="ico hmore" id="search" title="Search features">' + ic('search') + '</button>' +
          '<button class="ico hmore" id="gear" title="Settings">' + ic('gear') + '</button>' +
          '<button class="ico" id="min" title="Collapse">' + ic('min') + '</button>' +
          '<button class="ico" id="close" title="Close">' + ic('close') + '</button></div></div>' +
        '<div id="searchbar"><input type="text" id="q" placeholder="Search features..."></div>' +
        '<div id="tabs">' +
          '<button class="tab active" data-tab="p-layout">' + ic('layout') + 'Layout</button>' +
          '<button class="tab" data-tab="p-adjust">' + ic('sliders') + 'Adjust</button>' +
          '<button class="tab" data-tab="p-data">' + ic('bars') + 'Data</button>' +
          '<button class="tab" data-tab="p-design">' + ic('pen') + 'Design</button>' +
          '<button class="tab" data-tab="p-tools">' + ic('tools') + 'Tools</button>' +
          '<button class="tab" data-tab="p-fun">' + ic('spark') + 'Fun</button></div>' +
        '<div id="body">' +

          '<div class="pane active" id="p-layout">' +
            SEC('Appearance') +
            S('dark', 'Dark Mode') +
            S('read', 'Reader Mode') +
            S('img', 'Hide Images') +
            S('gray', 'Grayscale') +
            S('still', 'Freeze Animations') +
            S('fix', 'Hide Sticky / Fixed Bars') +
            D('Hides headers, cookie bars and other pinned elements.') +
            SEC('Scrolling & Size') +
            R('scroll', 'Auto Scroll Speed', 0, 10, 0) +
            R('zoom', 'Page Zoom', 50, 200, 100, 10) +
            R('mw', 'Max Content Width', 0, 2000, 0, 50) +
            R('op', 'Page Opacity', 20, 100, 100, 5) +
          '</div>' +

          '<div class="pane" id="p-adjust">' +
            SEC('Color') +
            R('bri', 'Brightness', 20, 200, 100, 5) +
            R('con', 'Contrast', 50, 200, 100, 5) +
            R('sat', 'Saturation', 0, 300, 100, 5) +
            R('sep', 'Sepia', 0, 100, 0, 5) +
            R('hue', 'Hue Rotate', 0, 360, 0, 5) +
            R('blur', 'Blur', 0, 10, 0, 0.5) +
            SEC('Text') +
            R('lh', 'Line Height', 0, 3, 0, 0.1) +
            R('ls', 'Letter Spacing', 0, 6, 0, 0.5) +
            R('ws', 'Word Spacing', 0, 20, 0, 1) +
            B('reset', 'Reset All Adjustments') +
          '</div>' +

          '<div class="pane" id="p-data">' +
            '<div class="stat"><div class="st-top">' + ic('bars') + '<span>Words on this page</span></div>' +
              '<div class="st-bot"><span id="stval">0</span><span class="st-chg" id="stchg"></span></div></div>' +
            SEC('Collect') +
            B('links', 'Harvest Links') +
            B('emails', 'Extract Emails') +
            B('imgs', 'Download Images') +
            B('tables', 'Tables \u2192 CSV') +
            SEC('Analyze') +
            B('heads', 'Heading Outline') +
            B('text', 'Copy Page Text') +
            B('stats', 'Page Stats') +
            B('fonts', 'Fonts & Colors') +
            '<div id="out"></div>' +
          '</div>' +

          '<div class="pane" id="p-design">' +
            SEC('Edit') +
            S('edit', 'Page Editor') +
            D('Click anywhere on the page and type to change the text.') +
            S('outline', 'Outline Elements') +
            S('hl', 'Highlight Links') +
            DD('font', 'Font', '<option value="">Default</option><option value="Georgia,serif">Serif</option>' +
              '<option value="system-ui,sans-serif">Sans</option><option value="ui-monospace,Menlo,Consolas,monospace">Monospace</option>' +
              '<option value="&quot;Comic Sans MS&quot;,&quot;Comic Neue&quot;,cursive">Comic</option>' +
              '<option value="Impact,Haettenschweiler,sans-serif">Impact</option>') +
            B('eye', 'Pick Color (copies hex)') +
            SEC('Draw') +
            S('doodle', 'Doodle on Page', '<input type="color" id="dcol" value="#ef4444">') +
            R('brush', 'Brush Size', 1, 30, 4, 1) +
            B('dclear', 'Clear Doodles') +
            SEC('Guides') +
            S('grid', 'Grid Overlay') +
            R('gridsz', 'Grid Size', 10, 200, 40, 5) +
            S('ruler', 'Reading Ruler') +
            R('rulerh', 'Ruler Height', 20, 300, 60, 10) +
          '</div>' +

          '<div class="pane" id="p-tools">' +
            SEC('Page') +
            S('unlock', 'Unlock Copy & Right-Click') +
            D('Re-enables text selection, copy and the context menu on locked pages.') +
            S('pw', 'Show Passwords') +
            S('del', 'Delete Elements') +
            D('Click anything on the page to remove it. Esc stops.') +
            S('mute', 'Mute All Media') +
            B('undo', 'Undo Delete') +
            B('overlays', 'Remove Popups') +
            SEC('Navigate') +
            B('top', 'Scroll to Top') +
            B('bottom', 'Scroll to Bottom') +
            B('md', 'Copy Markdown Link') +
            B('clean', 'Copy Clean URL') +
            B('wayback', 'Open in Wayback Machine') +
            B('print', 'Print Page') +
            SEC('Media & Timing') +
            R('rate', 'Video / Audio Speed', 0.25, 4, 1, 0.25) +
            R('refresh', 'Auto Refresh', 0, 120, 0, 5) +
            SEC('Find') +
            '<div class="row" data-s="find highlight"><span>Highlight</span><input type="text" id="find" placeholder="Input"></div>' +
          '</div>' +

          '<div class="pane" id="p-fun">' +
            SEC('Effects') +
            S('matrix', 'Matrix Rain') +
            R('mspeed', 'Rain Speed', 1, 8, 6, 1) +
            S('snow', 'Snowfall') +
            R('snowamt', 'Snow Amount', 10, 400, 120, 10) +
            S('rainbow', 'Rainbow Mode') +
            R('rbspeed', 'Seconds per Cycle', 1, 20, 6, 1) +
            S('trail', 'Cursor Sparkle Trail') +
            R('trailsz', 'Sparkle Size', 2, 15, 5, 1) +
            S('spot', 'Spotlight') +
            R('spotsz', 'Spotlight Size', 60, 400, 150, 10) +
            SEC('Actions') +
            B('confetti', 'Confetti') +
            R('confamt', 'Confetti Amount', 50, 500, 160, 10) +
            B('roll', 'Barrel Roll') +
            B('shake', 'Earthquake') +
            R('shakeamt', 'Quake Strength', 2, 40, 12, 1) +
          '</div>' +

          '<div class="pane" id="p-settings">' +
            SEC('Interface') +
            DD('accent', 'Accent Color', '<option>Emerald</option><option>Ocean</option><option>Violet</option><option>Rose</option><option>Amber</option>') +
            R('pscale', 'Panel Scale', 80, 160, Math.round(SCALE * 100), 5) +
            R('popacity', 'Panel Opacity', 60, 100, 97, 1) +
            '<div class="row" data-s="collapse key keybind"><span>Collapse Key</span><button class="keybtn" id="keybtn">Esc</button></div>' +
            D('Click the button, then press any key to rebind it.') +
            B('resetpos', 'Reset Panel Position') +
          '</div>' +

        '</div>' +
        '<div id="grip" title="Drag to move"><span></span></div>' +
      '</div></div>';

    var wrap = document.createElement('div');
    wrap.innerHTML = GUI;
    root.appendChild(wrap);

    var $ = function (s) { return root.querySelector(s); };
    var hud = $('#hud');
    var out = $('#out');
    var ckey = 'Escape';
    var binding = false;

    /* ---------- small helpers ---------- */
    function sw(id, on, off) {
      $('#' + id).addEventListener('change', function (e) {
        if (e.target.checked) on(); else if (off) off();
      });
    }
    function cls(id, c) {
      sw(id, function () { html.classList.add(c); }, function () { html.classList.remove(c); });
    }
    function setSwitch(id, v) {
      var el = $('#' + id);
      if (el.checked !== v) { el.checked = v; el.dispatchEvent(new Event('change')); }
    }
    function click(id, fn) { $('#' + id).addEventListener('click', fn); }
    function show(text) { out.textContent = text; out.style.display = 'block'; }

    var sliders = {};
    function rng(id, fn, fmt) {
      var el = $('#' + id);
      var lab = $('#' + id + 'v');
      var def = el.value;
      var mn = parseFloat(el.min);
      var mx = parseFloat(el.max);
      function upd() {
        var v = parseFloat(el.value);
        lab.textContent = fmt ? fmt(v) : v;
        el.style.setProperty('--f', (v - mn) / (mx - mn));
        return v;
      }
      el.addEventListener('input', function () { fn(upd()); });
      upd();
      sliders[id] = { reset: function () { el.value = def; fn(upd()); } };
    }
    var pct = function (v) { return v + '%'; };
    var offOr = function (suffix) { return function (v) { return v ? v + (suffix || '') : 'off'; }; };
    var pxf = function (v) { return v + 'px'; };

    function copy(text) {
      function fallback() {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
        document.body.appendChild(ta);
        ta.select();
        var ok = false;
        try { ok = document.execCommand('copy'); } catch (e) {}
        ta.remove();
        return ok;
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return fallback(); });
      }
      return Promise.resolve(fallback());
    }

    function saveBlob(name, blob) {
      var a = document.createElement('a');
      var url = URL.createObjectURL(blob);
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    }

    function unique(arr) {
      var seen = {};
      return arr.filter(function (v) { var k = v.toLowerCase(); if (seen[k]) return false; seen[k] = 1; return true; });
    }

    function toHex(c) {
      var m = c.match(/\d+(\.\d+)?/g);
      if (!m || m.length < 3) return c;
      return '#' + m.slice(0, 3).map(function (n) {
        return ('0' + Math.round(+n).toString(16)).slice(-2);
      }).join('');
    }

    function topN(obj, n) {
      return Object.keys(obj).sort(function (a, b) { return obj[b] - obj[a]; }).slice(0, n);
    }

    function mkDiv(id, css) {
      var d = document.createElement('div');
      d.id = id;
      d.style.cssText = css;
      html.appendChild(d);
      extras.push(d);
      return d;
    }

    /* ---------- canvas overlays + animation loop ---------- */
    function overlay(id, interactive) {
      var c = document.createElement('canvas');
      c.id = id;
      c.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:' +
        (interactive ? 'auto' : 'none') + ';z-index:2147483646;';
      c.width = window.innerWidth;
      c.height = window.innerHeight;
      html.appendChild(c);
      var onResize = function () { c.width = window.innerWidth; c.height = window.innerHeight; };
      window.addEventListener('resize', onResize);
      return {
        c: c,
        ctx: c.getContext('2d'),
        close: function () { window.removeEventListener('resize', onResize); c.remove(); }
      };
    }

    function loop(fn) {
      var on = true;
      var id;
      function step(t) {
        if (!on) return;
        fn(t);
        if (on) id = requestAnimationFrame(step);
      }
      id = requestAnimationFrame(step);
      return function () { on = false; cancelAnimationFrame(id); };
    }

    /* ---------- tabs / search / settings / collapse / close ---------- */
    var tabsEl = $('#tabs');
    function showTab(id) {
      root.querySelectorAll('.tab').forEach(function (b) {
        var on = b.getAttribute('data-tab') === id;
        b.classList.toggle('active', on);
        if (on) tabsEl.scrollLeft = Math.max(0, b.offsetLeft - 20);
      });
      root.querySelectorAll('.pane').forEach(function (p) { p.classList.toggle('active', p.id === id); });
      $('#body').scrollTop = 0;
    }
    root.querySelectorAll('.tab').forEach(function (btn) {
      btn.addEventListener('click', function () { showTab(btn.getAttribute('data-tab')); });
    });
    tabsEl.addEventListener('wheel', function (e) {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { tabsEl.scrollLeft += e.deltaY; e.preventDefault(); }
    }, { passive: false });
    $('#gear').addEventListener('click', function () { showTab('p-settings'); });

    function applySearch(q) {
      q = q.trim().toLowerCase();
      $('#body').classList.toggle('searching', !!q);
      root.querySelectorAll('[data-s]').forEach(function (el) {
        el.style.display = (!q || el.getAttribute('data-s').indexOf(q) !== -1) ? '' : 'none';
      });
    }
    function toggleSearch() {
      var bar = $('#searchbar');
      var open = bar.classList.toggle('open');
      if (open) { $('#q').focus(); }
      else { $('#q').value = ''; applySearch(''); }
    }
    $('#search').addEventListener('click', toggleSearch);
    $('#q').addEventListener('input', function (e) { applySearch(e.target.value); });
    $('#q').addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Escape') toggleSearch();
    });

    function toggleCollapse() {
      var c = hud.classList.toggle('collapsed');
      $('#min').innerHTML = ic(c ? 'expand' : 'min');
      $('#min').title = c ? 'Expand' : 'Collapse';
    }
    $('#min').addEventListener('click', toggleCollapse);
    $('#hdr').addEventListener('dblclick', function (e) {
      if (!e.target.closest('.ico')) toggleCollapse();
    });
    $('#close').addEventListener('click', destroy);

    /* dragging (pointer events: mouse + touch), from the header or the grip bar */
    var drag = null;
    function makeDraggable(el) {
      el.addEventListener('pointerdown', function (e) {
        if (e.target.closest('.ico')) return;
        var r = hud.getBoundingClientRect();
        drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
        hud.style.right = 'auto';
        el.setPointerCapture(e.pointerId);
      });
      el.addEventListener('pointermove', function (e) {
        if (!drag) return;
        hud.style.left = Math.min(Math.max(0, e.clientX - drag.dx), window.innerWidth - 80) + 'px';
        hud.style.top = Math.min(Math.max(0, e.clientY - drag.dy), window.innerHeight - 40) + 'px';
      });
      el.addEventListener('pointerup', function () { drag = null; });
    }
    makeDraggable($('#hdr'));
    makeDraggable($('#grip'));

    /* =================== SETTINGS =================== */
    $('#accent').addEventListener('change', function (e) { applyAccent(e.target.value); });
    rng('pscale', function (v) {
      SCALE = v / 100;
      hud.style.width = (360 * SCALE) + 'px';
      hud.style.maxHeight = (520 * SCALE) + 'px';
      $('#inner').style.zoom = SCALE;
    }, pct);
    rng('popacity', function (v) { hud.style.background = 'rgba(17,17,17,' + (v / 100) + ')'; }, pct);
    function keyName(k) { return k === 'Escape' ? 'Esc' : (k === ' ' ? 'Space' : (k.length === 1 ? k.toUpperCase() : k)); }
    $('#keybtn').addEventListener('click', function () { binding = true; this.textContent = 'Press a key...'; });
    click('resetpos', function () {
      hud.style.left = '';
      hud.style.top = '20px';
      hud.style.right = '20px';
    });

    /* =================== LAYOUT =================== */
    cls('dark', 'ug-dark');
    cls('read', 'ug-reader');
    cls('img', 'ug-noimg');
    cls('still', 'ug-still');

    sw('gray', function () { F.g = 1; updateFilt(); }, function () { F.g = 0; updateFilt(); });

    sw('fix', function () {
      var n = 0;
      document.body.querySelectorAll('*').forEach(function (el) {
        var p = getComputedStyle(el).position;
        if (p === 'fixed' || p === 'sticky') { el.classList.add('ug-hidefix'); n++; }
      });
      say('Hid ' + n + ' fixed/sticky elements');
    }, function () {
      document.querySelectorAll('.ug-hidefix').forEach(function (el) { el.classList.remove('ug-hidefix'); });
    });

    function scrollLoop() {
      if (scrollSpeed > 0) { window.scrollBy(0, scrollSpeed); scrollRaf = requestAnimationFrame(scrollLoop); }
      else scrollRaf = null;
    }
    rng('scroll', function (v) {
      scrollSpeed = v;
      if (scrollSpeed > 0 && !scrollRaf) scrollRaf = requestAnimationFrame(scrollLoop);
    }, offOr());
    function stopScroll() {
      if (!scrollSpeed) return;
      sliders.scroll.reset();
    }
    window.addEventListener('wheel', stopScroll, { passive: true });
    window.addEventListener('touchstart', stopScroll, { passive: true });
    cleanups.push(function () {
      window.removeEventListener('wheel', stopScroll);
      window.removeEventListener('touchstart', stopScroll);
    });

    rng('zoom', function (v) { document.body.style.zoom = v / 100; }, pct);
    rng('mw', function (v) { T.mw = v; updateAdj(); }, offOr('px'));
    rng('op', function (v) { T.op = v; updateAdj(); }, pct);

    /* =================== ADJUST =================== */
    rng('bri', function (v) { F.b = v; updateFilt(); }, pct);
    rng('con', function (v) { F.c = v; updateFilt(); }, pct);
    rng('sat', function (v) { F.s = v; updateFilt(); }, pct);
    rng('sep', function (v) { F.sp = v; updateFilt(); }, pct);
    rng('blur', function (v) { F.bl = v; updateFilt(); }, pxf);
    rng('hue', function (v) { F.h = v; updateFilt(); }, function (v) { return v + '\u00B0'; });
    rng('lh', function (v) { T.lh = v; updateAdj(); }, offOr());
    rng('ls', function (v) { T.ls = v; updateAdj(); }, offOr('px'));
    rng('ws', function (v) { T.ws = v; updateAdj(); }, offOr('px'));
    click('reset', function () {
      ['bri', 'con', 'sat', 'sep', 'blur', 'hue', 'lh', 'ls', 'ws'].forEach(function (k) { sliders[k].reset(); });
      say('Adjustments reset');
    });

    /* =================== DATA =================== */
    function refreshStat() {
      var t = document.body.innerText || '';
      var w = (t.trim().match(/\S+/g) || []).length;
      $('#stval').textContent = w.toLocaleString() + ' words';
      $('#stchg').textContent = '~' + Math.max(1, Math.round(w / 200)) + ' min read';
      return { text: t, words: w };
    }
    refreshStat();

    click('links', function () {
      var seen = {};
      var list = [];
      document.querySelectorAll('a[href]').forEach(function (a) {
        var h = a.href;
        if (h && /^https?:/i.test(h) && !seen[h]) { seen[h] = 1; list.push(h); }
      });
      if (!list.length) return say('No links found');
      show(list.join('\n'));
      copy(list.join('\n')).then(function (ok) {
        say(ok ? 'Copied ' + list.length + ' unique links' : 'Found ' + list.length + ' links (copy blocked)');
      });
    });

    click('emails', function () {
      var re = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g;
      var found = (document.body.innerText.match(re) || []).slice();
      document.querySelectorAll('a[href^="mailto:" i]').forEach(function (a) {
        a.getAttribute('href').replace(/^mailto:/i, '').split('?')[0].split(',').forEach(function (x) {
          try { x = decodeURIComponent(x.trim()); } catch (e) {}
          if (x.indexOf('@') > 0) found.push(x);
        });
      });
      var list = unique(found);
      if (!list.length) return say('No emails found');
      show(list.join('\n'));
      copy(list.join('\n')).then(function (ok) {
        say(ok ? 'Copied ' + list.length + ' emails' : 'Found ' + list.length + ' emails (copy blocked)');
      });
    });

    click('imgs', function () {
      var seen = {};
      var urls = [];
      document.querySelectorAll('img').forEach(function (img) {
        var u = img.currentSrc || img.src;
        if (u && !/^data:/i.test(u) && !seen[u]) { seen[u] = 1; urls.push(u); }
      });
      urls = urls.slice(0, 50);
      if (!urls.length) return say('No downloadable images found');
      say('Downloading ' + urls.length + ' images...', 4000);
      var failed = [];
      var done = 0;
      urls.reduce(function (chain, u, i) {
        return chain.then(function () {
          return fetch(u).then(function (r) {
            if (!r.ok) throw new Error('bad status');
            return r.blob();
          }).then(function (blob) {
            saveBlob((u.split('?')[0].split('/').pop() || 'image-' + i).slice(0, 80), blob);
            done++;
          }).catch(function () { failed.push(u); });
        });
      }, Promise.resolve()).then(function () {
        if (!failed.length) return say('Downloaded ' + done + ' images');
        show(failed.join('\n'));
        copy(failed.join('\n')).then(function () {
          say(done + ' saved. ' + failed.length + ' blocked by the site (CORS), URLs copied', 4500);
        });
      });
    });

    click('tables', function () {
      var tables = Array.prototype.slice.call(document.querySelectorAll('table')).slice(0, 10);
      if (!tables.length) return say('No tables found');
      tables.forEach(function (t, i) {
        var csv = Array.prototype.map.call(t.rows, function (row) {
          return Array.prototype.map.call(row.cells, function (c) {
            return '"' + c.innerText.replace(/\s+/g, ' ').trim().replace(/"/g, '""') + '"';
          }).join(',');
        }).join('\n');
        later(function () { saveBlob('table-' + (i + 1) + '.csv', new Blob([csv], { type: 'text/csv' })); }, i * 300);
      });
      say('Saving ' + tables.length + ' table(s) as CSV');
    });

    click('heads', function () {
      var lines = Array.prototype.map.call(document.querySelectorAll('h1,h2,h3,h4,h5,h6'), function (h) {
        var lvl = parseInt(h.tagName.charAt(1), 10);
        return new Array(lvl).join('  ') + h.innerText.replace(/\s+/g, ' ').trim().slice(0, 100);
      }).filter(function (l) { return l.trim(); });
      if (!lines.length) return say('No headings found');
      show(lines.join('\n'));
      copy(lines.join('\n')).then(function () { say('Copied ' + lines.length + ' headings'); });
    });

    click('text', function () {
      var sel = String(window.getSelection() || '');
      var t = sel.trim() ? sel : document.body.innerText;
      copy(t).then(function (ok) {
        say(ok ? 'Copied ' + t.length + ' characters' + (sel.trim() ? ' (your selection)' : '') : 'Copy blocked');
      });
    });

    click('stats', function () {
      var s = refreshStat();
      var sel = (String(window.getSelection() || '').trim().match(/\S+/g) || []).length;
      show([
        'Words: ' + s.words,
        'Characters: ' + s.text.length,
        'Reading time: ~' + Math.max(1, Math.round(s.words / 200)) + ' min',
        'Selected words: ' + sel,
        'Links: ' + document.links.length,
        'Images: ' + document.images.length,
        'Headings: ' + document.querySelectorAll('h1,h2,h3,h4,h5,h6').length,
        'Tables: ' + document.querySelectorAll('table').length,
        'Forms: ' + document.forms.length,
        'Scripts: ' + document.scripts.length
      ].join('\n'));
    });

    click('fonts', function () {
      var fonts = {};
      var colors = {};
      Array.prototype.slice.call(document.body.querySelectorAll('*'), 0, 1500).forEach(function (el) {
        var s = getComputedStyle(el);
        var f = s.fontFamily.split(',')[0].replace(/["']/g, '').trim();
        fonts[f] = (fonts[f] || 0) + 1;
        [s.color, s.backgroundColor].forEach(function (c) {
          if (c && c !== 'rgba(0, 0, 0, 0)') { var h = toHex(c); colors[h] = (colors[h] || 0) + 1; }
        });
      });
      show('FONTS\n' + topN(fonts, 6).join('\n') + '\n\nCOLORS\n' + topN(colors, 10).join('\n'));
    });

    /* =================== DESIGN =================== */
    sw('edit', function () { document.designMode = 'on'; }, function () { document.designMode = 'off'; });
    cls('outline', 'ug-outline');
    cls('hl', 'ug-links');

    $('#font').addEventListener('change', function (e) {
      var v = e.target.value;
      fontStyle.textContent = v ? 'body,body *' + X + '{font-family:' + v + '!important}' : '';
    });

    click('eye', function () {
      if (!window.EyeDropper) return say('Eyedropper needs Chrome or Edge', 3500);
      new window.EyeDropper().open().then(function (r) {
        copy(r.sRGBHex).then(function () { say('Copied ' + r.sRGBHex); });
      }).catch(function () {});
    });

    var brush = 4;
    rng('brush', function (v) { brush = v; }, pxf);
    sw('doodle', function () {
      if (!dd) {
        dd = overlay('ug-doodle', true);
        dd.c.style.cursor = 'crosshair';
        var drawing = false;
        var last = null;
        dd.c.addEventListener('pointerdown', function (e) {
          drawing = true;
          last = [e.clientX, e.clientY];
          dd.c.setPointerCapture(e.pointerId);
        });
        dd.c.addEventListener('pointermove', function (e) {
          if (!drawing) return;
          var x = dd.ctx;
          x.strokeStyle = $('#dcol').value;
          x.lineWidth = brush;
          x.lineCap = 'round';
          x.beginPath();
          x.moveTo(last[0], last[1]);
          x.lineTo(e.clientX, e.clientY);
          x.stroke();
          last = [e.clientX, e.clientY];
        });
        var stop = function () { drawing = false; };
        dd.c.addEventListener('pointerup', stop);
        dd.c.addEventListener('pointercancel', stop);
      }
      dd.c.style.pointerEvents = 'auto';
    }, function () { if (dd) dd.c.style.pointerEvents = 'none'; });
    click('dclear', function () { if (dd) dd.ctx.clearRect(0, 0, dd.c.width, dd.c.height); });

    var gridEl = null;
    var gridSz = 40;
    sw('grid', function () {
      gridEl = mkDiv('ug-grid', 'position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483645;' +
        'background-image:linear-gradient(rgba(37,99,235,.4) 1px,transparent 1px),' +
        'linear-gradient(90deg,rgba(37,99,235,.4) 1px,transparent 1px);background-size:' + gridSz + 'px ' + gridSz + 'px;');
    }, function () { if (gridEl) { gridEl.remove(); gridEl = null; } });
    rng('gridsz', function (v) { gridSz = v; if (gridEl) gridEl.style.backgroundSize = v + 'px ' + v + 'px'; }, pxf);

    var rulerEl = null;
    var rulerH = 60;
    function rulerMove(e) { if (rulerEl) rulerEl.style.top = (e.clientY - rulerH / 2) + 'px'; }
    sw('ruler', function () {
      rulerEl = mkDiv('ug-ruler', 'position:fixed;left:0;width:100vw;height:' + rulerH + 'px;top:' + (window.innerHeight / 2) +
        'px;pointer-events:none;z-index:2147483645;box-shadow:0 0 0 100vmax rgba(0,0,0,.55);');
      window.addEventListener('mousemove', rulerMove);
    }, function () {
      window.removeEventListener('mousemove', rulerMove);
      if (rulerEl) { rulerEl.remove(); rulerEl = null; }
    });
    rng('rulerh', function (v) { rulerH = v; if (rulerEl) rulerEl.style.height = v + 'px'; }, pxf);
    cleanups.push(function () { window.removeEventListener('mousemove', rulerMove); });

    /* =================== TOOLS =================== */
    var unlockEvents = ['contextmenu', 'copy', 'cut', 'paste', 'selectstart', 'dragstart'];
    function unlockFn(e) { e.stopImmediatePropagation(); }
    cleanups.push(function () {
      unlockEvents.forEach(function (n) { window.removeEventListener(n, unlockFn, true); });
    });
    sw('unlock', function () {
      html.classList.add('ug-unlock');
      unlockEvents.forEach(function (n) { window.addEventListener(n, unlockFn, true); });
      say('Copy, select and right-click unlocked');
    }, function () {
      html.classList.remove('ug-unlock');
      unlockEvents.forEach(function (n) { window.removeEventListener(n, unlockFn, true); });
    });

    sw('pw', function () {
      document.querySelectorAll('input[type=password]').forEach(function (i) {
        i.setAttribute('data-ug-pw', '1');
        i.type = 'text';
      });
    }, function () {
      document.querySelectorAll('input[data-ug-pw]').forEach(function (i) {
        i.type = 'password';
        i.removeAttribute('data-ug-pw');
      });
    });

    function onDelClick(e) {
      if (!html.classList.contains('ug-del')) return;
      if (e.composedPath().indexOf(host) !== -1) return;
      var t = e.target;
      if (!t || t === html || t === document.body || (t.id && t.id.indexOf('ug-') === 0)) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      t.classList.add('ug-gone');
      delStack.push(t);
    }
    document.addEventListener('click', onDelClick, true);
    cleanups.push(function () { document.removeEventListener('click', onDelClick, true); });
    cls('del', 'ug-del');
    click('undo', function () {
      var el = delStack.pop();
      if (el) { el.classList.remove('ug-gone'); say('Restored (' + delStack.length + ' left)'); }
      else say('Nothing to undo');
    });

    sw('mute', function () {
      document.querySelectorAll('video,audio').forEach(function (m) {
        if (!m.muted) { m.muted = true; m.setAttribute('data-ug-muted', '1'); }
      });
    }, function () {
      document.querySelectorAll('[data-ug-muted]').forEach(function (m) {
        m.muted = false;
        m.removeAttribute('data-ug-muted');
      });
    });

    click('overlays', function () {
      var n = 0;
      var vw = window.innerWidth;
      var vh = window.innerHeight;
      document.body.querySelectorAll('*').forEach(function (el) {
        var s = getComputedStyle(el);
        if (s.position !== 'fixed' && s.position !== 'sticky') return;
        var r = el.getBoundingClientRect();
        var big = r.width * r.height >= vw * vh * 0.4;
        var z = parseInt(s.zIndex, 10) || 0;
        if (big || (s.position === 'fixed' && z >= 1000)) { el.classList.add('ug-hidefix'); n++; }
      });
      html.classList.add('ug-unscroll');
      say(n ? 'Removed ' + n + ' overlay(s), scrolling restored' : 'No overlays found, scrolling unlocked');
    });

    click('top', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
    click('bottom', function () { window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' }); });

    click('md', function () {
      var title = document.title.replace(/[\[\]]/g, '');
      copy('[' + title + '](' + location.href + ')').then(function () { say('Copied Markdown link'); });
    });

    click('clean', function () {
      var u;
      try { u = new URL(location.href); } catch (e) { return say('Could not parse URL'); }
      var drop = [];
      u.searchParams.forEach(function (v, k) {
        if (/^(utm_|fbclid|gclid|msclkid|mc_|igshid|yclid|_hsenc|_hsmi)/i.test(k)) drop.push(k);
      });
      drop.forEach(function (k) { u.searchParams.delete(k); });
      copy(u.toString()).then(function () {
        say(drop.length ? 'Copied URL (removed ' + drop.length + ' tracking params)' : 'Copied URL (already clean)');
      });
    });

    click('wayback', function () { window.open('https://web.archive.org/web/' + location.href, '_blank', 'noopener'); });
    click('print', function () { window.print(); });

    function eachMedia(fn) { document.querySelectorAll('video,audio').forEach(fn); }
    rng('rate', function (v) { cfg.rate = v; eachMedia(function (m) { m.playbackRate = v; }); },
      function (v) { return v + 'x'; });
    function onPlay(e) {
      if (cfg.rate !== 1 && e.target && e.target.playbackRate !== undefined) e.target.playbackRate = cfg.rate;
    }
    document.addEventListener('play', onPlay, true);
    cleanups.push(function () {
      document.removeEventListener('play', onPlay, true);
      if (cfg.rate !== 1) eachMedia(function (m) { m.playbackRate = 1; });
    });

    rng('refresh', function (v) {
      clearInterval(refreshId);
      refreshId = null;
      if (v > 0) {
        refreshId = setInterval(function () { location.reload(); }, v * 1000);
        say('Auto refresh every ' + v + 's');
      }
    }, offOr('s'));

    function clearMarks() {
      document.querySelectorAll('mark.ug-mark').forEach(function (m) {
        var p = m.parentNode;
        if (!p) return;
        p.replaceChild(document.createTextNode(m.textContent), m);
        p.normalize();
      });
    }
    function highlight(term) {
      clearMarks();
      if (!term) return 0;
      var re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      var nodes = [];
      var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode: function (n) {
          var p = n.parentNode ? n.parentNode.nodeName : '';
          return (/^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|MARK)$/.test(p) || !n.nodeValue.trim())
            ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
        }
      });
      while (w.nextNode()) nodes.push(w.currentNode);
      var count = 0;
      nodes.forEach(function (n) {
        if (count >= 500) return;
        var txt = n.nodeValue;
        var m;
        var last = 0;
        var frag = null;
        re.lastIndex = 0;
        while (count < 500 && (m = re.exec(txt))) {
          if (!frag) frag = document.createDocumentFragment();
          frag.appendChild(document.createTextNode(txt.slice(last, m.index)));
          var mk = document.createElement('mark');
          mk.className = 'ug-mark';
          mk.style.cssText = 'background:#fde047;color:#000;';
          mk.textContent = m[0];
          frag.appendChild(mk);
          last = m.index + m[0].length;
          count++;
        }
        if (frag) {
          frag.appendChild(document.createTextNode(txt.slice(last)));
          n.parentNode.replaceChild(frag, n);
        }
      });
      var first = document.querySelector('mark.ug-mark');
      if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return count;
    }
    var findTimer;
    $('#find').addEventListener('input', function (e) {
      clearTimeout(findTimer);
      var v = e.target.value;
      findTimer = setTimeout(function () {
        var n = highlight(v);
        if (v) say(n + ' match' + (n === 1 ? '' : 'es') + (n >= 500 ? ' (capped)' : ''), 1500);
      }, 250);
      timers.push(findTimer);
    });
    $('#find').addEventListener('keydown', function (e) { e.stopPropagation(); });

    /* =================== FUN =================== */
    rng('mspeed', function (v) { cfg.mskip = 9 - v; });
    sw('matrix', function () {
      var o = overlay('ug-matrix');
      var fs = 16;
      var drops = [];
      var f = 0;
      function init() {
        drops = [];
        for (var i = 0; i < Math.ceil(o.c.width / fs); i++) drops.push(Math.random() * -40);
      }
      init();
      var stop = loop(function () {
        if (++f % cfg.mskip) return;
        var x = o.ctx;
        x.globalCompositeOperation = 'destination-out';
        x.fillStyle = 'rgba(0,0,0,0.12)';
        x.fillRect(0, 0, o.c.width, o.c.height);
        x.globalCompositeOperation = 'source-over';
        x.fillStyle = '#22c55e';
        x.font = fs + 'px monospace';
        if (drops.length !== Math.ceil(o.c.width / fs)) init();
        drops.forEach(function (y, i) {
          x.fillText(String.fromCharCode(0x30A0 + Math.floor(Math.random() * 96)), i * fs, y * fs);
          drops[i] = (y * fs > o.c.height && Math.random() > 0.975) ? 0 : y + 1;
        });
      });
      fx.matrix = { o: o, stop: stop };
    }, function () { stopFx('matrix'); });

    rng('snowamt', function (v) { cfg.snow = v; });
    sw('snow', function () {
      var o = overlay('ug-snow');
      snowFlakes = [];
      var stop = loop(function () {
        var x = o.ctx;
        while (snowFlakes.length < cfg.snow) {
          snowFlakes.push({ x: Math.random() * o.c.width, y: Math.random() * o.c.height,
            r: 1 + Math.random() * 3, v: 0.5 + Math.random() * 1.5, d: Math.random() * 6.28 });
        }
        if (snowFlakes.length > cfg.snow) snowFlakes.length = cfg.snow;
        x.clearRect(0, 0, o.c.width, o.c.height);
        x.fillStyle = 'rgba(255,255,255,.95)';
        x.shadowColor = 'rgba(0,0,0,.35)';
        x.shadowBlur = 3;
        snowFlakes.forEach(function (f) {
          f.d += 0.02;
          f.y += f.v;
          f.x += Math.sin(f.d) * 0.6;
          if (f.y > o.c.height) { f.y = -5; f.x = Math.random() * o.c.width; }
          x.beginPath();
          x.arc(f.x, f.y, f.r, 0, 7);
          x.fill();
        });
      });
      fx.snow = { o: o, stop: stop };
    }, function () { stopFx('snow'); });

    rng('rbspeed', function (v) { html.style.setProperty('--ug-rs', v + 's'); }, function (v) { return v + 's'; });
    sw('rainbow', function () {
      rainbowOn = true;
      updateFilt();
      html.classList.add('ug-rainbow');
    }, function () {
      rainbowOn = false;
      html.classList.remove('ug-rainbow');
      updateFilt();
    });

    rng('trailsz', function (v) { cfg.trail = v; });
    sw('trail', function () {
      var o = overlay('ug-trail');
      var ps = [];
      var hue = 0;
      function mv(e) {
        hue = (hue + 8) % 360;
        for (var i = 0; i < 2; i++) {
          ps.push({ x: e.clientX, y: e.clientY, vx: Math.random() * 2 - 1, vy: Math.random() * 2 - 1, l: 1, h: hue });
        }
      }
      window.addEventListener('mousemove', mv);
      var stop0 = loop(function () {
        var x = o.ctx;
        x.clearRect(0, 0, o.c.width, o.c.height);
        for (var i = ps.length - 1; i >= 0; i--) {
          var p = ps[i];
          p.x += p.vx;
          p.y += p.vy;
          p.l -= 0.03;
          if (p.l <= 0) { ps.splice(i, 1); continue; }
          x.fillStyle = 'hsla(' + p.h + ',100%,60%,' + p.l + ')';
          x.beginPath();
          x.arc(p.x, p.y, cfg.trail * p.l, 0, 7);
          x.fill();
        }
      });
      fx.trail = { o: o, stop: function () { stop0(); window.removeEventListener('mousemove', mv); } };
    }, function () { stopFx('trail'); });

    var spotEl = null;
    var spotR = 150;
    function spotMove(e) {
      if (!spotEl) return;
      spotEl.style.left = (e.clientX - spotR) + 'px';
      spotEl.style.top = (e.clientY - spotR) + 'px';
    }
    sw('spot', function () {
      spotEl = mkDiv('ug-spot', 'position:fixed;width:' + spotR * 2 + 'px;height:' + spotR * 2 + 'px;border-radius:50%;' +
        'left:' + (window.innerWidth / 2 - spotR) + 'px;top:' + (window.innerHeight / 2 - spotR) + 'px;' +
        'pointer-events:none;z-index:2147483645;box-shadow:0 0 0 100vmax rgba(0,0,0,.78);');
      window.addEventListener('mousemove', spotMove);
    }, function () {
      window.removeEventListener('mousemove', spotMove);
      if (spotEl) { spotEl.remove(); spotEl = null; }
    });
    rng('spotsz', function (v) {
      spotR = v;
      if (spotEl) {
        var r = spotEl.getBoundingClientRect();
        var cx = r.left + r.width / 2;
        var cy = r.top + r.height / 2;
        spotEl.style.width = spotEl.style.height = v * 2 + 'px';
        spotEl.style.left = (cx - v) + 'px';
        spotEl.style.top = (cy - v) + 'px';
      }
    }, pxf);
    cleanups.push(function () { window.removeEventListener('mousemove', spotMove); });

    rng('confamt', function (v) { cfg.confetti = v; });
    click('confetti', function () {
      var key = 'confetti' + (++uid);
      var o = overlay('ug-' + key);
      var ps = [];
      for (var i = 0; i < cfg.confetti; i++) {
        ps.push({ x: window.innerWidth / 2, y: window.innerHeight * 0.6, vx: (Math.random() - 0.5) * 16,
          vy: -Math.random() * 16 - 4, r: 3 + Math.random() * 4, h: Math.random() * 360, l: 1 });
      }
      var stop = loop(function () {
        var x = o.ctx;
        x.clearRect(0, 0, o.c.width, o.c.height);
        var alive = 0;
        ps.forEach(function (p) {
          p.vy += 0.35;
          p.x += p.vx;
          p.y += p.vy;
          p.l -= 0.008;
          if (p.l > 0) {
            alive++;
            x.fillStyle = 'hsla(' + p.h + ',100%,55%,' + Math.min(1, p.l * 2) + ')';
            x.fillRect(p.x, p.y, p.r, p.r * 1.6);
          }
        });
        if (!alive) stopFx(key);
      });
      fx[key] = { o: o, stop: stop };
    });

    click('roll', function () {
      html.classList.add('ug-roll');
      later(function () { html.classList.remove('ug-roll'); }, 1300);
    });

    rng('shakeamt', function (v) { cfg.shake = v; }, pxf);
    click('shake', function () {
      var k = [];
      for (var i = 0; i < 14; i++) {
        k.push({ transform: 'translate(' + ((Math.random() * 2 - 1) * cfg.shake) + 'px,' +
          ((Math.random() * 2 - 1) * cfg.shake) + 'px)' });
      }
      k.push({ transform: 'translate(0,0)' });
      document.body.animate(k, { duration: 700, easing: 'linear' });
    });

    /* =================== keyboard =================== */
    function onKey(e) {
      if (binding) {
        e.preventDefault();
        e.stopPropagation();
        ckey = e.key;
        binding = false;
        $('#keybtn').textContent = keyName(ckey);
        say('Collapse key set to ' + keyName(ckey));
        return;
      }
      if (e.key !== ckey) return;
      if (e.key === 'Escape' && html.classList.contains('ug-del')) { setSwitch('del', false); return; }
      if (ckey !== 'Escape') {
        var t = e.target;
        if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      }
      toggleCollapse();
    }
    window.addEventListener('keydown', onKey, true);
    cleanups.push(function () { window.removeEventListener('keydown', onKey, true); });
  }

  /* =====================================================================
     cleanup
     ===================================================================== */
  function stopFx(k) {
    var f = fx[k];
    if (!f) return;
    if (f.stop) f.stop();
    if (f.o) f.o.close();
    delete fx[k];
  }

  function destroy() {
    timers.forEach(clearTimeout);
    clearInterval(refreshId);
    scrollSpeed = 0;
    if (scrollRaf) cancelAnimationFrame(scrollRaf);
    Object.keys(fx).forEach(function (k) { stopFx(k); });
    if (dd) { dd.close(); dd = null; }
    extras.forEach(function (el) { el.remove(); });
    Array.prototype.slice.call(html.classList).forEach(function (c) {
      if (c.indexOf('ug-') === 0) html.classList.remove(c);
    });
    ['--ug-b', '--ug-c', '--ug-s', '--ug-sp', '--ug-g', '--ug-bl', '--ug-h', '--ug-rs'].forEach(function (p) {
      html.style.removeProperty(p);
    });
    document.querySelectorAll('.ug-hidefix,.ug-gone').forEach(function (el) {
      el.classList.remove('ug-hidefix');
      el.classList.remove('ug-gone');
    });
    document.querySelectorAll('mark.ug-mark').forEach(function (m) {
      if (m.parentNode) { m.parentNode.replaceChild(document.createTextNode(m.textContent), m); }
    });
    document.querySelectorAll('input[data-ug-pw]').forEach(function (i) { i.type = 'password'; i.removeAttribute('data-ug-pw'); });
    document.querySelectorAll('[data-ug-muted]').forEach(function (m) { m.muted = false; m.removeAttribute('data-ug-muted'); });
    document.designMode = 'off';
    document.body.style.zoom = origZoom;
    cleanups.forEach(function (fn) { try { fn(); } catch (e) {} });
    pageStyle.remove();
    fontStyle.remove();
    adjStyle.remove();
    host.remove();
    delete window.__utilityGui;
  }
})();
