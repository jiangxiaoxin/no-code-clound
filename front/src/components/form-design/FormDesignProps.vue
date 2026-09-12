<template>
  <el-aside class="props" width="320px">
    <div class="props-tabs">
      <span class="props-tab" :class="{ 'is-active': tab === 'field' }" @click="$emit('update:tab', 'field')">
        字段属性
      </span>
      <span class="props-tab" :class="{ 'is-active': tab === 'form' }" @click="$emit('update:tab', 'form')">
        表单属性
      </span>
    </div>
    <el-empty v-if="tab === 'field' && !field" description="请选择字段" />
    <el-form v-else-if="tab === 'form'" label-position="top" @submit.prevent>
      <el-form-item label="表单布局">
        <el-select :model-value="columns" @change="$emit('update:columns', $event)">
          <el-option
            v-for="item in formColumnOptions"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
      </el-form-item>
    </el-form>
    <el-form v-else-if="tab === 'field'" label-position="top" @submit.prevent>
      <div class="field-type-row">
        <span class="field-type-label">组件类型</span>
        <span class="field-type-text">{{ fieldTypeText }}</span>
      </div>
      <template v-if="field.type !== 'tabs'">
      <el-form-item :label="field.type === 'divider' ? '标题' : '字段标题'">
        <el-input v-model="field.title" maxlength="32" />
      </el-form-item>
      <el-form-item v-if="!workflowForm" label="显示设置">
        <div class="required-row">
          <span>是否可见</span>
          <el-switch :model-value="field.visible !== false" @change="onVisibleChange" />
        </div>
      </el-form-item>
      <template v-if="!isCurrentDisplayField">
      <template v-if="field.type !== 'divider'">
      <el-form-item v-if="field.type !== 'divider' && field.type !== 'image' && field.type !== 'file' && field.type !== 'subform' && field.type !== 'relate-subform'" label="占位文字">
        <el-input v-model="field.placeholder" maxlength="64" />
      </el-form-item>
      <el-form-item label="字段说明">
        <el-input v-model="field.description" type="textarea" :rows="3" maxlength="200" show-word-limit
          placeholder="填写后，标题右侧会显示说明" />
      </el-form-item>
      <el-form-item v-if="canEditFormula" label="计算公式">
        <div class="formula-row">
          <span class="formula-summary">{{ formulaSummaryText || '未设置' }}</span>
          <el-button link type="primary" @click="formulaDialogVisible = true">
            编辑公式
          </el-button>
          <el-button v-if="hasFieldFormula" link type="danger" @click="onClearFormula">
            清除
          </el-button>
        </div>
      </el-form-item>
      <el-form-item v-if="!isSerialField && !isRelateSubform && !hasFieldFormula" label="校验设置">
        <div style="width: 100%;">
          <div class="required-row">
            <span>必填</span>
            <el-switch v-model="field.required" />
          </div>
          <div v-if="field.type === 'address'" class="required-row">
            <span>地址格式</span>
            <el-select v-model="field.addressFormat" class="address-format-select">
              <el-option
                v-for="item in ADDRESS_FORMAT_OPTIONS"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
          </div>
          <div class="required-row">
            <span>是否禁用</span>
            <el-switch v-model="field.disabled" />
          </div>
          <div v-if="!workflowForm" class="required-row">
            <span>是否可修改</span>
            <el-switch :model-value="field.editable !== false" @change="onEditableChange" />
          </div>
          <div v-if="showUniqueSwitch" class="required-row">
            <span>不允许重复值</span>
            <el-switch :model-value="Boolean(field.unique)" @change="onUniqueChange" />
          </div>
          <div v-if="showUniqueInRowsSwitch" class="required-row">
            <span>单条数据内不允许重复值</span>
            <el-switch
              :model-value="Boolean(field.uniqueInRows || field.unique)"
              :disabled="Boolean(field.unique)"
              @change="onUniqueInRowsChange"
            />
          </div>
          <div v-if="field.type === 'input' || field.type === 'textarea'" class="required-row">
            <span>最大文本长度：</span>
            <el-input-number
              v-model="field.maxLength"
              class="max-length-input"
              :min="0"
              :precision="0"
              :step="1"
              step-strictly
              :controls="false"
              size="small"
              align="left"
              placeholder="最大长度"
            />
            <span>字符</span>
          </div>
          <div v-if="field.type === 'number'" class="required-row">
            <span>数值范围</span>
            <el-switch v-model="field.rangeEnabled" />
          </div>
          <div v-if="field.type === 'number' && field.rangeEnabled" class="range-inputs">
            <el-input-number v-model="field.min" :controls="false" placeholder="最小值" size="small" align="left"/>
            <span>~</span>
            <el-input-number v-model="field.max" :controls="false" placeholder="最大值" size="small" align="left"/>
          </div>
          <div v-if="field.type === 'image'" class="required-row">
            <span>最多上传</span>
            <el-input-number
              v-model="field.maxCount"
              class="max-length-input"
              :min="1"
              :precision="0"
              :step="1"
              step-strictly
              :controls="false"
              size="small"
              align="left"
            />
            <span>张图片</span>
          </div>
          <div v-if="field.type === 'image'" class="required-row">
            <span>每张不超过</span>
            <el-input-number
              v-model="field.maxSizeMB"
              class="max-length-input"
              :min="1"
              :precision="0"
              :step="1"
              step-strictly
              :controls="false"
              size="small"
              align="left"
            />
            <span>MB</span>
          </div>
          <div v-if="field.type === 'image'" class="required-row">
            <span>允许格式</span>
            <el-select
              v-model="field.acceptFormats"
              class="image-format-select"
              multiple
              placeholder="请选择格式"
            >
              <el-option
                v-for="item in IMAGE_FORMAT_OPTIONS"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
          </div>
          <div v-if="field.type === 'image'" class="required-row">
            <span>开启压缩</span>
            <el-switch v-model="field.compress" />
          </div>
          <div v-if="field.type === 'file'" class="required-row">
            <span>最多上传</span>
            <el-input-number
              v-model="field.maxCount"
              class="max-length-input"
              :min="1"
              :precision="0"
              :step="1"
              step-strictly
              :controls="false"
              size="small"
              align="left"
            />
            <span>个文件</span>
          </div>
          <div v-if="field.type === 'file'" class="required-row">
            <span>每个不超过</span>
            <el-input-number
              v-model="field.maxSizeMB"
              class="max-length-input"
              :min="1"
              :precision="0"
              :step="1"
              step-strictly
              :controls="false"
              size="small"
              align="left"
            />
            <span>MB</span>
          </div>
          <div v-if="field.type === 'file'" class="required-row">
            <span>允许格式</span>
            <el-select
              v-model="field.acceptFormats"
              class="image-format-select"
              multiple
              placeholder="请选择格式"
            >
              <el-option
                v-for="item in FILE_FORMAT_OPTIONS"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
          </div>
          <div v-if="field.type === 'file'" class="required-row">
            <span>是否可下载</span>
            <el-switch v-model="field.downloadable" />
          </div>
        </div>
      </el-form-item>
      <template v-if="isMemberFieldType">
        <el-form-item label="可选范围">
          <el-radio-group :model-value="field.memberScope || 'all'" @change="onMemberScopeChange">
            <el-radio-button value="all">全部</el-radio-button>
            <el-radio-button value="custom">自定义</el-radio-button>
            <el-radio-button value="dept_field">按部门字段</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="(field.memberScope || 'all') === 'custom'" label="自定义范围">
          <div class="linkage-row">
            <div
              class="filter-trigger"
              :class="{ 'is-placeholder': !hasCustomScope }"
              @click="openMemberScopeDialog"
            >
              {{ hasCustomScope ? '已设置可选范围' : '设置可选范围' }}
            </div>
            <el-icon
              v-if="hasCustomScope"
              class="linkage-clear"
              @click.stop="confirmClearMemberScope"
            >
              <CircleClose />
            </el-icon>
          </div>
        </el-form-item>
        <el-form-item v-if="(field.memberScope || 'all') === 'dept_field'" label="部门字段">
          <el-select
            v-model="field.sourceDeptFieldKey"
            clearable
            :placeholder="deptFieldOptions.length ? '请选择' : '请先添加部门单选字段'"
          >
            <el-option
              v-for="item in deptFieldOptions"
              :key="item.key"
              :label="item.title || item.key"
              :value="item.key"
            />
          </el-select>
        </el-form-item>
        <el-dialog
          v-model="memberScopeVisible"
          title="设置可选范围（选择的合集作为备选）"
          width="720px"
          draggable
          @open="onMemberScopeDialogOpen"
        >
          <div class="member-scope-dialog">
            <div v-if="hasScopePicked" class="member-scope-picked">
              <div v-if="scopeDeptIds.length" class="member-scope-picked-row">
                <span class="member-scope-picked-label">部门</span>
                <div class="member-scope-picked-tags">
                  <span
                    v-for="id in scopeDeptIds"
                    :key="'dept-' + id"
                    class="member-scope-picked-tag"
                  >
                    <span>{{ scopeDeptName(id) }}</span>
                    <el-icon
                      class="member-scope-picked-close"
                      @click="onRemoveScopeDept(id)"
                    >
                      <Close />
                    </el-icon>
                  </span>
                </div>
              </div>
              <div v-if="scopeRoleIds.length" class="member-scope-picked-row">
                <span class="member-scope-picked-label">角色</span>
                <div class="member-scope-picked-tags">
                  <span
                    v-for="id in scopeRoleIds"
                    :key="'role-' + id"
                    class="member-scope-picked-tag"
                  >
                    <span>{{ scopeRoleName(id) }}</span>
                    <el-icon
                      class="member-scope-picked-close"
                      @click="onRemoveScopeRole(id)"
                    >
                      <Close />
                    </el-icon>
                  </span>
                </div>
              </div>
              <div v-if="scopeUserIds.length" class="member-scope-picked-row">
                <span class="member-scope-picked-label">人员</span>
                <div class="member-scope-picked-tags">
                  <span
                    v-for="id in scopeUserIds"
                    :key="'user-' + id"
                    class="member-scope-picked-tag"
                  >
                    <span>{{ scopeUserName(id) }}</span>
                    <el-icon
                      class="member-scope-picked-close"
                      @click="onRemoveScopeUser(id)"
                    >
                      <Close />
                    </el-icon>
                  </span>
                </div>
              </div>
            </div>
            <el-tabs
              v-model="memberScopeTab"
              class="member-scope-tabs"
              @tab-change="onMemberScopeTabChange"
            >
              <el-tab-pane label="部门" name="dept">
                <div class="member-scope-pane">
                  <el-tree
                    ref="scopeDeptTreeRef"
                    :data="orgDepartments"
                    node-key="id"
                    show-checkbox
                    default-expand-all
                    :props="{ label: 'name', children: 'children' }"
                    @check="syncScopeDeptIds"
                  />
                </div>
              </el-tab-pane>
              <el-tab-pane label="角色" name="role">
                <div class="member-scope-pane">
                  <el-checkbox-group v-model="scopeRoleIds">
                    <el-checkbox
                      v-for="role in orgRoles"
                      :key="role.id"
                      :value="role.id"
                    >
                      {{ role.name }}
                    </el-checkbox>
                  </el-checkbox-group>
                </div>
              </el-tab-pane>
              <el-tab-pane label="人员" name="user">
                <div class="member-scope-pane member-scope-users">
                  <el-input
                    v-model="scopeUserKeyword"
                    clearable
                    placeholder="按姓名 / 用户名搜索"
                    @change="onScopeUserKeywordChange"
                  />
                  <div class="member-scope-user-list">
                    <el-checkbox-group v-model="scopeUserIds">
                      <el-checkbox
                        v-for="user in orgUsers"
                        :key="user.id"
                        :value="user.id"
                      >
                        {{ user.displayName }}
                      </el-checkbox>
                    </el-checkbox-group>
                  </div>
                  <div class="member-scope-pager">
                    <el-pagination
                      background
                      layout="total, sizes, prev, pager, next"
                      :current-page="scopeUserPage"
                      :page-size="scopeUserPageSize"
                      :page-sizes="PAGE_SIZES"
                      :total="scopeUserTotal"
                      size="small"
                      @current-change="onScopeUserPageChange"
                      @size-change="onScopeUserPageSizeChange"
                    />
                  </div>
                </div>
              </el-tab-pane>
            </el-tabs>
          </div>
          <template #footer>
            <el-button @click="closeMemberScopeDialog">取消</el-button>
            <el-button type="primary" @click="confirmMemberScope">确定</el-button>
          </template>
        </el-dialog>
      </template>
      <template v-if="isDeptFieldType">
        <el-form-item label="可选范围">
          <el-radio-group :model-value="field.deptScope || 'all'" @change="onDeptScopeChange">
            <el-radio-button value="all">全部</el-radio-button>
            <el-radio-button value="custom">自定义</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="(field.deptScope || 'all') === 'custom'" label="自定义范围">
          <div class="linkage-row">
            <div
              class="filter-trigger"
              :class="{ 'is-placeholder': !hasCustomDeptScopeValue }"
              @click="openDeptScopeDialog"
            >
              {{ hasCustomDeptScopeValue ? '已设置可选范围' : '设置可选范围' }}
            </div>
            <el-icon
              v-if="hasCustomDeptScopeValue"
              class="linkage-clear"
              @click.stop="confirmClearDeptScope"
            >
              <CircleClose />
            </el-icon>
          </div>
        </el-form-item>
        <el-dialog
          v-model="deptScopeVisible"
          title="设置可选范围"
          width="520px"
          draggable
          @open="onDeptScopeDialogOpen"
        >
          <div class="member-scope-dialog">
            <div v-if="deptScopeIds.length" class="member-scope-picked">
              <div class="member-scope-picked-row">
                <span class="member-scope-picked-label">部门</span>
                <div class="member-scope-picked-tags">
                  <span
                    v-for="id in deptScopeIds"
                    :key="'dept-scope-' + id"
                    class="member-scope-picked-tag"
                  >
                    <span>{{ deptScopeName(id) }}</span>
                    <el-icon
                      class="member-scope-picked-close"
                      @click="onRemoveDeptScopeId(id)"
                    >
                      <Close />
                    </el-icon>
                  </span>
                </div>
              </div>
            </div>
            <div class="member-scope-pane">
              <el-tree
                ref="deptScopeTreeRef"
                :data="deptScopeDepartments"
                node-key="id"
                show-checkbox
                default-expand-all
                :props="{ label: 'name', children: 'children' }"
                @check="syncDeptScopeIds"
              />
            </div>
          </div>
          <template #footer>
            <el-button @click="closeDeptScopeDialog">取消</el-button>
            <el-button type="primary" @click="confirmDeptScope">确定</el-button>
          </template>
        </el-dialog>
      </template>
      <el-form-item v-if="field.type === 'number'" label="格式">
        <div class="required-row">
          <span>保持</span>
          <el-input-number
            v-model="field.precision"
            :min="0"
            :precision="0"
            :step="1"
            step-strictly
            :controls="false"
            size="small"
            align="left"
          />
          <span>位小数</span>
        </div>
      </el-form-item>
      <el-form-item v-else-if="formatOptions[field.type]" label="格式">
        <el-select v-model="field.format">
          <el-option
            v-for="item in formatOptions[field.type]"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item v-if="field.type === 'radio' || field.type === 'checkbox'" label="选项字典">
        <el-select v-model="field.dictCode" clearable placeholder="请选择字典">
          <el-option
            v-for="item in dictionaries"
            :key="item.code"
            :label="item.name"
            :value="item.code"
          />
        </el-select>
      </el-form-item>
      <template v-else-if="hasLinkageSource(field.type)">
        <el-form-item :label="optionSourceLabel">
          <el-select
            v-model="field.optionSource"
            placeholder="请选择"
            @change="onOptionSourceChange"
          >
            <el-option
              v-for="item in optionSourceChoices(field.type)"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item v-if="field.optionSource === 'dictionary'" label="选项字典">
          <el-select v-model="field.dictCode" clearable placeholder="请选择字典">
            <el-option
              v-for="item in dictionaries"
              :key="item.code"
              :label="item.name"
              :value="item.code"
            />
          </el-select>
        </el-form-item>
        <el-form-item v-else-if="field.optionSource === 'table_data'" label="表字段">
          <FormFieldSourcePicker
            :app-id="appId"
            :form-id="formId"
            :source-form-id="field.sourceFormId"
            :source-field-key="field.sourceFieldKey"
            @select="onSourceFieldSelect"
          />
        </el-form-item>
        <el-form-item v-if="field.optionSource === 'table_data'" label="选项过滤">
          <div class="linkage-row">
            <div
              class="filter-trigger"
              :class="{ 'is-placeholder': !hasOptionFilters(field.optionFilters) }"
              @click="openOptionFilters"
            >
              {{ hasOptionFilters(field.optionFilters) ? '已添加过滤条件' : '添加过滤条件' }}
            </div>
            <el-icon
              v-if="hasOptionFilters(field.optionFilters)"
              class="linkage-clear"
              @click.stop="confirmClearOptionFilters"
            >
              <CircleClose />
            </el-icon>
          </div>
        </el-form-item>
        <el-form-item v-if="field.optionSource === 'linkage'" label="数据联动">
          <div class="linkage-row">
            <div
              class="filter-trigger"
              :class="{ 'is-placeholder': !hasLinkage(field) }"
              @click="openLinkage"
            >
              {{ hasLinkage(field) ? '已设置数据联动' : '设置数据联动' }}
            </div>
            <el-icon
              v-if="hasLinkage(field)"
              class="linkage-clear"
              @click.stop="confirmClearLinkage"
            >
              <CircleClose />
            </el-icon>
          </div>
        </el-form-item>
      </template>
      <template v-else-if="field.type === 'data'">
        <el-form-item label="数据源">
          <FormSourcePicker
            :app-id="appId"
            :form-id="formId"
            :source-form-id="field.sourceFormId"
            @select="onSourceFormSelect"
          />
        </el-form-item>
        <el-form-item v-if="field.sourceFormId && !isSubformChild" label="显示在表单中的字段">
          <div
            class="filter-trigger"
            :class="{ 'is-placeholder': !hasDisplayFields }"
            @click="openDisplayFields"
          >
            {{ displayFieldsTriggerText }}
          </div>
        </el-form-item>
        <el-form-item v-if="field.sourceFormId" label="填充到表单中的字段">
          <div
            class="filter-trigger"
            :class="{ 'is-placeholder': !hasFillMappings(field.fillMappings) }"
            @click="openFillMapping"
          >
            {{
              hasFillMappings(field.fillMappings)
                ? `已添加 ${field.fillMappings.length} 条填充规则`
                : '设置填充字段'
            }}
          </div>
        </el-form-item>
        <el-form-item v-if="field.sourceFormId" label="选择过程设置">
          <div
            class="filter-trigger"
            :class="{ 'is-placeholder': !hasProcessSetup }"
            @click="openProcess"
          >
            {{ processTriggerText }}
          </div>
        </el-form-item>
      </template>
      <template v-else-if="field.type === 'relate'">
        <el-form-item label="数据源">
          <FormSourcePicker
            :app-id="appId"
            :form-id="formId"
            :source-form-id="field.sourceFormId"
            include-current
            @select="onRelateSourceSelect"
          />
        </el-form-item>
        <el-form-item v-if="field.sourceFormId" label="显示字段">
          <el-select
            :model-value="field.titleKey || ''"
            class="relate-title-select"
            placeholder="请选择显示字段"
            @change="onRelateTitleKeyChange"
          >
            <el-option
              v-for="item in relateTitleOptions"
              :key="item.key"
              :label="item.title || item.key"
              :value="item.key"
            />
          </el-select>
        </el-form-item>
        <el-form-item v-if="field.sourceFormId && !field.titleKey" label=" ">
          <span class="relate-title-hint">选了显示字段，收起时和数据管理列表才有文字</span>
        </el-form-item>
        <el-form-item v-if="field.sourceFormId" label="显示在表单中的字段">
          <div
            class="filter-trigger"
            :class="{ 'is-placeholder': !hasDisplayFields }"
            @click="openDisplayFields"
          >
            {{ displayFieldsTriggerText }}
          </div>
        </el-form-item>
        <el-form-item v-if="field.sourceFormId" label="填充到表单中的字段">
          <div
            class="filter-trigger"
            :class="{ 'is-placeholder': !hasFillMappings(field.fillMappings) }"
            @click="openFillMapping"
          >
            {{
              hasFillMappings(field.fillMappings)
                ? `已添加 ${field.fillMappings.length} 条填充规则`
                : '设置填充字段'
            }}
          </div>
        </el-form-item>
        <el-form-item v-if="field.sourceFormId" label="选择过程设置">
          <div
            class="filter-trigger"
            :class="{ 'is-placeholder': !hasProcessSetup }"
            @click="openProcess"
          >
            {{ processTriggerText }}
          </div>
        </el-form-item>
      </template>
      <template v-else-if="field.type === 'relate-subform'">
        <el-form-item label="关联表单">
          <span class="relate-subform-label">{{ relateSubformLabel }}</span>
        </el-form-item>
        <el-form-item label="显示的列">
          <el-select
            :model-value="field.columnKeys || []"
            class="relate-subform-select"
            multiple
            collapse-tags
            collapse-tags-tooltip
            placeholder="请选择要显示的列"
            @change="onRelateSubformColumnsChange"
          >
            <el-option
              v-for="item in relateSubformColumnOptions"
              :key="item.key"
              :label="item.title || item.key"
              :value="item.key"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="是否可查看详情">
          <el-switch v-model="field.canViewDetail" />
        </el-form-item>
      </template>
      <DataSelectDisplayFieldsDialog
        v-model="displayVisible"
        :display-field-keys="field?.displayFieldKeys"
        :source-fields="sourceFields"
        @confirm="onDisplayConfirm"
      />
      <DataSelectFillMappingDialog
        v-model="mappingVisible"
        :fill-mappings="field?.fillMappings"
        :source-fields="sourceFields"
        :form-fields="formFields"
        @confirm="onMappingConfirm"
      />
      <DataSelectProcessDrawer
        v-model="processVisible"
        :app-id="appId"
        :picker-column-keys="field?.pickerColumnKeys"
        :option-filters="field?.optionFilters"
        :source-fields="sourceFields"
        :form-fields="conditionFields"
        @confirm="onProcessConfirm"
      />
      <DataLinkageDialog
        v-model="linkageVisible"
        :app-id="appId"
        :form-id="formId"
        :field-title="field.title"
        :field-type="field.type"
        :linkage="field.linkage"
        :current-fields="parentSubform ? conditionFields : currentFields"
        :form-fields="parentSubform ? conditionFields : formFields"
        @confirm="onLinkageConfirm"
      />
      <FormulaEditorDialog
        v-model="formulaDialogVisible"
        :field="field"
        :fields="fields"
        @save="onFormulaSaved"
      />
      <FormOptionFilterDialog
        v-model="filterVisible"
        :app-id="appId"
        :option-filters="field.optionFilters"
        :source-fields="sourceFields"
        :form-fields="optionFilterFields"
        @confirm="onFilterConfirm"
      />
      </template>
      </template>
      <template v-if="field.type === 'subform'">
        <el-form-item label="取值来源">
          <el-select v-model="field.optionSource" placeholder="请选择" @change="onSubformSourceChange">
            <el-option value="custom" label="自定义" />
            <el-option value="linkage" label="数据联动" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="field.optionSource === 'linkage'" label="数据联动">
          <div class="linkage-row">
            <div
              class="filter-trigger"
              :class="{ 'is-placeholder': !hasSubformLinkage(field) }"
              @click="openSubformLinkage"
            >
              {{ hasSubformLinkage(field) ? '已设置数据联动' : '设置数据联动' }}
            </div>
            <el-icon
              v-if="hasSubformLinkage(field)"
              class="linkage-clear"
              @click.stop="confirmClearLinkage"
            >
              <CircleClose />
            </el-icon>
          </div>
        </el-form-item>
        <el-form-item v-if="showDefaultRowCount">
          <div class="required-row">
            <span>默认行数</span>
            <el-input-number
              v-model="field.defaultRowCount"
              class="max-length-input"
              :min="0"
              :max="10"
              :precision="0"
              :step="1"
              step-strictly
              :controls="false"
              size="small"
              align="left"
            />
          </div>
        </el-form-item>
        <el-form-item>
          <div class="required-row">
            <span>固定前 N 列</span>
            <el-input-number
              v-model="field.frozenCols"
              class="max-length-input"
              :min="0"
              :max="5"
              :precision="0"
              :step="1"
              step-strictly
              :controls="false"
              size="small"
              align="left"
            />
          </div>
        </el-form-item>
        <el-form-item label="子字段">
          <div class="subform-children">
            <div
              v-for="(child, index) in field.fields || []"
              :key="child.key"
              class="subform-child-row"
              @click="onSelectChild(child)"
            >
              <span class="subform-child-title">{{ child.title }}（{{ fieldTypeLabel(child.type) }}）</span>
              <span class="subform-child-actions">
                <el-button
                  link
                  type="primary"
                  :disabled="index === 0"
                  @click.stop="onMoveChild(child, -1)"
                >
                  上移
                </el-button>
                <el-button
                  link
                  type="primary"
                  :disabled="index === (field.fields || []).length - 1"
                  @click.stop="onMoveChild(child, 1)"
                >
                  下移
                </el-button>
                <!-- <el-button link type="primary" @click.stop="onCopyChild(child)">复制</el-button> -->
                <el-button link type="danger" @click.stop="onRemoveChild(child)">删除</el-button>
              </span>
            </div>
            <el-dropdown
              trigger="click"
              popper-class="canvas-subform-type-menu"
              @command="onAddChildType"
            >
              <el-button type="primary" link>添加子字段</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item
                    v-for="item in childTypeOptions"
                    :key="item.type"
                    :command="item.type"
                    :icon="item.icon"
                  >
                    {{ item.label }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </el-form-item>
        <SubformLinkageDialog
          v-model="subformLinkageVisible"
          :app-id="appId"
          :form-id="formId"
          :linkage="field.linkage"
          :form-fields="mainLabeledFields"
          :target-fields="field.fields || []"
          @confirm="onLinkageConfirm"
        />
      </template>
      <template v-if="isSerialField">
        <el-form-item label="流水号分隔符">
          <el-input
            :model-value="field.serialSeparator"
            maxlength="8"
            placeholder="各段之间的连接符，留空则直接相连"
            @input="onSerialSeparatorInput"
          />
        </el-form-item>
        <div class="serial-rule-list" :class="{ 'is-reordering': isSerialReordering }">
          <div
            v-for="seg in field.serialRule"
            :key="seg.id"
            class="serial-rule-row"
            :class="serialRowClass(seg)"
            @dragover="onSerialDragOver(seg, $event)"
            @drop="onSerialDrop(seg, $event)"
          >
            <span
              class="serial-rule-handle"
              draggable="true"
              @dragstart="onSerialDragStart(seg, $event)"
              @dragend="onSerialDragEnd"
            >
              <el-icon><Rank /></el-icon>
            </span>
            <button
              type="button"
              class="serial-rule-summary"
              :class="{ 'is-active': serialSegDialogVisible && activeSerialSegId === seg.id, 'is-invalid': isSerialFieldSegInvalid(seg) }"
              @click="onSelectSerialSeg(seg)"
            >
              {{ serialSegmentSummary(seg, fields) }}
            </button>
            <el-button type="danger" link :icon="Delete" @click="onRemoveSerialSeg(seg)" />
          </div>
          <div class="serial-rule-add">
            <el-dropdown trigger="click" @command="onAddSerialSeg">
              <el-button :icon="Plus" type="primary">添加</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="fixed">固定字符</el-dropdown-item>
                  <el-dropdown-item command="datetime">日期时间</el-dropdown-item>
                  <el-dropdown-item
                    command="counter"
                    :disabled="!canAddSerialCounter(field.serialRule)"
                  >
                    自动计数
                  </el-dropdown-item>
                  <el-dropdown-item command="field">表单字段</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>
        <el-dialog
          v-model="serialSegDialogVisible"
          :title="serialSegDialogTitle"
          width="480px"
          draggable
          @closed="onSerialSegDialogClosed"
        >
          <el-form v-if="activeSerialSeg" label-position="top" @submit.prevent>
            <el-form-item v-if="activeSerialSeg.kind === 'fixed'" label="固定字符">
              <el-input
                v-model="activeSerialSeg.text"
                maxlength="32"
                @keydown="onSerialFixedKeydown"
              />
            </el-form-item>
            <el-form-item v-if="activeSerialSeg.kind === 'datetime'" label="日期格式">
              <el-select v-model="activeSerialSeg.format">
                <el-option
                  v-for="item in SERIAL_DATETIME_OPTIONS"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
                />
              </el-select>
            </el-form-item>
            <template v-if="activeSerialSeg.kind === 'counter'">
              <el-form-item label="起始值">
                <el-input-number
                  v-model="activeSerialSeg.start"
                  :min="0"
                  :precision="0"
                  :controls="false"
                />
              </el-form-item>
              <el-form-item label="计数位数">
                <el-input-number
                  v-model="activeSerialSeg.digits"
                  :min="1"
                  :max="12"
                  :precision="0"
                  :controls="false"
                />
              </el-form-item>
              <el-form-item label="是否重置">
                <el-switch v-model="activeSerialSeg.reset" @change="onSerialResetChange" />
              </el-form-item>
              <el-form-item v-if="activeSerialSeg.reset" label="重置周期">
                <el-select v-model="activeSerialSeg.resetPeriod">
                  <el-option
                    v-for="item in SERIAL_RESET_PERIODS"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                  />
                </el-select>
              </el-form-item>
            </template>
            <el-form-item v-if="activeSerialSeg.kind === 'field'" label="引用字段">
              <el-select v-model="activeSerialSeg.fieldKey" clearable placeholder="请选择单行文本或数字">
                <el-option
                  v-for="item in serialRefOptions"
                  :key="item.key"
                  :label="item.title || item.key"
                  :value="item.key"
                />
              </el-select>
            </el-form-item>
          </el-form>
          <template #footer>
            <el-button type="primary" @click="closeSerialSegDialog">确定</el-button>
          </template>
        </el-dialog>
      </template>
      <el-form-item v-if="field.type !== 'divider' && field.type !== 'subform' && field.type !== 'relate-subform' && !parentSubform" label="字段宽度">
        <el-radio-group class="width-options" :model-value="field.width" @change="onWidthChange">
          <el-radio-button value="1/4">1/4</el-radio-button>
          <el-radio-button value="1/3">1/3</el-radio-button>
          <el-radio-button value="1/2">1/2</el-radio-button>
          <el-radio-button value="2/3">2/3</el-radio-button>
          <el-radio-button value="3/4">3/4</el-radio-button>
          <el-radio-button value="1">整行</el-radio-button>
        </el-radio-group>
      </el-form-item>
      </template>
      <div v-else class="pane-list" :class="{ 'is-reordering': isPaneReordering }">
        <div class="pane-list-title">标签页（最多 {{ MAX_TAB_PANES }} 个，最少 {{ MIN_TAB_PANES }} 个）</div>
        <div
          v-for="pane in field.panes"
          :key="pane.id"
          class="pane-row"
          :class="paneRowClass(pane)"
          @dragover="onPaneDragOver(pane, $event)"
          @drop="onPaneDrop(pane, $event)"
        >
          <span
            class="pane-handle"
            draggable="true"
            @dragstart="onPaneDragStart(pane, $event)"
            @dragend="onPaneDragEnd"
          >
            <el-icon><Rank /></el-icon>
          </span>
          <el-input
            v-model="pane.title"
            maxlength="32"
            @focus="onPaneTitleFocus(pane)"
            @blur="onPaneTitleBlur(pane)"
          />
          <el-button
            type="danger"
            link
            :icon="Delete"
            :disabled="!canRemovePane(field.panes)"
            @click="onRemovePane(pane)"
          />
        </div>
        <el-button
          :icon="Plus"
          :disabled="!canAddPane(field.panes)"
          @click="onAddPane"
          type="primary"
        >
          添加标签页
        </el-button>
      </div>

    </el-form>
  </el-aside>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { CircleClose, Close, Delete, Plus, Rank } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { formatOptions, formColumnOptions, fieldTypes, fieldTypeLabel, isSelectType } from './fieldTypes'
import {
  MIN_TAB_PANES,
  MAX_TAB_PANES,
  canAddPane,
  canRemovePane,
  flattenFields,
  nextPaneTitle,
  reorderPanes,
  trimPaneTitle,
} from './tabsField.js'
import FormFieldSourcePicker from './FormFieldSourcePicker.vue'
import FormSourcePicker from './FormSourcePicker.vue'
import FormOptionFilterDialog from './FormOptionFilterDialog.vue'
import DataSelectDisplayFieldsDialog from './DataSelectDisplayFieldsDialog.vue'
import DataSelectFillMappingDialog from './DataSelectFillMappingDialog.vue'
import DataSelectProcessDrawer from './DataSelectProcessDrawer.vue'
import DataLinkageDialog from './DataLinkageDialog.vue'
import FormulaEditorDialog from './FormulaEditorDialog.vue'
import {
  clearFormulaExclusiveFlags,
  formulaDisplaySummary,
  isFormulaCapable,
  isFormulaField,
} from './formulaField.js'
import SubformLinkageDialog from './SubformLinkageDialog.vue'
import { hasOptionFilters } from './optionFilters'
import {
  hasLinkage,
  hasLinkageSource,
  hasSubformLinkage,
  optionSourceChoices,
} from './linkage'
import {
  cloneDisplayFieldKeys,
  findDisplaySourceField,
  hasDisplayFieldKeys,
  hasFillMappings,
  withSystemDisplayFields,
} from './dataSelect'
import { hasSelfRelateField, isRelateField } from './relateField.js'
import { isRelateSubformField, relateSubformDisplayColumnOptions } from './relateSubform.js'
import { isFillable } from '../form-fill/fillValues'
import { SUBFORM_CHILD_TYPES, fieldRefLabel } from '../form-fill/subformField.js'
import {
  SERIAL_DATETIME_OPTIONS,
  SERIAL_RESET_PERIODS,
  canAddSerialCounter,
  newSerialSegment,
  reorderSerialRule,
  serialRefFields,
  serialSegmentSummary,
} from './serialField.js'
import {
  deptFieldsForMemberScope,
  hasCustomMemberScope,
  isMemberField,
  memberDisplayName,
  positiveIntIds,
} from './memberField.js'
import {
  flattenDeptNames,
  hasCustomDeptScope,
  isDeptField,
} from './deptField.js'
import { IMAGE_FORMAT_OPTIONS } from '../form-fill/imageField'
import { FILE_FORMAT_OPTIONS } from '../form-fill/fileField'
import { ADDRESS_FORMAT_OPTIONS } from '../form-fill/addressField'
import { listDictionaryOptionsApi, listFormFieldsApi } from '../../api/apps'
import { listOrgDepartmentsApi, listOrgRolesApi, listOrgUsersApi } from '../../api/org'
import { PAGE_SIZES } from '../../utils/pagination.js'

const props = defineProps({
  tab: { type: String, required: true },
  field: { type: Object, default: null },
  fields: { type: Array, default: () => [] },
  appId: { type: Number, required: true },
  formId: { type: Number, required: true },
  columns: { type: Number, default: 1 },
  parentSubform: { type: Object, default: null },
  workflowForm: { type: Boolean, default: false },
})

const emit = defineEmits([
  'update:tab',
  'update:width',
  'update:columns',
  'select-child',
  'add-child',
  'copy-child',
  'remove-child',
  'move-child',
])

function onWidthChange(value) {
  emit('update:width', value)
}

let paneTitleBeforeEdit = ''
const draggingPaneId = ref('')
const dragOverPaneId = ref('')
const draggingSerialId = ref('')
const dragOverSerialId = ref('')
const isPaneReordering = computed(() => Boolean(draggingPaneId.value))
const isSerialReordering = computed(() => Boolean(draggingSerialId.value))
const activeSerialSegId = ref('')
const serialSegDialogVisible = ref(false)

const SERIAL_SEG_DIALOG_TITLES = {
  fixed: '固定字符',
  datetime: '日期时间',
  counter: '自动计数',
  field: '表单字段',
}

function onPaneTitleFocus(pane) {
  paneTitleBeforeEdit = pane.title || ''
}

function onPaneTitleBlur(pane) {
  pane.title = trimPaneTitle(pane.title, paneTitleBeforeEdit)
}

function onAddPane() {
  if (!props.field || !canAddPane(props.field.panes)) return
  props.field.panes.push({
    id: crypto.randomUUID(),
    title: nextPaneTitle(props.field.panes),
    fields: [],
  })
}

async function onRemovePane(pane) {
  if (!canRemovePane(props.field.panes)) return
  try {
    await ElMessageBox.confirm(
      `确定删除「${pane.title || '未命名'}」？该标签页及其内部字段将一并删除。`,
      '删除标签页',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  props.field.panes = props.field.panes.filter((item) => item.id !== pane.id)
}

function paneRowClass(pane) {
  return {
    'is-dragging': draggingPaneId.value === pane.id,
    'is-drop-target': dragOverPaneId.value === pane.id && draggingPaneId.value !== pane.id,
  }
}

function clearPaneDrag() {
  draggingPaneId.value = ''
  dragOverPaneId.value = ''
}

function onPaneDragStart(pane, event) {
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', pane.id)
  // 下一帧再加样式，避免浏览器抓到的拖拽影子也变成半透明
  requestAnimationFrame(() => {
    draggingPaneId.value = pane.id
  })
}

function onPaneDragOver(pane, event) {
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
  dragOverPaneId.value = pane.id === draggingPaneId.value ? '' : pane.id
}

function onPaneDrop(pane, event) {
  event.preventDefault()
  const fromId = draggingPaneId.value || event.dataTransfer.getData('text/plain')
  reorderPanes(props.field.panes, fromId, pane.id)
  clearPaneDrag()
}

function onPaneDragEnd() {
  clearPaneDrag()
}

function onSerialSeparatorInput(value) {
  if (!props.field) return
  props.field.serialSeparator = value
}

function openSerialSegDialog(seg) {
  activeSerialSegId.value = seg.id
  serialSegDialogVisible.value = true
}

function closeSerialSegDialog() {
  serialSegDialogVisible.value = false
}

function onSerialSegDialogClosed() {
  activeSerialSegId.value = ''
}

function onSelectSerialSeg(seg) {
  openSerialSegDialog(seg)
}

function onAddSerialSeg(kind) {
  if (!props.field) return
  if (kind === 'counter' && !canAddSerialCounter(props.field.serialRule)) return
  if (!Array.isArray(props.field.serialRule)) {
    props.field.serialRule = []
  }
  const seg = newSerialSegment(kind)
  props.field.serialRule.push(seg)
  openSerialSegDialog(seg)
}

function onRemoveSerialSeg(seg) {
  if (!props.field?.serialRule) return
  props.field.serialRule = props.field.serialRule.filter((item) => item.id !== seg.id)
  if (activeSerialSegId.value === seg.id) {
    serialSegDialogVisible.value = false
    activeSerialSegId.value = ''
  }
}

function serialRowClass(seg) {
  return {
    'is-dragging': draggingSerialId.value === seg.id,
    'is-drop-target': dragOverSerialId.value === seg.id && draggingSerialId.value !== seg.id,
  }
}

function clearSerialDrag() {
  draggingSerialId.value = ''
  dragOverSerialId.value = ''
}

function onSerialDragStart(seg, event) {
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', seg.id)
  // 下一帧再加样式，避免浏览器抓到的拖拽影子也变成半透明
  requestAnimationFrame(() => {
    draggingSerialId.value = seg.id
  })
}

function onSerialDragOver(seg, event) {
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
  dragOverSerialId.value = seg.id === draggingSerialId.value ? '' : seg.id
}

function onSerialDrop(seg, event) {
  event.preventDefault()
  const fromId = draggingSerialId.value || event.dataTransfer.getData('text/plain')
  reorderSerialRule(props.field.serialRule, fromId, seg.id)
  clearSerialDrag()
}

function onSerialDragEnd() {
  clearSerialDrag()
}

function onSerialFixedKeydown(event) {
  if (event.key === 'Enter') {
    event.preventDefault()
  }
}

function onSerialResetChange(value) {
  if (!activeSerialSeg.value) return
  if (value && !activeSerialSeg.value.resetPeriod) {
    activeSerialSeg.value.resetPeriod = 'day'
  }
}

function isSerialFieldSegInvalid(seg) {
  if (seg?.kind !== 'field' || !seg.fieldKey) return false
  return !serialRefOptions.value.some((item) => item.key === seg.fieldKey)
}

function onEditableChange(value) {
  if (!props.field) {
    return
  }
  props.field.editable = value
}

function onVisibleChange(value) {
  if (!props.field) {
    return
  }
  props.field.visible = value
}

const dictionaries = ref([])
const sourceFields = ref([])
const filterVisible = ref(false)
const linkageVisible = ref(false)
const displayVisible = ref(false)
const mappingVisible = ref(false)
const processVisible = ref(false)
const subformLinkageVisible = ref(false)

const formFields = computed(() => {
  if (props.parentSubform) {
    const parentTitle = props.parentSubform.title || '子表单'
    return (props.parentSubform.fields || [])
      .filter((item) => isFillable(item) && item.key !== props.field?.key)
      .map((item) => ({
        ...item,
        title: fieldRefLabel(item, { parentTitle }),
      }))
  }
  return flattenFields(props.fields || []).filter(
    (item) => isFillable(item) && item.key !== props.field?.key,
  )
})

const optionFilterFields = computed(() =>
  flattenFields(props.fields || []).filter(
    (item) =>
      isFillable(item) &&
      item.type !== 'subform' &&
      item.key !== props.field?.key,
  ),
)

const currentFields = computed(() =>
  flattenFields(props.fields || []).filter(isFillable),
)

const conditionFields = computed(() => {
  const mains = flattenFields(props.fields || [])
    .filter((item) => item.type !== 'subform' && item.key !== props.field?.key)
    .map((item) => ({
      ...item,
      title: fieldRefLabel(item),
    }))
  if (!props.parentSubform) {
    return mains
  }
  const siblings = (props.parentSubform.fields || [])
    .filter((item) => item.key !== props.field?.key)
    .map((item) => ({
      ...item,
      title: fieldRefLabel(item, {
        parentTitle: props.parentSubform.title || '子表单',
      }),
    }))
  return [...mains, ...siblings]
})

const isSubformChild = computed(() => Boolean(props.parentSubform))

const showUniqueSwitch = computed(
  () =>
    props.field?.type === 'input' ||
    props.field?.type === 'number' ||
    (isSubformChild.value && props.field?.type === 'data'),
)

const showUniqueInRowsSwitch = computed(
  () =>
    isSubformChild.value &&
    (props.field?.type === 'input' ||
      props.field?.type === 'number' ||
      props.field?.type === 'data'),
)

const showDefaultRowCount = computed(
  () =>
    props.field?.type === 'subform' && !hasSubformLinkage(props.field),
)

const mainLabeledFields = computed(() =>
  flattenFields(props.fields || [])
    .filter((item) => item.type !== 'subform')
    .map((item) => ({
      ...item,
      title: fieldRefLabel(item),
    })),
)

const childTypeOptions = computed(() =>
  fieldTypes.filter((item) => SUBFORM_CHILD_TYPES.includes(item.type)),
)

function onUniqueChange(value) {
  if (!props.field) {
    return
  }
  props.field.unique = value
  if (value) {
    props.field.uniqueInRows = true
  }
}

function onUniqueInRowsChange(value) {
  if (!props.field || props.field.unique) {
    return
  }
  props.field.uniqueInRows = value
}

function onSubformSourceChange(value) {
  if (!props.field) {
    return
  }
  if (value !== 'linkage') {
    delete props.field.linkage
  }
}

function onSelectChild(child) {
  emit('select-child', child)
}

function onAddChildType(type) {
  const item = fieldTypes.find((entry) => entry.type === type)
  if (!item || !props.field) {
    return
  }
  emit('add-child', props.field.key, item)
}

function onCopyChild(child) {
  emit('copy-child', child)
}

function onRemoveChild(child) {
  emit('remove-child', child)
}

function onMoveChild(child, direction) {
  emit('move-child', child.key, direction)
}

const fieldTypeText = computed(() => fieldTypeLabel(props.field?.type))
const optionSourceLabel = computed(() =>
  isSelectType(props.field?.type) ? '选项来源' : '取值来源',
)
const isCurrentDisplayField = computed(
  () =>
    props.field?.type === 'currentUser' ||
    props.field?.type === 'currentUserDept',
)

const isSerialField = computed(() => props.field?.type === 'serialNumber')
const isRelateSubform = computed(() => isRelateSubformField(props.field))

const canEditFormula = computed(() => isFormulaCapable(props.field?.type))
const hasFieldFormula = computed(() => isFormulaField(props.field))
const formulaSummaryText = computed(() =>
  formulaDisplaySummary(props.field, props.fields),
)
const formulaDialogVisible = ref(false)

function onFormulaSaved({ expr, refs }) {
  if (!props.field) return
  props.field.formula = { expr, refs }
  clearFormulaExclusiveFlags(props.field)
  formulaDialogVisible.value = false
}

function onClearFormula() {
  if (!props.field) return
  delete props.field.formula
}

const relateSubformForms = ref([])

const relateSubformLabel = computed(() => {
  const field = props.field
  if (!relateSubformForms.value.length) return ''
  const form = relateSubformForms.value.find(
    (item) => Number(item.id) === Number(field?.childFormId),
  )
  if (!form) return '关联表单已删除'
  const relate = (form.fields || []).find(
    (item) => item.key === field.childRelateKey,
  )
  if (!relate) return `${form.name} · 关联字段已删除`
  return `${form.name} · ${relate.title || relate.key}`
})

const relateSubformColumnOptions = computed(() => {
  const form = relateSubformForms.value.find(
    (item) => Number(item.id) === Number(props.field?.childFormId),
  )
  return relateSubformDisplayColumnOptions(form?.fields)
})

async function loadRelateSubformForms() {
  if (!props.appId || !isRelateSubform.value) {
    relateSubformForms.value = []
    return
  }
  try {
    relateSubformForms.value =
      (await listFormFieldsApi(props.appId, { include: 'relate' })) || []
  } catch {
    relateSubformForms.value = []
  }
}

function onRelateSubformColumnsChange(value) {
  if (!props.field) return
  props.field.columnKeys = Array.isArray(value) ? [...value] : []
}

const isMemberFieldType = computed(() => isMemberField(props.field))
const isDeptFieldType = computed(() => isDeptField(props.field))
const hasCustomDeptScopeValue = computed(() => hasCustomDeptScope(props.field))
const deptScopeVisible = ref(false)
const deptScopeTreeRef = ref(null)
const deptScopeDepartments = ref([])
const deptScopeIds = ref([])
const deptScopeNameById = ref({})
const hasCustomScope = computed(() => hasCustomMemberScope(props.field))
const deptFieldOptions = computed(() =>
  deptFieldsForMemberScope(props.fields, props.field?.key).filter(
    (item) => item.key !== props.field?.key,
  ),
)
const memberScopeVisible = ref(false)
const memberScopeTab = ref('dept')
const scopeDeptTreeRef = ref(null)
const orgDepartments = ref([])
const orgRoles = ref([])
const orgUsers = ref([])
const scopeDeptIds = ref([])
const scopeRoleIds = ref([])
const scopeUserIds = ref([])
const scopeUserKeyword = ref('')
const scopeUserPage = ref(1)
const scopeUserPageSize = ref(20)
const scopeUserTotal = ref(0)
const scopeUserNameById = ref({})

const hasScopePicked = computed(
  () =>
    scopeDeptIds.value.length +
      scopeRoleIds.value.length +
      scopeUserIds.value.length >
    0,
)

const scopeDeptNameById = computed(() => {
  const map = {}
  const walk = (nodes) => {
    for (const node of nodes || []) {
      map[node.id] = node.name
      walk(node.children)
    }
  }
  walk(orgDepartments.value)
  return map
})

const scopeRoleNameById = computed(() => {
  const map = {}
  for (const role of orgRoles.value) {
    map[role.id] = role.name
  }
  return map
})

function scopeDeptName(id) {
  return scopeDeptNameById.value[id] || `部门#${id}`
}

function scopeRoleName(id) {
  return scopeRoleNameById.value[id] || `角色#${id}`
}

function scopeUserName(id) {
  return memberDisplayName(id, scopeUserNameById.value)
}

function rememberUserNames(users) {
  const next = { ...scopeUserNameById.value }
  for (const user of users || []) {
    if (!user?.id) continue
    next[user.id] = user.displayName
  }
  scopeUserNameById.value = next
}

async function loadScopeUsers() {
  const keyword = scopeUserKeyword.value.trim()
  const data = await listOrgUsersApi({
    keyword: keyword || undefined,
    page: scopeUserPage.value,
    pageSize: scopeUserPageSize.value,
  })
  orgUsers.value = data?.items || []
  scopeUserTotal.value = data?.total || 0
  rememberUserNames(orgUsers.value)
}

async function loadSelectedUserNames(ids) {
  if (!ids.length) return
  const rows = await listOrgUsersApi({ ids: ids.join(',') })
  rememberUserNames(Array.isArray(rows) ? rows : rows?.items || [])
}

function onScopeUserKeywordChange() {
  scopeUserPage.value = 1
  loadScopeUsers()
}

function onScopeUserPageChange(page) {
  scopeUserPage.value = page
  loadScopeUsers()
}

function onScopeUserPageSizeChange(size) {
  scopeUserPageSize.value = size
  scopeUserPage.value = 1
  loadScopeUsers()
}

function onRemoveScopeDept(id) {
  scopeDeptIds.value = scopeDeptIds.value.filter((item) => item !== id)
  nextTick(applyScopeDeptChecked)
}

function onRemoveScopeRole(id) {
  scopeRoleIds.value = scopeRoleIds.value.filter((item) => item !== id)
}

function onRemoveScopeUser(id) {
  scopeUserIds.value = scopeUserIds.value.filter((item) => item !== id)
}

function onMemberScopeChange(value) {
  if (!props.field) return
  props.field.memberScope = value
}

function onDeptScopeChange(value) {
  if (!props.field) return
  props.field.deptScope = value
}

function deptScopeName(id) {
  return deptScopeNameById.value[id] || deptScopeNameById.value[String(id)] || String(id)
}

function openDeptScopeDialog() {
  deptScopeVisible.value = true
}

function closeDeptScopeDialog() {
  deptScopeVisible.value = false
}

function syncDeptScopeIds() {
  deptScopeIds.value = deptScopeTreeRef.value?.getCheckedKeys(false) || deptScopeIds.value
}

function applyDeptScopeChecked() {
  deptScopeTreeRef.value?.setCheckedKeys(deptScopeIds.value)
}

async function onDeptScopeDialogOpen() {
  const cfg = props.field?.deptScopeConfig || {}
  deptScopeIds.value = positiveIntIds(cfg.departmentIds)
  const depts = (await listOrgDepartmentsApi()) || []
  deptScopeDepartments.value = depts
  deptScopeNameById.value = flattenDeptNames(depts)
  await nextTick()
  applyDeptScopeChecked()
}

function onRemoveDeptScopeId(id) {
  deptScopeIds.value = deptScopeIds.value.filter((item) => item !== id)
  applyDeptScopeChecked()
}

function confirmDeptScope() {
  if (!props.field) return
  syncDeptScopeIds()
  props.field.deptScopeConfig = {
    departmentIds: [...deptScopeIds.value],
  }
  closeDeptScopeDialog()
}

async function confirmClearDeptScope() {
  try {
    await ElMessageBox.confirm('确定清除已设置的可选范围？', '清除', {
      confirmButtonText: '清除',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  if (!props.field) return
  props.field.deptScopeConfig = { departmentIds: [] }
}

function openMemberScopeDialog() {
  memberScopeVisible.value = true
}

function closeMemberScopeDialog() {
  memberScopeVisible.value = false
}

function syncScopeDeptIds() {
  scopeDeptIds.value = scopeDeptTreeRef.value?.getCheckedKeys(false) || scopeDeptIds.value
}

function applyScopeDeptChecked() {
  scopeDeptTreeRef.value?.setCheckedKeys(scopeDeptIds.value)
}

function onMemberScopeTabChange(name) {
  if (name !== 'dept') return
  nextTick(applyScopeDeptChecked)
}

async function onMemberScopeDialogOpen() {
  memberScopeTab.value = 'dept'
  const cfg = props.field?.memberScopeConfig || {}
  scopeDeptIds.value = positiveIntIds(cfg.departmentIds)
  scopeRoleIds.value = positiveIntIds(cfg.roleIds)
  scopeUserIds.value = positiveIntIds(cfg.userIds)
  scopeUserKeyword.value = ''
  scopeUserPage.value = 1
  scopeUserNameById.value = {}
  const [depts, roleRows] = await Promise.all([
    listOrgDepartmentsApi(),
    listOrgRolesApi(),
    loadScopeUsers(),
    loadSelectedUserNames(scopeUserIds.value),
  ])
  orgDepartments.value = depts || []
  orgRoles.value = roleRows || []
  await nextTick()
  applyScopeDeptChecked()
}

function confirmMemberScope() {
  if (!props.field) return
  if (memberScopeTab.value === 'dept') {
    syncScopeDeptIds()
  }
  props.field.memberScopeConfig = {
    departmentIds: [...scopeDeptIds.value],
    roleIds: [...scopeRoleIds.value],
    userIds: [...scopeUserIds.value],
  }
  closeMemberScopeDialog()
}

async function confirmClearMemberScope() {
  try {
    await ElMessageBox.confirm('确定清除已设置的可选范围？', '清除', {
      confirmButtonText: '清除',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  if (!props.field) return
  props.field.memberScopeConfig = {
    departmentIds: [],
    roleIds: [],
    userIds: [],
  }
}

const serialRefOptions = computed(() =>
  serialRefFields(props.fields, props.field?.key),
)

const activeSerialSeg = computed(
  () =>
    (props.field?.serialRule || []).find(
      (item) => item.id === activeSerialSegId.value,
    ) || null,
)

const serialSegDialogTitle = computed(
  () => SERIAL_SEG_DIALOG_TITLES[activeSerialSeg.value?.kind] || '规则段',
)

const relateTitleOptions = computed(() =>
  withSystemDisplayFields(sourceFields.value.filter(isFillable)),
)

const hasDisplayFields = computed(() =>
  hasDisplayFieldKeys(props.field?.displayFieldKeys),
)

const displayFieldsTriggerText = computed(() => {
  if (!hasDisplayFields.value) {
    return '请选择显示字段'
  }
  return `已选择 ${cloneDisplayFieldKeys(props.field.displayFieldKeys).length} 个字段`
})

const hasProcessSetup = computed(() => {
  if (!props.field) return false
  return (
    cloneDisplayFieldKeys(props.field.pickerColumnKeys).length > 0 ||
    hasOptionFilters(props.field.optionFilters)
  )
})

const processTriggerText = computed(() => {
  if (!hasProcessSetup.value) {
    return '选择过程设置'
  }
  const parts = []
  const colCount = cloneDisplayFieldKeys(props.field.pickerColumnKeys).length
  if (colCount) parts.push(`${colCount} 列`)
  if (hasOptionFilters(props.field.optionFilters)) {
    parts.push('已添加过滤条件')
  }
  return parts.join('，')
})

function openDisplayFields() {
  displayVisible.value = true
  console.log('open field config', props.field);
  
}

function openFillMapping() {
  mappingVisible.value = true
}

function openProcess() {
  processVisible.value = true
}

function openOptionFilters() {
  filterVisible.value = true
}

async function confirmClearOptionFilters() {
  if (!props.field) return
  try {
    await ElMessageBox.confirm('是否要清空已配置的过滤条件？', '清空', {
      confirmButtonText: '清空',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  delete props.field.optionFilters
}

function openLinkage() {
  linkageVisible.value = true
}

function openSubformLinkage() {
  subformLinkageVisible.value = true
}

async function confirmClearLinkage() {
  if (!props.field) return
  try {
    await ElMessageBox.confirm('确定删除数据联动？', '删除', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  delete props.field.linkage
}

function onLinkageConfirm(next) {
  if (!props.field) return
  props.field.linkage = next
}

async function loadOptions() {
  if (!props.appId) {
    dictionaries.value = []
    return
  }
  try {
    dictionaries.value = (await listDictionaryOptionsApi(props.appId)) || []
  } catch {
    dictionaries.value = []
  }
}

function onOptionSourceChange(value) {
  if (!props.field) {
    return
  }
  if (value !== 'dictionary') {
    delete props.field.dictCode
  } else if (props.field.dictCode == null) {
    props.field.dictCode = ''
  }
  if (value !== 'table_data') {
    delete props.field.sourceFormId
    delete props.field.sourceFieldKey
    delete props.field.optionFilters
  }
  if (value !== 'linkage') {
    delete props.field.linkage
  }
}

function onSourceFieldSelect({ formId, fieldKey }) {
  if (!props.field) {
    return
  }
  if (props.field.sourceFormId !== formId) {
    delete props.field.optionFilters
  }
  props.field.sourceFormId = formId
  props.field.sourceFieldKey = fieldKey
}

function onFilterConfirm(next) {
  if (!props.field) {
    return
  }
  if (next) {
    props.field.optionFilters = next
  } else {
    delete props.field.optionFilters
  }
}

function onSourceFormSelect({ formId }) {
  if (!props.field) {
    return
  }
  if (props.field.sourceFormId !== formId) {
    props.field.displayFieldKeys = []
    props.field.fillMappings = []
    props.field.pickerColumnKeys = []
    delete props.field.displayFieldLabels
    delete props.field.optionFilters
  }
  props.field.sourceFormId = formId
}

function onRelateSourceSelect({ formId }) {
  if (!props.field) {
    return
  }
  if (
    Number(formId) === Number(props.formId) &&
    hasSelfRelateField(props.fields, props.formId, props.field.key)
  ) {
    ElMessage.warning('已有关联本表字段')
    return
  }
  if (props.field.sourceFormId !== formId) {
    props.field.titleKey = ''
    props.field.displayFieldKeys = []
    props.field.fillMappings = []
    props.field.pickerColumnKeys = []
    delete props.field.displayFieldLabels
    delete props.field.optionFilters
  }
  props.field.sourceFormId = formId
  loadSourceFields()
}

function onRelateTitleKeyChange(value) {
  if (!props.field) {
    return
  }
  props.field.titleKey = value || ''
}

function onDisplayConfirm(next) {
  if (!props.field) {
    return
  }
  props.field.displayFieldKeys = next
  const labels = {}
  for (const key of next) {
    const item = findDisplaySourceField(sourceFields.value, key)
    labels[key] = item?.title || key
  }
  if (next.length) {
    props.field.displayFieldLabels = labels
  } else {
    delete props.field.displayFieldLabels
  }
}

function onMappingConfirm(next) {
  if (!props.field) {
    return
  }
  if (next.length) {
    props.field.fillMappings = next
  } else {
    delete props.field.fillMappings
  }
}

function onProcessConfirm({ pickerColumnKeys, optionFilters }) {
  if (!props.field) {
    return
  }
  props.field.pickerColumnKeys = pickerColumnKeys
  if (optionFilters) {
    props.field.optionFilters = optionFilters
  } else {
    delete props.field.optionFilters
  }
}

async function loadSourceFields() {
  const field = props.field
  if (!props.appId || !field?.sourceFormId) {
    sourceFields.value = []
    return
  }
  if (isRelateField(field) && Number(field.sourceFormId) === Number(props.formId)) {
    sourceFields.value = flattenFields(props.fields).filter(isFillable)
    return
  }
  try {
    const params = isRelateField(field) ? {} : { excludeFormId: props.formId }
    const forms = (await listFormFieldsApi(props.appId, params)) || []
    const form = forms.find(
      (item) => Number(item.id) === Number(field.sourceFormId),
    )
    sourceFields.value = form?.fields || []
  } catch {
    sourceFields.value = []
  }
}

watch(() => props.appId, loadOptions, { immediate: true })
watch(
  () => [props.field?.key, props.field?.type],
  () => {
    if (!props.field || props.field.type !== 'serialNumber') {
      serialSegDialogVisible.value = false
      activeSerialSegId.value = ''
      return
    }
    if (!Array.isArray(props.field.serialRule)) {
      props.field.serialRule = []
    }
    if (props.field.serialSeparator == null) {
      props.field.serialSeparator = '-'
    }
    const ids = props.field.serialRule.map((item) => item.id)
    if (!ids.includes(activeSerialSegId.value)) {
      serialSegDialogVisible.value = false
      activeSerialSegId.value = ''
    }
  },
  { immediate: true },
)
watch(
  () => [props.appId, props.formId, props.field?.sourceFormId],
  loadSourceFields,
  { immediate: true },
)
watch(
  () => [props.appId, props.field?.key, props.field?.type],
  () => {
    loadRelateSubformForms()
  },
  { immediate: true },
)
watch(
  () => props.field?.key,
  () => {
    filterVisible.value = false
    linkageVisible.value = false
    displayVisible.value = false
    mappingVisible.value = false
    processVisible.value = false
    serialSegDialogVisible.value = false
    activeSerialSegId.value = ''
  },
)
</script>

<style scoped lang="less">
.relate-title-select {
  width: 100%;
}

.relate-title-hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 20px;
}

.relate-subform-select {
  width: 100%;
}

.relate-subform-label {
  color: var(--el-text-color-regular);
  font-size: 13px;
  line-height: 32px;
}

.props {
  padding: 16px;
  background: var(--el-bg-color);
  overflow: auto;
  border-left: 1px solid var(--el-border-color);
}

.props-tabs {
  display: flex;
  gap: 24px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--el-border-color);
}

.props-tab {
  padding: 8px 0;
  font-weight: 600;
  cursor: pointer;
  color: var(--el-text-color-regular);
  border-bottom: 2px solid transparent;
}

.props-tab.is-active {
  color: var(--el-color-primary);
  border-bottom-color: var(--el-color-primary);
}

.width-options {
  display: flex;
  flex-wrap: nowrap;
  width: 100%;
}

.width-options :deep(.el-radio-button) {
  flex: 1 1 0;
}

.width-options :deep(.el-radio-button__inner) {
  width: 100%;
  padding: 8px 0;
  font-size: 12px;
}

.required-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.required-row+.required-row {
  margin-top: 12px;
}

.formula-row {
  display: flex;
  align-items: center;
  width: 100%;
}

.formula-summary {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--el-text-color-regular);
}

.max-length-input {
  width: 96px;
}

.image-format-select {
  flex: 1;
  min-width: 0;
}

.address-format-select {
  flex: 1;
  min-width: 0;
}

.range-inputs {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
}

.filter-trigger {
  display: flex;
  align-items: center;
  width: 100%;
  height: 32px;
  padding: 0 12px;
  box-sizing: border-box;
  cursor: pointer;
  font-size: 14px;
  line-height: 32px;
  color: var(--el-text-color-regular);
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
}

.filter-trigger:hover {
  border-color: var(--el-border-color-hover);
}

.filter-trigger.is-placeholder {
  color: var(--el-text-color-placeholder);
}

.linkage-row {
  display: flex;
  align-items: center;
  width: 100%;
}

.linkage-row .filter-trigger {
  flex: 1;
  min-width: 0;
}

.linkage-clear {
  margin-left: 8px;
  color: var(--el-text-color-placeholder);
  cursor: pointer;
}

.linkage-clear:hover {
  color: var(--el-text-color-regular);
}

.field-type-row {
  display: flex;
  align-items: center;
  margin-bottom: 18px;
}

.field-type-label {
  flex-shrink: 0;
  margin-right: 12px;
  font-size: 14px;
  color: var(--el-text-color-regular);
}

.subform-children {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.subform-child-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 0;
  cursor: pointer;
}

.subform-child-title {
  min-width: 0;
  margin-right: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.subform-child-actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;

  :deep(.el-button + .el-button) {
    margin-left: 4px;
  }
}

.field-type-text {
  padding: 0 8px;
  font-size: 13px;
  line-height: 22px;
  color: var(--el-text-color-regular);
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  flex: 1;
  font-weight: bold;
}

.pane-list {
  display: flex;
  flex-direction: column;
}

.pane-list-title {
  margin-bottom: 8px;
  font-size: 14px;
  color: var(--el-text-color-regular);
}

.pane-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.pane-list.is-reordering .pane-row:not(.is-dragging):not(.is-drop-target) {
  opacity: 0.55;
}

.pane-row.is-dragging {
  opacity: 0.45;
}

.pane-row.is-dragging .pane-handle {
  color: var(--el-color-primary);
  cursor: grabbing;
}

.pane-row.is-drop-target {
  outline: 1px dashed var(--el-color-primary);
}

.pane-handle {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  color: var(--el-text-color-placeholder);
  cursor: grab;
}

.pane-handle:active {
  cursor: grabbing;
}

.pane-row .el-input {
  flex: 1;
  min-width: 0;
}

.serial-rule-list {
  display: flex;
  flex-direction: column;
  margin-bottom: 16px;
}

.serial-rule-row {
  position: relative;
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}

.serial-rule-list.is-reordering .serial-rule-row:not(.is-dragging):not(.is-drop-target) {
  opacity: 0.55;
}

.serial-rule-row.is-dragging {
  opacity: 0.45;
}

.serial-rule-row.is-dragging .serial-rule-handle {
  color: var(--el-color-primary);
  cursor: grabbing;
}

.serial-rule-row.is-drop-target {
  outline: 1px dashed var(--el-color-primary);
}

.serial-rule-handle {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  margin-right: 8px;
  color: var(--el-text-color-placeholder);
  cursor: grab;
}

.serial-rule-handle:active {
  cursor: grabbing;
}

.serial-rule-summary {
  flex: 1;
  min-width: 0;
  margin-right: 8px;
  padding: 6px 8px;
  text-align: left;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  background: var(--el-bg-color);
  cursor: pointer;
}

.serial-rule-summary.is-active {
  border-color: var(--el-color-primary);
}

.serial-rule-summary.is-invalid {
  color: var(--el-color-danger);
}

.serial-rule-add {
  display: flex;
}

.serial-rule-add :deep(.el-dropdown) {
  flex: 1;
  min-width: 0;
}

.serial-rule-add :deep(.el-button) {
  width: 100%;
}

.member-scope-dialog {
  display: flex;
  flex-direction: column;
  min-height: 360px;
}

.member-scope-picked {
  display: flex;
  flex-direction: column;
  max-height: 140px;
  margin-bottom: 8px;
  padding: 8px;
  overflow: auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
}

.member-scope-picked-row {
  display: flex;
  align-items: flex-start;
}

.member-scope-picked-row + .member-scope-picked-row {
  margin-top: 8px;
}

.member-scope-picked-label {
  flex: none;
  width: 40px;
  margin-top: 2px;
  color: var(--el-text-color-secondary);
}

.member-scope-picked-tags {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.member-scope-picked-tag {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 6px;
  background: var(--el-fill-color);
  border-radius: 4px;
}

.member-scope-picked-close {
  cursor: pointer;
}

.member-scope-tabs :deep(.el-tabs__header) {
  margin: 0 0 8px;
}

.member-scope-pane {
  min-height: 280px;
  max-height: 420px;
  overflow: auto;
}

.member-scope-users {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.member-scope-user-list {
  flex: 1;
  min-height: 180px;
  margin-top: 8px;
  overflow: auto;
}

.member-scope-pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}

.member-scope-pane :deep(.el-checkbox-group) {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

</style>
