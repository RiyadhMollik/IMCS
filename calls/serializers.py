from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import (
	Call,
	CallType,
	ConferenceCall,
	ConferenceParticipant,
	ConferenceParticipantRole,
	ConferenceParticipantStatus,
)

User = get_user_model()


class UserBriefSerializer(serializers.ModelSerializer):
	class Meta:
		model = User
		fields = ["id", "username"]


class CallSerializer(serializers.ModelSerializer):
	caller = UserBriefSerializer(read_only=True)
	receiver = UserBriefSerializer(read_only=True)
	caller_username = serializers.CharField(source="caller.username", read_only=True)
	receiver_username = serializers.CharField(source="receiver.username", read_only=True)

	class Meta:
		model = Call
		fields = [
			"id",
			"caller",
			"receiver",
			"caller_username",
			"receiver_username",
			"call_type",
			"status",
			"room_id",
			"initiated_at",
			"accepted_at",
			"ended_at",
			"duration",
			"encrypted",
		]


class CallCreateSerializer(serializers.Serializer):
	receiver = serializers.IntegerField(required=False)
	receiver_username = serializers.CharField(required=False)
	call_type = serializers.ChoiceField(choices=CallType.choices, default=CallType.AUDIO)

	def validate(self, attrs):
		request = self.context["request"]
		receiver_id = attrs.get("receiver")
		receiver_username = attrs.get("receiver_username")

		if not receiver_id and not receiver_username:
			raise serializers.ValidationError(
				{"receiver": "Either receiver or receiver_username is required."}
			)

		if receiver_username:
			try:
				receiver = User.objects.get(username=receiver_username)
			except User.DoesNotExist:
				raise serializers.ValidationError(
					{"receiver_username": "User not found."}
				)
		else:
			try:
				receiver = User.objects.get(id=receiver_id)
			except User.DoesNotExist:
				raise serializers.ValidationError({"receiver": "User not found."})

		if receiver == request.user:
			raise serializers.ValidationError({"receiver": "Cannot call yourself."})

		if not receiver.is_online:
			raise serializers.ValidationError({"receiver": "User is offline."})

		attrs["receiver_obj"] = receiver
		return attrs


class ConferenceParticipantSerializer(serializers.ModelSerializer):
	user = UserBriefSerializer(read_only=True)

	class Meta:
		model = ConferenceParticipant
		fields = [
			"id",
			"user",
			"role",
			"status",
			"is_active",
			"is_speaking",
			"audio_muted",
			"video_disabled",
			"is_screen_sharing",
			"is_pinned",
			"is_spotlighted",
			"joined_at",
			"left_at",
		]


class ConferenceCallSerializer(serializers.ModelSerializer):
	host = UserBriefSerializer(read_only=True)
	participants = ConferenceParticipantSerializer(many=True, read_only=True)
	participant_count = serializers.IntegerField(read_only=True)

	class Meta:
		model = ConferenceCall
		fields = [
			"id",
			"host",
			"title",
			"room_id",
			"status",
			"max_participants",
			"call_type",
			"allow_screen_sharing",
			"allow_recording",
			"voice_activated",
			"encrypted",
			"server_relay_enabled",
			"started_at",
			"ended_at",
			"participant_count",
			"participants",
		]


class ConferenceCreateSerializer(serializers.Serializer):
	title = serializers.CharField(required=False, allow_blank=True)
	call_type = serializers.ChoiceField(choices=CallType.choices, default=CallType.VIDEO)
	conversation_id = serializers.IntegerField(required=False)
	participant_ids = serializers.ListField(
		child=serializers.IntegerField(), required=False, allow_empty=True
	)
	max_participants = serializers.IntegerField(required=False, min_value=2, max_value=150)

	def validate_participant_ids(self, value):
		if not value:
			return []
		ids = list(set(value))
		users = User.objects.filter(id__in=ids)
		if users.count() != len(ids):
			raise serializers.ValidationError("One or more participants are invalid.")
		return ids

	def validate(self, attrs):
		conversation_id = attrs.get("conversation_id")
		if not conversation_id:
			return attrs

		request = self.context.get("request")
		from messaging.models import Conversation, ConversationType

		try:
			conversation = Conversation.objects.get(id=conversation_id)
		except Conversation.DoesNotExist:
			raise serializers.ValidationError({"conversation_id": "Conversation not found."})

		if conversation.conversation_type != ConversationType.GROUP:
			raise serializers.ValidationError({"conversation_id": "Conference calls are only allowed for group conversations."})

		if request and not conversation.participants.filter(id=request.user.id).exists():
			raise serializers.ValidationError({"conversation_id": "You are not a participant in this conversation."})

		attrs["conversation_obj"] = conversation
		return attrs
