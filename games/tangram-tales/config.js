export default {
  id: 'tangram-tales',
  engine: 'build-assemble',
  title: 'Shape Tangram Tales',
  splashEmoji: '🦊',
  voice: {
    intro: 'Put the shapes on the ghost spots. Build the picture!',
    nudge: 'That shape has another spot. Try again.',
    wait: 'Pick a shape for the next ghost spot.',
    cheer: 'Your shape tales are complete!',
  },
  modes: [
    {
      id: 'animals',
      title: 'Build the Animal',
      rounds: 4,
      prompt: 'Build the animal from shapes.',
      builds: [
        {
          name: 'fox',
          say: 'Your fox says hello!',
          parts: [
            part('emoji:🔺', 'fox left ear triangle', 'triangle', 398, 295, 150),
            part('emoji:🔺', 'fox right ear triangle', 'triangle', 552, 295, 150),
            part('emoji:🟧', 'fox face square', 'square', 475, 430, 205),
            part('emoji:🔺', 'fox nose triangle', 'triangle', 475, 575, 135),
            part('emoji:🟨', 'fox tail square', 'square', 680, 485, 155),
          ],
        },
        {
          name: 'cat',
          say: 'Your cat says hello!',
          parts: [
            part('emoji:🔺', 'cat left ear triangle', 'triangle', 380, 300, 140),
            part('emoji:🔺', 'cat right ear triangle', 'triangle', 540, 300, 140),
            part('emoji:🟨', 'cat head square', 'square', 460, 430, 205),
            part('emoji:🟪', 'cat body square', 'square', 460, 630, 230),
            part('emoji:🟦', 'cat tail rectangle', 'rectangle', 660, 575, 155),
          ],
        },
        {
          name: 'boat',
          say: 'Your boat sails away!',
          parts: [
            part('emoji:🟫', 'boat hull rectangle', 'rectangle', 500, 640, 270),
            part('emoji:🔺', 'boat left sail triangle', 'triangle', 415, 430, 185),
            part('emoji:🔺', 'boat right sail triangle', 'triangle', 570, 420, 205),
            part('emoji:🟦', 'boat mast rectangle', 'rectangle', 500, 510, 115),
          ],
        },
        {
          name: 'tree',
          say: 'Your tree grows tall!',
          parts: [
            part('emoji:🟩', 'tree top triangle', 'triangle', 500, 290, 190),
            part('emoji:🟩', 'tree middle triangle', 'triangle', 500, 450, 230),
            part('emoji:🟩', 'tree bottom triangle', 'triangle', 500, 620, 270),
            part('emoji:🟫', 'tree trunk square', 'square', 500, 790, 135),
          ],
        },
      ],
    },
    {
      id: 'things',
      title: 'Build the Thing',
      rounds: 3,
      prompt: 'Build the thing from shapes.',
      builds: [
        {
          name: 'rocket',
          say: 'Your rocket zooms to the stars!',
          parts: [
            part('emoji:🔺', 'rocket nose triangle', 'triangle', 500, 270, 170),
            part('emoji:🟦', 'rocket body rectangle', 'rectangle', 500, 470, 245),
            part('emoji:🔺', 'rocket left fin triangle', 'triangle', 365, 640, 140),
            part('emoji:🔺', 'rocket right fin triangle', 'triangle', 635, 640, 140),
            part('emoji:🟨', 'rocket window square', 'square', 500, 455, 105),
          ],
        },
        {
          name: 'house',
          say: 'Your house feels cozy!',
          parts: [
            part('emoji:🔺', 'house roof triangle', 'triangle', 500, 335, 250),
            part('emoji:🟨', 'house wall square', 'square', 500, 565, 260),
            part('emoji:🟦', 'house left window square', 'square', 430, 530, 95),
            part('emoji:🟪', 'house right window square', 'square', 570, 530, 95),
            part('emoji:🟫', 'house door rectangle', 'rectangle', 500, 650, 120),
          ],
        },
        {
          name: 'flower',
          say: 'Your flower says hello!',
          parts: [
            part('emoji:🟨', 'flower center square', 'square', 500, 390, 135),
            part('emoji:🔺', 'flower top petal triangle', 'triangle', 500, 260, 130),
            part('emoji:🔺', 'flower left petal triangle', 'triangle', 370, 390, 130),
            part('emoji:🔺', 'flower right petal triangle', 'triangle', 630, 390, 130),
            part('emoji:🟩', 'flower stem rectangle', 'rectangle', 500, 615, 170),
            part('emoji:🟩', 'flower leaf square', 'square', 610, 605, 125),
          ],
        },
      ],
    },
  ],
};

function part(art, alt, say, x, y, size) {
  return { art, alt, say, x, y, size };
}
