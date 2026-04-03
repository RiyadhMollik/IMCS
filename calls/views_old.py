from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from django.db import models
from django.db.models import Q
from django.contrib.auth import get_user_model
import uuid

User = get_user_model()

from .models import (
    Call, CallStatus, Post, Like, Comment, Group, GroupMember,
    DirectMessage, GroupMessage, Notification, FriendRequest, Story,
    Page, PageFollower, PageRole
)
from .serializers import (
    CallSerializer,
    CallCreateSerializer,
    CallActionSerializer,
    CallHistorySerializer,
    PostSerializer,
    PostCreateUpdateSerializer,
    CommentSerializer,
    CommentCreateSerializer,
    LikeSerializer,
    GroupSerializer,
    GroupCreateSerializer,
    GroupMemberSerializer,
    DirectMessageSerializer,
    DirectMessageCreateSerializer,
    GroupMessageSerializer,
    GroupMessageCreateSerializer,
    NotificationSerializer,
    FriendRequestSerializer,
    StorySerializer,
    StoryCreateSerializer,
    PageSerializer,
    PageCreateSerializer,
    PageFollowerSerializer,
    PageRoleSerializer
)


class CallViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Call management
    """
    queryset = Call.objects.all()
    serializer_class = CallSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        """
        Filter calls for current user
        """
        user = self.request.user
        return Call.objects.filter(
            Q(caller=user) | Q(receiver=user)
        )
    
    def get_serializer_class(self):
        if self.action == 'create':
            return CallCreateSerializer
        elif self.action == 'history':
            return CallHistorySerializer
        return CallSerializer
    
    def create(self, request, *args, **kwargs):
        """
        Initiate a new call
        """
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        # Create call with unique room ID
        call = Call.objects.create(
            caller=request.user,
            receiver=serializer.validated_data['receiver'],
            call_type=serializer.validated_data['call_type'],
            status=CallStatus.INITIATED,
            room_id=str(uuid.uuid4())
        )
        
        # Send incoming call notification to receiver via WebSocket
        channel_layer = get_channel_layer()
        receiver_channel = f'user_{call.receiver.id}'
        
        print(f"📞 Sending call notification to channel: {receiver_channel}")
        print(f"   Caller: {call.caller.username}, Receiver: {call.receiver.username}")
        print(f"   Call ID: {call.id}, Room: {call.room_id}")
        
        try:
            async_to_sync(channel_layer.group_send)(
                receiver_channel,
                {
                    'type': 'incoming_call',
                    'call_id': call.id,
                    'caller': call.caller.id,
                    'caller_username': call.caller.username,
                    'call_type': call.call_type,
                    'room_id': call.room_id
                }
            )
            print(f"✅ Call notification sent successfully")
        except Exception as e:
            print(f"❌ Error sending call notification: {e}")
        
        response_serializer = CallSerializer(call)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)
    
    @action(detail=False, methods=['post'])
    def start(self, request):
        """
        Custom action to start a call (alias for create)
        Supports both receiver ID and receiver_username
        """
        return self.create(request)
    
    @action(detail=True, methods=['post'])
    def accept(self, request, pk=None):
        """
        Accept an incoming call
        """
        call = self.get_object()
        
        # Validate that user is the receiver
        if call.receiver != request.user:
            return Response(
                {'error': 'You are not authorized to accept this call'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Validate call status
        if call.status not in [CallStatus.INITIATED, CallStatus.RINGING]:
            return Response(
                {'error': f'Call cannot be accepted. Current status: {call.status}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        call.status = CallStatus.ACCEPTED
        call.accepted_at = timezone.now()
        call.save()
        
        serializer = self.get_serializer(call)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """
        Reject an incoming call
        """
        call = self.get_object()
        
        # Validate that user is the receiver
        if call.receiver != request.user:
            return Response(
                {'error': 'You are not authorized to reject this call'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Validate call status
        if call.status not in [CallStatus.INITIATED, CallStatus.RINGING]:
            return Response(
                {'error': f'Call cannot be rejected. Current status: {call.status}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        call.status = CallStatus.REJECTED
        call.ended_at = timezone.now()
        call.save()
        
        serializer = self.get_serializer(call)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def end(self, request, pk=None):
        """
        End an ongoing call
        """
        call = self.get_object()
        
        # Validate that user is part of the call
        if call.caller != request.user and call.receiver != request.user:
            return Response(
                {'error': 'You are not part of this call'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Only end if call is ongoing
        if call.status == CallStatus.ACCEPTED:
            call.status = CallStatus.ENDED
            call.ended_at = timezone.now()
            call.calculate_duration()
            call.save()
        
        serializer = self.get_serializer(call)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """
        Cancel a call before it's answered (caller only)
        """
        call = self.get_object()
        
        # Validate that user is the caller
        if call.caller != request.user:
            return Response(
                {'error': 'Only the caller can cancel the call'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Can only cancel if not yet accepted
        if call.status in [CallStatus.INITIATED, CallStatus.RINGING]:
            call.status = CallStatus.CANCELLED
            call.ended_at = timezone.now()
            call.save()
        else:
            return Response(
                {'error': f'Cannot cancel call with status: {call.status}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        serializer = self.get_serializer(call)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def history(self, request):
        """
        Get call history for current user
        """
        user = request.user
        calls = Call.objects.filter(
            Q(caller=user) | Q(receiver=user)
        ).exclude(status=CallStatus.INITIATED)[:50]  # Last 50 calls
        
        serializer = self.get_serializer(calls, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def active(self, request):
        """
        Get active calls for current user
        """
        user = request.user
        active_calls = Call.objects.filter(
            Q(caller=user) | Q(receiver=user),
            status__in=[CallStatus.INITIATED, CallStatus.RINGING, CallStatus.ACCEPTED]
        )
        
        serializer = self.get_serializer(active_calls, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def missed(self, request):
        """
        Get missed calls for current user
        """
        user = request.user
        missed_calls = Call.objects.filter(
            receiver=user,
            status=CallStatus.MISSED
        )
        
        serializer = CallHistorySerializer(missed_calls, many=True)
        return Response(serializer.data)


# ============ POST VIEWSET ============

class PostViewSet(viewsets.ModelViewSet):
    """
    ViewSet for posts in jvai community
    """
    queryset = Post.objects.all()
    serializer_class = PostSerializer
    permission_classes = [IsAuthenticated]
    
    def get_serializer_class(self):
        if self.action in ['create', 'partial_update', 'update']:
            return PostCreateUpdateSerializer
        return PostSerializer
    
    def perform_create(self, serializer):
        """Create post with current user as author"""
        serializer.save(author=self.request.user)
    
    @action(detail=True, methods=['post'])
    def like(self, request, pk=None):
        """Like a post"""
        post = self.get_object()
        
        like, created = Like.objects.get_or_create(
            user=request.user,
            post=post
        )
        
        if not created:
            like.delete()
            return Response(
                {'message': 'Post unliked', 'liked': False},
                status=status.HTTP_200_OK
            )
        
        return Response(
            {'message': 'Post liked', 'liked': True},
            status=status.HTTP_201_CREATED
        )
    
    @action(detail=False, methods=['get'])
    def feed(self, request):
        """Get feed for current user (posts from followed users)"""
        user = request.user
        # Get posts from users that current user follows
        posts = Post.objects.filter(
            author__in=user.followers.all()
        ) | Post.objects.filter(author=user)
        
        posts = posts.order_by('-created_at')
        serializer = self.get_serializer(posts, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def my_posts(self, request):
        """Get current user's posts"""
        posts = Post.objects.filter(author=request.user).order_by('-created_at')
        serializer = self.get_serializer(posts, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get', 'post'])
    def comments(self, request, pk=None):
        """Get or create comments for a post"""
        post = self.get_object()
        
        if request.method == 'GET':
            comments = Comment.objects.filter(post=post).order_by('created_at')
            serializer = CommentSerializer(comments, many=True, context={'request': request})
            return Response(serializer.data)
        
        elif request.method == 'POST':
            serializer = CommentCreateSerializer(data=request.data)
            if serializer.is_valid():
                comment = serializer.save(author=request.user, post=post)
                # Return the full comment with author info
                response_serializer = CommentSerializer(comment, context={'request': request})
                return Response(response_serializer.data, status=status.HTTP_201_CREATED)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# ============ COMMENT VIEWSET ============

class CommentViewSet(viewsets.ModelViewSet):
    """
    ViewSet for comments on posts
    """
    queryset = Comment.objects.all()
    serializer_class = CommentSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        """Filter comments by post if provided"""
        queryset = Comment.objects.all()
        post_id = self.request.query_params.get('post_id')
        if post_id:
            queryset = queryset.filter(post_id=post_id)
        return queryset
    
    def perform_create(self, serializer):
        """Create comment with current user as author"""
        serializer.save(author=self.request.user)
    
    @action(detail=True, methods=['post'])
    def like(self, request, pk=None):
        """Like a comment"""
        comment = self.get_object()
        
        like, created = Like.objects.get_or_create(
            user=request.user,
            comment=comment
        )
        
        if not created:
            like.delete()
            return Response(
                {'message': 'Comment unliked', 'liked': False},
                status=status.HTTP_200_OK
            )
        
        return Response(
            {'message': 'Comment liked', 'liked': True},
            status=status.HTTP_201_CREATED
        )


# ============ GROUP VIEWSET ============

class GroupViewSet(viewsets.ModelViewSet):
    """
    ViewSet for group management
    """
    queryset = Group.objects.select_related('creator').prefetch_related('members')
    serializer_class = GroupSerializer
    permission_classes = [IsAuthenticated]
    
    def get_serializer_class(self):
        if self.action in ['create', 'partial_update', 'update']:
            return GroupCreateSerializer
        return GroupSerializer
    
    def perform_create(self, serializer):
        """Create group with current user as creator"""
        group = serializer.save(creator=self.request.user)
        # Add creator as admin member
        GroupMember.objects.create(
            user=self.request.user,
            group=group,
            role='admin'
        )
    
    @action(detail=True, methods=['post'])
    def join(self, request, pk=None):
        """Join a group"""
        group = self.get_object()
        
        # Check if already a member
        existing_member = GroupMember.objects.filter(user=request.user, group=group).first()
        
        if existing_member:
            if existing_member.status == 'approved':
                return Response(
                    {'message': 'Already a member of this group'},
                    status=status.HTTP_200_OK
                )
            elif existing_member.status == 'pending':
                return Response(
                    {'message': 'Your join request is pending approval'},
                    status=status.HTTP_200_OK
                )
        
        # Determine status based on group privacy
        if group.privacy == 'public':
            member_status = 'approved'
            message = 'Joined group successfully'
        else:
            member_status = 'pending'
            message = 'Join request sent. Waiting for approval'
        
        member, created = GroupMember.objects.get_or_create(
            user=request.user,
            group=group,
            defaults={'role': 'member', 'status': member_status}
        )
        
        return Response(
            {'message': message, 'status': member_status},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK
        )
    
    @action(detail=True, methods=['post'])
    def leave(self, request, pk=None):
        """Leave a group"""
        group = self.get_object()
        
        try:
            member = GroupMember.objects.get(user=request.user, group=group)
            member.delete()
            return Response(
                {'message': 'Left group successfully'},
                status=status.HTTP_200_OK
            )
        except GroupMember.DoesNotExist:
            return Response(
                {'message': 'You are not a member of this group'},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=False, methods=['get'])
    def my_groups(self, request):
        """Get groups current user is a member of"""
        groups = Group.objects.filter(members=request.user)
        serializer = self.get_serializer(groups, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get', 'post'])
    def messages(self, request, pk=None):
        """Get or post messages for a group"""
        group = self.get_object()
        
        # Check if user is member of group
        if not group.members.filter(id=request.user.id).exists():
            return Response(
                {'error': 'You are not a member of this group'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        if request.method == 'GET':
            messages = GroupMessage.objects.filter(group=group).select_related('sender').order_by('created_at')
            serializer = GroupMessageSerializer(messages, many=True, context={'request': request})
            return Response(serializer.data)
        
        elif request.method == 'POST':
            serializer = GroupMessageCreateSerializer(data=request.data, context={'request': request})
            if serializer.is_valid():
                serializer.save(sender=request.user, group=group)
                response_serializer = GroupMessageSerializer(
                    serializer.instance,
                    context={'request': request}
                )
                return Response(response_serializer.data, status=status.HTTP_201_CREATED)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['post'])
    def approve_member(self, request, pk=None):
        """Approve a pending member (admin/moderator only)"""
        group = self.get_object()
        user_id = request.data.get('user_id')
        
        # Check if requester is admin/moderator
        try:
            requester_member = GroupMember.objects.get(user=request.user, group=group, status='approved')
            if requester_member.role not in ['admin', 'moderator']:
                return Response(
                    {'error': 'Only admins and moderators can approve members'},
                    status=status.HTTP_403_FORBIDDEN
                )
        except GroupMember.DoesNotExist:
            return Response(
                {'error': 'You are not a member of this group'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Approve the member
        try:
            member = GroupMember.objects.get(user_id=user_id, group=group, status='pending')
            member.status = 'approved'
            member.save()
            return Response({'message': 'Member approved successfully'})
        except GroupMember.DoesNotExist:
            return Response(
                {'error': 'Pending member not found'},
                status=status.HTTP_404_NOT_FOUND
            )


# ============ PAGE VIEWSET ============

class PageViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Page management
    """
    queryset = Page.objects.select_related('creator').prefetch_related('followers')
    serializer_class = PageSerializer
    permission_classes = [IsAuthenticated]
    
    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return PageCreateSerializer
        return PageSerializer
    
    def get_queryset(self):
        queryset = super().get_queryset()
        # Filter by category if specified
        category = self.request.query_params.get('category')
        if category:
            queryset = queryset.filter(category=category)
        # Only show published pages
        return queryset.filter(is_published=True)
    
    def perform_create(self, serializer):
        """Create page with current user as creator and admin"""
        page = serializer.save(creator=self.request.user)
        # Add creator as page admin
        PageRole.objects.create(
            user=self.request.user,
            page=page,
            role='admin'
        )
    
    @action(detail=True, methods=['post'])
    def follow(self, request, pk=None):
        """Follow a page"""
        page = self.get_object()
        
        follower, created = PageFollower.objects.get_or_create(
            user=request.user,
            page=page
        )
        
        if created:
            return Response(
                {'message': 'Following page successfully'},
                status=status.HTTP_201_CREATED
            )
        return Response(
            {'message': 'Already following this page'},
            status=status.HTTP_200_OK
        )
    
    @action(detail=True, methods=['post'])
    def unfollow(self, request, pk=None):
        """Unfollow a page"""
        page = self.get_object()
        
        try:
            follower = PageFollower.objects.get(user=request.user, page=page)
            follower.delete()
            return Response(
                {'message': 'Unfollowed page successfully'},
                status=status.HTTP_200_OK
            )
        except PageFollower.DoesNotExist:
            return Response(
                {'message': 'You are not following this page'},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=False, methods=['get'])
    def my_pages(self, request):
        """Get pages created by current user"""
        pages = Page.objects.filter(creator=request.user)
        serializer = self.get_serializer(pages, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def following(self, request):
        """Get pages followed by current user"""
        page_ids = PageFollower.objects.filter(user=request.user).values_list('page_id', flat=True)
        pages = Page.objects.filter(id__in=page_ids)
        serializer = self.get_serializer(pages, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def followers(self, request, pk=None):
        """Get followers of a page"""
        page = self.get_object()
        followers = PageFollower.objects.filter(page=page).select_related('user')
        serializer = PageFollowerSerializer(followers, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def add_role(self, request, pk=None):
        """Add a role to a user (admin only)"""
        page = self.get_object()
        
        # Check if requester is admin
        try:
            requester_role = PageRole.objects.get(user=request.user, page=page)
            if requester_role.role != 'admin':
                return Response(
                    {'error': 'Only admins can assign roles'},
                    status=status.HTTP_403_FORBIDDEN
                )
        except PageRole.DoesNotExist:
            return Response(
                {'error': 'You do not have permission to manage this page'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Add role to user
        user_id = request.data.get('user_id')
        role = request.data.get('role')
        
        if role not in ['admin', 'editor', 'moderator']:
            return Response(
                {'error': 'Invalid role'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            user = User.objects.get(id=user_id)
            page_role, created = PageRole.objects.get_or_create(
                user=user,
                page=page,
                defaults={'role': role}
            )
            
            if not created:
                page_role.role = role
                page_role.save()
            
            return Response(
                {'message': f'Role {role} assigned successfully'},
                status=status.HTTP_201_CREATED if created else status.HTTP_200_OK
            )
        except User.DoesNotExist:
            return Response(
                {'error': 'User not found'},
                status=status.HTTP_404_NOT_FOUND
            )


# ============ DIRECT MESSAGE VIEWSET ============

class DirectMessageViewSet(viewsets.ModelViewSet):
    """
    ViewSet for direct messaging
    """
    queryset = DirectMessage.objects.all()
    serializer_class = DirectMessageSerializer
    permission_classes = [IsAuthenticated]
    
    def get_serializer_class(self):
        if self.action == 'create':
            return DirectMessageCreateSerializer
        return DirectMessageSerializer
    
    def perform_create(self, serializer):
        """Create message with current user as sender"""
        serializer.save(sender=self.request.user)
    
    def get_queryset(self):
        """Get messages for current user (only with friends)"""
        user = self.request.user
        
        # Get list of friends (accepted friend requests)
        friend_requests = FriendRequest.objects.filter(
            Q(sender=user, status='accepted') |
            Q(receiver=user, status='accepted')
        )
        
        friend_ids = set()
        for fr in friend_requests:
            if fr.sender == user:
                friend_ids.add(fr.receiver.id)
            else:
                friend_ids.add(fr.sender.id)
        
        # Return messages only with friends
        return DirectMessage.objects.filter(
            Q(sender=user, receiver_id__in=friend_ids) |
            Q(receiver=user, sender_id__in=friend_ids)
        )
    
    @action(detail=False, methods=['get'])
    def conversations(self, request):
        """Get list of conversations for current user (only with friends)"""
        user = request.user
        
        # Get list of friends (accepted friend requests)
        friend_requests = FriendRequest.objects.filter(
            Q(sender=user, status='accepted') |
            Q(receiver=user, status='accepted')
        )
        
        friend_ids = set()
        for fr in friend_requests:
            if fr.sender == user:
                friend_ids.add(fr.receiver.id)
            else:
                friend_ids.add(fr.sender.id)
        
        # Get unique conversations only with friends
        sent = DirectMessage.objects.filter(sender=user, receiver_id__in=friend_ids).values_list('receiver_id', flat=True).distinct()
        received = DirectMessage.objects.filter(receiver=user, sender_id__in=friend_ids).values_list('sender_id', flat=True).distinct()
        
        conversation_users = set(sent) | set(received)
        
        users = User.objects.filter(id__in=conversation_users)
        from users.serializers import UserSerializer
        serializer = UserSerializer(users, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def with_user(self, request):
        """Get conversation with a specific user (only if friends)"""
        user_id = request.query_params.get('user_id')
        username = request.query_params.get('username')
        
        if not user_id and not username:
            return Response(
                {'error': 'Provide either user_id or username'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            if user_id:
                other_user = User.objects.get(id=user_id)
            else:
                other_user = User.objects.get(username=username)
        except User.DoesNotExist:
            return Response(
                {'error': 'User not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Check if users are friends
        are_friends = FriendRequest.objects.filter(
            Q(sender=request.user, receiver=other_user, status='accepted') |
            Q(sender=other_user, receiver=request.user, status='accepted')
        ).exists()
        
        if not are_friends:
            return Response(
                {'error': 'You can only view messages with users who are your friends'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        messages = DirectMessage.objects.filter(
            Q(sender=request.user, receiver=other_user) |
            Q(sender=other_user, receiver=request.user)
        ).order_by('created_at')
        
        serializer = self.get_serializer(messages, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def mark_as_read(self, request, pk=None):
        """Mark message as read"""
        message = self.get_object()
        
        if message.receiver != request.user:
            return Response(
                {'error': 'You can only mark your received messages as read'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        message.is_read = True
        message.save()
        
        serializer = self.get_serializer(message)
        return Response(serializer.data)


# ============ GROUP MESSAGE VIEWSET ============

class GroupMessageViewSet(viewsets.ModelViewSet):
    """
    ViewSet for group messages
    """
    queryset = GroupMessage.objects.all()
    serializer_class = GroupMessageSerializer
    permission_classes = [IsAuthenticated]
    
    def get_serializer_class(self):
        if self.action == 'create':
            return GroupMessageCreateSerializer
        return GroupMessageSerializer
    
    def perform_create(self, serializer):
        """Create message with current user as sender"""
        serializer.save(sender=self.request.user)
    
    def get_queryset(self):
        """Get messages from groups user is member of"""
        user = self.request.user
        groups = user.jvai_groups.all()
        return GroupMessage.objects.filter(group__in=groups)
    
    @action(detail=False, methods=['get'])
    def group_messages(self, request):
        """Get messages for a specific group"""
        group_id = request.query_params.get('group_id')
        
        if not group_id:
            return Response(
                {'error': 'group_id parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            group = Group.objects.get(id=group_id)
        except Group.DoesNotExist:
            return Response(
                {'error': 'Group not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Check if user is member of group
        if not group.members.filter(id=request.user.id).exists():
            return Response(
                {'error': 'You are not a member of this group'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        messages = GroupMessage.objects.filter(group=group).order_by('created_at')
        serializer = self.get_serializer(messages, many=True)
        return Response(serializer.data)


# ============ NOTIFICATION VIEWSET ============

class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for notifications
    """
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        """Get notifications for current user"""
        return Notification.objects.filter(user=self.request.user).select_related('actor', 'post', 'comment')
    
    @action(detail=True, methods=['post'])
    def mark_as_read(self, request, pk=None):
        """Mark notification as read"""
        notification = self.get_object()
        notification.is_read = True
        notification.save()
        
        serializer = self.get_serializer(notification)
        return Response(serializer.data)
    
    @action(detail=False, methods=['post'])
    def mark_all_as_read(self, request):
        """Mark all notifications as read"""
        Notification.objects.filter(user=request.user, is_read=False).update(is_read=True)
        return Response({'message': 'All notifications marked as read'})
    
    @action(detail=False, methods=['get'])
    def unread_count(self, request):
        """Get count of unread notifications"""
        count = Notification.objects.filter(user=request.user, is_read=False).count()
        return Response({'count': count})


# ============ FRIEND REQUEST VIEWSET ============

class FriendRequestViewSet(viewsets.ModelViewSet):
    """
    ViewSet for friend requests
    """
    serializer_class = FriendRequestSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        """Get friend requests for current user"""
        if self.action == 'received':
            return FriendRequest.objects.filter(
                receiver=self.request.user,
                status='pending'
            ).select_related('sender', 'receiver')
        elif self.action == 'sent':
            return FriendRequest.objects.filter(
                sender=self.request.user,
                status='pending'
            ).select_related('sender', 'receiver')
        
        return FriendRequest.objects.filter(
            models.Q(sender=self.request.user) | models.Q(receiver=self.request.user)
        ).select_related('sender', 'receiver')
    
    def create(self, request, *args, **kwargs):
        """Send a friend request"""
        receiver_id = request.data.get('receiver_id')
        
        if not receiver_id:
            return Response(
                {'error': 'receiver_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            receiver = User.objects.get(id=receiver_id)
        except User.DoesNotExist:
            return Response(
                {'error': 'User not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        if receiver == request.user:
            return Response(
                {'error': 'Cannot send friend request to yourself'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Check if friend request already exists
        existing_request = FriendRequest.objects.filter(
            models.Q(sender=request.user, receiver=receiver) |
            models.Q(sender=receiver, receiver=request.user)
        ).first()
        
        if existing_request:
            if existing_request.status == 'pending':
                return Response(
                    {'error': 'Friend request already exists'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            elif existing_request.status == 'accepted':
                return Response(
                    {'error': 'You are already friends'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        # Create friend request
        friend_request = FriendRequest.objects.create(
            sender=request.user,
            receiver=receiver
        )
        
        # Create notification
        Notification.objects.create(
            user=receiver,
            actor=request.user,
            notification_type='friend_request'
        )
        
        serializer = self.get_serializer(friend_request)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    
    @action(detail=True, methods=['post'])
    def accept(self, request, pk=None):
        """Accept a friend request"""
        friend_request = self.get_object()
        
        if friend_request.receiver != request.user:
            return Response(
                {'error': 'You cannot accept this friend request'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        if friend_request.status != 'pending':
            return Response(
                {'error': 'Friend request is not pending'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        friend_request.status = 'accepted'
        friend_request.save()
        
        # Add each other as followers
        request.user.follow(friend_request.sender)
        friend_request.sender.follow(request.user)
        
        # Create notification
        Notification.objects.create(
            user=friend_request.sender,
            actor=request.user,
            notification_type='friend_accept'
        )
        
        serializer = self.get_serializer(friend_request)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Reject a friend request"""
        friend_request = self.get_object()
        
        if friend_request.receiver != request.user:
            return Response(
                {'error': 'You cannot reject this friend request'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        if friend_request.status != 'pending':
            return Response(
                {'error': 'Friend request is not pending'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        friend_request.status = 'rejected'
        friend_request.save()
        
        serializer = self.get_serializer(friend_request)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def received(self, request):
        """Get received friend requests"""
        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def sent(self, request):
        """Get sent friend requests"""
        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def friends(self, request):
        """Get list of friends (accepted friend requests)"""
        friends_as_sender = FriendRequest.objects.filter(
            sender=request.user,
            status='accepted'
        ).select_related('receiver')
        
        friends_as_receiver = FriendRequest.objects.filter(
            receiver=request.user,
            status='accepted'
        ).select_related('sender')
        
        friends = []
        for fr in friends_as_sender:
            friends.append({
                'id': fr.receiver.id,
                'username': fr.receiver.username,
                'is_online': fr.receiver.is_online,
            })
        
        for fr in friends_as_receiver:
            friends.append({
                'id': fr.sender.id,
                'username': fr.sender.username,
                'is_online': fr.sender.is_online,
            })
        
        return Response(friends)


class StoryViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Story management
    """
    queryset = Story.objects.all()
    serializer_class = StorySerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        """
        Return active (non-expired) stories from friends and self
        """
        user = self.request.user
        
        # Get friends (users you follow)
        friends = user.following.all()
        
        # Get non-expired stories from friends and self
        return Story.objects.filter(
            models.Q(author__in=friends) | models.Q(author=user),
            expires_at__gt=timezone.now()
        ).select_related('author').prefetch_related('views').order_by('-created_at')
    
    def get_serializer_class(self):
        if self.action == 'create':
            return StoryCreateSerializer
        return StorySerializer
    
    def perform_create(self, serializer):
        """Create story with current user as author"""
        serializer.save(author=self.request.user)
    
    @action(detail=True, methods=['post'])
    def view_story(self, request, pk=None):
        """Mark story as viewed by current user"""
        story = self.get_object()
        
        # Add user to viewers if not already viewed
        if not story.views.filter(id=request.user.id).exists():
            story.views.add(request.user)
        
        return Response({
            'message': 'Story viewed',
            'views_count': story.views_count
        })
    
    @action(detail=False, methods=['get'])
    def my_stories(self, request):
        """Get current user's active stories"""
        stories = Story.objects.filter(
            author=request.user,
            expires_at__gt=timezone.now()
        ).order_by('-created_at')
        
        serializer = self.get_serializer(stories, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def friends_stories(self, request):
        """Get stories grouped by user"""
        user = request.user
        friends = user.following.all()
        
        # Get all active stories from friends
        stories = Story.objects.filter(
            author__in=friends,
            expires_at__gt=timezone.now()
        ).select_related('author').prefetch_related('views').order_by('author', '-created_at')
        
        # Group stories by author
        stories_by_user = {}
        for story in stories:
            author_id = story.author.id
            if author_id not in stories_by_user:
                stories_by_user[author_id] = {
                    'user': {
                        'id': story.author.id,
                        'username': story.author.username,
                        'profile_pic': story.author.profile_picture.url if story.author.profile_picture else None,
                    },
                    'stories': [],
                    'has_unseen': False
                }
            
            serialized_story = StorySerializer(story, context={'request': request}).data
            stories_by_user[author_id]['stories'].append(serialized_story)
            
            # Check if user has unseen stories
            if not story.views.filter(id=request.user.id).exists():
                stories_by_user[author_id]['has_unseen'] = True
        
        return Response(list(stories_by_user.values()))
    
    @action(detail=True, methods=['delete'])
    def delete_story(self, request, pk=None):
        """Delete own story"""
        story = self.get_object()
        
        # Only author can delete
        if story.author != request.user:
            return Response(
                {'error': 'You can only delete your own stories'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        story.delete()
        return Response(
            {'message': 'Story deleted successfully'},
            status=status.HTTP_204_NO_CONTENT
        )
