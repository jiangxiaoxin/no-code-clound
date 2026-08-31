import { FormField } from './form-record.types';

export function flattenFields(
  fields: FormField[] | null | undefined,
): FormField[] {
  const out: FormField[] = [];
  for (const field of fields || []) {
    if (field.type === 'tabs') {
      for (const pane of field.panes || []) {
        out.push(...flattenFields(pane.fields || []));
      }
      continue;
    }
    out.push(field);
  }
  return out;
}
