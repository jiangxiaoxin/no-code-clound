<template>
  <div class="formula-input" @click="onWrapperClick">
    <div
      ref="contentRef"
      class="formula-input-content"
      contenteditable="true"
      spellcheck="false"
      :data-placeholder="placeholder"
      @input="onInput"
      @keydown="onKeydown"
      @keyup="onKeyup"
      @mouseup="onMouseup"
      @copy="onCopy"
      @cut="onCut"
      @paste="onPaste"
      @drop.prevent
      @dragstart.prevent
      @compositionstart="onCompositionStart"
      @compositionend="onCompositionEnd"
      @blur="onBlur"
    ></div>
  </div>
  <teleport to="body">
    <div v-if="suggestOpen" class="formula-suggest" :style="suggestStyle">
      <template v-for="(item, index) in suggestItems" :key="item.key">
        <div
          v-if="index === 0 || suggestItems[index - 1].kind !== item.kind"
          class="formula-suggest-title"
        >
          {{ item.kind === 'field' ? '当前表单字段' : '函数' }}
        </div>
        <div
          class="formula-suggest-item"
          :class="{ 'is-active': index === activeIndex }"
          @mousedown.prevent="applySuggest(item)"
          @mouseenter="setActiveIndex(index)"
        >
          <span class="formula-suggest-name">{{ item.label }}</span>
          <span v-if="item.kind === 'field'" class="formula-suggest-type">
            {{ item.typeLabel }}
          </span>
          <span v-else class="formula-suggest-desc">{{ item.desc }}</span>
        </div>
      </template>
    </div>
  </teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { FORMULA_FUNCTIONS } from '../form-fill/formula/evaluator.js'
import { fieldTypeLabel } from './fieldTypes.js'
import {
  buildFormulaSegments,
  remapSourceOffset,
  segmentsSignature,
  segmentsToDisplayExpression,
  segmentExpression,
} from './formulaSegments.js'

const props = defineProps({
  modelValue: { type: String, default: '' },
  refGroups: { type: Array, default: () => [] }, // 主表，子表的分组字段
  refLabels: { type: Object, required: true },
  placeholder: { type: String, default: '' },
})

console.log('props reflabels', props.refLabels);
console.log('props refgroups', props.refGroups);



const emit = defineEmits(['update:modelValue'])

const SUGGEST_LIMIT = 20
const SUGGEST_WIDTH = 300
const SUGGEST_HEIGHT = 260

const contentRef = ref(null)
const empty = ref(true)
const composing = ref(false) // 当前正在进行中文输入
const suggestOpen = ref(false)
const suggestItems = ref([])
const activeIndex = ref(0)
const suggestStyle = ref({})

let lastSignature = ''
let suggestWord = ''
let lastCaret = null

const refItems = computed(() =>
  (props.refGroups || []).flatMap((group) => group.items || []),
)

// 从dom上的视觉元素转为数据库里的纯字符串记录，重点是字段key
function domToExpression(root) {
  console.log("🚀🚀🚀🚀🚀 ~ FormulaExpressionEditor.vue:96 ~ domToExpression ~ root:", root)
  // debugger
  if (!root) return ''
  let text = ''
  for (const node of root.childNodes) {
    if (node.nodeType === 3) { // 3 = text node
      text += node.data // 是文本的，直接加
      continue
    }
    if (node.nodeType !== 1) continue // 1 = element node 如果不是element node 那都不用处理，按照正常此处不会有别的东西
    if (node.classList.contains('fx-token')) text += node.dataset.expr || '' // 确定是 element 后，看看是不是 token类型，token 类型就是用来记录 字段key的 
    else if (node.tagName === 'BR') text += '\n'
    else {
      console.log('0000000000000继续递归', node);
      // 其他的带 fx-类似的class，比如 fx-k-fn -num 这种，它本身是 element node，然后进递归以后，内部元素就是text，nodeType是3，在上面就可以加到 text 里了
      text += domToExpression(node)
    }
  }
  return text.replace(/\u200B/g, '')
}

function childIndex(node) {
  if (!node || !node.parentNode) return 0
  return Array.prototype.indexOf.call(node.parentNode.childNodes, node)
}

// 光标位置统一按「表达式文本里的字符偏移」记；一颗字段标签占它写出来的 $'字段key' 那么长
function locateSource(offset) {
  const root = contentRef.value
  let remaining = offset
  let found = null
  const walk = (node) => {
    for (const child of node.childNodes) {
      if (found) return
      if (child.nodeType === 3) {
        if (remaining <= child.data.length) {
          found = { node: child, offset: remaining }
          return
        }
        remaining -= child.data.length
        continue
      }
      if (child.nodeType !== 1) continue
      if (child.classList.contains('fx-token')) {
        const length = tokenSourceLength(child)
        if (remaining <= 0) {
          found = { node, offset: childIndex(child) }
          return
        }
        if (remaining < length) {
          // 标签不能从中间切开，就近贴到它后面
          found = { node, offset: childIndex(child) + 1 }
          return
        }
        remaining -= length
        continue
      }
      if (child.tagName === 'BR') {
        if (remaining <= 0) {
          found = { node, offset: childIndex(child) }
          return
        }
        remaining -= 1
        continue
      }
      walk(child)
    }
  }
  walk(root)
  return found || { node: root, offset: root.childNodes.length }
}

function tokenSourceLength(node) {
  return String(node.dataset.expr || '').length
}

/**
 * 当前 range 如果在编辑区内则返回 range，否则返回null
 */
function currentRange() {
  const root = contentRef.value
  const selection = window.getSelection()
  // console.log("🚀 ~ FormulaExpressionEditor.vue:169 ~ currentRange ~ selection:", selection)

  if (!root || !selection || !selection.rangeCount) return null
  const range = selection.getRangeAt(0)
  // 选区两端都得在编辑器里，否则删/插会波及外面
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null
  return range
}

// 光标前的内容克隆一份出来，供「光标前是啥」这类判断用
function cloneBeforeCaret() {
  const root = contentRef.value
  const range = currentRange()
  if (!root || !range) return null
  const probe = document.createRange()
  probe.selectNodeContents(root)
  try {
    probe.setEnd(range.startContainer, range.startOffset)
  } catch {
    return null
  }
  const holder = document.createElement('div')
  holder.appendChild(probe.cloneContents()) // 复制一份，内部的dom结构也会一起复制出来
  return holder
}

// 光标前的表达式文本（字段标签还原成 $'字段key'），它的长度就是光标的字符偏移
function textBeforeCaret() {
  const holder = cloneBeforeCaret()
  return holder ? domToExpression(holder) : ''
}

function caretSourceOffset() {
  console.log('textBeforeCaret()', textBeforeCaret(), textBeforeCaret().length);
  return textBeforeCaret().length
}

function rememberCaret() {
  if (!currentRange()) return
  lastCaret = caretSourceOffset()
}

function applyRange(range) {
  const root = contentRef.value
  // 点左侧清单插字段时焦点在按钮上，这里顺手把焦点收回输入区，接着打字才不会掉
  if (root && document.activeElement !== root) root.focus({ preventScroll: true })
  const selection = window.getSelection()
  selection.removeAllRanges()
  selection.addRange(range)
}

function setCaret(offset) {
  const root = contentRef.value
  if (!root) return
  const target = Math.max(0, offset)
  const position = locateSource(target)
  const range = document.createRange()
  range.setStart(position.node, position.offset)
  range.collapse(true)
  applyRange(range)
  lastCaret = target
}

function rangeFromSource(start, end) {
  const from = locateSource(Math.max(0, start))
  const to = locateSource(Math.max(0, end))
  const range = document.createRange()
  range.setStart(from.node, from.offset)
  range.setEnd(to.node, to.offset)
  return range
}

function createTokenNode(segment) {
  const span = document.createElement('span')
  span.className = 'fx-token'
  span.contentEditable = 'false'
  span.dataset.expr = segmentExpression(segment) // 找对应的字段key
  span.textContent = segment.label // 显示字段标题
  return span
}

function renderSegments(root, segments) {
  const fragment = document.createDocumentFragment()
  for (const segment of segments) {
    // type = token, text
    if (segment.type === 'token') {
      fragment.appendChild(createTokenNode(segment))
      continue
    }
    const lines = String(segment.text).split('\n')
    lines.forEach((line, index) => {
      if (index > 0) {
        fragment.appendChild(document.createElement('br'))
      }
      if (!line) return
      if (segment.kind === 'plain') {
        fragment.appendChild(document.createTextNode(line))
        return
      }

      const span = document.createElement('span')
      // kind= str, num， fn
      span.className = `fx-k-${segment.kind}`
      span.textContent = line
      fragment.appendChild(span)
    })
  }
  root.replaceChildren(fragment)
}

function renderFromModel(expr) {
  const root = contentRef.value
  if (!root) return
  const segments = buildFormulaSegments(expr, props.refLabels)
  console.log('拆分成不同的分段===', segments);
  
  renderSegments(root, segments)
  lastSignature = segmentsSignature(segments)
  console.log("🚀 ~ FormulaExpressionEditor.vue:284 ~ renderFromModel ~ lastSignature:", lastSignature)

  empty.value = root.textContent === ''
}

// 光标附近那颗字段标签（光标在标签里面时也算）
function closestToken(node) {
  const element = node && node.nodeType === 1 ? node : node?.parentNode
  return element?.closest?.('.fx-token') || null
}

function isToken(node) {
  return Boolean(node) && node.nodeType === 1 && node.classList.contains('fx-token')
}

// 空文本节点、空 span 会被浏览器留下来，找前后一个「有效单位」时要跳过
function isSkippable(node) {
  if (!node) return true
  if (node.nodeType === 3) return node.data.length === 0
  if (node.nodeType !== 1) return true
  if (isToken(node) || node.tagName === 'BR') return false
  return node.textContent.length === 0
}

function deepestLast(node) {
  let current = node
  while (current && current.nodeType === 1 && !isToken(current) && current.lastChild) {
    current = current.lastChild
  }
  return current
}

function deepestFirst(node) {
  let current = node
  while (current && current.nodeType === 1 && !isToken(current) && current.firstChild) {
    current = current.firstChild
  }
  return current
}

// 光标前 / 后的第一个有效单位（字符或字段标签）
function unitBefore(container, offset) {
  if (container.nodeType === 3) {
    if (offset > 0) return null
    return unitBefore(container.parentNode, childIndex(container))
  }
  let node = container
  let index = offset
  while (node) {
    const children = node.childNodes
    for (let i = index - 1; i >= 0; i -= 1) {
      const candidate = deepestLast(children[i])
      if (!isSkippable(candidate)) return candidate
    }
    if (node === contentRef.value) return null
    index = childIndex(node)
    node = node.parentNode
  }
  return null
}

function unitAfter(container, offset) {
  if (container.nodeType === 3) {
    if (offset < container.data.length) return null
    return unitAfter(container.parentNode, childIndex(container) + 1)
  }
  let node = container
  let index = offset
  while (node) {
    const children = node.childNodes
    for (let i = index; i < children.length; i += 1) {
      const candidate = deepestFirst(children[i])
      if (!isSkippable(candidate)) return candidate
    }
    if (node === contentRef.value) return null
    index = childIndex(node) + 1
    node = node.parentNode
  }
  return null
}

// 选中范围碰到标签时，把范围撑到整颗标签，避免只删掉标签上的字、留下一个删不掉的引用
function expandOverTokens(range) {
  const startToken = closestToken(range.startContainer)
  if (startToken) range.setStartBefore(startToken)
  const endToken = closestToken(range.endContainer)
  if (endToken) range.setEndAfter(endToken)
  return range
}

function selectionTouchesToken(range) {
  if (closestToken(range.startContainer) || closestToken(range.endContainer)) return true
  const holder = document.createElement('div')
  holder.appendChild(range.cloneContents())
  return Boolean(holder.querySelector('.fx-token'))
}

function removeToken(token) {
  const parent = token.parentNode
  const index = childIndex(token)
  token.remove()
  const caret = document.createRange()
  caret.setStart(parent, Math.min(index, parent.childNodes.length))
  caret.collapse(true)
  applyRange(caret)
  syncFromDom()
}

function deleteSelection(range) {
  expandOverTokens(range).deleteContents()
  syncFromDom()
  updateSuggest()
}

// 浏览器的退格遇到 contenteditable=false 的标签经常没反应，或者只删掉标签里的字，
// 所以标签一律自己删：光标在标签里、紧贴标签、或选中范围碰到标签，都整颗删掉。
function deleteBackward() {
  const range = currentRange()
  if (!range) return false
  if (!range.collapsed) {
    if (!selectionTouchesToken(range)) return false
    deleteSelection(range)
    return true
  }
  const token = closestToken(range.startContainer) || unitBefore(range.startContainer, range.startOffset)
  if (!isToken(token)) return false
  removeToken(token)
  updateSuggest()
  return true
}

function deleteForward() {
  const range = currentRange()
  if (!range) return false
  if (!range.collapsed) {
    if (!selectionTouchesToken(range)) return false
    deleteSelection(range)
    return true
  }
  const token = closestToken(range.startContainer) || unitAfter(range.startContainer, range.startOffset)
  if (!isToken(token)) return false
  removeToken(token)
  updateSuggest()
  return true
}

// DOM 和当前公式对不上（比如浏览器把标签里的字删了）也要重画，不能只比结构签名
function tokensMatch(root, segments) {
  const nodes = root.querySelectorAll('.fx-token')
  const expected = (segments || []).filter((segment) => segment.type === 'token')
  if (nodes.length !== expected.length) return false
  return expected.every(
    (segment, index) =>
      nodes[index].dataset.expr === segmentExpression(segment) &&
      nodes[index].textContent === segment.label,
  )
}

// 读 DOM → 文本，再切一遍段；结构变了才重画，避免打字时光标乱跳
function syncFromDom() {
  const root = contentRef.value
  if (!root) return ''
  // 输入区没焦点时选区可能已经没了，用 lastCaret 兜底，别把光标冲成 0
  const hasRange = Boolean(currentRange())
  let caret = 0
  if (hasRange) {
    caret = caretSourceOffset()
    lastCaret = caret
  } else if (lastCaret != null) {
    caret = lastCaret
  }
  const text = domToExpression(root)
  emit('update:modelValue', text)
  const segments = buildFormulaSegments(text, props.refLabels)
  const signature = segmentsSignature(segments)
  if (signature !== lastSignature || !tokensMatch(root, segments)) {
    renderSegments(root, segments)
    lastSignature = signature
    setCaret(remapSourceOffset(caret, segments))
  }
  empty.value = root.textContent === ''
  return text
}

// 点左侧清单时输入区可能已经失焦，选区也没了，这时用记下的光标位置兜底
function caretRangeOrRestore() {
  const root = contentRef.value
  if (!root) return null
  const range = currentRange()
  if (range) return range
  setCaret(lastCaret ?? domToExpression(root).length)
  return currentRange()
}

function insertNodeAtCaret(node) {
  const root = contentRef.value
  if (!root) return
  const range = caretRangeOrRestore()
  if (!range) {
    root.appendChild(node)
    return
  }
  range.deleteContents()
  range.insertNode(node)
}

function replaceTypedWord(word, node) {
  if (!word) return false
  const range = currentRange()
  if (!range || !range.collapsed) return false
  const caret = caretSourceOffset()
  if (caret < word.length) return false
  const target = rangeFromSource(caret - word.length, caret)
  target.deleteContents()
  target.insertNode(node)
  return true
}

function insertField(item) {
  const path = (item.path || []).join('.')
  const segment = {
    type: 'token',
    path,
    label: props.refLabels.byPath?.get(path) || item.label,
  }
  const node = createTokenNode(segment)
  // 手打了字段标题又点同一颗，就替换掉，别留下「标题 + 标签」两份
  const word = currentWord()
  if (word !== segment.label || !replaceTypedWord(word, node)) {
    insertNodeAtCaret(node)
  }
  const after = document.createRange()
  after.setStartAfter(node)
  after.collapse(true)
  applyRange(after)
  closeSuggest()
  syncFromDom()
}

function insertFunction(fn) {
  const text = `${fn.name}()`
  const node = document.createTextNode(text)
  // 手打了函数名又点同一个函数，替换掉，别拼成 SUMUM()
  const word = currentWord()
  if (word.toLowerCase() !== fn.name.toLowerCase() || !replaceTypedWord(word, node)) {
    insertNodeAtCaret(node)
  }
  const caret = document.createRange()
  caret.setStart(node, fn.minArgs > 0 ? fn.name.length + 1 : text.length)
  caret.collapse(true)
  applyRange(caret)
  closeSuggest()
  syncFromDom()
}

function focus() {
  const root = contentRef.value
  if (!root) return
  root.focus()
  console.log(root.childNodes, 'nodes....');
  
  setCaret(domToExpression(root).length)
}

function clear() {
  closeSuggest()
  emit('update:modelValue', '')
  renderFromModel('')
  focus()
}

function onWrapperClick(event) {
  if (event.target === event.currentTarget) focus()
}

function onInput() {
  if (composing.value) return
  // 输入中文时，不触发 syncFromDom 和 updateSuggest，等输入完了再触发
  syncFromDom()
  updateSuggest()
}

function onKeydown(event) {
  if (suggestOpen.value && suggestItems.value.length) {
    // 开启提示选择以后，按下箭头键，会触发 moveActive 移动选择项
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveActive(1)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveActive(-1)
      return
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault()
      applySuggest(suggestItems.value[activeIndex.value])
      return
    }
  }
  if (event.key === 'Escape') {
    closeSuggest()
    return
  }

  // isComposing 是 true 说明正在输入中文，虽然敲了拼音了，但还没选择文字。不处理退格和删除，此时是在处理拼音的删除
  if (!event.isComposing && event.key === 'Backspace') {
    if (deleteBackward()) event.preventDefault()
    return
  }
  if (!event.isComposing && event.key === 'Delete') {
    if (deleteForward()) event.preventDefault()
    return
  }
  // 公式是单行表达式，回车不留空行
  // 虽然按了 enter，但没按 shift，就认为这是无效的，不应该的。继续输入公式就行了
  if (event.key === 'Enter' && !event.shiftKey) event.preventDefault()
}

function onKeyup(event) {
  rememberCaret()
  if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) updateSuggest()
}

function onMouseup() {
  console.log('onMouseup....');
  
  rememberCaret()
  updateSuggest()
}

function onBlur() {
  console.log('onblur....');
  
  rememberCaret()
  closeSuggest()
}

function onPaste(event) {
  event.preventDefault()
  const text = (event.clipboardData?.getData('text/plain') || '')
    .replace(/\s*\r?\n\s*/g, ' ')
    .trim()
  if (!text) return
  closeSuggest()
  if (!document.execCommand('insertText', false, text)) {
    insertNodeAtCaret(document.createTextNode(text))
    syncFromDom()
  }
}

// 选中的内容按 $'字段标题' 写进剪贴板：人能读，粘回编辑器还能认回同一颗标签
function copySelection(event) {
  const range = currentRange()
  if (!range || range.collapsed) return false
  const holder = document.createElement('div')
  holder.appendChild(range.cloneContents())
  const expression = segmentsToDisplayExpression(
    buildFormulaSegments(domToExpression(holder), props.refLabels),
  )
  if (!expression) return false
  event.clipboardData.setData('text/plain', expression)
  event.preventDefault()
  return true
}

function onCopy(event) {
  copySelection(event)
}

function onCut(event) {
  if (!copySelection(event)) return
  const range = currentRange()
  if (!range) return
  // 自己删，别让浏览器把标签拆成半颗
  deleteSelection(range)
}

function onCompositionStart() {
  composing.value = true
  closeSuggest()
}

function onCompositionEnd() {
  composing.value = false
  syncFromDom()
  updateSuggest()
}

// 光标前那一段连续的普通文本，遇到字段 token 或换行就断
function tailTextAtCaret() {
  const holder = cloneBeforeCaret()
  console.log("🚀 ~ FormulaExpressionEditor.vue:690 ~ tailTextAtCaret ~ holder:", holder)
  // debugger
  if (!holder) return ''
  let tail = ''
  const walk = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) {
        tail += child.data
        continue
      }
      if (child.nodeType !== 1) continue
      if (child.classList.contains('fx-token') || child.tagName === 'BR') tail = ''
      else walk(child)
    }
  }
  walk(holder)
  console.log('计算出 tail   ', tail);
  
  return tail
}

function currentWord() {
  const range = currentRange()
  // 如果没有range，也就是光标当前不在编辑区，或者虽然在，但是选区选中了一堆东西，就返回
  if (!range || !range.collapsed) return ''
  const tail = tailTextAtCaret()
  const match = /[A-Za-z0-9_\u4e00-\u9fa5$'"]*$/.exec(tail)
  return match ? match[0] : ''
}

// 结尾还开着的引号：$'…' 是在选字段，普通引号是在写字符串
function openQuoteKind(text) {
  let quote = ''
  let fromRef = false
  let index = 0
  while (index < text.length) {
    const ch = text[index]
    if (quote) {
      if (ch === quote) quote = ''
      index += 1
      continue
    }
    if (ch === '$' && (text[index + 1] === "'" || text[index + 1] === '"')) {
      quote = text[index + 1]
      fromRef = true
      index += 2
      continue
    }
    if (ch === "'" || ch === '"') {
      quote = ch
      fromRef = false
    }
    index += 1
  }
  if (!quote) return ''
  return fromRef ? 'ref' : 'string'
}

function rankMatches(items, textOf, word) {
  const matched = items.filter((item) => textOf(item).toLowerCase().includes(word))
  matched.sort((a, b) => {
    const aText = textOf(a).toLowerCase()
    const bText = textOf(b).toLowerCase()
    const aStart = aText.startsWith(word) ? 0 : 1
    const bStart = bText.startsWith(word) ? 0 : 1
    if (aStart !== bStart) return aStart - bStart
    return aText.length - bText.length
  })
  return matched
}

function buildSuggestItems(word) {
  const wantsField = word.startsWith('$')
  const query = (wantsField ? word.slice(1).replace(/^['"]/, '') : word).toLowerCase()
  const fieldItems = rankMatches(refItems.value, (item) => String(item.label || ''), query)
  const functionItems = wantsField
    ? []
    : rankMatches(FORMULA_FUNCTIONS, (fn) => fn.name, query)
  return [
    ...functionItems.map((fn) => ({
      kind: 'fn',
      key: `fn:${fn.name}`,
      label: fn.name,
      desc: fn.summary,
      fn,
    })),
    ...fieldItems.map((item) => ({
      kind: 'field',
      key: `field:${(item.path || []).join('.')}`,
      label: item.label,
      typeLabel: fieldTypeLabel(item.type),
      item,
    })),
  ].slice(0, SUGGEST_LIMIT)
}

function updateSuggest() {
  if (composing.value) return closeSuggest()
  const range = currentRange()
  if (!range || !range.collapsed) return closeSuggest()
  if (openQuoteKind(textBeforeCaret()) === 'string') return closeSuggest()
  const word = currentWord()
  suggestWord = word
  if (!word || word.startsWith("'") || word.startsWith('"')) return closeSuggest()
  const items = buildSuggestItems(word)
  if (!items.length) return closeSuggest()
  suggestItems.value = items
  activeIndex.value = 0
  suggestOpen.value = true
  positionSuggest()
}

// 关闭选择提示框
function closeSuggest() {
  // debugger
  suggestOpen.value = false
  suggestItems.value = []
  suggestWord = ''
}

function setActiveIndex(index) {
  activeIndex.value = index
}

function moveActive(step) {
  const total = suggestItems.value.length
  if (!total) return
  activeIndex.value = (activeIndex.value + step + total) % total
}

function positionSuggest() {
  const root = contentRef.value
  if (!root) return
  const range = currentRange()
  const editorRect = root.getBoundingClientRect()
  let caretRect = null
  if (range) {
    const rects = range.getClientRects()
    caretRect = rects && rects.length ? rects[rects.length - 1] : range.getBoundingClientRect()
  }
  const anchorLeft = caretRect && (caretRect.left || caretRect.width)
    ? caretRect.left
    : editorRect.left + 12
  const anchorTop = caretRect && (caretRect.top || caretRect.height)
    ? caretRect.bottom
    : editorRect.top + 24
  const maxLeft = Math.max(8, window.innerWidth - SUGGEST_WIDTH - 8)
  const flip = anchorTop + SUGGEST_HEIGHT > window.innerHeight
  suggestStyle.value = {
    left: `${Math.min(Math.max(8, anchorLeft), maxLeft)}px`,
    top: `${flip ? Math.max(8, anchorTop - SUGGEST_HEIGHT - 24) : anchorTop + 4}px`,
  }
}

function applySuggest(item) {
  if (!item) return
  const word = suggestWord || currentWord()
  const caret = caretSourceOffset()
  const target = rangeFromSource(Math.max(0, caret - word.length), caret)
  target.deleteContents()
  closeSuggest()
  if (item.kind === 'field') {
    const node = createTokenNode({
      type: 'token',
      path: (item.item.path || []).join('.'),
      label: item.label,
    })
    target.insertNode(node)
    const after = document.createRange()
    after.setStartAfter(node)
    after.collapse(true)
    applyRange(after)
  } else {
    const text = `${item.label}()`
    const node = document.createTextNode(text)
    target.insertNode(node)
    const caret = document.createRange()
    caret.setStart(node, item.fn.minArgs > 0 ? item.label.length + 1 : text.length)
    caret.collapse(true)
    applyRange(caret)
  }
  syncFromDom()
}

function onDocumentMouseDown(event) {
  // return
  if (!suggestOpen.value) return
  const root = contentRef.value
  if (root && root.contains(event.target)) {
    console.log('在editable div 里，所以不通过这里去关');
    return
  }
  if (event.target.closest && event.target.closest('.formula-suggest')) {
    // 从target 往上找，能找到.formula-suggest 的话，说明是点了suggest里的东西，所以不通过这里关弹框，不是不关。
    // 点击了suggest里的不同部位，要么会触发 blur事件，要么就是点击了 suggest-item，触发绑定的回调，添加 suggest 到内容区
    return
  }
  console.log('点在别的地方，要关掉suggest');
  
  closeSuggest()
}

function onWindowChange() {
  closeSuggest()
}

watch(
  () => props.modelValue,
  (value) => {
    const root = contentRef.value
    if (!root) return
    if (domToExpression(root) === String(value || '')) return
    renderFromModel(value)
  },
)

onMounted(() => {
  document.addEventListener('mousedown', onDocumentMouseDown)
  window.addEventListener('scroll', onWindowChange, true)
  window.addEventListener('resize', onWindowChange)
  renderFromModel(props.modelValue)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocumentMouseDown)
  window.removeEventListener('scroll', onWindowChange, true)
  window.removeEventListener('resize', onWindowChange)
})

defineExpose({ focus, clear, insertField, insertFunction })
</script>

<style scoped lang="less">
.formula-input {
  flex: 1;
  min-height: 0;
  padding: 10px 12px;
  overflow: auto;
  font-family: Consolas, Monaco, 'Courier New', monospace;
  font-size: 13px;
  line-height: 22px;
  color: var(--el-text-color-primary);
  cursor: text;
}

.formula-input-content {
  min-height: 100%;
  word-break: break-word;
  white-space: pre-wrap;
  outline: none;

  &:empty::before {
    color: var(--el-text-color-placeholder);
    pointer-events: none;
    content: attr(data-placeholder);
  }

  :deep(.fx-token) {
    padding: 1px 6px;
    margin: 0 1px;
    color: var(--el-color-primary);
    white-space: nowrap;
    background: var(--el-color-primary-light-9);
    border: 1px solid var(--el-color-primary-light-7);
    border-radius: 4px;
  }

  :deep(.fx-k-fn) {
    font-weight: 600;
    color: #8250df;
  }

  :deep(.fx-k-str) {
    color: var(--el-color-success);
  }

  :deep(.fx-k-num) {
    color: var(--el-color-warning);
  }
}

.formula-suggest {
  position: fixed;
  z-index: 2600;
  width: 300px;
  max-height: 260px;
  padding: 4px;
  overflow: auto;
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  box-shadow: var(--el-box-shadow-light);
}

.formula-suggest-title {
  padding: 6px 8px 4px;
  font-size: 12px;
  line-height: 18px;
  color: var(--el-text-color-secondary);
}

.formula-suggest-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 8px;
  cursor: pointer;
  border-radius: 6px;

  &.is-active {
    background: var(--el-fill-color-light);
  }
}

.formula-suggest-name {
  overflow: hidden;
  font-size: 13px;
  line-height: 20px;
  color: var(--el-text-color-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.formula-suggest-type {
  flex: none;
  margin-left: 8px;
  padding: 1px 8px;
  font-size: 12px;
  line-height: 18px;
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  border-radius: 9px;
}

.formula-suggest-desc {
  flex: none;
  max-width: 170px;
  margin-left: 8px;
  overflow: hidden;
  font-size: 12px;
  line-height: 18px;
  color: var(--el-text-color-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
