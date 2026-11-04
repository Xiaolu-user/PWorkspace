<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useFitness } from '../fitness/store'
import PlanPane from '../fitness/PlanPane.vue'
import LibraryPane from '../fitness/LibraryPane.vue'
import RecordsPane from '../fitness/RecordsPane.vue'
import AppIcon from '../components/AppIcon.vue'
import '../fitness/fitness.css'
import '../fitness/responsive.css'
import '../fitness/embedded.css'
const route=useRoute(),router=useRouter(),fs=useFitness(),plan=ref<InstanceType<typeof PlanPane>>(),library=ref<InstanceType<typeof LibraryPane>>(),records=ref<InstanceType<typeof RecordsPane>>()
const pages:Record<string,{title:string;subtitle:string}>={overview:{title:'健身计划',subtitle:'安排接下来怎么练，把实际完成的训练留在记录里。'},cycles:{title:'循环设置',subtitle:'用三步设置训练与休息的循环节奏。'},templates:{title:'常用训练内容',subtitle:'保存常练的动作组合，在计划里按天选用。'},library:{title:'动作库',subtitle:'收好常用动作，按自己的训练方式分类。'},calendar:{title:'训练记录',subtitle:'回看每一次真实的训练，让努力留下清晰的足迹。'},stats:{title:'训练记录',subtitle:'回看每一次训练，也看见自己的变化。'},compare:{title:'动作对比',subtitle:'把同一个动作的历次表现放在一起看。'},list:{title:'训练记录',subtitle:'方便查找、补充和整理过去的训练。'},entry:{title:'补录训练',subtitle:'记下实际完成的内容，已知多少就填多少。'}}
const page=computed(()=>pages[String(route.query.view)]?String(route.query.view):'overview'),isPlan=computed(()=>['overview','cycles','templates'].includes(page.value)),isRecord=computed(()=>['calendar','stats','compare','list','entry'].includes(page.value))
const navigate=(view:string)=>void router.push({path:'/fitness',query:view==='overview'?{}:{view}})
onMounted(()=>fs.load())
</script>
<template><div class="fitness-page embedded-fitness" :data-view="page">
<header class="fit-page-header"><div><h1>{{ pages[page].title }}</h1><p>{{ pages[page].subtitle }}</p></div><div class="fit-actions">
<button v-if="page==='overview'" class="fit-primary" @click="navigate('cycles')"><AppIcon name="refresh" :size="16"/>修改循环</button>
<button v-if="['cycles','templates'].includes(page)" class="fit-button" @click="navigate('overview')">‹ 返回训练计划</button>
<button v-if="page==='templates'" class="fit-primary" @click="plan?.addTemplate()">＋ 新建训练内容</button>
<button v-if="page==='library'" class="fit-primary" @click="library?.create()">＋ 新建动作</button>
<button v-if="isRecord&&page!=='entry'" class="fit-primary" @click="records?.newRecord()">＋ 补录训练</button>
</div></header>
<div class="fit-navigation-row"><nav class="fit-main-tabs" aria-label="健身功能导航"><button :class="{active:isPlan}" @click="navigate('overview')"><AppIcon name="calendar" :size="15"/>训练计划</button><button :class="{active:isRecord}" @click="navigate('calendar')"><AppIcon name="document" :size="15"/>训练记录</button><button :class="{active:page==='library'}" @click="navigate('library')"><AppIcon name="fitness" :size="15"/>动作库</button></nav><small>计划与实际训练，分开管理。</small></div>
<nav v-if="isRecord&&page!=='entry'" class="embedded-record-nav"><button v-for="[id,label] in [['calendar','日历'],['list','列表'],['stats','趋势']]" :class="{active:page===id||id==='stats'&&page==='compare'}" @click="navigate(id)">{{ label }}</button><button v-if="page==='compare'" class="fit-text" @click="navigate('stats')">‹ 返回训练趋势</button></nav>
<template v-if="fs.loaded"><PlanPane v-if="isPlan" ref="plan" :page="page" @navigate="navigate"/><LibraryPane v-if="page==='library'" ref="library"/><RecordsPane v-if="isRecord" ref="records" :page="page" @navigate="navigate"/></template><p v-else class="fit-empty">正在读取健身计划…</p>
</div></template>
