// Choosing the application mark.
//
// The interesting part of this surface is what happens between picking a file
// and seeing it applied, which is: nothing, until every check has passed. The
// bytes are read, the header is verified, the size is bounded, and only then is
// anything decoded. A file that fails leaves the previous mark exactly where it
// was — a half-applied logo is worse than a refused one, because nobody knows
// which half they are looking at.

import { h, add, clear, icon } from '../../docs/assets/js/dom.js';
import * as ui from '../../docs/assets/js/ui.js';
import * as colour from '../../docs/assets/js/colour.js';
import * as state from './state.js';
import * as logo from './core/logo.js';

/** The surfaces the mark is actually drawn on, for the contrast check. */
function surfaces() {
  const read = (name, fallback) => {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    try {
      return colour.parse(raw || fallback).rgb;
    } catch {
      return colour.parse(fallback).rgb;
    }
  };
  return [
    { label: 'title bar', rgb: read('--sclow', '#F7F2FA') },
    { label: 'window background', rgb: read('--sur', '#FEF7FF') }
  ];
}

// ---------------------------------------------------------------- rendering

/**
 * Draws the cropped source into a square canvas at one size.
 *
 * The mark is drawn on transparent rather than on a colour, so a platform that
 * masks it to a circle does not leave a square of background behind the curve.
 */
function drawVariant(bitmap, crop, size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';

  const shortest = Math.min(bitmap.width, bitmap.height);
  const px = crop.size * shortest;
  ctx.drawImage(bitmap, crop.x * bitmap.width, crop.y * bitmap.height, px, px, 0, 0, size, size);
  return canvas;
}

function canvasBytes(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error('The canvas produced no image at all.')); return; }
      blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)), reject);
    }, 'image/png');
  });
}

/** The average colour of the mark, for the contrast warnings. */
function averageColour(canvas) {
  const ctx = canvas.getContext('2d');
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let r = 0;
  let g = 0;
  let b = 0;
  let weight = 0;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] / 255;
    // Transparent pixels are not a colour and must not drag the average toward
    // black, which is what including them does.
    if (a < 0.05) continue;
    r += data[i] * a;
    g += data[i + 1] * a;
    b += data[i + 2] * a;
    weight += a;
  }
  if (!weight) return [0.5, 0.5, 0.5];
  return [r / weight / 255, g / weight / 255, b / weight / 255];
}

// ---------------------------------------------------------------- the section

export function render(box, onChanged) {
  clear(box);
  const current = state.get('settings').logo || { kind: 'preset', preset: 'seed' };

  const preview = h('div', { class: 'logo__preview' });
  const status = h('div', { class: 'logo__status', role: 'status' });
  const variantsRow = h('div', { class: 'logo__variants' });
  const warnings = h('div', { class: 'logo__warnings' });

  // The crop is held here while it is being adjusted, and only written when
  // applied — a half-adjusted crop is not a setting.
  let pending = null;

  function paintPreview() {
    clear(preview);
    if (current.kind === 'preset') {
      const preset = logo.PRESETS.find((p) => p.id === current.preset) || logo.PRESETS[0];
      const wrap = h('div', { class: 'logo__mark' });
      wrap.innerHTML = logo.presetSvg(preset, 96);
      add(preview, wrap);
    } else if (current.dataUrl) {
      add(preview, h('img', { src: current.dataUrl, alt: 'The current application mark', class: 'logo__mark' }));
    }
    // The safe area is drawn over whatever the mark is, because the corners are
    // the first thing a platform mask removes and nobody expects that.
    add(preview, h('div', { class: 'logo__safe', 'aria-hidden': 'true' }));
  }

  function apply(next) {
    state.patchSettings({ logo: next });
    state.log('Application mark changed', next.kind === 'preset' ? next.preset : 'a local image');
    Object.assign(current, next);
    paintPreview();
    if (onChanged) onChanged(next);
  }

  // ---------- presets ----------

  const presetRow = h('div', { class: 'logo__presets', role: 'radiogroup', 'aria-label': 'Shipped marks' });
  for (const preset of logo.PRESETS) {
    const btn = h('button', {
      type: 'button', role: 'radio',
      class: 'logo__preset' + (current.kind === 'preset' && current.preset === preset.id ? ' logo__preset--on' : ''),
      'aria-checked': String(current.kind === 'preset' && current.preset === preset.id),
      title: preset.label,
      onclick: () => {
        apply({ kind: 'preset', preset: preset.id });
        clear(status);
        clear(variantsRow);
        clear(warnings);
        render(box, onChanged);
      }
    });
    btn.innerHTML = logo.presetSvg(preset, 44);
    add(presetRow, btn);
  }

  // ---------- a local image ----------

  const file = h('input', {
    type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp,image/bmp',
    'aria-label': 'Choose an image from this computer'
  });

  file.addEventListener('change', async () => {
    const chosen = file.files && file.files[0];
    if (!chosen) return;
    clear(status);
    clear(variantsRow);
    clear(warnings);
    add(status, h('span', { class: 'muted' }, 'Reading the file…'));

    const buffer = await chosen.arrayBuffer();
    const u8 = new Uint8Array(buffer);

    // Everything decidable from the bytes is decided before a decoder sees them.
    const verdict = logo.inspect(u8, chosen.name);
    if (!verdict.ok) {
      clear(status);
      add(status, h('div', { class: 'state state--bad' }, icon('warn'),
        h('div', { class: 'state__body' },
          h('div', { class: 'state__title' }, 'Not applied'),
          h('div', { class: 'state__text' }, verdict.reason),
          verdict.evidence ? h('div', { class: 'state__text mono logo__evidence' }, verdict.evidence) : null)));
      file.value = '';
      return;
    }

    let bitmap;
    try {
      bitmap = await createImageBitmap(new Blob([u8], { type: verdict.mime }));
    } catch (e) {
      clear(status);
      add(status, h('div', { class: 'state state--bad' }, icon('warn'),
        h('div', { class: 'state__body' },
          h('div', { class: 'state__title' }, 'Not applied'),
          h('div', { class: 'state__text' },
            'The header read as a valid ' + verdict.format + ', but the decoder could not finish it: ' +
            (e && e.message ? e.message : 'no reason given') + '. Nothing was changed.'))));
      file.value = '';
      return;
    }

    pending = { bitmap, verdict, crop: { x: 0, y: 0, size: 1 } };
    paintPending();
  });

  // ---------- crop, variants, warnings ----------

  async function paintPending() {
    if (!pending) return;
    const { bitmap, verdict } = pending;
    const crop = logo.normaliseCrop(pending.crop, bitmap.width, bitmap.height);
    pending.crop = crop;

    clear(status);
    add(status,
      h('div', { class: 'logo__read' },
        h('strong', {}, verdict.sniffed),
        h('span', { class: 'muted' }, verdict.width + ' × ' + verdict.height + ' pixels'),
        h('span', { class: 'muted mono logo__evidence' }, verdict.evidence)),
      verdict.note ? h('div', { class: 'logo__note' }, verdict.note) : null,
      cropControls(bitmap));

    // Every variant is generated and then checked against its own bytes, since
    // a canvas export can quietly return nothing or a different format.
    clear(variantsRow);
    const results = [];
    for (const size of logo.VARIANT_SIZES) {
      const canvas = drawVariant(bitmap, crop, size);
      let bytesOut;
      let verified;
      try {
        bytesOut = await canvasBytes(canvas);
        verified = logo.verifyVariant(bytesOut);
      } catch (e) {
        verified = { ok: false, reason: e.message };
      }
      results.push({ size, canvas, verified, bytes: bytesOut });
      add(variantsRow, h('div', { class: 'logo__variant' + (verified.ok ? '' : ' logo__variant--bad') },
        h('div', { class: 'logo__variant-box', style: { width: Math.min(size, 64) + 'px', height: Math.min(size, 64) + 'px' } },
          verified.ok
            ? h('img', { src: canvas.toDataURL('image/png'), alt: size + ' pixel variant', width: String(Math.min(size, 64)), height: String(Math.min(size, 64)) })
            : icon('warn', 'icon icon--sm')),
        h('div', { class: 'logo__variant-label' }, size + 'px'),
        h('div', { class: 'logo__variant-note' },
          verified.ok ? (verified.bytes / 1024).toFixed(1) + ' kB' : 'failed')));
    }

    const failed = results.filter((r) => !r.verified.ok);

    clear(warnings);
    const biggest = results[results.length - 1];
    const avg = averageColour(biggest.canvas);
    for (const line of logo.contrastWarnings(avg, surfaces(), colour.contrast)) {
      add(warnings, h('div', { class: 'state state--warn' }, icon('warn'),
        h('div', { class: 'state__body' }, h('div', { class: 'state__text' }, line))));
    }
    for (const line of logo.safeAreaWarnings({ width: bitmap.width, height: bitmap.height, crop })) {
      add(warnings, h('div', { class: 'state state--warn' }, icon('info'),
        h('div', { class: 'state__body' }, h('div', { class: 'state__text' }, line))));
    }
    if (failed.length) {
      add(warnings, h('div', { class: 'state state--bad' }, icon('warn'),
        h('div', { class: 'state__body' },
          h('div', { class: 'state__title' }, failed.length + ' of ' + results.length + ' sizes did not verify'),
          h('div', { class: 'state__text' },
            'Each generated image is checked against its own bytes rather than trusted. ' +
            failed.map((f) => f.size + 'px: ' + f.verified.reason).join(' ')))));
    }

    add(warnings, h('div', { class: 'logo__actions' },
      h('button', {
        class: 'btn btn--filled',
        disabled: failed.length > 0,
        onclick: () => {
          apply({
            kind: 'image',
            dataUrl: biggest.canvas.toDataURL('image/png'),
            crop,
            source: { format: verdict.format, width: verdict.width, height: verdict.height, bytes: verdict.bytes }
          });
          ui.notify('The mark is applied. The application identity is unchanged.', { kind: 'ok' });
          pending = null;
          render(box, onChanged);
        }
      }, 'Use this mark'),
      h('button', {
        class: 'btn btn--outlined',
        onclick: () => { pending = null; file.value = ''; clear(status); clear(variantsRow); clear(warnings); }
      }, 'Cancel')));
  }

  function cropControls(bitmap) {
    const wrap = h('div', { class: 'logo__crop' });
    const controls = [
      { id: 'size', label: 'Crop size', min: 0.1, max: 1, step: 0.01 },
      { id: 'x', label: 'Horizontal focal point', min: 0, max: 1, step: 0.01 },
      { id: 'y', label: 'Vertical focal point', min: 0, max: 1, step: 0.01 }
    ];
    for (const c of controls) {
      const readout = h('span', { class: 'logo__readout mono' }, Math.round(pending.crop[c.id] * 100) + '%');
      const input = h('input', {
        type: 'range', min: String(c.min), max: String(c.max), step: String(c.step),
        value: String(pending.crop[c.id]),
        'aria-label': c.label + '. Arrow keys adjust.',
        oninput: (e) => {
          pending.crop = { ...pending.crop, [c.id]: Number(e.target.value) };
          readout.textContent = Math.round(Number(e.target.value) * 100) + '%';
        },
        onchange: () => paintPending()
      });
      add(wrap, h('label', { class: 'logo__croprow' },
        h('span', { class: 'logo__croplabel' }, c.label), input, readout));
    }
    return wrap;
  }

  // ---------- the section ----------

  paintPreview();

  add(box,
    h('h2', { class: 'card__title' }, 'Application mark'),
    h('p', { class: 'card__sub' },
      'Presentation only. The mark and the window name never move the package identity, the data directory or the update feed — those are fixed, so renaming the window cannot orphan your settings or point updates at nothing.'),
    h('div', { class: 'logo__row' },
      preview,
      h('div', { class: 'logo__choices' },
        h('div', { class: 'logo__grouplabel' }, 'Shipped marks'),
        presetRow,
        h('div', { class: 'logo__grouplabel' }, 'Or an image from this computer'),
        h('div', { class: 'field' }, file),
        h('p', { class: 'logo__hint' },
          'Decoded on this machine. Nothing is uploaded and no remote converter is involved. The file is identified by its actual bytes, so an extension that disagrees with the contents is refused rather than trusted.'))),
    status,
    variantsRow,
    warnings,
    h('details', { class: 'logo__identity' },
      h('summary', {}, 'What stays fixed whatever the mark is'),
      h('dl', { class: 'logo__idlist' },
        ...Object.entries(logo.IDENTITY).flatMap(([k, v]) => [
          h('dt', {}, k.replace(/([A-Z])/g, ' $1').toLowerCase()),
          h('dd', { class: 'mono' }, v)
        ]))));
}
