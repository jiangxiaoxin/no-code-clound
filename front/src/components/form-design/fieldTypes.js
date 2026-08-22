import {
  Calendar,
  CircleCheck,
  Clock,
  EditPen,
  Finished,
  Grid,
  Link,
  Minus,
  Notebook,
  Odometer,
  OfficeBuilding,
  Picture,
  SemiSelect,
  Tickets,
  Upload,
  User,
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
  { type: 'select', label: '下拉框', icon: SemiSelect, component: 'el-select', placeholder: '请选择' },
  { type: 'member', label: '成员选择', icon: User, component: 'MemberSelect', placeholder: '请选择' },
  { type: 'dept', label: '部门选择', icon: OfficeBuilding, component: 'DeptSelect', placeholder: '请选择' },
  { type: 'divider', label: '分割线', icon: Minus, component: 'el-divider', placeholder: '' },
  { type: 'image', label: '图片上传', icon: Picture, component: 'el-upload', placeholder: '' },
  { type: 'file', label: '文件上传', icon: Upload, component: 'el-upload', placeholder: '' },
  { type: 'data', label: '选择数据', icon: Grid, component: 'DataSelect', placeholder: '请选择' },
  { type: 'subform', label: '子表单', icon: Tickets, component: 'SubForm', placeholder: '' },
  { type: 'relate', label: '关联数据', icon: Link, component: 'RelateData', placeholder: '请选择' },
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
