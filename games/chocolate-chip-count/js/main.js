import config from '../config.js';
import { createChocolateChipCount } from './game.js';

const game = createChocolateChipCount(config, document.getElementById('game'));
await game.ready;
