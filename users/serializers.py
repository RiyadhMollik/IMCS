from rest_framework import serializers
from django.contrib.auth import get_user_model, authenticate
from rest_framework_simplejwt.tokens import RefreshToken
from .models import UserSettings, OnlineStatus

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    """
    Serializer for User model
    """
    full_name = serializers.CharField(source='get_full_name', read_only=True)
    
    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name',
            'full_name', 'is_online', 'online_status', 'last_seen', 'profile_picture',
            'can_make_voice_calls', 'can_make_video_calls', 'can_send_messages', 'role'
        ]
        read_only_fields = ['id', 'is_online', 'last_seen', 'role']


class UserRegistrationSerializer(serializers.ModelSerializer):
    """
    Serializer for user registration
    """
    password = serializers.CharField(write_only=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True, required=False)
    
    class Meta:
        model = User
        fields = ['username', 'email', 'password', 'password_confirm', 'first_name', 'last_name']
    
    def validate(self, data):
        # Only validate password match if password_confirm is provided
        password_confirm = data.get('password_confirm')
        if password_confirm and data['password'] != password_confirm:
            raise serializers.ValidationError("Passwords do not match")
        return data
    
    def create(self, validated_data):
        # Remove password_confirm if it exists
        validated_data.pop('password_confirm', None)
        user = User.objects.create_user(**validated_data)
        return user


class UserUpdateSerializer(serializers.ModelSerializer):
    """
    Serializer for updating user profile
    """
    class Meta:
        model = User
        fields = ['first_name', 'last_name', 'email', 'profile_picture']


class OnlineStatusSerializer(serializers.ModelSerializer):
    """
    Lightweight serializer for online status
    """
    class Meta:
        model = User
        fields = ['id', 'username', 'is_online', 'online_status', 'last_seen']


class UserLoginSerializer(serializers.Serializer):
    """
    Serializer for user login
    """
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)
    
    def validate(self, data):
        username = data.get('username')
        password = data.get('password')
        
        if username and password:
            user = authenticate(username=username, password=password)
            
            if user is None:
                raise serializers.ValidationError("Invalid username or password")
            
            if not user.is_active:
                raise serializers.ValidationError("User account is disabled")
            
            # Generate tokens
            refresh = RefreshToken.for_user(user)
            
            return {
                'user': UserSerializer(user).data,
                'access': str(refresh.access_token),
                'refresh': str(refresh),
            }
        else:
            raise serializers.ValidationError("Must include username and password")


class UserSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserSettings
        fields = [
            'default_message_expiration_hours',
            'show_online_status',
            'show_last_seen',
            'show_read_receipts',
            'show_typing_indicators',
            'app_lock_enabled',
            'app_lock_timeout_minutes',
            'calendar_events_enabled',
        ]

    def validate_default_message_expiration_hours(self, value):
        allowed = {24, 24 * 7, 24 * 90}
        if value not in allowed:
            raise serializers.ValidationError('Allowed expiration values are 24h, 7d, and 90d.')
        return value


class PresenceUpdateSerializer(serializers.Serializer):
    online_status = serializers.ChoiceField(choices=OnlineStatus.choices)


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)
