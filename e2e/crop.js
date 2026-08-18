// Crop the top N px off a tall element shot so I can actually look at the rows.
const fs = require('fs'), path = require('path');
const { buildDriver } = require('./helpers/driver');
const D = require('./devices');
(async () => {
  const src = process.argv[2], h = +(process.argv[3] || 500), out = process.argv[4];
  const b64 = fs.readFileSync(path.join(__dirname, 'screenshots', src)).toString('base64');
  const d = await buildDriver({ device: D.find((x) => x.id === 'iphone-se'), dpr: 1 });
  try {
    await d.get('about:blank');
    const r = await d.executeAsyncScript(`
      const [b64, h, done] = arguments;
      const im = new Image();
      im.onload = () => { const c = document.createElement('canvas');
        c.width = im.width; c.height = Math.min(h, im.height);
        c.getContext('2d').drawImage(im, 0, 0);
        done(c.toDataURL('image/png').split(',')[1]); };
      im.src = 'data:image/png;base64,' + b64;
    `, b64, h);
    fs.writeFileSync(path.join(__dirname, 'screenshots', out), r, 'base64');
    console.log('wrote', out);
  } finally { await d.quit(); }
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
