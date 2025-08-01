import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import CustomAlert from '../components/CustomAlert';

interface Message {
    id: string;
    senderId: string;
    senderName: string;
    receiverId: string;
    receiverName: string;
    content: string;
    timestamp: string;
    read: boolean;
    edited?: boolean;
    editedAt?: string;
}

export default function ConversationScreen() {
    const params = useLocalSearchParams();
    const otherUserId = params.otherUserId as string;
    const otherUserName = params.otherUserName as string;
    const otherUserRole = params.otherUserRole as string;
    const courseName = params.courseName as string;

    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [userData, setUserData] = useState<any>(null);
    const scrollViewRef = useRef<ScrollView>(null);

    // Edit and delete functionality
    const [editingMessage, setEditingMessage] = useState<Message | null>(null);
    const [editText, setEditText] = useState('');
    const [showEditModal, setShowEditModal] = useState(false);
    const [showActionSheet, setShowActionSheet] = useState(false);
    const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
    const [alertConfig, setAlertConfig] = useState<any>(null);

    useEffect(() => {
        loadUserAndMessages();
    }, [otherUserId]);

    const loadUserAndMessages = async () => {
        try {
            const user = auth().currentUser;
            if (!user) return;

            const userDoc = await firestore().collection('users').doc(user.uid).get();
            if (userDoc.exists()) {
                setUserData(userDoc.data());
            }

            await loadMessages(user.uid);
        } catch (error) {
            console.error('Error loading user data:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadMessages = async (userId: string) => {
        try {
            // Get messages between the two users
            const messagesQuery = await firestore()
                .collection('messages')
                .where('senderId', 'in', [userId, otherUserId])
                .where('receiverId', 'in', [userId, otherUserId])
                .orderBy('timestamp', 'asc')
                .get();

            const messagesList: Message[] = [];

            for (const messageDoc of messagesQuery.docs) {
                const messageData = messageDoc.data();

                // Only include messages between these two users
                if ((messageData.senderId === userId && messageData.receiverId === otherUserId) ||
                    (messageData.senderId === otherUserId && messageData.receiverId === userId)) {

                    messagesList.push({
                        id: messageDoc.id,
                        senderId: messageData.senderId,
                        senderName: messageData.senderName,
                        receiverId: messageData.receiverId,
                        receiverName: messageData.receiverName,
                        content: messageData.content,
                        timestamp: messageData.timestamp,
                        read: messageData.read || false,
                        edited: messageData.edited || false,
                        editedAt: messageData.editedAt || undefined
                    });

                    // Mark received messages as read
                    if (messageData.receiverId === userId && !messageData.read) {
                        try {
                            await firestore().collection('messages').doc(messageDoc.id).update({
                                read: true
                            });
                        } catch (error) {
                            console.error('Error marking message as read:', error);
                        }
                    }
                }
            }

            setMessages(messagesList);

            // Scroll to bottom after messages load
            setTimeout(() => {
                scrollViewRef.current?.scrollToEnd({ animated: true });
            }, 100);
        } catch (error) {
            console.error('Error loading messages:', error);
        }
    };

    const handleSendMessage = async () => {
        if (!newMessage.trim() || !userData) return;

        try {
            setSending(true);
            const user = auth().currentUser;
            if (!user) return;

            const messageData = {
                senderId: user.uid,
                senderName: userData.name || 'Unknown',
                receiverId: otherUserId,
                receiverName: otherUserName,
                content: newMessage.trim(),
                timestamp: new Date().toISOString(),
                read: false
            };

            await firestore().collection('messages').add(messageData);

            // Add message to local state
            const newMessageObj: Message = {
                id: Date.now().toString(), // Temporary ID
                ...messageData
            };

            setMessages(prev => [...prev, newMessageObj]);
            setNewMessage('');

            // Scroll to bottom
            setTimeout(() => {
                scrollViewRef.current?.scrollToEnd({ animated: true });
            }, 100);
        } catch (error) {
            console.error('Error sending message:', error);
            setAlertConfig({
                visible: true,
                title: 'Error',
                message: 'Failed to send message. Please try again.',
                type: 'error',
                actions: [
                    {
                        text: 'OK',
                        onPress: () => setAlertConfig(null),
                        style: 'primary',
                    },
                ],
            });
        } finally {
            setSending(false);
        }
    };

    const formatTimestamp = (timestamp: string) => {
        const date = new Date(timestamp);
        return date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    };

    // Edit and delete functionality
    const handleLongPress = (message: Message) => {
        const currentUser = auth().currentUser;
        if (!currentUser || message.senderId !== currentUser.uid) return;

        setSelectedMessage(message);
        setShowActionSheet(true);
    };

    const handleEditMessage = () => {
        if (!selectedMessage) return;

        setEditingMessage(selectedMessage);
        setEditText(selectedMessage.content);
        setShowEditModal(true);
        setShowActionSheet(false);
    };

    const handleDeleteMessage = () => {
        if (!selectedMessage) return;

        setAlertConfig({
            visible: true,
            title: 'Delete Message',
            message: 'Are you sure you want to delete this message?',
            type: 'confirm',
            actions: [
                {
                    text: 'Cancel',
                    onPress: () => setAlertConfig(null),
                    style: 'cancel',
                },
                {
                    text: 'Delete',
                    onPress: async () => {
                        try {
                            await firestore().collection('messages').doc(selectedMessage.id).delete();
                            setShowActionSheet(false);
                            setSelectedMessage(null);
                            setAlertConfig(null);
                        } catch (error) {
                            console.error('Error deleting message:', error);
                            setAlertConfig({
                                visible: true,
                                title: 'Error',
                                message: 'Failed to delete message. Please try again.',
                                type: 'error',
                                actions: [
                                    {
                                        text: 'OK',
                                        onPress: () => setAlertConfig(null),
                                        style: 'primary',
                                    },
                                ],
                            });
                        }
                    },
                    style: 'destructive',
                },
            ],
        });
    };

    const handleSaveEdit = async () => {
        if (!editingMessage || !editText.trim()) return;

        try {
            await firestore().collection('messages').doc(editingMessage.id).update({
                content: editText.trim(),
                edited: true,
                editedAt: new Date().toISOString()
            });

            setShowEditModal(false);
            setEditingMessage(null);
            setEditText('');
        } catch (error) {
            console.error('Error editing message:', error);
            setAlertConfig({
                visible: true,
                title: 'Error',
                message: 'Failed to edit message. Please try again.',
                type: 'error',
                actions: [
                    {
                        text: 'OK',
                        onPress: () => setAlertConfig(null),
                        style: 'primary',
                    },
                ],
            });
        }
    };

    const handleCancelEdit = () => {
        setShowEditModal(false);
        setEditingMessage(null);
        setEditText('');
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <LinearGradient
                    colors={['#4f46e5', '#3730a3']}
                    style={styles.header}
                >
                    <View style={styles.headerContent}>
                        <TouchableOpacity
                            style={styles.backButton}
                            onPress={() => router.back()}
                        >
                            <Ionicons name="arrow-back" size={24} color="#fff" />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>{otherUserName}</Text>
                        <View style={styles.headerSpacer} />
                    </View>
                </LinearGradient>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#4f46e5" />
                    <Text style={styles.loadingText}>Loading conversation...</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <LinearGradient
                colors={['#4f46e5', '#3730a3']}
                style={styles.header}
            >
                <View style={styles.headerContent}>
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={() => router.back()}
                    >
                        <Ionicons name="arrow-back" size={24} color="#fff" />
                    </TouchableOpacity>
                    <View style={styles.headerInfo}>
                        <Text style={styles.headerTitle}>{otherUserName}</Text>
                        <Text style={styles.headerSubtitle}>
                            {otherUserRole === 'teacher' ? 'Teacher' : 'Student'}
                        </Text>
                    </View>
                    <View style={styles.headerSpacer} />
                </View>
            </LinearGradient>

            <KeyboardAvoidingView
                style={styles.keyboardAvoidingView}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <ScrollView
                    ref={scrollViewRef}
                    style={styles.messagesContainer}
                    contentContainerStyle={styles.messagesContent}
                    showsVerticalScrollIndicator={false}
                >
                    {messages.map((message) => {
                        const isOwnMessage = message.senderId === auth().currentUser?.uid;
                        return (
                            <TouchableOpacity
                                key={message.id}
                                style={[
                                    styles.messageContainer,
                                    isOwnMessage ? styles.ownMessage : styles.otherMessage
                                ]}
                                onLongPress={() => handleLongPress(message)}
                                activeOpacity={0.8}
                            >
                                <View
                                    style={[
                                        styles.messageBubble,
                                        isOwnMessage ? styles.ownBubble : styles.otherBubble
                                    ]}
                                >
                                    <Text
                                        style={[
                                            styles.messageText,
                                            isOwnMessage ? styles.ownMessageText : styles.otherMessageText
                                        ]}
                                    >
                                        {message.content}
                                    </Text>
                                    <View style={styles.messageFooter}>
                                        <Text
                                            style={[
                                                styles.messageTime,
                                                isOwnMessage ? styles.ownMessageTime : styles.otherMessageTime
                                            ]}
                                        >
                                            {formatTimestamp(message.timestamp)}
                                        </Text>
                                        {message.edited && (
                                            <Text style={styles.editedIndicator}>
                                                (edited)
                                            </Text>
                                        )}
                                    </View>
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>

                <View style={styles.inputContainer}>
                    <TextInput
                        style={styles.textInput}
                        value={newMessage}
                        onChangeText={setNewMessage}
                        placeholder="Type a message..."
                        placeholderTextColor="#94a3b8"
                        multiline
                        maxLength={1000}
                    />
                    <TouchableOpacity
                        style={[
                            styles.sendButton,
                            (!newMessage.trim() || sending) && styles.sendButtonDisabled
                        ]}
                        onPress={handleSendMessage}
                        disabled={!newMessage.trim() || sending}
                    >
                        {sending ? (
                            <ActivityIndicator size="small" color="#fff" />
                        ) : (
                            <Ionicons name="send" size={20} color="#fff" />
                        )}
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>

            {/* Action Sheet for Edit/Delete */}
            {showActionSheet && selectedMessage && (
                <View style={styles.actionSheetOverlay}>
                    <TouchableOpacity
                        style={styles.actionSheetBackground}
                        onPress={() => setShowActionSheet(false)}
                    />
                    <View style={styles.actionSheet}>
                        <TouchableOpacity
                            style={styles.actionButton}
                            onPress={handleEditMessage}
                        >
                            <Ionicons name="create-outline" size={20} color="#4f46e5" />
                            <Text style={styles.actionButtonText}>Edit Message</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.actionButton, styles.deleteButton]}
                            onPress={handleDeleteMessage}
                        >
                            <Ionicons name="trash-outline" size={20} color="#ef4444" />
                            <Text style={[styles.actionButtonText, styles.deleteButtonText]}>Delete Message</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.cancelButton}
                            onPress={() => setShowActionSheet(false)}
                        >
                            <Text style={styles.cancelButtonText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            {/* Edit Modal */}
            <Modal
                visible={showEditModal}
                transparent={true}
                animationType="slide"
                onRequestClose={handleCancelEdit}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Edit Message</Text>
                        <TextInput
                            style={styles.editTextInput}
                            value={editText}
                            onChangeText={setEditText}
                            placeholder="Edit your message..."
                            placeholderTextColor="#94a3b8"
                            multiline
                            maxLength={1000}
                            autoFocus
                        />
                        <View style={styles.modalButtons}>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.cancelModalButton]}
                                onPress={handleCancelEdit}
                            >
                                <Text style={styles.cancelModalButtonText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.saveModalButton]}
                                onPress={handleSaveEdit}
                                disabled={!editText.trim()}
                            >
                                <Text style={styles.saveModalButtonText}>Save</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            <CustomAlert
                visible={alertConfig?.visible || false}
                title={alertConfig?.title || ''}
                message={alertConfig?.message || ''}
                type={alertConfig?.type || 'info'}
                actions={alertConfig?.actions || []}
                onDismiss={() => setAlertConfig(null)}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8fafc',
    },
    header: {
        paddingTop: 0,
        paddingBottom: 20,
        paddingHorizontal: 20,
    },
    headerContent: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 10,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    headerInfo: {
        flex: 1,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 2,
    },
    headerSubtitle: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.8)',
    },
    headerSpacer: {
        width: 40,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 16,
        fontSize: 16,
        color: '#64748b',
        fontWeight: '500',
    },
    keyboardAvoidingView: {
        flex: 1,
    },
    messagesContainer: {
        flex: 1,
    },
    messagesContent: {
        paddingHorizontal: 16,
        paddingVertical: 16,
    },
    messageContainer: {
        marginBottom: 12,
    },
    ownMessage: {
        alignItems: 'flex-end',
    },
    otherMessage: {
        alignItems: 'flex-start',
    },
    messageBubble: {
        maxWidth: '80%',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 20,
    },
    ownBubble: {
        backgroundColor: '#4f46e5',
        borderBottomRightRadius: 4,
    },
    otherBubble: {
        backgroundColor: '#e2e8f0',
        borderBottomLeftRadius: 4,
    },
    messageText: {
        fontSize: 16,
        lineHeight: 22,
        marginBottom: 4,
    },
    ownMessageText: {
        color: '#fff',
    },
    otherMessageText: {
        color: '#1a202c',
    },
    messageTime: {
        fontSize: 12,
        alignSelf: 'flex-end',
    },
    ownMessageTime: {
        color: 'rgba(255, 255, 255, 0.7)',
    },
    otherMessageTime: {
        color: '#94a3b8',
    },
    editedIndicator: {
        fontSize: 12,
        color: '#94a3b8',
        marginLeft: 4,
    },
    messageFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: '#fff',
        borderTopWidth: 1,
        borderTopColor: '#e2e8f0',
    },
    textInput: {
        flex: 1,
        backgroundColor: '#f1f5f9',
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 12,
        marginRight: 12,
        fontSize: 16,
        maxHeight: 100,
        minHeight: 44,
    },
    sendButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#4f46e5',
        justifyContent: 'center',
        alignItems: 'center',
    },
    sendButtonDisabled: {
        backgroundColor: '#cbd5e0',
    },
    actionSheetOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    actionSheetBackground: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    actionSheet: {
        backgroundColor: '#fff',
        borderRadius: 10,
        padding: 15,
        width: '80%',
        alignItems: 'center',
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 15,
        borderRadius: 8,
        marginBottom: 8,
    },
    actionButtonText: {
        marginLeft: 10,
        fontSize: 16,
        color: '#333',
    },
    deleteButton: {
        backgroundColor: '#fef3f2',
        borderColor: '#fca5a5',
        borderWidth: 1,
    },
    deleteButtonText: {
        color: '#ef4444',
    },
    cancelButton: {
        paddingVertical: 10,
        paddingHorizontal: 15,
        borderRadius: 8,
        backgroundColor: '#f1f5f9',
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    cancelButtonText: {
        fontSize: 16,
        color: '#4f46e5',
    },
    modalOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    modalContent: {
        backgroundColor: '#fff',
        borderRadius: 10,
        padding: 20,
        width: '80%',
        alignItems: 'center',
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#333',
        marginBottom: 15,
    },
    editTextInput: {
        backgroundColor: '#f1f5f9',
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
        minHeight: 100,
        maxHeight: 200,
        textAlignVertical: 'top',
        color: '#1a202c',
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    modalButtons: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        width: '100%',
        marginTop: 20,
    },
    modalButton: {
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 8,
    },
    cancelModalButton: {
        backgroundColor: '#f1f5f9',
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    cancelModalButtonText: {
        fontSize: 16,
        color: '#4f46e5',
    },
    saveModalButton: {
        backgroundColor: '#4f46e5',
    },
    saveModalButtonText: {
        fontSize: 16,
        color: '#fff',
    },
}); 