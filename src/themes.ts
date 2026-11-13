import type { Age, Theme } from './types.ts';

export const THEMES: Record<string, Theme> = {
  spring:   { name: 'Spring',   bgTop: '#eef4e6', bgBottom: '#dfead2', trunk: '#4a3524', twig: '#7a6245', leaf1: '#7fae6a', leaf2: '#a8cc8c', ink: '#2f2417', accent: '#7a5a34', frame: '#8d7152' },
  autumn:   { name: 'Autumn',   bgTop: '#f7eddc', bgBottom: '#ecd9b8', trunk: '#4b3020', twig: '#8a5a34', leaf1: '#c8572a', leaf2: '#e5a52f', ink: '#35200f', accent: '#8a3d1c', frame: '#8a5a34' },
  winter:   { name: 'Winter',   bgTop: '#eef3f8', bgBottom: '#d6e0ea', trunk: '#3b3d45', twig: '#6c7078', leaf1: '#9db6c9', leaf2: '#cbdbe6', ink: '#232831', accent: '#4a5a6c', frame: '#6c7a89' },
  antique:  { name: 'Antique',  bgTop: '#efe0bd', bgBottom: '#e0c895', trunk: '#4a3420', twig: '#7a5c3a', leaf1: '#8a8a52', leaf2: '#b09a5a', ink: '#3a2812', accent: '#6e4720', frame: '#6e4720' },
  midnight: { name: 'Midnight', bgTop: '#1d2635', bgBottom: '#10161f', trunk: '#8a6f4a', twig: '#b99a68', leaf1: '#7aa88f', leaf2: '#c8d9b0', ink: '#f1e8d3', accent: '#e0c27a', frame: '#c9a85c' },
};
export const NO_AGE: Age = { amount: 0, paper: false, stains: false, creases: false, vignette: false, grain: false, sepia: false, photos: false };
export const OLD_AGE: Age = { amount: 70, paper: true, stains: true, creases: true, vignette: true, grain: true, sepia: true, photos: true };
// One-click looks: a colour theme plus how aged it is
export const LOOKS: Record<string, { theme: string; age: Age; leaves?: number }> = {
  spring:    { theme: 'spring', age: NO_AGE },
  autumn:    { theme: 'autumn', age: NO_AGE },
  winter:    { theme: 'winter', age: NO_AGE, leaves: 0 },
  parchment: { theme: 'antique', age: OLD_AGE },
  midnight:  { theme: 'midnight', age: NO_AGE },
};
