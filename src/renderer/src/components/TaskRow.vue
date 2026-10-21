<script setup lang="ts">
import { ref } from 'vue'
import type { Task } from '../../../shared/types'
import { isOverdue } from '../../../shared/date'
import { useWorkspace } from '../stores/workspace'
import AppIcon from './AppIcon.vue'
const props = defineProps<{ task: Task; today: string; removable?: boolean }>()
defineEmits<{ edit: [task: Task]; remove: [task: Task] }>()
const workspace = useWorkspace(); const busy = ref(false)
async function toggle(): Promise<void> {
  if (busy.value) return
  busy.value = true
  await workspace.mutate(() => window.workbench.tasks.update(props.task.id, { title: props.task.title, description: props.task.description, dueDate: props.task.dueDate, priority: props.task.priority, status: props.task.status === 'done' ? 'todo' : 'done' }), props.task.status === 'done' ? '任务已重新打开' : '又完成了一件事')
  busy.value = false
}
</script>
<template>
  <div class="task-row" :class="{ completed: task.status === 'done' }">
    <button class="task-check" :class="{ checked: task.status === 'done' }" :disabled="busy" :aria-label="task.status === 'done' ? '标记为未完成' : '完成任务'" @click="toggle"><AppIcon v-if="task.status === 'done'" name="check" :size="13" /></button>
    <button class="task-content" @click="$emit('edit', task)"><span class="task-title">{{ task.title }}</span><span v-if="task.description" class="task-description">{{ task.description }}</span></button>
    <span class="priority" :class="task.priority"><span></span>{{ task.priority === 'high' ? '高优先级' : task.priority === 'low' ? '低优先级' : '普通' }}</span>
    <span v-if="task.dueDate" class="task-date" :class="{ overdue: isOverdue(task, today) }"><AppIcon name="calendar" :size="14" />{{ task.dueDate === today ? '今天' : task.dueDate.slice(5).replace('-', '/') }}</span>
    <button class="icon-button row-action" aria-label="编辑任务" @click="$emit('edit', task)"><AppIcon name="edit" :size="17" /></button>
    <button v-if="removable" class="icon-button row-action delete-button" aria-label="删除任务" @click="$emit('remove', task)"><AppIcon name="delete" :size="17" /></button>
  </div>
</template>
