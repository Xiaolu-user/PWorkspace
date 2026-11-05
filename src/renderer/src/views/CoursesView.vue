<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, type CSSProperties } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import AppIcon from '../components/AppIcon.vue'
import CoursePlanner from '../components/CoursePlanner.vue'
import { unwrap, report } from '../lib/api'
import { localDate } from '../../../shared/date'
import { emptySemester, defaultSlots, semesterWeek, courseDate, courseOccurrences, courseConflicts, courseSlotSpan, slotSpanText, slotMinutes, formatWeeks, type PlannerData, type Semester, type SemesterSlot, type CourseOccurrence } from '../../../shared/planner'
import '../courses.css'

const DAY_NAMES = ['一', '二', '三', '四', '五', '六', '日']
const ROW = 52

const data = ref<PlannerData>({ semester: emptySemester(), semesters: [], homeSemesterId: '', workouts: [], entries: [], categories: [] })
const activeId = ref('')
const today = ref(localDate())
const viewWeek = ref(1)
const menuOpen = ref(false), planOpen = ref(false), settingsOpen = ref(false), detailOpen = ref(false)
const detail = ref<CourseOccurrence | null>(null)

const active = computed<Semester>(() => data.value.semesters.find(item => item.id === activeId.value) || data.value.semesters[0] || emptySemester())
const slots = computed(() => active.value.slots.length ? active.value.slots : defaultSlots())
const isHome = computed(() => active.value.id === data.value.homeSemesterId)
const currentWeek = computed(() => semesterWeek(active.value.startDate, today.value))
const occurrences = computed(() => courseOccurrences(active.value))
const conflicts = computed(() => courseConflicts(occurrences.value))
const weekOccurrences = computed(() => occurrences.value.filter(item => item.week === viewWeek.value && !item.cancelled))
const days = computed(() => Array.from({ length: 7 }, (_, index) => {
  const day = index + 1, date = courseDate(active.value.startDate, viewWeek.value, day)
  return { day, date, label: DAY_NAMES[index], short: date ? date.slice(5).replace('-', '/') : '—', courses: weekOccurrences.value.filter(item => item.day === day) }
}))
const weekDateRange = computed(() => { if (!days.value[0].date) return ''; return `${days.value[0].date.slice(5).replace('-', '/')} – ${days.value[6].date.slice(5).replace('-', '/')}` })
const planCount = computed(() => active.value.courses.reduce((sum, course) => sum + course.schedules.length, 0))
const lessonCount = computed(() => occurrences.value.filter(item => !item.cancelled).length)
// A long break in the middle of the day becomes a dashed rule instead of an empty band of rows.
const breaks = computed(() => slots.value.slice(1).flatMap((slot, index) => {
  const gap = slotMinutes(slot.start) - slotMinutes(slots.value[index].end)
  if (gap < 40) return []
  return [{ row: index + 1, noon: (slotMinutes(slot.start) + slotMinutes(slots.value[index].end)) / 2 < 15 * 60, label: gap >= 60 ? '午休' : '课间' }]
}))

function blockStyle(item: CourseOccurrence): CSSProperties {
  const { first, last } = courseSlotSpan(slots.value, item.start, item.end)
  return { top: `${first * ROW}px`, height: `${(last - first + 1) * ROW - 4}px`, '--c': item.color } as CSSProperties
}
const isShort = (item: CourseOccurrence): boolean => { const { first, last } = courseSlotSpan(slots.value, item.start, item.end); return last === first }
const courseOf = (id: string) => active.value.courses.find(course => course.id === id)
const courseLessons = (id: string): number => occurrences.value.filter(item => item.courseId === id && !item.cancelled).length
const courseWeeks = (id: string): number[] => [...new Set(active.value.courses.find(course => course.id === id)?.schedules.flatMap(schedule => schedule.weeks) || [])].sort((a, b) => a - b)
function scheduleText(schedule: { day: number; start: string; end: string; room: string }): string { return `周${DAY_NAMES[schedule.day - 1]} ${schedule.start}–${schedule.end}${schedule.room ? ' · ' + schedule.room : ''}` }
function slotText(occurrence: CourseOccurrence): string { return `${slotSpanText(slots.value, occurrence.start, occurrence.end)} · ${occurrence.start}–${occurrence.end}` }

async function load(): Promise<void> {
  try {
    const value = unwrap(await window.workbench.planner.get())
    data.value = value
    if (!value.semesters.some(item => item.id === activeId.value)) activeId.value = value.homeSemesterId || value.semesters[0]?.id || ''
    today.value = localDate()
    const week = semesterWeek(active.value.startDate, today.value)
    viewWeek.value = Math.min(Math.max(week || 1, 1), active.value.weeks)
  } catch (error) { report(error) }
}
async function apply(patch: Partial<Semester>): Promise<void> {
  try {
    const value = { ...JSON.parse(JSON.stringify(active.value)), ...patch } as Semester
    data.value = unwrap(await window.workbench.planner.semester(value))
  } catch (error) { report(error) }
}
async function setHome(id: string): Promise<void> {
  try { data.value = unwrap(await window.workbench.planner.setHomeSemester(id)); ElMessage.success('主页已改为展示这个学期') } catch (error) { report(error) }
}
async function removeSemester(): Promise<void> {
  if (data.value.semesters.length < 2) { ElMessage.warning('至少要保留一个学期'); return }
  try {
    await ElMessageBox.confirm(`删除“${active.value.title || '未命名学期'}”及其全部课程？此操作不可撤销。`, '删除学期', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' })
    const removed = active.value.id
    data.value = unwrap(await window.workbench.planner.removeSemester(removed))
    activeId.value = data.value.homeSemesterId
    menuOpen.value = false
    ElMessage.success('学期已删除')
  } catch (error) { if (error !== 'cancel' && error !== 'close') report(error) }
}
async function renameSemester(): Promise<void> {
  try {
    const { value } = await ElMessageBox.prompt('学期名称', '重命名学期', { inputValue: active.value.title, confirmButtonText: '保存', cancelButtonText: '取消', inputValidator: (text: string) => !!text.trim() || '请填写学期名称' })
    await apply({ title: value.trim() })
    ElMessage.success('已重命名')
  } catch (error) { if (error !== 'cancel' && error !== 'close') report(error) }
}

// 新建学期
const createOpen = ref(false), creating = ref(false)
const draft = ref({ title: '', startDate: '', weeks: 18 })
function openCreate(): void {
  menuOpen.value = false
  const year = new Date().getFullYear()
  draft.value = { title: `${year} 秋季学期`, startDate: today.value, weeks: 18 }
  createOpen.value = true
}
async function createSemester(): Promise<void> {
  if (!draft.value.title.trim()) { ElMessage.warning('请填写学期名称'); return }
  creating.value = true
  try {
    const value: Semester = { id: crypto.randomUUID(), title: draft.value.title.trim(), startDate: draft.value.startDate, weeks: draft.value.weeks, slots: defaultSlots(), courses: [] }
    data.value = unwrap(await window.workbench.planner.semester(value))
    activeId.value = value.id
    viewWeek.value = 1
    createOpen.value = false
    ElMessage.success('学期已创建，可以开始排课')
  } catch (error) { report(error) } finally { creating.value = false }
}

// 节次与周数
const editSlots = ref<SemesterSlot[]>([]), editWeeks = ref(18), savingSettings = ref(false)
function openSettings(): void { editSlots.value = slots.value.map(slot => ({ ...slot })); editWeeks.value = active.value.weeks; settingsOpen.value = true }
function slotDuration(slot: SemesterSlot): string { return `${slotMinutes(slot.end) - slotMinutes(slot.start)} 分` }
function addSlot(): void {
  const last = editSlots.value[editSlots.value.length - 1]
  const start = last ? last.end : '08:00'
  const from = slotMinutes(start) + 10, end = from + 45
  const fmt = (minutes: number): string => `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
  editSlots.value.push({ start: fmt(from), end: fmt(end) })
}
function removeSlot(): void { if (editSlots.value.length > 1) editSlots.value.pop() }
function autoSlot(): void {
  let minutes = slotMinutes(editSlots.value[0]?.start || '08:00')
  editSlots.value = editSlots.value.map(() => { const start = minutes, end = minutes + 45; minutes += 55; const fmt = (value: number): string => `${String(Math.floor(value / 60) % 24).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`; return { start: fmt(start), end: fmt(end) } })
}
async function saveSettings(): Promise<void> {
  for (const slot of editSlots.value) if (!slot.start || !slot.end || slot.start >= slot.end) { ElMessage.warning('每节课的结束时间必须晚于开始时间'); return }
  savingSettings.value = true
  await apply({ slots: editSlots.value.map(slot => ({ ...slot })), weeks: Math.min(Math.max(editWeeks.value, 1), 52) })
  savingSettings.value = false
  settingsOpen.value = false
  if (viewWeek.value > active.value.weeks) viewWeek.value = active.value.weeks
  ElMessage.success('节次与周数已更新')
}
function openDetail(item: CourseOccurrence): void { detail.value = item; detailOpen.value = true }
function editFromDetail(): void { detailOpen.value = false; planOpen.value = true }

function onDocumentClick(event: MouseEvent): void {
  if (menuOpen.value && !(event.target as HTMLElement).closest('.term-wrap')) menuOpen.value = false
}
watch(activeId, () => { detailOpen.value = false })
onMounted(() => { document.addEventListener('click', onDocumentClick); void load() })
onBeforeUnmount(() => document.removeEventListener('click', onDocumentClick))
</script>
<template>
  <div class="courses-page">
    <div class="courses-head">
      <div>
        <div class="eyebrow">MY SCHEDULE</div>
        <h1>课程表</h1>
        <p>{{ active.title || '还没有设置学期' }}<span v-if="active.startDate"> · 第 {{ viewWeek }} / {{ active.weeks }} 周 · 本周 {{ weekOccurrences.length }} 节课 · 共 {{ active.courses.length }} 门课程</span></p>
      </div>
      <div class="actions">
        <button class="cbtn ghost" @click="openSettings"><AppIcon name="setting" :size="15" />节次与周数</button>
        <button class="cbtn primary" @click="planOpen = true"><AppIcon name="edit" :size="15" />编辑课表</button>
      </div>
    </div>

    <div class="term-bar">
      <div class="term-wrap">
        <button class="term-btn" :aria-expanded="menuOpen" @click.stop="menuOpen = !menuOpen">
          <span class="term-dot"></span>
          <span class="term-name">{{ active.title || '未命名学期' }}</span>
          <span v-if="isHome" class="home-badge">主页展示</span>
          <span class="term-sub">{{ active.weeks }} 周</span>
          <AppIcon name="right" :size="13" />
        </button>
        <div v-if="menuOpen" class="term-menu" @click.stop>
          <div class="m-head">切换学期</div>
          <button v-for="item in data.semesters" :key="item.id" class="term-opt" :class="{ cur: item.id === active.id }" @click="activeId = item.id; menuOpen = false">
            <div><span class="nm">{{ item.title || '未命名学期' }}</span><small>{{ item.weeks }} 周 · {{ item.courses.length }} 门课程</small></div>
            <span v-if="item.id === data.homeSemesterId" class="home-badge">主页展示</span>
            <span v-else class="act" @click.stop="setHome(item.id)">设为主页</span>
          </button>
          <div class="m-sep"></div>
          <div class="m-foot"><button @click="openCreate">＋ 新建学期</button><button @click="renameSemester">重命名</button><button @click="removeSemester">删除学期</button></div>
        </div>
      </div>
      <div class="bar-sep"></div>
      <div class="week-strip">
        <button v-for="week in active.weeks" :key="week" class="week-pill" :class="{ active: week === viewWeek, today: week === currentWeek }" :aria-label="`第 ${week} 周`" @click="viewWeek = week">{{ week }}</button>
      </div>
      <div class="bar-right">
        <button class="text-btn" :disabled="viewWeek <= 1" aria-label="上一周" @click="viewWeek--">‹</button>
        <button class="text-btn" :disabled="viewWeek === currentWeek" @click="viewWeek = Math.min(Math.max(currentWeek, 1), active.weeks)">本周</button>
        <button class="text-btn" :disabled="viewWeek >= active.weeks" aria-label="下一周" @click="viewWeek++">›</button>
      </div>
    </div>

    <div class="courses-body">
      <section class="panel">
        <div class="panel-head"><h2>本周课程</h2><span class="sub">{{ weekDateRange }} · 第 {{ viewWeek }} 周</span><span class="right">{{ weekOccurrences.length }} 节课</span></div>
        <div class="week-head">
          <i aria-hidden="true"></i>
          <div v-for="day in days" :key="day.day" class="day-head" :class="{ today: day.date === today }"><span class="lbl">周{{ day.label }}</span><small>{{ day.short }}</small></div>
        </div>
        <div class="week-body" :style="{ minHeight: slots.length * ROW + 'px' }">
          <div class="time-col" :style="{ height: slots.length * ROW + 'px' }">
            <div v-for="(slot, index) in slots" :key="index" class="slot-label" :style="{ top: index * ROW + 'px' }"><b>第 {{ index + 1 }} 节</b><span>{{ slot.start }}</span><span class="slot-end">{{ slot.end }}</span></div>
            <span v-for="line in breaks" :key="'b' + line.row" class="noon-label" :style="{ top: line.row * ROW + 'px' }">{{ line.label }}</span>
          </div>
          <div v-for="day in days" :key="day.day" class="day-col" :class="{ today: day.date === today }" :style="{ height: slots.length * ROW + 'px' }">
            <span v-for="line in breaks" :key="'l' + line.row" class="noon-line" :style="{ top: line.row * ROW + 'px' }" aria-hidden="true"></span>
            <button v-for="item in day.courses" :key="item.id" class="course" :class="{ short: isShort(item) }" :style="blockStyle(item)" :title="`${item.title} · ${item.start}–${item.end}${item.room ? ' · ' + item.room : ''}`" @click="openDetail(item)">
              <strong>{{ item.title }}</strong>
              <small class="meta">{{ slotText(item) }}</small>
              <small>{{ item.room || '未设置教室' }}</small>
            </button>
          </div>
        </div>
        <div v-if="!active.courses.length" class="week-empty">这个学期还没有课程，点击右上角「编辑课表」开始安排。</div>
        <div class="week-foot"><span>本周 {{ weekOccurrences.length }} 节课</span><span class="sep">·</span><span>按 {{ slots.length }} 节 / 天显示</span><span class="right">点击课程块查看详情 →</span></div>
      </section>

      <aside class="panel">
        <div class="panel-head"><h2>本学期课程</h2><span class="right">{{ active.courses.length }} 门</span></div>
        <div class="stats">
          <div><strong>{{ active.courses.length }}</strong><span>课程</span></div>
          <div><strong>{{ planCount }}</strong><span>安排</span></div>
          <div><strong>{{ lessonCount }}</strong><span>学期课次</span></div>
        </div>
        <div class="course-list">
          <button v-for="course in active.courses" :key="course.id" class="course-item" @click="planOpen = true">
            <i class="bar" :style="{ background: course.color }"></i>
            <span class="body"><strong>{{ course.title || '未命名课程' }}</strong><small>{{ course.teacher || '未填写教师' }} · {{ course.schedules.length }} 条安排</small></span>
            <span class="n">{{ courseLessons(course.id) }}</span>
          </button>
          <p v-if="!active.courses.length" class="week-empty">还没有课程</p>
        </div>
        <div class="side-foot" :class="{ warn: conflicts.length }">
          <AppIcon :name="conflicts.length ? 'warning' : 'check'" :size="14" />
          <span>{{ conflicts.length ? `发现 ${conflicts.length} 处时间冲突` : '时间冲突检查通过' }}</span>
          <span class="chip">{{ planCount }} 条安排</span>
        </div>
      </aside>
    </div>

    <section class="panel detail">
      <div class="panel-head"><h2>学期课程明细</h2><span class="sub">{{ active.title }} · {{ active.startDate || '未设置开学日期' }} · {{ active.weeks }} 周</span></div>
      <table>
        <thead><tr><th style="width: 22%">课程</th><th style="width: 12%">教师</th><th>上课安排</th><th style="width: 18%">周次</th><th style="width: 10%">学期课次</th></tr></thead>
        <tbody>
          <tr v-for="course in active.courses" :key="course.id">
            <td><span class="name"><i :style="{ background: course.color }"></i>{{ course.title || '未命名课程' }}</span></td>
            <td>{{ course.teacher || '—' }}</td>
            <td><span class="plans"><span v-for="schedule in course.schedules" :key="schedule.id" class="plan-chip">{{ scheduleText(schedule) }}</span></span></td>
            <td>第 {{ formatWeeks(courseWeeks(course.id)) || '—' }} 周<span v-if="courseWeeks(course.id).length && courseWeeks(course.id).length < active.weeks" class="twin">部分周</span></td>
            <td>{{ courseLessons(course.id) }} 次</td>
          </tr>
          <tr v-if="!active.courses.length"><td colspan="5" class="week-empty">还没有课程安排</td></tr>
        </tbody>
      </table>
    </section>

    <div v-if="detailOpen && detail" class="course-mask" @click="detailOpen = false"></div>
    <div v-if="detailOpen && detail" class="course-drawer">
      <div class="drawer-head">
        <div class="top"><h3>{{ detail.title }}</h3><button class="icon-btn" aria-label="关闭" @click="detailOpen = false"><AppIcon name="close" :size="16" /></button></div>
        <div class="sub"><i :style="{ background: detail.color }"></i>{{ detail.room || '未设置教室' }} · 第 {{ detail.week }} 周</div>
      </div>
      <div class="drawer-body">
        <div class="now-card">
          <div class="row"><strong>周{{ DAY_NAMES[detail.day - 1] }} {{ detail.start }}–{{ detail.end }}</strong><span class="st">{{ slotSpanText(slots, detail.start, detail.end) }}</span></div>
          <p>{{ courseOf(detail.courseId)?.teacher || '未填写教师' }} · {{ detail.date || '未设置开学日期' }}</p>
        </div>
        <div class="sect-label">本学期全部安排</div>
        <div v-for="schedule in courseOf(detail.courseId)?.schedules || []" :key="schedule.id" class="plan-row"><span class="d">周{{ DAY_NAMES[schedule.day - 1] }}</span><span class="t">{{ schedule.start }}–{{ schedule.end }}</span><span class="r">{{ schedule.room || '未设置教室' }}</span></div>
        <div class="mini-stats">
          <div><strong>{{ courseLessons(detail.courseId) }}</strong><span>学期课次</span></div>
          <div><strong>第 {{ formatWeeks(courseWeeks(detail.courseId)) || '—' }} 周</strong><span>上课周次</span></div>
          <div><strong>{{ conflicts.filter(item => item.first.courseId === detail?.courseId || item.second.courseId === detail?.courseId).length || '无' }}</strong><span>时间冲突</span></div>
        </div>
      </div>
      <div class="drawer-foot"><button class="cbtn primary" @click="editFromDetail">编辑课程</button><p class="hint">编辑会打开「学期课程」弹窗</p></div>
    </div>

    <div v-if="settingsOpen" class="course-mask" @click="settingsOpen = false"></div>
    <div v-if="settingsOpen" class="course-drawer wide">
      <div class="drawer-head"><div class="top"><h3>节次与周数</h3><button class="icon-btn" aria-label="关闭" @click="settingsOpen = false"><AppIcon name="close" :size="16" /></button></div></div>
      <div class="drawer-body">
        <div class="setting-block">
          <div class="field-row"><label>学期周数</label><div class="stepper"><button aria-label="减少一周" @click="editWeeks = Math.max(1, editWeeks - 1)">−</button><input v-model.number="editWeeks" type="number" min="1" max="52" aria-label="学期周数" /><button aria-label="增加一周" @click="editWeeks = Math.min(52, editWeeks + 1)">+</button></div><div class="quick-chips"><button v-for="value in [16, 18, 20]" :key="value" :class="{ on: editWeeks === value }" @click="editWeeks = value">{{ value }}</button></div></div>
          <p class="note-line">周次胶囊、周视图与明细表会一起变化。</p>
        </div>
        <div class="setting-block" style="border-bottom: 0">
          <div class="sect-label" style="margin-bottom: 6px">每天节次</div>
          <div v-for="(slot, index) in editSlots" :key="index" class="slot-row">
            <b>{{ index + 1 }}</b>
            <input v-model="slot.start" aria-label="开始时间" placeholder="08:00" maxlength="5" />
            <span class="dash">–</span>
            <input v-model="slot.end" aria-label="结束时间" placeholder="08:45" maxlength="5" />
            <span class="dur">{{ slotDuration(slot) }}</span>
            <button class="x" aria-label="删除这一节" @click="editSlots.splice(index, 1)">×</button>
          </div>
          <div class="slot-actions"><button @click="addSlot">＋ 添加一节</button><button @click="autoSlot">按 45 分钟重排</button><button @click="removeSlot">删除末节</button></div>
        </div>
      </div>
      <div class="drawer-foot"><button class="cbtn primary" :disabled="savingSettings" @click="saveSettings">完成</button><p class="hint">节次只决定时间轴的排布，不会改动课程原本的时间</p></div>
    </div>

    <el-dialog v-model="createOpen" title="新建学期" width="440px" append-to-body>
      <el-form label-position="top">
        <el-form-item label="学期名称"><el-input v-model="draft.title" maxlength="100" placeholder="例如：2027 春季学期" /></el-form-item>
        <el-form-item label="开学日期（第一周内的任意一天）"><el-date-picker v-model="draft.startDate" value-format="YYYY-MM-DD" placeholder="选择开学日期" /></el-form-item>
        <el-form-item label="学期周数"><el-input-number v-model="draft.weeks" :min="1" :max="52" /></el-form-item>
      </el-form>
      <p class="hint" style="text-align: left">新学期的节次先用默认的 8 节，建好后可在「节次与周数」里改。</p>
      <template #footer><el-button @click="createOpen = false">取消</el-button><el-button type="primary" :loading="creating" @click="createSemester">创建</el-button></template>
    </el-dialog>

    <CoursePlanner v-model="planOpen" :semester="active" @saved="load" />
  </div>
</template>
