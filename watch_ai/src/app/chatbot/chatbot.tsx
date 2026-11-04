
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type ScrollViewInstance,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

interface ChatMessage {
  id: string;
  text: string;
  role: 'user' | 'assistant';
}

interface ChatbotProps {
  visible: boolean;
  onClose: () => void;
  anchor: { x: number; y: number };
  userAvatarUri: string | null;
}

interface ChatbotResponse {
  success: boolean;
  question: string;
  answer: string;
  sources?: {
    question: string;
    category: string;
    similarity: number;
  }[];
}

export default function Chatbot({
  visible,
  onClose,
  anchor,
  userAvatarUri,
}: ChatbotProps) {
  const { width, height } = useWindowDimensions();

  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const scrollViewRef = useRef<ScrollViewInstance>(null);

  const API_URL = process.env.EXPO_PUBLIC_API_URL;

  const panelWidth = Math.min(Math.max(0, width - 32), 420);
  const panelHeight = Math.min(Math.max(0, height - 48), 620);

  const panelLeft = Math.max(
    16,
    Math.min(anchor.x + 62 - panelWidth, width - panelWidth - 16),
  );

  const preferredTop =
    anchor.y - panelHeight - 12 >= 16
      ? anchor.y - panelHeight - 12
      : anchor.y + 62 + 12;

  const panelTop = Math.max(
    16,
    Math.min(preferredTop, Math.max(16, height - panelHeight - 16)),
  );

  // Scroll to the latest message whenever the conversation changes.
  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages, isLoading]);

  const sendMessage = async () => {
    const text = draft.trim();

    if (!text || isLoading) return;

    if (!API_URL) {
      console.error('EXPO_PUBLIC_API_URL is missing.');

      setMessages((current) => [
        ...current,
        {
          id: `${Date.now()}-error`,
          text: 'Chatbot configuration is missing. Please contact support.',
          role: 'assistant',
        },
      ]);

      return;
    }

    // Store the conversation history before adding the current message.
    const conversationHistory = messages.map((message) => ({
      role: message.role,
      content: message.text,
    }));

    const userMessage: ChatMessage = {
      id: `${Date.now()}-user`,
      text,
      role: 'user',
    };

    setMessages((current) => [...current, userMessage]);
    setDraft('');
    setIsLoading(true);

    try {
      const response = await fetch(
        `${API_URL.replace(/\/$/, '')}/chatbot`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            question: text,
            history: conversationHistory,
          }),
        },
      );

      if (!response.ok) {
        const errorBody = await response.text();
        console.error('Chatbot API response:', errorBody);

        throw new Error(
          `Chatbot request failed with status ${response.status}`,
        );
      }

      const data: ChatbotResponse = await response.json();

      if (!data.success || !data.answer?.trim()) {
        throw new Error('The chatbot returned an empty response.');
      }

      const assistantMessage: ChatMessage = {
        id: `${Date.now()}-assistant`,
        text: data.answer.trim(),
        role: 'assistant',
      };

      setMessages((current) => [...current, assistantMessage]);

    } catch (error) {
      console.error('Chatbot error:', error);

      setMessages((current) => [
        ...current,
        {
          id: `${Date.now()}-error`,
          text: 'Sorry, I could not connect to the chatbot service. Please try again.',
          role: 'assistant',
        },
      ]);

    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close chat"
        />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'position' : undefined}
          contentContainerStyle={styles.keyboardAvoidingContent}
          style={StyleSheet.absoluteFill}
        >
          <View
            style={[
              styles.panel,
              {
                left: panelLeft,
                top: panelTop,
                width: panelWidth,
                height: panelHeight,
              },
            ]}
          >
            {/* Header */}
            <LinearGradient
              colors={['#5733A5', '#352276']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.header}
            >
              <Image
                source={require('../../../assets/images/chatbot/chatbot.png')}
                style={styles.headerAvatar}
                contentFit="contain"
                accessibilityLabel="Chatbot"
              />

              <View style={styles.headerText}>
                <Text style={styles.headerTitle}>
                  Weather assistant
                </Text>
                <Text style={styles.headerSubtitle}>
                  Chat with us
                </Text>
              </View>

              <Pressable
                style={styles.closeButton}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close chat"
                hitSlop={8}
              >
                <Text style={styles.closeButtonText}>×</Text>
              </Pressable>
            </LinearGradient>

            {/* Conversation */}
            <ScrollView
              ref={scrollViewRef}
              style={styles.conversation}
              contentContainerStyle={styles.conversationContent}
              keyboardShouldPersistTaps="handled"
              onContentSizeChange={() =>
                scrollViewRef.current?.scrollToEnd({ animated: true })
              }
            >
              {/* Welcome message */}
              <View style={[styles.messageRow, styles.assistantMessageRow]}>
                <Image
                  source={require('../../../assets/images/chatbot/chatbot.png')}
                  style={styles.messageAvatar}
                  contentFit="cover"
                  accessibilityLabel="Chatbot profile"
                />
                <View style={styles.welcomeBubble}>
                  <Text style={styles.welcomeTitle}>
                    Welcome!
                  </Text>
                  <Text style={styles.welcomeText}>
                    Hello! I&apos;m your W.A.T.C.H. weather assistant.
                    Ask me anything about the application!
                  </Text>
                </View>
              </View>

              {/* Chat messages */}
              {messages.map((message) => (
                <View
                  key={message.id}
                  style={[
                    styles.messageRow,
                    message.role === 'user'
                      ? styles.userMessageRow
                      : styles.assistantMessageRow,
                  ]}
                >
                  {message.role === 'assistant' && (
                    <Image
                      source={require('../../../assets/images/chatbot/chatbot.png')}
                      style={styles.messageAvatar}
                      contentFit="cover"
                      accessibilityLabel="Chatbot profile"
                    />
                  )}
                  <View
                    style={
                      message.role === 'user'
                        ? styles.userBubble
                        : styles.assistantBubble
                    }
                  >
                    <Text
                      style={
                        message.role === 'user'
                          ? styles.userMessage
                          : styles.assistantMessage
                      }
                    >
                      {message.text}
                    </Text>
                  </View>
                  {message.role === 'user' &&
                    (userAvatarUri ? (
                      <Image
                        source={{ uri: userAvatarUri }}
                        style={styles.messageAvatar}
                        contentFit="cover"
                        accessibilityLabel="Your profile"
                      />
                    ) : (
                      <View
                        style={[styles.messageAvatar, styles.userAvatarFallback]}
                        accessibilityLabel="Your profile"
                      >
                        <Text style={styles.userAvatarInitial}>U</Text>
                      </View>
                    ))}
                </View>
              ))}

              {/* AI loading indicator */}
              {isLoading && (
                <View style={styles.assistantMessageRow}>
                  <Image
                    source={require('../../../assets/images/chatbot/chatbot.png')}
                    style={styles.messageAvatar}
                    contentFit="cover"
                    accessibilityLabel="Chatbot profile"
                  />
                  <View style={styles.assistantBubble}>
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator
                        size="small"
                        color="#5733A5"
                      />
                      <Text style={styles.assistantMessage}>
                        Thinking...
                      </Text>
                    </View>
                  </View>
                </View>
              )}
            </ScrollView>

            {/* Message composer */}
            <View style={styles.composer}>
              <TextInput
                style={styles.input}
                value={draft}
                onChangeText={setDraft}
                placeholder="Type a message..."
                placeholderTextColor="#8A8D9A"
                returnKeyType="send"
                onSubmitEditing={sendMessage}
                blurOnSubmit={false}
                editable={!isLoading}
                accessibilityLabel="Type a chat message"
              />

              <Pressable
                style={[
                  styles.sendButton,
                  (!draft.trim() || isLoading) &&
                    styles.sendButtonDisabled,
                ]}
                onPress={sendMessage}
                disabled={!draft.trim() || isLoading}
                accessibilityRole="button"
                accessibilityLabel="Send message"
              >
                <Text style={styles.sendButtonText}>
                  Send
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(7, 9, 20, 0.56)',
  },

  keyboardAvoidingContent: {
    flex: 1,
  },

  panel: {
    position: 'absolute',
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#F6F5FA',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.24,
    shadowRadius: 24,
    elevation: 18,
  },

  header: {
    minHeight: 78,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
  },

  headerAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },

  headerText: {
    flex: 1,
    marginLeft: 12,
  },

  headerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

  headerSubtitle: {
    color: 'rgba(255,255,255,0.74)',
    fontSize: 12,
    marginTop: 3,
  },

  closeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },

  closeButtonText: {
    color: '#FFFFFF',
    fontSize: 27,
    lineHeight: 30,
    fontWeight: '300',
  },

  conversation: {
    flex: 1,
  },

  conversationContent: {
    flexGrow: 1,
    padding: 18,
    justifyContent: 'flex-end',
    gap: 12,
  },

  welcomeBubble: {
    alignSelf: 'flex-start',
    flexShrink: 1,
    maxWidth: '80%',
    padding: 14,
    borderRadius: 18,
    borderBottomLeftRadius: 5,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8E5EF',
  },

  welcomeTitle: {
    color: '#29233A',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 5,
  },

  welcomeText: {
    color: '#5D5A67',
    fontSize: 13,
    lineHeight: 19,
  },

  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },

  userMessageRow: {
    justifyContent: 'flex-end',
  },

  assistantMessageRow: {
    justifyContent: 'flex-start',
  },

  messageAvatar: {
    width: 30,
    height: 30,
    flexShrink: 0,
    borderRadius: 15,
    backgroundColor: '#E8E5EF',
  },

  userAvatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#5733A5',
  },

  userAvatarInitial: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },

  userBubble: {
    maxWidth: '80%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    borderBottomRightRadius: 5,
    backgroundColor: '#5733A5',
  },

  userMessage: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 20,
  },

  assistantBubble: {
    maxWidth: '80%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    borderBottomLeftRadius: 5,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8E5EF',
  },

  assistantMessage: {
    color: '#29233A',
    fontSize: 14,
    lineHeight: 20,
  },

  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },

  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#DCD9E5',
    backgroundColor: '#FFFFFF',
  },

  input: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 15,
    borderRadius: 22,
    backgroundColor: '#F2F1F6',
    color: '#29233A',
    fontSize: 14,
  },

  sendButton: {
    minHeight: 42,
    paddingHorizontal: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    backgroundColor: '#5733A5',
  },

  sendButtonDisabled: {
    opacity: 0.45,
  },

  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
