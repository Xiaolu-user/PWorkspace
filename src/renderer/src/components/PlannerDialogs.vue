<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { emptySemester, type Semester, type Workout, type PlannerData } from '../../../shared/planner'
import { unwrap, report } from '../lib/api'
const props = defineProps<{ modelValue: 'courses' | 'fitness' | null; data: PlannerData }>()
const emit = defineEmits<{ 'update:modelValue': [value: null]; saved: [] }>()
const semester = ref<Semester>(emptySemester()); const workouts = ref<Workout[]>([]); const saving = ref(false)
const days = ['一', '二', '三', '四', '五', '六', '日']
watch(() => props.modelValue, value => { if (value) { semester.value = JSON.parse(JSON.stringify(props.data.semester)); workouts.value = Array.from({ length: 7 }, (_, i) => ({ day: i + 1, title: '', minutes: 30, exercises: '', ...props.data.workouts.find(w => w.day === i + 1) })) } })
function addCourse(): void { semester.value.courses.push({ id: '', title: '', room: '', day: 1, start: '08:00', end: '09:40', firstWeek: 1, lastWeek: semester.value.weeks, parity: 'all' }) }
async function save(): Promise<void> {
  saving.value = true
  try { unwrap(await (props.modelValue === 'courses' ? window.workbench.planner.semester(JSON.parse(JSON.stringify(semester.value))) : window.workbench.planner.workouts(workouts.value.filter(w => w.title.trim()).map(w => ({ ...w }))))); ElMessage.success('计划已保存'); emit('saved'); emit('update:modelValue', null) } catch (e) { report(e) } finally { saving.value = false }
}
</script>
<template>
  <el-dialog :model-value="!!modelValue" :title="modelValue === 'courses' ? '学期课程' : '每周健身计划'" width="860px" :close-on-click-modal="false" :show-close="!saving" :close-on-press-escape="!saving" @close="emit('update:modelValue', null)">
    <el-form label-position="top" :disabled="saving">
      <template v-if="modelValue === 'courses'">
        <div class="planner-fields"><el-form-item label="学期名称"><el-input v-model="semester.title" placeholder="例如：2026 秋季学期" /></el-form-item><el-form-item label="第一周内的开学日期"><el-date-picker v-model="semester.startDate" value-format="YYYY-MM-DD" placeholder="选择开学日期" /></el-form-item><el-form-item label="学期周数"><el-input-number v-model="semester.weeks" :min="1" :max="52" /></el-form-item></div>
        <p class="planner-hint">周一作为每周起点；同一门课每周上多次时，分别添加。删除课程后保存生效。</p>
        <div v-for="(c, index) in semester.courses" :key="index" class="course-form">
          <div class="planner-fields"><el-input v-model="c.title" placeholder="课程名称" aria-label="课程名称" /><el-input v-model="c.room" placeholder="教室 / 地点" /><el-select v-model="c.day"><el-option v-for="(d, i) in days" :key="d" :label="'星期' + d" :value="i + 1" /></el-select></div>
          <div class="planner-fields"><el-time-picker v-model="c.start" format="HH:mm" value-format="HH:mm" placeholder="开始时间" /><el-time-picker v-model="c.end" format="HH:mm" value-format="HH:mm" placeholder="结束时间" /><el-select v-model="c.parity"><el-option label="每周" value="all" /><el-option label="单周" value="odd" /><el-option label="双周" value="even" /></el-select></div>
          <div class="course-weeks">第 <el-input-number v-model="c.firstWeek" :min="1" :max="semester.weeks" size="small" /> 至 <el-input-number v-model="c.lastWeek" :min="c.firstWeek" :max="semester.weeks" size="small" /> 周 <el-button text type="danger" @click="semester.courses.splice(index, 1)">删除课程</el-button></div>
        </div>
        <el-button @click="addCourse">＋ 添加课程</el-button>
      </template>
      <template v-else>
        <p class="planner-hint">按星期循环显示。训练名称留空表示休息日；动作每行一项，可写组数和时长。</p>
        <div v-for="w in workouts" :key="w.day" class="workout-form"><strong>星期{{ days[w.day - 1] }}</strong><el-input v-model="w.title" placeholder="训练名称（留空为休息日）" /><el-input-number v-model="w.minutes" :min="0" :max="600" /><span>分钟</span><el-input v-model="w.exercises" type="textarea" :rows="2" placeholder="例如：俯卧撑 3组 × 12次" /></div>
      </template>
    </el-form>
    <template #footer><el-button :disabled="saving" @click="emit('update:modelValue', null)">取消</el-button><el-button type="primary" :loading="saving" @click="save">保存计划</el-button></template>
  </el-dialog>
</template>
