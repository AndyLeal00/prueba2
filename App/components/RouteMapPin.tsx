import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CLIENT_ORIGIN_MARKER_IMAGE } from '@/components/ClientOriginMapMarker';

/** Icono circular (persona / bandera). */
export const ROUTE_PIN_ICON = 40;
/** Altura del “palito” que une icono y punta. */
export const ROUTE_PIN_STEM = 14;
/** Diámetro del punto en el suelo (coordenada real). */
export const ROUTE_PIN_TIP = 8;
/** Espacio extra arriba para que el icono pueda “levantarse” sin recortar. */
export const ROUTE_PIN_LIFT = 10;
/** Ancho total del pin (para centrar en overlay / Marker). */
export const ROUTE_PIN_WIDTH = ROUTE_PIN_ICON + 16;
/**
 * Altura total hasta la punta inferior (ancla del mapa).
 * Incluye espacio de lift para que la punta NUNCA se mueva al levantar.
 */
export const ROUTE_PIN_HEIGHT = ROUTE_PIN_LIFT + ROUTE_PIN_ICON + ROUTE_PIN_STEM + ROUTE_PIN_TIP;

type PinVariant = 'origin' | 'destination';

type Props = {
  variant: PinVariant;
  /** Solo visual: el icono sube; la punta (coordenada) permanece fija. */
  lifted?: boolean;
};

/**
 * Pin de ruta: icono + palito + punta.
 * La coordenada geográfica es siempre la punta inferior.
 * `lifted` anima el icono hacia arriba sin desplazar la punta.
 */
export function RouteMapPin({ variant, lifted = false }: Props) {
  const isOrigin = variant === 'origin';
  const accent = isOrigin ? '#00E5FF' : '#E91E63';

  return (
    <View style={styles.wrap} collapsable={false}>
      <View
        style={[
          styles.iconSlot,
          { marginTop: lifted ? 0 : ROUTE_PIN_LIFT },
        ]}
        collapsable={false}
      >
        {isOrigin ? (
          <Image
            source={CLIENT_ORIGIN_MARKER_IMAGE}
            style={styles.originImg}
            resizeMode="contain"
          />
        ) : (
          <View style={[styles.destBubble, { backgroundColor: accent, shadowColor: accent }]}>
            <Ionicons name="flag" size={16} color="#FFFFFF" />
          </View>
        )}
      </View>

      <View
        style={[
          styles.stem,
          {
            backgroundColor: accent,
            height: lifted ? ROUTE_PIN_STEM + ROUTE_PIN_LIFT : ROUTE_PIN_STEM,
          },
        ]}
      />

      <View style={[styles.tip, { backgroundColor: accent, borderColor: '#FFFFFF' }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: ROUTE_PIN_WIDTH,
    height: ROUTE_PIN_HEIGHT,
    alignItems: 'center',
    justifyContent: 'flex-start',
    overflow: 'visible',
  },
  iconSlot: {
    width: ROUTE_PIN_ICON,
    height: ROUTE_PIN_ICON,
    alignItems: 'center',
    justifyContent: 'center',
  },
  originImg: {
    width: ROUTE_PIN_ICON,
    height: ROUTE_PIN_ICON,
  },
  destBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 6,
    elevation: 8,
  },
  stem: {
    width: 2.5,
    borderRadius: 1.5,
    marginTop: -1,
  },
  tip: {
    width: ROUTE_PIN_TIP,
    height: ROUTE_PIN_TIP,
    borderRadius: ROUTE_PIN_TIP / 2,
    borderWidth: 1.5,
    marginTop: -1,
  },
});
