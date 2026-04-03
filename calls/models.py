from django.db import models
from django.contrib.auth import get_user_model
from django.utils import timezone

User = get_user_model()


class CallStatus(models.TextChoices):
    """Enum for call status"""
    INITIATED = 'initiated', 'Initiated'
    RINGING = 'ringing', 'Ringing'
    ACCEPTED = 'accepted', 'Accepted'
    REJECTED = 'rejected', 'Rejected'
    ENDED = 'ended', 'Ended'
    MISSED = 'missed', 'Missed'
    CANCELLED = 'cancelled', 'Cancelled'


class CallType(models.TextChoices):
    """Enum for call type"""
    AUDIO = 'audio', 'Audio'
    VIDEO = 'video', 'Video'


class Call(models.Model):
    """
    Model to track 1-to-1 calls between users
    """
    caller = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='outgoing_calls'
    )
    receiver = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='incoming_calls'
    )
    call_type = models.CharField(
        max_length=10,
        choices=CallType.choices,
        default=CallType.AUDIO
    )
    status = models.CharField(
        max_length=20,
        choices=CallStatus.choices,
        default=CallStatus.INITIATED
    )
    
    # WebRTC room identifier
    room_id = models.CharField(max_length=255, unique=True)
    
    # Timestamps
    initiated_at = models.DateTimeField(auto_now_add=True)
    ringing_at = models.DateTimeField(null=True, blank=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    
    # Call duration (in seconds)
    duration = models.IntegerField(default=0, help_text="Duration in seconds")
    
    # Encryption
    encrypted = models.BooleanField(default=True)
    server_relay_enabled = models.BooleanField(
        default=False,
        help_text="Server relay for monitoring/lawful interception"
    )
    
    class Meta:
        db_table = 'calls'
        ordering = ['-initiated_at']
        indexes = [
            models.Index(fields=['caller', 'status']),
            models.Index(fields=['receiver', 'status']),
            models.Index(fields=['room_id']),
        ]
    
    def __str__(self):
        return f"{self.caller.username} -> {self.receiver.username} ({self.status})"
    
    def calculate_duration(self):
        """Calculate call duration if call was accepted and ended"""
        if self.accepted_at and self.ended_at:
            delta = self.ended_at - self.accepted_at
            self.duration = int(delta.total_seconds())
            return self.duration
        return 0


class CallSignal(models.Model):
    """
    Model to store WebRTC signaling data (for debugging/logging)
    """
    call = models.ForeignKey(Call, on_delete=models.CASCADE, related_name='signals')
    signal_type = models.CharField(max_length=50)  # offer, answer, ice-candidate
    signal_data = models.JSONField()
    sender = models.ForeignKey(User, on_delete=models.CASCADE, related_name='call_signals_sent')
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'call_signals'
        ordering = ['created_at']
    
    def __str__(self):
        return f"{self.signal_type} - {self.call.room_id}"


class ConferenceStatus(models.TextChoices):
    """Conference call status"""
    SCHEDULED = 'scheduled', 'Scheduled'
    ACTIVE = 'active', 'Active'
    ENDED = 'ended', 'Ended'


class ConferenceCall(models.Model):
    """
    Model for conference calls (up to 150 participants)
    """
    host = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='hosted_conferences'
    )
    conversation = models.ForeignKey(
        'messaging.Conversation',
        on_delete=models.SET_NULL,
        related_name='conference_calls',
        null=True,
        blank=True,
    )
    title = models.CharField(max_length=255, blank=True)
    room_id = models.CharField(max_length=255, unique=True)
    
    status = models.CharField(
        max_length=20,
        choices=ConferenceStatus.choices,
        default=ConferenceStatus.ACTIVE
    )
    
    # Conference settings
    max_participants = models.IntegerField(default=150)
    password_protected = models.BooleanField(default=False)
    password = models.CharField(max_length=255, blank=True)
    
    # Timestamps
    scheduled_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    
    # Call type
    call_type = models.CharField(
        max_length=10,
        choices=CallType.choices,
        default=CallType.VIDEO
    )
    
    # Features
    allow_screen_sharing = models.BooleanField(default=True)
    allow_recording = models.BooleanField(default=False)
    voice_activated = models.BooleanField(default=True)
    
    # Encryption
    encrypted = models.BooleanField(default=True)
    server_relay_enabled = models.BooleanField(default=False)
    
    class Meta:
        db_table = 'conference_calls'
        ordering = ['-started_at']
        indexes = [
            models.Index(fields=['host', 'status']),
            models.Index(fields=['room_id']),
            models.Index(fields=['status']),
        ]
    
    def __str__(self):
        return f"Conference by {self.host.username} - {self.room_id}"
    
    @property
    def participant_count(self):
        return self.participants.filter(is_active=True).count()


class ConferenceParticipantRole(models.TextChoices):
    """Participant roles in conference"""
    HOST = 'host', 'Host'
    MODERATOR = 'moderator', 'Moderator'
    PARTICIPANT = 'participant', 'Participant'


class ConferenceParticipantStatus(models.TextChoices):
    """Participant status"""
    INVITED = 'invited', 'Invited'
    JOINED = 'joined', 'Joined'
    LEFT = 'left', 'Left'
    REMOVED = 'removed', 'Removed'


class ConferenceParticipant(models.Model):
    """
    Model to track conference call participants
    """
    conference = models.ForeignKey(
        ConferenceCall,
        on_delete=models.CASCADE,
        related_name='participants'
    )
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='conference_participations'
    )
    role = models.CharField(
        max_length=20,
        choices=ConferenceParticipantRole.choices,
        default=ConferenceParticipantRole.PARTICIPANT
    )
    status = models.CharField(
        max_length=20,
        choices=ConferenceParticipantStatus.choices,
        default=ConferenceParticipantStatus.INVITED
    )
    
    # Participant state
    is_active = models.BooleanField(default=True)
    is_speaking = models.BooleanField(default=False)
    audio_muted = models.BooleanField(default=False)
    video_disabled = models.BooleanField(default=False)
    is_screen_sharing = models.BooleanField(default=False)
    is_pinned = models.BooleanField(default=False)
    is_spotlighted = models.BooleanField(default=False)
    
    # Timestamps
    invited_at = models.DateTimeField(auto_now_add=True)
    joined_at = models.DateTimeField(null=True, blank=True)
    left_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        db_table = 'conference_participants'
        unique_together = ['conference', 'user']
        ordering = ['joined_at']
        indexes = [
            models.Index(fields=['conference', 'is_active']),
            models.Index(fields=['user', 'status']),
        ]
    
    def __str__(self):
        return f"{self.user.username} in {self.conference.room_id}"
    
    def join(self):
        """Mark participant as joined"""
        self.status = ConferenceParticipantStatus.JOINED
        self.joined_at = timezone.now()
        self.is_active = True
        self.save()
    
    def leave(self):
        """Mark participant as left"""
        self.status = ConferenceParticipantStatus.LEFT
        self.left_at = timezone.now()
        self.is_active = False
        self.save()
