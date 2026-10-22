import path from 'node:path';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// Converts the existing official website icon to Xcode's native AppIcon sizes.
// No remote images or third-party image assets are used.
const root = fileURLToPath(new URL('../../', import.meta.url));
const ios = fileURLToPath(new URL('../ios/', import.meta.url));

async function collectIconSets(directory) {
  const sets=[];
  async function visit(dir) {
    for (const entry of await readdir(dir, {withFileTypes:true})) {
      const full = path.join(dir,entry.name);
      if (entry.isDirectory() && entry.name.endsWith('.appiconset')) sets.push(full);
      else if (entry.isDirectory()) await visit(full);
    }
  }
  await visit(directory);
  return sets;
}

const svg = await readFile(path.join(root,'icon.svg'));
const sets = await collectIconSets(ios);
if (sets.length !== 1) throw Error('Expected one Xcode AppIcon.appiconset; found '+sets.length);
const iconSet = sets[0];
const jsonPath = path.join(iconSet,'Contents.json');
const spec = JSON.parse(await readFile(jsonPath,'utf8'));
let generated=0;
for (const image of spec.images || []) {
  const logical = Number(String(image.size||'1024x1024').split('x')[0]);
  const scale = Number(String(image.scale||'1x').replace('x',''));
  const pixels = logical*scale;
  if (!Number.isInteger(pixels) || pixels < 16 || pixels > 2048) throw Error('Invalid AppIcon size');
  if (!image.filename) image.filename = 'AppIcon-'+pixels+'.png';
  if (!/^[a-z0-9_.-]+\.png$/i.test(image.filename)) throw Error('Unsafe icon filename');
  await sharp(svg,{density: 600}).resize(pixels,pixels).flatten({background:'#E6F9F3'}).png().toFile(path.join(iconSet,image.filename));
  generated++;
}
if (!generated) throw Error('Native icon assets were not generated.');
await writeFile(jsonPath,JSON.stringify(spec,null,2)+'\n');
console.log('Generated '+generated+' native iOS AppIcon image(s) from website icon.svg');
