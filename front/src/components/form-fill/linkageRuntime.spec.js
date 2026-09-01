import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  applyLinkageResult,
  applyPendingValueWrites,
  linkageConditionsReady,
  linkageFileOverflowMessage,
  linkageImageOverflowMessage,
  linkageManyMessage,
  linkageQueryPaging,
} from './linkageRuntime.js'

const linkage = {
  sourceFormId: 12,
  match: 'all',
  sourceKey: 'name',
  conditions: [{ key: 'empNo', op: 'eq', valueType: 'field', value: 'empNo' }],
}

test('field-ref conditions are not ready until current values are filled', () => {
  assert.equal(linkageConditionsReady(linkage, {}), false)
  assert.equal(linkageConditionsReady(linkage, { empNo: '' }), false)
  assert.equal(linkageConditionsReady(linkage, { empNo: 'E1' }), true)
})

test('empty/nempty and custom conditions do not wait on current fields', () => {
  assert.equal(
    linkageConditionsReady(
      {
        ...linkage,
        conditions: [{ key: 'empNo', op: 'nempty', valueType: 'custom', value: '' }],
      },
      {},
    ),
    true,
  )
  assert.equal(
    linkageConditionsReady(
      {
        ...linkage,
        conditions: [{ key: 'status', op: 'eq', valueType: 'custom', value: '在职' }],
      },
      {},
    ),
    true,
  )
})

test('value fields: 0 clears, 1 writes, many clears with message', () => {
  const field = {
    title: '姓名',
    type: 'input',
    linkage,
  }
  assert.deepEqual(applyLinkageResult(field, { items: [], total: 0 }, '旧'), {
    value: undefined,
    items: [],
    message: '',
  })
  assert.deepEqual(
    applyLinkageResult(
      field,
      { items: [{ data: { name: '张三' } }], total: 1 },
      undefined,
    ),
    { value: '张三', items: [], message: '' },
  )
  assert.deepEqual(
    applyLinkageResult(
      field,
      {
        items: [{ data: { name: '张三' } }, { data: { name: '李四' } }],
        total: 2,
      },
      '张三',
    ),
    {
      value: undefined,
      items: [],
      message: '[ 姓名 ] 字段联动查询出多条数据',
    },
  )
})

test('many records with the same trigger value still count as many for text fields', () => {
  const field = { title: '姓名', type: 'input', linkage }
  const result = applyLinkageResult(
    field,
    {
      items: [{ data: { name: '张三' } }, { data: { name: '张三' } }],
      total: 2,
    },
    undefined,
  )
  assert.equal(result.value, undefined)
  assert.equal(result.message, '[ 姓名 ] 字段联动查询出多条数据')
})

test('many-records message includes title and description', () => {
  assert.equal(
    linkageManyMessage({ title: '奖金基数', description: '数字越大给的越多' }),
    '[ 奖金基数，数字越大给的越多 ] 字段联动查询出多条数据',
  )
  assert.equal(
    linkageManyMessage({ title: '姓名' }),
    '[ 姓名 ] 字段联动查询出多条数据',
  )
})

test('select: 0 clears, 1 auto-selects, many keeps current if still in options', () => {
  const field = { title: '城市', type: 'select', linkage }
  assert.deepEqual(applyLinkageResult(field, { items: [], total: 0 }, '上海'), {
    value: undefined,
    items: [],
    message: '',
  })
  assert.deepEqual(
    applyLinkageResult(
      field,
      { items: [{ data: { name: '上海' } }], total: 1 },
      undefined,
    ),
    {
      value: '上海',
      items: [{ label: '上海', value: '上海' }],
      message: '',
    },
  )
  const many = applyLinkageResult(
    field,
    {
      items: [{ data: { name: '上海' } }, { data: { name: '北京' } }],
      total: 2,
    },
    '上海',
  )
  assert.equal(many.value, '上海')
  assert.equal(many.message, '')
  assert.equal(many.items.length, 2)
  const dropped = applyLinkageResult(
    field,
    {
      items: [{ data: { name: '广州' } }, { data: { name: '北京' } }],
      total: 2,
    },
    '上海',
  )
  assert.equal(dropped.value, undefined)
})

test('select-multiple keeps values that remain in the result set', () => {
  const field = { title: '标签', type: 'select-multiple', linkage }
  const one = applyLinkageResult(
    field,
    { items: [{ data: { name: 'A' } }], total: 1 },
    [],
  )
  assert.deepEqual(one.value, ['A'])
  const many = applyLinkageResult(
    field,
    {
      items: [{ data: { name: 'A' } }, { data: { name: 'B' } }],
      total: 2,
    },
    ['A', 'C'],
  )
  assert.deepEqual(many.value, ['A'])
  assert.equal(many.message, '')
})

test('value fields query two rows, select queries up to 100', () => {
  assert.deepEqual(linkageQueryPaging({ type: 'input' }), { page: 1, pageSize: 2 })
  assert.deepEqual(linkageQueryPaging({ type: 'image' }), {
    page: 1,
    pageSize: 100,
  })
  assert.deepEqual(linkageQueryPaging({ type: 'file' }), {
    page: 1,
    pageSize: 100,
  })
  assert.deepEqual(linkageQueryPaging({ type: 'select' }), {
    page: 1,
    pageSize: 100,
  })
  assert.deepEqual(linkageQueryPaging({ type: 'address' }), {
    page: 1,
    pageSize: 2,
  })
})

test('image fields collect urls up to maxCount from one or many rows', () => {
  const field = {
    title: '照片',
    type: 'image',
    maxCount: 3,
    linkage: { ...linkage, sourceKey: 'photos' },
  }
  assert.deepEqual(applyLinkageResult(field, { items: [], total: 0 }, ['/old.png']), {
    value: [],
    items: [],
    message: '',
  })
  assert.deepEqual(
    applyLinkageResult(
      field,
      { items: [{ data: { photos: '/a.png' } }], total: 1 },
      [],
    ),
    { value: ['/a.png'], items: [], message: '' },
  )
  assert.deepEqual(
    applyLinkageResult(
      field,
      {
        items: [
          { data: { photos: ['/a.png', '/b.jpg'] } },
          { data: { photos: ['/c.png'] } },
        ],
        total: 2,
      },
      [],
    ),
    { value: ['/a.png', '/b.jpg', '/c.png'], items: [], message: '' },
  )
  assert.deepEqual(
    applyLinkageResult(
      field,
      {
        items: [
          { data: { photos: ['/a.png', '/b.jpg'] } },
          { data: { photos: ['/c.png', '/d.png'] } },
        ],
        total: 2,
      },
      [],
    ),
    {
      value: [],
      items: [],
      message: '[ 照片 ] 字段联动图片超过最多 3 张',
    },
  )
  assert.equal(
    linkageImageOverflowMessage({
      title: '照片',
      description: '证件照',
      maxCount: 2,
    }),
    '[ 照片，证件照 ] 字段联动图片超过最多 2 张',
  )
})

test('file fields collect items up to maxCount from one or many rows', () => {
  const field = {
    title: '附件',
    type: 'file',
    maxCount: 3,
    linkage: { ...linkage, sourceKey: 'docs' },
  }
  const a = { url: '/uploads/files/a.docx', name: 'a.docx' }
  const b = { url: '/uploads/files/b.pdf', name: 'b.pdf' }
  const c = { url: '/uploads/files/c.xlsx', name: 'c.xlsx' }
  const d = { url: '/uploads/files/d.txt', name: 'd.txt' }
  assert.deepEqual(applyLinkageResult(field, { items: [], total: 0 }, [a]), {
    value: [],
    items: [],
    message: '',
  })
  assert.deepEqual(
    applyLinkageResult(field, { items: [{ data: { docs: [a] } }], total: 1 }, []),
    { value: [a], items: [], message: '' },
  )
  assert.deepEqual(
    applyLinkageResult(
      field,
      {
        items: [{ data: { docs: [a, b] } }, { data: { docs: [c] } }],
        total: 2,
      },
      [],
    ),
    { value: [a, b, c], items: [], message: '' },
  )
  assert.deepEqual(
    applyLinkageResult(
      field,
      {
        items: [{ data: { docs: [a, b] } }, { data: { docs: [c, d] } }],
        total: 2,
      },
      [],
    ),
    {
      value: [],
      items: [],
      message: '[ 附件 ] 字段联动文件超过最多 3 个',
    },
  )
  assert.equal(
    linkageFileOverflowMessage({
      title: '附件',
      description: '合同',
      maxCount: 2,
    }),
    '[ 附件，合同 ] 字段联动文件超过最多 2 个',
  )
})

test('address linkage writes adapted object for one row and clears when many', () => {
  const field = {
    title: '收货地址',
    type: 'address',
    addressFormat: 'province',
    linkage: { sourceKey: 'addr' },
  }
  const tree = [{ id: '130000', fullname: '河北省', level: 1, districts: [] }]
  const one = applyLinkageResult(
    field,
    {
      total: 1,
      items: [
        {
          data: {
            addr: {
              ids: ['130000', '130100'],
              labels: ['河北省', '石家庄市'],
              detail: '中山路',
            },
          },
        },
      ],
    },
    undefined,
    { addressTree: tree },
  )
  assert.deepEqual(one.value, { ids: ['130000'], labels: ['河北省'] })
  const many = applyLinkageResult(
    field,
    { total: 2, items: [{ data: {} }, { data: {} }] },
    undefined,
    { addressTree: tree },
  )
  assert.equal(many.message.includes('多条数据'), true)
})

test('address condition is not ready when path is empty', () => {
  assert.equal(
    linkageConditionsReady(
      {
        ...linkage,
        conditions: [{ key: 'addr', op: 'eq', valueType: 'field', value: 'addr' }],
      },
      { addr: { ids: [], labels: [] } },
    ),
    false,
  )
})

test('member single: 0 clears, 1 writes, many clears with message', () => {
  const field = {
    title: '负责人',
    type: 'member',
    linkage: { ...linkage, sourceKey: 'owner' },
  }
  assert.deepEqual(applyLinkageResult(field, { items: [], total: 0 }, 8), {
    value: undefined,
    items: [],
    message: '',
  })
  assert.deepEqual(
    applyLinkageResult(
      field,
      { items: [{ data: { owner: 9 } }], total: 1 },
      undefined,
    ),
    { value: 9, items: [], message: '' },
  )
  const many = applyLinkageResult(
    field,
    { items: [{ data: { owner: 9 } }, { data: { owner: 10 } }], total: 2 },
    9,
  )
  assert.equal(many.value, undefined)
  assert.equal(many.message.includes('多条数据'), true)
})

test('member-multiple collects ids across records without capping', () => {
  const field = {
    title: '成员',
    type: 'member-multiple',
    linkage: { ...linkage, sourceKey: 'owners' },
  }
  assert.deepEqual(linkageQueryPaging(field), { page: 1, pageSize: 100 })
  assert.deepEqual(
    applyLinkageResult(field, { items: [], total: 0 }, [1]),
    { value: [], items: [], message: '' },
  )
  assert.deepEqual(
    applyLinkageResult(
      field,
      {
        items: [
          { data: { owners: [2, 3] } },
          { data: { owners: 3 } },
          { data: { owners: [4] } },
        ],
        total: 3,
      },
      [],
    ),
    { value: [2, 3, 4], items: [], message: '' },
  )
})

test('applyPendingValueWrites ignores stale seq so an older query cannot overwrite', () => {
  const values = { lines: [{ name: 'B' }], title: '新' }
  const applied = applyPendingValueWrites(
    values,
    [
      { key: 'lines', value: [{ name: 'A' }] },
      { key: 'title', value: '旧' },
    ],
    1,
    2,
  )
  assert.equal(applied, false)
  assert.deepEqual(values.lines, [{ name: 'B' }])
  assert.equal(values.title, '新')
})

test('applyPendingValueWrites applies current seq', () => {
  const values = { lines: [] }
  const applied = applyPendingValueWrites(
    values,
    [{ key: 'lines', value: [{ name: 'B' }] }],
    2,
    2,
  )
  assert.equal(applied, true)
  assert.deepEqual(values.lines, [{ name: 'B' }])
})
