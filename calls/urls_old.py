from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    CallViewSet, PostViewSet, CommentViewSet, GroupViewSet,
    DirectMessageViewSet, GroupMessageViewSet, NotificationViewSet, 
    FriendRequestViewSet, StoryViewSet, PageViewSet
)

router = DefaultRouter()
router.register(r'calls', CallViewSet, basename='call')
router.register(r'posts', PostViewSet, basename='post')
router.register(r'comments', CommentViewSet, basename='comment')
router.register(r'groups', GroupViewSet, basename='group')
router.register(r'pages', PageViewSet, basename='page')
router.register(r'messages', DirectMessageViewSet, basename='direct-message')
router.register(r'group-messages', GroupMessageViewSet, basename='group-message')
router.register(r'notifications', NotificationViewSet, basename='notification')
router.register(r'friend-requests', FriendRequestViewSet, basename='friend-request')
router.register(r'stories', StoryViewSet, basename='story')

urlpatterns = [
    # All ViewSet endpoints
    path('', include(router.urls)),
]
