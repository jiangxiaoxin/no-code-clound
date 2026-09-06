export type FormRecordActions = {
  create: boolean;
  edit: boolean;
  delete: boolean;
  import: boolean;
  export: boolean;
  downloadTemplate: boolean;
};

export const RECORD_ACTION_KEYS = [
  'create',
  'edit',
  'delete',
  'import',
  'export',
  'downloadTemplate',
] as const;

function actionFlag(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function normalizeRecordActions(raw: unknown): FormRecordActions {
  const src =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    create: actionFlag(src.create, true),
    edit: actionFlag(src.edit, true),
    delete: actionFlag(src.delete, true),
    import: actionFlag(src.import, false),
    export: actionFlag(src.export, false),
    downloadTemplate: actionFlag(src.downloadTemplate, false),
  };
}

export function normalizeFormConfig(value: unknown): Record<string, unknown> {
  const input =
    value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const { workspaceTabOrder: _ignored, ...rest } = input;
  return {
    ...rest,
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
