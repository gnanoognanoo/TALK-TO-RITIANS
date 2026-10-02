/**
 * ============================================================================
 * TALK TO RITIANS - 7-Minute Chat Timer Utilities
 * ============================================================================
 * Standardized timer threshold calculation and formatting.
 *
 * Thresholds:
 * - Normal: 07:00–01:01 (remainingSeconds > 60)
 * - Amber:  01:00–00:11 (remainingSeconds <= 60 && remainingSeconds > 10)
 * - Red:    00:10–00:00 (remainingSeconds <= 10 && remainingSeconds >= 0)
 */

export type TimerThresholdState = 'normal' | 'amber' | 'red';

export function getTimerThresholdState(seconds: number | null | undefined): TimerThresholdState {
  if (seconds === null || seconds === undefined) return 'normal';
  if (seconds <= 10 && seconds >= 0) return 'red';
  if (seconds <= 60 && seconds > 10) return 'amber';
  return 'normal';
}

export function formatTimer(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || seconds < 0) return '07:00';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
