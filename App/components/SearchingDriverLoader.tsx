import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';

type Props = {
  reference?: string | null;
  fareLabel?: string;
  fareValue?: string;
  otp?: string | null;
};

/**
 * Loader animado para el estado "Buscando conductor".
 * Anillos tipo radar + ícono de carro con pulso.
 */
const SearchingDriverLoader: React.FC<Props> = ({
  reference,
  fareLabel = 'Valor estimado',
  fareValue,
  otp,
}) => {
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const ring3 = useRef(new Animated.Value(0)).current;
  const carPulse = useRef(new Animated.Value(0)).current;
  const d1 = useRef(new Animated.Value(0.25)).current;
  const d2 = useRef(new Animated.Value(0.25)).current;
  const d3 = useRef(new Animated.Value(0.25)).current;

  useEffect(() => {
    const mkRing = (val: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, {
            toValue: 1,
            duration: 2200,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(val, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      );

    const a1 = mkRing(ring1, 0);
    const a2 = mkRing(ring2, 700);
    const a3 = mkRing(ring3, 1400);
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(carPulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(carPulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );

    a1.start();
    a2.start();
    a3.start();
    pulse.start();

    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
      pulse.stop();
    };
  }, [ring1, ring2, ring3, carPulse]);

  const ringStyle = (val: Animated.Value) => ({
    opacity: val.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.6, 0.4, 0] }),
    transform: [
      {
        // Escala contenida para que las ondas no se salgan de la card
        scale: val.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1.05] }),
      },
    ],
  });

  const carScale = carPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.08],
  });

  useEffect(() => {
    const blink = (v: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, { toValue: 1, duration: 280, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0.25, duration: 280, useNativeDriver: true }),
          Animated.delay(600),
        ])
      );
    const b1 = blink(d1, 0);
    const b2 = blink(d2, 200);
    const b3 = blink(d3, 400);
    b1.start();
    b2.start();
    b3.start();
    return () => {
      b1.stop();
      b2.stop();
      b3.stop();
    };
  }, [d1, d2, d3]);

  return (
    <View style={styles.card}>
      <View style={styles.radarWrap}>
        <Animated.View style={[styles.ring, ringStyle(ring1)]} />
        <Animated.View style={[styles.ring, ringStyle(ring2)]} />
        <Animated.View style={[styles.ring, ringStyle(ring3)]} />
        <Animated.View style={[styles.carOrbWrap, { transform: [{ scale: carScale }] }]}>
          <View style={styles.carOrbHalo} />
          <View style={styles.carOrb}>
            <FontAwesome5 name="car" size={20} color="#001824" />
          </View>
        </Animated.View>
      </View>

      <View style={styles.titleRow}>
        <Text style={styles.title}>Buscando conductor</Text>
        <View style={styles.dotsRow}>
          <Animated.Text style={[styles.dot, { opacity: d1 }]}>.</Animated.Text>
          <Animated.Text style={[styles.dot, { opacity: d2 }]}>.</Animated.Text>
          <Animated.Text style={[styles.dot, { opacity: d3 }]}>.</Animated.Text>
        </View>
      </View>
      <Text style={styles.subtitle}>
        Estamos localizando el conductor más cercano a tu punto de recogida
      </Text>

      <View style={styles.metaBox}>
        {!!reference && (
          <View style={styles.metaRow}>
            <Ionicons name="barcode-outline" size={14} color="#00E5FF" />
            <Text style={styles.metaLabel}>Referencia</Text>
            <Text style={styles.metaValue}>{reference}</Text>
          </View>
        )}
        {!!fareValue && (
          <View style={styles.metaRow}>
            <Ionicons name="cash-outline" size={14} color="#00E5FF" />
            <Text style={styles.metaLabel}>{fareLabel}</Text>
            <Text style={styles.metaFare}>{fareValue}</Text>
          </View>
        )}
        {!!otp && (
          <View style={styles.otpRow}>
            <MaterialLock otp={otp} />
          </View>
        )}
      </View>
    </View>
  );
};

const MaterialLock = ({ otp }: { otp: string }) => (
  <View style={styles.otpPill}>
    <Ionicons name="lock-closed" size={13} color="#00E676" />
    <Text style={styles.otpCode}>{otp}</Text>
    <Text style={styles.otpHint}>Código de seguridad</Text>
  </View>
);

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    marginBottom: 12,
    paddingVertical: 20,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(10,46,61,0.78)',
    borderWidth: 1.5,
    borderColor: 'rgba(0,229,255,0.45)',
    alignItems: 'center',
    overflow: 'hidden',
  },
  radarWrap: {
    width: 112,
    height: 112,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    overflow: 'hidden',
  },
  ring: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 1.5,
    borderColor: '#00E5FF',
  },
  carOrbWrap: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Halo circular (evita la sombra cuadrada de elevation en Android)
  carOrbHalo: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(0,229,255,0.28)',
  },
  carOrb: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00E5FF',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 4,
  },
  title: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  dotsRow: {
    flexDirection: 'row',
    marginLeft: 2,
    marginBottom: 1,
  },
  dot: {
    color: '#00E5FF',
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 22,
  },
  subtitle: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.62)',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  metaBox: {
    width: '100%',
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,229,255,0.2)',
    gap: 10,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaLabel: {
    flex: 1,
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontWeight: '600',
  },
  metaValue: {
    color: '#00E5FF',
    fontSize: 13,
    fontWeight: '700',
  },
  metaFare: {
    color: '#00E5FF',
    fontSize: 14,
    fontWeight: '800',
  },
  otpRow: {
    marginTop: 2,
  },
  otpPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(0,230,118,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0,230,118,0.4)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  otpCode: {
    color: '#00E676',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 2,
  },
  otpHint: {
    marginLeft: 'auto',
    color: 'rgba(0,230,118,0.85)',
    fontSize: 11,
    fontWeight: '600',
  },
});

export default SearchingDriverLoader;
