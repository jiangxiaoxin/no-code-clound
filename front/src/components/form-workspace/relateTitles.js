import { flattenFields } from '../form-design/tabsField.js'
import { formatCellValue, isFillable } from '../form-fill/fillValues.js'

export function relateTitleKey(formId, id) {
  return `${Number(formId)}:${id}`
}

export function relateIdsByForm(relateFields, records) {
  const byForm = new Map()
  for (const field of relateFields || []) {
    const formId = Number(field.sourceFormId)
    if (!Number.isInteger(formId) || formId <= 0) continue
    for (const row of records || []) {
      const id = row?.data?.[field.key]
      if (typeof id !== 'string' || !id) continue
      if (!byForm.has(formId)) byForm.set(formId, new Set())
      byForm.get(formId).add(id)
    }
  }
  return [...byForm].map(([formId, ids]) => ({ formId, ids: [...ids] }))
}

export function chunkIds(ids, size = 100) {
  const chunks = []
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size))
  }
  return chunks
}

function titleFieldOf(relateFields, formId) {
  const field = (relateFields || []).find(
    (item) => Number(item.sourceFormId) === Number(formId) && item.titleKey,
  )
  return field?.titleKey || ''
}

export async function loadRelateTitles(appId, relateFields, records) {
  const { getFormApi, queryFormRecordsApi } = await import('../../api/apps.js')
  const titles = {}
  for (const { formId, ids } of relateIdsByForm(relateFields, records)) {
    const titleKey = titleFieldOf(relateFields, formId)
    let sourceFields = []
    try {
      const detail = await getFormApi(appId, formId)
      sourceFields = flattenFields(detail?.fields || []).filter(isFillable)
    } catch {
      continue
    }
    const titleField = sourceFields.find((item) => item.key === titleKey)
    for (const chunk of chunkIds(ids)) {
      try {
        const result = await queryFormRecordsApi(appId, formId, {
          ids: chunk,
          pageSize: 100,
        })
        for (const row of result?.items || []) {
          const text = titleField
            ? formatCellValue(titleField, row.data?.[titleKey], {}, {}, {})
            : row.id
          titles[relateTitleKey(formId, row.id)] = text || row.id
        }
      } catch {
        // 这一批取不到就让单元格显示「已删除」，不阻塞整张列表
      }
    }
  }
  return titles
}
