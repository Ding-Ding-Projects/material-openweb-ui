// The dim sum surprise.
//
// Ten per cent of launches, one dish, and then it goes away by itself. The
// rules around it are all about restraint, and each one exists because the
// obvious implementation breaks it:
//
//   - It fires at most ONCE per load. Not "we only call it once" — a guard, so
//     that calling it twice cannot produce two. The difference matters the day
//     someone adds a second call site.
//   - It never gates startup, never steals focus and never appears mid-task. It
//     is a notification, which is the one surface that already promises all
//     three.
//   - There is no setting to switch it off. A surprise with an off switch is a
//     feature with a preference, and the preference is the part people would
//     then have to think about.
//   - School mode removes it entirely — not "hides it with a note", which would
//     name the thing being hidden.
//
// And the photographs: they live in the public catalogue and are never copied
// into this repository. Where the catalogue has no published photograph of a
// dish, the surface SAYS so. Filling that gap with a local image would quietly
// turn "we do not vendor photographs" into "we vendor photographs sometimes".

export const CATALOG = 'https://github.com/Ding-Ding-Projects/dim-sum-photos';

/**
 * The dishes.
 *
 * `photo` names the file in the public catalogue, or is null where the
 * catalogue does not have one yet. Null is a fact to state, not a gap to fill.
 */
export const DISHES = [
  { en: 'Har Gow', zh: '蝦餃', photo: 'har-gow.jpg' },
  { en: 'Scallop Har Gow', zh: '帶子蝦餃', photo: 'scallop-har-gow.jpg' },
  { en: 'Bamboo Shoot Har Gow', zh: '筍尖蝦餃', photo: null },
  { en: 'Siu Mai', zh: '燒賣', photo: 'siu-mai.jpg' },
  { en: 'Char Siu Bao', zh: '叉燒包', photo: null },
  { en: 'Cheung Fun', zh: '腸粉', photo: 'cheung-fun.jpg' }
];

export const CHANCE = 0.10;

/**
 * Fired at most once per page load.
 *
 * Module scope rather than a caller's variable, so every call site shares the
 * one guard however many of them there turn out to be.
 */
let fired = false;

export function hasFired() {
  return fired;
}

/**
 * Decides whether the surprise happens, and what it says.
 *
 * Returns null when it does not happen, so the caller has nothing to render and
 * cannot accidentally render an empty one. `random` is injectable purely so a
 * test can be deterministic; nothing else passes it.
 */
export function draw({ schoolOn, random = Math.random } = {}) {
  if (fired) return null;
  // School mode first, so the random draw is not even consulted — a suppressed
  // feature should not be spending randomness that another feature might one
  // day depend on the sequence of.
  if (schoolOn) return null;
  if (random() >= CHANCE) return null;

  fired = true;
  const dish = DISHES[Math.floor(random() * DISHES.length)] || DISHES[0];
  return {
    dish,
    title: 'A dish, for no reason at all',
    // Two different sentences, because they are two different facts. Saying the
    // same thing about a dish with a photograph and one without would make the
    // absence invisible.
    provenance: dish.photo
      ? 'The photograph lives in the public catalogue rather than in this repository, and nothing here loads a remote image.'
      : 'The catalogue has no published photograph of this one yet. Nothing is substituted locally to fill the gap — that would quietly turn "no photographs are vendored" into "photographs are vendored sometimes".',
    catalogUrl: CATALOG
  };
}

/** For tests only: forgets that it has fired, so a second draw can be observed. */
export function resetForTest() {
  fired = false;
}
