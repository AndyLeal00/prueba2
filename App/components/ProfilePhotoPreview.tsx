import React, { useState } from 'react';
import {
  Dimensions,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
  ImageStyle,
  StyleProp,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { height: SCREEN_H } = Dimensions.get('window');

type Props = {
  uri?: string | null;
  size?: number;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
  fallbackIconSize?: number;
  accessibilityLabel?: string;
};

/**
 * Avatar circular. Si hay URI, al tocarlo abre vista previa a pantalla completa.
 */
const ProfilePhotoPreview: React.FC<Props> = ({
  uri,
  size = 40,
  style,
  imageStyle,
  fallbackIconSize,
  accessibilityLabel = 'Ver foto de perfil',
}) => {
  const [open, setOpen] = useState(false);
  const hasPhoto = !!uri && (uri.startsWith('http') || uri.startsWith('file:') || uri.startsWith('content:'));
  const radius = size / 2;
  const iconSize = fallbackIconSize ?? Math.max(14, Math.round(size * 0.45));

  const avatar = hasPhoto ? (
    <Image
      source={{ uri: uri! }}
      style={[
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: 'rgba(0,229,255,0.12)',
        },
        imageStyle,
      ]}
    />
  ) : (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: radius,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(0,229,255,0.12)',
          borderWidth: 1,
          borderColor: 'rgba(0,229,255,0.3)',
        },
        style,
      ]}
    >
      <Ionicons name="person" size={iconSize} color="#00E5FF" />
    </View>
  );

  if (!hasPhoto) {
    return <View style={style}>{avatar}</View>;
  }

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        activeOpacity={0.8}
        accessibilityRole="imagebutton"
        accessibilityLabel={accessibilityLabel}
        style={style}
      >
        {avatar}
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={() => setOpen(false)}
            activeOpacity={0.85}
            hitSlop={12}
          >
            <Ionicons name="close" size={22} color="#FFF" />
          </TouchableOpacity>
          <View style={styles.frame} pointerEvents="box-none">
            <Image source={{ uri: uri! }} style={styles.fullImage} resizeMode="contain" />
            <Text style={styles.hint}>Toca fuera para cerrar</Text>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  closeBtn: {
    position: 'absolute',
    top: 52,
    right: 20,
    zIndex: 2,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  frame: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
  },
  fullImage: {
    width: '100%',
    height: Math.min(SCREEN_H * 0.65, 480),
    borderRadius: 16,
    backgroundColor: '#020D14',
  },
  hint: {
    marginTop: 14,
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    fontWeight: '600',
  },
});

export default ProfilePhotoPreview;
