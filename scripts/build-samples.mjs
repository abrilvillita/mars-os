/**
 * Build public/data/m20/samples.json from NASA's "Mars Rock Samples" page.
 * Usage: node scripts/build-samples.mjs
 * Copies the table fields only (name, feature, type, sol/date sealed, rock type, height,
 * current location, image). Nothing is inferred; missing values stay null.
 */
import { writeFileSync } from 'node:fs';

const URL = 'https://science.nasa.gov/mission/mars-2020-perseverance/mars-rock-samples/';
const html = await (await fetch(URL, { headers: { 'User-Agent': 'Mozilla/5.0 (MARS OS data build)' } })).text();
const t = html
  .replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '')
  .replace(/<img[^>]*src="([^"]+)"[^>]*>/g, ' [IMG $1] ').replace(/<[^>]+>/g, ' ')
  .replace(/&#8217;|&rsquo;/g, "'").replace(/&amp;/g, '&').replace(/&#[0-9]+;|&nbsp;/g, ' ').replace(/\s+/g, ' ');
const STOP = '(?:Feature Name|Sample Type|Sol Sealed|Date Sealed|Rock Type|Sample Height(?: cm/in)?|Current Location|Sampling Location|Sample Name|Science Notes|Watch Video|Read More|View Perseverance|\\[IMG)';
const out = [];
for (let n = 1; n < 100; n++) {
  const i = t.indexOf(`Sample No. ${n} `);
  if (i < 0) break;
  let j = t.indexOf(`Sample No. ${n + 1} `);
  if (j < 0) j = t.indexOf('Sample No. Date Sealed');
  const p = t.slice(i, j < 0 ? undefined : j);
  const head = t.slice(Math.max(0, i - 80), i).trim();
  const g = (k) => {
    const m = p.match(new RegExp(k + '\\s*:\\s*(.*?)\\s+' + STOP));
    return m ? m[1].trim() : null;
  };
  const img = (p.match(/\[IMG ([^\]]+)\]/) || [])[1];
  const capSol = (p.match(/\(Sol (\d+)/i) || [])[1];
  const sol = g('Sol Sealed');
  const date = g('Date Sealed');
  const name = g('Sample Name') ?? head.split(/NASA\/JPL-Caltech\S*|\.\s/).pop().replace(/^.*Sample \d+\s*/, '').replace(/\s*\(aka.*$/, '').trim();
  out.push({
    n,
    name,
    feature: g('Feature Name'),
    samplingLocation: g('Sampling Location'),
    type: g('Sample Type'),
    solSealed: sol && /^\d+$/.test(sol) ? +sol : null,
    dateSealed: date && date !== 'TBD' ? date : null,
    rockType: g('Rock Type'),
    height: g('Sample Height(?: cm/in)?'),
    location: /Depot/i.test(g('Current Location') ?? '') ? 'depot' : 'rover',
    image: img ? img.split('?')[0] : null,
    imageSol: capSol ? +capSol : null,
  });
}
const doc = {
  source: URL,
  retrieved: new Date().toISOString().slice(0, 10),
  note: "Fields copied from NASA's sample table. The map position is derived in the app from the rover position on the sealing sol (or the image sol when sealing is TBD) in NASA's MMGIS waypoints.",
  samples: out,
};
writeFileSync('public/data/m20/samples.json', JSON.stringify(doc, null, 1) + '\n');
console.log(out.length, 'samples');
