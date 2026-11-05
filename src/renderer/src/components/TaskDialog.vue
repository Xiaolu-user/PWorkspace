<script setup lang="ts">
import { ref, reactive, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'
import type { Task, TaskInput } from '../../../shared/types'
import { isValidDate, localDate } from '../../../shared/date'
import { reminderTimestamp, reminderLabel } from '../../../shared/reminders'
import { useWorkspace } from '../stores/workspace'
const props = defineProps<{ modelValue: boolean; task?: Task | null; defaultDate?: string; defaultTitle?: string; defaultCategory?: 'normal' | 'daily' }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const workspace = useWorkspace(); const saving = ref(false)
const form = reactive<TaskInput>({ category: 'normal', title: '', description: '', status: 'todo', dueDate: null, priority: 'normal', dueTime: null, remindBefore: null })
const reminderOptions = [0, 5, 10, 15, 30, 60, 1440]
const reminderChoice = ref<number | 'custom' | 'off'>('off')
const reminderPreview = computed(() => { const time = reminderTimestamp(form); return time === null ? '' : new Date(time).toLocaleString('zh-CN', { hour12: false }) })
function setVisible(value: boolean): void { if (!saving.value) emit('update:modelValue', value) }
watch(() => props.modelValue, value => {
  if (!value) return
  Object.assign(form, props.task ? { category: props.task.category || 'normal', title: props.task.title, description: props.task.description, status: props.task.status, dueDate: props.task.dueDate, priority: props.task.priority, dueTime: props.task.dueTime, remindBefore: props.task.remindBefore } : { category: props.defaultCategory || 'normal', title: props.defaultTitle || '', description: '', status: 'todo', dueDate: props.defaultDate || null, priority: 'normal', dueTime: null, remindBefore: null })
  if (form.category === 'daily') form.dueDate = localDate()
  reminderChoice.value = form.remindBefore == null ? 'off' : reminderOptions.includes(form.remindBefore) ? form.remindBefore : 'custom'
})
watch(() => form.category, value => { if (value === 'daily') form.dueDate = localDate() })
watch(() => form.dueDate, value => { if (!value) { form.dueTime = null; reminderChoice.value = 'off'; form.remindBefore = null } })
watch(() => form.dueTime, value => { if (!value) { reminderChoice.value = 'off'; form.remindBefore = null } })
function changeReminder(value: number | 'custom' | 'off'): void { form.remindBefore = value === 'off' ? null : value === 'custom' ? 20 : value }
async function submit(): Promise<void> {
  if (saving.value) return
  if (!form.title.trim()) { ElMessage.warning('请填写任务标题'); return }
  if (form.dueDate && !isValidDate(form.dueDate)) { ElMessage.warning('请选择有效的截止日期'); return }
  if (reminderChoice.value !== 'off' && (form.remindBefore == null || !Number.isInteger(form.remindBefore) || form.remindBefore < 0 || form.remindBefore > 43200)) { ElMessage.warning('请填写 0 至 43200 的整数分钟数'); return }
  const reminder = reminderTimestamp(form)
  const scheduleChanged = !props.task || props.task.dueDate !== form.dueDate || props.task.dueTime !== form.dueTime || props.task.remindBefore !== form.remindBefore
  if (reminder !== null && (!Number.isFinite(reminder) || (scheduleChanged && reminder <= Date.now()))) { ElMessage.warning('提醒时间已过去，请调整事项时间或提前提醒的时长'); return }
  saving.value = true
  const input = { ...form, dueDate: form.dueDate || null }
  const ok = await workspace.mutate(() => props.task ? window.workbench.tasks.update(props.task.id, input) : window.workbench.tasks.create(input), props.task ? '任务已更新' : '已添加新任务')
  saving.value = false
  if (ok) emit('update:modelValue', false)
}
</script>
<template>
  <el-dialog :model-value="modelValue" :title="task ? '编辑任务' : '添加一件要做的事'" width="640px" class="task-editor-dialog" :close-on-click-modal="false" :close-on-press-escape="!saving" :show-close="!saving" @update:model-value="setVisible">
    <el-form label-position="top" :disabled="saving" @submit.prevent="submit">
      <el-form-item label="任务标题" required><el-input v-model="form.title" placeholder="接下来，想完成什么？" maxlength="200" autofocus @keydown.enter.prevent="submit" /></el-form-item>
      <el-form-item label="任务分类"><el-radio-group v-model="form.category"><el-radio-button value="normal">普通待办</el-radio-button><el-radio-button value="daily">每日必做</el-radio-button></el-radio-group><p v-if="form.category==='daily'" class="daily-task-hint">每天自动加入今日待办，未完成时置顶；次日恢复为未完成。</p></el-form-item>
      <el-form-item label="任务说明"><el-input v-model="form.description" type="textarea" :rows="3" maxlength="10000" placeholder="补充一些细节（选填）" /></el-form-item>
      <div class="form-columns"><el-form-item label="截止日期"><el-date-picker v-model="form.dueDate" :disabled="form.category==='daily'" type="date" value-format="YYYY-MM-DD" placeholder="不设置日期" style="width:100%" /></el-form-item><el-form-item label="优先级"><el-select v-model="form.priority"><el-option label="高优先级" value="high" /><el-option label="普通" value="normal" /><el-option label="低优先级" value="low" /></el-select></el-form-item></div>
      <div class="form-columns"><el-form-item label="事项时间"><el-time-picker v-model="form.dueTime" :disabled="!form.dueDate" format="HH:mm" value-format="HH:mm" placeholder="选择具体时间（选填）" style="width:100%" /></el-form-item><el-form-item label="提前提醒"><el-select v-model="reminderChoice" aria-label="提前提醒" :disabled="!form.dueDate || !form.dueTime" @change="changeReminder"><el-option label="不提醒" value="off" /><el-option v-for="minutes in reminderOptions" :key="minutes" :label="reminderLabel(minutes)" :value="minutes" /><el-option label="自定义提前时间" value="custom" /></el-select></el-form-item></div>
      <el-form-item v-if="reminderChoice === 'custom'" label="提前多少分钟"><el-input-number v-model="form.remindBefore" aria-label="提前分钟数" :min="0" :max="43200" :precision="0" /><span class="reminder-unit">分钟（最多 30 天）</span></el-form-item>
      <p v-if="reminderPreview" class="reminder-preview">将于 {{ reminderPreview }} 提醒</p>
      <p class="reminder-hint">先选择日期和事项时间即可设置提醒。应用运行或收起到托盘时可提醒；退出期间的提醒会在下次启动时补发。请允许工作台发送系统通知。</p>
      <el-form-item v-if="task" label="状态"><el-radio-group v-model="form.status"><el-radio-button value="todo">未完成</el-radio-button><el-radio-button value="done">已完成</el-radio-button></el-radio-group></el-form-item>
    </el-form>
    <template #footer><el-button :disabled="saving" @click="emit('update:modelValue', false)">取消</el-button><el-button type="primary" :loading="saving" @click="submit">{{ task ? '保存修改' : '添加任务' }}</el-button></template>
  </el-dialog>
</template>
