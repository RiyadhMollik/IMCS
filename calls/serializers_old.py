from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta
from .models import (
    Call, CallSignal, Post, Like, Comment, Group, GroupMember,
    DirectMessage, GroupMessage, Notification, FriendRequest, Story,
    Page, PageFollower, PageRole
)
from users.serializers import UserSerializer

User = get_user_model()


class CallSerializer(serializers.ModelSerializer):
    """
    Serializer for Call model
    """
    caller_details = UserSerializer(source='caller', read_only=True)
    receiver_details = UserSerializer(source='receiver', read_only=True)
    caller_username = serializers.CharField(source='caller.username', read_only=True)
    receiver_username = serializers.CharField(source='receiver.username', read_only=True)
    duration_formatted = serializers.SerializerMethodField()
    
    class Meta:
        model = Call
        fields = [
            'id', 'caller', 'receiver', 'caller_details', 'receiver_details',
            'caller_username', 'receiver_username',
            'call_type', 'status', 'room_id', 'initiated_at', 'ringing_at',
            'accepted_at', 'ended_at', 'duration', 'duration_formatted'
        ]
        read_only_fields = [
            'id', 'room_id', 'initiated_at', 'ringing_at',
            'accepted_at', 'ended_at', 'duration'
        ]
    
    def get_duration_formatted(self, obj):
        """
        Format duration as MM:SS
        """
        if obj.duration > 0:
            minutes, seconds = divmod(obj.duration, 60)
            return f"{minutes:02d}:{seconds:02d}"
        return "00:00"


class CallCreateSerializer(serializers.ModelSerializer):
    """
    Serializer for creating a new call
    """
    receiver_username = serializers.CharField(write_only=True, required=False)
    
    class Meta:
        model = Call
        fields = ['receiver', 'receiver_username', 'call_type']
        extra_kwargs = {'receiver': {'required': False}}
    
    def validate(self, attrs):
        """
        Validate receiver - accept either receiver ID or receiver_username
        """
        receiver = attrs.get('receiver')
        receiver_username = attrs.get('receiver_username')
        request = self.context.get('request')
        
        if not receiver and not receiver_username:
            raise serializers.ValidationError({
                'receiver': 'Either receiver ID or receiver_username is required'
            })
        
        # If receiver_username provided, look up the user
        if receiver_username:
            try:
                receiver = User.objects.get(username=receiver_username)
                attrs['receiver'] = receiver
            except User.DoesNotExist:
                raise serializers.ValidationError({
                    'receiver_username': f'User with username "{receiver_username}" not found'
                })
        
        # Validate that receiver is not the caller
        if request and receiver == request.user:
            raise serializers.ValidationError({
                'receiver': "Cannot call yourself"
            })
        
        # Check if receiver is online
        if not receiver.is_online:
            raise serializers.ValidationError({
                'receiver': "User is offline"
            })
        
        # Remove receiver_username from validated data
        attrs.pop('receiver_username', None)
        
        return attrs
    
    def validate_receiver(self, value):
        """
        Validate that receiver is not the caller (only when receiver ID is provided directly)
        """
        request = self.context.get('request')
        if request and value == request.user:
            raise serializers.ValidationError("Cannot call yourself")
        
        # Check if receiver is online
        if not value.is_online:
            raise serializers.ValidationError("User is offline")
        
        return value


class CallActionSerializer(serializers.Serializer):
    """
    Serializer for call actions (accept, reject, end)
    """
    call_id = serializers.IntegerField()
    
    def validate_call_id(self, value):
        """
        Validate that call exists
        """
        try:
            Call.objects.get(id=value)
        except Call.DoesNotExist:
            raise serializers.ValidationError("Call not found")
        return value


class CallHistorySerializer(serializers.ModelSerializer):
    """
    Lightweight serializer for call history
    """
    caller_name = serializers.CharField(source='caller.get_full_name', read_only=True)
    receiver_name = serializers.CharField(source='receiver.get_full_name', read_only=True)
    duration_formatted = serializers.SerializerMethodField()
    
    class Meta:
        model = Call
        fields = [
            'id', 'caller', 'caller_name', 'receiver', 'receiver_name',
            'call_type', 'status', 'initiated_at', 'duration', 'duration_formatted'
        ]
    
    def get_duration_formatted(self, obj):
        if obj.duration > 0:
            minutes, seconds = divmod(obj.duration, 60)
            return f"{minutes:02d}:{seconds:02d}"
        return "00:00"


class CallSignalSerializer(serializers.ModelSerializer):
    """
    Serializer for WebRTC signals
    """
    class Meta:
        model = CallSignal
        fields = ['id', 'call', 'signal_type', 'signal_data', 'sender', 'created_at']
        read_only_fields = ['id', 'created_at']


# ============ POST & INTERACTION SERIALIZERS ============

class LikeSerializer(serializers.ModelSerializer):
    """
    Serializer for likes
    """
    user_details = UserSerializer(source='user', read_only=True)
    
    class Meta:
        model = Like
        fields = ['id', 'user', 'user_details', 'post', 'comment', 'created_at']
        read_only_fields = ['id', 'created_at']


class CommentSerializer(serializers.ModelSerializer):
    """
    Serializer for comments
    """
    author = serializers.SerializerMethodField()
    likes_count = serializers.SerializerMethodField()
    is_liked = serializers.SerializerMethodField()
    
    class Meta:
        model = Comment
        fields = [
            'id', 'author', 'post', 'content', 'created_at', 'updated_at',
            'likes_count', 'is_liked'
        ]
        read_only_fields = ['id', 'author', 'post', 'created_at', 'updated_at']
    
    def get_author(self, obj):
        return {
            'id': obj.author.id,
            'username': obj.author.username
        }
    
    def get_likes_count(self, obj):
        return obj.likes.count()
    
    def get_is_liked(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return obj.likes.filter(user=request.user).exists()
        return False


class CommentCreateSerializer(serializers.ModelSerializer):
    """
    Serializer for creating comments
    """
    class Meta:
        model = Comment
        fields = ['content']


class PostSerializer(serializers.ModelSerializer):
    """
    Serializer for posts
    """
    author = serializers.SerializerMethodField()
    image = serializers.SerializerMethodField()
    likes_count = serializers.SerializerMethodField()
    comments_count = serializers.SerializerMethodField()
    is_liked = serializers.SerializerMethodField()
    
    class Meta:
        model = Post
        fields = [
            'id', 'author', 'content', 'image', 'created_at', 'updated_at',
            'likes_count', 'comments_count', 'is_liked'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_author(self, obj):
        return {
            'id': obj.author.id,
            'username': obj.author.username
        }
    
    def get_image(self, obj):
        if obj.image:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.image.url)
            return obj.image.url
        return None
    
    def get_likes_count(self, obj):
        return obj.likes.count()
    
    def get_comments_count(self, obj):
        return obj.comments.count()
    
    def get_is_liked(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return obj.likes.filter(user=request.user).exists()
        return False


class PostCreateUpdateSerializer(serializers.ModelSerializer):
    """
    Serializer for creating/updating posts
    """
    class Meta:
        model = Post
        fields = ['content', 'image']


# ============ GROUP SERIALIZERS ============

class GroupMemberSerializer(serializers.ModelSerializer):
    """
    Serializer for group members
    """
    user_details = UserSerializer(source='user', read_only=True)
    
    class Meta:
        model = GroupMember
        fields = ['id', 'user', 'user_details', 'role', 'joined_at']
        read_only_fields = ['id', 'joined_at']


class GroupSerializer(serializers.ModelSerializer):
    """
    Serializer for groups
    """
    creator_details = UserSerializer(source='creator', read_only=True)
    created_by = serializers.SerializerMethodField()
    members_count = serializers.SerializerMethodField()
    memberships = GroupMemberSerializer(many=True, read_only=True)
    user_role = serializers.SerializerMethodField()
    is_member = serializers.SerializerMethodField()
    can_view = serializers.SerializerMethodField()
    
    class Meta:
        model = Group
        fields = [
            'id', 'name', 'description', 'image', 'cover_photo', 'privacy',
            'creator', 'creator_details', 'created_by', 'created_at', 'updated_at',
            'members_count', 'memberships', 'user_role', 'is_member', 'can_view'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_created_by(self, obj):
        if obj.creator:
            return {'id': obj.creator.id, 'username': obj.creator.username}
        return {'id': None, 'username': 'Unknown'}
    
    def get_members_count(self, obj):
        return obj.memberships.filter(status='approved').count()
    
    def get_user_role(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            try:
                membership = obj.memberships.get(user=request.user, status='approved')
                return membership.role
            except GroupMember.DoesNotExist:
                return None
        return None
    
    def get_is_member(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return obj.memberships.filter(user=request.user, status='approved').exists()
        return False
    
    def get_can_view(self, obj):
        """Check if user can view this group"""
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return obj.privacy == 'public'
        
        # Creator and members can always view
        if obj.creator == request.user or self.get_is_member(obj):
            return True
        
        # Public groups are visible to all
        if obj.privacy == 'public':
            return True
        
        # Private groups are visible but require join approval
        if obj.privacy == 'private':
            return True
        
        # Secret groups are only visible to members
        return False



class GroupCreateSerializer(serializers.ModelSerializer):
    """
    Serializer for creating groups
    """
    class Meta:
        model = Group
        fields = ['name', 'description', 'image', 'cover_photo', 'privacy']
    
    def create(self, validated_data):
        # Create group and add creator as admin
        group = super().create(validated_data)
        GroupMember.objects.create(
            user=group.creator,
            group=group,
            role='admin',
            status='approved'
        )
        return group


# ============ MESSAGE SERIALIZERS ============

class DirectMessageSerializer(serializers.ModelSerializer):
    """
    Serializer for direct messages
    """
    sender_details = UserSerializer(source='sender', read_only=True)
    receiver_details = UserSerializer(source='receiver', read_only=True)
    sender = serializers.SerializerMethodField()
    receiver = serializers.SerializerMethodField()
    
    class Meta:
        model = DirectMessage
        fields = [
            'id', 'sender', 'sender_details', 'receiver', 'receiver_details',
            'content', 'is_read', 'created_at'
        ]
        read_only_fields = ['id', 'is_read', 'created_at']
    
    def get_sender(self, obj):
        return {'id': obj.sender.id, 'username': obj.sender.username}
    
    def get_receiver(self, obj):
        return {'id': obj.receiver.id, 'username': obj.receiver.username}


class DirectMessageCreateSerializer(serializers.ModelSerializer):
    """
    Serializer for creating direct messages
    """
    receiver_username = serializers.CharField(write_only=True, required=False)
    
    class Meta:
        model = DirectMessage
        fields = ['receiver', 'receiver_username', 'content']
        extra_kwargs = {'receiver': {'required': False}}
    
    def validate(self, attrs):
        request = self.context.get('request')
        receiver = attrs.get('receiver')
        receiver_username = attrs.get('receiver_username')
        
        if not receiver and not receiver_username:
            raise serializers.ValidationError({
                'receiver': 'Either receiver ID or receiver_username is required'
            })
        
        if receiver_username:
            try:
                receiver = User.objects.get(username=receiver_username)
                attrs['receiver'] = receiver
            except User.DoesNotExist:
                raise serializers.ValidationError({
                    'receiver_username': f'User with username "{receiver_username}" not found'
                })
        
        if request and receiver == request.user:
            raise serializers.ValidationError({
                'receiver': "Cannot message yourself"
            })
        
        # Check if users are friends
        if request:
            from .models import FriendRequest
            are_friends = FriendRequest.objects.filter(
                models.Q(sender=request.user, receiver=receiver, status='accepted') |
                models.Q(sender=receiver, receiver=request.user, status='accepted')
            ).exists()
            
            if not are_friends:
                raise serializers.ValidationError({
                    'receiver': "You can only message users who are your friends"
                })
        
        attrs.pop('receiver_username', None)
        return attrs


class GroupMessageSerializer(serializers.ModelSerializer):
    """
    Serializer for group messages
    """
    sender_details = UserSerializer(source='sender', read_only=True)
    sender = serializers.SerializerMethodField()
    
    class Meta:
        model = GroupMessage
        fields = ['id', 'sender', 'sender_details', 'group', 'content', 'created_at']
        read_only_fields = ['id', 'created_at']
    
    def get_sender(self, obj):
        if obj.sender:
            return {'id': obj.sender.id, 'username': obj.sender.username}
        return {'id': None, 'username': 'Unknown'}


class GroupMessageCreateSerializer(serializers.ModelSerializer):
    """
    Serializer for creating group messages
    """
    class Meta:
        model = GroupMessage
        fields = ['content']


class NotificationSerializer(serializers.ModelSerializer):
    """
    Serializer for notifications
    """
    actor = serializers.SerializerMethodField()
    actor_details = UserSerializer(source='actor', read_only=True)
    post_id = serializers.IntegerField(source='post.id', read_only=True, allow_null=True)
    comment_id = serializers.IntegerField(source='comment.id', read_only=True, allow_null=True)
    message = serializers.SerializerMethodField()
    
    class Meta:
        model = Notification
        fields = [
            'id', 'actor', 'actor_details', 'notification_type',
            'post_id', 'comment_id', 'message', 'is_read', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']
    
    def get_actor(self, obj):
        return {'id': obj.actor.id, 'username': obj.actor.username}
    
    def get_message(self, obj):
        if obj.notification_type == 'like_post':
            return f'{obj.actor.username} liked your post'
        elif obj.notification_type == 'like_comment':
            return f'{obj.actor.username} liked your comment'
        elif obj.notification_type == 'comment':
            return f'{obj.actor.username} commented on your post'
        elif obj.notification_type == 'follow':
            return f'{obj.actor.username} started following you'
        elif obj.notification_type == 'friend_request':
            return f'{obj.actor.username} sent you a friend request'
        elif obj.notification_type == 'friend_accept':
            return f'{obj.actor.username} accepted your friend request'
        return 'New notification'


class FriendRequestSerializer(serializers.ModelSerializer):
    """
    Serializer for friend requests
    """
    sender = serializers.SerializerMethodField()
    receiver = serializers.SerializerMethodField()
    sender_details = UserSerializer(source='sender', read_only=True)
    receiver_details = UserSerializer(source='receiver', read_only=True)
    mutual_friends_count = serializers.SerializerMethodField()
    
    class Meta:
        model = FriendRequest
        fields = [
            'id', 'sender', 'receiver', 'sender_details', 'receiver_details',
            'status', 'mutual_friends_count', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_sender(self, obj):
        return {'id': obj.sender.id, 'username': obj.sender.username}
    
    def get_receiver(self, obj):
        return {'id': obj.receiver.id, 'username': obj.receiver.username}
    
    def get_mutual_friends_count(self, obj):
        # Get mutual followers/friends
        sender_following = set(obj.sender.following.all())
        receiver_following = set(obj.receiver.following.all())
        mutual = sender_following.intersection(receiver_following)
        return len(mutual)


class StorySerializer(serializers.ModelSerializer):
    """
    Serializer for Story model
    """
    author = UserSerializer(read_only=True)
    views_count = serializers.IntegerField(read_only=True)
    is_expired = serializers.BooleanField(read_only=True)
    is_viewed_by_me = serializers.SerializerMethodField()
    time_ago = serializers.SerializerMethodField()
    
    class Meta:
        model = Story
        fields = [
            'id', 'author', 'image', 'video', 'text_content',
            'background_color', 'created_at', 'expires_at',
            'views_count', 'is_expired', 'is_viewed_by_me', 'time_ago'
        ]
        read_only_fields = ['id', 'created_at', 'expires_at', 'views_count']
    
    def get_is_viewed_by_me(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return obj.views.filter(id=request.user.id).exists()
        return False
    
    def get_time_ago(self, obj):
        from django.utils.timesince import timesince
        return timesince(obj.created_at)


class StoryCreateSerializer(serializers.ModelSerializer):
    """
    Serializer for creating a story
    """
    class Meta:
        model = Story
        fields = ['image', 'video', 'text_content', 'background_color']
    
    def validate(self, data):
        # At least one content type must be provided
        if not data.get('image') and not data.get('video') and not data.get('text_content'):
            raise serializers.ValidationError(
                "Story must contain at least an image, video, or text content"
            )
        
        # Cannot have both image and video
        if data.get('image') and data.get('video'):
            raise serializers.ValidationError(
                "Story can contain either an image or a video, not both"
            )
        
        return data
    
    def create(self, validated_data):
        # Set expiry time to 24 hours from now
        validated_data['expires_at'] = timezone.now() + timedelta(hours=24)
        return super().create(validated_data)


# Page Serializers
class PageFollowerSerializer(serializers.ModelSerializer):
    """
    Serializer for page followers
    """
    user_details = UserSerializer(source='user', read_only=True)
    
    class Meta:
        model = PageFollower
        fields = ['id', 'user', 'user_details', 'page', 'followed_at', 'notifications_enabled']
        read_only_fields = ['id', 'followed_at']


class PageRoleSerializer(serializers.ModelSerializer):
    """
    Serializer for page roles
    """
    user_details = UserSerializer(source='user', read_only=True)
    
    class Meta:
        model = PageRole
        fields = ['id', 'user', 'user_details', 'page', 'role', 'assigned_at']
        read_only_fields = ['id', 'assigned_at']


class PageSerializer(serializers.ModelSerializer):
    """
    Serializer for pages
    """
    creator_details = UserSerializer(source='creator', read_only=True)
    follower_count = serializers.IntegerField(read_only=True)
    is_following = serializers.SerializerMethodField()
    user_role = serializers.SerializerMethodField()
    roles = PageRoleSerializer(many=True, read_only=True)
    
    class Meta:
        model = Page
        fields = [
            'id', 'name', 'category', 'description', 'profile_picture', 'cover_photo',
            'website', 'email', 'phone', 'address', 'creator', 'creator_details',
            'follower_count', 'is_following', 'user_role', 'is_verified', 'is_published',
            'created_at', 'updated_at', 'roles'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'follower_count', 'is_verified']
    
    def get_is_following(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return PageFollower.objects.filter(user=request.user, page=obj).exists()
        return False
    
    def get_user_role(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            try:
                role = PageRole.objects.get(user=request.user, page=obj)
                return role.role
            except PageRole.DoesNotExist:
                return None
        return None


class PageCreateSerializer(serializers.ModelSerializer):
    """
    Serializer for creating a page
    """
    class Meta:
        model = Page
        fields = [
            'name', 'category', 'description', 'profile_picture', 'cover_photo',
            'website', 'email', 'phone', 'address'
        ]
    
    def validate_name(self, value):
        if Page.objects.filter(name=value).exists():
            raise serializers.ValidationError("A page with this name already exists")
        return value
