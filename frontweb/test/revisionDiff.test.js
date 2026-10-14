import test from 'node:test'
import assert from 'node:assert/strict'
import { revisionDiff } from '../src/utils/revisionDiff.js'

test('diff reconstructs both frozen texts and pairs replacements', () => {
  const a = '场次一\n黎夏：走。\n不变\n', b = '场次一\n黎夏：等一下。\n不变\n'
  const blocks = revisionDiff(a, b, 'a', 'b')
  assert.equal(blocks.map(x => x.oldText).join(''), a)
  assert.equal(blocks.map(x => x.newText).join(''), b)
  assert.equal(blocks.filter(x => x.type === 'modified').length, 1)
  assert.deepEqual(blocks, revisionDiff(a, b, 'a', 'b'))
  assert.equal(new Set(blocks.map(x => x.id)).size, blocks.length)
})
