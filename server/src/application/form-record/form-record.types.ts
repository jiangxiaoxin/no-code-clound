export type SerialRuleSegment = {
  id?: string;
  kind?: string;
  text?: string;
  format?: string;
  start?: number;
  digits?: number;
  reset?: boolean;
  resetPeriod?: string;
  fieldKey?: string;
};

export type FormField = {
  key: string;
  type: string;
  title?: string;
  unique?: boolean;
  dictCode?: string;
  required?: boolean;
  optionSource?: string;
  addressFormat?: string;
  serialSeparator?: string;
  serialRule?: SerialRuleSegment[];
  panes?: { id: string; title?: string; fields?: FormField[] }[];
};
