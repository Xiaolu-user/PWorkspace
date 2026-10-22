<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { Task, TaskInput } from '../../../shared/types'
import { isValidDate } from '../../../shared/date'
import { useWorkspace } from '../stores/workspace'
const props = defineProps<{ modelValue: boolean; task?: Task | null; defaultDate?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const workspace = useWorkspace(); const saving = ref(false)
const form = reactive<TaskInput>({ title: '', description: '', status: 'todo', dueDate: null, priority: 'normal' })
function setVisible(value: boolean): void { if (!saving.value) emit('update:modelValue', value) }
watch(() => props.modelValue, value => { if (value) Object.assign(form, props.task ? { title: props.task.title, description: props.task.description, status: props.task.status, dueDate: props.task.dueDate, priority: props.task.priority } : { title: '', description: '', status: 'todo', dueDate: props.defaultDate || null, priority: 'normal' }) })
async function submit(): Promise<void> {
  if (saving.value) return
  if (!form.title.trim()) { ElMessage.warning('请填写任务标题'); return }
  if (form.dueDate && !isValidDate(form.dueDate)) { ElMessage.warning('请选择有效的截止日期'); return }
  saving.value = true
  const input = { ...form, dueDate: form.dueDate || null }
  const ok = await workspace.mutate(() => props.task ? window.workbench.tasks.update(props.task.id, input) : window.workbench.tasks.create(input), props.task ? '任务已更新' : '已添加新任务')
  saving.value = false
  if (ok) emit('update:modelValue', false)
}
</script>
<template>
  <el-dialog :model-value="modelValue" :title="task ? '编辑任务' : '添加一件要做的事'" width="520px" :close-on-click-modal="false" :close-on-press-escape="!saving" :show-close="!saving" @update:model-value="setVisible">
    <el-form label-position="top" :disabled="saving" @submit.prevent="submit">
      <el-form-item label="任务标题" required><el-input v-model="form.title" placeholder="接下来，想完成什么？" maxlength="200" autofocus @keydown.enter.prevent="submit" /></el-form-item>
      <el-form-item label="任务说明"><el-input v-model="form.description" type="textarea" :rows="3" maxlength="10000" placeholder="补充一些细节（选填）" /></el-form-item>
      <div class="form-columns"><el-form-item label="截止日期"><el-date-picker v-model="form.dueDate" type="date" value-format="YYYY-MM-DD" placeholder="不设置日期" style="width:100%" /></el-form-item><el-form-item label="优先级"><el-select v-model="form.priority"><el-option label="高优先级" value="high" /><el-option label="普通" value="normal" /><el-option label="低优先级" value="low" /></el-select></el-form-item></div>
      <el-form-item v-if="task" label="状态"><el-radio-group v-model="form.status"><el-radio-button value="todo">未完成</el-radio-button><el-radio-button value="done">已完成</el-radio-button></el-radio-group></el-form-item>
    </el-form>
    <template #footer><el-button :disabled="saving" @click="emit('update:modelValue', false)">取消</el-button><el-button type="primary" :loading="saving" @click="submit">{{ task ? '保存修改' : '添加任务' }}</el-button></template>
  </el-dialog>
</template>
