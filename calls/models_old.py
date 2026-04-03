from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()


class CallStatus(models.TextChoices):
    """
    Enum for call status
    """
    INITIATED = 'initiated', 'Initiated'
    RINGING = 'ringing', 'Ringing'
    ACCEPTED = 'accepted', 'Accepted'
    REJECTED = 'rejected', 'Rejected'
    ENDED = 'ended', 'Ended'
    MISSED = 'missed', 'Missed'
    CANCELLED = 'cancelled', 'Cancelled'


class CallType(models.TextChoices):
    """
    Enum for call type
    """
    AUDIO = 'audio', 'Audio'
    VIDEO = 'video', 'Video'


class Call(models.Model):
    """
    Model to track calls between users
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
        """
        Calculate call duration if call was accepted and ended
        """
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
    sender = models.ForeignKey(User, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'call_signals'
        ordering = ['created_at']
    
    def __str__(self):
        return f"{self.signal_type} - {self.call.room_id}"


# ============ JVAI COMMUNITY - SOCIAL NETWORKING MODELS ============

class Post(models.Model):
    """
    Model for user posts in jvai community
    """
    author = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='posts'
    )
    content = models.TextField()
    image = models.ImageField(upload_to='posts/', null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'posts'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['author', '-created_at']),
            models.Index(fields=['-created_at']),
        ]
    
    def __str__(self):
        return f"{self.author.username}'s post - {self.created_at}"
    
    def likes_count(self):
        return self.likes.count()
    
    def comments_count(self):
        return self.comments.count()


class Like(models.Model):
    """
    Model for liking posts or comments
    """
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='likes'
    )
    post = models.ForeignKey(
        Post,
        on_delete=models.CASCADE,
        related_name='likes',
        null=True,
        blank=True
    )
    comment = models.ForeignKey(
        'Comment',
        on_delete=models.CASCADE,
        related_name='likes',
        null=True,
        blank=True
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'likes'
        unique_together = [['user', 'post'], ['user', 'comment']]
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.user.username} liked"


class Comment(models.Model):
    """
    Model for comments on posts
    """
    author = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='comments'
    )
    post = models.ForeignKey(
        Post,
        on_delete=models.CASCADE,
        related_name='comments'
    )
    content = models.TextField()
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'comments'
        ordering = ['created_at']
        indexes = [
            models.Index(fields=['post', '-created_at']),
        ]
    
    def __str__(self):
        return f"{self.author.username}'s comment on {self.post.id}"


class Page(models.Model):
    """
    Model for Facebook-like Pages
    """
    CATEGORY_CHOICES = [
        ('business', 'Business or Brand'),
        ('community', 'Community or Public Figure'),
        ('entertainment', 'Entertainment'),
        ('education', 'Education'),
        ('nonprofit', 'Non-Profit Organization'),
        ('personal', 'Personal Blog'),
        ('other', 'Other'),
    ]
    
    name = models.CharField(max_length=255, unique=True)
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES)
    description = models.TextField(blank=True, null=True)
    profile_picture = models.ImageField(upload_to='pages/profiles/', null=True, blank=True)
    cover_photo = models.ImageField(upload_to='pages/covers/', null=True, blank=True)
    website = models.URLField(blank=True, null=True)
    email = models.EmailField(blank=True, null=True)
    phone = models.CharField(max_length=20, blank=True, null=True)
    address = models.TextField(blank=True, null=True)
    
    creator = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='created_pages'
    )
    
    followers = models.ManyToManyField(
        User,
        through='PageFollower',
        related_name='followed_pages'
    )
    
    is_verified = models.BooleanField(default=False)
    is_published = models.BooleanField(default=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'pages'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['creator']),
            models.Index(fields=['category']),
            models.Index(fields=['name']),
        ]
    
    def __str__(self):
        return self.name
    
    @property
    def follower_count(self):
        return self.followers.count()


class PageFollower(models.Model):
    """
    Model to track page followers
    """
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='page_follows'
    )
    page = models.ForeignKey(
        Page,
        on_delete=models.CASCADE,
        related_name='page_followers'
    )
    followed_at = models.DateTimeField(auto_now_add=True)
    notifications_enabled = models.BooleanField(default=True)
    
    class Meta:
        db_table = 'page_followers'
        unique_together = ['user', 'page']
        ordering = ['-followed_at']
    
    def __str__(self):
        return f"{self.user.username} follows {self.page.name}"


class PageRole(models.Model):
    """
    Model to manage page admins and editors
    """
    ROLE_CHOICES = [
        ('admin', 'Admin'),
        ('editor', 'Editor'),
        ('moderator', 'Moderator'),
    ]
    
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='page_roles'
    )
    page = models.ForeignKey(
        Page,
        on_delete=models.CASCADE,
        related_name='roles'
    )
    role = models.CharField(max_length=10, choices=ROLE_CHOICES)
    assigned_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'page_roles'
        unique_together = ['user', 'page']
        ordering = ['-assigned_at']
    
    def __str__(self):
        return f"{self.user.username} - {self.role} of {self.page.name}"


class Group(models.Model):
    """
    Model for group creation in jvai community
    """
    PRIVACY_CHOICES = [
        ('public', 'Public'),
        ('private', 'Private'),
        ('secret', 'Secret'),
    ]
    
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    image = models.ImageField(upload_to='groups/', null=True, blank=True)
    cover_photo = models.ImageField(upload_to='groups/covers/', null=True, blank=True)
    privacy = models.CharField(max_length=10, choices=PRIVACY_CHOICES, default='public')
    
    creator = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='created_groups'
    )
    
    members = models.ManyToManyField(
        User,
        through='GroupMember',
        related_name='jvai_groups'
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'groups'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['creator']),
            models.Index(fields=['privacy']),
        ]
    
    def __str__(self):
        return self.name
    
    @property
    def member_count(self):
        return self.members.count()
    
    @property
    def is_public(self):
        return self.privacy == 'public'


class GroupMember(models.Model):
    """
    Model to track group members and their roles
    """
    ROLE_CHOICES = [
        ('admin', 'Admin'),
        ('moderator', 'Moderator'),
        ('member', 'Member'),
    ]
    
    STATUS_CHOICES = [
        ('approved', 'Approved'),
        ('pending', 'Pending'),
        ('rejected', 'Rejected'),
    ]
    
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='group_memberships'
    )
    group = models.ForeignKey(
        Group,
        on_delete=models.CASCADE,
        related_name='memberships'
    )
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default='member')
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='approved')
    joined_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'group_members'
        unique_together = ['user', 'group']
        ordering = ['-joined_at']
        indexes = [
            models.Index(fields=['status']),
        ]
    
    def __str__(self):
        return f"{self.user.username} in {self.group.name}"
    
    @property
    def is_admin(self):
        return self.role == 'admin'
    
    @property
    def is_moderator(self):
        return self.role in ['admin', 'moderator']


class DirectMessage(models.Model):
    """
    Model for direct messages between users
    """
    sender = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='sent_messages'
    )
    receiver = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='received_messages'
    )
    content = models.TextField()
    
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'direct_messages'
        ordering = ['created_at']
        indexes = [
            models.Index(fields=['sender', 'receiver']),
            models.Index(fields=['receiver', 'is_read']),
        ]
    
    def __str__(self):
        return f"{self.sender.username} -> {self.receiver.username}"


class GroupMessage(models.Model):
    """
    Model for messages in group chats
    """
    sender = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='group_messages'
    )
    group = models.ForeignKey(
        Group,
        on_delete=models.CASCADE,
        related_name='messages'
    )
    content = models.TextField()
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'group_messages'
        ordering = ['created_at']
        indexes = [
            models.Index(fields=['group', '-created_at']),
        ]
    
    def __str__(self):
        return f"{self.sender.username} in {self.group.name}"


class FriendRequest(models.Model):
    """
    Model for friend requests
    """
    STATUS_CHOICES = (
        ('pending', 'Pending'),
        ('accepted', 'Accepted'),
        ('rejected', 'Rejected'),
    )
    
    sender = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='sent_friend_requests'
    )
    receiver = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='received_friend_requests'
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'friend_requests'
        ordering = ['-created_at']
        unique_together = ('sender', 'receiver')
        indexes = [
            models.Index(fields=['receiver', 'status']),
            models.Index(fields=['sender', 'status']),
        ]
    
    def __str__(self):
        return f"{self.sender.username} -> {self.receiver.username} ({self.status})"


class Story(models.Model):
    """
    Model for user stories (like Instagram/Facebook stories)
    Stories expire after 24 hours
    """
    author = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='stories'
    )
    image = models.ImageField(upload_to='stories/', null=True, blank=True)
    video = models.FileField(upload_to='stories/videos/', null=True, blank=True)
    text_content = models.TextField(max_length=500, blank=True)
    background_color = models.CharField(max_length=20, default='#3b82f6')
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    views = models.ManyToManyField(User, related_name='viewed_stories', blank=True)
    
    class Meta:
        db_table = 'stories'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['author', '-created_at']),
            models.Index(fields=['expires_at']),
        ]
        verbose_name_plural = 'Stories'
    
    def __str__(self):
        return f"Story by {self.author.username} at {self.created_at}"
    
    @property
    def is_expired(self):
        from django.utils import timezone
        return timezone.now() > self.expires_at
    
    @property
    def views_count(self):
        return self.views.count()


class Notification(models.Model):
    """
    Model for user notifications
    """
    NOTIFICATION_TYPES = (
        ('like_post', 'Like Post'),
        ('like_comment', 'Like Comment'),
        ('comment', 'Comment'),
        ('follow', 'Follow'),
        ('group_invite', 'Group Invite'),
        ('friend_request', 'Friend Request'),
        ('friend_accept', 'Friend Accept'),
    )
    
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='notifications'
    )
    actor = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='actions'
    )
    notification_type = models.CharField(max_length=20, choices=NOTIFICATION_TYPES)
    post = models.ForeignKey(
        'Post',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='notifications'
    )
    comment = models.ForeignKey(
        'Comment',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='notifications'
    )
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'notifications'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', '-created_at']),
            models.Index(fields=['is_read']),
        ]
    
    def __str__(self):
        return f"{self.actor.username} {self.notification_type} - {self.user.username}"
