<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Task } from '../../../shared/types'
import { isReminderActive } from '../../../shared/reminders'
import { useWorkspace } from '../stores/workspace'
const props = defineProps<{ task: Task }>()
const workspace = useWorkspace(); const saving = ref(false)
const active = computed(() => isReminderActive(props.task, workspace.now))
async function acknowledge(): Promise<void> {
  if (saving.value) return
  saving.value = true
  try { await workspace.acknowledge(props.task) } finally { saving.value = false }
}
</script>
<template>
  <div v-if="active" class="reminder-notice"><span>{{ task.reminderAcknowledgedAt ? '已知晓 · 完成前持续提醒' : '提醒已到 · 请及时处理' }}</span><button v-if="!task.reminderAcknowledgedAt" class="acknowledge-button" :disabled="saving" @click.stop="acknowledge">我已知晓</button></div>
</template>
