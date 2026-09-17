import { useEffect, useState, useCallback, useRef } from 'react';
import supabase from '@/config/SupabaseConfig';

interface UseOtpTimerProps {
  bookingId: string;
  initialTimeRemaining?: number;
  onTimerExpired?: () => void;
  autoStart?: boolean;
}

interface OtpTimerState {
  timeRemaining: number;
  isRunning: boolean;
  isExpired: boolean;
  hasStarted: boolean;
  timerStartedAt: string | null;
}

export const useOtpTimer = ({
  bookingId,
  initialTimeRemaining = 180,
  onTimerExpired,
  autoStart = true,
}: UseOtpTimerProps) => {
  const [timerState, setTimerState] = useState<OtpTimerState>({
    timeRemaining: initialTimeRemaining,
    isRunning: false,
    isExpired: false,
    hasStarted: false,
    timerStartedAt: null,
  });

  const onTimerExpiredRef = useRef(onTimerExpired);
  const hasCalledExpiredRef = useRef(false);

  const fetchTimerState = useCallback(async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('bookings_v2_mobile' as any)
        .select('otp_timer_started_at, otp_timer_duration')
        .eq('id', bookingId)
        .single();

      if (error || !data) return null;

      const timerData = data as {
        otp_timer_started_at: string | null;
        otp_timer_duration: number;
      };

      if (!timerData.otp_timer_started_at) {
        setTimerState((prev) => ({
          ...prev,
          hasStarted: false,
          isRunning: false,
          timeRemaining: initialTimeRemaining,
        }));
        hasCalledExpiredRef.current = false;
        return null;
      }

      const startTime = new Date(timerData.otp_timer_started_at).getTime();
      const duration = timerData.otp_timer_duration || 180;
      const now = new Date().getTime();
      const elapsed = (now - startTime) / 1000;
      const remaining = Math.max(0, duration - elapsed);
      const isExpired = remaining <= 0;

      setTimerState((prev) => ({
        ...prev,
        hasStarted: true,
        isRunning: !isExpired,
        timeRemaining: Math.ceil(remaining),
        isExpired,
        timerStartedAt: timerData.otp_timer_started_at,
      }));

      if (isExpired && !hasCalledExpiredRef.current && onTimerExpiredRef.current) {
        console.log('⏰ [TIMER EXPIRED] Calling callback');
        hasCalledExpiredRef.current = true;
        onTimerExpiredRef.current();
      }

      return remaining;
    } catch (error) {
      console.error('❌ Error in fetchTimerState:', error);
      return null;
    }
  }, [bookingId, initialTimeRemaining]);

  useEffect(() => {
    onTimerExpiredRef.current = onTimerExpired;
  }, [onTimerExpired]);

  useEffect(() => {
    if (!bookingId) return;

    fetchTimerState();
    const interval = setInterval(fetchTimerState, 1000);

    return () => clearInterval(interval);
  }, [bookingId, fetchTimerState]);

  const startTimer = useCallback(async () => {
    try {
      const now = new Date().toISOString();
      const { error } = await (supabase as any)
        .from('bookings_v2_mobile' as any)
        .update({ otp_timer_started_at: now, otp_timer_duration: 180 })
        .eq('id', bookingId);

      if (error) throw error;

      hasCalledExpiredRef.current = false;
      console.log('✅ Timer started for booking:', bookingId);
      return true;
    } catch (error) {
      console.error('❌ Failed to start timer:', error);
      return false;
    }
  }, [bookingId]);

  const resetTimer = useCallback(async () => {
    try {
      const { error } = await (supabase as any)
        .from('bookings_v2_mobile' as any)
        .update({ otp_timer_started_at: null, otp_timer_duration: 180 })
        .eq('id', bookingId);

      if (error) throw error;

      hasCalledExpiredRef.current = false;
      setTimerState({
        timeRemaining: initialTimeRemaining,
        isRunning: false,
        isExpired: false,
        hasStarted: false,
        timerStartedAt: null,
      });

      console.log('✅ Timer reset');
      return true;
    } catch (error) {
      console.error('❌ Failed to reset timer:', error);
      return false;
    }
  }, [bookingId, initialTimeRemaining]);

  const formatTime = (seconds: number = timerState.timeRemaining): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return {
    timeRemaining: timerState.timeRemaining,
    isRunning: timerState.isRunning,
    isExpired: timerState.isExpired,
    hasStarted: timerState.hasStarted,
    timerStartedAt: timerState.timerStartedAt,
    startTimer,
    resetTimer,
    fetchTimerState,
    formatTime,
  };
};

export type UseOtpTimerReturn = ReturnType<typeof useOtpTimer>;
