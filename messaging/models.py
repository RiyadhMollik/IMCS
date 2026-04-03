from django.db import models
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta

User = get_user_model()


class ConversationType(models.TextChoices):
    """Conversation types"""
    DIRECT = 'direct', 'Direct Message'
    GROUP = 'group', 'Group Chat'


class MessageStatus(models.TextChoices):
    """Message delivery status"""
    SENT = 'sent', 'Sent'
    DELIVERED = 'delivered', 'Delivered'
    READ = 'read', 'Read'
    EXPIRED = 'expired', 'Expired'


class Conversation(models.Model):
    """
    Model for conversations (1-to-1 or group chats)
    """
    conversation_type = models.CharField(
        max_length=10,
        choices=ConversationType.choices,
        default=ConversationType.DIRECT
    )
    name = models.CharField(
        max_length=255,
        null=True,
        blank=True,
        help_text="Group name (only for group chats)"
    )
    participants = models.ManyToManyField(
        User,
        related_name='conversations',
        through='ConversationParticipant'
    )
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_conversations'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True)
    
    # Encryption
    encrypted = models.BooleanField(default=True)
    
    class Meta:
        db_table = 'conversations'
        ordering = ['-updated_at']
        indexes = [
            models.Index(fields=['-updated_at']),
            models.Index(fields=['conversation_type']),
        ]
    
    def __str__(self):
        if self.conversation_type == ConversationType.GROUP:
            return f"Group: {self.name}"
        return f"Conversation {self.id}"
    
    def get_other_participant(self, user):
        """Get the other participant in a direct conversation"""
        if self.conversation_type == ConversationType.DIRECT:
            return self.participants.exclude(id=user.id).first()
        return None


class ConversationParticipant(models.Model):
    """
    Through model for conversation participants with additional data
    """
    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name='participant_entries'
    )
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='conversation_participations'
    )
    joined_at = models.DateTimeField(auto_now_add=True)
    left_at = models.DateTimeField(null=True, blank=True)
    is_admin = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    
    # Last read message tracking
    last_read_message = models.ForeignKey(
        'Message',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+'
    )
    last_read_at = models.DateTimeField(null=True, blank=True)
    
    # Notifications
    muted = models.BooleanField(default=False)
    muted_until = models.DateTimeField(null=True, blank=True)

    # User-level chat pinning
    is_pinned = models.BooleanField(default=False)
    pinned_at = models.DateTimeField(null=True, blank=True)

    # User-level chat privacy controls
    is_hidden = models.BooleanField(default=False)
    hidden_at = models.DateTimeField(null=True, blank=True)
    is_locked = models.BooleanField(default=False)
    locked_at = models.DateTimeField(null=True, blank=True)

    # User-level chat hiding
    is_hidden = models.BooleanField(default=False)
    hidden_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        db_table = 'conversation_participants'
        unique_together = ['conversation', 'user']
        ordering = ['joined_at']
    
    def __str__(self):
        return f"{self.user.username} in {self.conversation}"


class Message(models.Model):
    """
    Model for messages with ephemeral (expiring) support
    """
    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name='messages'
    )
    sender = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='sent_messages'
    )
    mentioned_users = models.ManyToManyField(
        User,
        related_name='mentioned_in_messages',
        blank=True,
    )
    content = models.TextField(blank=True)
    
    # Message metadata
    sent_at = models.DateTimeField(auto_now_add=True)
    edited_at = models.DateTimeField(null=True, blank=True)
    is_edited = models.BooleanField(default=False)
    
    # Reply/Thread support
    reply_to = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='replies'
    )
    
    # Ephemeral messages
    expires_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Message expiration time"
    )
    is_expired = models.BooleanField(default=False)
    
    # Message features
    is_pinned = models.BooleanField(default=False)
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)
    
    # Encryption
    encrypted = models.BooleanField(default=True)
    encryption_key_version = models.CharField(max_length=50, blank=True)
    
    class Meta:
        db_table = 'messages'
        ordering = ['sent_at']
        indexes = [
            models.Index(fields=['conversation', 'sent_at']),
            models.Index(fields=['sender', 'sent_at']),
            models.Index(fields=['expires_at']),
            models.Index(fields=['is_expired']),
        ]
    
    def __str__(self):
        return f"Message from {self.sender.username} at {self.sent_at}"
    
    def set_expiration(self, hours=24):
        """Set message expiration time"""
        self.expires_at = timezone.now() + timedelta(hours=hours)
        self.save()
    
    def check_expiration(self):
        """Check and mark message as expired"""
        if self.expires_at and timezone.now() >= self.expires_at and not self.is_expired:
            self.is_expired = True
            self.content = ""  # Wipe content
            self.save()
            return True
        return False


class MessageReceipt(models.Model):
    """
    Model to track message delivery and read status per recipient
    """
    message = models.ForeignKey(
        Message,
        on_delete=models.CASCADE,
        related_name='receipts'
    )
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='message_receipts'
    )
    status = models.CharField(
        max_length=20,
        choices=MessageStatus.choices,
        default=MessageStatus.SENT
    )
    
    delivered_at = models.DateTimeField(null=True, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        db_table = 'message_receipts'
        unique_together = ['message', 'user']
        ordering = ['delivered_at']
        indexes = [
            models.Index(fields=['message', 'user']),
            models.Index(fields=['user', 'status']),
        ]
    
    def __str__(self):
        return f"{self.user.username} - {self.message.id} - {self.status}"
    
    def mark_delivered(self):
        """Mark message as delivered"""
        if self.status == MessageStatus.SENT:
            self.status = MessageStatus.DELIVERED
            self.delivered_at = timezone.now()
            self.save()
    
    def mark_read(self):
        """Mark message as read"""
        if self.status in [MessageStatus.SENT, MessageStatus.DELIVERED]:
            self.status = MessageStatus.READ
            self.read_at = timezone.now()
            if not self.delivered_at:
                self.delivered_at = self.read_at
            self.save()


class MessageReaction(models.Model):
    """
    Model for emoji reactions to messages
    """
    message = models.ForeignKey(
        Message,
        on_delete=models.CASCADE,
        related_name='reactions'
    )
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='message_reactions'
    )
    emoji = models.CharField(max_length=10)  # 👍, ❤️, etc.
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'message_reactions'
        unique_together = ['message', 'user', 'emoji']
        ordering = ['created_at']
    
    def __str__(self):
        return f"{self.user.username} {self.emoji} on message {self.message.id}"


class MessageEditHistory(models.Model):
    """
    Retains previous message content for edit history timeline.
    """
    message = models.ForeignKey(
        Message,
        on_delete=models.CASCADE,
        related_name='edit_history'
    )
    edited_by = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='message_edits'
    )
    previous_content = models.TextField(blank=True)
    edited_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'message_edit_history'
        ordering = ['-edited_at']
        indexes = [
            models.Index(fields=['message', '-edited_at']),
        ]


class MessagePoll(models.Model):
    """
    Poll payload associated to a single message.
    """
    message = models.OneToOneField(
        Message,
        on_delete=models.CASCADE,
        related_name='poll'
    )
    question = models.CharField(max_length=300)
    allows_multiple = models.BooleanField(default=False)
    closes_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'message_polls'

    def __str__(self):
        return f"Poll for message {self.message_id}"


class MessagePollOption(models.Model):
    poll = models.ForeignKey(
        MessagePoll,
        on_delete=models.CASCADE,
        related_name='options'
    )
    text = models.CharField(max_length=200)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'message_poll_options'
        ordering = ['id']

    def __str__(self):
        return self.text


class MessagePollVote(models.Model):
    poll = models.ForeignKey(
        MessagePoll,
        on_delete=models.CASCADE,
        related_name='votes'
    )
    option = models.ForeignKey(
        MessagePollOption,
        on_delete=models.CASCADE,
        related_name='votes'
    )
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='poll_votes'
    )
    voted_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'message_poll_votes'
        unique_together = ['poll', 'option', 'user']
        indexes = [
            models.Index(fields=['poll', 'user']),
            models.Index(fields=['option']),
        ]

    def __str__(self):
        return f"Vote by {self.user_id} on option {self.option_id}"


class TypingIndicator(models.Model):
    """
    Model to track who is typing in a conversation
    """
    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name='typing_indicators'
    )
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='typing_in'
    )
    is_typing = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'typing_indicators'
        unique_together = ['conversation', 'user']
    
    def __str__(self):
        return f"{self.user.username} typing in {self.conversation.id}"
