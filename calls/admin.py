from django.contrib import admin
from .models import Call, CallSignal, ConferenceCall, ConferenceParticipant


@admin.register(Call)
class CallAdmin(admin.ModelAdmin):
    list_display = ['id', 'caller', 'receiver', 'call_type', 'status', 'duration', 'initiated_at', 'encrypted']
    list_filter = ['status', 'call_type', 'initiated_at', 'encrypted', 'server_relay_enabled']
    search_fields = ['caller__username', 'receiver__username', 'room_id']
    readonly_fields = ['room_id', 'initiated_at', 'ringing_at', 'accepted_at', 'ended_at', 'duration']
    
    fieldsets = (
        ('Participants', {
            'fields': ('caller', 'receiver', 'call_type')
        }),
        ('Status', {
            'fields': ('status', 'room_id')
        }),
        ('Security', {
            'fields': ('encrypted', 'server_relay_enabled')
        }),
        ('Timestamps', {
            'fields': ('initiated_at', 'ringing_at', 'accepted_at', 'ended_at', 'duration')
        }),
    )


@admin.register(CallSignal)
class CallSignalAdmin(admin.ModelAdmin):
    list_display = ['id', 'call', 'signal_type', 'sender', 'created_at']
    list_filter = ['signal_type', 'created_at']
    search_fields = ['call__room_id', 'sender__username']
    readonly_fields = ['created_at']


@admin.register(ConferenceCall)
class ConferenceCallAdmin(admin.ModelAdmin):
    list_display = ['id', 'host', 'title', 'call_type', 'status', 'participant_count', 'started_at', 'encrypted']
    list_filter = ['status', 'call_type', 'started_at', 'encrypted', 'server_relay_enabled']
    search_fields = ['host__username', 'title', 'room_id']
    readonly_fields = ['room_id', 'started_at', 'ended_at', 'participant_count']
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('host', 'title', 'call_type', 'room_id')
        }),
        ('Status & Settings', {
            'fields': ('status', 'max_participants', 'password_protected', 'password')
        }),
        ('Features', {
            'fields': ('allow_screen_sharing', 'allow_recording', 'voice_activated')
        }),
        ('Security', {
            'fields': ('encrypted', 'server_relay_enabled')
        }),
        ('Timestamps', {
            'fields': ('scheduled_at', 'started_at', 'ended_at')
        }),
    )


@admin.register(ConferenceParticipant)
class ConferenceParticipantAdmin(admin.ModelAdmin):
    list_display = ['user', 'conference', 'role', 'status', 'is_active', 'audio_muted', 'video_disabled', 'joined_at']
    list_filter = ['role', 'status', 'is_active', 'audio_muted', 'video_disabled', 'is_screen_sharing']
    search_fields = ['user__username', 'conference__room_id']
    readonly_fields = ['invited_at', 'joined_at', 'left_at']
    
    fieldsets = (
        ('Participant Info', {
            'fields': ('conference', 'user', 'role', 'status')
        }),
        ('State', {
            'fields': ('is_active', 'is_speaking', 'audio_muted', 'video_disabled', 'is_screen_sharing')
        }),
        ('Display', {
            'fields': ('is_pinned', 'is_spotlighted')
        }),
        ('Timestamps', {
            'fields': ('invited_at', 'joined_at', 'left_at')
        }),
    )
