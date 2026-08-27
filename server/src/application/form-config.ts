export type FormRecordActions = {
  create: boolean;
  delete: boolean;
  import: boolean;
  export: boolean;
  downloadTemplate: boolean;
};

export const RECORD_ACTION_KEYS = [
  'create',
  'delete',
  'import',
  'export',
  'downloadTemplate',
] as const;

export function normalizeRecordActions(raw: unknown): FormRecordActions {
  const src =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    create: src.create !== false,
    delete: src.delete !== false,
    import: src.import !== false,
    export: src.export !== false,
    downloadTemplate: src.downloadTemplate !== false,
  };
}

export function normalizeFormConfig(value: unknown): Record<string, unknown> {
  const input =
    value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const order = Array.isArray(input.workspaceTabOrder)
    ? input.workspaceTabOrder.filter(
        (item): item is 'create' | 'list' => item === 'create' || item === 'list',
      )
    : [];
  const workspaceTabOrder =
    order.length === 2 && new Set(order).size === 2
      ? order
      : ['create', 'list'];
  return {
    ...input,
    workspaceTabOrder,
    recordActions: normalizeRecordActions(input.recordActions),
  };
}

export function mergeFormConfig(
  existing: unknown,
  patch: unknown,
): Record<string, unknown> {
  const current = normalizeFormConfig(existing);
  const next =
    patch && typeof patch === 'object'
      ? (patch as Record<string, unknown>)
      : {};
  return normalizeFormConfig({
    ...current,
    ...next,
    recordActions: {
      ...(current.recordActions as FormRecordActions),
      ...(next.recordActions && typeof next.recordActions === 'object'
        ? next.recordActions
        : {}),
    },
  });
}
