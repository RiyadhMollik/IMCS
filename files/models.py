from django.db import models
from django.contrib.auth import get_user_model
from django.core.validators import FileExtensionValidator
from django.utils import timezone
from datetime import timedelta

User = get_user_model()


class FileType(models.TextChoices):
    """File type classification"""
    IMAGE = 'image', 'Image'
    VIDEO = 'video', 'Video'
    DOCUMENT = 'document', 'Document'
    PDF = 'pdf', 'PDF'
    AUDIO = 'audio', 'Audio'
    OTHER = 'other', 'Other'


class FilePermission(models.Model):
    """
    Model for file permissions (per user or global)
    """
    name = models.CharField(max_length=100, unique=True)
    can_view = models.BooleanField(default=True)
    can_download = models.BooleanField(default=True)
    can_export = models.BooleanField(default=True)
    can_share = models.BooleanField(default=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'file_permissions'
    
    def __str__(self):
        return self.name


class File(models.Model):
    """
    Model for file storage with permissions and expiration
    """
    # File information
    name = models.CharField(max_length=255)
    file = models.FileField(upload_to='secure_files/%Y/%m/%d/')
    file_type = models.CharField(
        max_length=20,
        choices=FileType.choices,
        default=FileType.OTHER
    )
    file_size = models.BigIntegerField(help_text="File size in bytes")
    mime_type = models.CharField(max_length=100, blank=True)
    
    # Owner and sender
    owner = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='owned_files'
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)
    
    # Conversation context
    conversation = models.ForeignKey(
        'messaging.Conversation',
        on_delete=models.CASCADE,
        related_name='files',
        null=True,
        blank=True
    )
    message = models.ForeignKey(
        'messaging.Message',
        on_delete=models.CASCADE,
        related_name='files',
        null=True,
        blank=True
    )
    
    # File expiration (auto-delete after 90 days if not viewed)
    expires_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="File expiration time (90 days default)"
    )
    last_viewed_at = models.DateTimeField(null=True, blank=True)
    is_expired = models.BooleanField(default=False)
    
    # Encryption
    encrypted = models.BooleanField(default=True)
    encryption_key = models.CharField(max_length=255, blank=True)
    
    # Storage tracking
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        db_table = 'files'
        ordering = ['-uploaded_at']
        indexes = [
            models.Index(fields=['owner', '-uploaded_at']),
            models.Index(fields=['conversation']),
            models.Index(fields=['expires_at']),
            models.Index(fields=['is_expired']),
        ]
    
    def __str__(self):
        return f"{self.name} by {self.owner.username}"
    
    def set_expiration(self, days=90):
        """Set file expiration time"""
        self.expires_at = timezone.now() + timedelta(days=days)
        self.save()
    
    def check_expiration(self):
        """Check and mark file as expired"""
        if self.expires_at and timezone.now() >= self.expires_at and not self.is_expired:
            self.is_expired = True
            self.is_deleted = True
            self.deleted_at = timezone.now()
            # Delete the actual file
            if self.file:
                self.file.delete(save=False)
            self.save()
            return True
        return False
    
    def update_last_viewed(self):
        """Update last viewed timestamp"""
        self.last_viewed_at = timezone.now()
        # Reset expiration if viewed
        if self.expires_at:
            self.set_expiration(90)
        self.save()
    
    def get_file_size_mb(self):
        """Get file size in MB"""
        return round(self.file_size / (1024 * 1024), 2)


class FileRecipient(models.Model):
    """
    Model to track file recipients and their specific permissions
    """
    file = models.ForeignKey(
        File,
        on_delete=models.CASCADE,
        related_name='recipients'
    )
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='received_files'
    )
    
    # Custom permissions per recipient
    can_view = models.BooleanField(default=True)
    can_download = models.BooleanField(default=False)
    can_export = models.BooleanField(default=False)
    can_share = models.BooleanField(default=False)
    
    # Access tracking
    accessed_at = models.DateTimeField(null=True, blank=True)
    access_count = models.IntegerField(default=0)
    downloaded_at = models.DateTimeField(null=True, blank=True)
    download_count = models.IntegerField(default=0)
    
    # Notification
    notified_at = models.DateTimeField(null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'file_recipients'
        unique_together = ['file', 'user']
        ordering = ['created_at']
    
    def __str__(self):
        return f"{self.user.username} - {self.file.name}"
    
    def record_access(self):
        """Record file access"""
        self.access_count += 1
        self.accessed_at = timezone.now()
        self.save()
    
    def record_download(self):
        """Record file download"""
        if self.can_download:
            self.download_count += 1
            self.downloaded_at = timezone.now()
            self.save()
            return True
        return False


class UserStorageQuota(models.Model):
    """
    Model to track user storage quotas
    """
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name='storage_quota'
    )
    # Storage in MB (default 500MB)
    total_quota = models.IntegerField(default=500, help_text="Total storage quota in MB")
    used_storage = models.BigIntegerField(default=0, help_text="Used storage in bytes")
    
    # Max file size in MB (default 20MB)
    max_file_size = models.IntegerField(default=20, help_text="Maximum file size in MB")
    
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'user_storage_quotas'
    
    def __str__(self):
        return f"{self.user.username} - {self.get_used_mb()}/{self.total_quota}MB"
    
    def get_used_mb(self):
        """Get used storage in MB"""
        return round(self.used_storage / (1024 * 1024), 2)
    
    def get_available_mb(self):
        """Get available storage in MB"""
        used_mb = self.get_used_mb()
        return max(0, self.total_quota - used_mb)
    
    def is_quota_exceeded(self, additional_size_bytes=0):
        """Check if quota would be exceeded by adding file"""
        total_bytes = self.used_storage + additional_size_bytes
        total_mb = total_bytes / (1024 * 1024)
        return total_mb > self.total_quota
    
    def add_usage(self, file_size_bytes):
        """Add to used storage"""
        self.used_storage += file_size_bytes
        self.save()
    
    def remove_usage(self, file_size_bytes):
        """Remove from used storage"""
        self.used_storage = max(0, self.used_storage - file_size_bytes)
        self.save()


class FileAccessLog(models.Model):
    """
    Model to log file access for security audit
    """
    file = models.ForeignKey(
        File,
        on_delete=models.CASCADE,
        related_name='access_logs'
    )
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='file_access_logs'
    )
    action = models.CharField(
        max_length=50,
        choices=[
            ('view', 'Viewed'),
            ('download', 'Downloaded'),
            ('share', 'Shared'),
            ('export', 'Exported'),
            ('delete', 'Deleted'),
        ]
    )
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'file_access_logs'
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['file', '-timestamp']),
            models.Index(fields=['user', '-timestamp']),
        ]
    
    def __str__(self):
        return f"{self.user.username} {self.action} {self.file.name}"
