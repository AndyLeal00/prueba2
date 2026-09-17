import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChatMessage,
  ChatRole,
  fetchMessages,
  markChatRead,
  sendMessage as sendChatMessage,
} from '@/common/services/chatService';

const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get('window');
const SHEET_H = Math.min(SCREEN_H * 0.72, 620);
const POLL_MS = 3000;
const BUBBLE_MAX_W = Math.floor(SCREEN_W * 0.75);

const charLen = (s: string) => Array.from(String(s || '')).length;

export type FloatingChatModalProps = {
  visible: boolean;
  onClose: () => void;
  bookingId: string;
  myRole: ChatRole;
  myName: string;
  senderId?: string | null;
  otherName: string;
  otherPhoto?: string | null;
};

const FloatingChatModal: React.FC<FloatingChatModalProps> = ({
  visible,
  onClose,
  bookingId,
  myRole,
  myName,
  senderId,
  otherName,
  otherPhoto,
}) => {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState('');
  const [keyboardH, setKeyboardH] = useState(0);
  const listRef = useRef<ScrollView>(null);
  const backdrop = useRef(new Animated.Value(0)).current;
  const sheetY = useRef(new Animated.Value(SHEET_H + 40)).current;
  // IMPORTANTE: con useNativeDriver, marginBottom no mueve la vista.
  // El teclado se compensa solo con translateY.
  const keyboardLift = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useMemo(
    () => Animated.add(sheetY, keyboardLift),
    [sheetY, keyboardLift]
  );

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = (e: any) => {
      const h = Math.max(0, Number(e?.endCoordinates?.height) || 0);
      setKeyboardH(h);
      Animated.timing(keyboardLift, {
        toValue: -Math.max(h - Math.max(insets.bottom, 0), 0),
        duration: Platform.OS === 'ios' ? Math.min(Number(e?.duration) || 250, 280) : 140,
        useNativeDriver: true,
      }).start();
    };
    const onHide = () => {
      setKeyboardH(0);
      Animated.timing(keyboardLift, {
        toValue: 0,
        duration: 140,
        useNativeDriver: true,
      }).start();
    };
    const subShow = Keyboard.addListener(showEvt, onShow);
    const subHide = Keyboard.addListener(hideEvt, onHide);
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, [keyboardLift, insets.bottom]);

  useEffect(() => {
    if (!visible) {
      setKeyboardH(0);
      keyboardLift.setValue(0);
    }
  }, [visible, keyboardLift]);

  const loadMessages = useCallback(async () => {
    if (!bookingId) return;
    const data = await fetchMessages(bookingId);
    if (__DEV__) {
      data.forEach((m) => {
        console.log('[chat msg]', charLen(m.message), JSON.stringify(m.message));
      });
    }
    setMessages(data);
    setLoading(false);
    await markChatRead(bookingId, myRole);
  }, [bookingId, myRole]);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    loadMessages();
    const id = setInterval(loadMessages, POLL_MS);
    return () => clearInterval(id);
  }, [visible, loadMessages]);

  useEffect(() => {
    if (!visible) return;
    sheetY.setValue(SHEET_H + 40);
    backdrop.setValue(0);
    Animated.parallel([
      Animated.timing(backdrop, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.spring(sheetY, {
        toValue: 0,
        friction: 8,
        tension: 68,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, backdrop, sheetY]);

  useEffect(() => {
    if (messages.length > 0 && visible) {
      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated: true });
      });
    }
  }, [messages.length, visible, keyboardH]);

  const animateClose = useCallback(() => {
    Keyboard.dismiss();
    Animated.parallel([
      Animated.timing(backdrop, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(sheetY, {
        toValue: SHEET_H + 40,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) onClose();
    });
  }, [backdrop, sheetY, onClose]);

  const send = async (raw?: string) => {
    const body = (raw ?? text).trim();
    if (!body || sending || !bookingId) return;

    setSending(true);
    setText('');

    const optimistic: ChatMessage = {
      id: `local-${Date.now()}`,
      booking_id: bookingId,
      sender_id: senderId ?? null,
      sender_role: myRole,
      sender_name: myName,
      message: body,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    const saved = await sendChatMessage({
      bookingId,
      senderId,
      senderRole: myRole,
      senderName: myName,
      message: body,
    });

    if (!saved) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setText(body);
    } else {
      await loadMessages();
    }
    setSending(false);
  };

  const quickReplies =
    myRole === 'driver'
      ? [
          'Hola, buenos días.',
          'Estoy aquí.',
          'Hola, buenas tardes.',
          'Gracias.',
          'Hola, buenas noches.',
          'Estoy en camino.',
          'Llegaré en 5 minutos.',
          '¿Tardas?',
          '¡Confírmame por favor!',
          'Ya estoy en el punto a tu espera!',
        ]
      : [
          'Hola, buenos días.',
          'Gracias.',
          'Hola, buenas tardes.',
          'Hola, ¿cómo vas?',
          'Hola, buenas noches.',
          'Te espero en la entrada.',
          '¿Cuánto tiempo falta?',
          '¿Tardas?',
          '¡Confírmame por favor!',
          'En 5 minutos bajo!',
          'Ya estoy en el punto a tu espera!',
          'Por favor dame 5 minutos!',
        ];

  const renderItem = ({ item, index }: { item: ChatMessage; index: number }) => {
    const mine = item.sender_role === myRole;
    const isAdmin = (item.sender_role as string) === 'admin';
    const time = (() => {
      try {
        return new Date(item.created_at).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        });
      } catch {
        return '';
      }
    })();

    const prev = messages[index - 1];
    const showTail = !prev || prev.sender_role !== item.sender_role;
    const fullText = String(item.message ?? '');

    return (
      <View
        style={[
          styles.row,
          mine ? styles.rowMine : isAdmin ? styles.rowAdmin : styles.rowOther,
          showTail && { marginTop: 10 },
        ]}
      >
        {!mine && !isAdmin ? (
          showTail ? (
            otherPhoto ? (
              <Image source={{ uri: otherPhoto }} style={styles.msgAvatar} />
            ) : (
              <View style={styles.msgAvatarFallback}>
                <Ionicons name="person" size={12} color="#00E5FF" />
              </View>
            )
          ) : (
            <View style={styles.msgAvatarSpacer} />
          )
        ) : null}

        <View
          style={[
            styles.bubble,
            // Ancho fijo en recibidos: obliga a wrap de líneas completas
            !mine && !isAdmin ? { width: BUBBLE_MAX_W } : { maxWidth: BUBBLE_MAX_W },
            mine && styles.bubbleMine,
            isAdmin && styles.bubbleAdmin,
            !mine && !isAdmin && styles.bubbleOther,
            mine && showTail && styles.bubbleMineTail,
            !mine && !isAdmin && showTail && styles.bubbleOtherTail,
          ]}
        >
          <Text
            selectable
            style={[
              styles.bubbleText,
              mine && styles.bubbleTextLight,
              isAdmin && styles.bubbleTextAdmin,
            ]}
          >
            {fullText}
          </Text>
          {!!time && (
            <Text style={[styles.bubbleMeta, mine && styles.bubbleMetaLight, isAdmin && styles.bubbleMetaAdmin]}>
              {time}
            </Text>
          )}
        </View>
      </View>
    );
  };

  if (!visible) return null;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Pressable style={StyleSheet.absoluteFill} onPress={animateClose}>
        <Animated.View
          style={[
            styles.backdrop,
            {
              opacity: backdrop.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 0.55],
              }),
            },
          ]}
        />
      </Pressable>

      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
        pointerEvents="box-none"
      >
        <Animated.View
          style={[
            styles.sheetWrap,
            {
              height: SHEET_H + Math.max(insets.bottom, 10),
              transform: [{ translateY: sheetTranslateY }],
            },
          ]}
        >
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 10) }]}>
            <View style={styles.handleRow}>
              <View style={styles.handle} />
            </View>

            <View style={styles.header}>
              <View style={styles.headerLeft}>
                {otherPhoto ? (
                  <Image source={{ uri: otherPhoto }} style={styles.headerAvatar} />
                ) : (
                  <View style={styles.headerAvatarFallback}>
                    <Ionicons
                      name={myRole === 'driver' ? 'person' : 'car-sport'}
                      size={18}
                      color="#00E5FF"
                    />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.headerName} numberOfLines={1}>
                    {otherName}
                  </Text>
                  <View style={styles.onlineRow}>
                    <View style={styles.onlineDot} />
                    <Text style={styles.onlineText}>Chat del viaje</Text>
                  </View>
                </View>
              </View>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={animateClose}
                activeOpacity={0.8}
                hitSlop={10}
              >
                <Ionicons name="close" size={20} color="#FFF" />
              </TouchableOpacity>
            </View>

            {loading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="large" color="#00E5FF" />
              </View>
            ) : (
              <ScrollView
                ref={listRef}
                style={styles.list}
                contentContainerStyle={[
                  styles.listContent,
                  messages.length === 0 && styles.listContentEmpty,
                ]}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator
                onContentSizeChange={() => {
                  if (messages.length > 0) {
                    listRef.current?.scrollToEnd({ animated: true });
                  }
                }}
              >
                {messages.length === 0 ? (
                  <View style={styles.empty}>
                    <View style={styles.emptyIcon}>
                      <Ionicons name="chatbubbles" size={28} color="#00E5FF" />
                    </View>
                    <Text style={styles.emptyTitle}>Empieza la conversación</Text>
                    <Text style={styles.emptySub}>
                      Los mensajes de este viaje quedan guardados aquí.
                    </Text>
                  </View>
                ) : (
                  messages.map((item, index) => (
                    <View key={item.id}>{renderItem({ item, index })}</View>
                  ))
                )}
              </ScrollView>
            )}

            {/* Ocultar chips con teclado abierto para dejar espacio al input */}
            {keyboardH === 0 && (
              <View style={styles.quickWrap}>
                {quickReplies.map((msg) => (
                  <TouchableOpacity
                    key={msg}
                    style={styles.quickChip}
                    onPress={() => send(msg)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.quickChipText} numberOfLines={1}>
                      {msg}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.composer}>
              <TextInput
                style={styles.input}
                placeholder="Escribe un mensaje..."
                placeholderTextColor="rgba(255,255,255,0.35)"
                value={text}
                onChangeText={setText}
                onSubmitEditing={() => send()}
                returnKeyType="send"
                multiline
                maxLength={500}
              />
              <TouchableOpacity
                style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
                onPress={() => send()}
                disabled={!text.trim() || sending}
                activeOpacity={0.85}
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#001824" />
                ) : (
                  <Ionicons name="send" size={18} color="#001824" />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 1000,
    justifyContent: 'flex-end',
  },
  kav: {
    width: '100%',
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  sheetWrap: {
    width: '100%',
    paddingHorizontal: 10,
  },
  sheet: {
    flex: 1,
    backgroundColor: '#071821',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.28)',
    overflow: 'hidden',
    shadowColor: '#00E5FF',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -4 },
    elevation: 16,
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 2,
  },
  handle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,229,255,0.12)',
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,229,255,0.12)',
  },
  headerAvatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,229,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.35)',
  },
  headerName: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  onlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#00E676',
  },
  onlineText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '600',
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { flex: 1, minHeight: 120 },
  listContent: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 48,
    paddingHorizontal: 24,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,229,255,0.12)',
    marginBottom: 12,
  },
  emptyTitle: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
  emptySub: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 17,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginVertical: 3,
    gap: 8,
    width: '100%',
  },
  rowMine: { justifyContent: 'flex-end' },
  rowOther: { justifyContent: 'flex-start' },
  rowAdmin: { justifyContent: 'center' },
  msgAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  msgAvatarSpacer: {
    width: 28,
    height: 28,
  },
  msgAvatarFallback: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,229,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.3)',
  },
  bubble: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  bubbleMine: {
    backgroundColor: '#00E5FF',
    borderBottomRightRadius: 6,
  },
  bubbleMineTail: {
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderBottomLeftRadius: 6,
  },
  bubbleOtherTail: {
    borderBottomLeftRadius: 4,
  },
  bubbleAdmin: {
    backgroundColor: 'rgba(0,229,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.4)',
  },
  bubbleText: {
    color: '#E8F1F5',
    fontSize: 14,
    lineHeight: 20,
  },
  bubbleTextLight: {
    color: '#001824',
    fontWeight: '600',
  },
  bubbleTextAdmin: {
    color: '#E8FFFF',
    fontWeight: '600',
  },
  bubbleMeta: {
    marginTop: 4,
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    alignSelf: 'flex-end',
  },
  bubbleMetaLight: {
    color: 'rgba(0,24,36,0.55)',
  },
  bubbleMetaAdmin: {
    color: 'rgba(232,255,255,0.7)',
  },
  quickWrap: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,229,255,0.1)',
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 6,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  quickChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 13,
    backgroundColor: 'rgba(0,229,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.35)',
    minHeight: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickChipText: {
    color: '#00E5FF',
    fontSize: 11.5,
    fontWeight: '600',
    includeFontPadding: false,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 4,
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 100,
    borderRadius: 21,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 11 : 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.22)',
    color: '#FFF',
    fontSize: 14,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00E5FF',
  },
  sendBtnDisabled: {
    opacity: 0.45,
  },
});

export default FloatingChatModal;
