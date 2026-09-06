import {
  queryFormRecordsApi,
  updateFormRecordApi,
  uploadAppFileApi,
  uploadAppImageApi,
} from '../../api/apps.js'
import {
  renderLinkageApi,
  renderSourceRecordsApi,
  renderUploadApi,
} from '../../api/workflow.js'

export function appRecordSource({ appId, formId }) {
  return {
    kind: 'app',
    update: (recordId, data, intent) =>
      updateFormRecordApi(appId, formId, recordId, data, intent),
    querySource: ({ sourceFormId, body }) =>
      queryFormRecordsApi(appId, sourceFormId, { ...body, pickApproved: true }),
    upload: ({ file }) => uploadAppFileApi(appId, file),
    uploadImage: ({ file }) => uploadAppImageApi(appId, file),
  }
}

export function workflowInboxSource({ instanceId }) {
  return {
    kind: 'inbox',
    querySource: ({ fieldKey, body }) =>
      renderSourceRecordsApi(instanceId, { fieldKey, ...body }),
    linkage: ({ fieldKey, body }) =>
      renderLinkageApi(instanceId, { fieldKey, ...body }),
    upload: ({ fieldKey, file }) =>
      renderUploadApi(instanceId, fieldKey, file),
    uploadImage: ({ fieldKey, file }) =>
      renderUploadApi(instanceId, fieldKey, file),
  }
}
