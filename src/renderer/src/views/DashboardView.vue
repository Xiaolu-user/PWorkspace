<script setup lang="ts">
import { computed, ref, nextTick, onMounted, onBeforeUnmount, watch, type CSSProperties } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { useWorkspace } from '../stores/workspace'
import { useEditor } from '../stores/editor'
import { useFitness } from '../fitness/store'
import TodayFitnessCard from '../fitness/TodayFitnessCard.vue'
import { localDate } from '../../../shared/date'
import { isReminderActive, compareReminderTasks, reminderLabel } from '../../../shared/reminders'
import ReminderNotice from '../components/ReminderNotice.vue'
import { coursesOn, semesterWeek, emptySemester, defaultSlots, courseSlotSpan, type CourseOccurrence, type PlannerData, type LocalEntry } from '../../../shared/planner'
import type { Task } from '../../../shared/types'
import AppIcon from '../components/AppIcon.vue'
import TaskDialog from '../components/TaskDialog.vue'
import PlannerDialogs from '../components/PlannerDialogs.vue'
import TaskCalendar from '../components/TaskCalendar.vue'
import WeatherWidget from '../components/WeatherWidget.vue'
import ShortcutBoard from '../components/ShortcutBoard.vue'
import { unwrap, report, openLink, formatTime } from '../lib/api'
const ws = useWorkspace(); const editor = useEditor(); const router = useRouter(); const route = useRoute()
const fitness = useFitness()
const now = ref(new Date()); const today = computed(() => localDate(now.value))
const clock = computed(() => now.value.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }))
const dateLabel = computed(() => now.value.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }))
const weekdayLabel = computed(() => now.value.toLocaleDateString('zh-CN', { weekday: 'long' }))
const data = ref<PlannerData>({ semester: emptySemester(), semesters: [], homeSemesterId: '', workouts: [], entries: [], categories: [] })
const plan = ref<'courses' | 'fitness' | null>(null); const taskDialog = ref(false); const selected = ref<Task | null>(null)
const calendarOpen = ref(false)
const todayTasks = computed(() => ws.tasks.filter(t => t.category==='daily' || t.dueDate === today.value || isReminderActive(t, ws.now)).sort((a, b) => compareReminderTasks(a, b, ws.now)))
const taskCategory=ref<'normal'|'daily'>('normal')
const displayedTasks=computed(()=>taskCategory.value==='daily'?todayTasks.value.filter(t=>t.category==='daily'):todayTasks.value)
const done = computed(() => todayTasks.value.filter(t => t.status === 'done').length)
const percent = computed(() => todayTasks.value.length ? Math.round(done.value / todayTasks.value.length * 100) : 0)
const files = computed(() => data.value.entries.filter(e => e.kind === 'file'))
const week = computed(() => semesterWeek(data.value.semester.startDate, today.value))
const viewOffset = ref(0)
const viewMonday = computed(() => { const monday = new Date(now.value); monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7 + viewOffset.value * 7); return monday })
const viewDays = computed(() => Array.from({ length: 7 }, (_, i) => { const day = new Date(viewMonday.value); day.setDate(day.getDate() + i); const date = localDate(day); return { date, label: ['一', '二', '三', '四', '五', '六', '日'][i], short: `${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`, courses: coursesOn(data.value.semester, date) } }))
const viewWeek = computed(() => semesterWeek(data.value.semester.startDate, localDate(viewMonday.value)))
const viewRange = computed(() => { const sunday = new Date(viewMonday.value); sunday.setDate(sunday.getDate() + 6); const fmt = (day: Date) => `${String(day.getMonth() + 1).padStart(2, '0')}.${String(day.getDate()).padStart(2, '0')}`; return `${fmt(viewMonday.value)} – ${fmt(sunday)}` })
const viewCourseCount = computed(() => viewDays.value.reduce((total, day) => total + day.courses.length, 0))
// Keep configured period times, but only render rows occupied by this week’s courses.
const ROW_MIN = 46
const courseFontScale = computed(() => Math.max(80, Math.min(160, ws.preferences.appearance.courseFontScale)) / 100)
const courseTextScale = computed(() => ws.preferences.appearance.fontScale * ws.preferences.appearance.modules.courses.fontScale / 10000 * courseFontScale.value)
const rowMin = computed(() => Math.round(ROW_MIN * courseTextScale.value))
const weekSlots = computed(() => {
  const slots = data.value.semester.slots.length ? data.value.semester.slots : defaultSlots()
  const occupied = new Set<number>()
  for (const course of viewDays.value.flatMap(day => day.courses)) {
    const { first, last } = courseSlotSpan(slots, course.start, course.end)
    for (let i = first; i <= last; i++) occupied.add(i)
  }
  return slots.filter((_, i) => occupied.has(i))
})
const gridStyle = computed<CSSProperties>(() => weekSlots.value.length ? { gridTemplateRows: `repeat(${weekSlots.value.length}, minmax(${rowMin.value}px, auto))` } : { height: '72px' })
const periodMinutes = (time: string): number => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
function courseCell(start: string, end: string, dayIndex: number): CSSProperties {
  const { first, last } = courseSlotSpan(weekSlots.value, start, end)
  return { gridColumn: String(dayIndex + 2), gridRow: `${first + 1} / ${last + 2}`, '--sep-inset': noonRows.value.has(first + 1) ? '7px' : '0px' } as CSSProperties
}
// Light rules divide the day into 上午 / 下午 / 晚上; they appear only where the week crosses a boundary.
const dayPart = (start: string): number => periodMinutes(start) < 12 * 60 ? 0 : periodMinutes(start) < 18 * 60 ? 1 : 2
const weekSeps = computed(() => weekSlots.value.flatMap((slot, index) => index && dayPart(slot.start) !== dayPart(weekSlots.value[index - 1].start) ? [{ row: index + 1, noon: dayPart(slot.start) === 1 }] : []))
// The noon divider is a pair of rules inside the first afternoon row, so blocks starting there are inset below it.
const noonRows = computed(() => new Set(weekSeps.value.filter(sep => sep.noon).map(sep => sep.row)))
const sepRow = (row: number): boolean => noonRows.value.has(row)
const weekRules = computed(() => weekSlots.value.slice(1).flatMap((slot, i) => weekSeps.value.some(sep => sep.row === i + 2) ? [] : [{ row: i + 2, start: slot.start }]))
const todayIndex = computed(() => viewDays.value.findIndex(day => day.date === today.value))
const nowLine = computed(() => {
  if (viewOffset.value !== 0) return null
  const minutes = now.value.getHours() * 60 + now.value.getMinutes()
  const index = weekSlots.value.findIndex(slot => minutes >= periodMinutes(slot.start) && minutes <= periodMinutes(slot.end))
  if (index < 0) return null
  const slot = weekSlots.value[index]
  const span = Math.max(1, periodMinutes(slot.end) - periodMinutes(slot.start))
  return { row: index + 1, percent: Math.round((minutes - periodMinutes(slot.start)) / span * 1000) / 10, label: clock.value }
})
function courseState(date: string, start: string, end: string): string { if (date !== today.value) return ''; return clock.value >= end ? '已结束' : clock.value >= start ? '进行中' : '即将开始' }
function blockTitle(date: string, course: CourseOccurrence): string { const state = courseState(date, course.start, course.end); return `${course.start}–${course.end} ${course.title}${course.room ? ' · ' + course.room : ''}${state && state !== '已结束' ? ' · ' + state : ''}${course.modified ? ' · 已调整' : ''}` }

let timer: ReturnType<typeof setInterval>; let request = 0
async function load(): Promise<void> { const n = ++request; try { const value = unwrap(await window.workbench.planner.get()); if (n === request) data.value = value } catch (e) { report(e) } }
watch(() => ws.revision, () => void load())
watch(plan, value => { if (!value && ['courses', 'fitness'].includes(String(route.query.panel))) void router.replace('/') })
watch(() => route.query.panel, panel => { if (panel === 'fitness') void router.replace('/fitness'); else if (panel === 'courses') plan.value = panel; else if (panel === 'files') document.getElementById('home-files')?.scrollIntoView({ behavior: 'smooth' }) }, { immediate: true })
watch(() => editor.body, body => { editor.title = body.trim().split('\n')[0].slice(0, 80) || '' })
function tick(): void { const before = today.value; now.value = new Date(); if (before !== today.value) { viewOffset.value = 0; void ws.refresh() } }
onMounted(() => { void fitness.load(); if (!editor.dirty) editor.select(null); timer = setInterval(tick, 1000); window.addEventListener('focus', tick); void load() })
onBeforeUnmount(() => { clearInterval(timer); window.removeEventListener('focus', tick) })
const quickTitle = ref(''); const quickEditing = ref(false); const quickSaving = ref(false)
const quickInput = ref<HTMLInputElement | null>(null); const taskDraft = ref('')
function addTask(): void { selected.value = null; taskDraft.value = ''; taskDialog.value = true }
function editTask(task: Task): void { selected.value = task; taskDraft.value = ''; taskDialog.value = true }
function openQuick(): void { quickEditing.value = true; void nextTick(() => quickInput.value?.focus()) }
function closeQuick(): void { quickEditing.value = false; quickTitle.value = '' }
async function submitQuick(): Promise<void> {
  const title = quickTitle.value.trim(); if (!title || quickSaving.value) return
  quickSaving.value = true
  const ok = await ws.mutate(() => window.workbench.tasks.create({ category: taskCategory.value, title, description: '', status: 'todo', dueDate: today.value, priority: 'normal', dueTime: null, remindBefore: null }), '已添加新任务')
  quickSaving.value = false
  if (ok) closeQuick()
}
function detailQuick(): void { taskDraft.value = quickTitle.value.trim(); selected.value = null; taskDialog.value = true; quickEditing.value = false }
const toggling = ref(new Set<string>())
async function toggle(task: Task): Promise<void> { if (toggling.value.has(task.id)) return; toggling.value.add(task.id); await ws.mutate(() => window.workbench.tasks.update(task.id, { ...task, status: task.status === 'done' ? 'todo' : 'done' }), task.status === 'done' ? '已取消完成' : '任务已完成'); toggling.value.delete(task.id) }
async function saveIdea(): Promise<void> { if (editor.body.trim() && await editor.save()) editor.select(null) }
async function reloadShortcuts(): Promise<void> { await Promise.all([load(), ws.refresh()]) }
async function pick(kind: 'app' | 'file' | 'folder'): Promise<void> { try { unwrap(await window.workbench.planner.pick(kind)); await load() } catch (e) { report(e) } }
async function openLocal(id: string): Promise<void> { try { unwrap(await window.workbench.planner.open(id)) } catch (e) { report(e) } }
async function removeEntry(entry: Pick<LocalEntry, 'id' | 'title'>, kind = 'file'): Promise<void> {
  try { await ElMessageBox.confirm(`移除“${entry.title}”的入口？原文件不会删除。`, '移除入口', { confirmButtonText: '移除', cancelButtonText: '取消' }); if (kind === 'web') await ws.mutate(() => window.workbench.bookmarks.remove(entry.id), '链接已删除'); else { unwrap(await window.workbench.planner.remove(entry.id)); await load() } } catch (e) { if (e !== 'cancel' && e !== 'close') report(e) }
}
</script>
<template>
  <h1 class="sr-only">今日概览</h1>
  <div class="home-grid">
    <div class="home-column home-left">
      <section class="home-card time-card" :style="ws.moduleStyle('time')"><div class="card-label"><AppIcon name="clock" />此刻</div><div class="time-weather"><div class="clock-content"><time>{{ clock }}</time><div class="time-date-row"><p class="time-date-label">{{ dateLabel }}</p><span class="time-weekday">{{ weekdayLabel }}</span><button class="icon-button calendar-trigger" aria-label="打开日历" title="打开日历，安排待办" aria-haspopup="dialog" :aria-expanded="calendarOpen" @click="calendarOpen = true"><AppIcon name="calendar" :size="20" /></button></div></div><WeatherWidget /></div></section>
      <section class="home-card home-tasks" :class="{ 'is-quick-adding': quickEditing }" :style="ws.moduleStyle('todos')"><header><h2><AppIcon name="done" />今日待办</h2><span class="muted">{{ done }} / {{ todayTasks.length }}</span><button class="icon-button" aria-label="添加任务" @click="addTask"><AppIcon name="plus" /></button></header><p class="home-caption">每日必做未完成时置顶，勾选后次日重新开始。</p>
        <div class="home-task-tabs" aria-label="今日待办分类"><button :class="{active:taskCategory==='normal'}" @click="taskCategory='normal'">全部待办</button><button :class="{active:taskCategory==='daily'}" @click="taskCategory='daily'">每日必做 <span>{{ todayTasks.filter(t=>t.category==='daily'&&t.status==='todo').length }}</span></button></div><div class="home-task-list"><div v-for="task in displayedTasks" :key="task.id" class="home-task" :class="{ completed: task.status === 'done', 'reminder-active': isReminderActive(task, ws.now), 'reminder-flashing': isReminderActive(task, ws.now) && !task.reminderAcknowledgedAt }"><input type="checkbox" :checked="task.status === 'done'" :disabled="toggling.has(task.id)" :aria-label="'完成任务：' + task.title" @change="toggle(task)" /><button @click="editTask(task)"><strong>{{ task.title }}<span v-if="task.category==='daily'" class="daily-task-badge">每日必做</span><i v-if="task.priority === 'high'" class="priority-dot"></i></strong><small>{{ task.description || '给今天留一点进步' }}</small><small v-if="task.dueTime">{{ task.dueDate !== today ? task.dueDate + ' ' : '' }}{{ task.dueTime }}<template v-if="task.remindBefore !== null"> · {{ reminderLabel(task.remindBefore) }}</template></small></button><button class="icon-button" :aria-label="'编辑' + task.title" @click="editTask(task)"><AppIcon name="more" :size="15" /></button><ReminderNotice :task="task" /></div></div>
        <button v-if="!quickEditing" type="button" class="task-add-zone" @click="openQuick">
          <span class="task-zone-ring"><AppIcon name="plus" :size="15" /></span>
          <span class="task-zone-label">{{ todayTasks.length ? '添加今日待办' : '今天还没有待办' }}</span>
          <span class="task-zone-hint">{{ todayTasks.length ? '点击此处任意位置' : '点击这里，记下第一件事' }}</span>
        </button>
        <div v-else class="task-add-zone editing">
          <span class="task-zone-ring"><AppIcon name="plus" :size="13" /></span>
          <input ref="quickInput" v-model="quickTitle" class="task-zone-input" placeholder="接下来要做什么？回车创建，Esc 取消" maxlength="200" :disabled="quickSaving" @keydown.enter.prevent="submitQuick" @keydown.esc.prevent="closeQuick" />
          <button type="button" class="task-zone-detail" @click="detailQuick">详细设置</button>
        </div>
        <div class="task-progress"><div><i :style="{ width: percent + '%' }"></i></div><span>{{ percent }}%</span></div><p class="home-caption">已完成 {{ done }} 项，还有 {{ todayTasks.length - done }} 项</p><router-link v-if="ws.dashboard.overdue.length" class="overdue-link" to="/tasks">还有 {{ ws.dashboard.overdue.length }} 项逾期任务，前往处理 →</router-link>
      </section>
    </div>
    <div class="home-column home-center">
      <ShortcutBoard :entries="data.entries" :categories="data.categories" @changed="reloadShortcuts" />
      <section class="home-card inspiration-card" :style="ws.moduleStyle('ideas')"><header><h2><AppIcon name="edit" />灵感速记</h2><small class="muted">{{ editor.dirty ? '未保存' : '随手记录' }}</small></header><p class="home-caption">随时捕捉，一闪而过的想法。</p><div class="idea-input" @click="($refs.idea as HTMLTextAreaElement)?.focus()"><textarea ref="idea" v-model="editor.body" :disabled="editor.saving" aria-label="灵感内容" placeholder="此刻，你在想什么？&#10;点击空白处，开始记录…" @keydown.ctrl.enter.prevent="saveIdea" /><div><small>Ctrl + Enter 保存</small><el-button type="primary" :disabled="!editor.body.trim()" :loading="editor.saving" @click.stop="saveIdea">记录</el-button></div></div><button v-for="note in ws.notes.slice(0, 2)" :key="note.id" class="idea-row" @click="router.push({ path: '/notes', query: { id: note.id } })"><AppIcon name="document" :size="17" /><span>{{ note.title }}</span><small>{{ formatTime(note.updatedAt) }}</small></button>
      </section>
    </div>
    <div class="home-column home-right">
      <section class="home-card courses-card" :style="{ ...ws.moduleStyle('courses'), '--course-text-scale': courseFontScale }"><header><h2><AppIcon name="notebook" />本周课程</h2><button class="text-link" @click="plan = 'courses'">＋ 学期课程</button></header><p class="home-caption">{{ data.semester.title || '还没有设置学期' }}<span v-if="data.semester.startDate"> · {{ week < 1 ? '尚未开学' : week > data.semester.weeks ? '学期已结束' : `第 ${week} 周` }}</span></p>
        <div class="week-nav"><strong>{{ viewWeek < 1 ? '未开学' : `第 ${viewWeek} 周` }}</strong><span class="week-range">{{ viewRange }}</span><div class="week-nav-buttons"><button :disabled="viewWeek <= 1" aria-label="查看上一周" title="上一周" @click="viewOffset--">‹</button><button :class="{ active: viewOffset === 0 }" :disabled="viewOffset === 0" @click="viewOffset = 0">本周</button><button :disabled="viewWeek >= data.semester.weeks" aria-label="查看下一周" title="下一周" @click="viewOffset++">›</button></div></div>
        <div class="week-grid-head"><i aria-hidden="true"></i><div v-for="d in viewDays" :key="d.date" :class="{ today: d.date === today }"><small>{{ d.date === today ? '今天' : '周' + d.label }}</small><strong>{{ d.short }}</strong></div></div>
        <div class="week-grid-body" :class="{ empty: !weekSlots.length }" :style="gridStyle">
          <template v-if="weekSlots.length">
            <i v-for="(d, i) in viewDays" :key="'lane-' + d.date" class="day-lane" :class="{ today: d.date === today, last: i === viewDays.length - 1 }" :style="{ gridColumn: String(i + 2) }" aria-hidden="true"></i>
            <span v-for="(slot, i) in weekSlots" :key="'slot-' + slot.start" class="period-cell" :class="{ last: i === weekSlots.length - 1, 'after-sep': sepRow(i + 1) }" :style="{ gridRow: String(i + 1) }"><b>{{ slot.start }}</b><small>{{ slot.end }}</small></span>
            <span v-for="rule in weekRules" :key="'rule-' + rule.start" class="grid-rule" :style="{ gridRow: String(rule.row) }" aria-hidden="true"></span>
            <span v-for="sep in weekSeps" :key="'sep-' + sep.row" class="week-sep" :class="{ noon: sep.noon }" :style="{ gridRow: String(sep.row) }" aria-hidden="true"></span>
            <template v-for="(d, dayIndex) in viewDays" :key="'day-' + d.date">
              <button v-for="c in d.courses" :key="c.id" class="course-block" :style="{ ...courseCell(c.start, c.end, dayIndex), '--course-color': c.color }" :title="blockTitle(d.date, c)" @click="plan = 'courses'"><strong>{{ c.title }}</strong><small class="course-room">{{ c.room || '未设置教室' }}</small><i v-if="courseState(d.date, c.start, c.end) && courseState(d.date, c.start, c.end) !== '已结束'" class="course-live" :class="{ pending: courseState(d.date, c.start, c.end) === '即将开始' }" aria-hidden="true"></i></button>
            </template>
            <div v-if="nowLine && todayIndex >= 0" class="now-slot" :style="{ gridColumn: String(todayIndex + 2), gridRow: String(nowLine.row) }" aria-hidden="true"><div class="now-line" :style="{ top: nowLine.percent + '%' }"><i>{{ nowLine.label }}</i></div></div>
          </template>
          <p v-else class="week-empty">该周还没有课程安排，点击“学期课程”添加。</p>
        </div>
        <div class="course-foot"><span>{{ viewOffset === 0 ? '本周' : '该周' }}共 {{ viewCourseCount }} 节课</span><button class="text-link" @click="plan = 'courses'">编辑课表 →</button></div>
      </section>
      <TodayFitnessCard class="home-card fitness-card" :date="today" :style="ws.moduleStyle('fitness')"/>
      <section id="home-files" class="home-card files-card" :style="ws.moduleStyle('files')"><header><h2><AppIcon name="folder" />常用资料</h2><el-dropdown trigger="click" @command="pick"><button class="icon-button" aria-label="添加资料"><AppIcon name="plus" /></button><template #dropdown><el-dropdown-menu><el-dropdown-item command="file">选择文件</el-dropdown-item><el-dropdown-item command="folder">选择文件夹</el-dropdown-item></el-dropdown-menu></template></el-dropdown></header><div class="file-list"><div v-for="f in files" :key="f.id" class="file-row"><button :title="f.path" @click="openLocal(f.id)"><img v-if="f.icon" :src="f.icon" alt="" /><AppIcon v-else name="document" /><span><strong>{{ f.title }}</strong><small>{{ f.path }}</small></span></button><button class="icon-button" :aria-label="'移除' + f.title" @click="removeEntry(f)">×</button></div></div><button class="file-add" @click="pick('file')"><AppIcon name="add" :size="17" />点击添加文件入口</button><small class="file-hint">文件保留在原位置，移除入口不会删除文件。</small></section>
    </div>
  </div>
  <TaskDialog v-model="taskDialog" :task="selected" :default-date="today" :default-title="taskDraft" :default-category="taskCategory==='daily'?'daily':'normal'" />
  <TaskCalendar v-model="calendarOpen" :today="today" />
  <PlannerDialogs v-model="plan" :data="data" @saved="load" />
</template>
