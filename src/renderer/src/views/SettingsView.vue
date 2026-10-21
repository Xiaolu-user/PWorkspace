<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useWorkspace } from '../stores/workspace'
import { useEditor } from '../stores/editor'
import { unwrap, report } from '../lib/api'
import AppIcon from '../components/AppIcon.vue'
const workspace = useWorkspace(); const editor = useEditor()
const operation = ref<'backup' | 'restore' | null>(null); const savingPreference = ref(false)
const latestBackup = ref(''); const recoveryBackup = ref('')
async function setBehavior(value: unknown): Promise<void> {
  if (savingPreference.value) return
  if (value !== 'tray' && value !== 'quit') return
  savingPreference.value = true
  try { workspace.preferences = unwrap(await window.workbench.app.setCloseBehavior(value)); ElMessage.success('设置已保存') }
  catch (error) { report(error) }
  finally { savingPreference.value = false }
}
async function openDirectory(): Promise<void> { try { unwrap(await window.workbench.app.openDataDirectory()) } catch (error) { report(error) } }
async function createBackup(): Promise<void> {
  if (operation.value) return
  operation.value = 'backup'
  try { const result = unwrap(await window.workbench.backup.create()); if (result) { latestBackup.value = result.path; ElMessage.success('备份已保存') } }
  catch (error) { report(error) }
  finally { operation.value = null }
}
async function restoreBackup(): Promise<void> {
  if (operation.value || !await editor.requestLeave()) return
  operation.value = 'restore'
  try {
    const result = unwrap(await window.workbench.backup.restore())
    if (result) { editor.select(null); await workspace.refresh(); recoveryBackup.value = result.safetyBackup || ''; ElMessage.success('备份已恢复，全部内容已刷新') }
  } catch (error) { report(error) }
  finally { operation.value = null }
}
</script>
<template>
  <div class="settings-layout">
    <section class="panel settings-section"><div class="panel-heading"><h2><AppIcon name="monitor" :size="20" />桌面体验</h2></div><div class="setting-row"><div><strong>关闭窗口时</strong><p>你可以让工作台在托盘等待，也可以直接退出。</p></div><el-radio-group :model-value="workspace.preferences.closeBehavior" :disabled="savingPreference || !!operation" @update:model-value="setBehavior"><el-radio-button value="tray">留在托盘</el-radio-button><el-radio-button value="quit">退出软件</el-radio-button></el-radio-group></div><div class="setting-note"><AppIcon name="done" :size="16" /> 真正退出前，会提醒你保存尚未保存的笔记。</div></section>
    <section class="panel settings-section"><div class="panel-heading"><h2><AppIcon name="folder" :size="20" />数据与备份</h2><span class="local-badge"><span class="status-dot"></span>仅保存在本机</span></div>
      <div class="data-path"><span>数据文件夹</span><code>{{ workspace.info?.dataPath || '正在读取…' }}</code><el-button :disabled="!!operation" @click="openDirectory"><AppIcon name="folder" :size="16" />打开文件夹</el-button></div>
      <div class="backup-cards"><article><span class="setting-feature-icon green"><AppIcon name="download" :size="24" /></span><h3>保存一份备份</h3><p>把所有任务、笔记、链接和设置保存为一个文件。你也可以将它放到移动硬盘中。</p><el-button type="primary" :loading="operation === 'backup'" :disabled="!!operation" @click="createBackup">创建备份</el-button></article><article><span class="setting-feature-icon amber"><AppIcon name="upload" :size="24" /></span><h3>从备份中恢复</h3><p>恢复会替换当前内容。工作台会先校验文件，并保留恢复前的数据，以便找回。</p><el-button :loading="operation === 'restore'" :disabled="!!operation" @click="restoreBackup">选择备份并恢复</el-button></article></div>
      <div class="backup-policy"><AppIcon name="lock" :size="18" /><div><strong>每天启动时，自动多一份安心</strong><p>每天首次启动自动备份一次，保留最近 7 份。手动备份和恢复前备份不会自动删除。</p><code>{{ workspace.info?.backupPath }}</code></div></div>
      <div v-if="workspace.info?.startupWarning" class="error-banner" role="alert">{{ workspace.info.startupWarning }}</div>
      <div v-if="latestBackup" class="success-note">最近手动备份：<code>{{ latestBackup }}</code></div>
      <div v-if="recoveryBackup" class="success-note">恢复前的数据已保留：<code>{{ recoveryBackup }}</code></div>
    </section>
    <section class="panel settings-section about-section"><span class="brand-mark"><i></i><i></i><i></i><i></i></span><div><h3>拾光工作台 <span>v{{ workspace.info?.version || '—' }}</span></h3><p>一个安静的个人空间，整理任务，留住想法。</p></div><span class="about-caption">本地运行 · 离线可用</span></section>
  </div>
</template>
