from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import UserViewSet, UserRegistrationView, UserLoginView

router = DefaultRouter()
router.register(r'', UserViewSet, basename='user')

urlpatterns = [
    path('register/', UserRegistrationView.as_view(), name='user-register'),
    path('login/', UserLoginView.as_view(), name='user-login'),
    path('online/', UserViewSet.as_view({'get': 'online_users'}), name='online-users'),
    path('set-online/', UserViewSet.as_view({'post': 'set_online'}), name='set-online'),
    path('set-offline/', UserViewSet.as_view({'post': 'set_offline'}), name='set-offline'),
    path('', include(router.urls)),
]
