#!/usr/bin/env node

/**
 * add-subcategories.mjs
 * Assigns subcategory field to all links based on tags and category rules
 */

import { readFileSync, writeFileSync } from 'fs';
import { webcrypto } from 'node:crypto';

const { subtle } = webcrypto;
const getRandomValues = (arr) => webcrypto.getRandomValues(arr);
const passphrase = process.argv[2];

if (!passphrase) {
  console.error('Usage: node scripts/add-subcategories.mjs <passphrase>');
  process.exit(1);
}

function toB64(buf) {
  return Buffer.from(buf).toString('base64');
}

function fromB64(str) {
  return Uint8Array.from(Buffer.from(str, 'base64'));
}

async function encryptData(text) {
  const enc = new TextEncoder();
  const salt = getRandomValues(new Uint8Array(16));
  const iv = getRandomValues(new Uint8Array(12));
  const keyMaterial = await subtle.importKey(
    'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']
  );
  const key = await subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 200_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false, ['encrypt']
  );
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text));
  return { iv: toB64(iv), ct: toB64(ct), salt: toB64(salt) };
}

async function decryptData(obj) {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const keyMaterial = await subtle.importKey(
    'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']
  );
  const key = await subtle.deriveKey(
    { name: 'PBKDF2', salt: fromB64(obj.salt), iterations: 200_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false, ['decrypt']
  );
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv: fromB64(obj.iv) }, key, fromB64(obj.ct));
  return dec.decode(pt);
}

// Subcategory assignment rules
const rules = {
  Media: (link) => {
    if (link.tags?.includes('comics')) return 'Comics';
    if (link.tags?.includes('youtube')) return 'YouTube';
    if (link.tags?.includes('music')) return 'Music';
    if (link.tags?.includes('film')) return 'Film & TV';
    if (link.tags?.includes('anime')) return 'Anime';
    return 'Other';
  },

  Research: (link) => {
    if (link.tags?.some(t => ['emotion', 'psychology', 'nostalgia', 'schadenfreude', 'ambivalence'].includes(t))) {
      return 'Emotion & Psychology';
    }
    if (link.tags?.includes('neuroscience')) return 'Neuroscience';
    if (link.url.includes('philpapers') || link.url.includes('arxiv') || link.tags?.some(t => ['anarchism', 'socialism'].includes(t))) {
      return 'Philosophy';
    }
    if (link.tags?.some(t => ['ai', 'ml'].includes(t))) {
      return 'AI/ML & Cognitive Science';
    }
    return 'Academic';
  },

  Technology: (link) => {
    if (link.tags?.some(t => ['ai', 'ml'].includes(t))) return 'AI/ML Platforms';
    if (link.tags?.includes('foss')) return 'Open Source & FOSS';
    if (link.tags?.some(t => ['blender', '3d-printing'].includes(t)) || link.title.includes('3D') || link.title.includes('Blender')) {
      return '3D & Graphics';
    }
    if (link.title.includes('Ardour') || link.tags?.includes('audio')) return 'Audio/DAW';
    return 'Infrastructure & Dev Tools';
  },

  Politics: (link) => {
    if (link.tags?.includes('anarchism')) return 'Anarchism & Anti-State';
    if (link.tags?.includes('socialism')) return 'Socialism & Economics';
    if (link.tags?.includes('housing') || link.tags?.includes('mutual-aid')) return 'Housing & Mutual Aid';
    if (link.tags?.includes('archives')) return 'Archives & History';
    if (link.tags?.includes('foss')) return 'FOSS & Tech Politics';
    if (link.tags?.includes('abolition')) return 'Abolition & Criminal Justice';
    return 'Other';
  },

  Books: () => undefined,           // No subcategories
  'Game Dev': () => undefined,
  Hardware: () => undefined,
  Personal: () => undefined,
  History: () => undefined,
  Organizations: () => undefined,
};

async function main() {
  console.log('Loading encrypted index...');
  const encrypted = JSON.parse(readFileSync('static/docs/private/links-index.enc', 'utf8'));
  const plaintext = await decryptData(encrypted);
  const links = JSON.parse(plaintext);

  console.log(`\nAssigning subcategories to ${links.length} links...\n`);

  const stats = {};
  let assigned = 0;

  links.forEach(link => {
    if (!stats[link.category]) {
      stats[link.category] = {};
    }

    const assignFn = rules[link.category];
    if (assignFn) {
      const subcat = assignFn(link);
      if (subcat) {
        link.subcategory = subcat;
        stats[link.category][subcat] = (stats[link.category][subcat] || 0) + 1;
        assigned++;
      }
    }
  });

  console.log('Subcategory distribution:');
  Object.entries(stats).forEach(([cat, subcats]) => {
    if (Object.keys(subcats).length > 0) {
      console.log(`\n${cat}:`);
      Object.entries(subcats)
        .sort((a, b) => b[1] - a[1])
        .forEach(([subcat, count]) => {
          console.log(`  ${subcat}: ${count}`);
        });
    }
  });

  console.log(`\n\nTotal subcategories assigned: ${assigned}/${links.length}`);

  console.log('\nRe-encrypting and saving...');
  const newEncrypted = await encryptData(JSON.stringify(links));
  writeFileSync('static/docs/private/links-index.enc', JSON.stringify(newEncrypted));
  console.log(`✓ links-index.enc updated with subcategories`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
