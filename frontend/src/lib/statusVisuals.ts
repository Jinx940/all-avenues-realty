import type { Tone } from '../types';

const fallbackPalette = ['#8fc4ee', '#87debf', '#ffe28d', '#ffcf92', '#bfe8fb', '#f7b4bd'];

const normalize = (value: string) => value.trim().toLowerCase();

export function workStatusTone(value: string): Tone {
  const normalized = normalize(value);

  if (normalized.includes('done')) return 'success';
  if (normalized.includes('review')) return 'sky';
  if (normalized.includes('delay') || normalized.includes('overdue')) return 'danger';
  if (normalized.includes('in progress') || normalized.includes('progress')) return 'warning';
  if (normalized.includes('pending') || normalized.includes('planning')) return 'orange';
  return 'neutral';
}

export function paymentStatusTone(value: string): Tone {
  const normalized = normalize(value);

  if (normalized.includes('unpaid')) return 'danger';
  if (normalized.includes('partial')) return 'orange';
  if (normalized.includes('paid')) return 'success';
  if (normalized.includes('not invoiced')) return 'neutral';
  return 'neutral';
}

export function toneColor(tone: Tone, fallbackIndex = 0) {
  switch (tone) {
    case 'success':
      return '#87debf';
    case 'warning':
      return '#ffe28d';
    case 'orange':
      return '#ffcf92';
    case 'danger':
      return '#f7b4bd';
    case 'sky':
      return '#bfe8fb';
    case 'neutral':
      return '#8fc4ee';
    default:
      return fallbackPalette[fallbackIndex % fallbackPalette.length];
  }
}

export function workStatusColor(value: string, fallbackIndex = 0) {
  return toneColor(workStatusTone(value), fallbackIndex);
}

export function paymentStatusColor(value: string, fallbackIndex = 0) {
  return toneColor(paymentStatusTone(value), fallbackIndex);
}
