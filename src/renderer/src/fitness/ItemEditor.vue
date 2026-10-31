<script setup lang="ts">
import { ref, computed } from 'vue'
import { useFitness, asset } from './store'
import { clone, newSet, type FitnessItem } from '../../../shared/fitness'
const props = defineProps<{ items: FitnessItem[]; actual?: boolean }>()
const fs = useFitness(), query = ref(''), expanded = ref(-1), dragging = ref(-1), advanced = ref(false)
const results = computed(() => fs.exercises.filter(e => (e.name + e.alias + e.part).toLowerCase().includes(query.value.toLowerCase())).slice(0, 25))
function add(id: string): void { props.items.push(fs.item(id)); query.value = '' }
function resize(item: FitnessItem, count: number): void { while (item.sets.length < count) item.sets.push(clone(item.sets[0] || newSet())); item.sets.splice(count) }
function drop(index: number): void { if (dragging.value < 0) return; const [item] = props.items.splice(dragging.value, 1); props.items.splice(index, 0, item); dragging.value = -1 }
</script>
<template>
  <div class="fit-item-editor">
    <div class="fit-table-head"><span>动作</span><span>组数</span><span>{{ actual ? '实际' : '参考' }}重量 / 次数</span><span>组间休息</span><span></span></div>
    <div v-for="(item,i) in items" :key="i" class="fit-edit-item" draggable="true" @dragstart="dragging=i" @dragover.prevent @drop.prevent="drop(i)">
      <div class="fit-item-summary"><button type="button" class="fit-exercise-name" @click="expanded=expanded===i?-1:i"><span class="fit-grip">⠿</span><img v-if="fs.exercise(item.exerciseId)?.image" :src="asset(fs.exercise(item.exerciseId).image)" /><strong>{{ fs.exercise(item.exerciseId)?.name || item.exerciseId }}</strong></button><input type="number" min="1" :value="item.sets.length" aria-label="组数" @change="resize(item, Number(($event.target as HTMLInputElement).value))" /><div class="fit-pair" v-if="fs.exercise(item.exerciseId)?.measure==='weight'"><input v-model.number="item.sets[0].weight" type="number" min="0" placeholder="kg" @change="item.sets.forEach(s=>s.weight=item.sets[0].weight)"/><span>kg ×</span><input v-model.number="item.sets[0].reps" type="number" min="0" placeholder="次数" @change="item.sets.forEach(s=>s.reps=item.sets[0].reps)"/></div><div v-else class="fit-pair"><input v-if="fs.exercise(item.exerciseId)?.measure==='time'" v-model.number="item.sets[0].duration" type="number" min="0" placeholder="秒"/><input v-else v-model.number="item.sets[0].distance" type="number" min="0" placeholder="米"/><span>{{ fs.exercise(item.exerciseId)?.measure==='time'?'秒':'米' }}</span></div><div class="fit-pair"><input v-model.number="item.rest" type="number" min="0"/><span>秒</span></div><button type="button" class="fit-icon" aria-label="移除动作" @click="items.splice(i,1)">×</button></div>
      <div v-if="expanded===i" class="fit-set-editor"><div v-for="(set,j) in item.sets" :key="j" class="fit-set-row"><span>第 {{ j+1 }} 组</span><label v-if="fs.exercise(item.exerciseId)?.measure==='weight'">重量 kg<input v-model.number="set.weight" type="number" min="0"/></label><label v-if="fs.exercise(item.exerciseId)?.measure==='weight'">次数<input v-model.number="set.reps" type="number" min="0"/></label><label v-if="fs.exercise(item.exerciseId)?.measure==='time'">时长 秒<input v-model.number="set.duration" type="number" min="0"/></label><label v-if="fs.exercise(item.exerciseId)?.measure==='distance'">距离 米<input v-model.number="set.distance" type="number" min="0"/></label><button type="button" class="fit-icon" v-if="item.sets.length>1" @click="item.sets.splice(j,1)">×</button></div><button type="button" class="fit-button" @click="item.sets.push(newSet())">＋ 添加一组</button><input v-model="item.notes" placeholder="动作备注（可选）"/></div>
    </div>
    <div class="fit-add-exercise"><input v-model="query" placeholder="＋ 搜索动作名称、英文名或部位，添加到列表"/><div v-if="query" class="fit-picker"><button type="button" v-for="e in results" :key="e.id" @click="add(e.id)">{{ e.name }}<small>{{ e.part }} · {{ e.equipment }}</small></button><p v-if="!results.length">没有匹配动作，可在动作库新建。</p></div></div>
    <button type="button" class="fit-text" @click="advanced=!advanced">{{ advanced?'⌃':'⌄' }} 高级设置：逐组目标、超级组、备注</button><div v-if="advanced"><p class="fit-muted">点击动作名称展开逐组编辑；拖动行调整顺序。相同分组名称的动作组成超级组。</p><label v-for="item in items" class="fit-label">{{ fs.exercise(item.exerciseId)?.name }}<input v-model="item.group" placeholder="超级组名称（可选，如 A 组）"/></label></div>
  </div>
</template>
