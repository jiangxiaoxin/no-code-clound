import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  MIN_TAB_PANES,
  MAX_TAB_PANES,
  canAddPane,
  canRemovePane,
  createTabsField,
  findFieldByKey,
  flattenFields,
  hasTabsField,
  neighborPaneId,
  nextPaneTitle,
  paneIdOfField,
  reorderPanes,
  trimPaneTitle,
} from './tabsField.js'

test('flattenFields walks panes in order and skips the tabs field itself', () => {
  const fields = [
    { key: 'before', type: 'input' },
    {
      type: 'tabs',
      key: 'tabs_1',
      panes: [
        { id: 'p1', title: 'A', fields: [{ key: 'a', type: 'input' }] },
        { id: 'p2', title: 'B', fields: [{ key: 'b', type: 'number' }] },
      ],
    },
    { key: 'after', type: 'input' },
  ]
  assert.deepEqual(
    flattenFields(fields).map((item) => item.key),
    ['before', 'a', 'b', 'after'],
  )
})

test('flattenFields does not expand subform.fields', () => {
  const fields = [
    {
      type: 'tabs',
      key: 'tabs_1',
      panes: [
        {
          id: 'p1',
          title: 'A',
          fields: [
            {
              key: 'kids',
              type: 'subform',
              fields: [{ key: 'col', type: 'input' }],
            },
          ],
        },
      ],
    },
  ]
  assert.deepEqual(
    flattenFields(fields).map((item) => item.key),
    ['kids'],
  )
})

test('hasTabsField and createTabsField default two panes', () => {
  const field = createTabsField('tabs_1', ['id1', 'id2'])
  assert.equal(field.type, 'tabs')
  assert.equal(field.width, '1')
  assert.equal(field.panes.length, MIN_TAB_PANES)
  assert.equal(field.panes[0].title, '标签页1')
  assert.equal(field.panes[1].title, '标签页2')
  assert.equal(hasTabsField([field]), true)
  assert.equal(hasTabsField([{ key: 'n', type: 'input' }]), false)
})

test('nextPaneTitle uses max 标签页N then count+1', () => {
  assert.equal(
    nextPaneTitle([{ title: '标签页1' }, { title: '标签页2' }]),
    '标签页3',
  )
  assert.equal(
    nextPaneTitle([{ title: '基本信息' }, { title: '联系' }]),
    '标签页3',
  )
  assert.equal(nextPaneTitle([{ title: '标签页5' }]), '标签页6')
})

test('pane guards and neighbor', () => {
  const two = [{ id: 'a' }, { id: 'b' }]
  assert.equal(canRemovePane(two), false)
  assert.equal(canAddPane(two), true)
  const ten = Array.from({ length: MAX_TAB_PANES }, (_, i) => ({ id: String(i) }))
  assert.equal(canAddPane(ten), false)
  assert.equal(neighborPaneId([{ id: 'a' }, { id: 'b' }, { id: 'c' }], 'b'), 'c')
  assert.equal(neighborPaneId([{ id: 'a' }, { id: 'b' }], 'b'), 'a')
})

test('findFieldByKey and paneIdOfField look inside panes', () => {
  const fields = [
    { key: 'out', type: 'input' },
    {
      type: 'tabs',
      key: 'tabs_1',
      panes: [
        { id: 'p1', title: 'A', fields: [{ key: 'in', type: 'input' }] },
        { id: 'p2', title: 'B', fields: [] },
      ],
    },
  ]
  assert.equal(findFieldByKey(fields, 'in')?.type, 'input')
  assert.equal(paneIdOfField(fields, 'in'), 'p1')
  assert.equal(paneIdOfField(fields, 'out'), '')
  assert.equal(paneIdOfField(fields, 'tabs_1'), '')
})

test('trimPaneTitle trims and falls back when empty', () => {
  assert.equal(trimPaneTitle('  基本信息  ', '旧'), '基本信息')
  assert.equal(trimPaneTitle('   ', '  标签页1  '), '标签页1')
  assert.equal(trimPaneTitle('', ''), '标签页')
  assert.equal(trimPaneTitle('  联系  ', '联系'), '联系')
})

test('reorderPanes splices by id like reorderFields', () => {
  const panes = [
    { id: 'a', title: 'A' },
    { id: 'b', title: 'B' },
    { id: 'c', title: 'C' },
  ]
  reorderPanes(panes, 'c', 'a')
  assert.deepEqual(
    panes.map((item) => item.id),
    ['c', 'a', 'b'],
  )
  reorderPanes(panes, 'a', 'a')
  assert.deepEqual(
    panes.map((item) => item.id),
    ['c', 'a', 'b'],
  )
  reorderPanes(panes, 'missing', 'a')
  assert.deepEqual(
    panes.map((item) => item.id),
    ['c', 'a', 'b'],
  )
})
