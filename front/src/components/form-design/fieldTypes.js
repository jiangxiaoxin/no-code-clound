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
  { type: 'input', label: '单行文本', icon: EditPen },
  { type: 'textarea', label: '多行文本', icon: Notebook },
  { type: 'number', label: '数字', icon: Odometer },
  { type: 'date', label: '日期时间', icon: Calendar },
  { type: 'radio', label: '单选框', icon: CircleCheck },
  { type: 'checkbox', label: '复选框', icon: Finished },
  { type: 'select', label: '下拉框', icon: SemiSelect },
  { type: 'member', label: '成员选择', icon: User },
  { type: 'dept', label: '部门选择', icon: OfficeBuilding },
  { type: 'divider', label: '分割线', icon: Minus },
  { type: 'image', label: '图片上传', icon: Picture },
  { type: 'file', label: '文件上传', icon: Upload },
  { type: 'data', label: '选择数据', icon: Grid },
  { type: 'subform', label: '子表单', icon: Tickets },
  { type: 'relate', label: '关联数据', icon: Link },
]

export const widthClass = {
  1: 'is-w-full',
  '1/2': 'is-w-half',
  '1/3': 'is-w-third',
  '2/3': 'is-w-two-thirds',
  '1/4': 'is-w-quarter',
  '3/4': 'is-w-three-quarters',
}
