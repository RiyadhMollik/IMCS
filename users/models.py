from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone


class OnlineStatus(models.TextChoices):
    """User online status options"""
    AVAILABLE = 'available', 'Available'
    DO_NOT_DISTURB = 'dnd', 'Do Not Disturb'
    INVISIBLE = 'invisible', 'Invisible'
    OFFLINE = 'offline', 'Offline'


class UserRole(models.TextChoices):
    """User roles in the system"""
    USER = 'user', 'User'
    USER_ADMIN = 'user_admin', 'User Admin'
    SYSTEM_ADMIN = 'system_admin', 'System Admin'


class User(AbstractUser):
    """
    Custom User model for Internal Messaging and Calling Software (IMCS)
    """
    email = models.EmailField(unique=True)
    
    # Profile information
    profile_picture = models.ImageField(upload_to='profiles/', null=True, blank=True)
    bio = models.TextField(max_length=500, blank=True, null=True, help_text="About info")
    phone = models.CharField(max_length=20, blank=True, null=True)
    
    # Online status and presence
    online_status = models.CharField(
        max_length=20,
        choices=OnlineStatus.choices,
        default=OnlineStatus.AVAILABLE
    )
    is_online = models.BooleanField(default=False)
    last_seen = models.DateTimeField(auto_now=True)
    
    # Role and permissions
    role = models.CharField(
        max_length=20,
        choices=UserRole.choices,
        default=UserRole.USER
    )
    
    # User-managed contacts (centrally managed by admin)
    contacts = models.ManyToManyField(
        'self',
        symmetrical=False,
        related_name='visible_to',
        blank=True,
        through='UserContact'
    )
    
    # Account management
    account_expires_at = models.DateTimeField(null=True, blank=True)
    account_activated_at = models.DateTimeField(null=True, blank=True)
    is_locked = models.BooleanField(default=False)
    locked_at = models.DateTimeField(null=True, blank=True)
    locked_reason = models.TextField(blank=True)
    
    # Login restrictions (max 2 devices)
    max_devices = models.IntegerField(default=2)
    
    # Authentication
    require_fingerprint = models.BooleanField(default=False)
    fingerprint_for_calls = models.BooleanField(default=False)
    
    # WebSocket tracking
    channel_name = models.CharField(max_length=255, blank=True, null=True)
    
    # User token for Private key management
    user_token = models.CharField(max_length=500, blank=True, help_text="Encrypted Private Key")
    
    # Features enabled for user (set by admin)
    can_make_voice_calls = models.BooleanField(default=True)
    can_make_video_calls = models.BooleanField(default=True)
    can_send_messages = models.BooleanField(default=True)
    can_send_files = models.BooleanField(default=True)
    can_create_groups = models.BooleanField(default=True)
    
    # Platform access
    platform_android = models.BooleanField(default=True)
    platform_ios = models.BooleanField(default=True)
    platform_windows = models.BooleanField(default=True)
    
    # SMS notifications
    sms_notifications_enabled = models.BooleanField(default=False)
    
    class Meta:
        db_table = 'users'
        ordering = ['-date_joined']
        indexes = [
            models.Index(fields=['is_online']),
            models.Index(fields=['username']),
            models.Index(fields=['email']),
            models.Index(fields=['online_status']),
            models.Index(fields=['role']),
        ]
    
    def __str__(self):
        return self.username
    
    def get_full_name(self):
        return f"{self.first_name} {self.last_name}".strip() or self.username
    
    def is_account_expired(self):
        """Check if account has expired"""
        if self.account_expires_at:
            return timezone.now() > self.account_expires_at
        return False
    
    def is_admin(self):
        """Check if user is any type of admin"""
        return self.role in [UserRole.USER_ADMIN, UserRole.SYSTEM_ADMIN]
    
    def can_manage_users(self):
        """Check if user can manage other users"""
        return self.role in [UserRole.USER_ADMIN, UserRole.SYSTEM_ADMIN]


class UserContact(models.Model):
    """
    Through model for user contacts with aliases and custom settings
    """
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='contact_list'
    )
    contact = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='visible_for'
    )
    
    # Alias (display name only visible to this user)
    alias = models.CharField(
        max_length=100,
        blank=True,
        help_text="Custom display name for this contact"
    )
    
    # Favorites
    is_favorite = models.BooleanField(default=False)
    
    # Contact visibility settings
    is_blocked = models.BooleanField(default=False)
    
    added_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'user_contacts'
        unique_together = ['user', 'contact']
        ordering = ['contact__username']
    
    def __str__(self):
        display_name = self.alias or self.contact.username
        return f"{self.user.username}'s contact: {display_name}"


class UserDevice(models.Model):
    """
    Model to track user logged-in devices (max 2)
    """
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='devices'
    )
    device_name = models.CharField(max_length=255, help_text="Device identifier")
    device_type = models.CharField(
        max_length=50,
        choices=[
            ('android', 'Android'),
            ('ios', 'iOS'),
            ('windows', 'Windows'),
            ('web', 'Web Browser'),
        ]
    )
    device_id = models.CharField(max_length=255, unique=True)
    
    # Login tracking
    logged_in_at = models.DateTimeField(auto_now_add=True)
    last_active_at = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True)
    
    # Device info
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    
    # Session token
    session_token = models.CharField(max_length=500, blank=True)
    
    class Meta:
        db_table = 'user_devices'
        ordering = ['-last_active_at']
        indexes = [
            models.Index(fields=['user', 'is_active']),
            models.Index(fields=['device_id']),
        ]
    
    def __str__(self):
        return f"{self.user.username} - {self.device_name}"


class UserSettings(models.Model):
    """
    Model for user-specific settings
    """
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name='settings'
    )
    
    # Message settings
    default_message_expiration_hours = models.IntegerField(
        default=24,
        help_text="Default message expiration time in hours"
    )
    
    # Appearance
    theme_mode = models.CharField(
        max_length=20,
        choices=[
            ('light', 'Light Mode'),
            ('dark', 'Dark Mode'),
            ('auto', 'Auto'),
        ],
        default='light'
    )
    
    # Privacy settings
    show_online_status = models.BooleanField(default=True)
    show_last_seen = models.BooleanField(default=True)
    show_read_receipts = models.BooleanField(default=True)
    show_typing_indicators = models.BooleanField(default=True)
    
    # Notification settings
    push_notifications = models.BooleanField(default=True)
    notification_sound = models.BooleanField(default=True)
    notification_vibrate = models.BooleanField(default=True)
    
    # Security settings
    app_lock_enabled = models.BooleanField(default=False)
    app_lock_timeout_minutes = models.IntegerField(default=5)
    screenshot_protection = models.BooleanField(default=True)
    
    # Calendar integration
    calendar_events_enabled = models.BooleanField(default=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'user_settings'
    
    def __str__(self):
        return f"{self.user.username}'s settings"
