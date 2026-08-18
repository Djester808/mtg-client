// Device profiles for mobile emulation.
//
// A word on fidelity, because it decides how much you can trust a screenshot from here:
// Chrome's mobile emulation changes the *viewport, DPR, touch flags and user agent*, but
// it still renders in Blink. So the Android profiles are essentially exact — Android
// Chrome is the same engine — while the iPhone profiles are indicative only. They will
// not reproduce WebKit's behaviour for `100vh` under the collapsing address bar,
// `env(safe-area-inset-*)`, focus auto-zoom on inputs below 16px, overscroll bounce, or
// `backdrop-filter` cost (the navbar uses backdrop-blur-[12px], so that last one is
// relevant to us). Treat an iPhone shot as "the layout at 393px", not as "what Safari
// does". Ground truth for iOS is a real device on the LAN.
//
// `dpr` only affects the crispness of the PNG, never the layout, so the runner's --dpr
// flag can override it down to 1 to keep contact sheets small.

module.exports = [
  {
    id: 'iphone-se',
    label: 'iPhone SE',
    os: 'ios',
    width: 375,
    height: 667,
    dpr: 2,
    // The narrowest screen still worth supporting. If a layout survives 375 it survives
    // nearly everything in use.
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  },
  {
    id: 'iphone-15-pro',
    label: 'iPhone 15 Pro',
    os: 'ios',
    width: 393,
    height: 852,
    dpr: 3,
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  },
  {
    id: 'pixel-8',
    label: 'Pixel 8',
    os: 'android',
    width: 412,
    height: 915,
    dpr: 2.625,
    ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  },
  {
    id: 'ipad-mini',
    label: 'iPad mini',
    os: 'ios',
    width: 744,
    height: 1133,
    dpr: 2,
    // The tablet break matters on its own: it is wide enough to keep the two-pane
    // grid+panel layout that phones have to give up, so it should NOT collapse to the
    // phone treatment.
    ua: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  },
  {
    id: 'desktop',
    label: 'Desktop',
    os: 'desktop',
    width: 1280,
    height: 900,
    dpr: 1,
    // The control. Every audit number below is only meaningful as a delta against this —
    // a horizontal overflow that already exists at 1280 is not a mobile bug.
    ua: null,
  },
];
