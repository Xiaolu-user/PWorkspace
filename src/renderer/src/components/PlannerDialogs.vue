<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { type Workout, type PlannerData } from '../../../shared/planner'
import CoursePlanner from './CoursePlanner.vue'
import { unwrap, report } from '../lib/api'
const props = defineProps<{ modelValue: 'courses' | 'fitness' | null; data: PlannerData }>()
const emit = defineEmits<{ 'update:modelValue': [value: null]; saved: [] }>()
const workouts = ref<Workout[]>([]); const saving = ref(false)
const days = ['一', '二', '三', '四', '五', '六', '日']
watch(() => props.modelValue, value => { if (value) { workouts.value = Array.from({ length: 7 }, (_, i) => ({ day: i + 1, title: '', minutes: 30, exercises: '', ...props.data.workouts.find(w => w.day === i + 1) })) } })
async function save(): Promise<void> {
  saving.value = true
  try { unwrap(await window.workbench.planner.workouts(workouts.value.filter(w => w.title.trim()).map(w => ({ ...w })))); ElMessage.success('计划已保存'); emit('saved'); emit('update:modelValue', null) } catch (e) { report(e) } finally { saving.value = false }
}
</script>
<template>
  <CoursePlanner :model-value="modelValue === 'courses'" :semester="data.semester" @update:model-value="emit('update:modelValue', null)" @saved="emit('saved')" />
  <el-dialog :model-value="modelValue === 'fitness'" title="每周健身计划" width="860px" :close-on-click-modal="false" :show-close="!saving" :close-on-press-escape="!saving" @close="emit('update:modelValue', null)">
    <el-form label-position="top" :disabled="saving">
      <template v-if="modelValue === 'fitness'">
        <p class="planner-hint">按星期循环显示。训练名称留空表示休息日；动作每行一项，可写组数和时长。</p>
        <div v-for="w in workouts" :key="w.day" class="workout-form"><strong>星期{{ days[w.day - 1] }}</strong><el-input v-model="w.title" placeholder="训练名称（留空为休息日）" /><el-input-number v-model="w.minutes" :min="0" :max="600" /><span>分钟</span><el-input v-model="w.exercises" type="textarea" :rows="2" placeholder="例如：俯卧撑 3组 × 12次" /></div>
      </template>
    </el-form>
    <template #footer><el-button :disabled="saving" @click="emit('update:modelValue', null)">取消</el-button><el-button type="primary" :loading="saving" @click="save">保存计划</el-button></template>
  </el-dialog>
</template>
