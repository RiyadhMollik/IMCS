from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import File, FileAccessLog, FileRecipient, UserStorageQuota
from .serializers import FileSerializer, FileUploadSerializer


class FileViewSet(viewsets.ModelViewSet):
	permission_classes = [IsAuthenticated]
	parser_classes = [MultiPartParser, FormParser]

	def get_queryset(self):
		user = self.request.user
		return (
			File.objects.filter(owner=user)
			| File.objects.filter(recipients__user=user, recipients__can_view=True)
		).distinct()

	def get_serializer_class(self):
		if self.action == "create":
			return FileUploadSerializer
		return FileSerializer

	def perform_create(self, serializer):
		file_obj = serializer.save(owner=self.request.user, encrypted=True)
		if not file_obj.expires_at:
			file_obj.set_expiration(90)

		quota, _ = UserStorageQuota.objects.get_or_create(user=self.request.user)
		quota.add_usage(file_obj.file_size)

		recipient_ids = serializer.validated_data.get("recipient_ids", [])
		for user_id in recipient_ids:
			FileRecipient.objects.get_or_create(
				file=file_obj,
				user_id=user_id,
				defaults={
					"can_view": serializer.validated_data.get("can_view", True),
					"can_download": serializer.validated_data.get("can_download", False),
					"can_export": serializer.validated_data.get("can_export", False),
					"can_share": serializer.validated_data.get("can_share", False),
				},
			)

	@action(detail=True, methods=["get"])
	def open(self, request, pk=None):
		file_obj = self.get_object()
		if file_obj.owner != request.user:
			recipient = get_object_or_404(FileRecipient, file=file_obj, user=request.user)
			if not recipient.can_view:
				return Response({"error": "Viewing not allowed."}, status=403)
			recipient.record_access()

		file_obj.update_last_viewed()
		FileAccessLog.objects.create(file=file_obj, user=request.user, action="view")
		return Response(FileSerializer(file_obj, context={"request": request}).data)

	@action(detail=True, methods=["get"])
	def download(self, request, pk=None):
		file_obj = self.get_object()

		if file_obj.owner != request.user:
			recipient = get_object_or_404(FileRecipient, file=file_obj, user=request.user)
			if not recipient.can_download:
				return Response({"error": "Download not allowed."}, status=403)
			recipient.record_download()

		FileAccessLog.objects.create(file=file_obj, user=request.user, action="download")
		return FileResponse(file_obj.file.open("rb"), as_attachment=True, filename=file_obj.name)

	@action(detail=False, methods=["get"])
	def my_quota(self, request):
		quota, _ = UserStorageQuota.objects.get_or_create(user=request.user)
		return Response(
			{
				"total_quota_mb": quota.total_quota,
				"used_mb": quota.get_used_mb(),
				"available_mb": quota.get_available_mb(),
				"max_file_size_mb": quota.max_file_size,
			}
		)

	def destroy(self, request, *args, **kwargs):
		file_obj = self.get_object()
		if file_obj.owner != request.user and not request.user.is_superuser:
			return Response({"error": "Not allowed."}, status=status.HTTP_403_FORBIDDEN)

		quota, _ = UserStorageQuota.objects.get_or_create(user=file_obj.owner)
		quota.remove_usage(file_obj.file_size)

		file_obj.is_deleted = True
		file_obj.deleted_at = timezone.now()
		file_obj.save(update_fields=["is_deleted", "deleted_at"])
		return super().destroy(request, *args, **kwargs)
