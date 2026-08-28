import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  ADDRESS_DETAIL_MAX_LENGTH,
  DEFAULT_ADDRESS_FORMAT,
  adaptAddressToFormat,
  addressDisplay,
  addressFormatOf,
  addressHasDetail,
  emptyAddress,
  isAddressComplete,
  isAddressEmpty,
  labelsOfPath,
  normalizeAddressValue,
} from './addressField.js'

const hebeiTree = [
  {
    id: '130000',
    fullname: '河北省',
    level: 1,
    districts: [
      {
        id: '130100',
        fullname: '石家庄市',
        level: 2,
        districts: [{ id: '130102', fullname: '长安区', level: 3 }],
      },
    ],
  },
]
const beijingCityTree = [{ id: '110000', fullname: '北京市', level: 1 }]

test('defaults and empty', () => {
  assert.equal(DEFAULT_ADDRESS_FORMAT, 'province-city-district-detail')
  assert.equal(ADDRESS_DETAIL_MAX_LENGTH, 256)
  assert.equal(addressFormatOf({}), DEFAULT_ADDRESS_FORMAT)
  assert.equal(addressHasDetail({ addressFormat: 'province' }), false)
  assert.equal(addressHasDetail({}), true)
  assert.equal(isAddressEmpty(emptyAddress()), true)
  assert.equal(isAddressEmpty(undefined), true)
})

test('normalize keeps equal-length ids and labels, trims detail', () => {
  const value = normalizeAddressValue({
    ids: ['130000', '130100'],
    labels: ['河北省', '石家庄市'],
    detail: '  中山路  ',
  })
  assert.deepEqual(value, {
    ids: ['130000', '130100'],
    labels: ['河北省', '石家庄市'],
    detail: '中山路',
  })
  assert.equal(isAddressEmpty(value), false)
})

test('labelsOfPath walks fullname', () => {
  assert.deepEqual(labelsOfPath(hebeiTree, ['130000', '130100', '130102']), [
    '河北省',
    '石家庄市',
    '长安区',
  ])
})

test('display joins labels and detail', () => {
  assert.equal(
    addressDisplay({
      ids: ['130000', '130100'],
      labels: ['河北省', '石家庄市'],
      detail: '中山路 1 号',
    }),
    '河北省 / 石家庄市 中山路 1 号',
  )
})

test('complete: leaf required, detail required only for full format', () => {
  const district = {
    ids: ['130000', '130100', '130102'],
    labels: ['河北省', '石家庄市', '长安区'],
  }
  assert.equal(isAddressComplete(district, 'province-city-district', hebeiTree), true)
  assert.equal(
    isAddressComplete(district, 'province-city-district-detail', hebeiTree),
    false,
  )
  assert.equal(
    isAddressComplete(
      { ...district, detail: '中山路' },
      'province-city-district-detail',
      hebeiTree,
    ),
    true,
  )
  assert.equal(
    isAddressComplete(
      { ids: ['110000'], labels: ['北京市'] },
      'province-city',
      beijingCityTree,
    ),
    true,
  )
})

test('adapt drops extra levels and detail when target format is shallower', () => {
  const full = {
    ids: ['130000', '130100', '130102'],
    labels: ['河北省', '石家庄市', '长安区'],
    detail: '中山路',
  }
  assert.deepEqual(adaptAddressToFormat(full, 'province', hebeiTree), {
    ids: ['130000'],
    labels: ['河北省'],
  })
  assert.deepEqual(adaptAddressToFormat(full, 'province-city', hebeiTree), {
    ids: ['130000', '130100'],
    labels: ['河北省', '石家庄市'],
  })
  const beijingDistrict = {
    ids: ['110000', '110101'],
    labels: ['北京市', '东城区'],
    detail: '某街',
  }
  assert.deepEqual(
    adaptAddressToFormat(beijingDistrict, 'province-city', beijingCityTree),
    { ids: ['110000'], labels: ['北京市'] },
  )
})
