import {
  Calendar,
  CircleCheck,
  Clock,
  CollectionTag,
  Document,
  EditPen,
  Finished,
  Grid,
  Link,
  Location,
  Minus,
  Notebook,
  Odometer,
  OfficeBuilding,
  Picture,
  SemiSelect,
  Tickets,
  Upload,
  User,
  UserFilled,
} from '@element-plus/icons-vue'

export const fieldTypes = [
  { type: 'input', label: '单行文本', icon: EditPen, component: 'el-input', placeholder: '请输入' },
  { type: 'textarea', label: '多行文本', icon: Notebook, component: 'el-input', placeholder: '请输入' },
  { type: 'number', label: '数字', icon: Odometer, component: 'el-input-number', placeholder: '请输入' },
  { type: 'date', label: '日期选择', icon: Calendar, component: 'el-date-picker', placeholder: '请选择' },
  { type: 'time', label: '时间选择', icon: Clock, component: 'el-time-picker', placeholder: '请选择' },
  { type: 'datetime', label: '日期时间', icon: Calendar, component: 'el-date-picker', placeholder: '请选择' },
  { type: 'radio', label: '单选框', icon: CircleCheck, component: 'el-radio-group', placeholder: '' },
  { type: 'checkbox', label: '复选框', icon: Finished, component: 'el-checkbox-group', placeholder: '' },
  { type: 'select', label: '下拉单选框', icon: SemiSelect, component: 'el-select', placeholder: '请选择' },
  { type: 'select-multiple', label: '下拉多选框', icon: SemiSelect, component: 'el-select', placeholder: '请选择' },
  { type: 'divider', label: '分割线', icon: Minus, component: 'el-divider', placeholder: '' },
  { type: 'currentUser', label: '登录人姓名', icon: UserFilled, component: 'CurrentUserName', placeholder: '' },
  { type: 'currentUserDept', label: '登录人部门', icon: OfficeBuilding, component: 'CurrentUserDept', placeholder: '' },
  { type: 'data', label: '选择数据', icon: Grid, component: 'DataSelect', placeholder: '请选择' },
  { type: 'address', label: '地址选择', icon: Location, component: 'FormAddressSelect', placeholder: '请选择' },
  { type: 'image', label: '图片上传', icon: Picture, component: 'el-upload', placeholder: '' },
  { type: 'file', label: '文件上传', icon: Upload, component: 'FileUpload', placeholder: '' },
  // -----------以下未完成------
  { type: 'member', label: '成员选择', icon: User, component: 'MemberSelect', placeholder: '请选择' },
  { type: 'dept', label: '部门选择', icon: OfficeBuilding, component: 'DeptSelect', placeholder: '请选择' },
  { type: 'serialNumber', label: '流水号生成', icon: CollectionTag, component: 'SerialNumber', placeholder: '请选择' },
  { type: 'relate', label: '关联数据', icon: Link, component: 'RelateData', placeholder: '请选择' },
 
  { type: 'subform', label: '子表单', icon: Tickets, component: 'SubForm', placeholder: '' },
  { type: 'relate-subform', label: '关联子表单', icon: Link, component: 'RelateSubForm', placeholder: '请选择' },
  { type: 'tabs', label: '标签页', icon: Document, component: 'Tabs', placeholder: '' },
  
]

export const formatOptions = {
  date: [
    { value: 'year', label: '年（2026）' },
    { value: 'month', label: '年月（2026-08）' },
    { value: 'date', label: '年月日（2026-08-22）' },
  ],
  time: [
    { value: 'HH:mm', label: '时分（16:26）' },
    { value: 'HH:mm:ss', label: '时分秒（16:26:30）' },
  ],
  datetime: [
    { value: 'YYYY-MM-DD HH:mm', label: '年月日时分（2026-08-22 16:26）' },
    { value: 'YYYY-MM-DD HH:mm:ss', label: '年月日时分秒（2026-08-22 16:26:30）' },
  ],
}

export const widthClass = {
  1: 'is-w-full',
  '1/2': 'is-w-half',
  '1/3': 'is-w-third',
  '2/3': 'is-w-two-thirds',
  '1/4': 'is-w-quarter',
  '3/4': 'is-w-three-quarters',
}

export const formColumnOptions = [
  { value: 1, label: '单列' },
  { value: 2, label: '双列' },
  { value: 3, label: '三列' },
  { value: 4, label: '四列' },
]

export function defaultWidthByColumns(columns) {
  if (columns === 2) return '1/2'
  if (columns === 3) return '1/3'
  if (columns === 4) return '1/4'
  return '1'
}

export function fieldTypeLabel(type) {
  return fieldTypes.find((item) => item.type === type)?.label || type
}

export function fieldOptionLabel(field) {
  const title = field?.title || field?.key || ''
  const typeLabel = fieldTypeLabel(field?.type)
  if (!typeLabel || typeLabel === field?.type) {
    return title
  }
  return `${title}（${typeLabel}）`
}

export function fieldTypeIcon(type) {
  return fieldTypes.find((item) => item.type === type)?.icon || null
}

export function isSelectType(type) {
  return type === 'select' || type === 'select-multiple'
}
