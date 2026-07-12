export default {
  id: 'story-stones',
  engine: 'observe-journal',
  title: 'Story Stones',
  splashEmoji: '🪨',
  // Story-corner backdrop, Story Screen art world (docs/art-direction.md)
  theme: { world: 'story-screen', background: './assets/bg.jpg' },
  copy: {
    home: 'Home',
    replay: 'Hear it again',
    recap: 'My Stone Story',
    playAgain: 'Tell Another Story',
  },
  voice: {
    cheer: 'Your story stones made a wonderful tale!',
    yum: 'That belongs in your story!',
  },
  modes: [
    {
      id: 'castle',
      title: 'Castle Tale',
      prompt: 'The story pouch is open. Pick your stones, and tell your grown-up what happens next!',
      rounds: 3,
      endTitle: 'Your Castle Tale',
      cheer: 'What a marvelous castle tale! Every stone helped make it yours.',
      pages: [
        {
          scene: 'emoji:🏰',
          alt: 'a castle gate',
          prompts: [
            {
              say: 'Who walks through the castle gate? Pick a stone and say who it is!',
              stickers: [
                { art: 'emoji:🐉', alt: 'dragon stone', say: 'A dragon walks through the gate! Tell your grown-up what happens next!' },
                { art: 'emoji:👸', alt: 'princess stone', say: 'A princess walks through the gate! Tell your grown-up what happens next!' },
                { art: 'emoji:🐸', alt: 'frog stone', say: 'A frog walks through the gate! Tell your grown-up what happens next!' },
              ],
            },
            {
              say: 'What do they find at the gate? Pick a stone, then say it in your story!',
              stickers: [
                { art: 'emoji:🗝️', alt: 'key stone', say: 'They find a shiny key at the gate! Say the whole story out loud!' },
                { art: 'emoji:🌟', alt: 'star stone', say: 'They find a glowing star at the gate! Say the whole story out loud!' },
                { art: 'emoji:🍎', alt: 'apple stone', say: 'They find a red apple at the gate! Say the whole story out loud!' },
              ],
            },
          ],
        },
        {
          scene: 'emoji:🌲',
          alt: 'a forest path',
          prompts: [
            {
              say: 'Who appears on the forest path? Choose anyone for your tale!',
              stickers: [
                { art: 'emoji:🐉', alt: 'dragon stone', say: 'A dragon appears on the forest path! What does the dragon do?' },
                { art: 'emoji:👸', alt: 'princess stone', say: 'A princess appears on the forest path! What does the princess do?' },
                { art: 'emoji:🐸', alt: 'frog stone', say: 'A frog appears on the forest path! What does the frog do?' },
              ],
            },
            {
              say: 'What is the weather in your forest? Pick a weather stone and say it out loud!',
              stickers: [
                { art: 'emoji:🌧️', alt: 'rain stone', say: 'Rain patters on the forest path! Tell your grown-up what happens next!' },
                { art: 'emoji:☀️', alt: 'sun stone', say: 'Sunshine warms the forest path! Tell your grown-up what happens next!' },
                { art: 'emoji:🌟', alt: 'star stone', say: 'A magical star lights the forest path! Tell your grown-up what happens next!' },
              ],
            },
          ],
        },
        {
          scene: 'emoji:🎉',
          alt: 'a castle celebration',
          prompts: [
            {
              say: 'Who comes to the celebration? Pick the star of your ending!',
              stickers: [
                { art: 'emoji:🐉', alt: 'dragon stone', say: 'The dragon comes to the celebration! Tell why everyone cheers!' },
                { art: 'emoji:👸', alt: 'princess stone', say: 'The princess comes to the celebration! Tell why everyone cheers!' },
                { art: 'emoji:🐸', alt: 'frog stone', say: 'The frog comes to the celebration! Tell why everyone cheers!' },
              ],
            },
            {
              say: 'Choose one last treasure for your ending, then tell the whole tale!',
              stickers: [
                { art: 'emoji:🗝️', alt: 'key stone', say: 'The golden key finishes your castle tale. Tell your grown-up the whole story!' },
                { art: 'emoji:🌟', alt: 'star stone', say: 'The bright star finishes your castle tale. Tell your grown-up the whole story!' },
                { art: 'emoji:🍎', alt: 'apple stone', say: 'The crunchy apple finishes your castle tale. Tell your grown-up the whole story!' },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'ocean',
      title: 'Ocean Tale',
      prompt: 'The story pouch is open. Pick your ocean stones, and tell your grown-up what happens next!',
      rounds: 3,
      endTitle: 'Your Ocean Tale',
      cheer: 'What a splashy ocean tale! Every stone helped make it yours.',
      pages: [
        {
          scene: 'emoji:⛵',
          alt: 'a sailboat',
          prompts: [
            {
              say: 'Who climbs aboard the boat? Pick a stone and introduce them!',
              stickers: [
                { art: 'emoji:🐙', alt: 'octopus stone', say: 'A clever octopus climbs aboard! Tell your grown-up where the boat goes!' },
                { art: 'emoji:🧜', alt: 'merperson stone', say: 'A brave merperson climbs aboard! Tell your grown-up where the boat goes!' },
                { art: 'emoji:🐢', alt: 'turtle stone', say: 'A gentle turtle climbs aboard! Tell your grown-up where the boat goes!' },
              ],
            },
            {
              say: 'What travels with the boat? Choose a stone and add it to your story!',
              stickers: [
                { art: 'emoji:🗺️', alt: 'map stone', say: 'A treasure map travels on the boat! Say what the map shows!' },
                { art: 'emoji:🌊', alt: 'wave stone', say: 'A giant wave travels beside the boat! Say what happens next!' },
                { art: 'emoji:☀️', alt: 'sun stone', say: 'Warm sunshine follows the boat! Say what happens next!' },
              ],
            },
          ],
        },
        {
          scene: 'emoji:🏝️',
          alt: 'a tropical island',
          prompts: [
            {
              say: 'Who waits on the island? Pick any stone for your adventure!',
              stickers: [
                { art: 'emoji:🦀', alt: 'crab stone', say: 'A dancing crab waits on the island! Show how the crab dances!' },
                { art: 'emoji:🦜', alt: 'parrot stone', say: 'A colorful parrot waits on the island! What does the parrot say?' },
                { art: 'emoji:🐢', alt: 'turtle stone', say: 'A sleepy turtle waits on the island! What wakes the turtle?' },
              ],
            },
            {
              say: 'What do they discover there? Choose a stone and tell it out loud!',
              stickers: [
                { art: 'emoji:🥥', alt: 'coconut stone', say: 'They discover a round coconut! Tell your grown-up what is inside!' },
                { art: 'emoji:🗝️', alt: 'key stone', say: 'They discover a tiny golden key! Tell your grown-up what it opens!' },
                { art: 'emoji:🌧️', alt: 'rain stone', say: 'They discover a warm rain shower! Tell your grown-up what they do!' },
              ],
            },
          ],
        },
        {
          scene: 'emoji:🐠',
          alt: 'a deep ocean dive',
          prompts: [
            {
              say: 'Who joins the deep dive? Pick a sea friend and say their name!',
              stickers: [
                { art: 'emoji:🐬', alt: 'dolphin stone', say: 'A playful dolphin joins the deep dive! Tell what the dolphin finds!' },
                { art: 'emoji:🐙', alt: 'octopus stone', say: 'A clever octopus joins the deep dive! Tell what the octopus finds!' },
                { art: 'emoji:🧜', alt: 'merperson stone', say: 'A brave merperson joins the deep dive! Tell what the merperson finds!' },
              ],
            },
            {
              say: 'Choose the surprise at the bottom of the sea, then tell the whole tale!',
              stickers: [
                { art: 'emoji:🐚', alt: 'shell stone', say: 'A singing shell finishes your ocean tale. Tell your grown-up the whole story!' },
                { art: 'emoji:💎', alt: 'gem stone', say: 'A sparkling gem finishes your ocean tale. Tell your grown-up the whole story!' },
                { art: 'emoji:⭐', alt: 'sea star stone', say: 'A friendly sea star finishes your ocean tale. Tell your grown-up the whole story!' },
              ],
            },
          ],
        },
      ],
    },
  ],
};
