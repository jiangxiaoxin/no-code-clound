import {
  addressImportExample,
  loadAddressTree,
  parseAddressImportCell,
} from './address-import';

const cityTree = loadAddressTree('province-city');
const quTree = loadAddressTree('province-city-district');
const shengTree = loadAddressTree('province');

describe('address import cell', () => {
  it('parses name path and national codes', () => {
    const field = { key: 'addr', type: 'address', addressFormat: 'province-city' };
    expect(parseAddressImportCell(field, '山东省 / 青岛市', cityTree)).toEqual({
      ok: true,
      value: { ids: ['370000', '370200'], labels: ['山东省', '青岛市'] },
    });
    expect(parseAddressImportCell(field, '370000/370200', cityTree)).toEqual({
      ok: true,
      value: { ids: ['370000', '370200'], labels: ['山东省', '青岛市'] },
    });
  });

  it('requires leaf and pipe for detail', () => {
    const district = {
      key: 'addr',
      type: 'address',
      addressFormat: 'province-city-district',
    };
    expect(parseAddressImportCell(district, '山东省 / 青岛市', quTree).ok).toBe(
      false,
    );
    const detail = {
      key: 'addr',
      type: 'address',
      addressFormat: 'province-city-district-detail',
    };
    expect(
      parseAddressImportCell(detail, '山东省 / 青岛市 / 市南区', quTree).ok,
    ).toBe(false);
    expect(
      parseAddressImportCell(
        detail,
        '山东省 / 青岛市 / 市南区 | 香港中路 1 号',
        quTree,
      ).value,
    ).toEqual({
      ids: ['370000', '370200', '370202'],
      labels: ['山东省', '青岛市', '市南区'],
      detail: '香港中路 1 号',
    });
  });

  it('treats example prefix as empty', () => {
    const field = { key: 'addr', type: 'address', addressFormat: 'province' };
    expect(parseAddressImportCell(field, '示例：山东省', shengTree)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(addressImportExample(field)).toBe('示例：山东省');
  });

  it('accepts Beijing as city leaf and requires district when format is deeper', () => {
    const city = { key: 'addr', type: 'address', addressFormat: 'province-city' };
    expect(parseAddressImportCell(city, '北京市', cityTree)).toEqual({
      ok: true,
      value: { ids: ['110000'], labels: ['北京市'] },
    });
    const district = {
      key: 'addr',
      type: 'address',
      addressFormat: 'province-city-district',
    };
    expect(parseAddressImportCell(district, '北京市', quTree).ok).toBe(false);
    expect(parseAddressImportCell(district, '北京市 / 东城区', quTree)).toEqual({
      ok: true,
      value: { ids: ['110000', '110101'], labels: ['北京市', '东城区'] },
    });
  });
});
