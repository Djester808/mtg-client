#!/usr/bin/env node
//
// Writes a .jpg beside every capture .png, so sheet.js can build a page small enough to
// publish.
//
//   node compress.js [--quality 72]
//
// The PNGs stay exactly as they were: pixdiff.js compares them byte-for-byte and a lossy
// copy would make every diff meaningless. This only exists because the full contact sheet
// is ~17 MB of embedded PNG, and the ceiling for publishing one is 16 MB — a sheet that
// cannot be sent is a sheet nobody outside this machine ever sees.
//
// Encoding happens in the browser the harness already drives, for the same reason
// pixdiff.js diffs there: it means no image dependency in a repo that has none.

const fs = require('fs');
const path = require('path');
const { buildDriver } = require('./helpers/driver');

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : fallback;
};
const QUALITY = opt('quality', 72) / 100;

const OUT_DIR = path.join(__dirname, 'screenshots');

function captures(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...captures(full));
    else if (entry.name.endsWith('.png')) found.push(full);
  }
  return found;
}

const ENCODE = `
  const done = arguments[arguments.length - 1];
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    done(c.toDataURL('image/jpeg', arguments[1]).split(',')[1]);
  };
  img.onerror = () => done(null);
  img.src = 'data:image/png;base64,' + arguments[0];
`;

(async () => {
  const files = captures(OUT_DIR);
  if (!files.length) {
    console.error('compress: no captures found. Run shoot.js first.');
    process.exit(1);
  }

  const d = await buildDriver({});
  let written = 0;
  let pngBytes = 0;
  let jpgBytes = 0;

  try {
    await d.manage().setTimeouts({ script: 60000 });
    await d.get('about:blank');

    for (const png of files) {
      const source = fs.readFileSync(png);
      const encoded = await d.executeAsyncScript(ENCODE, source.toString('base64'), QUALITY);
      if (!encoded) continue;

      const jpg = png.replace(/\.png$/i, '.jpg');
      const bytes = Buffer.from(encoded, 'base64');
      fs.writeFileSync(jpg, bytes);

      pngBytes += source.length;
      jpgBytes += bytes.length;
      written++;
    }
  } finally {
    await d.quit();
  }

  const mb = (n) => (n / 1024 / 1024).toFixed(1) + ' MB';
  console.log(`compress: ${written} capture(s), ${mb(pngBytes)} of PNG -> ${mb(jpgBytes)} of JPEG`);
})();
