from rest_framework import viewsets, status, generics
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from django.contrib.auth import get_user_model
from django.db.models import Q

from .serializers import (
    UserSerializer,
    UserRegistrationSerializer,
    UserUpdateSerializer,
    OnlineStatusSerializer,
    UserLoginSerializer,
    UserSettingsSerializer,
    PresenceUpdateSerializer,
    ChangePasswordSerializer,
)
from .models import UserContact, UserSettings, OnlineStatus

User = get_user_model()


class UserRegistrationView(generics.CreateAPIView):
    """
    Public endpoint for user registration
    """

    queryset = User.objects.all()
    serializer_class = UserRegistrationSerializer
    permission_classes = [AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        from rest_framework_simplejwt.tokens import RefreshToken
        refresh = RefreshToken.for_user(user)
        user_data = UserSerializer(user).data
        return Response({
            'user': user_data,
            'access': str(refresh.access_token),
            'refresh': str(refresh),
        }, status=status.HTTP_201_CREATED)


class UserLoginView(generics.GenericAPIView):
    """
    Public endpoint for user login
    """
    serializer_class = UserLoginSerializer
    permission_classes = [AllowAny]
    
    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(serializer.validated_data, status=status.HTTP_200_OK)


class UserViewSet(viewsets.ModelViewSet):
    """
    ViewSet for User model
    """
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]
    
    def get_serializer_class(self):
        if self.action == 'create':
            return UserRegistrationSerializer
        elif self.action in ['update', 'partial_update']:
            return UserUpdateSerializer
        return UserSerializer
    
    def get_permissions(self):
        if self.action == 'create':
            return [AllowAny()]
        return super().get_permissions()
    
    @action(detail=False, methods=['get'])
    def me(self, request):
        """
        Get current user profile
        """
        serializer = self.get_serializer(request.user)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def online(self, request):
        """
        Get list of online users (contacts only)
        """
        # Get user's contacts who are online
        contacts = request.user.contacts.filter(is_online=True)
        serializer = UserSerializer(contacts, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def contacts(self, request):
        """
        Get user's contact list
        """
        contact_links = (
            UserContact.objects
            .filter(user=request.user, is_blocked=False)
            .select_related('contact')
            .order_by('contact__username')
        )

        contacts_data = []
        for link in contact_links:
            item = UserSerializer(link.contact).data
            item['alias'] = link.alias
            item['is_favorite'] = link.is_favorite
            contacts_data.append(item)

        return Response(contacts_data)

    @action(detail=False, methods=['post'])
    def add_contact(self, request):
        """
        Add user to current user's contacts
        """
        contact_id = request.data.get('contact_id')
        username = request.data.get('username')

        if not contact_id and not username:
            return Response(
                {'error': 'Provide contact_id or username.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        contact_qs = User.objects.all()
        if contact_id:
            contact_qs = contact_qs.filter(id=contact_id)
        else:
            contact_qs = contact_qs.filter(username=username)

        contact = contact_qs.first()
        if not contact:
            return Response(
                {'error': 'User not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if contact.id == request.user.id:
            return Response(
                {'error': 'You cannot add yourself as a contact.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        link, created = UserContact.objects.get_or_create(
            user=request.user,
            contact=contact,
            defaults={'is_blocked': False},
        )

        if not created and link.is_blocked:
            link.is_blocked = False
            link.save(update_fields=['is_blocked'])

        return Response(
            {
                'status': 'contact_added' if created else 'contact_already_exists',
                'contact': UserSerializer(contact).data,
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    @action(detail=False, methods=['post'])
    def remove_contact(self, request):
        """
        Remove a user from current user's contacts
        """
        contact_id = request.data.get('contact_id')
        if not contact_id:
            return Response(
                {'error': 'contact_id is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        deleted_count, _ = UserContact.objects.filter(
            user=request.user,
            contact_id=contact_id,
        ).delete()

        if deleted_count == 0:
            return Response(
                {'error': 'Contact not found in your list.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response({'status': 'contact_removed'})

    @action(detail=False, methods=['post'])
    def toggle_favorite_contact(self, request):
        contact_id = request.data.get('contact_id')
        if not contact_id:
            return Response({'error': 'contact_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        link = UserContact.objects.filter(user=request.user, contact_id=contact_id).first()
        if not link:
            return Response({'error': 'Contact not found in your list.'}, status=status.HTTP_404_NOT_FOUND)

        link.is_favorite = not link.is_favorite
        link.save(update_fields=['is_favorite'])
        return Response({'status': 'favorite' if link.is_favorite else 'unfavorite', 'is_favorite': link.is_favorite})

    @action(detail=False, methods=['get', 'patch'], url_path='settings')
    def user_settings(self, request):
        settings_obj, _ = UserSettings.objects.get_or_create(user=request.user)

        if request.method == 'GET':
            return Response(UserSettingsSerializer(settings_obj).data)

        serializer = UserSettingsSerializer(settings_obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    @action(detail=False, methods=['post'])
    def set_presence(self, request):
        serializer = PresenceUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        status_value = serializer.validated_data['online_status']
        request.user.online_status = status_value
        if status_value == OnlineStatus.INVISIBLE:
            request.user.is_online = False
        else:
            request.user.is_online = True
        request.user.save(update_fields=['online_status', 'is_online', 'last_seen'])

        return Response({'online_status': request.user.online_status, 'is_online': request.user.is_online})

    @action(detail=False, methods=['post'])
    def change_password(self, request):
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        current_password = serializer.validated_data['current_password']
        new_password = serializer.validated_data['new_password']

        if not request.user.check_password(current_password):
            return Response({'error': 'Current password is incorrect.'}, status=status.HTTP_400_BAD_REQUEST)

        request.user.set_password(new_password)
        request.user.save(update_fields=['password'])
        return Response({'status': 'password_changed'})

    @action(detail=False, methods=['post'])
    def verify_password(self, request):
        password = request.data.get('password')
        if not password:
            return Response({'error': 'password is required.'}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'valid': request.user.check_password(password)})
    
    @action(detail=False, methods=['get'])
    def online_users(self, request):
        """
        Get list of online users
        """
        online_users = User.objects.filter(is_online=True).exclude(id=request.user.id)

        search = request.query_params.get('search')
        if search:
            online_users = online_users.filter(
                Q(username__icontains=search)
                | Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
            )

        serializer = OnlineStatusSerializer(online_users, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def status(self, request, pk=None):
        """
        Get user online status
        """
        user = self.get_object()
        serializer = OnlineStatusSerializer(user)
        return Response(serializer.data)
    
    @action(detail=False, methods=['post'])
    def set_online(self, request):
        """
        Set user as online
        """
        request.user.is_online = True
        if request.user.online_status == OnlineStatus.INVISIBLE:
            request.user.online_status = OnlineStatus.AVAILABLE
        request.user.save(update_fields=['is_online', 'online_status', 'last_seen'])
        return Response({'status': 'online'})
    
    @action(detail=False, methods=['post'])
    def set_offline(self, request):
        """
        Set user as offline
        """
        request.user.is_online = False
        request.user.save(update_fields=['is_online', 'last_seen'])
        return Response({'status': 'offline'})
    
