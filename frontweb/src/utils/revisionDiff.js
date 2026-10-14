import { diffLines, diffChars } from 'diff'

export function revisionDiff(source, candidate, sourceHash, candidateHash) {
  const blocks = []
  let oldLine = 1, newLine = 1
  const parts = diffLines(source, candidate)
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]
    const b = { oldLine, newLine, oldText: '', newText: '', type: 'unchanged' }
    if (!p.added && !p.removed) b.oldText = b.newText = p.value
    else {
      b.type = p.removed ? 'removed' : 'added'
      if (p.removed) b.oldText = p.value
      else b.newText = p.value
      if (p.removed && parts[i + 1]?.added) { b.newText = parts[++i].value; b.type = 'modified' }
    }
    oldLine += (b.oldText.match(/\n/g) || []).length
    newLine += (b.newText.match(/\n/g) || []).length
    const words = diffChars(b.oldText, b.newText)
    // Line positions distinguish repeated identical paragraphs in this frozen version pair.
    b.id = `${sourceHash}:${candidateHash}:${b.oldLine}:${b.newLine}`
    b.oldParts = words.filter(x => !x.added)
    b.newParts = words.filter(x => !x.removed)
    blocks.push(b)
  }
  return blocks
}
