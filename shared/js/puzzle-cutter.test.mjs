import assert from 'node:assert/strict';
import { generatePuzzle } from './puzzle-cutter.js';

const finite = (value) => Number.isFinite(value);

function checkPreset(width, height, rows, cols, seed) {
  const puzzle = generatePuzzle({ width, height, rows, cols, seed });
  assert.equal(puzzle.rows, rows);
  assert.equal(puzzle.cols, cols);
  assert.equal(puzzle.pieces.length, rows * cols);

  for (let i = 0; i < puzzle.pieces.length; i += 1) {
    const piece = puzzle.pieces[i];
    assert.equal(piece.index, i);
    assert.equal(piece.row, Math.floor(i / cols));
    assert.equal(piece.col, i % cols);
    assert.ok(piece.path.length > 0);
    for (const value of [piece.bounds.x, piece.bounds.y, piece.bounds.width, piece.bounds.height,
      piece.cell.x, piece.cell.y, piece.cell.width, piece.cell.height]) assert.ok(finite(value));
    assert.ok(piece.bounds.width >= 0 && piece.bounds.height >= 0);
    assert.ok(piece.cell.width > 0 && piece.cell.height > 0);
    if (piece.row === 0) assert.equal(piece.edges.top, 'flat');
    if (piece.row === rows - 1) assert.equal(piece.edges.bottom, 'flat');
    if (piece.col === 0) assert.equal(piece.edges.left, 'flat');
    if (piece.col === cols - 1) assert.equal(piece.edges.right, 'flat');
  }

  // Every interior join is complementary: a tab meets a blank.
  for (const piece of puzzle.pieces) {
    if (piece.col < cols - 1) {
      const right = puzzle.pieces[piece.index + 1].edges.left;
      assert.notEqual(piece.edges.right, 'flat');
      assert.notEqual(right, 'flat');
      assert.notEqual(piece.edges.right, right);
    }
    if (piece.row < rows - 1) {
      const bottom = puzzle.pieces[piece.index + cols].edges.top;
      assert.notEqual(piece.edges.bottom, 'flat');
      assert.notEqual(bottom, 'flat');
      assert.notEqual(piece.edges.bottom, bottom);
    }
  }
  return puzzle;
}

checkPreset(200, 200, 2, 2, 'square');
checkPreset(300, 200, 2, 3, 'wide');
checkPreset(200, 300, 3, 2, 'tall');
checkPreset(700, 500, 5, 7, 'large');

const first = generatePuzzle({ width: 240, height: 180, rows: 3, cols: 4, seed: 'stable' });
const second = generatePuzzle({ width: 240, height: 180, rows: 3, cols: 4, seed: 'stable' });
assert.deepEqual(second, first);
const different = generatePuzzle({ width: 240, height: 180, rows: 3, cols: 4, seed: 'other' });
assert.ok(different.pieces.some((piece, i) => piece.path !== first.pieces[i].path));

assert.equal(generatePuzzle({ width: 100, height: 80, rows: 0, cols: -2 }).rows, 1);
assert.equal(generatePuzzle({ width: 100, height: 80, rows: 2.9, cols: 3.9 }).rows, 2);
assert.equal(generatePuzzle({ width: 100, height: 80, rows: 2.9, cols: 3.9 }).cols, 3);
for (const dimensions of [{ width: 0, height: 10 }, { width: -1, height: 10 }, { width: 10, height: 0 }, { width: 10, height: -1 }]) {
  assert.throws(() => generatePuzzle(dimensions), /positive width and height/);
}

console.log('puzzle-cutter tests passed');
