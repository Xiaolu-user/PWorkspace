<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useFitness } from '../fitness/store'
import PlanPane from '../fitness/PlanPane.vue'
import LibraryPane from '../fitness/LibraryPane.vue'
import RecordsPane from '../fitness/RecordsPane.vue'
import '../fitness/fitness.css'
const route=useRoute(),router=useRouter(),fs=useFitness(),records=ref<InstanceType<typeof RecordsPane>>()
const pages:Record<string,{title:string;subtitle:string}>={overview:{title:'健身计划',subtitle:'按周期安排，按自己的节奏调整。'},cycles:{title:'周期编排',subtitle:'按基础节奏生成训练日程，并支持按轮灵活调整。'},templates:{title:'训练模板',subtitle:'把常用训练存成模板，按需复用到每一轮。'},library:{title:'动作库',subtitle:'收好常用动作，按自己的训练方式分类。'},calendar:{title:'训练记录',subtitle:'用不同视角，回顾每一次训练。'},stats:{title:'训练统计',subtitle:'看见长期变化，不只是一串数字。'},compare:{title:'动作对比',subtitle:'把同一个动作的历次表现放在一起看。'},list:{title:'记录明细',subtitle:'方便查找、补充和整理过去的训练。'},entry:{title:'补录训练',subtitle:'记下实际完成的内容，已知多少就填多少。'}}
const page=computed(()=>pages[String(route.query.view)]?String(route.query.view):'overview'),isPlan=computed(()=>['overview','cycles','templates'].includes(page.value)),isRecord=computed(()=>['calendar','stats','compare','list','entry'].includes(page.value))
const navigate=(view:string)=>void router.push({path:'/fitness',query:view==='overview'?{}:{view}})
onMounted(()=>fs.load())
</script>
<template><div class="fitness-page"><header class="fit-page-header"><div><h1>{{ pages[page].title }}</h1><p>{{ pages[page].subtitle }}</p></div><div class="fit-actions" v-if="isPlan"><button class="fit-button" @click="navigate('calendar')">▤ 记录回顾</button><button class="fit-primary" @click="navigate(page==='overview'?'cycles':'templates')">{{ page==='overview'?'✎ 编辑计划':'＋ 管理模板' }}</button></div></header><nav class="fit-main-tabs" aria-label="健身功能导航"><button :class="{active:isPlan}" @click="navigate('overview')">训练计划</button><button :class="{active:page==='library'}" @click="navigate('library')">动作库</button><button :class="{active:isRecord}" @click="navigate('calendar')">训练记录</button></nav><nav v-if="isPlan" class="fit-sub-tabs"><button v-for="[id,label] in [['overview','概览'],['cycles','周期编排'],['templates','训练模板']]" :class="{active:page===id}" @click="navigate(id)">{{ label }}</button></nav><nav v-if="isRecord&&page!=='entry'" class="fit-sub-tabs fit-card"><button v-for="[id,label] in [['calendar','▦ 日历'],['stats','▥ 统计'],['compare','☷ 动作对比'],['list','▤ 明细']]" :class="{active:page===id}" @click="navigate(id)">{{ label }}</button></nav><template v-if="fs.loaded"><PlanPane v-if="isPlan" :page="page" @navigate="navigate"/><LibraryPane v-if="page==='library'"/><RecordsPane v-if="isRecord" ref="records" :page="page" @navigate="navigate"/></template><p v-else class="fit-empty">正在读取健身计划…</p></div></template>
