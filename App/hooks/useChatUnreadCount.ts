import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ChatRole,
  countUnreadMessages,
} from '@/common/services/chatService';

const POLL_MS = 4000;

/**
 * Polling del badge de chat no leídos para un booking + rol.
 * Devuelve 0 si no hay tabla/mensajes (fail-safe).
 */
export function useChatUnreadCount(
  bookingId: string | null | undefined,
  myRole: ChatRole,
  enabled = true
): number {
  const [count, setCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (!bookingId || !enabled) {
        setCount(0);
        return;
      }

      let cancelled = false;

      const tick = async () => {
        const n = await countUnreadMessages(bookingId, myRole);
        if (!cancelled) setCount(n);
      };

      tick();
      const id = setInterval(tick, POLL_MS);

      return () => {
        cancelled = true;
        clearInterval(id);
      };
    }, [bookingId, myRole, enabled])
  );

  return count;
}
