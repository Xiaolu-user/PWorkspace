<script setup lang="ts">
import { useId } from 'vue'
defineProps<{ kind: string }>()
const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
</script>
<template>
  <svg class="weather-symbol" viewBox="0 0 88 76" fill="none" aria-hidden="true">
    <defs>
      <linearGradient :id="id + '-sun'" x1="16" y1="10" x2="48" y2="44" gradientUnits="userSpaceOnUse"><stop stop-color="#ffdc68" /><stop offset="1" stop-color="#f5ac27" /></linearGradient>
      <linearGradient :id="id + '-cloud'" x1="42" y1="26" x2="54" y2="64" gradientUnits="userSpaceOnUse"><stop stop-color="#ffffff" /><stop offset=".5" stop-color="#edf5ff" /><stop offset="1" stop-color="#cbdcf1" /></linearGradient>
    </defs>
    <g v-if="kind === 'sun' || kind === 'cloudSun'" stroke="#efb83c" stroke-width="3" stroke-linecap="round">
      <path d="M32 5v5M32 52v5M6 31h5M53 31h5M13.6 12.6l3.5 3.5M47 47l3.5 3.5M13.6 49.4l3.5-3.5M47 16l3.5-3.5" />
      <circle cx="32" cy="31" r="16" :fill="`url(#${id}-sun)`" stroke="#f5c14d" stroke-width="1" />
    </g>
    <path v-if="kind === 'moon'" d="M51 11a25 25 0 1 0 18 40A28 28 0 0 1 51 11Z" fill="#e8eefb" stroke="#f9fbff" />
    <path v-if="kind !== 'sun' && kind !== 'moon'" d="M27 59a13 13 0 0 1-1-26 19 19 0 0 1 35-7 16.5 16.5 0 0 1 5 33H27Z" :fill="`url(#${id}-cloud)`" stroke="#ffffff" stroke-width="1.5" />
    <g v-if="kind === 'rain'" stroke="#81b2df" stroke-width="3" stroke-linecap="round"><path d="m32 65-2 5m15-5-2 5m15-5-2 5" /></g>
    <g v-if="kind === 'snow'" fill="#b8d8ef"><circle cx="31" cy="68" r="2" /><circle cx="44" cy="71" r="2" /><circle cx="57" cy="68" r="2" /></g>
  </svg>
</template>
