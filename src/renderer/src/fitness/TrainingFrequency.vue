<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { TrainingRecord } from '../../../shared/fitness'
import { trainingFrequency, type FrequencyGroup, type FrequencyBucket } from './trainingFrequency'
import ChartTooltip from './ChartTooltip.vue'
import AppIcon from '../components/AppIcon.vue'
const props=defineProps<{records:TrainingRecord[];from:string;to:string;planStart:string;cycleLength:number}>()
const emit=defineEmits<{select:[bucket:FrequencyBucket|undefined]}>()
const group=ref<FrequencyGroup>('week'),metric=ref<'sessions'|'days'>('sessions'),selected=ref(0)
watch(()=>[props.from,props.to],()=>{group.value=(Date.parse(props.to)-Date.parse(props.from))/86400000>62?'month':'week'},{immediate:true})
const buckets=computed(()=>trainingFrequency(props.records,props.from,props.to,group.value,props.planStart,props.cycleLength))
const days=(rs:TrainingRecord[])=>new Set(rs.map(r=>r.date)).size
const values=computed(()=>buckets.value.map(b=>metric.value==='days'?days(b.records):b.records.length))
const max=computed(()=>Math.ceil(Math.max(1,...values.value)/2)*2)
const unit=computed(()=>metric.value==='days'?'天':'次')
const rule=computed(()=>({day:'逐日查看训练分布',week:'按自然周统计，首尾以所选日期截取',month:'按自然月统计，首尾以所选日期截取',cycle:`按计划起始日，每 ${props.cycleLength} 天一周期`}[group.value]))
const hover=ref<{index:number;x:number;y:number}|null>(null)
const hovered=computed(()=>hover.value?buckets.value[hover.value.index]:undefined)
watch(buckets,bs=>{selected.value=Math.max(0,bs.length-1);hover.value=null},{immediate:true})
watch(()=>buckets.value[selected.value],b=>emit('select',b),{immediate:true})
function show(i:number,event:PointerEvent|FocusEvent){const r=(event.currentTarget as HTMLElement).getBoundingClientRect();hover.value={index:i,x:'clientX' in event?event.clientX:r.left,y:'clientY' in event?event.clientY:r.top}}
</script>
<template>
<section class="fit-card tf-frequency frequency-card">
 <header class="tf-card-head"><div><span class="tf-eyebrow">TRAINING FREQUENCY</span><h2>训练频率</h2></div><label>统计周期<select v-model="group"><option value="day">每天</option><option value="week">每周</option><option value="month">每月</option><option value="cycle">每个训练周期</option></select></label></header>
 <div class="tf-frequency-tools"><div class="tf-toggle" aria-label="统计指标"><button v-for="[v,t] in [['sessions','训练次数'],['days','训练天数']]" :key="v" :class="{active:metric===v}" :aria-pressed="metric===v" @click="metric=v as 'sessions'|'days'">{{ t }}</button></div><span>{{ metric==='days'?'同一天多次训练，合并为 1 天':'每条已保存记录，计为 1 次训练' }}</span></div>
 <div class="tf-chart-scroll" @pointerleave="hover=null"><div class="tf-bar-chart" :style="{'--columns':buckets.length,minWidth:Math.max(400,buckets.length*(group==='month'?(from.slice(0,4)===to.slice(0,4)?36:62):75))+'px'}"><div class="tf-y-axis"><span v-for="n in [max,max/2,0]" :key="n">{{ n }}</span></div><div class="tf-chart-grid"><i/><i/><i/></div><button v-for="(b,i) in buckets" :key="b.start" class="tf-bar-column" :class="{selected:selected===i}" :style="{'--value-height':values[i]/max*145+'px'}" :aria-pressed="selected===i" :aria-label="b.title+'，'+values[i]+unit" @click="selected=i" @pointermove="show(i,$event)" @focus="show(i,$event)" @blur="hover=null" @keydown.esc="hover=null"><span class="tf-bar-value">{{ values[i] }}<small>{{ unit }}</small></span><span class="tf-bar-track"><i :style="{'--bar-height':values[i]/max*145+'px'}"/></span><span class="tf-bar-label">{{ group==='month'?(from.slice(0,4)===to.slice(0,4)?Number(b.start.slice(5,7))+'月':b.start.slice(0,7).replace('-','.')):b.label }}</span></button></div></div>
 <footer class="tf-chart-footer"><span>{{ rule }}</span><span><AppIcon name="right" :size="13"/>点选柱子，右侧查看记录</span></footer>
 <ChartTooltip v-if="hover&&hovered" :x="hover.x" :y="hover.y" :label="hovered.title" :lines="['训练次数：'+hovered.records.length+' 次','训练日：'+days(hovered.records)+' 天']"/>
</section>
</template>
