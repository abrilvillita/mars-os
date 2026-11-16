/**
 * Attach official NASA videos/audio (NASA Image and Video Library) to explorers.json.
 * Usage: node scripts/build-media.mjs — resolves each nasa_id to a playable file and a thumbnail.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const MEDIA = {
  perseverance: ['JPL-20210222-M2020f-0003a-M2020_Audio_A_002', 'JPL-20220401-M2020f-0001-Puff Whir Zap New Sounds from Mars', 'JPL-20230516-M2020f-0002-Sounds of Mars NoVoiceOver', 'JPL-20210222-M2020f-0001-Perseverance Rover’s Descent and Touchdown on Mars'],
  ingenuity: ['JPL-20210419-TECHf-0001-First Video of NASA’s Ingenuity Mars Helicopter in Flight', 'JPL-20210425-TECHf-0001-Ingenuity Third Flight MastcamZ Video'],
  curiosity: ['JPL-20240717-MSLf-0001-Curiosity_Explores_Gediz_Vallis_360_View_8k', 'JPL-20200303-MSLf-0001-Curiosity Rover Snaps Billion Pixel Panorama'],
  insight: ['JPL-20190423-INSIGHf-0001-First Likely Marsquake Heard by NASAs InSight'],
};

async function resolve(id) {
  const s = await (await fetch(`https://images-api.nasa.gov/search?nasa_id=${encodeURIComponent(id)}`)).json();
  const it = s.collection.items[0];
  if (!it) return null;
  const d = it.data[0];
  const files = await (await fetch(it.href)).json();
  const pick = (re) => files.find((f) => re.test(f));
  const file = pick(/~mobile\.mp4$/) ?? pick(/~preview\.mp4$/) ?? pick(/~small\.mp4$/) ?? pick(/~medium\.mp4$/) ?? pick(/\.mp4$/) ?? pick(/\.(mp3|m4a|wav)$/);
  const thumb = it.links?.find((l) => l.rel === 'preview')?.href ?? pick(/~(small|thumb)\.jpg$/) ?? null;
  return file ? { id: d.nasa_id, title: d.title, date: (d.date_created ?? '').slice(0, 10), type: d.media_type, src: file.replace(/^http:/, 'https:').replace(/ /g, '%20'), thumb: thumb ? thumb.replace(/^http:/, 'https:').replace(/ /g, '%20') : null, page: `https://images.nasa.gov/details/${encodeURIComponent(d.nasa_id)}` } : null;
}

const path = 'public/data/explorers.json';
const doc = JSON.parse(readFileSync(path, 'utf8'));
for (const e of doc.explorers) {
  const ids = MEDIA[e.id];
  if (!ids) continue;
  e.media = [];
  for (const id of ids) {
    const m = await resolve(id);
    if (m) e.media.push(m);
    console.log(e.id, m ? m.src : 'MISSING ' + id);
  }
}
writeFileSync(path, JSON.stringify(doc, null, 2) + '\n');
