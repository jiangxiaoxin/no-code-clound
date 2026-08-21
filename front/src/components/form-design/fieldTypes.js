import {
  Calendar,
  CircleCheck,
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
  { type: 'input', label: '单行文本', icon: EditPen, component: 'el-input' },
  { type: 'textarea', label: '多行文本', icon: Notebook, component: 'el-input' },
  { type: 'number', label: '数字', icon: Odometer, component: 'el-input' },
  { type: 'date', label: '日期时间', icon: Calendar, component: 'el-date-picker' },
  { type: 'radio', label: '单选框', icon: CircleCheck, component: 'el-radio-group' },
  { type: 'checkbox', label: '复选框', icon: Finished, component: 'el-checkbox-group' },
  { type: 'select', label: '下拉框', icon: SemiSelect, component: 'el-select' },
  { type: 'member', label: '成员选择', icon: User, component: 'MemberSelect' },
  { type: 'dept', label: '部门选择', icon: OfficeBuilding, component: 'DeptSelect' },
  { type: 'divider', label: '分割线', icon: Minus, component: 'el-divider' },
  { type: 'image', label: '图片上传', icon: Picture, component: 'el-upload' },
  { type: 'file', label: '文件上传', icon: Upload, component: 'el-upload' },
  { type: 'data', label: '选择数据', icon: Grid, component: 'DataSelect' },
  { type: 'subform', label: '子表单', icon: Tickets, component: 'SubForm' },
  { type: 'relate', label: '关联数据', icon: Link, component: 'RelateData' },
]

export const widthClass = {
  1: 'is-w-full',
  '1/2': 'is-w-half',
  '1/3': 'is-w-third',
  '2/3': 'is-w-two-thirds',
  '1/4': 'is-w-quarter',
  '3/4': 'is-w-three-quarters',
}
