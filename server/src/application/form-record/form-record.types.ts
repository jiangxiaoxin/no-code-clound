export type FormField = {
  key: string;
  type: string;
  title?: string;
  unique?: boolean;
  uniqueInRows?: boolean;
  dictCode?: string;
  required?: boolean;
  optionSource?: string;
  addressFormat?: string;
  panes?: { id: string; title?: string; fields?: FormField[] }[];
  fields?: FormField[];
};
