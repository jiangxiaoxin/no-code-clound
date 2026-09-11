export const ROW_SCOPES = ['related', 'created', 'dept', 'all'] as const;

export type RowScope = (typeof ROW_SCOPES)[number];

export type FormViewerType = 'user' | 'department' | 'role';

export type FormViewer = {
  type: FormViewerType;
  targetId: number;
};

export type FormDataAccessConfig = {
  formViewers: FormViewer[];
  rowScope: RowScope;
};

function isViewerType(value: unknown): value is FormViewerType {
  return value === 'user' || value === 'department' || value === 'role';
}

export function normalizeRowScope(raw: unknown): RowScope {
  if (raw === 'created' || raw === 'dept' || raw === 'all' || raw === 'related') {
    return raw;
  }
  return 'related';
}

export function normalizeFormViewers(raw: unknown): FormViewer[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const list: FormViewer[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as { type?: unknown; targetId?: unknown };
    if (!isViewerType(row.type)) continue;
    const targetId = Number(row.targetId);
    if (!Number.isInteger(targetId) || targetId <= 0) continue;
    const key = `${row.type}:${targetId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    list.push({ type: row.type, targetId });
  }
  return list;
}

export function normalizeFormDataAccess(raw: unknown): FormDataAccessConfig {
  const input =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    formViewers: normalizeFormViewers(input.formViewers),
    rowScope: normalizeRowScope(input.rowScope),
  };
}
