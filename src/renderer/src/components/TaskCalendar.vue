<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { localDate } from '../../../shared/date'
import { reminderLabel, isReminderActive, compareReminderTasks } from '../../../shared/reminders'
import { advanceDate, calendarInfo } from '../../../shared/calendar'
import type { Task } from '../../../shared/types'
import { useWorkspace } from '../stores/workspace'
import AppIcon from './AppIcon.vue'
import TaskDialog from './TaskDialog.vue'
import ReminderNotice from './ReminderNotice.vue'

const props = defineProps<{ modelValue: boolean; today: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const workspace = useWorkspace()
const calendarStyle = computed(() => Object.fromEntries(Object.entries(workspace.preferences.appearance.calendarColors).map(([key, color]) => ['--calendar-' + key, color])))
const selectedDate = ref(props.today)
const month = ref(new Date(`${props.today}T12:00:00`))
const editing = ref(false); const selectedTask = ref<Task | null>(null)
const toggling = ref(new Set<string>())
const jumpAmount = ref<number | undefined>(10); const jumpUnit = ref<'year' | 'month' | 'day'>('day')
const selectedInfo = computed(() => calendarInfo(selectedDate.value))
const monthLabel = computed(() => month.value.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' }))
const selectedLabel = computed(() => new Date(`${selectedDate.value}T12:00:00`).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }))
const byDate = computed(() => {
  const groups = new Map<string, Task[]>()
  for (const task of workspace.tasks) {
    if (!task.dueDate) continue
    const tasks = groups.get(task.dueDate) || []
    tasks.push(task); groups.set(task.dueDate, tasks)
  }
  return groups
})
const days = computed(() => {
  const first = new Date(month.value.getFullYear(), month.value.getMonth(), 1, 12)
  first.setDate(first.getDate() - (first.getDay() + 6) % 7)
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(first); date.setDate(first.getDate() + index)
    const key = localDate(date); const tasks = byDate.value.get(key) || []
    return { date: key, number: date.getDate(), current: date.getMonth() === month.value.getMonth(), count: tasks.length, pending: tasks.filter(task => task.status === 'todo').length, info: calendarInfo(key) }
  })
})
const tasks = computed(() => [...(byDate.value.get(selectedDate.value) || [])].sort((a, b) => compareReminderTasks(a, b, workspace.now) || Number(a.status === 'done') - Number(b.status === 'done') || (a.dueTime || '24:00').localeCompare(b.dueTime || '24:00')))
watch(() => props.modelValue, value => { if (value) goToday() })
function goToday(): void { selectedDate.value = props.today; month.value = new Date(`${props.today}T12:00:00`) }
function moveMonth(offset: number): void { month.value = new Date(month.value.getFullYear(), month.value.getMonth() + offset, 1, 12) }
function chooseDate(date: string): void { selectedDate.value = date; month.value = new Date(`${date}T12:00:00`) }
function jump(): void {
  const date = advanceDate(selectedDate.value, jumpAmount.value ?? NaN, jumpUnit.value)
  if (!date) { ElMessage.warning('请输入有效的非负整数，跳转日期须在 1900 至 9999 年内'); return }
  chooseDate(date)
}
function add(): void { selectedTask.value = null; editing.value = true }
function edit(task: Task): void { selectedTask.value = task; editing.value = true }
async function toggle(task: Task): Promise<void> {
  if (toggling.value.has(task.id)) return
  toggling.value.add(task.id)
  await workspace.mutate(() => window.workbench.tasks.update(task.id, { ...task, status: task.status === 'done' ? 'todo' : 'done' }), task.status === 'done' ? '已取消完成' : '任务已完成')
  toggling.value.delete(task.id)
}
</script>

<template>
  <el-dialog :model-value="modelValue" title="日历与待办" width="820px" class="task-calendar-dialog" :style="calendarStyle" :close-on-click-modal="false" :close-on-press-escape="!editing" @update:model-value="emit('update:modelValue', $event)">
    <div class="calendar-layout">
      <section class="calendar-month" aria-label="月历">
        <header class="calendar-toolbar">
          <strong aria-live="polite">{{ monthLabel }}</strong>
          <form class="calendar-jump" @submit.prevent="jump"><el-input-number v-model="jumpAmount" :controls="false" :min="0" :precision="0" aria-label="跳转数量" /><el-select v-model="jumpUnit" aria-label="跳转单位"><el-option label="年" value="year" /><el-option label="月" value="month" /><el-option label="日" value="day" /></el-select><span>后</span><el-button @click="jump">跳转</el-button></form>
          <button class="outline-button" @click="goToday">今天</button>
          <button class="icon-button" aria-label="上个月" @click="moveMonth(-1)"><AppIcon name="left" :size="17" /></button>
          <button class="icon-button" aria-label="下个月" @click="moveMonth(1)"><AppIcon name="right" :size="17" /></button>
        </header>
        <div class="calendar-weekdays" aria-hidden="true"><span v-for="day in ['一', '二', '三', '四', '五', '六', '日']" :key="day">{{ day }}</span></div>
        <div class="calendar-days">
          <button v-for="day in days" :key="day.date" :data-date="day.date" class="calendar-day" :class="{ outside: !day.current, selected: day.date === selectedDate, today: day.date === today }" :aria-pressed="day.date === selectedDate" :aria-current="day.date === today ? 'date' : undefined" :aria-label="`${day.date}，${day.count ? day.count + ' 项待办' : '暂无待办'}${day.info.names.length ? '，' + day.info.names.join('、') : ''}${day.info.holiday ? '，' + (day.info.work ? '补班' : '放假') : ''}`" @click="chooseDate(day.date)">
            <span class="calendar-festivals" :title="day.info.names.join('、')" :aria-label="day.info.names.length > 1 ? day.info.names.length + ' 个节日或节气，选中查看详情' : undefined"><span v-if="day.info.entries.length > 1" class="calendar-event-dots" aria-hidden="true"><i v-for="entry in day.info.entries" :key="entry.name" class="calendar-event-dot" :data-kind="entry.kind"></i></span><span v-else-if="day.info.entries.length" class="calendar-event-name" :data-kind="day.info.entries[0].kind">{{ day.info.entries[0].name }}</span></span><span class="calendar-day-number">{{ day.number }}<i v-if="day.info.holiday" class="calendar-holiday-tag" :class="{ work: day.info.work }" :title="day.info.holiday + (day.info.work ? '补班' : '放假')">{{ day.info.work ? '班' : '休' }}</i></span><small v-if="day.count" :class="{ 'all-done': !day.pending }">{{ day.count }} 项</small><small v-else class="calendar-day-spacer" aria-hidden="true">&nbsp;</small>
          </button>
        </div>
        <p class="calendar-help">选择日期，查看或添加当天待办。</p>
        <p class="calendar-help calendar-legend"><span class="calendar-event-name" data-kind="festival">● 节日</span><span class="calendar-event-name" data-kind="solarTerm">● 节气</span><span><b class="holiday-legend">休</b> 放假</span><span><b class="work-legend">班</b> 补班</span><span>多个圆点表示多项节日，选中查看</span><span v-if="!selectedInfo.scheduleKnown">所选年份调休安排未收录</span></p>
      </section>
      <section class="calendar-agenda" aria-label="所选日期待办">
        <header><span>{{ selectedDate === today ? '今天' : selectedDate.slice(0, 4) + ' 年' }}</span><h3 aria-live="polite">{{ selectedLabel }}</h3><p>{{ tasks.length }} 项待办 · {{ tasks.filter(task => task.status === 'done').length }} 项已完成</p></header>
        <div class="calendar-date-details"><p class="calendar-lunar">{{ selectedInfo.lunar }}</p><ul v-if="selectedInfo.entries.length" class="calendar-event-details"><li v-for="entry in selectedInfo.entries" :key="entry.name" class="calendar-event-detail" :data-kind="entry.kind"><span>{{ entry.kind === 'solarTerm' ? '节气' : '节日' }}</span><strong>{{ entry.name }}</strong></li></ul><p v-if="selectedInfo.holiday" class="calendar-schedule-detail" :class="{ work: selectedInfo.work }"><b>{{ selectedInfo.work ? '班' : '休' }}</b>{{ selectedInfo.holiday }}{{ selectedInfo.work ? '补班' : '放假' }}</p></div>
        <el-button type="primary" class="calendar-add" @click="add"><AppIcon name="plus" :size="16" />添加当天待办</el-button>
        <div class="calendar-agenda-list">
          <div v-for="task in tasks" :key="task.id" class="calendar-task" :class="{ completed: task.status === 'done', 'reminder-active': isReminderActive(task, workspace.now), 'reminder-flashing': isReminderActive(task, workspace.now) && !task.reminderAcknowledgedAt }">
            <input type="checkbox" :checked="task.status === 'done'" :disabled="toggling.has(task.id)" :aria-label="'完成日历任务：' + task.title" @change="toggle(task)" />
            <button :aria-label="'编辑日历任务：' + task.title" @click="edit(task)"><strong>{{ task.title }}</strong><span>{{ task.dueTime || '全天' }}<template v-if="task.remindBefore !== null"> · {{ reminderLabel(task.remindBefore) }}</template></span><small v-if="task.description">{{ task.description }}</small></button>
            <ReminderNotice :task="task" />
          </div>
          <div v-if="!tasks.length" class="calendar-empty"><AppIcon name="calendar" :size="34" /><p>这一天还没有安排</p><small>把想做的事，放进日历里。</small></div>
        </div>
      </section>
    </div>
  </el-dialog>
  <TaskDialog v-model="editing" :task="selectedTask" :default-date="selectedDate" />
</template>

<style scoped>
.calendar-layout { display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:24px;padding:4px 0 8px }
.calendar-toolbar { display:flex;align-items:center;gap:7px;margin-bottom:22px }
.calendar-toolbar strong { margin-right:auto;font-size:calc(19px * var(--text-scale, 1));color:#205e4e }
.calendar-toolbar .outline-button { font-size:calc(12px * var(--text-scale, 1)) }
.calendar-weekdays,.calendar-days { display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px }
.calendar-weekdays { text-align:center;color:#92a199;font-size:calc(12px * var(--text-scale, 1));margin-bottom:10px }
.calendar-day { display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-height:55px;padding:6px 2px;border:1px solid transparent;border-radius:10px;background:transparent;color:#354f44;font-size:calc(15px * var(--text-scale, 1));font-variant-numeric:tabular-nums }
.calendar-day:hover { background:#edf6f1;border-color:#d6e8dc }
.calendar-day small { color:#5c9b7f;font-size:calc(10px * var(--text-scale, 1)) }
.calendar-day .all-done { color:#9ba59f }
.calendar-day.outside { color:#b8c2bc }
.calendar-day.today>span:not(.calendar-festivals) { text-decoration:underline;text-underline-offset:5px;text-decoration-color:#2b9777 }
.calendar-day.selected { background:#207c63;color:#fff;box-shadow:0 4px 10px #207c6322 }
.calendar-day.selected small { color:#e1f2e8 }
.calendar-day.selected.today>span:not(.calendar-festivals) { text-decoration-color:#fff }
.calendar-help { margin:17px 0 0;color:#93a198;font-size:calc(12px * var(--text-scale, 1)) }
.calendar-agenda { background:#f5f9f6;border:1px solid #e7eee9;border-radius:14px;padding:18px;min-width:0;display:flex;flex-direction:column }
.calendar-agenda header>span { font-size:calc(12px * var(--text-scale, 1));color:#7c9688 }
.calendar-agenda h3 { color:#2c5645;font-size:calc(18px * var(--text-scale, 1));margin:7px 0;font-weight:600 }
.calendar-agenda header p { color:#91a095;font-size:calc(12px * var(--text-scale, 1)) }
.calendar-add { width:100%;margin:17px 0 12px;gap:5px }
.calendar-agenda-list { max-height:290px;overflow:auto;flex:1 }
.calendar-task { display:flex;gap:10px;align-items:flex-start;background:white;border:1px solid #e5ede7;border-radius:9px;padding:12px 10px;margin-bottom:8px }
.calendar-task input { width:16px;height:16px;accent-color:#207c63;margin-top:3px;flex-shrink:0;cursor:pointer }
.calendar-task button { border:0;background:none;flex:1;min-width:0;text-align:left;padding:0 }
.calendar-task strong { display:block;font-size:calc(13px * var(--text-scale, 1));font-weight:550;overflow-wrap:anywhere }
.calendar-task span,.calendar-task small { display:block;font-size:calc(11px * var(--text-scale, 1));color:#829388;margin-top:5px }
.calendar-task small { overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden }
.calendar-task.completed strong { text-decoration:line-through;color:#9aa79e }
.calendar-empty { min-height:190px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:#a0b4a8;text-align:center }
.calendar-empty p { color:#789485;font-size:calc(13px * var(--text-scale, 1)) }
.calendar-empty small { font-size:calc(11px * var(--text-scale, 1)) }
@media(max-width:760px) { .calendar-layout { grid-template-columns:1fr }.calendar-agenda-list { max-height:180px }.calendar-empty { min-height:90px } }
@media(max-height:740px) { .calendar-day { min-height:45px }.calendar-toolbar { margin-bottom:16px }.calendar-help { margin-top:12px } }
</style>

<style scoped>
.calendar-layout { grid-template-columns:minmax(0,1.7fr) minmax(280px,1fr) }
.calendar-toolbar { flex-wrap:wrap;gap:8px }
.calendar-toolbar strong { margin-right:4px }
.calendar-jump { display:flex;align-items:center;gap:6px;margin-right:auto;min-width:0 }
.calendar-jump .el-input-number { width:76px }
.calendar-jump .el-select { width:72px }
.calendar-jump .el-button { padding:7px 10px;min-height:38px }
.calendar-jump :deep(.el-input__wrapper),.calendar-jump :deep(.el-select__wrapper) { min-height:38px }
.calendar-day { min-height:84px;padding:5px 3px;justify-content:flex-start }
.calendar-day .calendar-festivals { display:flex;align-items:center;justify-content:center;width:100%;font-size:calc(10px * var(--text-scale,1));line-height:1.35;min-height:2.2em;overflow-wrap:anywhere;white-space:normal }
.calendar-day-number { line-height:1.2 }
.calendar-day small { line-height:1.3 }
.calendar-day>span:not(.calendar-festivals) { position:relative }
.calendar-holiday-tag { font-size:calc(10px * var(--text-scale,1));font-style:normal;font-weight:750;margin-left:4px }
.calendar-date-details { font-size:calc(12px * var(--text-scale,1));margin-top:12px;line-height:1.8 }
.calendar-agenda-list { max-height:440px }
.calendar-task { flex-wrap:wrap }
.calendar-task>.reminder-notice { flex-basis:100%;margin-left:26px }
@media(max-width:1150px) { .calendar-layout { grid-template-columns:minmax(0,1.5fr) minmax(270px,1fr);gap:18px }.calendar-toolbar strong { flex-basis:100% }.calendar-jump { margin-right:auto } }
@media(max-width:820px) { .calendar-layout { grid-template-columns:1fr }.calendar-agenda-list { max-height:250px } }
@media(max-height:760px) { .calendar-day { min-height:72px }.calendar-toolbar { margin-bottom:12px } }
</style>
