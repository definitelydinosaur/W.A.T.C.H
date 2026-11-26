
import { useEffect, useRef, useState } from 'react';
import { profileApi } from '@/lib/profile-api';

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

// ==========================================
// TYPES
// ==========================================

interface ChatMessage {
  id: string;
  text: string;
  role: 'user' | 'assistant';
}

type ReportCategory = 'bug' | 'feedback' | 'suggestion';

type ReportStep =
  | 'idle'
  | 'conversation'
  | 'review';

interface ReportDraft {
  category: ReportCategory | null;
  details: string;
  title: string;
  body: string;
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

interface ReportAnalysisResponse {
  status: 'valid' | 'needs_more_info' | 'out_of_scope';
  category: ReportCategory | null;
  title: string | null;
  description: string | null;
  affected_feature: string | null;
  follow_up_question: string | null;
  reason: string | null;
}

// ==========================================
// COMPONENT
// ==========================================

export default function Chatbot({
  visible,
  onClose,
  anchor,
  userAvatarUri,
}: ChatbotProps) {
  const { width, height } = useWindowDimensions();

  const [reportStep, setReportStep] = useState<ReportStep>('idle');

  const [reportDraft, setReportDraft] = useState<ReportDraft>({
    category: null,
    details: '',
    title: '',
    body: '',
  });

  const [reportHistory, setReportHistory] = useState<ChatMessage[]>([]);

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

  // ==========================================
  // HELPERS
  // ==========================================

  const addUserMessage = (message: string) => {
    setMessages((current) => [
      ...current,
      {
        id: `${Date.now()}-user`,
        text: message,
        role: 'user',
      },
    ]);
  };

  const addAssistantMessage = (message: string) => {
    setMessages((current) => [
      ...current,
      {
        id: `${Date.now()}-assistant`,
        text: message,
        role: 'assistant',
      },
    ]);
  };

  const resetReport = () => {
    setReportStep('idle');

    setReportDraft({
      category: null,
      details: '',
      title: '',
      body: '',
    });

    setReportHistory([]);
  };

  const categoryLabels: Record<ReportCategory, string> = {
    bug: 'Bug Report',
    feedback: 'User Feedback',
    suggestion: 'Feature Suggestion',
  };

  // Scroll to the latest message whenever the conversation changes.
  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages, isLoading]);

  // ==========================================
  // SEND MESSAGE
  // ==========================================

  

const sendMessage = async () => {
  const text = draft.trim();

  if (!text || isLoading) return;

  const normalized = text.toLowerCase().trim();

  // ========================================
  // REPORT REVIEW
  // ========================================

  if (reportStep === 'review') {
    addUserMessage(text);
    setDraft('');

    // CANCEL REPORT
    if (/\b(cancel|discard|stop|never mind)\b/.test(normalized)) {
      resetReport();

      addAssistantMessage(
        'Your report has been cancelled. You can still ask me questions about W.A.T.C.H. or start a new report anytime.',
      );

      return;
    }

    // EDIT REPORT
    if (/\b(edit|change|revise|modify)\b/.test(normalized)) {
      setReportStep('conversation');

      const assistantPrompt =
        'Sure! Please describe the changes you would like to make to your report. I will review the updated information.';

      setReportHistory((current) => [
        ...current,
        {
          id: `${Date.now()}-assistant`,
          text: assistantPrompt,
          role: 'assistant',
        },
      ]);

      addAssistantMessage(assistantPrompt);
      return;
    }

    // CONFIRM REPORT
    if (/^(confirm|submit|yes|send|confirm report|submit report)[.! ]*$/i.test(normalized)) {
      setIsLoading(true);

      try {
        await profileApi('/reports', {
          method: 'POST',
          body: JSON.stringify({
            title: reportDraft.title,
            body: reportDraft.body,
          }),
        });

        // Success is shown ONLY after the backend accepts submission.
        addAssistantMessage(
          'Your report has been successfully submitted! Thank you for helping us improve W.A.T.C.H. The development team has been notified.',
        );

        resetReport();
      } catch (error) {
        console.error('Report submission failed:', error);

        addAssistantMessage(
          error instanceof Error
            ? `I couldn't submit your report: ${error.message}\n\nYour report draft is still saved. Reply CONFIRM to try again or CANCEL to discard it.`
            : 'I could not submit your report. Your draft is still saved. Please reply CONFIRM to retry.',
        );
      } finally {
        setIsLoading(false);
      }

      return;
    }

    addAssistantMessage(
      'Please reply CONFIRM to submit your report, EDIT to revise it, or CANCEL to discard it.',
    );

    return;
  }

  // ========================================
  // DETECT REPORT INTENT / APP PROBLEMS
  // ========================================

  if (reportStep === 'idle') {
    const explicitReportIntent =
      /\b(report|reporting|submit a report|send a report|file a report|make a report|give feedback|send feedback|suggestion)\b/i.test(
        text,
      );

    const appFeatureMention =
      /\b(app|application|profile|profile page|alert|alert page|dashboard|announcement|announcements|login|log in|sign in|registration|register|map|weather|notification|notifications|settings|chatbot|account|home page)\b/i.test(
        text,
      );

   const problemMention =
  /\b(can't|cant|cannot|couldn't|couldnt|unable to|not working|doesn't work|does not work|isn't working|is not working|won't load|will not load|not loading|doesn't load|does not load|blank|empty|broken|crashing|crashes|error|problem|issue|stuck|failed|failing|keeps loading|just loading|loading screen|can't access|cant access|cannot access|unable to access|can't seem to access|cant seem to access|unable to open|can't open|cant open)\b/i.test(
    text,
  );

    const isAppProblem = appFeatureMention && problemMention;
    const wantsToReport = explicitReportIntent || isAppProblem;

    if (wantsToReport) {
      addUserMessage(text);
      setDraft('');

      const assistantPrompt =
        'Of course! I can help you submit a report to the W.A.T.C.H. development team.\n\nPlease describe your concern. You can report bugs, share feedback, or suggest improvements. I will analyze your concern and ask for additional details if needed.';

      setReportDraft({
        category: null,
        details: '',
        title: '',
        body: '',
      });

      setReportHistory([
        {
          id: `${Date.now()}-assistant`,
          text: assistantPrompt,
          role: 'assistant',
        },
      ]);

      setReportStep('conversation');

   
      if (explicitReportIntent) {
        addAssistantMessage(assistantPrompt);
        return;
      }

    
      addAssistantMessage(
        'I can help you report this issue. Let me analyze the details you provided.',
      );

      if (!API_URL) {
        addAssistantMessage(
          'The reporting assistant is currently unavailable. Please try again later.',
        );
        return;
      }

      setIsLoading(true);

      try {
        const response = await fetch(
          `${API_URL.replace(/\/+$/, '')}/chatbot/analyze-report`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              message: text,
              history: [
                {
                  role: 'assistant',
                  content: assistantPrompt,
                },
              ],
            }),
          },
        );

        if (!response.ok) {
          throw new Error(
            `Report analysis failed with status ${response.status}`,
          );
        }

        const data: ReportAnalysisResponse = await response.json();

        if (
          !data.status ||
          !['valid', 'needs_more_info', 'out_of_scope'].includes(
            data.status,
          )
        ) {
          throw new Error('Invalid report analysis response.');
        }

        // NEEDS MORE INFORMATION
        if (data.status === 'needs_more_info') {
          const followUp =
            data.follow_up_question ||
            'Could you provide more details about your concern?';

          setReportHistory((current) => [
            ...current,
            {
              id: `${Date.now()}-user`,
              text,
              role: 'user',
            },
            {
              id: `${Date.now()}-assistant`,
              text: followUp,
              role: 'assistant',
            },
          ]);

          addAssistantMessage(followUp);
          return;
        }

        // OUT OF SCOPE
        if (data.status === 'out_of_scope') {
          const reason =
            data.reason ||
            'This concern does not appear to be related to the W.A.T.C.H. application.';

          addAssistantMessage(
            `${reason}\n\nI can only help submit reports related to W.A.T.C.H. features and services. You can still ask me questions about the application.`,
          );

          resetReport();
          return;
        }

        // VALID REPORT
        const validCategories = ['bug', 'feedback', 'suggestion'];

        if (
          !data.title?.trim() ||
          !data.description?.trim() ||
          !data.category ||
          !validCategories.includes(data.category)
        ) {
          throw new Error(
            'The AI could not generate a complete report. Please try again.',
          );
        }

        const categoryLabel = categoryLabels[data.category];

        const reportBody = [
          `Category: ${categoryLabel}`,
          data.affected_feature
            ? `Affected feature: ${data.affected_feature}`
            : null,
          '',
          'Description:',
          data.description.trim(),
        ]
          .filter((line) => line !== null)
          .join('\n');

        const reportPreview = [
          'Your report is ready for review!',
          '',
          `Title: ${data.title.trim()}`,
          `Category: ${categoryLabel}`,
          data.affected_feature
            ? `Affected feature: ${data.affected_feature}`
            : null,
          '',
          'Description:',
          data.description.trim(),
          '',
          'Would you like to submit this report?',
          '',
          'Reply CONFIRM to submit, EDIT to revise it, or CANCEL to discard it.',
        ]
          .filter((line) => line !== null)
          .join('\n');

        setReportDraft({
          category: data.category,
          details: text,
          title: data.title.trim(),
          body: reportBody,
        });

        setReportHistory((current) => [
          ...current,
          {
            id: `${Date.now()}-user`,
            text,
            role: 'user',
          },
          {
            id: `${Date.now()}-assistant`,
            text: reportPreview,
            role: 'assistant',
          },
        ]);

        setReportStep('review');
        addAssistantMessage(reportPreview);
      } catch (error) {
        console.error('Report analysis failed:', error);

        addAssistantMessage(
          error instanceof Error
            ? `Sorry, I could not analyze your concern: ${error.message}. Please try again.`
            : 'Sorry, I could not analyze your concern. Please try again.',
        );
      } finally {
        setIsLoading(false);
      }

      return;
    }
  }

  // ========================================
  // AI REPORT ANALYST CONVERSATION
  // ========================================

  if (reportStep === 'conversation') {
    if (!API_URL) {
      addUserMessage(text);
      setDraft('');

      addAssistantMessage(
        'The reporting assistant is currently unavailable. Please try again later.',
      );

      return;
    }

    addUserMessage(text);
    setDraft('');
    setIsLoading(true);

    try {
      const conversationHistory = reportHistory.map((message) => ({
        role: message.role,
        content: message.text,
      }));

      const response = await fetch(
        `${API_URL.replace(/\/+$/, '')}/chatbot/analyze-report`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: text,
            history: conversationHistory,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(
          `Report analysis failed with status ${response.status}`,
        );
      }

      const data: ReportAnalysisResponse = await response.json();

      if (
        !data.status ||
        !['valid', 'needs_more_info', 'out_of_scope'].includes(
          data.status,
        )
      ) {
        throw new Error('Invalid report analysis response.');
      }

      // NEEDS MORE INFORMATION
      if (data.status === 'needs_more_info') {
        const followUp =
          data.follow_up_question ||
          'Could you provide more details about your concern?';

        setReportHistory((current) => [
          ...current,
          {
            id: `${Date.now()}-user`,
            text,
            role: 'user',
          },
          {
            id: `${Date.now()}-assistant`,
            text: followUp,
            role: 'assistant',
          },
        ]);

        addAssistantMessage(followUp);
        return;
      }

      // OUT OF SCOPE
      if (data.status === 'out_of_scope') {
        const reason =
          data.reason ||
          'This concern does not appear to be related to the W.A.T.C.H. application.';

        addAssistantMessage(
          `${reason}\n\nI can only help submit reports related to W.A.T.C.H. features and services. You can still ask me questions about the application.`,
        );

        resetReport();
        return;
      }

      // VALID REPORT
      const validCategories = ['bug', 'feedback', 'suggestion'];

      if (
        !data.title?.trim() ||
        !data.description?.trim() ||
        !data.category ||
        !validCategories.includes(data.category)
      ) {
        throw new Error(
          'The AI could not generate a complete report. Please try again.',
        );
      }

      const categoryLabel = categoryLabels[data.category];

      const reportBody = [
        `Category: ${categoryLabel}`,
        data.affected_feature
          ? `Affected feature: ${data.affected_feature}`
          : null,
        '',
        'Description:',
        data.description.trim(),
      ]
        .filter((line) => line !== null)
        .join('\n');

      const reportPreview = [
        'Your report is ready for review!',
        '',
        `Title: ${data.title.trim()}`,
        `Category: ${categoryLabel}`,
        data.affected_feature
          ? `Affected feature: ${data.affected_feature}`
          : null,
        '',
        'Description:',
        data.description.trim(),
        '',
        'Would you like to submit this report?',
        '',
        'Reply CONFIRM to submit, EDIT to revise it, or CANCEL to discard it.',
      ]
        .filter((line) => line !== null)
        .join('\n');

      setReportDraft({
        category: data.category,
        details: text,
        title: data.title.trim(),
        body: reportBody,
      });

      setReportHistory((current) => [
        ...current,
        {
          id: `${Date.now()}-user`,
          text,
          role: 'user',
        },
        {
          id: `${Date.now()}-assistant`,
          text: reportPreview,
          role: 'assistant',
        },
      ]);

      setReportStep('review');
      addAssistantMessage(reportPreview);
      return;
    } catch (error) {
      console.error('Report analysis failed:', error);

      addAssistantMessage(
        error instanceof Error
          ? `Sorry, I could not analyze your report: ${error.message}. Please try again.`
          : 'Sorry, I could not analyze your report. Please try again.',
      );
    } finally {
      setIsLoading(false);
    }

    return;
  }

  // ========================================
  // NORMAL RAG CHATBOT
  // ========================================

  if (!API_URL) {
    addUserMessage(text);
    setDraft('');

    addAssistantMessage(
      'The chatbot is currently unavailable. Try again later.',
    );

    return;
  }

  const conversationHistory = messages.map((message) => ({
    role: message.role,
    content: message.text,
  }));

  addUserMessage(text);
  setDraft('');
  setIsLoading(true);

  try {
    const response = await fetch(
      `${API_URL.replace(/\/+$/, '')}/chatbot`,
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
  const errorText = await response.text();

  console.error("Chatbot API Error:", {
    status: response.status,
    statusText: response.statusText,
    body: errorText,
  });

  throw new Error(
    `Chatbot request failed: ${response.status} - ${errorText}`,
  );
}

    const data: ChatbotResponse = await response.json();

    if (!data.success || !data.answer?.trim()) {
      throw new Error('The chatbot returned an empty response.');
    }

    addAssistantMessage(data.answer.trim());
  } catch (error) {
    console.error('Chatbot request failed:', error);

    const errorMessage =
      error instanceof Error &&
      error.message.includes('status 503')
        ? 'The chatbot is currently unavailable. Try again later.'
        : 'Sorry, I could not connect to the chatbot service. Please try again.';

    addAssistantMessage(errorMessage);
  } finally {
    setIsLoading(false);
  }
};

  // ==========================================
  // UI
  // ==========================================

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
            {/* HEADER */}

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

            {/* CONVERSATION */}

            <ScrollView
              ref={scrollViewRef}
              style={styles.conversation}
              contentContainerStyle={styles.conversationContent}
              keyboardShouldPersistTaps="handled"
              onContentSizeChange={() =>
                scrollViewRef.current?.scrollToEnd({ animated: true })
              }
            >
              {/* WELCOME MESSAGE */}

              <View
                style={[
                  styles.messageRow,
                  styles.assistantMessageRow,
                ]}
              >
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
                    Hello! I'm your W.A.T.C.H. weather assistant.
                    Ask me anything about the application!
                  </Text>
                </View>
              </View>

              {/* CHAT MESSAGES */}

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
                        style={[
                          styles.messageAvatar,
                          styles.userAvatarFallback,
                        ]}
                        accessibilityLabel="Your profile"
                      >
                        <Text style={styles.userAvatarInitial}>
                          U
                        </Text>
                      </View>
                    ))}
                </View>
              ))}

              {/* AI LOADING INDICATOR */}

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

            {/* MESSAGE COMPOSER */}

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

// ==========================================
// STYLES
// ==========================================

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
