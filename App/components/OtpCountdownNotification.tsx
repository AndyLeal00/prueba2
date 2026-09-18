import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import supabase from '@/config/SupabaseConfig';

interface OtpCountdownNotificationProps {
  bookingId: string;
  customerId: string;
  visible: boolean;
}

/**
 * 🔴 Componente para mostrar al cliente el countdown del OTP en tiempo real
 * El cliente VE el contador disminuir (sincronizado desde servidor)
 */

const OtpCountdownNotification: React.FC<OtpCountdownNotificationProps> = ({
  bookingId,
  customerId,
  visible,
}) => {
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [isExpired, setIsExpired] = useState(false);
  const scaleAnim = new Animated.Value(1);

  // 📡 Sincronizar countdown desde servidor
  useEffect(() => {
    if (!visible || !bookingId) return;

    const fetchTimerState = async () => {
      try {
        const { data, error } = await (supabase as any)
          .from('bookings')
          .select('otp_timer_started_at')
          .eq('id', bookingId)
          .single();

        if (error || !data?.otp_timer_started_at) {
          setTimeRemaining(null);
          return;
        }

        const startTime = new Date(data.otp_timer_started_at).getTime();
        const now = new Date().getTime();
        const elapsed = (now - startTime) / 1000;
        const remaining = Math.min(180, Math.max(0, 180 - elapsed)); // 3 minutos

        setTimeRemaining(Math.ceil(remaining));
        setIsExpired(remaining <= 0);
      } catch (error) {
        console.error('❌ Error fetching timer:', error);
      }
    };

    // Fetch inicial
    fetchTimerState();

    // Actualizar cada segundo
    const interval = setInterval(fetchTimerState, 1000);

    return () => clearInterval(interval);
  }, [visible, bookingId]);

  // 📢 Animación cuando actualiza
  useEffect(() => {
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 1.1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [timeRemaining]);

  if (!visible || timeRemaining === null) {
    return null;
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Color del contador (cambia a rojo en últimos 30 seg)
  const counterColor = timeRemaining <= 30 ? '#E91E63' : '#00E5FF';

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.notification, { transform: [{ scale: scaleAnim }] }]}>
        <View style={styles.header}>
          <MaterialCommunityIcons name="clock-outline" size={24} color={counterColor} />
          <Text style={styles.title}>Tu conductor está listo</Text>
        </View>

        <View style={styles.timerBox}>
          <Text style={[styles.timerText, { color: counterColor }]}>
            {formatTime(timeRemaining)}
          </Text>
          <Text style={styles.timerSubtext}>
            {isExpired ? '¡Código disponible!' : 'Código en...'}
          </Text>
        </View>

        <Text style={styles.message}>
          {isExpired
            ? '✅ Tu conductor puede iniciar el viaje. Pide el código si no lo tienes.'
            : '⏳ Tu conductor ha llegado. El código se compartirá pronto.'}
        </Text>

        {/* Barra de progreso */}
        <View style={styles.progressBarContainer}>
          <View
            style={[
              styles.progressBar,
              {
                width: `${((180 - timeRemaining) / 180) * 100}%`,
                backgroundColor: counterColor,
              },
            ]}
          />
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    paddingHorizontal: 12,
    paddingTop: 20,
  },
  notification: {
    backgroundColor: 'rgba(5, 26, 38, 0.95)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#00E5FF',
    padding: 16,
    gap: 12,
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
    flex: 1,
  },
  timerBox: {
    alignItems: 'center',
    paddingVertical: 12,
    backgroundColor: 'rgba(0, 229, 255, 0.08)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.3)',
  },
  timerText: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 1,
    fontFamily: 'monospace',
  },
  timerSubtext: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    marginTop: 4,
  },
  message: {
    fontSize: 13,
    fontWeight: '500',
    color: '#AAA',
    textAlign: 'center',
    lineHeight: 18,
  },
  progressBarContainer: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
  },
});

export default OtpCountdownNotification;
