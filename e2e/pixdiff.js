// Pixel-diff two PNGs over an optional y band. node _pixdiff.js a.png b.png [y0] [y1]
const fs = require('fs');
const path = require('path');
const { buildDriver } = require('./helpers/driver');
const D = require('./devices');
(async () => {
  const [a, b, y0 = 0, y1 = 0] = process.argv.slice(2);
  const load = (f) => fs.readFileSync(path.join(__dirname, 'screenshots', f)).toString('base64');
  const d = await buildDriver({ device: D.find((x) => x.id === 'desktop'), dpr: 1 });
  try {
    await d.get('about:blank');
    const r = await d.executeAsyncScript(
      'var A = arguments[0], B = arguments[1], Y0 = +arguments[2], Y1 = +arguments[3], done = arguments[4];' +
      'function load(s){return new Promise(function(res){var i=new Image();i.onload=function(){res(i)};i.src="data:image/png;base64,"+s})}' +
      'Promise.all([load(A),load(B)]).then(function(ims){' +
      '  var a=ims[0], b=ims[1];' +
      '  var y0=Y0, y1=Y1||Math.min(a.height,b.height);' +
      '  var w=Math.min(a.width,b.width), h=y1-y0;' +
      '  function data(im){var c=document.createElement("canvas");c.width=w;c.height=h;' +
      '    var x=c.getContext("2d");x.drawImage(im,0,-y0);return x.getImageData(0,0,w,h).data}' +
      '  var da=data(a), db=data(b), diff=0, rows={};' +
      '  for(var i=0;i<da.length;i+=4){' +
      '    var dl=Math.max(Math.abs(da[i]-db[i]),Math.abs(da[i+1]-db[i+1]),Math.abs(da[i+2]-db[i+2]));' +
      '    if(dl>16){diff++;var row=y0+Math.floor((i/4)/w);rows[row]=(rows[row]||0)+1}}' +
      '  var hot=Object.keys(rows).map(Number).sort(function(p,q){return rows[q]-rows[p]}).slice(0,8);' +
      '  done({size:w+"x"+h, diffPixels:diff, pct:+(100*diff/(w*h)).toFixed(3),' +
      '    hottestRows:hot.map(function(r){return r+":"+rows[r]})});' +
      '});',
      load(a), load(b), String(y0), String(y1),
    );
    console.log(JSON.stringify(r, null, 1));
  } finally { await d.quit(); }
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
