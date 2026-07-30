// lines.js — the 45 frozen spoken lines, verbatim from game-design.md.
//
// This table is the game's SAFETY NET, not its voice. At runtime
// `voice-clips.js` prefers, in order: the recorded clip named by
// assets/audio/manifest.json, then the spoken text in data/lines.json (written
// by tools/gen-voice.py so recorded and fallback voice always match), then
// these defaults. Keeping the frozen script in code means the game talks
// correctly on day one — before a single clip has been generated — and a clip
// that never passes whisper QA degrades to the right sentence rather than
// silence.
//
// Keys match the GDD's QLOBE voice keys exactly. If you edit a line here, edit
// game-design.md too and re-run the voice pipeline: the recording is canonical.

export const LINES = {
  // --- global -------------------------------------------------------------
  intro: "Welcome to the world music festival! Pick a lantern on the map, and let's dance around the world!",
  'choose-prompt': 'Where shall we dance? Tap a glowing lantern on the map!',
  'your-turn': "Now it's your turn! Watch the dancer, and find the matching move!",
  'copy-intro': 'Can you copy the dance? Watch closely!',
  'map-prompt': 'You earned the dance card! Drag it home to its place on the map!',
  'placed-cheer': 'You did it! The card is home!',
  'collection-complete': 'Hooray! You danced all around the whole wide world! What a festival!',
  'again-prompt': 'Tap another lantern to keep dancing!',

  // --- nudges -------------------------------------------------------------
  'nudge-copy': 'Good try! Watch the dancer one more time, then tap the move that matches.',
  'nudge-map': 'Almost! Look for the glowing lantern, and drop the card right there.',
  'nudge-idle': 'Tap a card to keep the party going!',

  // --- praise -------------------------------------------------------------
  'praise-1': "Yes! That's the move!",
  'praise-2': 'You found it! Beautiful dancing!',
  'praise-3': "Wonderful! You've got the rhythm!",
  'praise-4': "That's it! What a dancer you are!",

  // --- india --------------------------------------------------------------
  'greet-india': "Namaste! We're in India! This dance is called Kathak. Hear the sitar sing — watch the dancer twirl!",
  'fact-india': 'In India, Kathak dancers wear tiny bells on their ankles that jingle with every step!',
  'move-india-1': 'Twirl like a spinning wheel! Find the twirling move!',
  'move-india-2': 'Stamp, stamp, jingle the bells! Find the stamping move!',
  'move-india-3': 'Wave your arms like a swaying lotus! Find the waving move!',

  // --- brazil -------------------------------------------------------------
  'greet-brazil': "Olá! Welcome to Brazil! It's carnival time — this dance is the samba!",
  'fact-brazil': 'In Brazil, samba dancers parade through the streets at carnival, with feathers as bright as parrots!',
  'move-brazil-1': 'Bounce with quick, happy feet! Find the bouncing move!',
  'move-brazil-2': 'Open your arms wide and sway! Find the swaying move!',
  'move-brazil-3': 'Spin and let the feathers fly! Find the spinning move!',

  // --- japan --------------------------------------------------------------
  'greet-japan': "Konnichiwa! We're in Japan! At the summer festival, everyone dances the Bon Odori!",
  'fact-japan': 'In Japan, people dance Bon Odori in a big circle around a tower of drums, under paper lanterns!',
  'move-japan-1': 'Reach up high, like catching the moon! Find the reaching move!',
  'move-japan-2': 'Clap, then take a little step! Find the clapping move!',
  'move-japan-3': 'Sweep your fan through the air! Find the fan move!',

  // --- ghana --------------------------------------------------------------
  'greet-ghana': 'Akwaaba! Welcome to Ghana! Hear the drums? This dance is called Kpanlogo!',
  'fact-ghana': 'In Ghana, drummers and dancers talk to each other — the drum asks, and the dancer answers!',
  'move-ghana-1': 'Stomp and clap with the big drum! Find the stomping move!',
  'move-ghana-2': 'Bend your knees and row like a boat! Find the rowing move!',
  'move-ghana-3': 'Make great big circles with your arms! Find the circling move!',

  // --- mexico -------------------------------------------------------------
  'greet-mexico': "¡Hola! We're in Mexico! The trumpets are playing — it's time for folklórico!",
  'fact-mexico': 'In Mexico, folklórico dancers swish giant rainbow skirts that swirl like butterfly wings!',
  'move-mexico-1': 'Swish your skirt from side to side! Find the swishing move!',
  'move-mexico-2': 'Tap your heels, quick quick quick! Find the heel-tapping move!',
  'move-mexico-3': 'Twirl till your skirt opens like a flower! Find the twirling move!',

  // --- ireland ------------------------------------------------------------
  'greet-ireland': 'Hello from Ireland! The tin whistle is playing a jig — quick, dancing feet!',
  'fact-ireland': 'In Irish dancing, your feet hop and skip as fast as raindrops, but your arms stay very still!',
  'move-ireland-1': 'Hop and kick, light as a feather! Find the hopping move!',
  'move-ireland-2': 'Point your toe, tip tap tip! Find the toe-pointing move!',
  'move-ireland-3': 'Quick feet, then a little spin! Find the quick-feet move!',
};

/** The spoken text for a key, or '' when the key is unknown. */
export function lineText(key) {
  return LINES[key] || '';
}

export default LINES;
