import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  Image,
  FlatList,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Platform,
  Keyboard,
  ActivityIndicator,
  useColorScheme,
} from 'react-native';
import { FontAwesome, Ionicons } from '@expo/vector-icons';
import { useRoute } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { RootState } from '@/common/store';
import AntDesign from 'react-native-vector-icons/AntDesign';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  fetchMessages,
  sendMessage as sendChatMessage,
  markChatRead,
  ChatMessage,
  ChatRole,
} from '@/common/services/chatService';
// Imagen del administrador para mensajes del sistema
import adminIcon from '../../assets/images/logo1024x1024.png';

type Props = NativeStackScreenProps<any>;

const POLL_INTERVAL_MS = 3000;

const ChatScreen = ({ navigation }: Props) => {
  const [newMessage, setNewMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const route = useRoute();
  const params = (route.params as any) || {};
  const { bookingId } = params;

  const user = useSelector((state: RootState) => state.auth.user) as any;
  const colorScheme = useColorScheme();
  const flatListRef = useRef<FlatList>(null);
  const styles = colorScheme === 'dark' ? darkStyles : lightStyles;

  // Rol e identidad del usuario actual. Cada pantalla de servicio sabe su rol
  // y lo pasa por params; si no, se infiere del usuario en Redux.
  const myRole: ChatRole =
    params.myRole ||
    user?.usertype ||
    user?.user_type ||
    'customer';
  const myName: string =
    params.myName ||
    [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
    user?.first_name ||
    'Usuario';
  const senderId: string | null =
    params.senderId || user?.id || user?.uid || null;
  const otherName: string = params.otherName || (myRole === 'driver' ? 'Cliente' : 'Conductor');

  // Carga inicial + polling para recibir mensajes nuevos en vivo.
  const loadMessages = useCallback(async () => {
    if (!bookingId) return;
    const data = await fetchMessages(bookingId);
    setMessages(data);
    setLoading(false);
    // Al ver el chat, reseteamos el badge de no leídos.
    await markChatRead(bookingId, myRole);
  }, [bookingId, myRole]);

  useEffect(() => {
    loadMessages();
    const interval = setInterval(loadMessages, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadMessages]);

  useEffect(() => {
    if (messages.length > 0) {
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages]);

  const sendMessage = async () => {
    const text = newMessage.trim();
    if (text === '' || sending) return;
    if (!bookingId) return;

    setSending(true);
    setNewMessage('');

    // Optimista: mostramos el mensaje de inmediato.
    const optimistic: ChatMessage = {
      id: `local-${Date.now()}`,
      booking_id: bookingId,
      sender_id: senderId,
      sender_role: myRole,
      sender_name: myName,
      message: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    const saved = await sendChatMessage({
      bookingId,
      senderId,
      senderRole: myRole,
      senderName: myName,
      message: text,
    });

    if (!saved) {
      // Falló el envío: revertimos el optimista y restauramos el texto.
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setNewMessage(text);
    } else {
      // Reemplazamos el optimista por la fila real (refresco inmediato).
      await loadMessages();
    }
    setSending(false);
  };

  const renderItem = ({ item }: { item: ChatMessage }) => {
    const isCurrentUser = item.sender_role === myRole;
    const isAdminMessage = (item.sender_role as string) === 'admin';

    const messageAlignment = isCurrentUser
      ? 'flex-end'
      : isAdminMessage
      ? 'center'
      : 'flex-start';

    const messageBackgroundColor = isCurrentUser
      ? '#E91E63'
      : isAdminMessage
      ? '#00f4f5'
      : '#E5E5EA';

    const messageTextColor = isCurrentUser || isAdminMessage ? '#fff' : '#000';

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

    return (
      <View
        style={{
          flexDirection: 'row',
          justifyContent: messageAlignment,
          marginVertical: 5,
        }}
      >
        <View
          style={{
            backgroundColor: messageBackgroundColor,
            padding: 10,
            borderRadius: 10,
            maxWidth: '70%',
          }}
        >
          {isAdminMessage && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginBottom: 5,
              }}
            >
              <Image
                source={adminIcon}
                style={{ width: 20, height: 20, marginRight: 5, borderRadius: 9999 }}
              />
              <Text style={{ color: messageTextColor, fontWeight: 'bold' }}>
                T+Plus Admin
              </Text>
            </View>
          )}

          <Text style={{ color: messageTextColor }}>{item.message}</Text>

          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              marginTop: 5,
            }}
          >
            <Text style={{ color: messageTextColor, fontSize: 12 }}>
              {isCurrentUser
                ? 'Tú'
                : isAdminMessage
                ? 'Admin'
                : item.sender_name || otherName}{' '}
              {time}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  // Mensajes predefinidos según el rol del usuario
  const predefinedMessages =
    myRole === 'driver'
      ? [
          'Estoy en camino.',
          'Llegaré en 5 minutos.',
          'Estoy aquí.',
          'Gracias por tu paciencia.',
          '¿Puedes darme más detalles?',
        ]
      : [
          'Hola, ¿cómo vas?',
          'Te espero en la entrada.',
          '¿Cuánto tiempo falta?',
          'Gracias.',
          '¿Puedes darme más detalles?',
        ];

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
      keyboardVerticalOffset={90}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={{ flex: 1, backgroundColor: colorScheme === 'dark' ? '#000' : '#fff' }}>
          <View
            style={{
              height: 60,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 15,
              borderBottomWidth: 1,
              borderBottomColor: '#ddd',
            }}
          >
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <AntDesign
                name="arrow-left"
                size={24}
                color={colorScheme === 'dark' ? '#fff' : '#000'}
              />
            </TouchableOpacity>
            <Text
              style={{
                fontSize: 18,
                fontWeight: 'bold',
                color: colorScheme === 'dark' ? '#fff' : '#000',
              }}
            >
              {otherName}
            </Text>
            <View style={{ width: 24 }} />
          </View>

          {loading ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <ActivityIndicator size="large" color="#00f4f5" />
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              contentContainerStyle={{ padding: 15, flexGrow: 1 }}
              style={{ flex: 1 }}
              ListEmptyComponent={
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 }}>
                  <Ionicons name="chatbubbles-outline" size={48} color="#bbb" />
                  <Text style={{ color: '#999', marginTop: 10, textAlign: 'center' }}>
                    Aún no hay mensajes.{'\n'}Escribe para iniciar la conversación.
                  </Text>
                </View>
              }
            />
          )}

          <View style={{ borderTopWidth: 1, borderTopColor: '#ddd' }}>
            {predefinedMessages.length > 0 && (
              <ScrollView
                horizontal={true}
                showsHorizontalScrollIndicator={false}
                style={{ paddingHorizontal: 15, paddingVertical: 0 }}
                contentContainerStyle={{ alignItems: 'center' }}
              >
                {predefinedMessages.map((msg, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.predefinedButton}
                    onPress={() => setNewMessage(msg)}
                  >
                    <Text style={styles.predefinedText} numberOfLines={1}>
                      {msg}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 15,
                paddingVertical: 5,
              }}
            >
              <TextInput
                style={styles.input}
                placeholder="Empieza a escribir..."
                placeholderTextColor={colorScheme === 'dark' ? '#888' : '#aaa'}
                value={newMessage}
                onChangeText={setNewMessage}
                onSubmitEditing={sendMessage}
                returnKeyType="send"
              />
              <TouchableOpacity onPress={sendMessage} disabled={sending}>
                {sending ? (
                  <ActivityIndicator size="small" color="#00f4f5" />
                ) : (
                  <FontAwesome name="send" size={24} color="#00f4f5" />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
};

const lightStyles = StyleSheet.create({
  predefinedButton: {
    backgroundColor: '#E0F7FA',
    paddingVertical: 5,
    paddingHorizontal: 15,
    borderRadius: 15,
    marginRight: 10,
    maxWidth: 200,
    maxHeight: 40,
    justifyContent: 'center',
    marginTop: 10,
  },
  predefinedText: {
    color: '#000',
    fontSize: 14,
    flexShrink: 1,
    flexWrap: 'nowrap',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 25,
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginRight: 10,
    backgroundColor: '#f9f9f9',
  },
});

const darkStyles = StyleSheet.create({
  predefinedButton: {
    backgroundColor: '#333',
    paddingVertical: 5,
    paddingHorizontal: 15,
    borderRadius: 15,
    marginRight: 10,
    maxWidth: 200,
    maxHeight: 40,
    justifyContent: 'center',
    marginTop: 10,
  },
  predefinedText: {
    color: '#fff',
    fontSize: 14,
    flexShrink: 1,
    flexWrap: 'nowrap',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#555',
    borderRadius: 25,
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginRight: 10,
    backgroundColor: '#222',
    color: '#fff',
  },
});

export default ChatScreen;
