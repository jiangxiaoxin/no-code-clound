import { readFileSync } from 'fs';
import { join } from 'path';
import { REGION_DIR } from '../../config/region-dir';
import { FormField } from './form-record.types';

const ADDRESS_FORMATS = [
  'province',
  'province-city',
  'province-city-district',
  'province-city-district-detail',
] as const;

const DEFAULT_ADDRESS_FORMAT = 'province-city-district-detail';
const ADDRESS_DETAIL_MAX_LENGTH = 256;

type RegionNode = {
  id?: string;
  fullname?: string;
  districts?: RegionNode[];
};

const treeCache = new Map<string, RegionNode[]>();

function addressFormatOf(field: FormField | null | undefined): string {
  const format = field?.addressFormat;
  return format && ADDRESS_FORMATS.includes(format as (typeof ADDRESS_FORMATS)[number])
    ? format
    : DEFAULT_ADDRESS_FORMAT;
}

function addressHasDetail(field: FormField | null | undefined): boolean {
  return addressFormatOf(field) === 'province-city-district-detail';
}

function regionFileForFormat(format: string): string {
  if (format === 'province') return 'sheng.json';
  if (format === 'province-city') return 'sheng-shi.json';
  return 'sheng-shi-qu.json';
}

export function loadAddressTree(fieldOrFormat: FormField | string): RegionNode[] {
  const format =
    typeof fieldOrFormat === 'string'
      ? fieldOrFormat
      : addressFormatOf(fieldOrFormat);
  const file = regionFileForFormat(
    ADDRESS_FORMATS.includes(format as (typeof ADDRESS_FORMATS)[number])
      ? format
      : DEFAULT_ADDRESS_FORMAT,
  );
  const cached = treeCache.get(file);
  if (cached) return cached;
  const tree = JSON.parse(
    readFileSync(join(REGION_DIR, file), 'utf8'),
  ) as RegionNode[];
  treeCache.set(file, tree);
  return tree;
}

const EXAMPLE_PATH: Record<string, string> = {
  province: '山东省',
  'province-city': '山东省 / 青岛市',
  'province-city-district': '山东省 / 青岛市 / 市南区',
  'province-city-district-detail': '山东省 / 青岛市 / 市南区 | 香港中路 1 号',
};

export function addressImportExample(field: FormField): string {
  return `示例：${EXAMPLE_PATH[addressFormatOf(field)]}`;
}

export const ADDRESS_IMPORT_NOTE =
  '用 / 分段；详细地址用 | 分隔；可填名称或国标码';

type ParseOk = { ok: true; value?: { ids: string[]; labels: string[]; detail?: string } };
type ParseFail = { ok: false };

function childrenOf(node: RegionNode | undefined): RegionNode[] {
  return Array.isArray(node?.districts) ? node.districts : [];
}

function findNode(nodes: RegionNode[], segment: string): RegionNode | undefined {
  if (/^\d+$/.test(segment)) {
    return nodes.find((item) => String(item.id) === segment);
  }
  return nodes.find((item) => item.fullname === segment);
}

export function parseAddressImportCell(
  field: FormField,
  raw: unknown,
  tree: RegionNode[],
): ParseOk | ParseFail {
  if (raw === undefined || raw === null || raw === '') {
    return { ok: true, value: undefined };
  }
  const text = String(raw).trim();
  if (!text) return { ok: true, value: undefined };
  if (text.startsWith('示例：') || text.startsWith('示例:')) {
    return { ok: true, value: undefined };
  }

  const hasDetail = addressHasDetail(field);
  const pipe = text.indexOf('|');
  let pathText = text;
  let detail = '';
  if (hasDetail) {
    if (pipe < 0) return { ok: false };
    pathText = text.slice(0, pipe);
    detail = text.slice(pipe + 1).trim();
    if (!detail) return { ok: false };
    detail = detail.slice(0, ADDRESS_DETAIL_MAX_LENGTH);
  } else if (pipe >= 0) {
    return { ok: false };
  }

  const parts = pathText
    .split(/[/／]/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (!parts.length) return { ok: false };

  const ids: string[] = [];
  const labels: string[] = [];
  let nodes = tree || [];
  for (const part of parts) {
    const node = findNode(nodes, part);
    if (!node || node.id == null || !node.fullname) return { ok: false };
    ids.push(String(node.id));
    labels.push(node.fullname);
    nodes = childrenOf(node);
  }
  if (!ids.length || nodes.length) {
    return { ok: false };
  }
  const value: { ids: string[]; labels: string[]; detail?: string } = { ids, labels };
  if (hasDetail) value.detail = detail;
  return { ok: true, value };
}
