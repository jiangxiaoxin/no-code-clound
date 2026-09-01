import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  MISSING_NAME,
  annotateCanvasJson,
  collectFieldTitles,
  collectSourceFormIds,
  dictTitlesFromOptions,
  formTitlesFromDirectory,
  lookupDictTitle,
  lookupFieldTitle,
  lookupFormTitle,
  parseCanvasJson,
} from './annotateCanvasJson.js'

test('parseCanvasJson rejects empty and invalid', () => {
  assert.throws(() => parseCanvasJson(''), { message: '请粘贴画布 JSON' })
  assert.throws(() => parseCanvasJson('   '), { message: '请粘贴画布 JSON' })
  assert.throws(() => parseCanvasJson('{'), { message: 'JSON 无法解析' })
})

test('parseCanvasJson accepts array or object', () => {
  assert.deepEqual(parseCanvasJson('[]'), [])
  assert.deepEqual(parseCanvasJson(' {"a":1} '), { a: 1 })
})

test('collect titles and source form ids from nested canvas', () => {
  const canvas = [
    {
      key: 'name',
      title: '姓名',
      type: 'input',
      sourceFormId: 12,
      sourceFieldKey: 'n1',
    },
    {
      type: 'tabs',
      panes: [{ fields: [{ key: 'city', title: '城市', type: 'input' }] }],
    },
    {
      type: 'subform',
      key: 'lines',
      title: '明细',
      fields: [{ key: 'qty', title: '数量', type: 'number' }],
      linkage: { sourceFormId: 9 },
    },
  ]
  const titles = collectFieldTitles(canvas)
  assert.equal(titles.get('name'), '姓名')
  assert.equal(titles.get('city'), '城市')
  assert.equal(titles.get('qty'), '数量')
  assert.deepEqual([...collectSourceFormIds(canvas)].sort((a, b) => a - b), [9, 12])
})

test('formTitlesFromDirectory walks groups and root forms', () => {
  const map = formTitlesFromDirectory({
    forms: [{ id: 11, name: '未分组' }],
    groups: [{ id: 1, name: '人事', forms: [{ id: 12, name: '客户表' }] }],
  })
  assert.equal(map.get(11), '未分组')
  assert.equal(map.get(12), '客户表')
})

test('lookup prefers canvas then source then system', () => {
  const canvas = new Map([['name', '姓名']])
  const source = new Map([['n1', '客户名称'], ['name', '他表姓名']])
  assert.equal(lookupFieldTitle('name', canvas, source), '姓名')
  assert.equal(lookupFieldTitle('n1', canvas, source), '客户名称')
  assert.equal(lookupFieldTitle('createdBy', canvas, source), '创建人')
  assert.equal(lookupFieldTitle('__createdAt', canvas, source), '创建时间')
  assert.equal(lookupFieldTitle('gone', canvas, source), MISSING_NAME)
  assert.equal(lookupFormTitle(12, new Map([[12, '客户表']])), '客户表')
  assert.equal(lookupFormTitle(99, new Map([[12, '客户表']])), MISSING_NAME)
  assert.equal(lookupDictTitle('leave_type', new Map([['leave_type', '请假类型']])), '请假类型')
  assert.equal(lookupDictTitle('gone', new Map([['leave_type', '请假类型']])), MISSING_NAME)
})

test('dictTitlesFromOptions maps code to name', () => {
  const map = dictTitlesFromOptions([
    { code: 'leave_type', name: '请假类型' },
    { code: '', name: '空' },
    { name: '无编码' },
  ])
  assert.equal(map.get('leave_type'), '请假类型')
  assert.equal(map.has(''), false)
})

test('annotateCanvasJson writes trailing comments', () => {
  const canvas = {
    key: 'name',
    title: '姓名',
    sourceFormId: 12,
    sourceFieldKey: 'n1',
    dictCode: 'leave_type',
    displayFieldKeys: ['city', 'gone'],
  }
  const canvasTitles = collectFieldTitles(canvas)
  const sourceTitles = new Map([['n1', '客户名称'], ['city', '城市']])
  const formTitles = new Map([[12, '客户表']])
  const dictTitles = new Map([['leave_type', '请假类型']])
  const text = annotateCanvasJson(
    canvas,
    canvasTitles,
    sourceTitles,
    formTitles,
    dictTitles,
  )
  assert.match(text, /"key": "name", \/\/ 姓名/)
  assert.match(text, /"sourceFormId": 12, \/\/ 客户表/)
  assert.match(text, /"sourceFieldKey": "n1", \/\/ 客户名称/)
  assert.match(text, /"dictCode": "leave_type", \/\/ 请假类型/)
  assert.match(text, /"city", \/\/ 城市/)
  assert.match(text, /"gone" \/\/ 未查找到/)
})
