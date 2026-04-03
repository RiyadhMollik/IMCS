from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import CallViewSet, ConferenceCallViewSet

router = DefaultRouter()
router.register(r"calls", CallViewSet, basename="call")
router.register(r"conference-calls", ConferenceCallViewSet, basename="conference-call")

urlpatterns = [
	path("", include(router.urls)),
]
