from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import File, FileRecipient, UserStorageQuota

User = get_user_model()


class UserBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username"]


class FileRecipientSerializer(serializers.ModelSerializer):
    user = UserBriefSerializer(read_only=True)

    class Meta:
        model = FileRecipient
        fields = [
            "user",
            "can_view",
            "can_download",
            "can_export",
            "can_share",
            "accessed_at",
            "downloaded_at",
        ]


class FileSerializer(serializers.ModelSerializer):
    owner = UserBriefSerializer(read_only=True)
    recipients = FileRecipientSerializer(many=True, read_only=True)
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = File
        fields = [
            "id",
            "name",
            "file",
            "file_url",
            "file_type",
            "file_size",
            "mime_type",
            "owner",
            "uploaded_at",
            "conversation",
            "message",
            "expires_at",
            "is_expired",
            "encrypted",
            "recipients",
        ]
        read_only_fields = [
            "id",
            "file_size",
            "owner",
            "uploaded_at",
            "is_expired",
            "encrypted",
            "recipients",
        ]

    def get_file_url(self, obj):
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(obj.file.url)
        return obj.file.url


class FileUploadSerializer(serializers.ModelSerializer):
    recipient_ids = serializers.ListField(
        child=serializers.IntegerField(), required=False, write_only=True
    )
    can_view = serializers.BooleanField(required=False, default=True, write_only=True)
    can_download = serializers.BooleanField(required=False, default=False, write_only=True)
    can_export = serializers.BooleanField(required=False, default=False, write_only=True)
    can_share = serializers.BooleanField(required=False, default=False, write_only=True)

    class Meta:
        model = File
        fields = [
            "id",
            "name",
            "file",
            "file_type",
            "mime_type",
            "conversation",
            "message",
            "expires_at",
            "recipient_ids",
            "can_view",
            "can_download",
            "can_export",
            "can_share",
        ]

    def validate(self, attrs):
        request = self.context["request"]
        upload = attrs.get("file")
        if not upload:
            raise serializers.ValidationError("file is required")

        quota, _ = UserStorageQuota.objects.get_or_create(user=request.user)
        file_size_mb = upload.size / (1024 * 1024)

        if file_size_mb > quota.max_file_size:
            raise serializers.ValidationError(
                f"File exceeds max size of {quota.max_file_size}MB for this user."
            )

        if quota.is_quota_exceeded(upload.size):
            raise serializers.ValidationError("Storage quota exceeded.")

        attrs["file_size"] = upload.size
        if not attrs.get("name"):
            attrs["name"] = upload.name
        return attrs

    def create(self, validated_data):
        # Keep serializer.validated_data intact for view-level recipient handling,
        # but remove non-model write-only fields before creating File instance.
        model_data = validated_data.copy()
        model_data.pop("recipient_ids", None)
        model_data.pop("can_view", None)
        model_data.pop("can_download", None)
        model_data.pop("can_export", None)
        model_data.pop("can_share", None)
        return super().create(model_data)
